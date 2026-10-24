//! Source parsing budgets are independent of dense export/render budgets.
//! Adapted from new_mcs's sparse source profile. These are allocation/structure
//! guards, not a promise that a file can be rendered on every desktop.
use crate::utils::block_state_pos_list::{BlockData, BlockStatePos, BlockStatePosList};
use crate::utils::schematic_data::SchematicError;
use std::fs::File;
use std::io::Read;
use std::path::Path;
use std::sync::Arc;

pub const MAX_INPUT_BYTES: usize = 256 * 1024 * 1024;

#[derive(Debug, Clone, Copy)]
pub struct ParseLimits {
    pub max_input_bytes: usize,
    pub max_decompressed_bytes: usize,
    pub max_dimension: u32,
    pub max_volume: usize,
    pub max_blocks: usize,
    pub max_palette_entries: usize,
    pub max_nbt_depth: usize,
    pub max_nbt_sequence_len: usize,
    pub max_nbt_string_bytes: usize,
    pub max_nbt_tags: usize,
    /// Conservative accounting for Value slots, names and array payloads.
    /// Allocator overhead/capacity means this is not an OS RSS ceiling.
    pub max_nbt_allocation_bytes: usize,
    pub max_snbt_string_bytes: usize,
    pub retain_air_blocks: bool,
}

impl Default for ParseLimits {
    fn default() -> Self {
        Self {
            max_input_bytes: MAX_INPUT_BYTES,
            max_decompressed_bytes: 1024 * 1024 * 1024,
            max_dimension: 4096,
            max_volume: 512_000_000,
            // The desktop parser is in-process, unlike the website validator.
            // Cap the position records to 512 MiB in addition to the source cap.
            // This does NOT include NBT, palette, Vec capacity or GPU memory.
            max_blocks: 100_000_000.min(512 * 1024 * 1024 / size_of::<BlockStatePos>()),
            max_palette_entries: 65_536,
            max_nbt_depth: 128,
            max_nbt_sequence_len: 256_000_000,
            max_nbt_string_bytes: 65_535,
            max_nbt_tags: 32_000_000,
            max_nbt_allocation_bytes: 1024 * 1024 * 1024,
            max_snbt_string_bytes: 128 * 1024 * 1024,
            retain_air_blocks: false,
        }
    }
}

impl ParseLimits {
    pub fn validate_palette_len(&self, count: usize) -> Result<(), SchematicError> {
        self.check("palette entries", count, self.max_palette_entries)
    }

    pub fn validate_block_count(&self, label: &str, count: usize) -> Result<(), SchematicError> {
        self.check(label, count, self.max_blocks)
    }

    pub fn validate_len_at_most(
        &self,
        label: &str,
        count: usize,
        maximum: usize,
    ) -> Result<(), SchematicError> {
        self.check(label, count, maximum)
    }

    pub fn validate_exact_len(
        &self,
        label: &str,
        count: usize,
        expected: usize,
    ) -> Result<(), SchematicError> {
        if count != expected {
            return Err(SchematicError::NbtPreflight(format!(
                "{label} length {count} does not match expected {expected}"
            )));
        }
        Ok(())
    }

    pub fn validate_input(&self, len: usize) -> Result<(), SchematicError> {
        self.check("source input bytes", len, self.max_input_bytes)
    }

    pub fn check(&self, label: &str, count: usize, maximum: usize) -> Result<(), SchematicError> {
        if count > maximum {
            return Err(SchematicError::LimitExceeded(format!(
                "{label} {count} exceeds limit {maximum}"
            )));
        }
        Ok(())
    }

    pub fn validate_dimensions(
        &self,
        width: i32,
        height: i32,
        length: i32,
    ) -> Result<usize, SchematicError> {
        if [width, height, length].iter().any(|d| *d <= 0) {
            return Err(SchematicError::InvalidFormat(
                "schematic dimensions must be positive",
            ));
        }
        self.validate_signed_dimensions(width, height, length)
    }

    pub fn validate_signed_dimensions(
        &self,
        width: i32,
        height: i32,
        length: i32,
    ) -> Result<usize, SchematicError> {
        let mut volume = 1usize;
        for dimension in [width, height, length] {
            let magnitude = dimension.unsigned_abs();
            if magnitude == 0 || magnitude > self.max_dimension {
                return Err(SchematicError::LimitExceeded(format!(
                    "dimension {dimension} is outside 1..={} (absolute)",
                    self.max_dimension
                )));
            }
            volume = volume
                .checked_mul(magnitude as usize)
                .ok_or_else(|| SchematicError::LimitExceeded("source volume overflow".into()))?;
        }
        self.check("source volume", volume, self.max_volume)?;
        Ok(volume)
    }

    pub fn should_retain_block(&self, block: &BlockData) -> bool {
        self.retain_air_blocks
            || !matches!(
                block.id.name.as_ref(),
                "minecraft:air" | "minecraft:cave_air" | "minecraft:void_air"
            )
    }

    pub fn push_block(
        &self,
        blocks: &mut BlockStatePosList,
        x: i32,
        y: i32,
        z: i32,
        block: &Arc<BlockData>,
    ) -> Result<(), SchematicError> {
        if self.should_retain_block(block) {
            self.check(
                "retained blocks",
                blocks.elements.len() + 1,
                self.max_blocks,
            )?;
            // Reserve modest chunks fallibly, rather than doubling a large
            // collection or aborting on an unchecked allocation failure.
            if blocks.elements.len() == blocks.elements.capacity() {
                let remaining = self.max_blocks - blocks.elements.len();
                blocks
                    .elements
                    .try_reserve_exact(remaining.min(16_384))
                    .map_err(|_| {
                        SchematicError::LimitExceeded("not enough memory for block records".into())
                    })?;
            }
            blocks.add_by_pos(x, y, z, Arc::clone(block));
        }
        Ok(())
    }
}

pub fn read_source_file(path: impl AsRef<Path>) -> Result<Vec<u8>, SchematicError> {
    let limits = ParseLimits::default();
    let file = File::open(path)?;
    if file.metadata()?.len() > limits.max_input_bytes as u64 {
        return Err(SchematicError::LimitExceeded(format!(
            "source file exceeds {} bytes",
            limits.max_input_bytes
        )));
    }
    // Still bound actual reads if another process grows the file after stat.
    let mut bytes = Vec::new();
    file.take(limits.max_input_bytes as u64 + 1)
        .read_to_end(&mut bytes)?;
    limits.validate_input(bytes.len())?;
    Ok(bytes)
}
