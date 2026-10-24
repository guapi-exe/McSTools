use crate::utils::block_state_pos_list::{BlockData, BlockId, BlockPos, BlockStatePos};
use crate::utils::entities::EntitiesList;
use crate::utils::schematic_data::{SchematicData, SchematicError};
use crate::utils::tile_entities::TileEntitiesList;
use anyhow::Result;
use chrono::Utc;
use fastnbt::Value;
use fastnbt::Value::Compound;
use rayon::iter::IndexedParallelIterator;
use rayon::iter::IntoParallelRefIterator;
use rayon::iter::ParallelIterator;
use std::collections::{BTreeMap, HashMap, VecDeque};
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

pub(crate) fn normalized_entity_payload(root: &HashMap<String, Value>) -> HashMap<String, Value> {
    let mut result = match root.get("Data") {
        Some(Compound(data))
            if root
                .keys()
                .all(|key| matches!(key.as_str(), "Id" | "Pos" | "Data")) =>
        {
            data.clone()
        }
        _ => root.clone(),
    };
    if let Some(Value::String(id)) = root
        .get("id")
        .or_else(|| root.get("Id"))
        .or_else(|| root.get("identifier"))
    {
        result.insert("id".into(), Value::String(id.clone()));
    }
    result.remove("Id");
    result
}

#[derive(Debug)]
pub struct ToLmSchematic {
    blocks: VecDeque<BlockStatePos>,
    pub start_pos: BlockPos,
    pub end_pos: BlockPos,
    width: i32,
    height: i32,
    length: i32,
    bits: i32,
    pub unique_block_states: Vec<Arc<BlockData>>,
    pub block_state_to_index: HashMap<Arc<BlockData>, usize>,
    pub tile_entities: TileEntitiesList,
    pub entities: EntitiesList,
}

impl ToLmSchematic {
    pub fn new(schematic: &SchematicData) -> Result<Self, SchematicError> {
        let mut block_list = schematic.blocks.clone();
        let (min, max, size) =
            crate::utils::conversion_bounds::conversion_bounds(&block_list, schematic.size)?;
        let width = size.width;
        let height = size.height;
        let length = size.length;
        // Missing sparse cells are air, not the first solid palette entry.
        // An air sentinel also permits an explicitly empty declared frame.
        block_list.add_to_first(
            min.x,
            min.y,
            min.z,
            &Arc::new(BlockData {
                id: BlockId {
                    name: Arc::from("minecraft:air"),
                },
                properties: BTreeMap::new(),
            }),
        );
        let (unique_block_states, block_state_to_index) = {
            let mut index_map = HashMap::new();
            let mut unique = Vec::new();

            for block_pos in block_list.elements.iter() {
                let block_data = &block_pos.block;
                if let std::collections::hash_map::Entry::Vacant(e) =
                    index_map.entry(block_data.clone())
                {
                    let index = unique.len();
                    unique.push(block_data.clone());
                    e.insert(index);
                }
            }

            (unique, index_map)
        };
        let palette_size = unique_block_states.len() as i32;
        let adjusted = if palette_size == 0 {
            u32::MAX
        } else {
            palette_size.saturating_sub(1) as u32
        };
        let leading_zeros = adjusted.leading_zeros();
        let bits_unclamped = 32u32.saturating_sub(leading_zeros);
        let bits = (bits_unclamped as f64).max(2.0) as i32;
        let blocks = block_list.elements;
        let mut tile_entities = schematic.tile_entities_list.clone();
        for tile in &mut tile_entities.elements {
            for (coordinate, origin, bound) in [
                (tile.pos.x, min.x, width),
                (tile.pos.y, min.y, height),
                (tile.pos.z, min.z, length),
            ] {
                if coordinate
                    .checked_sub(origin)
                    .filter(|n| *n >= 0 && *n < bound)
                    .is_none()
                {
                    return Err(SchematicError::InvalidFormat(
                        "Litematica block entity is outside export bounds",
                    ));
                }
            }
            let (id, mut data) = crate::utils::java_entities::java_entity_data(
                &tile.nbt,
                tile_entities.original_type,
            )?;
            data.insert("id".into(), Value::String(id));
            tile.nbt = Compound(data);
        }
        let entities = crate::utils::java_entities::local_java_entities(
            &schematic.entities_list,
            [min.x, min.y, min.z],
        )?;
        //println!("{:?}", blocks);
        Ok(Self {
            blocks,
            start_pos: min,
            end_pos: max,
            width,
            height,
            length,
            bits,
            unique_block_states,
            block_state_to_index,
            tile_entities,
            entities,
        })
    }
    pub fn get_block_id_list(&self) -> Vec<i32> {
        let total_blocks = (self.length * self.width * self.height) as usize;
        // Overlapping Litematica regions are legal. Resolve duplicate
        // coordinates in source order so output does not depend on Rayon
        // scheduling (the previous atomic stores were last-writer-wins but
        // not deterministic).
        let mut block_ids = vec![0i32; total_blocks];
        for block in &self.blocks {
            let dx = i64::from(block.pos.x) - i64::from(self.start_pos.x);
            let dy = i64::from(block.pos.y) - i64::from(self.start_pos.y);
            let dz = i64::from(block.pos.z) - i64::from(self.start_pos.z);
            let id = dy * i64::from(self.width) * i64::from(self.length)
                + dz * i64::from(self.width)
                + dx;

            if id >= 0
                && usize::try_from(id)
                    .ok()
                    .is_some_and(|index| index < total_blocks)
            {
                block_ids[id as usize] = self
                    .block_state_to_index
                    .get(&block.block)
                    .copied()
                    .and_then(|state| i32::try_from(state).ok())
                    .unwrap_or(0);
            }
        }

        block_ids
    }
    pub fn encode_block_states(&self) -> Vec<u64> {
        let state_ids = self.get_block_id_list();
        self.pack_block_states(&state_ids)
    }
    fn pack_block_states(&self, state_ids: &[i32]) -> Vec<u64> {
        let bits = self.bits as usize;
        let total_bits = state_ids.len() * bits;
        let longs_needed = (total_bits + 63) / 64;

        let long_array: Vec<AtomicU64> = (0..longs_needed).map(|_| AtomicU64::new(0)).collect();
        let long_array = Arc::new(long_array);

        state_ids
            .par_iter()
            .enumerate()
            .for_each(|(index, &state_id)| {
                let state = state_id as u64;
                let start_bit = index * bits;
                let start_long_index = start_bit / 64;
                let start_bit_offset = (start_bit % 64) as u32;
                let end_bit = start_bit + bits - 1;
                let end_long_index = end_bit / 64;

                let mask = (1u64).wrapping_shl(bits as u32).wrapping_sub(1);
                let masked_state = state & mask;

                let long_array = Arc::clone(&long_array);

                if start_long_index == end_long_index {
                    let value = masked_state << start_bit_offset;
                    long_array[start_long_index].fetch_or(value, Ordering::Relaxed);
                } else {
                    let bits_in_first = 64 - start_bit_offset;
                    let part1 = masked_state << start_bit_offset;
                    let part2 = masked_state >> bits_in_first;

                    long_array[start_long_index].fetch_or(part1, Ordering::Relaxed);
                    if end_long_index < longs_needed {
                        long_array[end_long_index].fetch_or(part2, Ordering::Relaxed);
                    }
                }
            });

        Arc::try_unwrap(long_array)
            .unwrap()
            .into_iter()
            .map(|a| a.into_inner())
            .collect()
    }
    fn build_tile_entities_list(&self) -> Vec<Value> {
        self.tile_entities
            .elements
            .iter()
            .map(|te| {
                let nx = te.pos.x - self.start_pos.x;
                let ny = te.pos.y - self.start_pos.y;
                let nz = te.pos.z - self.start_pos.z;

                match &te.nbt {
                    Compound(map) => {
                        let mut new_map = normalized_entity_payload(map);
                        new_map.remove("Pos");
                        new_map.insert("x".to_string(), Value::Int(nx));
                        new_map.insert("y".to_string(), Value::Int(ny));
                        new_map.insert("z".to_string(), Value::Int(nz));
                        Compound(new_map)
                    }
                    other => {
                        let mut new_map = HashMap::new();
                        new_map.insert("x".to_string(), Value::Int(nx));
                        new_map.insert("y".to_string(), Value::Int(ny));
                        new_map.insert("z".to_string(), Value::Int(nz));
                        new_map.insert("nbt".to_string(), other.clone());
                        Compound(new_map)
                    }
                }
            })
            .collect()
    }
    fn build_entities_list(&self) -> Vec<Value> {
        self.entities
            .elements
            .iter()
            .map(|entity| entity.nbt.clone())
            .collect()
    }
    pub fn lm_palette(&self) -> Value {
        let mut palette = Vec::new();

        for block in &self.unique_block_states {
            let mut compound = HashMap::new();
            compound.insert("Name".to_string(), Value::String(block.id.name.to_string()));

            if !block.properties.is_empty() {
                let mut props = HashMap::new();
                for (k, v) in &block.properties {
                    props.insert(k.to_string(), Value::String(v.to_string()));
                }
                compound.insert("Properties".to_string(), Compound(props));
            }

            palette.push(Compound(compound));
        }

        Value::List(palette)
    }
    pub fn lm_metadata(&self) -> Value {
        self.metadata_for_states(&self.get_block_id_list())
    }
    fn metadata_for_states(&self, state_ids: &[i32]) -> Value {
        let mut metadata = HashMap::new();
        let timestamp_ms = Utc::now().timestamp_millis();
        let mut enclosing_size = HashMap::new();
        enclosing_size.insert("x".to_string(), Value::Int(self.width));
        enclosing_size.insert("y".to_string(), Value::Int(self.height));
        enclosing_size.insert("z".to_string(), Value::Int(self.length));
        metadata.insert("EnclosingSize".to_string(), Compound(enclosing_size));

        metadata.insert(
            "Description".to_string(),
            Value::String("来自MCSTOOLS转换".to_string()),
        );
        metadata.insert("RegionCount".to_string(), Value::Int(1));
        metadata.insert("Name".to_string(), Value::String(String::new()));
        metadata.insert(
            "Author".to_string(),
            Value::String("www.mcschematic.top".to_string()),
        );
        let non_air: Vec<bool> = self
            .unique_block_states
            .iter()
            .map(|state| {
                !matches!(
                    state.id.name.as_ref(),
                    "minecraft:air" | "minecraft:cave_air" | "minecraft:void_air"
                )
            })
            .collect();
        // Count the resolved grid, not sparse records: overlapping positions
        // and explicit air must agree with what is actually packed below.
        let occupied = state_ids.iter().filter(|&&id| non_air[id as usize]).count();
        metadata.insert(
            "TotalVolume".to_string(),
            Value::Int(state_ids.len() as i32),
        );
        metadata.insert("TotalBlocks".to_string(), Value::Int(occupied as i32));
        metadata.insert("TimeModified".to_string(), Value::Long(timestamp_ms));
        metadata.insert("TimeCreated".to_string(), Value::Long(timestamp_ms));

        Compound(metadata)
    }
    pub fn lm_regions(&self) -> Value {
        self.regions_for_states(&self.get_block_id_list())
    }
    fn regions_for_states(&self, state_ids: &[i32]) -> Value {
        let mut regions = HashMap::new();
        let mut region: HashMap<String, Value> = HashMap::new();

        let encoded = self.pack_block_states(state_ids);
        let long_array: Vec<i64> = encoded.iter().map(|&v| v as i64).collect();
        region.insert(
            "BlockStates".to_string(),
            Value::LongArray(fastnbt::LongArray::new(long_array)),
        );

        let mut position = HashMap::new();
        position.insert("x".to_string(), Value::Int(0));
        position.insert("y".to_string(), Value::Int(0));
        position.insert("z".to_string(), Value::Int(0));
        region.insert("Position".to_string(), Compound(position));

        let mut size = HashMap::new();
        size.insert("x".to_string(), Value::Int(self.width));
        size.insert("y".to_string(), Value::Int(self.height));
        size.insert("z".to_string(), Value::Int(self.length));
        region.insert("Size".to_string(), Compound(size));

        region.insert("BlockStatePalette".to_string(), self.lm_palette());
        region.insert(
            "TileEntities".to_string(),
            Value::List(self.build_tile_entities_list()),
        );
        //region.insert("TileEntities".to_string(), Value::List(vec![]));
        region.insert(
            "Entities".to_string(),
            Value::List(self.build_entities_list()),
        );
        regions.insert("null".to_string(), Compound(region));
        Compound(regions)
    }
    pub fn lm_schematic(&self, version: i32) -> Value {
        self.lm_schematic_for_data_version(version, 3465)
    }

    pub fn lm_schematic_for_data_version(&self, version: i32, data_version: i32) -> Value {
        let state_ids = self.get_block_id_list();
        let mut nbt = HashMap::new();
        nbt.insert("MinecraftDataVersion".to_string(), Value::Int(data_version));
        nbt.insert("Version".to_string(), Value::Int(version));
        let metadata = self.metadata_for_states(&state_ids);
        nbt.insert("Metadata".to_string(), metadata);
        let regions = self.regions_for_states(&state_ids);
        nbt.insert("Regions".to_string(), regions);
        nbt.insert("SubVersion".to_string(), Value::Int(1));
        Compound(nbt)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::schematic_data::Size;

    #[test]
    fn metadata_counts_resolved_non_air_and_uses_millisecond_timestamps() {
        let mut data = SchematicData::new(
            Default::default(),
            Default::default(),
            Default::default(),
            Size {
                width: 4,
                height: 2,
                length: 2,
            },
        );
        for (x, name) in [
            (0, "minecraft:stone"),
            (0, "minecraft:dirt"),
            (1, "minecraft:stone"),
            (1, "minecraft:air"),
            (2, "minecraft:cave_air"),
            (3, "minecraft:void_air"),
        ] {
            data.blocks.add_by_pos(
                x,
                0,
                0,
                Arc::new(BlockData {
                    id: BlockId { name: name.into() },
                    properties: BTreeMap::new(),
                }),
            );
        }
        let before = Utc::now().timestamp_millis();
        let encoded = ToLmSchematic::new(&data)
            .unwrap()
            .lm_schematic_for_data_version(6, 3955);
        let Compound(root) = encoded else {
            panic!("root")
        };
        let Compound(metadata) = &root["Metadata"] else {
            panic!("metadata")
        };
        assert_eq!(metadata["TotalVolume"], Value::Int(16));
        assert_eq!(metadata["TotalBlocks"], Value::Int(1));
        let Value::Long(created) = metadata["TimeCreated"] else {
            panic!("timestamp")
        };
        assert!(created >= before && created <= Utc::now().timestamp_millis());
        assert_eq!(metadata["TimeCreated"], metadata["TimeModified"]);
    }
}
