use crate::utils::block_state_pos_list::{BlockData, BlockId, BlockStatePosList};
use crate::utils::entities::EntitiesList;
use crate::utils::extend_value::NbtExt;
use crate::utils::schematic_data::{SchematicData, SchematicError, Size};
use crate::utils::tile_entities::TileEntitiesList;
use crate::word_edit::var_int_iterator::VarIntIterator;
use crate::word_edit::we_schematic_data::{WeSchematicData, WeSize};
use fastnbt::Value::Compound;
use fastnbt::{ByteArray, Value};
use flate2::read::GzDecoder;
use std::collections::{BTreeMap, HashMap};
use std::fs::File;
use std::io::{BufReader, Cursor};
use std::sync::Arc;

#[derive(Debug)]
pub struct WeSchematic {
    pub nbt: Value,
}

impl WeSchematic {
    pub fn new(file_path: &str) -> Result<Self, SchematicError> {
        let file = File::open(file_path)?;
        let reader = BufReader::new(file);
        let decoder = GzDecoder::new(reader);

        let nbt: Value = fastnbt::from_reader(decoder)?;

        if let Compound(_) = &nbt {
            Ok(Self { nbt })
        } else {
            Err(SchematicError::InvalidFormat("Root is not a Compound"))
        }
    }

    pub fn new_from_bytes(data: Vec<u8>) -> Result<Self, SchematicError> {
        let cursor = Cursor::new(data);
        let mut decoder = GzDecoder::new(cursor);

        let nbt: Value = fastnbt::from_reader(&mut decoder)?;

        if let Compound(_) = &nbt {
            Ok(Self { nbt })
        } else {
            Err(SchematicError::InvalidFormat("Root is not a Compound"))
        }
    }

    pub fn get_type(&self) -> Result<i32, SchematicError> {
        let Compound(root) = &self.nbt else {
            return Err(SchematicError::InvalidFormat("Root is not a Compound"));
        };
        let via_schematic = root.get_compound("Schematic");

        match via_schematic {
            Ok(_) => Ok(1),
            Err(_) => Ok(0),
        }
    }

    pub fn get_metadata(&self) -> Result<&HashMap<String, Value>, SchematicError> {
        if let Compound(root) = &self.nbt {
            root.get("Metadata")
                .and_then(|v| match v {
                    Compound(list) => Some(list),
                    _ => None,
                })
                .ok_or(SchematicError::InvalidFormat("NotFound Metadata"))
        } else {
            Err(SchematicError::InvalidFormat("Root is not a Compound"))
        }
    }

    pub fn get_palette(
        &self,
        type_version: i32,
    ) -> Result<&HashMap<String, Value>, SchematicError> {
        let Compound(root) = &self.nbt else {
            return Err(SchematicError::InvalidFormat("Root is not a Compound"));
        };
        let palette = match type_version {
            0 => root.get_compound("Palette"),
            1 => root
                .get_compound("Schematic")?
                .get_compound("Blocks")?
                .get_compound("Palette"),
            _ => Err(SchematicError::InvalidFormat("Root is not a Compound"))?,
        };
        Ok(palette?)
    }
    pub fn get_data_version(&self, type_version: i32) -> Result<i32, SchematicError> {
        let Compound(root) = &self.nbt else {
            return Err(SchematicError::InvalidFormat("Root is not a Compound"));
        };
        let new_root = match type_version {
            0 => root,
            1 => root.get_compound("Schematic")?,
            _ => Err(SchematicError::InvalidFormat("Root is not a Compound"))?,
        };
        let data_version = new_root.get_i32("DataVersion")?;
        Ok(data_version)
    }
    pub fn get_size(&self, type_version: i32) -> Result<WeSize, SchematicError> {
        let Compound(root) = &self.nbt else {
            return Err(SchematicError::InvalidFormat("Root is not a Compound"));
        };
        let new_root = match type_version {
            0 => root,
            1 => root.get_compound("Schematic")?,
            _ => Err(SchematicError::InvalidFormat("Root is not a Compound"))?,
        };

        let length = new_root.get_i16("Length")? as i32;
        let width = new_root.get_i16("Width")? as i32;
        let height = new_root.get_i16("Height")? as i32;

        Ok(WeSize {
            length,
            width,
            height,
        })
    }

    pub fn get_block_data(&self, type_version: i32) -> Result<&ByteArray, SchematicError> {
        let Compound(root) = &self.nbt else {
            return Err(SchematicError::InvalidFormat("Root is not a Compound"));
        };
        let data = match type_version {
            0 => root.get_i8_array("BlockData"),
            1 => root
                .get_compound("Schematic")?
                .get_compound("Blocks")?
                .get_i8_array("Data"),
            _ => Err(SchematicError::InvalidFormat("Root is not a Compound"))?,
        };
        Ok(data?)
    }

    pub fn get_block_entities(
        &self,
        type_version: i32,
    ) -> Result<TileEntitiesList, SchematicError> {
        let Compound(root) = &self.nbt else {
            return Err(SchematicError::InvalidFormat("Root is not a Compound"));
        };

        let entities: TileEntitiesList = match type_version {
            0 => {
                let tile_entities_raw: Vec<Value> = root
                    .get("BlockEntities")
                    .and_then(|v| match v {
                        Value::List(list) => Some(list.clone()),
                        _ => None,
                    })
                    .unwrap_or_else(|| vec![]);

                if tile_entities_raw.is_empty() {
                    TileEntitiesList::new()
                } else {
                    TileEntitiesList::from_nbt_we(&tile_entities_raw, 3)?
                }
            }
            1 => {
                let tile_entities_raw: Vec<Value> = root
                    .get_compound("Schematic")?
                    .get_compound("Blocks")?
                    .get("BlockEntities")
                    .and_then(|v| match v {
                        Value::List(list) => Some(list.clone()),
                        _ => None,
                    })
                    .unwrap_or_else(|| vec![]);

                if tile_entities_raw.is_empty() {
                    TileEntitiesList::new()
                } else {
                    TileEntitiesList::from_nbt_we(&tile_entities_raw, 3)?
                }
            }
            _ => {
                return Err(SchematicError::InvalidFormat("Root is not a Compound"));
            }
        };

        Ok(entities)
    }

    pub fn parse_palette(
        &self,
        type_version: i32,
    ) -> Result<HashMap<i32, Arc<BlockData>>, SchematicError> {
        let palette = self.get_palette(type_version)?;
        let mut result = HashMap::with_capacity(palette.len());

        for (block_state_str, value) in palette {
            let block_data = Self::parse_block_state(block_state_str)?;

            let id = match value {
                Value::Int(n) => *n as i32,
                _ => return Err(SchematicError::InvalidFormat("Palette value should be Int")),
            };

            result.insert(id, Arc::new(block_data));
        }

        Ok(result)
    }

    fn parse_block_state(input: &str) -> Result<BlockData, SchematicError> {
        let (head_part, props_part) = input
            .split_once('[')
            .map(|(h, p)| (h, p.trim_end_matches(']')))
            .unwrap_or((input, ""));
        if head_part.trim().is_empty() || (input.contains('[') && !input.ends_with(']')) {
            return Err(SchematicError::InvalidFormat(
                "WorldEdit palette contains a malformed block state",
            ));
        }
        let full_id = if head_part.contains(':') {
            Arc::<str>::from(head_part)
        } else {
            Arc::<str>::from(format!("minecraft:{head_part}"))
        };
        let properties = if props_part.is_empty() {
            BTreeMap::new()
        } else {
            let mut properties = BTreeMap::new();
            for prop in props_part.split(',') {
                let Some((key, value)) = prop.split_once('=') else {
                    return Err(SchematicError::InvalidFormat(
                        "WorldEdit palette contains a malformed block property",
                    ));
                };
                let key = key.trim();
                let value = value.trim();
                if key.is_empty() || value.is_empty() {
                    return Err(SchematicError::InvalidFormat(
                        "WorldEdit palette contains an empty block property",
                    ));
                }
                properties.insert(Arc::<str>::from(key), Arc::<str>::from(value));
            }
            properties
        };

        Ok(BlockData {
            id: BlockId { name: full_id },
            properties,
        })
    }

    pub fn get_we_data(&self, type_version: i32) -> Result<WeSchematicData, SchematicError> {
        let Compound(root) = &self.nbt else {
            return Err(SchematicError::InvalidFormat("Root is not a Compound"));
        };
        let palette = self.parse_palette(type_version)?;
        let palette_max = match type_version {
            0 => root.get_i32("PaletteMax")?,
            1 => palette.len() as i32,
            _ => Err(SchematicError::InvalidFormat(
                "PaletteMax is not a Compound",
            ))?,
        };

        Ok(WeSchematicData {
            type_version,
            size: self.get_size(type_version)?,
            palette,
            palette_max,
            block_data: self.get_block_data(type_version)?.to_vec(),
        })
    }
    pub fn get_blocks_pos(&self) -> Result<SchematicData, SchematicError> {
        let mut block_list = BlockStatePosList::default();
        let type_version = self.get_type()?;
        let data = self.get_we_data(type_version)?;
        let tile_entities = self.get_block_entities(type_version)?;
        let palette = self.parse_palette(type_version)?;
        let block_data_i8 = data.block_data;
        let size = self.get_size(type_version)?;
        let width = size.width;
        let height = size.height;
        let length = size.length;
        if width <= 0 || height <= 0 || length <= 0 {
            return Err(SchematicError::InvalidFormat(
                "WorldEdit dimensions must be positive",
            ));
        }
        let expected_volume = (i64::from(width))
            .checked_mul(i64::from(height))
            .and_then(|value| value.checked_mul(i64::from(length)))
            .and_then(|value| usize::try_from(value).ok())
            .ok_or(SchematicError::InvalidFormat(
                "WorldEdit dimensions overflow",
            ))?;
        let iter = VarIntIterator::new(&block_data_i8);
        for (i, value) in iter.enumerate() {
            if i >= expected_volume {
                return Err(SchematicError::InvalidFormat(
                    "WorldEdit block data exceeds declared volume",
                ));
            }
            // VarInt state ids are not limited to one byte. Masking with
            // 0xff silently aliases palette entries >= 256 and is the main
            // cause of seemingly random block states in large schematics.
            let value = value.map_err(|error| SchematicError::InvalidFormat(error.message()))?;
            let unsigned_state_id = i32::try_from(value)
                .map_err(|_| SchematicError::InvalidFormat("state id exceeds i32"))?;
            let y = (i) as i32 / (width * length);
            let z = ((i) as i32 % (width * length)) / width;
            let x = (i) as i32 % width;
            let block_data = palette
                .get(&unsigned_state_id)
                .ok_or(SchematicError::InvalidFormat("miss unsigned_state_id"))?;
            block_list.add_by_pos(x, y, z, block_data.clone());
        }
        if block_list.elements.len() != expected_volume {
            return Err(SchematicError::InvalidFormat(
                "WorldEdit block data is shorter than declared volume",
            ));
        }
        Ok(SchematicData::new(
            block_list,
            tile_entities,
            EntitiesList::default(),
            Size {
                width,
                height,
                length,
            },
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::block_state_pos_list::{BlockData, BlockId, BlockStatePosList};
    use crate::utils::entities::EntitiesList;
    use crate::utils::schematic_data::{SchematicData, Size};
    use crate::utils::tile_entities::TileEntitiesList;
    use crate::word_edit::to_we_schematic::ToWeSchematic;
    use std::collections::BTreeMap;

    #[test]
    fn reads_varint_palette_ids_above_one_byte() {
        let mut blocks = BlockStatePosList::default();
        for x in 0..=256 {
            blocks.add_by_pos(
                x,
                0,
                0,
                Arc::new(BlockData {
                    id: BlockId {
                        name: Arc::from(format!("minecraft:test_{x}")),
                    },
                    properties: BTreeMap::new(),
                }),
            );
        }
        let source = SchematicData::new(
            blocks,
            TileEntitiesList::default(),
            EntitiesList::default(),
            Size {
                width: 257,
                height: 1,
                length: 1,
            },
        );
        let encoded = ToWeSchematic::new(&source)
            .expect("build WorldEdit writer")
            .we_schematic(0)
            .expect("encode WorldEdit schematic");
        let decoded = WeSchematic { nbt: encoded }
            .get_blocks_pos()
            .expect("decode WorldEdit schematic");

        assert_eq!(decoded.blocks.elements[256].pos.x, 256);
        assert_eq!(
            decoded.blocks.elements[256].block.id.name.as_ref(),
            "minecraft:test_256"
        );
    }
}
