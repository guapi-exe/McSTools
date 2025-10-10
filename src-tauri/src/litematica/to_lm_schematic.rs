use crate::utils::block_state_pos_list::{
    BlockData, BlockId, BlockPos, BlockStatePos,
};
use crate::utils::schematic_data::{SchematicData, SchematicError};
use chrono::Utc;
use fastnbt::Value;
use fastnbt::Value::Compound;
use rayon::iter::IndexedParallelIterator;
use rayon::iter::IntoParallelRefIterator;
use rayon::iter::ParallelIterator;
use rayon::prelude::*;
use std::collections::{BTreeMap, HashMap, VecDeque};
use std::sync::atomic::{AtomicI32, AtomicU64, Ordering};
use std::sync::Arc;
use anyhow::Result;
use crate::utils::tile_entities::TileEntitiesList;
use crate::utils::entities::{EntitiesList};

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

        let min = {
            let elements = &block_list.elements;
            if elements.is_empty() {
                return Err(SchematicError::InvalidFormat("Block list cannot be empty"));
            }

            let global_min = elements
                .par_iter()
                .with_min_len(1_000_000)
                .fold(
                    || BlockPos {
                        x: i32::MAX,
                        y: i32::MAX,
                        z: i32::MAX,
                    },
                    |mut acc, bp| {
                        acc.x = std::cmp::min(acc.x, bp.pos.x);
                        acc.y = std::cmp::min(acc.y, bp.pos.y);
                        acc.z = std::cmp::min(acc.z, bp.pos.z);
                        acc
                    },
                )
                .reduce(
                    || BlockPos {
                        x: i32::MAX,
                        y: i32::MAX,
                        z: i32::MAX,
                    },
                    |mut rel, tem| {
                        rel.x = std::cmp::min(rel.x, tem.x);
                        rel.y = std::cmp::min(rel.y, tem.y);
                        rel.z = std::cmp::min(rel.z, tem.z);
                        rel
                    },
                );

            BlockPos {
                x: global_min.x.saturating_sub(1),
                y: global_min.y,
                z: global_min.z.saturating_sub(1),
            }
        };
        let size = schematic.size;
        let max = BlockPos {
            x: min.x + size.width + 1,
            y: min.y + size.height,
            z: min.z + size.length + 1,
        };

        let air = Arc::new(BlockData {
            id: BlockId {
                name: Arc::from("minecraft:air"),
            },
            properties: BTreeMap::new(),
        });
        let capacity = ((max.y - min.y) as usize)
            * (((max.z - min.z) * 2) + ((max.x - min.x) * 2) + 4) as usize;

        block_list.reserve_front(capacity);

        let positions: Vec<_> = (min.y..max.y)
            .into_par_iter()
            .flat_map(|y| {
                let mut positions = Vec::with_capacity(
                    (max.z - min.z) as usize * 2 + (max.x - min.x) as usize * 2 + 4,
                );

                for z in min.z..max.z {
                    positions.push((min.x - 1, y, z));
                    positions.push((max.x + 1, y, z));
                }

                for x in min.x..max.x {
                    positions.push((x, y, min.z - 1));
                    positions.push((x, y, max.z + 1));
                }

                positions.push((min.x - 1, y, min.z - 1));
                positions.push((min.x - 1, y, max.z + 1));
                positions.push((max.x + 1, y, min.z - 1));
                positions.push((max.x + 1, y, max.z + 1));

                positions
            })
            .collect();
        let air_blocks: VecDeque<_> = positions
            .into_par_iter()
            .map(|(x, y, z)| BlockStatePos::new(BlockPos { x, y, z }, Arc::clone(&air)))
            .collect();

        block_list.bulk_prepend(air_blocks);
        let width = max.x - min.x + 1;
        let height = max.y - min.y;
        let length = max.z - min.z + 1;
        let (unique_block_states, block_state_to_index) = {
            let mut index_map = HashMap::new();
            let mut unique = Vec::new();

            for block_pos in block_list.elements.iter() {
                let block_data = &block_pos.block;
                if let std::collections::hash_map::Entry::Vacant(e) = index_map.entry(block_data.clone()) {
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
        let tile_entities = schematic.tile_entities_list.clone();
        let entities = schematic.entities_list.clone();
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

        let atomic_block_list: Vec<AtomicI32> =
            (0..total_blocks).map(|_| AtomicI32::new(0)).collect();
        let atomic_block_list = Arc::new(atomic_block_list);

        self.blocks.par_iter().for_each(|block| {
            let dx = block.pos.x - self.start_pos.x;
            let dy = block.pos.y - self.start_pos.y;
            let dz = block.pos.z - self.start_pos.z;

            let id = (dy * self.width * self.length) + (dz * self.width) + dx;

            if id >= 0 && (id as usize) < atomic_block_list.len() {
                let state_id = self
                    .block_state_to_index
                    .get(&block.block)
                    .map(|v| *v as i32)
                    .unwrap_or(0);

                atomic_block_list[id as usize].store(state_id, Ordering::Relaxed);
            }
        });

        Arc::try_unwrap(atomic_block_list)
            .unwrap()
            .into_iter()
            .map(|atomic| atomic.into_inner())
            .collect()
    }
    pub fn encode_block_states(&self) -> Vec<u64> {
        let state_ids = self.get_block_id_list();
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
        if self.tile_entities.original_type != 2 {
            return vec![];
        }
        self.tile_entities.elements
            .iter()
            .map(|te| {
                let nx = te.pos.x + 1;
                let ny = te.pos.y;
                let nz = te.pos.z + 1;

                match &te.nbt {
                    Compound(map) => {
                        let mut new_map = map.clone();
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
        if self.entities.original_type != 2 {
            return vec![];
        }

        self.entities.elements.iter().map(|e| e.nbt.clone()).collect()
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
        let mut metadata = HashMap::new();
        let timestamp_sec = Utc::now().timestamp();
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
        metadata.insert("Name".to_string(), Value::String("null".to_string()));
        metadata.insert(
            "Author".to_string(),
            Value::String("www.mcschematic.top".to_string()),
        );
        metadata.insert("TotalVolume".to_string(), Value::Int(0));
        metadata.insert("TotalBlocks".to_string(), Value::Int(0));
        metadata.insert("TimeModified".to_string(), Value::Long(timestamp_sec));
        metadata.insert("TimeCreated".to_string(), Value::Long(timestamp_sec));

        Compound(metadata)
    }
    pub fn lm_regions(&self) -> Value {
        let mut regions = HashMap::new();
        let mut region: HashMap<String, Value> = HashMap::new();

        let encoded = self.encode_block_states();
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
        region.insert("TileEntities".to_string(), Value::List(self.build_tile_entities_list()));
        //region.insert("TileEntities".to_string(), Value::List(vec![]));
        region.insert("Entities".to_string(), Value::List(self.build_entities_list()));
        regions.insert("null".to_string(), Compound(region));
        Compound(regions)
    }
    pub fn lm_schematic(&self, version: i32) -> Value {
        let mut nbt = HashMap::new();
        nbt.insert("MinecraftDataVersion".to_string(), Value::Int(3465));
        nbt.insert("Version".to_string(), Value::Int(version));
        let metadata = self.lm_metadata();
        nbt.insert("Metadata".to_string(), metadata);
        let regions = self.lm_regions();
        nbt.insert("Regions".to_string(), regions);
        nbt.insert("SubVersion".to_string(), Value::Int(1));
        Compound(nbt)
    }
}
