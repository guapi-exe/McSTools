use crate::utils::block_state_pos_list::{BlockData, BlockPos, BlockStatePos};
use crate::utils::schematic_data::{SchematicData, SchematicError};

use rayon::iter::IndexedParallelIterator;
use rayon::iter::IntoParallelRefIterator;
use rayon::iter::ParallelIterator;
use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use std::sync::atomic::{AtomicI32, Ordering};
use anyhow::Result;
use fastnbt::Value;

#[derive(Debug)]
pub struct ToBESchematic {
    blocks: VecDeque<BlockStatePos>,
    pub start_pos: BlockPos,
    pub end_pos: BlockPos,
    pub width: i32,
    pub height: i32,
    pub length: i32,
    pub unique_block_states: Vec<Arc<BlockData>>,
    pub block_state_to_index: HashMap<Arc<BlockData>, usize>,
}

impl ToBESchematic {
    pub fn new(schematic: &SchematicData) -> Result<Self, SchematicError> {
        let blocks = schematic.blocks.clone().elements;
        if blocks.is_empty() {
            return Err(SchematicError::InvalidFormat("Block list cannot be empty"));
        }
        let min = {
            let global_min = blocks
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
                x: global_min.x,
                y: global_min.y,
                z: global_min.z,
            }
        };
        let size = schematic.size;
        let max = BlockPos {
            x: min.x + size.width,
            y: min.y + size.height,
            z: min.z + size.length,
        };
        let width = max.x - min.x + 1;
        let height = max.y - min.y + 1;
        let length = max.z - min.z + 1;

        let (unique_block_states, block_state_to_index) = {
            let mut seen = HashMap::new();
            let mut unique = Vec::new();
            let mut index_map = HashMap::new();

            for block_pos in &blocks {
                let block_data = block_pos.block.clone();

                if !seen.contains_key(&block_data) {
                    let index = unique.len();
                    seen.insert(block_data.clone(), index);
                    unique.push(block_data.clone());
                    index_map.insert(block_data, index);
                }
            }

            (unique, index_map)
        };

        Ok(Self {
            blocks,
            start_pos: min,
            end_pos: max,
            width,
            height,
            length,
            unique_block_states,
            block_state_to_index,
        })
    }

    fn build_size(&self) -> Vec<Value> {
        vec![
            Value::Int(self.width),
            Value::Int(self.height),
            Value::Int(self.length),
        ]
    }

    /// 构建 `block_palette`
    fn build_palette(&self) -> Value {
        let block_palette: Vec<Value> = self.unique_block_states.iter().map(|block| {
            let mut map = HashMap::new();
            map.insert("name".to_string(), Value::String(block.id.name.to_string()));

            if !block.properties.is_empty() {
                let mut states_map = HashMap::new();
                //for (k, v) in &block.properties {
                    //states_map.insert(k.to_string(), Value::String(v.to_string()));
                //}
                map.insert("states".to_string(), Value::Compound(states_map));
            }else {
                let mut states_map = HashMap::new();
                map.insert("states".to_string(), Value::Compound(states_map));
            }

            Value::Compound(map)
        }).collect();

        Value::List(block_palette)
    }

    /// 构建 `block_indices` (Y → Z → X)
    fn build_block_indices(&self) -> Value {
        let total_blocks = (self.length * self.width * self.height) as usize;

        let atomic_block_list: Vec<AtomicI32> =
            (0..total_blocks).map(|_| AtomicI32::new(0)).collect();
        let atomic_block_list = Arc::new(atomic_block_list);

        self.blocks.par_iter().for_each(|block| {
            let dx = block.pos.x - self.start_pos.x;
            let dy = block.pos.y - self.start_pos.y;
            let dz = block.pos.z - self.start_pos.z;

            let id = (dx * self.height * self.length) + (dy * self.length) + dz;

            if id >= 0 && (id as usize) < atomic_block_list.len() {
                let state_id = self
                    .block_state_to_index
                    .get(&block.block)
                    .map(|v| *v as i32)
                    .unwrap_or(0);
                atomic_block_list[id as usize].store(state_id, Ordering::Relaxed);
            }
        });

        let final_list: Vec<Value> = Arc::try_unwrap(atomic_block_list)
            .unwrap()
            .into_iter()
            .map(|atomic| Value::Int(atomic.into_inner()))
            .collect();

        let mut block_indices = Vec::new();
        block_indices.push(Value::List(final_list));
        block_indices.push(Value::List(vec![
            Value::Int(-1);
            total_blocks
        ]));

        Value::List(block_indices)
    }

    /// 转换为 Bedrock `.mcstructure` NBT 结构
    pub fn to_be_value(&self) -> HashMap<String, Value> {
        let mut default_map = HashMap::new();
        default_map.insert("block_palette".to_string(), self.build_palette());
        default_map.insert("block_position_data".to_string(), Value::Compound(HashMap::new()));

        let mut palette_map = HashMap::new();
        palette_map.insert("default".to_string(), Value::Compound(default_map));

        let mut structure_map = HashMap::new();
        structure_map.insert("palette".to_string(), Value::Compound(palette_map));
        structure_map.insert("block_indices".to_string(), self.build_block_indices());
        structure_map.insert("entities".to_string(), Value::List(vec![]));

        let mut root = HashMap::new();
        root.insert("format_version".to_string(), Value::Int(1));
        root.insert("size".to_string(), Value::List(self.build_size()));
        root.insert("structure".to_string(), Value::Compound(structure_map));
        root.insert("structure_world_origin".to_string(), Value::List(vec![
            Value::Int(0),
            Value::Int(0),
            Value::Int(0),
        ]));

        root
    }
}