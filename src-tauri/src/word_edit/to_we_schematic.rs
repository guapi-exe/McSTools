use crate::utils::block_state_pos_list::{BlockData, BlockId, BlockPos, BlockStatePos};
use crate::utils::schematic_data::{SchematicData, SchematicError};
use fastnbt::Value;
use fastnbt::Value::Compound;
use rayon::iter::IntoParallelRefIterator;
use rayon::iter::ParallelIterator;
use std::collections::{BTreeMap, HashMap, VecDeque};
use std::sync::atomic::{AtomicI32, Ordering};
use std::sync::Arc;
use anyhow::Result;
use crate::utils::tile_entities::TileEntitiesList;

#[derive(Debug)]
pub struct ToWeSchematic {
    blocks: VecDeque<BlockStatePos>,
    start_pos: BlockPos,
    end_pos: BlockPos,
    width: i32,
    height: i32,
    length: i32,
    air_index: usize,
    pub unique_block_states: Vec<Arc<BlockData>>,
    pub block_state_to_index: HashMap<Arc<BlockData>, usize>,
    pub tile_entities: TileEntitiesList,
}

impl ToWeSchematic {
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
        let tile_entities = schematic.tile_entities_list.clone();
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
            tile_entities,
        })
    }

    pub fn get_block_id_list(&self) -> Vec<i32> {
        let total_blocks = (self.length * self.width * self.height) as usize;
        let air_index = self.air_index as i32;
        let atomic_block_list: Vec<AtomicI32> =
            (0..total_blocks).map(|_| AtomicI32::new(air_index)).collect();
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

                atomic_block_list[id as usize].store(state_id, Ordering::Relaxed);
            }
        });

        Arc::try_unwrap(atomic_block_list)
            .unwrap()
            .into_iter()
            .map(|atomic| atomic.into_inner())
            .collect()
    }

    fn build_tile_entities_list(&self) -> Vec<Value> {
        if self.tile_entities.original_type != 3 {
            return vec![];
        }
        self.tile_entities.elements
            .iter()
            .map(|te| {
                let nx = te.pos.x;
                let ny = te.pos.y;
                let nz = te.pos.z;

                match &te.nbt {
                    Compound(map) => {
                        let mut new_map = map.clone();
                        let new_pos = vec![
                            nx, ny, nz,
                        ];
                        new_map.insert("Pos".to_string(), Value::IntArray(fastnbt::IntArray::new(new_pos)));
                        Compound(new_map)
                    }
                    other => {
                        let mut new_map = HashMap::new();
                        let new_pos = vec![
                            nx, ny, nz,
                        ];
                        new_map.insert("Pos".to_string(), Value::IntArray(fastnbt::IntArray::new(new_pos)));
                        new_map.insert("nbt".to_string(), other.clone());
                        Compound(new_map)
                    }
                }
            })
            .collect()
    }
    pub fn decode_to_bytes(&self) -> Vec<i8> {
        let block_id_list = self.get_block_id_list();
        let mut buffer = Vec::new();

        for value in block_id_list {
            let mut temp = value as u32;
            loop {
                let byte_u8 = (temp & 0x7F) as u8;
                temp >>= 7;

                let mut byte_i8 = byte_u8 as i8;

                if temp > 0 {
                    byte_i8 |= -0x80i8;
                    buffer.push(byte_i8);
                } else {
                    buffer.push(byte_i8);
                    break;
                }
            }
        }

        buffer
    }

    pub fn block_to_string(block: &BlockData) -> String {
        let mut output = String::new();

        output.push_str(&block.id.name);

        if !block.properties.is_empty() {
            output.push('[');

            let mut first = true;
            for (key, value) in &block.properties {
                if !first {
                    output.push(',');
                }
                first = false;
                output.push_str(key);
                output.push('=');
                output.push_str(value);
            }
            output.push(']');
        }
        output
    }

    pub fn we_palette(&self) -> Value {
        let mut palette = HashMap::new();
        for (block, index) in &self.block_state_to_index {
            let str = ToWeSchematic::block_to_string(block);
            palette.insert(str, Value::Int(*index as i32));
        }
        Compound(palette)
    }

    pub fn we_schematic(&self, type_version: i32) -> Result<Value, SchematicError> {
        match type_version {
            0 => {
                let mut nbt = HashMap::new();
                nbt.insert(
                    "PaletteMax".to_string(),
                    Value::Int(self.unique_block_states.len() as i32),
                );
                nbt.insert("Version".to_string(), Value::Int(2));
                nbt.insert("Length".to_string(), Value::Short(self.length as i16));
                nbt.insert("Height".to_string(), Value::Short(self.height as i16));
                nbt.insert("Width".to_string(), Value::Short(self.width as i16));
                nbt.insert("DataVersion".to_string(), Value::Int(3465));
                nbt.insert("Palette".to_string(), self.we_palette());
                let bytes_array = self.decode_to_bytes();
                nbt.insert(
                    "BlockData".to_string(),
                    Value::ByteArray(fastnbt::ByteArray::new(bytes_array)),
                );
                nbt.insert("BlockEntities".to_string(), Value::List(self.build_tile_entities_list()));
                Ok(Compound(nbt))
            }
            1 => {
                let mut nbt = HashMap::new();
                let mut schematic = HashMap::new();
                let mut blocks = HashMap::new();
                blocks.insert("Palette".to_string(), self.we_palette());
                let bytes_array = self.decode_to_bytes();
                blocks.insert(
                    "BlockData".to_string(),
                    Value::ByteArray(fastnbt::ByteArray::new(bytes_array)),
                );
                blocks.insert("BlockEntities".to_string(), Value::List(self.build_tile_entities_list()));
                schematic.insert("Blocks".to_string(), Compound(blocks));
                schematic.insert("Version".to_string(), Value::Int(3));
                schematic.insert("Length".to_string(), Value::Short(self.length as i16));
                schematic.insert("Height".to_string(), Value::Short(self.height as i16));
                schematic.insert("Width".to_string(), Value::Short(self.width as i16));
                schematic.insert("DataVersion".to_string(), Value::Int(3465));
                nbt.insert("Schematic".to_string(), Compound(schematic));
                Ok(Compound(nbt))
            }
            _ => Err(SchematicError::InvalidFormat("?")),
        }
    }
}
