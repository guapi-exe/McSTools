use crate::utils::block_state_pos_list::{BlockData, BlockId, BlockPos, BlockStatePos};
use crate::utils::entities::EntitiesList;
use crate::utils::java_entities::java_entity_data;
use crate::utils::schematic_data::{SchematicData, SchematicError};
use crate::utils::tile_entities::TileEntitiesList;
use anyhow::Result;
use fastnbt::Value;
use fastnbt::Value::Compound;
use rayon::iter::IntoParallelRefIterator;
use rayon::iter::ParallelIterator;
use std::collections::{BTreeMap, HashMap, VecDeque};
use std::sync::Arc;
use std::sync::atomic::{AtomicI32, Ordering};

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
    entities: EntitiesList,
}

impl ToWeSchematic {
    pub fn new(schematic: &SchematicData) -> Result<Self, SchematicError> {
        let block_list = schematic.blocks.clone();
        let (min, max, size) =
            crate::utils::conversion_bounds::conversion_bounds(&block_list, schematic.size)?;
        let blocks = block_list.elements;
        let width = size.width;
        let height = size.height;
        let length = size.length;

        if [width, height, length]
            .into_iter()
            .any(|dimension| dimension <= 0)
        {
            return Err(SchematicError::InvalidFormat(
                "schematic dimensions must be positive",
            ));
        }
        if [width, height, length]
            .into_iter()
            .any(|dimension| dimension > i16::MAX as i32)
        {
            return Err(SchematicError::InvalidFormat(
                "WorldEdit schematic dimensions exceed i16 range",
            ));
        }

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

            for block_pos in &blocks {
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
            entities: crate::utils::java_entities::local_java_entities(
                &schematic.entities_list,
                [min.x, min.y, min.z],
            )?,
        })
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

    fn build_tile_entities_list(&self, type_version: i32) -> Result<Vec<Value>, SchematicError> {
        self.tile_entities
            .elements
            .iter()
            .map(|te| {
                let (id, mut data) = java_entity_data(&te.nbt, self.tile_entities.original_type)?;
                let mut position = Vec::with_capacity(3);
                for (coordinate, origin, bound) in [
                    (te.pos.x, self.start_pos.x, self.width),
                    (te.pos.y, self.start_pos.y, self.height),
                    (te.pos.z, self.start_pos.z, self.length),
                ] {
                    let value = coordinate
                        .checked_sub(origin)
                        .filter(|value| *value >= 0 && *value < bound)
                        .ok_or(SchematicError::InvalidFormat(
                            "WorldEdit BlockEntity is outside export bounds",
                        ))?;
                    position.push(value);
                }
                for field in ["x", "y", "z", "Pos"] {
                    data.remove(field);
                }
                Ok(sponge_entity(
                    id,
                    Value::IntArray(fastnbt::IntArray::new(position)),
                    data,
                    type_version,
                ))
            })
            .collect()
    }

    fn build_entities_list(&self, type_version: i32) -> Result<Vec<Value>, SchematicError> {
        self.entities
            .elements
            .iter()
            .map(|entity| {
                let Compound(mut data) = entity.nbt.clone() else {
                    return Err(SchematicError::InvalidFormat(
                        "entity payload is not a compound",
                    ));
                };
                let Some(Value::String(id)) = data.remove("id") else {
                    return Err(SchematicError::InvalidFormat("entity id is missing"));
                };
                let position = data
                    .remove("Pos")
                    .ok_or(SchematicError::InvalidFormat("entity position is missing"))?;
                Ok(sponge_entity(id, position, data, type_version))
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
        self.we_schematic_for_data_version(type_version, 3465)
    }

    pub fn we_schematic_for_data_version(
        &self,
        type_version: i32,
        data_version: i32,
    ) -> Result<Value, SchematicError> {
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
                nbt.insert("DataVersion".to_string(), Value::Int(data_version));
                nbt.insert("Palette".to_string(), self.we_palette());
                let bytes_array = self.decode_to_bytes();
                nbt.insert(
                    "BlockData".to_string(),
                    Value::ByteArray(fastnbt::ByteArray::new(bytes_array)),
                );
                nbt.insert(
                    "BlockEntities".to_string(),
                    Value::List(self.build_tile_entities_list(type_version)?),
                );
                nbt.insert(
                    "Entities".to_string(),
                    Value::List(self.build_entities_list(type_version)?),
                );
                Ok(Compound(nbt))
            }
            1 => {
                let mut nbt = HashMap::new();
                let mut schematic = HashMap::new();
                let mut blocks = HashMap::new();
                blocks.insert("Palette".to_string(), self.we_palette());
                let bytes_array = self.decode_to_bytes();
                blocks.insert(
                    "Data".to_string(),
                    Value::ByteArray(fastnbt::ByteArray::new(bytes_array)),
                );
                blocks.insert(
                    "BlockEntities".to_string(),
                    Value::List(self.build_tile_entities_list(type_version)?),
                );
                schematic.insert("Blocks".to_string(), Compound(blocks));
                schematic.insert("Version".to_string(), Value::Int(3));
                schematic.insert("Length".to_string(), Value::Short(self.length as i16));
                schematic.insert("Height".to_string(), Value::Short(self.height as i16));
                schematic.insert("Width".to_string(), Value::Short(self.width as i16));
                schematic.insert("DataVersion".to_string(), Value::Int(data_version));
                schematic.insert(
                    "Entities".to_string(),
                    Value::List(self.build_entities_list(type_version)?),
                );
                nbt.insert("Schematic".to_string(), Compound(schematic));
                Ok(Compound(nbt))
            }
            _ => Err(SchematicError::InvalidFormat(
                "Unsupported Sponge format version",
            )),
        }
    }
}

fn sponge_entity(
    id: String,
    position: Value,
    data: HashMap<String, Value>,
    type_version: i32,
) -> Value {
    let mut root = if type_version == 1 {
        HashMap::from([("Data".to_string(), Compound(data))])
    } else {
        data
    };
    root.insert("Id".to_string(), Value::String(id));
    root.insert("Pos".to_string(), position);
    Compound(root)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::block_state_pos_list::{BlockData, BlockId, BlockStatePosList};
    use crate::utils::entities::EntitiesList;
    use crate::utils::schematic_data::{SchematicData, Size};
    use crate::utils::tile_entities::TileEntitiesList;

    #[test]
    fn preserves_declared_selection_size_for_sparse_worldedit_output() {
        let stone = Arc::new(BlockData {
            id: BlockId {
                name: Arc::<str>::from("minecraft:stone"),
            },
            properties: BTreeMap::new(),
        });
        let mut blocks = BlockStatePosList::default();
        blocks.add(BlockPos { x: 2, y: 1, z: 0 }, stone);
        let source = SchematicData::new(
            blocks,
            TileEntitiesList::default(),
            EntitiesList::default(),
            Size {
                width: 3,
                height: 2,
                length: 1,
            },
        );

        let writer = ToWeSchematic::new(&source).expect("build writer");
        assert_eq!((writer.width, writer.height, writer.length), (3, 2, 1));
        assert_eq!(writer.start_pos, BlockPos { x: 0, y: 0, z: 0 });

        let Value::Compound(root) = writer.we_schematic(0).expect("encode schematic") else {
            panic!("expected root compound");
        };
        assert_eq!(root.get("Width"), Some(&Value::Short(3)));
        assert_eq!(root.get("Height"), Some(&Value::Short(2)));
        assert_eq!(root.get("Length"), Some(&Value::Short(1)));
    }
}
