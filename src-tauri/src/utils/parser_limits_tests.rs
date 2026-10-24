use crate::be_schematic::be_schematic::BESchematic;
use crate::building_gadges::bg_schematic::BgSchematic;
use crate::create::create_schematic::CreateSchematic;
use crate::litematica::lm_schematic::LmSchematic;
use crate::mcedit::mcedit_schematic::McEditSchematic;
use crate::utils::block_state_pos_list::{BlockData, BlockId, BlockStatePosList};
use crate::utils::blueprint_export::{ExportOptions, encode};
use crate::utils::parse_limits::ParseLimits;
use crate::utils::schematic_data::{SchematicData, SchematicError, Size};
use crate::word_edit::we_schematic::WeSchematic;
use std::sync::Arc;

fn parse(bytes: &[u8], format: i32, limits: &ParseLimits) -> Result<SchematicData, SchematicError> {
    match format {
        1 => CreateSchematic::new_from_bytes(bytes)?.get_blocks_pos_with_limits(limits),
        2 => LmSchematic::new_from_bytes(bytes)?.get_blocks_pos_with_limits(limits),
        3 => WeSchematic::new_from_bytes(bytes)?.get_blocks_pos_with_limits(limits),
        4 => BgSchematic::new_from_slice(bytes)?.get_blocks_pos_with_limits(limits),
        5 => BESchematic::new_from_bytes(bytes)?.get_blocks_pos_with_limits(limits),
        6 => McEditSchematic::new_from_bytes(bytes)?.get_blocks_pos_with_limits(limits),
        _ => unreachable!(),
    }
}

#[test]
fn six_formats_compact_air_share_states_and_enforce_retained_record_budget() {
    let mut blocks = BlockStatePosList::default();
    for (x, name) in [
        (0, "minecraft:air"),
        (1, "minecraft:stone"),
        (2, "minecraft:stone"),
    ] {
        blocks.add_by_pos(
            x,
            0,
            0,
            Arc::new(BlockData {
                id: BlockId {
                    name: Arc::from(name),
                },
                properties: Default::default(),
            }),
        );
    }
    let data = SchematicData::new(
        blocks,
        Default::default(),
        Default::default(),
        Size {
            width: 3,
            height: 1,
            length: 1,
        },
    );
    for (format, subtype) in [
        (1, -1),
        (2, 6),
        (3, 0),
        (3, 1),
        (4, 0),
        (4, 1),
        (4, 2),
        (5, -1),
        (6, -1),
    ] {
        let opts = ExportOptions {
            format,
            subtype,
            target_data_version: if format == 6 { Some(5) } else { None },
            overrides: vec![],
            include_air: format == 1,
        };
        let bytes = encode(&data, &opts, Some(3578)).unwrap();
        let limits = ParseLimits {
            max_blocks: 2,
            ..Default::default()
        };
        let parsed = parse(&bytes, format, &limits)
            .unwrap_or_else(|error| panic!("format={format}/{subtype}: {error}"));
        assert_eq!(parsed.size, data.size);
        assert_eq!(parsed.blocks.elements.len(), 2, "format={format}/{subtype}");
        assert!(
            parsed
                .blocks
                .elements
                .iter()
                .all(|block| block.block.id.name.as_ref() == "minecraft:stone")
        );
        assert!(Arc::ptr_eq(
            &parsed.blocks.elements[0].block,
            &parsed.blocks.elements[1].block
        ));
        let limits = ParseLimits {
            max_blocks: 1,
            ..Default::default()
        };
        assert!(
            parse(&bytes, format, &limits).is_err(),
            "format={format}/{subtype} must enforce retained limit"
        );
    }
}

#[test]
fn sparse_source_preview_and_dense_export_budgets_are_independent() {
    let size = Size {
        width: 1056,
        height: 297,
        length: 1252,
    };
    assert_eq!(
        ParseLimits::default()
            .validate_dimensions(size.width, size.height, size.length)
            .unwrap(),
        392_667_264
    );
    assert!(crate::modules::schematic::validate_preview_size(size).is_err());
    assert_eq!(
        crate::mcedit::legacy_map::MAX_LEGACY_VOLUME,
        64 * 1024 * 1024
    );
    assert!(
        ParseLimits::default()
            .validate_dimensions(4097, 1, 1)
            .is_err()
    );
    assert!(
        ParseLimits::default()
            .validate_dimensions(4096, 4096, 4096)
            .is_err()
    );
    assert!(
        ParseLimits::default()
            .validate_signed_dimensions(i32::MIN, 1, 1)
            .is_err()
    );
}
