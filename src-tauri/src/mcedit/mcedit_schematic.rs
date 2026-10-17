use crate::mcedit::legacy_map::{MAX_LEGACY_VOLUME, codec};
use crate::utils::block_state_pos_list::{BlockPos, BlockStatePosList};
use crate::utils::entities::EntitiesList;
use crate::utils::extend_value::NbtExt;
use crate::utils::schematic_data::{SchematicData, SchematicError, Size};
use crate::utils::tile_entities::TileEntitiesList;
use fastnbt::Value;
use fastnbt::Value::Compound;
use flate2::read::GzDecoder;
use std::collections::HashMap;
use std::io::{Cursor, Read};

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
    pub fn new_from_bytes(data: Vec<u8>) -> Result<Self, SchematicError> {
        let nbt = parse_nbt(data)?;
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
        let root = self.root()?;
        let size = self.get_size()?;
        let width = size.width;
        let height = size.height;
        let length = size.length;
        let volume = i64::from(width)
            .checked_mul(i64::from(height))
            .and_then(|value| value.checked_mul(i64::from(length)))
            .ok_or(SchematicError::InvalidFormat("schematic volume overflow"))?;
        if volume > MAX_LEGACY_VOLUME {
            return Err(SchematicError::InvalidFormat(
                "legacy schematic volume exceeds the supported safety limit",
            ));
        }
        let volume = usize::try_from(volume)
            .map_err(|_| SchematicError::InvalidFormat("schematic volume overflow"))?;

        let blocks = root.get_i8_array("Blocks")?.to_vec();
        let data = root.get_i8_array("Data")?.to_vec();

        if blocks.len() != volume || data.len() != volume {
            return Err(SchematicError::InvalidFormat(
                "Blocks/Data array length does not match Width*Height*Length",
            ));
        }

        let add_blocks = root
            .get("AddBlocks")
            .and_then(|value| match value {
                Value::ByteArray(array) => Some(array.to_vec()),
                _ => None,
            })
            .unwrap_or_default();

        let packed_add_blocks = add_blocks.len() == volume.div_ceil(2);
        let full_add_blocks = add_blocks.len() == volume;
        if !add_blocks.is_empty() && !packed_add_blocks && !full_add_blocks {
            return Err(SchematicError::InvalidFormat(
                "AddBlocks array length must be ceil(volume/2) or volume",
            ));
        }

        let mut block_list = BlockStatePosList::default();

        for y in 0..height {
            for z in 0..length {
                for x in 0..width {
                    let index = (y * length + z) * width + x;
                    let index = index as usize;

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
                    let block = codec().decode(legacy_id, meta);
                    // The legacy block arrays are always local to the
                    // schematic. WEOrigin is retained as optional metadata,
                    // but must not shift positions consumed by converters.
                    block_list.add_by_pos(x, y, z, block);
                }
            }
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

fn parse_nbt(data: Vec<u8>) -> Result<Value, SchematicError> {
    // `.schematic` files are normally gzip-compressed NBT. Some third-party
    // tools write raw NBT, so fall back to an uncompressed parse.
    let mut decoder = GzDecoder::new(Cursor::new(data.clone()));
    let mut decompressed = Vec::new();
    if decoder.read_to_end(&mut decompressed).is_ok() {
        if let Ok(nbt) = fastnbt::from_bytes::<Value>(&decompressed) {
            return Ok(nbt);
        }
    }

    fastnbt::from_bytes::<Value>(&data).map_err(SchematicError::Nbt)
}
