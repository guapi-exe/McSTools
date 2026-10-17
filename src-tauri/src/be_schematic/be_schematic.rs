use std::collections::{BTreeMap, HashMap};
use std::fs::File;
use std::io::Read;
use std::sync::Arc;

use fastnbt::Value;
use fastnbt::Value::Compound;

use crate::be_schematic::bedrock_map::bedrock_map;
use crate::be_schematic::le_reader::read_nbt_le::load_nbt_le;
use crate::utils::block_state_pos_list::{BlockData, BlockId, BlockPos, BlockStatePosList};
use crate::utils::entities::EntitiesList;
use crate::utils::extend_value::NbtExt;
use crate::utils::schematic_data::{SchematicData, SchematicError, Size};
use crate::utils::tile_entities::TileEntitiesList;

#[derive(Debug)]
pub struct BESchematic {
    pub nbt: Value,
}

impl BESchematic {
    /// 从文件构造
    pub fn new(file_path: &str) -> Result<Self, SchematicError> {
        let mut file = File::open(file_path)?;
        let mut buf = Vec::new();
        file.read_to_end(&mut buf)?;
        Self::new_from_bytes(buf)
    }

    /// 从字节数组构造
    pub fn new_from_bytes(data: Vec<u8>) -> Result<Self, SchematicError> {
        let nbt = load_nbt_le(&data[..])?;
        let value = Compound(nbt);

        if matches!(value, Compound(_)) {
            Ok(Self { nbt: value })
        } else {
            Err(SchematicError::InvalidFormat("Root is not a Compound"))
        }
    }

    /// 获取格式版本
    pub fn get_format_version(&self) -> Result<i32, SchematicError> {
        let Compound(root) = &self.nbt else {
            return Err(SchematicError::InvalidFormat("Root is not a Compound"));
        };
        root.get_i32("format_version")
    }

    /// 获取结构尺寸
    pub fn get_size(&self) -> Result<Size, SchematicError> {
        let Compound(root) = &self.nbt else {
            return Err(SchematicError::InvalidFormat("Root is not a Compound"));
        };

        let value = root
            .get("size")
            .ok_or(SchematicError::InvalidFormat("Missing size"))?;
        let dims =
            numeric_array(value).ok_or(SchematicError::InvalidFormat("size must be 3 ints"))?;
        if dims.len() != 3 {
            return Err(SchematicError::InvalidFormat("size must be 3 ints"));
        }

        if dims.iter().any(|dimension| *dimension <= 0) {
            return Err(SchematicError::InvalidFormat(
                "size dimensions must be positive",
            ));
        }

        Ok(Size {
            width: dims[0],
            height: dims[1],
            length: dims[2],
        })
    }

    /// 获取结构 Compound
    pub fn get_structure(&self) -> Result<&HashMap<String, Value>, SchematicError> {
        let Compound(root) = &self.nbt else {
            return Err(SchematicError::InvalidFormat("Root is not a Compound"));
        };
        let Compound(structure) = root
            .get("structure")
            .ok_or(SchematicError::InvalidFormat("Missing structure field"))?
        else {
            return Err(SchematicError::InvalidFormat("structure must be Compound"));
        };
        Ok(structure)
    }

    /// 解析 Palette
    pub fn parse_block_palette(
        &self,
        structure: &HashMap<String, Value>,
    ) -> Result<Vec<Arc<BlockData>>, SchematicError> {
        let Value::Compound(palette_comp) = structure
            .get("palette")
            .ok_or(SchematicError::InvalidFormat("Missing palette"))?
        else {
            return Err(SchematicError::InvalidFormat("palette must be a Compound"));
        };

        let Value::Compound(default_comp) = palette_comp
            .get("default")
            .ok_or(SchematicError::InvalidFormat("Missing default palette"))?
        else {
            return Err(SchematicError::InvalidFormat(
                "default palette must be a Compound",
            ));
        };

        let Value::List(palette_list) = default_comp
            .get("block_palette")
            .ok_or(SchematicError::InvalidFormat("Missing block_palette"))?
        else {
            return Err(SchematicError::InvalidFormat(
                "block_palette must be a List",
            ));
        };

        let mut palette = Vec::with_capacity(palette_list.len());
        for entry in palette_list {
            let block = Self::parse_palette_entry(entry)?;
            palette.push(Arc::new(block));
        }
        Ok(palette)
    }

    /// 解析单个 Palette entry
    fn parse_palette_entry(value: &Value) -> Result<BlockData, SchematicError> {
        let Compound(root) = value else {
            return Err(SchematicError::InvalidFormat(
                "block_palette entry must be Compound",
            ));
        };

        let name = root
            .get("name")
            .and_then(Value::as_str)
            .map(|name| {
                if name.contains(':') {
                    Arc::<str>::from(name)
                } else {
                    Arc::<str>::from(format!("minecraft:{name}"))
                }
            })
            .unwrap_or_else(|| Arc::from("minecraft:air"));

        let properties = Self::parse_block_states(root.get("states"));

        let bedrock_block = BlockData {
            id: BlockId { name },
            properties,
        };

        // .mcstructure stores Bedrock block states. Map them to Java block
        // states before they enter the unified SchematicData model.
        Ok(bedrock_map()
            .to_java(&bedrock_block)
            .map(|block| (*block).clone())
            .unwrap_or(bedrock_block))
    }

    /// 解析 Block states
    fn parse_block_states(states_value: Option<&Value>) -> BTreeMap<Arc<str>, Arc<str>> {
        let mut properties = BTreeMap::new();

        if let Some(Compound(prop_map)) = states_value {
            for (k, v) in prop_map {
                let value = match v {
                    Value::String(s) => s.clone(),
                    Value::Byte(b) => b.to_string(),
                    Value::Short(n) => n.to_string(),
                    Value::Int(n) => n.to_string(),
                    Value::Long(n) => n.to_string(),
                    Value::Float(n) => n.to_string(),
                    Value::Double(n) => n.to_string(),
                    // A few Bedrock producers encode boolean-like states as
                    // an unsigned byte, but preserving the numeric spelling
                    // here lets the B2J table match age_bit=0/1 exactly.
                    _ => continue,
                };
                properties.insert(
                    Arc::<str>::from(k.as_str()),
                    Arc::<str>::from(value.as_str()),
                );
            }
        }
        properties
    }

    /// 解析 block_indices，生成 SchematicData
    pub fn get_blocks_pos(&self) -> Result<SchematicData, SchematicError> {
        let structure = self.get_structure()?;

        let size = self.get_size()?;
        let palette = self.parse_block_palette(structure)?;

        let block_indices_value = structure
            .get("block_indices")
            .ok_or(SchematicError::InvalidFormat("Missing block_indices"))?;
        let block_indices = match block_indices_value {
            Value::List(layers) => layers,
            // A few non-vanilla writers emit a single IntArray when the
            // secondary layer is omitted. Treat it as the primary layer.
            Value::IntArray(_) | Value::LongArray(_) => std::slice::from_ref(block_indices_value),
            _ => {
                return Err(SchematicError::InvalidFormat(
                    "block_indices must be a List or IntArray",
                ));
            }
        };

        let mut block_list = BlockStatePosList::default();

        let Some(layer0) = block_indices.first() else {
            return Err(SchematicError::InvalidFormat(
                "block_indices must contain a primary layer",
            ));
        };
        self.parse_block_layer(layer0, &palette, &size, &mut block_list)?;

        // 副层（水覆盖）。Layer 1 uses the same palette and may contain
        // -1 for positions without a liquid block. Java stores waterlogged
        // blocks as one state, so merge a water overlay into the primary
        // block when that state exposes a `waterlogged` property.
        if let Some(layer1) = block_indices.get(1) {
            let mut liquid_blocks = BlockStatePosList::default();
            self.parse_block_layer(layer1, &palette, &size, &mut liquid_blocks)?;

            let mut position_index = HashMap::new();
            for (index, block) in block_list.elements.iter().enumerate() {
                position_index.insert((block.pos.x, block.pos.y, block.pos.z), index);
            }
            for block in liquid_blocks.elements {
                // Some Bedrock writers use palette[air] instead of -1 for an
                // empty secondary-layer slot. It must not erase a primary
                // block or manufacture an air entry in the Java model.
                if is_air_block(&block.block) {
                    continue;
                }
                let key = (block.pos.x, block.pos.y, block.pos.z);
                if let Some(index) = position_index.get(&key).copied() {
                    if is_water_block(&block.block) {
                        if is_air_block(&block_list.elements[index].block) {
                            // An air primary plus a water secondary is a
                            // normal full water block, not a waterlogged air
                            // block.
                            block_list.elements[index] = block;
                        } else if !is_bubble_column(&block_list.elements[index].block)
                            && supports_waterlogged(&block_list.elements[index].block)
                        {
                            block_list.elements[index].block =
                                with_waterlogged(&block_list.elements[index].block);
                        }
                    }
                } else if is_water_block(&block.block) {
                    // A -1 primary entry can still have a valid secondary
                    // water entry. Preserve it as the only block at the
                    // coordinate; unsupported secondary states (including
                    // bubble_column) are ignored because Bedrock only uses
                    // the secondary layer for water overlays.
                    position_index.insert(key, block_list.elements.len());
                    block_list.elements.push_back(block);
                }
            }
        }

        let tile_entities = self.parse_block_position_data(structure, &size)?;
        let entities = structure
            .get("entities")
            .and_then(|value| match value {
                Value::List(entries) if !entries.is_empty() => Some(entries.as_slice()),
                _ => None,
            })
            .map(|entries| EntitiesList::from_nbt(entries, 5))
            .transpose()?
            .unwrap_or_default();
        Ok(SchematicData::new(
            block_list,
            tile_entities,
            entities,
            size,
        ))
    }

    fn parse_block_layer(
        &self,
        layer: &Value,
        palette: &[Arc<BlockData>],
        size: &Size,
        block_list: &mut BlockStatePosList,
    ) -> Result<(), SchematicError> {
        let expected_len = (size.width as u128)
            .checked_mul(size.height as u128)
            .and_then(|value| value.checked_mul(size.length as u128))
            .and_then(|value| usize::try_from(value).ok())
            .ok_or(SchematicError::InvalidFormat(
                "block_indices dimensions are too large",
            ))?;
        let layer_values = numeric_array(layer).ok_or(SchematicError::InvalidFormat(
            "block_indices layer must contain ints",
        ))?;
        if layer_values.len() != expected_len {
            return Err(SchematicError::InvalidFormat(
                "block_indices layer length does not match size",
            ));
        }

        for (i, state_id) in layer_values.into_iter().enumerate() {
            if state_id >= 0 {
                let pos = Self::index_to_pos(i as i64, size);
                let block_data =
                    palette
                        .get(state_id as usize)
                        .ok_or(SchematicError::InvalidFormat(
                            "Invalid state_id in block_indices",
                        ))?;
                block_list.add(pos, Arc::clone(block_data));
            }
        }
        Ok(())
    }

    fn parse_block_position_data(
        &self,
        structure: &HashMap<String, Value>,
        size: &Size,
    ) -> Result<TileEntitiesList, SchematicError> {
        let position_data = structure.get("block_position_data").or_else(|| {
            structure
                .get("palette")
                .and_then(|value| match value {
                    Value::Compound(palette) => palette.get("default"),
                    _ => None,
                })
                .and_then(|value| match value {
                    Value::Compound(default) => default.get("block_position_data"),
                    _ => None,
                })
        });

        let Some(Value::Compound(entries)) = position_data else {
            return Ok(TileEntitiesList::default());
        };

        let volume = (size.width as i64)
            .checked_mul(size.height as i64)
            .and_then(|value| value.checked_mul(size.length as i64))
            .ok_or(SchematicError::InvalidFormat(
                "block_position_data dimensions are too large",
            ))?;
        let mut ordered = entries
            .iter()
            .filter_map(|(key, value)| {
                let index = key.parse::<i64>().ok()?;
                Some((index, value))
            })
            .collect::<Vec<_>>();
        ordered.sort_by_key(|(index, _)| *index);

        let mut result = TileEntitiesList {
            original_type: 5,
            elements: Vec::new(),
        };
        for (index, value) in ordered {
            if !(0..volume).contains(&index) {
                return Err(SchematicError::InvalidFormat(
                    "block_position_data index is outside structure bounds",
                ));
            }
            let Value::Compound(entry) = value else {
                continue;
            };
            let nbt = entry
                .get("block_entity_data")
                .cloned()
                .or_else(|| entry.get("nbt").cloned())
                .or_else(|| {
                    entry
                        .contains_key("id")
                        .then(|| Value::Compound(entry.clone()))
                });
            let Some(nbt) = nbt else {
                continue;
            };
            result
                .elements
                .push(crate::utils::tile_entities::TileEntities {
                    pos: Self::index_to_pos(index, size),
                    nbt,
                });
        }
        Ok(result)
    }

    /// 一维索引 -> 三维坐标
    fn index_to_pos(index: i64, size: &Size) -> BlockPos {
        let length = i64::from(size.length);
        let height = i64::from(size.height);
        let z = index % length;
        let y = (index / length) % height;
        let x = index / (length * height);
        BlockPos {
            x: x as i32,
            y: y as i32,
            z: z as i32,
        }
    }
}

fn numeric_value(value: &Value) -> Option<i32> {
    match value {
        Value::Byte(number) => Some(i32::from(*number)),
        Value::Short(number) => Some(i32::from(*number)),
        Value::Int(number) => Some(*number),
        Value::Long(number) => i32::try_from(*number).ok(),
        _ => None,
    }
}

fn is_air_block(block: &BlockData) -> bool {
    matches!(
        block.id.name.as_ref(),
        "minecraft:air" | "minecraft:cave_air" | "minecraft:void_air"
    )
}

fn is_water_block(block: &BlockData) -> bool {
    matches!(
        block.id.name.as_ref(),
        "minecraft:water" | "minecraft:flowing_water"
    )
}

fn is_bubble_column(block: &BlockData) -> bool {
    block.id.name.as_ref() == "minecraft:bubble_column"
}

fn supports_waterlogged(block: &BlockData) -> bool {
    block.properties.contains_key("waterlogged")
        || bedrock_map().java_supports_property(block.id.name.as_ref(), "waterlogged")
}

fn with_waterlogged(block: &Arc<BlockData>) -> Arc<BlockData> {
    if block
        .properties
        .get("waterlogged")
        .is_some_and(|value| value.as_ref() == "true")
    {
        return Arc::clone(block);
    }

    let mut waterlogged = (**block).clone();
    waterlogged
        .properties
        .insert(Arc::from("waterlogged"), Arc::from("true"));
    Arc::new(waterlogged)
}

fn numeric_array(value: &Value) -> Option<Vec<i32>> {
    match value {
        Value::List(values) => values.iter().map(numeric_value).collect(),
        Value::IntArray(values) => Some(values.to_vec()),
        Value::LongArray(values) => values
            .iter()
            .map(|number| i32::try_from(*number).ok())
            .collect(),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::be_schematic::to_be_schematic::ToBESchematic;

    #[test]
    fn parses_and_reencodes_bundled_mcstructure_fixture() {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/schematic/33bf0e6b-b613-4ec2-9082-34fb3a16c617.mcstructure"
        );
        let bytes = std::fs::read(path).expect("bundled mcstructure fixture");
        let source = BESchematic::new_from_bytes(bytes).expect("read mcstructure fixture");
        let data = source.get_blocks_pos().expect("decode mcstructure fixture");

        assert!(data.size.width > 0);
        assert!(data.size.height > 0);
        assert!(data.size.length > 0);
        assert!(!data.blocks.elements.is_empty());

        let encoded = ToBESchematic::new(&data)
            .expect("build mcstructure writer")
            .to_be_value()
            .expect("encode mcstructure fixture");
        let Some(Value::Compound(structure)) = encoded.get("structure") else {
            panic!("encoded structure should be a compound");
        };
        let Some(Value::List(block_indices)) = structure.get("block_indices") else {
            panic!("encoded block_indices should be a list");
        };
        assert_eq!(block_indices.len(), 2);
    }

    #[test]
    fn lets_liquid_layer_fill_primary_air_but_not_solid_blocks() {
        fn palette_entry(name: &str, states: &[(&str, Value)]) -> Value {
            let mut entry = HashMap::new();
            entry.insert("name".to_string(), Value::String(name.to_string()));
            if !states.is_empty() {
                entry.insert(
                    "states".to_string(),
                    Value::Compound(
                        states
                            .iter()
                            .map(|(key, value)| ((*key).to_string(), value.clone()))
                            .collect(),
                    ),
                );
            }
            Value::Compound(entry)
        }

        let block_palette = Value::List(vec![
            palette_entry("minecraft:air", &[]),
            palette_entry("minecraft:water", &[("liquid_depth", Value::Int(0))]),
            palette_entry(
                "minecraft:stone",
                &[("stone_type", Value::String("stone".into()))],
            ),
            palette_entry(
                "minecraft:oak_stairs",
                &[
                    ("upside_down_bit", Value::Byte(0)),
                    ("weirdo_direction", Value::Int(3)),
                ],
            ),
            palette_entry("minecraft:bubble_column", &[("drag_down", Value::Byte(1))]),
            palette_entry("minecraft:lava", &[("liquid_depth", Value::Int(0))]),
            palette_entry("minecraft:structure_void", &[]),
        ]);
        let default_palette = Value::Compound(
            [("block_palette".to_string(), block_palette)]
                .into_iter()
                .collect(),
        );
        let palette = Value::Compound(
            [("default".to_string(), default_palette)]
                .into_iter()
                .collect(),
        );
        let air_over_water = Value::List(vec![
            Value::List(vec![Value::Int(0)]),
            Value::List(vec![Value::Int(1)]),
        ]);
        let stone_over_water = Value::List(vec![
            Value::List(vec![Value::Int(2)]),
            Value::List(vec![Value::Int(1)]),
        ]);
        let stairs_over_water = Value::List(vec![
            Value::List(vec![Value::Int(3)]),
            Value::List(vec![Value::Int(1)]),
        ]);
        let air_over_bubble_column = Value::List(vec![
            Value::List(vec![Value::Int(0)]),
            Value::List(vec![Value::Int(4)]),
        ]);
        let bubble_column_over_water = Value::List(vec![
            Value::List(vec![Value::Int(4)]),
            Value::List(vec![Value::Int(1)]),
        ]);
        let water_over_water = Value::List(vec![
            Value::List(vec![Value::Int(1)]),
            Value::List(vec![Value::Int(1)]),
        ]);
        let lava_over_water = Value::List(vec![
            Value::List(vec![Value::Int(5)]),
            Value::List(vec![Value::Int(1)]),
        ]);
        let structure_void_over_water = Value::List(vec![
            Value::List(vec![Value::Int(6)]),
            Value::List(vec![Value::Int(1)]),
        ]);

        for (indices, expected_name, expected_waterlogged, expected_drag) in [
            (air_over_water, "minecraft:water", false, false),
            (stone_over_water, "minecraft:stone", false, false),
            (stairs_over_water, "minecraft:oak_stairs", true, false),
            (air_over_bubble_column, "minecraft:air", false, false),
            (
                bubble_column_over_water,
                "minecraft:bubble_column",
                false,
                true,
            ),
            (water_over_water, "minecraft:water", false, false),
            (lava_over_water, "minecraft:lava", false, false),
            (
                structure_void_over_water,
                "minecraft:structure_void",
                false,
                false,
            ),
        ] {
            let structure = Value::Compound(
                [
                    ("palette".to_string(), palette.clone()),
                    ("block_indices".to_string(), indices),
                ]
                .into_iter()
                .collect(),
            );
            let root = [
                (
                    "size".to_string(),
                    Value::List(vec![Value::Int(1), Value::Int(1), Value::Int(1)]),
                ),
                ("structure".to_string(), structure),
            ]
            .into_iter()
            .collect();
            let data = BESchematic {
                nbt: Compound(root),
            }
            .get_blocks_pos()
            .expect("parse layer fixture");
            let block = &data.blocks.elements[0].block;
            assert_eq!(block.id.name.as_ref(), expected_name);
            assert_eq!(
                block.properties.get("waterlogged").map(AsRef::as_ref),
                expected_waterlogged.then_some("true")
            );
            assert_eq!(
                block.properties.get("drag").map(AsRef::as_ref),
                expected_drag.then_some("true")
            );
        }
    }

    #[test]
    fn ignores_secondary_bubble_columns_without_manufacturing_a_block() {
        fn palette_entry(name: &str) -> Value {
            Value::Compound(
                [("name".to_string(), Value::String(name.to_string()))]
                    .into_iter()
                    .collect(),
            )
        }

        let palette = Value::Compound(
            [(
                "default".to_string(),
                Value::Compound(
                    [(
                        "block_palette".to_string(),
                        Value::List(vec![
                            palette_entry("minecraft:air"),
                            palette_entry("minecraft:bubble_column"),
                        ]),
                    )]
                    .into_iter()
                    .collect(),
                ),
            )]
            .into_iter()
            .collect(),
        );
        let structure = Value::Compound(
            [
                ("palette".to_string(), palette),
                (
                    "block_indices".to_string(),
                    Value::List(vec![
                        Value::List(vec![Value::Int(-1), Value::Int(0)]),
                        Value::List(vec![Value::Int(1), Value::Int(1)]),
                    ]),
                ),
            ]
            .into_iter()
            .collect(),
        );
        let root = [
            (
                "size".to_string(),
                Value::List(vec![Value::Int(2), Value::Int(1), Value::Int(1)]),
            ),
            ("structure".to_string(), structure),
        ]
        .into_iter()
        .collect();

        let data = BESchematic {
            nbt: Compound(root),
        }
        .get_blocks_pos()
        .expect("parse bubble layer fixture");

        assert_eq!(data.blocks.elements.len(), 1);
        assert_eq!(data.blocks.elements[0].pos, BlockPos { x: 1, y: 0, z: 0 });
        assert_eq!(
            data.blocks.elements[0].block.id.name.as_ref(),
            "minecraft:air"
        );
    }

    #[test]
    fn preserves_water_from_secondary_layer_when_primary_is_empty() {
        fn palette_entry(name: &str) -> Value {
            Value::Compound(
                [("name".to_string(), Value::String(name.to_string()))]
                    .into_iter()
                    .collect(),
            )
        }

        let palette = Value::Compound(
            [(
                "default".to_string(),
                Value::Compound(
                    [(
                        "block_palette".to_string(),
                        Value::List(vec![palette_entry("minecraft:water")]),
                    )]
                    .into_iter()
                    .collect(),
                ),
            )]
            .into_iter()
            .collect(),
        );
        let structure = Value::Compound(
            [
                ("palette".to_string(), palette),
                (
                    "block_indices".to_string(),
                    Value::List(vec![
                        Value::List(vec![Value::Int(-1)]),
                        Value::List(vec![Value::Int(0)]),
                    ]),
                ),
            ]
            .into_iter()
            .collect(),
        );
        let root = [
            (
                "size".to_string(),
                Value::List(vec![Value::Int(1), Value::Int(1), Value::Int(1)]),
            ),
            ("structure".to_string(), structure),
        ]
        .into_iter()
        .collect();

        let data = BESchematic {
            nbt: Compound(root),
        }
        .get_blocks_pos()
        .expect("parse secondary water fixture");

        assert_eq!(data.blocks.elements.len(), 1);
        assert_eq!(
            data.blocks.elements[0].block.id.name.as_ref(),
            "minecraft:water"
        );
    }

    #[test]
    fn keeps_an_empty_structure_empty_instead_of_inserting_air() {
        let palette = Value::Compound(
            [(
                "default".to_string(),
                Value::Compound(
                    [(
                        "block_palette".to_string(),
                        Value::List(vec![Value::Compound(
                            [(
                                "name".to_string(),
                                Value::String("minecraft:air".to_string()),
                            )]
                            .into_iter()
                            .collect(),
                        )]),
                    )]
                    .into_iter()
                    .collect(),
                ),
            )]
            .into_iter()
            .collect(),
        );
        let structure = Value::Compound(
            [
                ("palette".to_string(), palette),
                (
                    "block_indices".to_string(),
                    Value::List(vec![
                        Value::List(vec![Value::Int(-1)]),
                        Value::List(vec![Value::Int(-1)]),
                    ]),
                ),
            ]
            .into_iter()
            .collect(),
        );
        let root = [
            (
                "size".to_string(),
                Value::List(vec![Value::Int(1), Value::Int(1), Value::Int(1)]),
            ),
            ("structure".to_string(), structure),
        ]
        .into_iter()
        .collect();

        let data = BESchematic {
            nbt: Compound(root),
        }
        .get_blocks_pos()
        .expect("parse empty structure");

        assert!(data.blocks.elements.is_empty());
    }

    #[test]
    fn ignores_non_water_secondary_states_instead_of_replacing_primary_blocks() {
        fn palette_entry(name: &str) -> Value {
            Value::Compound(
                [("name".to_string(), Value::String(name.to_string()))]
                    .into_iter()
                    .collect(),
            )
        }

        let palette = Value::Compound(
            [(
                "default".to_string(),
                Value::Compound(
                    [(
                        "block_palette".to_string(),
                        Value::List(vec![
                            palette_entry("minecraft:air"),
                            palette_entry("minecraft:stone"),
                            palette_entry("minecraft:lava"),
                        ]),
                    )]
                    .into_iter()
                    .collect(),
                ),
            )]
            .into_iter()
            .collect(),
        );
        let structure = Value::Compound(
            [
                ("palette".to_string(), palette),
                (
                    "block_indices".to_string(),
                    Value::List(vec![
                        Value::List(vec![Value::Int(0), Value::Int(1)]),
                        Value::List(vec![Value::Int(2), Value::Int(2)]),
                    ]),
                ),
            ]
            .into_iter()
            .collect(),
        );
        let root = [
            (
                "size".to_string(),
                Value::List(vec![Value::Int(2), Value::Int(1), Value::Int(1)]),
            ),
            ("structure".to_string(), structure),
        ]
        .into_iter()
        .collect();

        let data = BESchematic {
            nbt: Compound(root),
        }
        .get_blocks_pos()
        .expect("parse unsupported secondary states");
        let block_at = |x| {
            data.blocks
                .elements
                .iter()
                .find(|block| block.pos == BlockPos { x, y: 0, z: 0 })
                .expect("decoded block")
        };
        assert_eq!(block_at(0).block.id.name.as_ref(), "minecraft:air");
        assert_eq!(block_at(1).block.id.name.as_ref(), "minecraft:stone");
    }

    #[test]
    fn reads_block_position_data_and_numeric_array_layers() {
        fn palette_entry(name: &str) -> Value {
            Value::Compound(
                [("name".to_string(), Value::String(name.to_string()))]
                    .into_iter()
                    .collect(),
            )
        }

        let palette = Value::Compound(
            [(
                "default".to_string(),
                Value::Compound(
                    [(
                        "block_palette".to_string(),
                        Value::List(vec![palette_entry("minecraft:air")]),
                    )]
                    .into_iter()
                    .collect(),
                ),
            )]
            .into_iter()
            .collect(),
        );
        let block_entity = Value::Compound(
            [(
                "block_entity_data".to_string(),
                Value::Compound(
                    [
                        ("id".to_string(), Value::String("Chest".to_string())),
                        ("CustomName".to_string(), Value::String("test".to_string())),
                    ]
                    .into_iter()
                    .collect(),
                ),
            )]
            .into_iter()
            .collect(),
        );
        let structure = Value::Compound(
            [
                ("palette".to_string(), palette),
                (
                    "block_indices".to_string(),
                    Value::IntArray(fastnbt::IntArray::new(vec![0])),
                ),
                (
                    "block_position_data".to_string(),
                    Value::Compound([("0".to_string(), block_entity)].into_iter().collect()),
                ),
            ]
            .into_iter()
            .collect(),
        );
        let root = [
            (
                "size".to_string(),
                Value::IntArray(fastnbt::IntArray::new(vec![1, 1, 1])),
            ),
            ("structure".to_string(), structure),
        ]
        .into_iter()
        .collect();

        let data = BESchematic {
            nbt: Compound(root),
        }
        .get_blocks_pos()
        .expect("parse numeric-array BE fixture");
        assert_eq!(data.tile_entities_list.elements.len(), 1);
        assert_eq!(
            data.tile_entities_list.elements[0].pos,
            BlockPos { x: 0, y: 0, z: 0 }
        );

        let encoded = ToBESchematic::new(&data)
            .expect("build BE writer")
            .to_be_value()
            .expect("encode BE fixture");
        let Value::Compound(structure) = encoded.get("structure").expect("structure") else {
            panic!("expected structure compound");
        };
        let Value::Compound(palette) = structure.get("palette").expect("palette") else {
            panic!("expected palette compound");
        };
        let Value::Compound(default) = palette.get("default").expect("default palette") else {
            panic!("expected default palette compound");
        };
        let Value::Compound(position_data) = default
            .get("block_position_data")
            .expect("block position data")
        else {
            panic!("expected block position data compound");
        };
        assert!(position_data.contains_key("0"));
    }
}
