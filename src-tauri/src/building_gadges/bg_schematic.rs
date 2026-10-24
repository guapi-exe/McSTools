use crate::building_gadges::bg_schematic_data::BgSchematicData;
use crate::building_gadges::template_json_representation::{
    deserialize_with_limits, int_to_rel_pos,
};
use crate::utils::block_state_pos_list::{BlockData, BlockId, BlockPos, BlockStatePosList};
use crate::utils::entities::EntitiesList;
use crate::utils::extend_value::NbtExt;
use crate::utils::nbt_scan::read_gzip_java_nbt;
use crate::utils::parse_limits::ParseLimits;
use crate::utils::parse_limits::read_source_file;
use crate::utils::schematic_data::{SchematicData, SchematicError, Size};
use crate::utils::snbt_scan::scan_snbt;
use crate::utils::tile_entities::TileEntitiesList;
use base64::Engine;
use fastnbt::Value::Compound;
use fastnbt::{Value as FastNbtValue, Value};
use fastsnbt::from_str;
use serde_json::Value as JsonValue;
use std::borrow::Cow;
use std::collections::BTreeMap;
use std::sync::Arc;

const MAX_EMBEDDED_NBT_BYTES: usize = 256 * 1024 * 1024;

#[derive(Debug)]
pub struct BgSchematic<'a> {
    json: Cow<'a, str>,
}

impl<'a> BgSchematic<'a> {
    pub fn read_json_file(path: &str) -> Result<String, SchematicError> {
        Ok(String::from_utf8(read_source_file(path)?)?)
    }

    pub fn parse_json(&self, json_str: &str) -> Result<JsonValue, SchematicError> {
        serde_json::from_str(json_str).map_err(|e| SchematicError::Json(e))
    }

    fn try_parse(&self) -> Result<(), serde_json::Error> {
        serde_json::from_str::<JsonValue>(&self.json)?;
        Ok(())
    }

    pub fn new(file_path: &str) -> Result<Self, SchematicError> {
        let json_str = Self::read_json_file(file_path)?;
        Ok(Self {
            json: Cow::Owned(json_str),
        })
    }

    pub fn new_from_data(data: Vec<u8>) -> Result<Self, SchematicError> {
        ParseLimits::default().validate_input(data.len())?;
        let json_str = String::from_utf8(data).map_err(|e| SchematicError::UTF8(e))?;

        Ok(Self {
            json: Cow::Owned(json_str),
        })
    }

    pub fn new_from_slice(data: &'a [u8]) -> Result<Self, SchematicError> {
        ParseLimits::default().validate_input(data.len())?;
        let json = std::str::from_utf8(data)
            .map_err(|_| SchematicError::InvalidFormat("Building Gadgets input is not UTF-8"))?;
        Ok(Self {
            json: Cow::Borrowed(json),
        })
    }

    pub fn get_type(&self) -> Result<i32, SchematicError> {
        scan_snbt(&self.json, &ParseLimits::default())?;
        let normalized_json = || self.json.split_whitespace().collect::<String>();
        match self.try_parse() {
            Ok(_) => {
                if normalized_json().contains("statePosArrayList") {
                    Ok(0)
                } else if normalized_json().contains("body") {
                    Ok(1)
                } else {
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
        let limits = ParseLimits {
            max_decompressed_bytes: MAX_EMBEDDED_NBT_BYTES,
            ..ParseLimits::default()
        };
        self.parse_base64_with_limits(data, &limits)
    }

    fn parse_base64_with_limits(
        &self,
        data: &str,
        limits: &ParseLimits,
    ) -> Result<FastNbtValue, SchematicError> {
        limits.validate_input(data.len())?;
        let bytes = base64::engine::general_purpose::STANDARD.decode(data)?;
        if bytes.len() > limits.max_input_bytes {
            return Err(SchematicError::LimitExceeded(format!(
                "Building Gadgets embedded gzip is {} bytes; limit is {}",
                bytes.len(),
                limits.max_input_bytes
            )));
        }
        read_gzip_java_nbt(&bytes, limits)
    }

    pub fn decode_schematic(&self) -> Result<BgSchematicData, SchematicError> {
        self.decode_schematic_with_limits(&ParseLimits::default())
    }

    pub fn decode_schematic_with_limits(
        &self,
        limits: &ParseLimits,
    ) -> Result<BgSchematicData, SchematicError> {
        limits.validate_input(self.json.len())?;
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
                scan_snbt(state_pos_str, limits)?;
                let nbt: Value = from_str(state_pos_str)?;
                Ok(BgSchematicData {
                    type_version,
                    data: nbt,
                })
            }
            1 => match self.try_parse() {
                Ok(_) => {
                    let data = self.parse_json(&self.json)?;
                    let body = data.get("body").and_then(|v| v.as_str()).ok_or_else(|| {
                        SchematicError::TypeMismatch {
                            expected: "string",
                            actual: data["body"].to_string(),
                        }
                    })?;

                    let nbt: FastNbtValue = self.parse_base64_with_limits(body, limits)?;

                    Ok(BgSchematicData {
                        type_version,
                        data: nbt,
                    })
                }
                Err(_) => {
                    let output = self.json.replace("\r\n", "");
                    scan_snbt(&output, limits)?;
                    let data: Value = from_str(&output)?;
                    let Compound(root) = data else {
                        return Err(SchematicError::RootNotCompound);
                    };
                    let body = root.get_str("body")?;
                    let nbt: FastNbtValue = self.parse_base64_with_limits(body, limits)?;

                    Ok(BgSchematicData {
                        type_version,
                        data: nbt,
                    })
                }
            },
            2 => {
                let output = self.json.replace("\r\n", "");
                scan_snbt(&output, limits)?;
                let root: Value = from_str(&output)?;
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
    fn parse_palette(
        &self,
        palette_list: &[Value],
        limits: &ParseLimits,
    ) -> Result<Vec<Arc<BlockData>>, SchematicError> {
        limits.validate_palette_len(palette_list.len())?;
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
        self.get_size_from_data(&original_data)
    }

    fn get_size_from_data(
        &self,
        original_data: &BgSchematicData,
    ) -> Result<BlockPos, SchematicError> {
        match original_data.type_version {
            0 => {
                let Compound(root) = &original_data.data else {
                    return Err(SchematicError::InvalidFormat("Root is not a Compound"));
                };
                let start_pos = root.get_pos_t2("startpos")?;
                let end_pos = root.get_pos_t2("endpos")?;
                Ok(BlockPos {
                    x: Self::inclusive_span(start_pos.x, end_pos.x)?,
                    y: Self::inclusive_span(start_pos.y, end_pos.y)?,
                    z: Self::inclusive_span(start_pos.z, end_pos.z)?,
                })
            }
            1 => {
                let Compound(root) = &original_data.data else {
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
                        },
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
                        },
                    ),
                };

                Ok(BlockPos {
                    x: Self::inclusive_span(start_pos.x, end_pos.x)?,
                    y: Self::inclusive_span(start_pos.y, end_pos.y)?,
                    z: Self::inclusive_span(start_pos.z, end_pos.z)?,
                })
            }
            2 => {
                let Compound(root) = &original_data.data else {
                    return Err(SchematicError::InvalidFormat("Root is not a Compound"));
                };
                let start_pos = root.get_pos_t2("startPos")?;
                let end_pos = root.get_pos_t2("endPos")?;
                Ok(BlockPos {
                    x: Self::inclusive_span(start_pos.x, end_pos.x)?,
                    y: Self::inclusive_span(start_pos.y, end_pos.y)?,
                    z: Self::inclusive_span(start_pos.z, end_pos.z)?,
                })
            }
            _ => Err(SchematicError::InvalidFormat("get size err"))?,
        }
    }

    fn inclusive_span(start: i32, end: i32) -> Result<i32, SchematicError> {
        let span = (i64::from(end) - i64::from(start))
            .unsigned_abs()
            .checked_add(1)
            .ok_or(SchematicError::InvalidFormat(
                "Building Gadgets bounds span overflow",
            ))?;
        i32::try_from(span).map_err(|_| {
            SchematicError::InvalidFormat("Building Gadgets bounds span does not fit i32")
        })
    }
    pub fn get_blocks_pos(&self) -> Result<SchematicData, SchematicError> {
        self.get_blocks_pos_with_limits(&ParseLimits::default())
    }

    pub fn get_blocks_pos_with_limits(
        &self,
        limits: &ParseLimits,
    ) -> Result<SchematicData, SchematicError> {
        let tile_entities = TileEntitiesList::default();
        let mut block_list = BlockStatePosList::default();
        let original_data = self.decode_schematic_with_limits(limits)?;
        let type_version = original_data.type_version;
        let size = self.get_size_from_data(&original_data)?;
        let volume = limits.validate_dimensions(size.x, size.y, size.z)?;
        match type_version {
            0 => {
                let data = original_data.data;
                let Compound(root) = data else {
                    return Err(SchematicError::InvalidFormat("Root is not a Compound"));
                };
                let block_state_map = root.get_list("blockstatemap")?;
                let state_list = root.get_i32_array("statelist")?;
                limits.validate_exact_len(
                    "Building Gadgets state list",
                    state_list.len(),
                    volume,
                )?;
                let palette = self.parse_palette(&block_state_map, limits)?;
                let height = size.y;
                let width = size.x;
                let length = size.z;
                let mut counter = 0;

                for z in 0..length {
                    for y in 0..height {
                        for x in 0..width {
                            let raw_state =
                                *state_list
                                    .get(counter)
                                    .ok_or(SchematicError::InvalidFormat(
                                        "Building Gadgets state list ended early",
                                    ))?;
                            let block_state_lookup = usize::try_from(raw_state).map_err(|_| {
                                SchematicError::InvalidFormat(
                                    "Building Gadgets palette index is negative",
                                )
                            })?;
                            counter += 1;
                            let block_state = palette.get(block_state_lookup).ok_or(
                                SchematicError::InvalidFormat(
                                    "Building Gadgets palette index out of bounds",
                                ),
                            )?;
                            if limits.should_retain_block(block_state) {
                                limits.push_block(&mut block_list, x, y, z, block_state)?;
                            }
                        }
                    }
                }
                volume
            }
            1 => {
                let data = original_data.data;
                let Compound(root) = data else {
                    return Err(SchematicError::InvalidFormat("Root is not a Compound"));
                };
                let position_count = root.get_list("pos")?.len();
                limits.validate_len_at_most(
                    "Building Gadgets positions",
                    position_count,
                    volume,
                )?;
                let mut block_list_test = deserialize_with_limits(root, limits)?;
                if !limits.retain_air_blocks {
                    block_list_test
                        .elements
                        .retain(|entry| limits.should_retain_block(&entry.block));
                }
                block_list.merge(block_list_test);
                position_count
            }
            2 => {
                let data = original_data.data;
                let Compound(root) = data else {
                    return Err(SchematicError::InvalidFormat("Root is not a Compound"));
                };
                let start_pos = root.get_pos_t2("startPos")?;
                let blocks = root.get_i32_array("stateIntArray")?;
                let block_state_map = root.get_list("mapIntState")?;
                let pos_int_array = root.get_i32_array("posIntArray")?;
                limits.validate_len_at_most(
                    "Building Gadgets state array",
                    blocks.len(),
                    volume,
                )?;
                limits.validate_exact_len(
                    "Building Gadgets position array",
                    pos_int_array.len(),
                    blocks.len(),
                )?;
                limits.validate_palette_len(block_state_map.len())?;
                let mut palette: Vec<Option<Arc<BlockData>>> = vec![None; block_state_map.len()];
                for (index, pos_raw) in blocks.iter().zip(pos_int_array.iter()) {
                    let abs_pos = int_to_rel_pos(start_pos, *pos_raw);
                    let rel_pos = BlockPos {
                        x: abs_pos.x.checked_sub(start_pos.x).ok_or(
                            SchematicError::InvalidFormat("Building Gadgets x coordinate overflow"),
                        )?,
                        y: abs_pos.y.checked_sub(start_pos.y).ok_or(
                            SchematicError::InvalidFormat("Building Gadgets y coordinate overflow"),
                        )?,
                        z: abs_pos.z.checked_sub(start_pos.z).ok_or(
                            SchematicError::InvalidFormat("Building Gadgets z coordinate overflow"),
                        )?,
                    };

                    let state_index = index
                        .checked_sub(1)
                        .and_then(|value| usize::try_from(value).ok())
                        .ok_or(SchematicError::InvalidFormat(
                            "Building Gadgets state index must be positive",
                        ))?;
                    if let Some(Some(block)) = palette.get(state_index) {
                        limits.push_block(
                            &mut block_list,
                            rel_pos.x,
                            rel_pos.y,
                            rel_pos.z,
                            block,
                        )?;
                        continue;
                    }
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
                    let block = Arc::new(BlockData {
                        id: BlockId { name },
                        properties,
                    });
                    if limits.should_retain_block(&block) {
                        limits.push_block(
                            &mut block_list,
                            rel_pos.x,
                            rel_pos.y,
                            rel_pos.z,
                            &block,
                        )?;
                    }
                    palette[state_index] = Some(block);
                }
                blocks.len()
            }
            _ => 0,
        };
        limits.validate_block_count(
            "Building Gadgets retained blocks",
            block_list.elements.len(),
        )?;
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

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::Compression;
    use flate2::write::GzEncoder;
    use std::io::Write;

    const TAG_END: u8 = 0;
    const TAG_BYTE: u8 = 1;
    const TAG_LIST: u8 = 9;
    const TAG_COMPOUND: u8 = 10;

    fn type_one_schematic(raw_nbt: &[u8]) -> BgSchematic<'static> {
        let mut encoder = GzEncoder::new(Vec::new(), Compression::fast());
        encoder.write_all(raw_nbt).unwrap();
        let body = base64::engine::general_purpose::STANDARD.encode(encoder.finish().unwrap());
        let json = serde_json::json!({ "body": body }).to_string();
        BgSchematic::new_from_data(json.into_bytes()).unwrap()
    }

    fn nested_compounds(levels: usize) -> Vec<u8> {
        let mut raw = vec![TAG_COMPOUND, 0, 0];
        for _ in 0..levels {
            raw.extend_from_slice(&[TAG_COMPOUND, 0, 0]);
        }
        raw.extend(std::iter::repeat_n(TAG_END, levels + 1));
        raw
    }

    #[test]
    fn type_one_rejects_embedded_nbt_deeper_than_configured_limit() {
        let schematic = type_one_schematic(&nested_compounds(4));
        let limits = ParseLimits {
            max_nbt_depth: 3,
            ..ParseLimits::default()
        };

        let error = schematic
            .decode_schematic_with_limits(&limits)
            .expect_err("deep embedded NBT must fail preflight");
        assert!(matches!(error, SchematicError::LimitExceeded(_)));
    }

    #[test]
    fn type_one_rejects_oversized_declared_list_before_deserialization() {
        let mut raw = vec![TAG_COMPOUND, 0, 0, TAG_LIST, 0, 1, b'x', TAG_BYTE];
        raw.extend_from_slice(&101_i32.to_be_bytes());
        let schematic = type_one_schematic(&raw);
        let limits = ParseLimits {
            max_nbt_sequence_len: 100,
            ..ParseLimits::default()
        };

        let error = schematic
            .decode_schematic_with_limits(&limits)
            .expect_err("oversized embedded List must fail before fastnbt");
        assert!(matches!(error, SchematicError::LimitExceeded(_)));
    }
}
