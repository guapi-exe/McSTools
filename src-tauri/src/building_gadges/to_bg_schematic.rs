use crate::building_gadges::template_json_representation::{
    B1_BYTE_MASK, B2_BYTE_MASK, B3_BYTE_MASK, rel_pos_to_int,
};
use crate::utils::block_state_pos_list::{BlockData, BlockId, BlockPos, BlockStatePos};
use crate::utils::schematic_data::{SchematicData, SchematicError};
use anyhow::Result;
use base64::Engine;
use fastnbt::Value::Compound;
use fastnbt::{Value, to_bytes};
use fastsnbt::to_string;
use flate2::Compression;
use flate2::write::GzEncoder;
use rayon::iter::IntoParallelRefIterator;
use rayon::iter::ParallelIterator;
use serde_json::json;
use std::collections::{BTreeMap, HashMap, VecDeque};
use std::io::Write;
use std::sync::Arc;
use std::sync::atomic::{AtomicI32, AtomicI64, Ordering};

#[derive(Debug)]
pub struct ToBgSchematic {
    blocks: VecDeque<BlockStatePos>,
    start_pos: BlockPos,
    end_pos: BlockPos,
    width: i32,
    height: i32,
    length: i32,
    air_index: usize,
    pub unique_block_states: Vec<Arc<BlockData>>,
    pub block_state_to_index: HashMap<Arc<BlockData>, usize>,
}

impl ToBgSchematic {
    pub fn new(schematic: &SchematicData) -> Result<Self, SchematicError> {
        let block_list = schematic.blocks.clone();
        let blocks = schematic.blocks.clone().elements;
        if blocks.is_empty() {
            return Err(SchematicError::InvalidFormat("Block list cannot be empty"));
        }
        let (min, max) = blocks.iter().fold(
            (
                BlockPos {
                    x: i32::MAX,
                    y: i32::MAX,
                    z: i32::MAX,
                },
                BlockPos {
                    x: i32::MIN,
                    y: i32::MIN,
                    z: i32::MIN,
                },
            ),
            |(mut min, mut max), bp| {
                min.x = min.x.min(bp.pos.x);
                min.y = min.y.min(bp.pos.y);
                min.z = min.z.min(bp.pos.z);
                max.x = max.x.max(bp.pos.x);
                max.y = max.y.max(bp.pos.y);
                max.z = max.z.max(bp.pos.z);
                (min, max)
            },
        );

        let width = max.x - min.x + 1;
        let height = max.y - min.y + 1;
        let length = max.z - min.z + 1;

        let (unique_block_states, block_state_to_index, air_index) = {
            let mut seen = HashMap::new();
            let mut unique = Vec::new();
            let mut index_map = HashMap::new();
            let air = Arc::new(BlockData {
                id: BlockId {
                    name: Arc::from("minecraft:air"),
                },
                properties: BTreeMap::new(),
            });

            for block_pos in &block_list.elements {
                let block_data = block_pos.block.clone();

                if !seen.contains_key(&block_data) {
                    let index = unique.len();
                    seen.insert(block_data.clone(), index);
                    unique.push(block_data.clone());
                    index_map.insert(block_data, index);
                }
            }

            if !seen.contains_key(&air) {
                let index = unique.len();
                seen.insert(air.clone(), index);
                unique.push(air.clone());
                index_map.insert(air.clone(), index);
            }

            let air_index = *seen.get(&air).unwrap();

            (unique, index_map, air_index)
        };

        Ok(Self {
            blocks,
            start_pos: min,
            end_pos: max,
            width,
            height,
            length,
            air_index,
            unique_block_states,
            block_state_to_index,
        })
    }

    pub fn bg_palette(&self) -> Value {
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

    pub fn bg_palette_type1(&self) -> Value {
        let mut palette = Vec::new();

        for block in &self.unique_block_states {
            let mut compound: HashMap<String, Value> = HashMap::new();
            let mut state = HashMap::new();
            state.insert("Name".to_string(), Value::String(block.id.name.to_string()));

            if !block.properties.is_empty() {
                let mut props = HashMap::new();
                for (k, v) in &block.properties {
                    props.insert(k.to_string(), Value::String(v.to_string()));
                }
                state.insert("Properties".to_string(), Compound(props));
            }
            compound.insert("state".to_string(), Compound(state));
            compound.insert("data".to_string(), Compound(HashMap::new()));
            compound.insert("serializer".to_string(), Value::Int(0));
            palette.push(Compound(compound));
        }

        Value::List(palette)
    }

    pub fn bg_palette_type2(&self) -> Value {
        let mut palette = Vec::new();
        let mut count = 1;
        for block in &self.unique_block_states {
            let mut compound = HashMap::new();
            let mut map_state = HashMap::new();
            map_state.insert("Name".to_string(), Value::String(block.id.name.to_string()));

            if !block.properties.is_empty() {
                let mut props = HashMap::new();
                for (k, v) in &block.properties {
                    props.insert(k.to_string(), Value::String(v.to_string()));
                }
                map_state.insert("Properties".to_string(), Compound(props));
            }
            compound.insert("mapSlot".to_string(), Value::Short(count as i16));
            compound.insert("mapState".to_string(), Compound(map_state));
            palette.push(Compound(compound));
            count += 1;
        }

        Value::List(palette)
    }

    pub fn get_block_id_list(&self) -> Vec<i32> {
        let total_blocks = (self.length * self.width * self.height) as usize;
        let air_index = self.air_index as i32;
        let atomic_block_list: Vec<AtomicI32> = (0..total_blocks)
            .map(|_| AtomicI32::new(air_index))
            .collect();
        let atomic_block_list = Arc::new(atomic_block_list);

        self.blocks.par_iter().for_each(|block| {
            let dx = block.pos.x - self.start_pos.x;
            let dy = block.pos.y - self.start_pos.y;
            let dz = block.pos.z - self.start_pos.z;

            let id = (dz * self.width * self.height) + (dy * self.width) + dx;

            if id >= 0 && (id as usize) < atomic_block_list.len() {
                let state_id = self
                    .block_state_to_index
                    .get(&block.block)
                    .map(|v| *v as i32)
                    .unwrap_or(air_index);

                atomic_block_list[id as usize].store(state_id, Ordering::Relaxed);
            }
        });

        Arc::try_unwrap(atomic_block_list)
            .unwrap()
            .into_iter()
            .map(|atomic| atomic.into_inner())
            .collect()
    }

    pub fn get_block_longs(&self) -> Vec<i64> {
        let total_blocks = (self.length * self.width * self.height) as usize;
        let air_index = self.air_index as i32;
        let atomic_block_list: Vec<AtomicI64> =
            (0..total_blocks).map(|_| AtomicI64::new(0)).collect();
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
                    .unwrap_or(air_index);
                let long_val = ((state_id as i64 & B3_BYTE_MASK) << 40)
                    | ((block.pos.x as i64 & B2_BYTE_MASK) << 24)
                    | ((block.pos.y as i64 & B1_BYTE_MASK) << 16)
                    | (block.pos.z as i64 & B2_BYTE_MASK);

                atomic_block_list[id as usize].store(long_val, Ordering::Relaxed);
            }
        });

        Arc::try_unwrap(atomic_block_list)
            .unwrap()
            .into_iter()
            .map(|atomic| atomic.into_inner())
            .collect()
    }

    pub fn get_block_and_pos(&self) -> (Vec<i32>, Vec<i32>) {
        let total_blocks = (self.length * self.width * self.height) as usize;
        let air_index = self.air_index as i32;
        let atomic_block_list: Vec<AtomicI32> =
            (0..total_blocks).map(|_| AtomicI32::new(0)).collect();
        let atomic_block_list = Arc::new(atomic_block_list);
        let atomic_block_pos_list: Vec<AtomicI32> =
            (0..total_blocks).map(|_| AtomicI32::new(0)).collect();
        let atomic_block_pos_list = Arc::new(atomic_block_pos_list);

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
                    .unwrap_or(air_index);
                let pos_id = rel_pos_to_int(
                    self.start_pos,
                    BlockPos {
                        x: block.pos.x,
                        y: block.pos.y,
                        z: block.pos.z,
                    },
                );
                atomic_block_list[id as usize].store(state_id + 1, Ordering::Relaxed);
                atomic_block_pos_list[id as usize].store(pos_id, Ordering::Relaxed);
            }
        });

        (
            Arc::try_unwrap(atomic_block_list)
                .unwrap()
                .into_iter()
                .map(|atomic| atomic.into_inner())
                .collect(),
            Arc::try_unwrap(atomic_block_pos_list)
                .unwrap()
                .into_iter()
                .map(|atomic| atomic.into_inner())
                .collect(),
        )
    }

    pub fn to_base64(&self, value: &Value) -> Result<String, SchematicError> {
        let nbt_bytes = to_bytes(value)?;

        let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(&nbt_bytes)?;
        let compressed = encoder.finish()?;
        let base64_str = base64::engine::general_purpose::STANDARD.encode(compressed);
        Ok(base64_str)
    }

    pub fn state_pos_array_list(&self) -> Result<String, SchematicError> {
        let mut region = HashMap::new();
        let int_array: Vec<i32> = self.get_block_id_list();
        region.insert("blockstatemap".to_string(), self.bg_palette());
        let mut end_pos = HashMap::new();
        end_pos.insert("X".to_string(), Value::Int(self.end_pos.x));
        end_pos.insert("Y".to_string(), Value::Int(self.end_pos.y));
        end_pos.insert("Z".to_string(), Value::Int(self.end_pos.z));
        region.insert("endpos".to_string(), Compound(end_pos));
        let mut start_pos = HashMap::new();
        start_pos.insert("X".to_string(), Value::Int(self.start_pos.x));
        start_pos.insert("Y".to_string(), Value::Int(self.start_pos.y));
        start_pos.insert("Z".to_string(), Value::Int(self.start_pos.z));
        region.insert("startpos".to_string(), Compound(start_pos));
        region.insert(
            "statelist".to_string(),
            Value::IntArray(fastnbt::IntArray::new(int_array)),
        );
        Ok(to_string(&region)?)
    }

    pub fn base64_original_data(&self) -> Result<Value, SchematicError> {
        let mut compound: HashMap<String, Value> = HashMap::new();
        let mut header: HashMap<String, Value> = HashMap::new();
        header.insert("author".to_string(), Value::String("MCSTools".to_string()));
        let mut bounds: HashMap<String, Value> = HashMap::new();
        bounds.insert("maxX".to_string(), Value::Int(self.end_pos.x));
        bounds.insert("maxY".to_string(), Value::Int(self.end_pos.y));
        bounds.insert("maxZ".to_string(), Value::Int(self.end_pos.z));
        bounds.insert("minX".to_string(), Value::Int(self.start_pos.x));
        bounds.insert("minY".to_string(), Value::Int(self.start_pos.y));
        bounds.insert("minZ".to_string(), Value::Int(self.start_pos.z));
        header.insert("bounds".to_string(), Compound(bounds));
        header.insert("name".to_string(), Value::String("null".to_string()));
        let longs = self.get_block_longs();
        let mut blocks = Vec::new();
        for id in longs {
            blocks.push(Value::Long(id));
        }
        compound.insert("pos".to_string(), Value::List(blocks));
        compound.insert("header".to_string(), Compound(header));
        compound.insert("data".to_string(), self.bg_palette_type1());
        Ok(Compound(compound))
    }

    pub fn state_pos_list_to_nbt_map_array_type1(&self) -> Result<Value, SchematicError> {
        let mut tag: HashMap<String, Value> = HashMap::new();
        let mut header: HashMap<String, Value> = HashMap::new();
        header.insert("version".to_string(), Value::String("".to_string()));
        header.insert("mc_version".to_string(), Value::String("".to_string()));
        header.insert("name".to_string(), Value::String("".to_string()));
        header.insert("author".to_string(), Value::String("MCSTools".to_string()));
        let mut material_list: HashMap<String, Value> = HashMap::new();
        material_list.insert(
            "root_type".to_string(),
            Value::String("buildinggadgets:entries".to_string()),
        );
        material_list.insert("root_entry".to_string(), Value::List(vec![]));
        header.insert("material_list".to_string(), Compound(material_list));
        tag.insert("header".to_string(), Compound(header));
        let data = self.base64_original_data()?;
        let base64_data = self.to_base64(&data)?;
        tag.insert("body".to_string(), Value::String(base64_data));
        Ok(Compound(tag))
    }

    pub fn state_pos_list_to_nbt_map_array_type2(&self) -> Result<Value, SchematicError> {
        let mut tag: HashMap<String, Value> = HashMap::new();
        let mut end_pos = HashMap::new();
        end_pos.insert("X".to_string(), Value::Int(self.end_pos.x));
        end_pos.insert("Y".to_string(), Value::Int(self.end_pos.y));
        end_pos.insert("Z".to_string(), Value::Int(self.end_pos.z));
        let mut start_pos = HashMap::new();
        start_pos.insert("X".to_string(), Value::Int(self.start_pos.x));
        start_pos.insert("Y".to_string(), Value::Int(self.start_pos.y));
        start_pos.insert("Z".to_string(), Value::Int(self.start_pos.z));
        tag.insert("startPos".to_string(), Compound(start_pos));
        tag.insert("endPos".to_string(), Compound(end_pos));
        tag.insert("mapIntState".to_string(), self.bg_palette_type2());
        let (state_int_array, pos_int_array) = self.get_block_and_pos();
        tag.insert(
            "stateIntArray".to_string(),
            Value::IntArray(fastnbt::IntArray::new(state_int_array)),
        );
        tag.insert(
            "posIntArray".to_string(),
            Value::IntArray(fastnbt::IntArray::new(pos_int_array)),
        );
        Ok(Compound(tag))
    }

    pub fn bg_schematic(&self, sub_type: i32) -> Result<String, SchematicError> {
        if sub_type == 0 {
            let state_pos_array_list = self.state_pos_array_list()?;
            let dynamic_json = json!({
                "name": "null",
                "statePosArrayList": state_pos_array_list,
            });
            Ok(dynamic_json.to_string())
        } else if sub_type == 1 {
            let data = self.state_pos_list_to_nbt_map_array_type1()?;
            Ok(to_string(&data)?)
        } else if sub_type == 2 {
            let data = self.state_pos_list_to_nbt_map_array_type2()?;
            Ok(to_string(&data)?)
        } else {
            Err(SchematicError::InvalidFormat("bg_schematic unknown type"))
        }
    }
}
