use crate::building_gadges::bg_schematic_data::BgSchematicData;
use crate::building_gadges::template_json_representation::{deserialize, int_to_rel_pos};
use crate::utils::block_state_pos_list::{BlockData, BlockId, BlockPos, BlockStatePosList};
use crate::utils::extend_value::NbtExt;
use crate::utils::schematic_data::{SchematicData, SchematicError, Size};
use crate::utils::tile_entities::TileEntitiesList;
use base64::Engine;
use fastnbt::Value::Compound;
use fastnbt::{from_bytes, Value as FastNbtValue, Value};
use fastsnbt::from_str;
use flate2::read::GzDecoder;
use serde_json::Value as JsonValue;
use std::collections::BTreeMap;
use std::fs;
use std::io::Read;
use std::sync::Arc;
use serde::Deserializer;
use crate::utils::entities::EntitiesList;

#[derive(Debug)]
pub struct BgSchematic {
    json: String,
}

impl BgSchematic {
    pub fn read_json_file(path: &str) -> Result<String, SchematicError> {
        fs::read_to_string(path).map_err(|e| SchematicError::Io(e))
    }

    pub fn parse_json(&self, json_str: &str) -> Result<JsonValue, SchematicError> {
        serde_json::from_str(json_str).map_err(|e| SchematicError::Json(e))
    }

    fn try_parse(&self) -> Result<(), serde_json::Error> {
        serde_json::from_str::<JsonValue>(&self.json)?;
        Ok(())
    }

    pub fn new(file_path: &str) -> Result<Self, SchematicError> {
        let json_str = fs::read_to_string(file_path).map_err(|e| SchematicError::Io(e))?;
        Ok(Self { json: json_str })
    }

    pub fn new_from_data(data: Vec<u8>) -> Result<Self, SchematicError> {
        let json_str = String::from_utf8(data).map_err(|e| SchematicError::UTF8(e))?;

        Ok(Self { json: json_str })
    }

    pub fn get_type(&self) -> Result<i32, SchematicError> {
        let normalized_json = || self.json.split_whitespace().collect::<String>();
        match self.try_parse() {
            Ok(_) => {
                if normalized_json().contains("statePosArrayList") {
                    Ok(0)
                } else if normalized_json().contains("body") {
                    Ok(1)
                }
                else {
                    Ok(0)
                }
            }
            Err(_)
                if self
                    .json
                    .split_whitespace()
                    .collect::<String>()
                    .contains("body") =>
            {
                Ok(1)
            }
            Err(_)
                if self
                    .json
                    .split_whitespace()
                    .collect::<String>()
                    .contains("mapIntState") =>
            {
                Ok(2)
            }
            Err(_) => Err(SchematicError::InvalidFormat(
                "missing 'body' or 'mapIntState'",
            )),
        }
    }

    pub fn parse_base64(&self, data: &str) -> Result<FastNbtValue, SchematicError> {
        let bytes = base64::engine::general_purpose::STANDARD.decode(data)?;
        let mut decoder = GzDecoder::new(&bytes[..]);
        let mut decompressed = Vec::new();
        decoder.read_to_end(&mut decompressed)?;
        let nbt = from_bytes(&decompressed)?;
        Ok(nbt)
    }

    pub fn decode_schematic(&self) -> Result<BgSchematicData, SchematicError> {
        let type_version = self.get_type()?;
        match type_version {
            0 => {
                let data = self.parse_json(&self.json)?;
                let state_pos_str = data
                    .get("statePosArrayList")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| SchematicError::TypeMismatch {
                        expected: "string",
                        actual: data["statePosArrayList"].to_string(),
                    })?;
                let nbt: Value = from_str(state_pos_str).unwrap();
                Ok(BgSchematicData {
                    type_version,
                    data: nbt,
                })
            }
            1 => {
                match self.try_parse()
                {
                    Ok(_) => {
                        let data = self.parse_json(&self.json)?;
                        let body = data
                            .get("body")
                            .and_then(|v| v.as_str())
                            .ok_or_else(|| SchematicError::TypeMismatch {
                                expected: "string",
                                actual: data["body"].to_string(),
                            })?;

                        let nbt: FastNbtValue = self.parse_base64(body)?;

                        Ok(BgSchematicData {
                            type_version,
                            data: nbt,
                        })
                    }
                    Err(_) => {
                        let output = self.json.replace("\r\n", "");
                        let data: Value = from_str(&output).unwrap();
                        let Compound(root) = data else {
                            return Err(SchematicError::RootNotCompound);
                        };
                        let body = root.get_str("body")?;
                        let nbt: FastNbtValue = self.parse_base64(body)?;

                        Ok(BgSchematicData {
                            type_version,
                            data: nbt,
                        })
                    }
                }
            }
            2 => {
                let output = self.json.replace("\r\n", "");
                let root: Value = from_str(&output).unwrap();
                let Compound(nbt) = root else {
                    return Err(SchematicError::RootNotCompound);
                };

                Ok(BgSchematicData {
                    type_version,
                    data: Compound(nbt),
                })
            }
            _ => Err(SchematicError::InvalidFormat("Invalid version type")),
        }
    }
    fn parse_palette(&self, palette_list: &[Value]) -> Result<Vec<Arc<BlockData>>, SchematicError> {
        let mut palette = Vec::with_capacity(palette_list.len());
        for entry in palette_list {
            let Compound(root) = entry else {
                return Err(SchematicError::InvalidFormat("Root is not a Compound"));
            };
            let name = root
                .get("Name")
                .and_then(Value::as_str)
                .map(|s| Arc::<str>::from(s))
                .unwrap_or_else(|| Arc::from("minecraft:air"));
            let mut properties = BTreeMap::new();
            if let Some(Compound(prop_map)) = root.get("Properties") {
                for (k, v) in prop_map {
                    if let Value::String(s) = v {
                        properties
                            .insert(Arc::<str>::from(k.as_str()), Arc::<str>::from(s.as_str()));
                    }
                }
            }

            palette.push(Arc::new(BlockData {
                id: BlockId { name },
                properties,
            }));
        }

        Ok(palette)
    }

    pub fn get_size(&self) -> Result<BlockPos, SchematicError> {
        let original_data = self.decode_schematic()?;
        let type_version = original_data.type_version;
        match type_version {
            0 => {
                let data = original_data.data;
                let Compound(root) = data else {
                    return Err(SchematicError::InvalidFormat("Root is not a Compound"));
                };
                let start_pos = root.get_pos_t2("startpos")?;
                let end_pos = root.get_pos_t2("endpos")?;
                let height = ((end_pos.y - start_pos.y) + 1).abs();
                let width = ((end_pos.x - start_pos.x) + 1).abs();
                let length = ((end_pos.z - start_pos.z) + 1).abs();
                Ok(BlockPos {
                    x: width,
                    y: height,
                    z: length,
                })
            }
            1 => {
                let data = original_data.data;
                let Compound(root) = data else {
                    return Err(SchematicError::InvalidFormat("Root is not a Compound"));
                };

                let header = root.get_compound("header")?;

                let (start_pos, end_pos) = match header.get_compound("bounds") {
                    Ok(bounds) => (
                        BlockPos {
                            x: bounds.get_i32("minX")?,
                            y: bounds.get_i32("minY")?,
                            z: bounds.get_i32("minZ")?,
                        },
                        BlockPos {
                            x: bounds.get_i32("maxX")?,
                            y: bounds.get_i32("maxY")?,
                            z: bounds.get_i32("maxZ")?,
                        }
                    ),
                    Err(_) => (
                        BlockPos {
                            x: header.get_i32("minX")?,
                            y: header.get_i32("minY")?,
                            z: header.get_i32("minZ")?,
                        },
                        BlockPos {
                            x: header.get_i32("maxX")?,
                            y: header.get_i32("maxY")?,
                            z: header.get_i32("maxZ")?,
                        }
                    )
                };

                let height = ((end_pos.y - start_pos.y) + 1).abs();
                let width = ((end_pos.x - start_pos.x) + 1).abs();
                let length = ((end_pos.z - start_pos.z) + 1).abs();

                Ok(BlockPos {
                    x: width,
                    y: height,
                    z: length,
                })
            }
            2 => {
                let data = original_data.data;
                let Compound(root) = data else {
                    return Err(SchematicError::InvalidFormat("Root is not a Compound"));
                };
                let start_pos = root.get_pos_t2("startPos")?;
                let end_pos = root.get_pos_t2("endPos")?;
                let height = ((end_pos.y - start_pos.y) + 1).abs();
                let width = ((end_pos.x - start_pos.x) + 1).abs();
                let length = ((end_pos.z - start_pos.z) + 1).abs();
                Ok(BlockPos {
                    x: width,
                    y: height,
                    z: length,
                })
            }
            _ => Err(SchematicError::InvalidFormat("get size err"))?,
        }
    }
    pub fn get_blocks_pos(&self) -> Result<SchematicData, SchematicError> {
        let tile_entities = TileEntitiesList::default();
        let mut block_list = BlockStatePosList::default();
        let original_data = self.decode_schematic()?;
        let type_version = original_data.type_version;
        let size = self.get_size()?;
        match type_version {
            0 => {
                let data = original_data.data;
                let Compound(root) = data else {
                    return Err(SchematicError::InvalidFormat("Root is not a Compound"));
                };
                let block_state_map = root.get_list("blockstatemap")?;
                let state_list = root.get_i32_array("statelist")?.clone().into_inner();
                let palette = self.parse_palette(&block_state_map)?;
                let start_pos = root.get_pos_t2("startpos")?;
                let end_pos = root.get_pos_t2("endpos")?;
                let height = ((end_pos.y - start_pos.y) + 1).abs();
                let width = ((end_pos.x - start_pos.x) + 1).abs();
                let length = ((end_pos.z - start_pos.z) + 1).abs();
                let mut counter = 0;

                for z in 0..length {
                    for y in 0..height {
                        for x in 0..width {
                            let block_state_lookup = state_list[counter] as usize;
                            counter += 1;
                            let block_state = &palette[block_state_lookup];
                            block_list.add_by_pos(x, y, z, block_state.clone());
                        }
                    }
                }
            }
            1 => {
                let data = original_data.data;
                let Compound(root) = data else {
                    return Err(SchematicError::InvalidFormat("Root is not a Compound"));
                };
                let block_list_test = deserialize(root)?;
                block_list.merge(block_list_test);
            }
            2 => {
                let data = original_data.data;
                let Compound(root) = data else {
                    return Err(SchematicError::InvalidFormat("Root is not a Compound"));
                };
                let start_pos = root.get_pos_t2("startPos")?;
                let blocks = root.get_i32_array("stateIntArray")?;
                let block_list_i32 = blocks.clone().into_inner();
                let block_state_map = root.get_list("mapIntState")?;
                let pos_int_array = root.get_i32_array("posIntArray")?;
                let mut counter = 0;
                for index in block_list_i32 {
                    let pos_raw = *pos_int_array
                        .get(counter)
                        .ok_or(SchematicError::InvalidFormat("Index OutOf"))?;
                    counter += 1;
                    let abs_pos = int_to_rel_pos(start_pos, pos_raw);
                    let rel_pos = BlockPos {
                        x: abs_pos.x - start_pos.x,
                        y: abs_pos.y - start_pos.y,
                        z: abs_pos.z - start_pos.z,
                    };

                    let state_index = (index - 1) as usize;
                    let state_value = block_state_map.get(state_index).ok_or_else(|| {
                        SchematicError::InvalidFormat("State index out of bounds")
                    })?;

                    let Compound(state_nbt) = state_value else {
                        return Err(SchematicError::InvalidFormat(
                            "Expected Compound tag for block state",
                        ));
                    };
                    let map_state = state_nbt.get_compound("mapState")?;
                    let name = map_state
                        .get("Name")
                        .and_then(Value::as_str)
                        .map(|s| Arc::from(s))
                        .unwrap_or_else(|| Arc::from("minecraft:air"));

                    let mut properties = BTreeMap::new();
                    if let Some(Compound(prop_map)) = map_state.get("Properties") {
                        for (k, v) in prop_map {
                            if let Value::String(s) = v {
                                properties.insert(Arc::from(k.as_str()), Arc::from(s.as_str()));
                            }
                        }
                    }
                    block_list.add(
                        rel_pos,
                        Arc::new(BlockData {
                            id: BlockId { name },
                            properties,
                        }),
                    );
                }
            }
            _ => {}
        }
        Ok(SchematicData::new(
            block_list,
            tile_entities,
            EntitiesList::default(),
            Size {
                width: size.x,
                height: size.y,
                length: size.z,
            },
        ))
    }
}
