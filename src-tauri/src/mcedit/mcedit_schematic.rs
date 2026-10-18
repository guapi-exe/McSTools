use crate::mcedit::legacy_map::codec;
use crate::utils::block_state_pos_list::{BlockData, BlockPos, BlockStatePosList};
use crate::utils::entities::EntitiesList;
use crate::utils::extend_value::NbtExt;
use crate::utils::nbt_scan::read_gzip_java_nbt;
use crate::utils::parse_limits::ParseLimits;
use crate::utils::schematic_data::{SchematicData, SchematicError, Size};
use crate::utils::tile_entities::TileEntitiesList;
use fastnbt::Value;
use fastnbt::Value::Compound;
use std::collections::HashMap;
use std::sync::Arc;

/// Reader for the legacy MCEdit `.schematic` format used by WorldEdit for
/// Minecraft 1.12 and earlier.
///
/// Format highlights:
/// * gzip-compressed NBT (uncompressed files are accepted as a fallback);
/// * root compound contains `Width`/`Height`/`Length` (short),
///   `Materials` (string), `Blocks` (byte array), `Data` (byte array) and
///   optional `AddBlocks` (packed high nibbles for ids > 255);
/// * block index order: x changes fastest, then z, then y
///   (`index = (y * length + z) * width + x`).
#[derive(Debug)]
pub struct McEditSchematic {
    pub nbt: Value,
}

impl McEditSchematic {
    pub fn new_from_bytes(data: impl AsRef<[u8]>) -> Result<Self, SchematicError> {
        Self::new_from_bytes_with_limits(data.as_ref(), &ParseLimits::default())
    }

    pub fn new_from_bytes_with_limits(
        data: impl AsRef<[u8]>,
        limits: &ParseLimits,
    ) -> Result<Self, SchematicError> {
        let nbt = parse_nbt(data.as_ref(), limits)?;
        if matches!(nbt, Compound(_)) {
            Ok(Self { nbt })
        } else {
            Err(SchematicError::RootNotCompound)
        }
    }

    fn root(&self) -> Result<&HashMap<String, Value>, SchematicError> {
        let Compound(root) = &self.nbt else {
            return Err(SchematicError::RootNotCompound);
        };
        Ok(root)
    }

    pub fn get_size(&self) -> Result<Size, SchematicError> {
        let root = self.root()?;
        let width = root.get_i16("Width")? as i32;
        let height = root.get_i16("Height")? as i32;
        let length = root.get_i16("Length")? as i32;

        if width <= 0 || height <= 0 || length <= 0 {
            return Err(SchematicError::InvalidFormat(
                "invalid schematic size, dimensions must be positive",
            ));
        }

        Ok(Size {
            width,
            height,
            length,
        })
    }

    pub fn get_blocks_pos(&self) -> Result<SchematicData, SchematicError> {
        // Direct callers historically receive explicit air cells. Production
        // parsing uses `get_blocks_pos_with_limits` and compacts air to keep
        // sparse legacy files within the retained block budget.
        self.get_blocks_pos_with_limits(&ParseLimits {
            retain_air_blocks: true,
            ..ParseLimits::default()
        })
    }

    pub fn get_blocks_pos_with_limits(
        &self,
        limits: &ParseLimits,
    ) -> Result<SchematicData, SchematicError> {
        let root = self.root()?;
        let size = self.get_size()?;
        let width = size.width;
        let height = size.height;
        let length = size.length;
        // Import follows the sparse source envelope, not the dense legacy
        // export allocation limit. Actual retained records remain bounded.
        let volume = limits.validate_dimensions(size.width, size.height, size.length)?;

        // Borrow the decoded arrays: duplicating Blocks and Data can consume
        // hundreds of MiB even when almost every source cell is air.
        let blocks = root.get_i8_array("Blocks")?;
        let data = root.get_i8_array("Data")?;

        if blocks.len() != volume || data.len() != volume {
            return Err(SchematicError::InvalidFormat(
                "Blocks/Data array length does not match Width*Height*Length",
            ));
        }

        let add_blocks = root
            .get("AddBlocks")
            .and_then(|value| match value {
                Value::ByteArray(array) => Some(&array[..]),
                _ => None,
            })
            .unwrap_or(&[]);

        let packed_add_blocks = add_blocks.len() == volume.div_ceil(2);
        let full_add_blocks = add_blocks.len() == volume;
        if !add_blocks.is_empty() && !packed_add_blocks && !full_add_blocks {
            return Err(SchematicError::InvalidFormat(
                "AddBlocks array length must be ceil(volume/2) or volume",
            ));
        }

        let mut block_list = BlockStatePosList::default();
        // Legacy ids have 12 bits and metadata has 4. Decode each distinct
        // state at most once and share it across all retained positions.
        let mut palette: Vec<Option<Arc<BlockData>>> = vec![None; 65_536];
        let decoder = codec();
        let width_usize = width as usize;
        let plane = width_usize * length as usize;
        for index in 0..volume {
            let mut legacy_id = blocks[index] as u8 as u32;
            if packed_add_blocks {
                let byte = add_blocks[index >> 1] as u8;
                legacy_id |= if index & 1 == 0 {
                    ((byte & 0x0F) as u32) << 8
                } else {
                    ((byte & 0xF0) as u32) << 4
                };
            } else if full_add_blocks {
                legacy_id |= ((add_blocks[index] as u8 & 0x0F) as u32) << 8;
            }

            let meta = data[index] as u8 & 0x0F;
            if legacy_id == 0 && meta == 0 && !limits.retain_air_blocks {
                continue;
            }
            let palette_index = ((legacy_id << 4) | u32::from(meta)) as usize;
            let block =
                palette[palette_index].get_or_insert_with(|| decoder.decode(legacy_id, meta));
            if !limits.should_retain_block(block.as_ref()) {
                continue;
            }
            // Legacy arrays are local to the schematic. WEOrigin is metadata,
            // not an offset to apply to coordinates consumed by converters.
            let y = (index / plane) as i32;
            let z = ((index % plane) / width_usize) as i32;
            let x = (index % width_usize) as i32;
            limits.push_block(&mut block_list, x, y, z, block)?;
        }

        let tile_entities_raw: Vec<Value> = root
            .get("TileEntities")
            .and_then(|value| match value {
                Value::List(list) => Some(list.clone()),
                _ => None,
            })
            .unwrap_or_default();

        let tile_entities = if tile_entities_raw.is_empty() {
            TileEntitiesList::new()
        } else {
            TileEntitiesList::from_nbt_lm(&tile_entities_raw, 4)?
        };

        let entities_raw: Vec<Value> = root
            .get("Entities")
            .and_then(|value| match value {
                Value::List(list) => Some(list.clone()),
                _ => None,
            })
            .unwrap_or_default();

        let entities = if entities_raw.is_empty() {
            EntitiesList::new()
        } else {
            EntitiesList::from_nbt(&entities_raw, 4)?
        };

        Ok(SchematicData::new(
            block_list,
            tile_entities,
            entities,
            Size {
                width,
                height,
                length,
            },
        ))
    }

    pub fn get_origin(&self) -> Option<BlockPos> {
        let Ok(root) = self.root() else {
            return None;
        };

        let x = root.get("WEOriginX").and_then(Value::as_i64)? as i32;
        let y = root.get("WEOriginY").and_then(Value::as_i64)? as i32;
        let z = root.get("WEOriginZ").and_then(Value::as_i64)? as i32;

        Some(BlockPos { x, y, z })
    }
}

fn parse_nbt(data: &[u8], limits: &ParseLimits) -> Result<Value, SchematicError> {
    // `.schematic` files are normally gzip-compressed NBT. Some third-party
    // tools write raw NBT, so fall back to an uncompressed parse.
    limits.validate_input(data.len())?;
    if data.starts_with(&[0x1f, 0x8b]) {
        return read_gzip_java_nbt(data, limits);
    }

    if data.len() > limits.max_decompressed_bytes {
        return Err(SchematicError::LimitExceeded(
            "raw MCEdit NBT exceeds the decoded byte limit".into(),
        ));
    }
    crate::utils::nbt_scan::read_raw_java_nbt(data, limits)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reader(
        size: [i16; 3],
        blocks: Vec<i8>,
        metadata: Vec<i8>,
        high: Option<Vec<i8>>,
    ) -> McEditSchematic {
        let mut root = HashMap::from([
            ("Width".into(), Value::Short(size[0])),
            ("Height".into(), Value::Short(size[1])),
            ("Length".into(), Value::Short(size[2])),
            (
                "Blocks".into(),
                Value::ByteArray(fastnbt::ByteArray::new(blocks)),
            ),
            (
                "Data".into(),
                Value::ByteArray(fastnbt::ByteArray::new(metadata)),
            ),
        ]);
        if let Some(high) = high {
            root.insert(
                "AddBlocks".into(),
                Value::ByteArray(fastnbt::ByteArray::new(high)),
            );
        }
        McEditSchematic {
            nbt: Compound(root),
        }
    }

    #[test]
    fn compacts_air_shares_states_and_preserves_xyz_order() {
        let input = reader(
            [2, 2, 2],
            vec![0, 1, 1, 0, 0, 1, 35, 0],
            vec![0, 0, 0, 0, 0, 0, 14, 0],
            None,
        );
        let parsed = input
            .get_blocks_pos_with_limits(&ParseLimits::default())
            .unwrap();
        let blocks: Vec<_> = parsed.blocks.elements.iter().collect();
        assert_eq!(blocks.len(), 4);
        assert_eq!(
            blocks.iter().map(|b| b.pos).collect::<Vec<_>>(),
            vec![
                BlockPos { x: 1, y: 0, z: 0 },
                BlockPos { x: 0, y: 0, z: 1 },
                BlockPos { x: 1, y: 1, z: 0 },
                BlockPos { x: 0, y: 1, z: 1 },
            ]
        );
        assert!(Arc::ptr_eq(&blocks[0].block, &blocks[1].block));
        assert!(Arc::ptr_eq(&blocks[0].block, &blocks[2].block));
        assert_eq!(blocks[3].block.id.name.as_ref(), "minecraft:red_wool");
        assert_eq!(input.get_blocks_pos().unwrap().blocks.elements.len(), 8);
    }

    #[test]
    fn preserves_high_nibble_ids_and_unknown_air_metadata() {
        for high in [vec![0x21, 0x0f], vec![1, 2, 15]] {
            let input = reader([3, 1, 1], vec![0, 0, -1], vec![0, 0, 15], Some(high));
            let parsed = input
                .get_blocks_pos_with_limits(&ParseLimits::default())
                .unwrap();
            let blocks: Vec<_> = parsed.blocks.elements.iter().collect();
            for (block, id, meta) in [
                (&blocks[0], 256, 0),
                (&blocks[1], 512, 0),
                (&blocks[2], 4095, 15),
            ] {
                assert_eq!(block.block.as_ref(), codec().decode(id, meta).as_ref());
            }
        }
        // Only exact legacy 0:0 is fast-skipped; unrecognised 0:1 is retained.
        let input = reader([2, 1, 1], vec![0, 0], vec![0, 1], None);
        let parsed = input
            .get_blocks_pos_with_limits(&ParseLimits::default())
            .unwrap();
        assert_eq!(parsed.blocks.elements.len(), 1);
        assert_eq!(parsed.blocks.elements[0].block.id.name.as_ref(), "legacy:0");
    }

    #[test]
    fn retains_source_and_record_limits_and_validates_array_lengths() {
        let input = reader([3, 1, 1], vec![1, 0, 1], vec![0; 3], None);
        let limits = ParseLimits {
            max_blocks: 1,
            ..ParseLimits::default()
        };
        assert!(
            input
                .get_blocks_pos_with_limits(&limits)
                .unwrap_err()
                .to_string()
                .contains("retained blocks")
        );
        let limits = ParseLimits {
            max_volume: 2,
            ..ParseLimits::default()
        };
        assert!(
            input
                .get_blocks_pos_with_limits(&limits)
                .unwrap_err()
                .to_string()
                .contains("source volume")
        );
        for input in [
            reader([3, 1, 1], vec![1; 2], vec![0; 3], None),
            reader([3, 1, 1], vec![1; 3], vec![0; 2], None),
            reader([3, 1, 1], vec![1; 3], vec![0; 3], Some(vec![1])),
        ] {
            assert!(
                input
                    .get_blocks_pos_with_limits(&ParseLimits::default())
                    .is_err()
            );
        }
    }

    #[test]
    fn sparse_import_does_not_use_the_dense_export_ceiling() {
        // Avoid allocating >64M cells in unit tests: reaching the array-shape
        // check proves the large declared envelope passed the import guard.
        let input = reader([1056, 297, 1252], vec![], vec![], None);
        let error = input
            .get_blocks_pos_with_limits(&ParseLimits::default())
            .unwrap_err();
        assert!(error.to_string().contains("Blocks/Data array length"));
        // The dense legacy export cap is intentionally not enlarged.
        assert_eq!(
            crate::mcedit::legacy_map::MAX_LEGACY_VOLUME,
            64 * 1024 * 1024
        );
    }

    #[test]
    fn raw_and_compressed_import_share_width_aware_preflight() {
        use std::io::Write;
        let input = reader([3, 1, 1], vec![1, 1, 0], vec![0; 3], None);
        let raw = fastnbt::to_bytes(&input.nbt).unwrap();
        let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
        encoder.write_all(&raw).unwrap();
        let compressed = encoder.finish().unwrap();
        let limits = ParseLimits {
            max_nbt_sequence_len: 1,
            ..ParseLimits::default()
        };
        for bytes in [raw, compressed] {
            let parsed = McEditSchematic::new_from_bytes_with_limits(bytes, &limits)
                .unwrap()
                .get_blocks_pos_with_limits(&limits)
                .unwrap();
            assert_eq!(parsed.blocks.elements.len(), 2);
        }
    }

    #[test]
    #[ignore = "Explicit large sparse regression: approximately 1.5 GiB peak memory, synthetic data only"]
    fn large_sparse_400_million_cells_decode_without_air_records() {
        use std::io::Write;
        let started = std::time::Instant::now();
        let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
        encoder.write_all(&[10, 0, 0]).unwrap();
        for (name, value) in [("Width", 1000_i16), ("Height", 400), ("Length", 1000)] {
            encoder.write_all(&[2]).unwrap();
            encoder
                .write_all(&(name.len() as u16).to_be_bytes())
                .unwrap();
            encoder.write_all(name.as_bytes()).unwrap();
            encoder.write_all(&value.to_be_bytes()).unwrap();
        }
        let volume = 400_000_000usize;
        for name in ["Blocks", "Data"] {
            encoder.write_all(&[7]).unwrap();
            encoder
                .write_all(&(name.len() as u16).to_be_bytes())
                .unwrap();
            encoder.write_all(name.as_bytes()).unwrap();
            encoder.write_all(&(volume as i32).to_be_bytes()).unwrap();
            let mut chunk = [0u8; 64_000];
            if name == "Blocks" {
                for index in (0..chunk.len()).step_by(100) {
                    chunk[index] = 1;
                }
            }
            for _ in 0..volume / chunk.len() {
                encoder.write_all(&chunk).unwrap();
            }
        }
        encoder.write_all(&[0]).unwrap();
        let encoded = encoder.finish().unwrap();
        eprintln!(
            "synthetic legacy: source_cells={volume}, decoded_arrays=800000000, compressed_bytes={}",
            encoded.len()
        );
        let limits = ParseLimits::default();
        let source = McEditSchematic::new_from_bytes_with_limits(&encoded, &limits).unwrap();
        let parsed = source.get_blocks_pos_with_limits(&limits).unwrap();
        assert_eq!(
            parsed.size,
            Size {
                width: 1000,
                height: 400,
                length: 1000
            }
        );
        assert_eq!(parsed.blocks.elements.len(), 4_000_000);
        let first = parsed.blocks.elements.front().unwrap();
        let last = parsed.blocks.elements.back().unwrap();
        assert_eq!(first.pos, BlockPos { x: 0, y: 0, z: 0 });
        assert_eq!(
            last.pos,
            BlockPos {
                x: 900,
                y: 399,
                z: 999
            }
        );
        assert!(Arc::ptr_eq(&first.block, &last.block));
        assert!(
            parsed
                .blocks
                .elements
                .iter()
                .all(|entry| entry.block.id.name.as_ref() == "minecraft:stone")
        );
        eprintln!(
            "synthetic legacy: retained_blocks={}, elapsed_ms={}",
            parsed.blocks.elements.len(),
            started.elapsed().as_millis()
        );
    }
}
