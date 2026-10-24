use crate::create::{create_schematic::CreateSchematic, to_create_schematic::ToCreateSchematic};
use crate::litematica::{lm_schematic::LmSchematic, to_lm_schematic::ToLmSchematic};
use crate::utils::block_state_pos_list::{BlockData, BlockId, BlockPos, BlockStatePosList};
use crate::utils::entities::{Entities, EntitiesList};
use crate::utils::schematic_data::{SchematicData, Size};
use crate::utils::schematic_editing::{entity_position, is_air};
use crate::utils::tile_entities::{TileEntities, TileEntitiesList};
use crate::word_edit::{to_we_schematic::ToWeSchematic, we_schematic::WeSchematic};
use fastnbt::Value;
use std::collections::HashMap;
use std::sync::Arc;

fn fixture() -> SchematicData {
    let mut blocks = BlockStatePosList::default();
    let pos = BlockPos {
        x: -4,
        y: 64,
        z: -2,
    };
    blocks.add(
        pos,
        Arc::new(BlockData {
            id: BlockId {
                name: "minecraft:chest".into(),
            },
            properties: [("facing".into(), "north".into())].into(),
        }),
    );
    let tiles = TileEntitiesList {
        original_type: 2,
        elements: vec![TileEntities {
            pos,
            nbt: Value::Compound(HashMap::from([
                ("id".into(), Value::String("minecraft:chest".into())),
                ("x".into(), Value::Int(-4)),
                ("y".into(), Value::Int(64)),
                ("z".into(), Value::Int(-2)),
                (
                    "CustomName".into(),
                    Value::String("keep-container-payload".into()),
                ),
            ])),
        }],
    };
    let entities = EntitiesList {
        original_type: 2,
        elements: vec![Entities {
            nbt: Value::Compound(HashMap::from([
                ("id".into(), Value::String("minecraft:pig".into())),
                (
                    "Pos".into(),
                    Value::List(vec![
                        Value::Double(-3.75),
                        Value::Double(64.5),
                        Value::Double(-1.5),
                    ]),
                ),
                (
                    "CustomName".into(),
                    Value::String("keep-entity-payload".into()),
                ),
            ])),
        }],
    };
    SchematicData::new(
        blocks,
        tiles,
        entities,
        Size {
            width: 4,
            height: 3,
            length: 5,
        },
    )
}
fn verify(data: &SchematicData) {
    assert_eq!(
        data.size,
        Size {
            width: 4,
            height: 3,
            length: 5
        }
    );
    let visible: Vec<_> = data
        .blocks
        .elements
        .iter()
        .filter(|b| !is_air(b.block.id.name.as_ref()))
        .collect();
    assert_eq!(visible.len(), 1);
    assert_eq!(visible[0].pos, BlockPos { x: 0, y: 0, z: 0 });
    assert_eq!(
        visible[0].block.properties.get("facing").unwrap().as_ref(),
        "north"
    );
    assert_eq!(data.tile_entities_list.elements.len(), 1);
    assert_eq!(
        data.tile_entities_list.elements[0].pos,
        BlockPos { x: 0, y: 0, z: 0 }
    );
    assert_eq!(data.entities_list.elements.len(), 1);
    assert_eq!(
        entity_position(&data.entities_list.elements[0].nbt),
        Some([0.25, 0.5, 0.5])
    );
    let texts = format!(
        "{:?} {:?}",
        data.tile_entities_list.elements[0].nbt, data.entities_list.elements[0].nbt
    );
    assert!(texts.contains("keep-container-payload") && texts.contains("keep-entity-payload"));
}
fn lm_roundtrip(data: &SchematicData) -> SchematicData {
    let value = ToLmSchematic::new(data)
        .unwrap()
        .lm_schematic_for_data_version(6, 3465);
    let bytes = gzip(&value);
    LmSchematic::new_from_bytes(bytes)
        .unwrap()
        .get_blocks_pos()
        .unwrap()
}
fn gzip(value: &Value) -> Vec<u8> {
    let mut writer = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
    fastnbt::to_writer(&mut writer, value).unwrap();
    writer.finish().unwrap()
}
#[test]
fn litematica_keeps_dimensions_and_rebases_entities_without_an_air_border() {
    verify(&lm_roundtrip(&fixture()));
}
#[test]
fn sponge_v2_and_v3_preserve_entities_and_convert_back_to_litematica() {
    for subtype in [0, 1] {
        let value = ToWeSchematic::new(&fixture())
            .unwrap()
            .we_schematic_for_data_version(subtype, 3465)
            .unwrap();
        if subtype == 1 {
            let Value::Compound(root) = &value else {
                panic!()
            };
            let Value::Compound(schematic) = &root["Schematic"] else {
                panic!()
            };
            let Value::Compound(blocks) = &schematic["Blocks"] else {
                panic!()
            };
            assert!(blocks.contains_key("Data") && !blocks.contains_key("BlockData"));
        }
        let bytes = gzip(&value);
        let parsed = WeSchematic::new_from_bytes(bytes)
            .unwrap()
            .get_blocks_pos()
            .unwrap();
        verify(&parsed);
        verify(&lm_roundtrip(&parsed));
        let structure = ToCreateSchematic::new(&parsed)
            .unwrap()
            .create_schematic_for_data_version(false, 3465);
        // Vanilla structures use a gzip wrapper and pos/blockPos/nbt entities.
        let mut gzip = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
        fastnbt::to_writer(&mut gzip, &structure).unwrap();
        let create = CreateSchematic::new_from_bytes(gzip.finish().unwrap())
            .unwrap()
            .get_blocks_pos()
            .unwrap();
        verify(&create);
        verify(&lm_roundtrip(&create));
    }
}
#[test]
fn unsafe_export_bounds_and_entity_positions_are_errors_not_silent_loss() {
    let mut data = fixture();
    data.size = Size {
        width: 2000,
        height: 2000,
        length: 2000,
    };
    assert!(ToLmSchematic::new(&data).is_err());
    assert!(ToWeSchematic::new(&data).is_err());
    let mut data = fixture();
    data.entities_list.elements[0].nbt = Value::Compound(HashMap::from([(
        "id".into(),
        Value::String("minecraft:pig".into()),
    )]));
    assert!(ToLmSchematic::new(&data).is_err());
    assert!(ToWeSchematic::new(&data).is_err());
    assert!(ToCreateSchematic::new(&data).is_err());
}

#[test]
fn sponge_entities_and_wrapped_tile_payloads_roundtrip_through_legacy_export() {
    let source = fixture();
    let sponge = ToWeSchematic::new(&source)
        .unwrap()
        .we_schematic_for_data_version(1, 3465)
        .unwrap();
    let parsed = WeSchematic::new_from_bytes(gzip(&sponge))
        .unwrap()
        .get_blocks_pos()
        .unwrap();
    for target in [5, 1343] {
        let options = crate::utils::blueprint_export::ExportOptions {
            format: 6,
            subtype: -1,
            target_data_version: Some(target),
            overrides: Vec::new(),
            include_air: false,
        };
        let bytes = crate::utils::blueprint_export::encode(&parsed, &options, Some(3465)).unwrap();
        let result =
            crate::mcedit::mcedit_schematic::McEditSchematic::new_from_bytes(bytes).unwrap();
        let Value::Compound(root) = &result.nbt else {
            panic!()
        };
        let Value::List(entities) = &root["Entities"] else {
            panic!()
        };
        let Value::Compound(entity) = &entities[0] else {
            panic!()
        };
        assert_eq!(
            entity.get("id"),
            Some(&Value::String(
                if target == 5 { "Pig" } else { "minecraft:pig" }.into()
            ))
        );
        assert!(!entity.contains_key("Data"));
        let Value::List(tiles) = &root["TileEntities"] else {
            panic!()
        };
        let Value::Compound(tile) = &tiles[0] else {
            panic!()
        };
        assert_eq!(
            tile.get("id"),
            Some(&Value::String(
                if target == 5 {
                    "Chest"
                } else {
                    "minecraft:chest"
                }
                .into()
            ))
        );
        assert!(!tile.contains_key("Data"));
        verify(&result.get_blocks_pos().unwrap());
    }
}
