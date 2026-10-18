use crate::mcedit::legacy_map::{MAX_LEGACY_DIMENSION, MAX_LEGACY_ID, MAX_LEGACY_VOLUME, codec};
use crate::utils::block_state_pos_list::{BlockPos, BlockStatePos};
use crate::utils::entities::EntitiesList;
use crate::utils::schematic_data::{SchematicData, SchematicError};
use crate::utils::tile_entities::TileEntitiesList;
use fastnbt::Value;
use fastnbt::Value::Compound;
use std::collections::{HashMap, VecDeque};

/// Writer for the legacy MCEdit `.schematic` format.
///
/// The writer always emits a full cuboid (unset positions become
/// `minecraft:air` = id 0 / data 0) and packs legacy ids above 255 into the
/// optional `AddBlocks` byte array.
#[derive(Debug)]
pub struct ToMcEditSchematic {
    blocks: VecDeque<BlockStatePos>,
    pub start_pos: BlockPos,
    pub end_pos: BlockPos,
    pub width: i32,
    pub height: i32,
    pub length: i32,
    pub tile_entities: TileEntitiesList,
    pub entities: EntitiesList,
}

impl ToMcEditSchematic {
    pub fn new(schematic: &SchematicData) -> Result<Self, SchematicError> {
        let blocks = schematic.blocks.elements.clone();
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

        let source_size = schematic.size;
        let has_source_size =
            source_size.width > 0 && source_size.height > 0 && source_size.length > 0;
        let use_zero_origin = has_source_size
            && min.x >= 0
            && min.y >= 0
            && min.z >= 0
            && max.x < source_size.width
            && max.y < source_size.height
            && max.z < source_size.length;
        let min = if use_zero_origin {
            BlockPos { x: 0, y: 0, z: 0 }
        } else {
            min
        };
        // A schematic's block list may be sparse (for example after air was
        // filtered out by an importer). Prefer the source selection size so
        // empty borders are retained, but expand it if an inconsistent source
        // position falls outside that selection.
        let size_max = if has_source_size {
            Some(BlockPos {
                x: min
                    .x
                    .checked_add(source_size.width - 1)
                    .ok_or(SchematicError::InvalidFormat("schematic width overflow"))?,
                y: min
                    .y
                    .checked_add(source_size.height - 1)
                    .ok_or(SchematicError::InvalidFormat("schematic height overflow"))?,
                z: min
                    .z
                    .checked_add(source_size.length - 1)
                    .ok_or(SchematicError::InvalidFormat("schematic length overflow"))?,
            })
        } else {
            None
        };
        let max = size_max.map_or(max, |size_max| BlockPos {
            x: max.x.max(size_max.x),
            y: max.y.max(size_max.y),
            z: max.z.max(size_max.z),
        });

        let width = max
            .x
            .checked_sub(min.x)
            .and_then(|value| value.checked_add(1))
            .ok_or(SchematicError::InvalidFormat("schematic width overflow"))?;
        let height = max
            .y
            .checked_sub(min.y)
            .and_then(|value| value.checked_add(1))
            .ok_or(SchematicError::InvalidFormat("schematic height overflow"))?;
        let length = max
            .z
            .checked_sub(min.z)
            .and_then(|value| value.checked_add(1))
            .ok_or(SchematicError::InvalidFormat("schematic length overflow"))?;

        if [width, height, length]
            .into_iter()
            .any(|dimension| !(1..=MAX_LEGACY_DIMENSION).contains(&dimension))
        {
            return Err(SchematicError::InvalidFormat(
                "legacy schematic dimensions must fit signed 16-bit values",
            ));
        }

        let volume = i64::from(width)
            .checked_mul(i64::from(height))
            .and_then(|value| value.checked_mul(i64::from(length)))
            .ok_or(SchematicError::InvalidFormat("schematic volume overflow"))?;
        if volume > MAX_LEGACY_VOLUME {
            return Err(SchematicError::InvalidFormat(
                "legacy schematic volume exceeds the supported safety limit",
            ));
        }

        let mut tile_entities = schematic.tile_entities_list.clone();
        for tile in &mut tile_entities.elements {
            if tile.pos.x < min.x || tile.pos.x > max.x || tile.pos.y < min.y || tile.pos.y > max.y || tile.pos.z < min.z || tile.pos.z > max.z {
                return Err(SchematicError::InvalidFormat("tile entity lies outside export bounds"));
            }
            let (mut id, mut payload) = crate::utils::java_entities::java_entity_data(&tile.nbt, tile_entities.original_type)?;
            // Existing callers may already have selected a pre-1.11 entity
            // palette (Sign/Chest/etc). Preserve that explicit spelling;
            // the shared versioned exporter handles its own target spelling.
            if let Compound(root) = &tile.nbt {
                if let Some(Value::String(original)) = root.get("id") {
                    if !original.contains(':') { id = original.clone(); }
                }
            }
            payload.remove("Pos");
            payload.insert("id".into(), Value::String(id));
            tile.nbt = Compound(payload);
        }
        tile_entities.original_type = 2;
        Ok(Self {
            blocks,
            start_pos: min,
            end_pos: max,
            width,
            height,
            length,
            tile_entities,
            entities: crate::utils::java_entities::local_java_entities(&schematic.entities_list, [min.x, min.y, min.z])?,
        })
    }

    pub fn mcedit_schematic(&self) -> Result<Value, SchematicError> {
        let volume = i64::from(self.width)
            .checked_mul(i64::from(self.height))
            .and_then(|value| value.checked_mul(i64::from(self.length)))
            .and_then(|value| usize::try_from(value).ok())
            .ok_or(SchematicError::InvalidFormat("schematic volume overflow"))?;
        if volume as i64 > MAX_LEGACY_VOLUME {
            return Err(SchematicError::InvalidFormat(
                "legacy schematic volume exceeds the supported safety limit",
            ));
        }

        let mut blocks = vec![0i8; volume];
        let mut data = vec![0i8; volume];
        let mut add_blocks = vec![0i8; volume.div_ceil(2)];
        let mut max_legacy_id = 0u32;

        for block_pos in &self.blocks {
            if block_pos.pos.x < self.start_pos.x
                || block_pos.pos.x > self.end_pos.x
                || block_pos.pos.y < self.start_pos.y
                || block_pos.pos.y > self.end_pos.y
                || block_pos.pos.z < self.start_pos.z
                || block_pos.pos.z > self.end_pos.z
            {
                return Err(SchematicError::InvalidFormat(
                    "block position outside schematic bounds",
                ));
            }

            let dx = block_pos.pos.x - self.start_pos.x;
            let dy = block_pos.pos.y - self.start_pos.y;
            let dz = block_pos.pos.z - self.start_pos.z;
            let index = (i64::from(dy) * i64::from(self.length) + i64::from(dz))
                * i64::from(self.width)
                + i64::from(dx);
            let index = usize::try_from(index)
                .map_err(|_| SchematicError::InvalidFormat("block index overflow"))?;

            let block = block_pos.block.as_ref();
            let (legacy_id, meta) = codec().encode(block).ok_or_else(|| {
                SchematicError::MissingField(format!("legacy id mapping for {}", block.id.name))
            })?;

            if index >= volume {
                return Err(SchematicError::InvalidFormat(
                    "block position outside schematic bounds",
                ));
            }
            if legacy_id > MAX_LEGACY_ID {
                return Err(SchematicError::InvalidFormat(
                    "legacy block id exceeds the AddBlocks 12-bit range",
                ));
            }

            blocks[index] = (legacy_id & 0xFF) as i8;
            data[index] = (meta & 0x0F) as i8;
            max_legacy_id = max_legacy_id.max(legacy_id);

            if legacy_id > 255 {
                let high_nibble = ((legacy_id >> 8) & 0x0F) as u8;
                if index & 1 == 0 {
                    add_blocks[index >> 1] |= high_nibble as i8;
                } else {
                    add_blocks[index >> 1] |= ((high_nibble << 4) & 0xF0) as i8;
                }
            }
        }

        let mut tag = HashMap::new();
        tag.insert("Width".to_string(), Value::Short(self.width as i16));
        tag.insert("Height".to_string(), Value::Short(self.height as i16));
        tag.insert("Length".to_string(), Value::Short(self.length as i16));
        tag.insert("Materials".to_string(), Value::String("Alpha".to_string()));
        tag.insert(
            "Blocks".to_string(),
            Value::ByteArray(fastnbt::ByteArray::new(blocks)),
        );
        tag.insert(
            "Data".to_string(),
            Value::ByteArray(fastnbt::ByteArray::new(data)),
        );
        if max_legacy_id > 255 {
            tag.insert(
                "AddBlocks".to_string(),
                Value::ByteArray(fastnbt::ByteArray::new(add_blocks)),
            );
        }
        tag.insert(
            "Entities".to_string(),
            Value::List(self.build_entities_list()),
        );
        tag.insert(
            "TileEntities".to_string(),
            Value::List(self.build_tile_entities_list()),
        );
        // WorldEdit understands these optional origin tags. They retain the
        // source coordinate when a litematic region was not based at (0, 0, 0)
        // while block array coordinates remain normalized to the schematic.
        tag.insert("WEOriginX".to_string(), Value::Int(self.start_pos.x));
        tag.insert("WEOriginY".to_string(), Value::Int(self.start_pos.y));
        tag.insert("WEOriginZ".to_string(), Value::Int(self.start_pos.z));

        Ok(Compound(tag))
    }

    fn build_tile_entities_list(&self) -> Vec<Value> {
        self.tile_entities
            .elements
            .iter()
            .map(|te| {
                let nx = te.pos.x - self.start_pos.x;
                let ny = te.pos.y - self.start_pos.y;
                let nz = te.pos.z - self.start_pos.z;

                match &te.nbt {
                    Compound(map) => {
                        let mut new_map = map.clone();
                        new_map.insert("x".to_string(), Value::Int(nx));
                        new_map.insert("y".to_string(), Value::Int(ny));
                        new_map.insert("z".to_string(), Value::Int(nz));
                        Compound(new_map)
                    }
                    other => {
                        let mut new_map = HashMap::new();
                        new_map.insert("x".to_string(), Value::Int(nx));
                        new_map.insert("y".to_string(), Value::Int(ny));
                        new_map.insert("z".to_string(), Value::Int(nz));
                        new_map.insert("nbt".to_string(), other.clone());
                        Compound(new_map)
                    }
                }
            })
            .collect()
    }

    fn build_entities_list(&self) -> Vec<Value> {
        self.entities
            .elements
            .iter()
            .map(|e| e.nbt.clone())
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::litematica::lm_schematic::LmSchematic;
    use crate::mcedit::legacy_map::normalize_schematic_for_legacy;
    use crate::mcedit::mcedit_schematic::McEditSchematic;
    use crate::utils::block_state_pos_list::{BlockData, BlockId, BlockStatePosList};
    use crate::utils::entities::{Entities, EntitiesList};
    use crate::utils::schematic_data::Size;
    use crate::utils::tile_entities::TileEntitiesList;
    use std::collections::BTreeMap;
    use std::collections::HashMap;
    use std::sync::Arc;

    fn synthetic_nbt() -> Value {
        let mut root = HashMap::new();
        root.insert("Width".to_string(), Value::Short(2));
        root.insert("Height".to_string(), Value::Short(1));
        root.insert("Length".to_string(), Value::Short(2));
        root.insert("Materials".to_string(), Value::String("Alpha".to_string()));
        // Index order is (y * length + z) * width + x:
        // [0]=(0,0,0) id 1, [1]=(1,0,0) id 2,
        // [2]=(0,0,1) id 35 data 14, [3]=(1,0,1) id 0 air.
        root.insert(
            "Blocks".to_string(),
            Value::ByteArray(fastnbt::ByteArray::new(vec![1, 2, 35, 0])),
        );
        root.insert(
            "Data".to_string(),
            Value::ByteArray(fastnbt::ByteArray::new(vec![0, 0, 14, 0])),
        );
        root.insert("Entities".to_string(), Value::List(vec![]));
        root.insert("TileEntities".to_string(), Value::List(vec![]));
        Compound(root)
    }

    #[test]
    fn round_trips_mcedit_schematic() {
        let reader = McEditSchematic {
            nbt: synthetic_nbt(),
        };
        let data = reader.get_blocks_pos().expect("read legacy schematic");

        assert_eq!(data.size.width, 2);
        assert_eq!(data.size.height, 1);
        assert_eq!(data.size.length, 2);
        assert_eq!(data.blocks.elements.len(), 4);

        assert_eq!(data.blocks.elements[0].pos.x, 0);
        assert_eq!(
            data.blocks.elements[0].block.id.name.as_ref(),
            "minecraft:stone"
        );
        assert_eq!(data.blocks.elements[1].pos.x, 1);
        assert_eq!(
            data.blocks.elements[1].block.id.name.as_ref(),
            "minecraft:grass_block"
        );
        assert_eq!(data.blocks.elements[2].pos.z, 1);
        assert_eq!(
            data.blocks.elements[2].block.id.name.as_ref(),
            "minecraft:red_wool"
        );
        assert_eq!(
            data.blocks.elements[3].block.id.name.as_ref(),
            "minecraft:air"
        );

        let writer = ToMcEditSchematic::new(&data).expect("build legacy writer");
        let out = writer.mcedit_schematic().expect("write legacy schematic");

        let round_tripped = McEditSchematic { nbt: out }
            .get_blocks_pos()
            .expect("read round-tripped schematic");
        assert_eq!(round_tripped.blocks.elements, data.blocks.elements);
    }

    #[test]
    fn writes_modern_states_as_legacy_1_7_10_schematic() {
        let mut blocks = BlockStatePosList::default();
        blocks.add_by_pos(
            0,
            0,
            0,
            Arc::new(BlockData {
                id: BlockId {
                    name: Arc::<str>::from("minecraft:oak_log"),
                },
                properties: [(Arc::<str>::from("axis"), Arc::<str>::from("y"))]
                    .into_iter()
                    .collect(),
            }),
        );
        blocks.add_by_pos(
            1,
            0,
            0,
            Arc::new(BlockData {
                id: BlockId {
                    name: Arc::<str>::from("minecraft:deepslate"),
                },
                properties: BTreeMap::new(),
            }),
        );

        let source = SchematicData::new(
            blocks,
            TileEntitiesList::new(),
            EntitiesList::new(),
            Size {
                width: 2,
                height: 1,
                length: 1,
            },
        );
        let legacy = normalize_schematic_for_legacy("1.7.10", &source).unwrap();
        let output = ToMcEditSchematic::new(&legacy)
            .unwrap()
            .mcedit_schematic()
            .unwrap();
        let root = match output {
            Compound(root) => root,
            _ => panic!("expected compound"),
        };
        let blocks = root.get("Blocks").and_then(|value| match value {
            Value::ByteArray(data) => Some(data.to_vec()),
            _ => None,
        });
        assert_eq!(blocks, Some(vec![17, 1]));
    }

    #[test]
    fn packs_and_round_trips_add_blocks_high_nibbles() {
        let custom = |id: u32| {
            Arc::new(BlockData {
                id: BlockId {
                    name: Arc::<str>::from(format!("legacy:{id}")),
                },
                properties: BTreeMap::new(),
            })
        };
        let mut blocks = BlockStatePosList::default();
        blocks.add_by_pos(0, 0, 0, custom(0x123));
        blocks.add_by_pos(1, 0, 0, custom(0xABC));
        let source = SchematicData::new(
            blocks,
            TileEntitiesList::new(),
            EntitiesList::new(),
            Size {
                width: 2,
                height: 1,
                length: 1,
            },
        );

        let root = match ToMcEditSchematic::new(&source)
            .unwrap()
            .mcedit_schematic()
            .unwrap()
        {
            Compound(root) => root,
            _ => panic!("expected compound"),
        };
        assert_eq!(
            root.get("AddBlocks"),
            Some(&Value::ByteArray(fastnbt::ByteArray::new(vec![
                0xA1_u8 as i8
            ])))
        );

        let round_tripped = McEditSchematic {
            nbt: Compound(root),
        }
        .get_blocks_pos()
        .unwrap();
        assert_eq!(
            round_tripped.blocks.elements[0].block.id.name.as_ref(),
            "legacy:291"
        );
        assert_eq!(
            round_tripped.blocks.elements[1].block.id.name.as_ref(),
            "legacy:2748"
        );
    }

    #[test]
    fn rejects_oversized_legacy_dimensions_and_volume() {
        let make_data = |positions: &[(i32, i32, i32)]| {
            let mut blocks = BlockStatePosList::default();
            for &(x, y, z) in positions {
                blocks.add_by_pos(
                    x,
                    y,
                    z,
                    Arc::new(BlockData {
                        id: BlockId {
                            name: Arc::<str>::from("minecraft:stone"),
                        },
                        properties: BTreeMap::new(),
                    }),
                );
            }
            SchematicData::new(
                blocks,
                TileEntitiesList::new(),
                EntitiesList::new(),
                Size {
                    width: 1,
                    height: 1,
                    length: 1,
                },
            )
        };

        assert!(ToMcEditSchematic::new(&make_data(&[(0, 0, 0), (32767, 0, 0)])).is_err());
        assert!(ToMcEditSchematic::new(&make_data(&[(0, 0, 0), (255, 255, 1024)])).is_err());
    }

    #[test]
    fn preserves_sparse_selection_size_and_origin() {
        let mut blocks = BlockStatePosList::default();
        blocks.add_by_pos(
            2,
            1,
            1,
            Arc::new(BlockData {
                id: BlockId {
                    name: Arc::<str>::from("minecraft:stone"),
                },
                properties: BTreeMap::new(),
            }),
        );
        let source = SchematicData::new(
            blocks,
            TileEntitiesList::new(),
            EntitiesList::new(),
            Size {
                width: 3,
                height: 2,
                length: 2,
            },
        );

        let writer = ToMcEditSchematic::new(&source).unwrap();
        assert_eq!((writer.width, writer.height, writer.length), (3, 2, 2));
        let root = match writer.mcedit_schematic().unwrap() {
            Compound(root) => root,
            _ => panic!("expected compound"),
        };
        assert_eq!(root.get("WEOriginX"), Some(&Value::Int(0)));
        assert_eq!(root.get("WEOriginY"), Some(&Value::Int(0)));
        assert_eq!(root.get("WEOriginZ"), Some(&Value::Int(0)));

        let round_tripped = McEditSchematic {
            nbt: Compound(root),
        }
        .get_blocks_pos()
        .unwrap();
        assert_eq!(round_tripped.blocks.elements.len(), 12);
        let stone = round_tripped
            .blocks
            .elements
            .iter()
            .find(|block| block.block.id.name.as_ref() == "minecraft:stone")
            .expect("stone block in sparse selection");
        assert_eq!(stone.pos, BlockPos { x: 2, y: 1, z: 1 });
        assert_eq!(
            round_tripped.blocks.elements[0].block.id.name.as_ref(),
            "minecraft:air"
        );
    }

    #[test]
    fn writes_entity_positions_relative_to_legacy_origin() {
        let mut blocks = BlockStatePosList::default();
        blocks.add_by_pos(
            10,
            20,
            30,
            Arc::new(BlockData {
                id: BlockId {
                    name: Arc::<str>::from("minecraft:stone"),
                },
                properties: BTreeMap::new(),
            }),
        );

        let entity = Value::Compound(
            [
                (
                    "id".to_string(),
                    Value::String("minecraft:item".to_string()),
                ),
                (
                    "Pos".to_string(),
                    Value::List(vec![
                        Value::Double(10.5),
                        Value::Double(20.25),
                        Value::Double(30.75),
                    ]),
                ),
            ]
            .into_iter()
            .collect(),
        );
        let source = SchematicData::new(
            blocks,
            TileEntitiesList::new(),
            EntitiesList {
                original_type: 2,
                elements: vec![Entities { nbt: entity }],
            },
            Size {
                width: 1,
                height: 1,
                length: 1,
            },
        );

        let root = match ToMcEditSchematic::new(&source)
            .unwrap()
            .mcedit_schematic()
            .unwrap()
        {
            Compound(root) => root,
            _ => panic!("expected compound"),
        };
        let Value::List(entities) = root.get("Entities").expect("entities tag") else {
            panic!("expected entity list");
        };
        let Value::Compound(entity) = &entities[0] else {
            panic!("expected entity compound");
        };
        let Value::List(position) = entity.get("Pos").expect("entity position") else {
            panic!("expected position list");
        };
        assert_eq!(
            position,
            &vec![Value::Double(0.5), Value::Double(0.25), Value::Double(0.75),]
        );
    }

    #[test]
    fn writes_nested_passenger_and_leash_positions_relative_to_legacy_origin() {
        let mut blocks = BlockStatePosList::default();
        blocks.add_by_pos(
            10,
            20,
            30,
            Arc::new(BlockData {
                id: BlockId {
                    name: Arc::<str>::from("minecraft:stone"),
                },
                properties: BTreeMap::new(),
            }),
        );

        let passenger = Compound(
            [
                (
                    "id".to_string(),
                    Value::String("minecraft:item".to_string()),
                ),
                (
                    "Pos".to_string(),
                    Value::List(vec![
                        Value::Double(11.5),
                        Value::Double(20.25),
                        Value::Double(30.75),
                    ]),
                ),
            ]
            .into_iter()
            .collect(),
        );
        let entity = Compound(
            [
                (
                    "id".to_string(),
                    Value::String("minecraft:boat".to_string()),
                ),
                (
                    "Pos".to_string(),
                    Value::List(vec![
                        Value::Double(10.5),
                        Value::Double(20.25),
                        Value::Double(30.75),
                    ]),
                ),
                ("Passengers".to_string(), Value::List(vec![passenger])),
                (
                    "Leash".to_string(),
                    Compound(
                        [
                            ("X".to_string(), Value::Int(11)),
                            ("Y".to_string(), Value::Int(20)),
                            ("Z".to_string(), Value::Int(31)),
                        ]
                        .into_iter()
                        .collect(),
                    ),
                ),
            ]
            .into_iter()
            .collect(),
        );
        let source = SchematicData::new(
            blocks,
            TileEntitiesList::new(),
            EntitiesList {
                original_type: 2,
                elements: vec![Entities { nbt: entity }],
            },
            Size {
                width: 1,
                height: 1,
                length: 1,
            },
        );

        let root = match ToMcEditSchematic::new(&source)
            .unwrap()
            .mcedit_schematic()
            .unwrap()
        {
            Compound(root) => root,
            _ => panic!("expected compound"),
        };
        let Value::List(entities) = root.get("Entities").expect("entities tag") else {
            panic!("expected entity list");
        };
        let Value::Compound(entity) = &entities[0] else {
            panic!("expected entity compound");
        };
        let Value::List(position) = entity.get("Pos").expect("entity position") else {
            panic!("expected entity position list");
        };
        assert_eq!(position[0], Value::Double(0.5));

        let Value::List(passengers) = entity.get("Passengers").expect("passengers") else {
            panic!("expected passengers list");
        };
        let Value::Compound(passenger) = &passengers[0] else {
            panic!("expected passenger compound");
        };
        let Value::List(passenger_pos) = passenger.get("Pos").expect("passenger position") else {
            panic!("expected passenger position list");
        };
        assert_eq!(passenger_pos[0], Value::Double(1.5));

        let Value::Compound(leash) = entity.get("Leash").expect("leash") else {
            panic!("expected leash compound");
        };
        assert_eq!(leash.get("X"), Some(&Value::Int(1)));
        assert_eq!(leash.get("Y"), Some(&Value::Int(0)));
        assert_eq!(leash.get("Z"), Some(&Value::Int(1)));
    }

    #[test]
    fn converts_bundled_litematic_to_legacy_schematic() {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("schematic")
            .join("08baa20e-264d-41d4-8205-4611029936b0.litematic");
        let bytes = std::fs::read(path).expect("bundled litematic fixture");
        let source = LmSchematic::new_from_bytes(bytes).expect("read litematic fixture");
        let source_data = source.get_blocks_pos().expect("decode litematic fixture");
        let legacy_data = normalize_schematic_for_legacy("1.7.10", &source_data)
            .expect("normalize litematic blocks for legacy");
        let legacy_nbt = ToMcEditSchematic::new(&legacy_data)
            .expect("build legacy schematic")
            .mcedit_schematic()
            .expect("encode legacy schematic");
        let encoded = fastnbt::to_bytes_with_opts(
            &legacy_nbt,
            fastnbt::SerOpts::new().root_name("Schematic"),
        )
        .expect("serialize legacy schematic");
        let decoded = McEditSchematic::new_from_bytes(encoded)
            .expect("read encoded legacy schematic")
            .get_blocks_pos()
            .expect("decode encoded legacy schematic");

        assert_eq!(
            decoded.size,
            Size {
                width: ToMcEditSchematic::new(&legacy_data).unwrap().width,
                height: ToMcEditSchematic::new(&legacy_data).unwrap().height,
                length: ToMcEditSchematic::new(&legacy_data).unwrap().length,
            }
        );
        assert_eq!(
            decoded.blocks.elements.len() as i64,
            i64::from(decoded.size.width)
                * i64::from(decoded.size.height)
                * i64::from(decoded.size.length)
        );
        assert!(
            decoded
                .blocks
                .elements
                .iter()
                .all(|block| codec().encode(&block.block).is_some())
        );
        assert!(decoded.tile_entities_list.elements.iter().all(|entity| {
            match &entity.nbt {
                Value::Compound(map) => map
                    .get("id")
                    .and_then(Value::as_str)
                    .is_none_or(|id| !id.contains(':')),
                _ => false,
            }
        }));
    }

    #[test]
    fn converts_java_1_20_1_litematic_to_legacy_schematic() {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("schematic")
            .join("c7a8a121-f70e-48c3-80fd-394e6a70e123.litematic");
        let bytes = std::fs::read(path).expect("1.20.1 litematic fixture");
        let source = LmSchematic::new_from_bytes(bytes).expect("read 1.20.1 litematic");
        let source_data = source.get_blocks_pos().expect("decode 1.20.1 litematic");
        let legacy_data = normalize_schematic_for_legacy("1.7.10", &source_data)
            .expect("normalize 1.20.1 blocks for legacy");
        let output = ToMcEditSchematic::new(&legacy_data)
            .expect("build legacy 1.20.1 writer")
            .mcedit_schematic()
            .expect("encode legacy 1.20.1 schematic");

        let Value::Compound(root) = output else {
            panic!("expected schematic compound");
        };
        let Value::List(tile_entities) = root.get("TileEntities").expect("tile entities") else {
            panic!("expected tile entity list");
        };
        let sign = tile_entities
            .iter()
            .find_map(|value| match value {
                Value::Compound(map) if map.get("id").and_then(Value::as_str) == Some("Sign") => {
                    Some(map)
                }
                _ => None,
            })
            .expect("converted sign tile entity");
        assert!(sign.contains_key("Text1"));
        assert!(!sign.contains_key("front_text"));
        assert!(!sign.contains_key("back_text"));
        assert_eq!(root.get("Width"), Some(&Value::Short(16)));
        assert_eq!(root.get("Height"), Some(&Value::Short(33)));
        assert_eq!(root.get("Length"), Some(&Value::Short(20)));
    }
}
