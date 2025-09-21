use crate::utils::block_state_pos_list::{BlockData, BlockPos, BlockStatePos};
use crate::utils::schematic_data::{SchematicData, SchematicError};
use fastnbt::Value;
use fastnbt::Value::Compound;
use rayon::iter::IndexedParallelIterator;
use rayon::iter::IntoParallelRefIterator;
use rayon::iter::ParallelIterator;
use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use anyhow::Result;
use crate::utils::entities::EntitiesList;
use crate::utils::tile_entities::{TileEntities, TileEntitiesList};

#[derive(Debug)]
pub struct ToCreateSchematic {
    blocks: VecDeque<BlockStatePos>,
    start_pos: BlockPos,
    end_pos: BlockPos,
    width: i32,
    height: i32,
    length: i32,
    pub unique_block_states: Vec<Arc<BlockData>>,
    pub block_state_to_index: HashMap<Arc<BlockData>, usize>,
    pub tile_entities: TileEntitiesList,
    pub entities: EntitiesList,
}

impl ToCreateSchematic {
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
        let tile_entities = schematic.tile_entities_list.clone();
        let entities = schematic.entities_list.clone();

        Ok(Self {
            blocks,
            start_pos: min,
            end_pos: max,
            width,
            height,
            length,
            unique_block_states,
            block_state_to_index,
            tile_entities,
            entities,
        })
    }

    pub fn create_palette(&self) -> Value {
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
    fn build_entities_list(&self) -> Vec<Value> {
        if self.entities.original_type != 1 {
            return vec![];
        }

        self.entities.elements.iter().map(|e| e.nbt.clone()).collect()
    }
    pub fn create_blocks(&self, air: bool) -> Value {
        let tile_entity_map: HashMap<(i32, i32, i32), &TileEntities> =
            self.tile_entities
                .elements
                .iter()
                .map(|te| ((te.pos.x, te.pos.y, te.pos.z), te))
                .collect();
        let block_list: Vec<Value> = self
            .blocks
            .par_iter()
            .filter_map(|block_pos| {
                let data = (*block_pos.block).clone();
                if data.id.name.to_string() == "minecraft:air" && !air {
                    return None;
                }

                let state_id = self
                    .block_state_to_index
                    .get(&data)
                    .expect("Block state not found in palette");

                let pos = Value::List(vec![
                    Value::Int(block_pos.pos.x - self.start_pos.x),
                    Value::Int(block_pos.pos.y - self.start_pos.y),
                    Value::Int(block_pos.pos.z - self.start_pos.z),
                ]);

                let mut block_tag = HashMap::new();
                block_tag.insert("state".to_string(), Value::Int(*state_id as i32));
                block_tag.insert("pos".to_string(), pos);
                if self.tile_entities.original_type == 1 {
                    if let Some(tile_entity) = tile_entity_map.get(&(block_pos.pos.x, block_pos.pos.y, block_pos.pos.z)) {
                        block_tag.insert("nbt".to_string(), tile_entity.nbt.clone());
                    }
                }
                Some(Compound(block_tag))
            })
            .collect();

        Value::List(block_list)
    }

    pub fn create_schematic(&self, air: bool) -> Value {
        let mut tag = HashMap::new();

        let size = Value::List(vec![
            Value::Int(self.end_pos.x - self.start_pos.x + 1),
            Value::Int(self.end_pos.y - self.start_pos.y + 1),
            Value::Int(self.end_pos.z - self.start_pos.z + 1),
        ]);
        tag.insert("size".to_string(), size);
        tag.insert("blocks".to_string(), self.create_blocks(air));
        tag.insert("palette".to_string(), self.create_palette());
        tag.insert("entities".to_string(), Value::List(self.build_entities_list()));
        tag.insert("DataVersion".to_string(), Value::Int(3465)); // 你说的对别问我这里为什么写固定值

        Compound(tag)
    }
}
