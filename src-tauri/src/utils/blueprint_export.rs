//! Shared native encoder for editor copies, format conversion and toolbox jobs.
//! Format-only export never uses a guessed/default Java DataVersion.
use crate::be_schematic::{le_reader::write_nbt_le::save_nbt_le, to_be_schematic::ToBESchematic};
use crate::building_gadges::to_bg_schematic::ToBgSchematic;
use crate::create::to_create_schematic::ToCreateSchematic;
use crate::litematica::to_lm_schematic::ToLmSchematic;
use crate::mcedit::{legacy_map, to_mcedit_schematic::ToMcEditSchematic};
use crate::utils::minecraft_data::{
    java_block_states,
    versions_data::{GameVersionOption, VersionData},
};
use crate::utils::schematic_data::SchematicData;
use crate::utils::version_conversion::{self, VersionBlockOverride, VersionConversionPlan};
use crate::word_edit::to_we_schematic::ToWeSchematic;
use anyhow::{Context, Result, ensure};
use fastnbt::Value;
use flate2::{Compression, write::GzEncoder};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::io::Write;
use std::sync::Arc;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExportOptions {
    pub format: i32,
    pub subtype: i32,
    pub target_data_version: Option<i32>,
    #[serde(default)]
    pub overrides: Vec<VersionBlockOverride>,
    #[serde(default)]
    pub include_air: bool,
}

pub fn cache_subtype(options: &ExportOptions) -> i32 {
    if matches!(options.format, 3 | 4) {
        options.subtype
    } else {
        -1
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportFormat {
    pub id: i32,
    pub name: &'static str,
    pub extension: &'static str,
    pub subtypes: Vec<ExportSubtype>,
}
#[derive(Serialize)]
pub struct ExportSubtype {
    pub id: i32,
    pub name: String,
    pub versions: Vec<GameVersionOption>,
}
pub fn export_formats() -> Vec<ExportFormat> {
    let versions = VersionData::new();
    [
        (
            2,
            "Litematica",
            "litematic",
            vec![(6, "v6"), (7, "v7"), (5, "v5"), (4, "v4"), (3, "v3")],
        ),
        (
            3,
            "WorldEdit",
            "schem",
            vec![(0, "Sponge v2"), (1, "Sponge v3")],
        ),
        (6, "MCEdit", "schematic", vec![(-1, "MCEdit / Alpha")]),
        (1, "Create / Vanilla", "nbt", vec![(-1, "Java Structure")]),
        (
            4,
            "Building Gadgets",
            "json",
            vec![(0, "v1"), (1, "v2"), (2, "v3")],
        ),
        (5, "Bedrock", "mcstructure", vec![(-1, "BE Structure")]),
    ]
    .into_iter()
    .map(|(id, name, extension, subtypes)| ExportFormat {
        id,
        name,
        extension,
        subtypes: subtypes
            .into_iter()
            .map(|(subtype, name)| ExportSubtype {
                id: subtype,
                name: name.into(),
                versions: versions.game_versions_for_format(id, subtype),
            })
            .collect(),
    })
    .collect()
}

pub fn extension(format: i32) -> Result<&'static str> {
    Ok(match format {
        1 => "nbt",
        2 => "litematic",
        3 => "schem",
        4 => "json",
        5 => "mcstructure",
        6 => "schematic",
        _ => anyhow::bail!("unsupported export format"),
    })
}

pub fn validate(options: &ExportOptions, source_version: Option<i32>) -> Result<Option<i32>> {
    let allowed = match options.format {
        1 | 5 | 6 => options.subtype == -1,
        2 => (3..=7).contains(&options.subtype),
        3 => (0..=1).contains(&options.subtype),
        4 => (0..=2).contains(&options.subtype),
        _ => false,
    };
    ensure!(allowed, "unsupported export format/subtype");
    ensure!(
        options.overrides.len() <= 4096,
        "version replacement limit is 4096"
    );
    ensure!(
        !options.include_air || options.format == 1,
        "explicit air is only configurable for Java Structure"
    );
    if options.format == 5 {
        ensure!(
            options.target_data_version.is_none() && options.overrides.is_empty(),
            "Bedrock output does not accept Java version conversion"
        );
        return Ok(None);
    }
    if let Some(id) = options.target_data_version {
        version_conversion::target_version(options.format, options.subtype, id)?;
        return Ok(Some(id));
    }
    ensure!(
        options.overrides.is_empty(),
        "replacement rules require an explicit target Java version"
    );
    // BG has no Java DataVersion tag; a format-only BG export retains states
    // even when the source itself has no version information.
    if options.format == 4 {
        return Ok(source_version);
    }
    let id =
        source_version.context("source DataVersion is unknown; select a target Java version")?;
    if options.format == 6 {
        ensure!(
            legacy_map::legacy_version_for_data_version(id).is_some(),
            "MCEdit requires an explicit Minecraft 1.7.10–1.12.2 target for a modern source"
        );
    } else {
        let minimum = if options.format == 3 && options.subtype == 1 {
            5
        } else {
            1343
        };
        ensure!(
            id >= minimum,
            "source version is outside this format's supported range; select a target version"
        );
    }
    Ok(Some(id))
}

pub fn plan(
    data: &SchematicData,
    options: &ExportOptions,
    source_version: Option<i32>,
) -> Result<Option<VersionConversionPlan>> {
    validate(options, source_version)?;
    options
        .target_data_version
        .map(|id| version_conversion::plan(data, options.format, options.subtype, id))
        .transpose()
}

/// Keep the same fidelity warnings in single-file and batch exports.
pub fn warnings(data: &SchematicData, options: &ExportOptions, source_version: Option<i32>) -> Vec<String> {
    let mut warnings = Vec::new();
    if options.target_data_version.is_some() && options.target_data_version != source_version
        && (!data.tile_entities_list.elements.is_empty() || !data.entities_list.elements.is_empty()) {
        warnings.push("已转换方块 ID 和状态，但不是完整的 Minecraft DataFixer；跨版本容器物品、实体行为与模组 NBT 请在游戏中复核。".into());
    }
    if data.blocks.elements.iter().any(|b| !b.block.id.name.starts_with("minecraft:")) {
        warnings.push("命名调色板会保留模组 ID 和属性；目标游戏需要安装对应模组。旧版数字 .schematic 无法保留未知模组 ID。".into());
    }
    if options.format == 4 && (!data.entities_list.elements.is_empty() || !data.tile_entities_list.elements.is_empty()) {
        warnings.push("Building Gadgets 模板仅输出建筑方块，不包含普通实体和容器载荷。".into());
    }
    if options.format == 4 {
        warnings.push("Building Gadgets 模板按实际方块范围保存，选区周围的空白边界不会保留。".into());
    }
    if options.format == 5 {
        warnings.push("BE 使用独立含水层及状态映射，不应用 Java 游戏版本转换；跨版本实体 NBT 请在游戏中复核。".into());
    }
    warnings
}

/// Remove tile payloads whose block kind changed, unless an explicitly safe
/// inventory-schema migration is known. A stone replacement cannot keep chest NBT.
fn normalize(
    data: &SchematicData,
    target: &GameVersionOption,
    format: i32,
) -> Result<SchematicData> {
    let mut cache = HashMap::new();
    let tile_positions: HashSet<_> = data
        .tile_entities_list
        .elements
        .iter()
        .map(|tile| (tile.pos.x, tile.pos.y, tile.pos.z))
        .collect();
    let mut changed_tiles = HashMap::new();
    let blocks = data
        .blocks
        .elements
        .iter()
        .map(|record| {
            let source = record.block.as_ref();
            let mapped = match cache.get(source) {
                Some(block) => Arc::clone(block),
                None => {
                    ensure!(
                        format != 6 || source.id.name.starts_with("minecraft:"),
                        "MCEdit cannot preserve mod block {}; choose a replacement",
                        source.id.name
                    );
                    let block = java_block_states::normalize_block_for_java(&target.name, source)?;
                    cache.insert(source.clone(), block.clone());
                    block
                }
            };
            let pos = (record.pos.x, record.pos.y, record.pos.z);
            if mapped.id != source.id && tile_positions.contains(&pos) {
                changed_tiles.insert(pos, mapped.id.name.to_string());
            }
            Ok(crate::utils::block_state_pos_list::BlockStatePos {
                pos: record.pos,
                block: mapped,
            })
        })
        .collect::<Result<_>>()?;
    let mut tiles = data.tile_entities_list.clone();
    let tile_type = tiles.original_type;
    tiles.elements.retain_mut(|tile| {
        let Some(replacement) = changed_tiles.get(&(tile.pos.x, tile.pos.y, tile.pos.z)) else {
            return true;
        };
        if replacement == "minecraft:chest" {
            if let Ok((id, mut payload)) =
                crate::utils::java_entities::java_entity_data(&tile.nbt, tile_type)
            {
                if id == "minecraft:copper_chest" || id == "minecraft:chest" {
                    payload.insert("id".into(), Value::String("minecraft:chest".into()));
                    tile.nbt = Value::Compound(payload);
                    return true;
                }
            }
        }
        false
    });
    Ok(SchematicData::new(
        crate::utils::block_state_pos_list::BlockStatePosList { elements: blocks },
        tiles,
        data.entities_list.clone(),
        data.size,
    ))
}

pub fn encode(
    data: &SchematicData,
    options: &ExportOptions,
    source_version: Option<i32>,
) -> Result<Vec<u8>> {
    let data_version = validate(options, source_version)?;
    let normalized;
    let overridden;
    let data = if let Some(id) = options.target_data_version {
        let target = version_conversion::target_version(options.format, options.subtype, id)?;
        let source = if options.overrides.is_empty() {
            data
        } else {
            overridden = version_conversion::apply_overrides(data, &target, &options.overrides)?;
            &overridden
        };
        normalized = normalize(source, &target, options.format)?;
        &normalized
    } else {
        data
    };
    let value = match options.format {
        1 => ToCreateSchematic::new(data)?
            .create_schematic_for_data_version(options.include_air, data_version.unwrap()),
        2 => ToLmSchematic::new(data)?
            .lm_schematic_for_data_version(options.subtype, data_version.unwrap()),
        3 => ToWeSchematic::new(data)?
            .we_schematic_for_data_version(options.subtype, data_version.unwrap())?,
        4 => {
            return Ok(ToBgSchematic::new(data)?
                .bg_schematic(options.subtype)?
                .into_bytes());
        }
        5 => {
            let mut bytes = Vec::new();
            save_nbt_le(
                &mut bytes,
                "Schematic",
                &ToBESchematic::new(data)?.to_be_value()?,
            )?;
            return Ok(bytes);
        }
        6 => {
            let version = legacy_map::legacy_version_for_data_version(data_version.unwrap())
                .context("invalid legacy version")?;
            // The numeric writer rejects any unrepresentable state rather than
            // applying a hidden lossy normalization during format-only export.
            let mut value = ToMcEditSchematic::new(data)?.mcedit_schematic()?;
            if let Value::Compound(root) = &mut value {
                root.insert("MinecraftVersion".into(), Value::String(version.into()));
                // Namespaced entity IDs arrived in Java 1.11. The older
                // numeric containers still need the legacy ID spelling.
                if data_version.unwrap() < 819 {
                    if let Some(Value::List(tiles)) = root.get_mut("TileEntities") {
                        for tile in tiles {
                            *tile = legacy_map::normalize_tile_entity_nbt(tile)
                                .context("tile entity has no safe legacy representation")?;
                        }
                    }
                    if let Some(Value::List(entities)) = root.get_mut("Entities") {
                        for entity in entities {
                            legacy_entity_ids(entity, data_version.unwrap(), 0)?;
                        }
                    }
                } else if let Some(Value::List(tiles)) = root.get_mut("TileEntities") {
                    for tile in tiles {
                        let (id, mut payload) =
                            crate::utils::java_entities::java_entity_data(tile, 4)?;
                        payload.insert("id".into(), Value::String(id));
                        *tile = Value::Compound(payload);
                    }
                }
            }
            value
        }
        _ => unreachable!(),
    };
    let opts = if options.format == 6 {
        fastnbt::SerOpts::new().root_name("Schematic")
    } else {
        fastnbt::SerOpts::new()
    };
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(&fastnbt::to_bytes_with_opts(&value, opts)?)?;
    Ok(encoder.finish()?)
}

fn legacy_entity_ids(value: &mut Value, target_version: i32, depth: usize) -> Result<()> {
    ensure!(depth < 32, "entity nesting exceeds conversion limit");
    let Value::Compound(root) = value else {
        anyhow::bail!("entity must be a compound");
    };
    if let Some(Value::String(id)) = root.get_mut("id") {
        if matches!(
            id.as_str(),
            "minecraft:armor_stand"
                | "minecraft:endermite"
                | "minecraft:guardian"
                | "minecraft:rabbit"
        ) {
            ensure!(
                target_version >= 47,
                "entity {id} is unavailable before Minecraft 1.8"
            );
        }
        if id == "minecraft:polar_bear" {
            ensure!(target_version >= 512, "polar bears require Minecraft 1.10");
        }
        let legacy = match id.as_str() {
            "minecraft:pig" => "Pig",
            "minecraft:cow" => "Cow",
            "minecraft:sheep" => "Sheep",
            "minecraft:chicken" => "Chicken",
            "minecraft:wolf" => "Wolf",
            "minecraft:ocelot" => "Ozelot",
            "minecraft:horse" => "EntityHorse",
            "minecraft:bat" => "Bat",
            "minecraft:squid" => "Squid",
            "minecraft:rabbit" => "Rabbit",
            "minecraft:polar_bear" => "PolarBear",
            "minecraft:villager" => "Villager",
            "minecraft:iron_golem" => "VillagerGolem",
            "minecraft:snow_golem" => "SnowMan",
            "minecraft:mooshroom" => "MushroomCow",
            "minecraft:zombie" => "Zombie",
            "minecraft:skeleton" => "Skeleton",
            "minecraft:creeper" => "Creeper",
            "minecraft:spider" => "Spider",
            "minecraft:cave_spider" => "CaveSpider",
            "minecraft:enderman" => "Enderman",
            "minecraft:silverfish" => "Silverfish",
            "minecraft:endermite" => "Endermite",
            "minecraft:slime" => "Slime",
            "minecraft:magma_cube" => "LavaSlime",
            "minecraft:blaze" => "Blaze",
            "minecraft:ghast" => "Ghast",
            "minecraft:witch" => "Witch",
            "minecraft:wither" => "WitherBoss",
            "minecraft:ender_dragon" => "EnderDragon",
            "minecraft:guardian" => "Guardian",
            "minecraft:zombie_pigman" | "minecraft:zombified_piglin" => "PigZombie",
            "minecraft:item" => "Item",
            "minecraft:xp_orb" | "minecraft:experience_orb" => "XPOrb",
            "minecraft:armor_stand" => "ArmorStand",
            "minecraft:item_frame" => "ItemFrame",
            "minecraft:painting" => "Painting",
            "minecraft:boat" | "minecraft:oak_boat" => "Boat",
            "minecraft:minecart" => "MinecartRideable",
            "minecraft:chest_minecart" => "MinecartChest",
            "minecraft:furnace_minecart" => "MinecartFurnace",
            "minecraft:tnt_minecart" => "MinecartTNT",
            "minecraft:hopper_minecart" => "MinecartHopper",
            "minecraft:spawner_minecart" => "MinecartSpawner",
            "minecraft:arrow" => "Arrow",
            "minecraft:snowball" => "Snowball",
            "minecraft:egg" => "ThrownEgg",
            "minecraft:ender_pearl" => "ThrownEnderpearl",
            "minecraft:fireball" => "Fireball",
            "minecraft:small_fireball" => "SmallFireball",
            "minecraft:falling_block" => "FallingSand",
            "minecraft:tnt" => "PrimedTnt",
            _ => anyhow::bail!("entity {id} has no verified legacy ID mapping; use a newer target"),
        };
        *id = legacy.into();
    }
    if let Some(Value::List(passengers)) = root.get_mut("Passengers") {
        ensure!(
            target_version >= 184 || passengers.is_empty(),
            "modern passenger trees cannot be represented safely before Minecraft 1.9; use a newer target"
        );
        for passenger in passengers {
            legacy_entity_ids(passenger, target_version, depth + 1)?;
        }
    }
    if let Some(riding) = root.get_mut("Riding") {
        legacy_entity_ids(riding, target_version, depth + 1)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::litematica::lm_schematic::LmSchematic;
    use crate::utils::block_state_pos_list::{BlockData, BlockId, BlockPos, BlockStatePosList};
    use crate::utils::schematic_data::Size;
    use crate::utils::tile_entities::{TileEntities, TileEntitiesList};
    use crate::word_edit::we_schematic::WeSchematic;
    fn fixture(ids: &[&str]) -> SchematicData {
        let mut blocks = BlockStatePosList::default();
        for (x, id) in ids.iter().enumerate() {
            blocks.add_by_pos(
                x as i32,
                0,
                0,
                Arc::new(BlockData {
                    id: BlockId { name: (*id).into() },
                    properties: Default::default(),
                }),
            );
        }
        SchematicData::new(
            blocks,
            Default::default(),
            Default::default(),
            Size {
                width: ids.len() as i32 + 2,
                height: 2,
                length: 3,
            },
        )
    }
    fn options(format: i32, subtype: i32, target: Option<i32>) -> ExportOptions {
        ExportOptions {
            format,
            subtype,
            target_data_version: target,
            overrides: Vec::new(),
            include_air: false,
        }
    }
    #[test]
    fn format_only_preserves_exact_patch_data_version_and_unknown_palette() {
        let data = fixture(&["minecraft:pale_oak_planks", "example:custom_machine"]);
        for (format, subtype) in [(2, 6), (3, 0), (3, 1), (1, -1)] {
            let bytes = encode(&data, &options(format, subtype, None), Some(3578)).unwrap();
            let (parsed, version) = match format {
                2 => {
                    let p = LmSchematic::new_from_bytes(bytes).unwrap();
                    (p.get_blocks_pos().unwrap(), p.get_data_version().unwrap())
                }
                3 => {
                    let p = WeSchematic::new_from_bytes(bytes).unwrap();
                    (
                        p.get_blocks_pos().unwrap(),
                        p.get_data_version(subtype).unwrap(),
                    )
                }
                _ => {
                    let p = crate::create::create_schematic::CreateSchematic::new_from_bytes(bytes)
                        .unwrap();
                    (p.get_blocks_pos().unwrap(), p.get_data_version().unwrap())
                }
            };
            assert_eq!(version, 3578, "not the UI's representative 3465");
            assert_eq!(parsed.size, data.size);
            assert!(
                parsed
                    .blocks
                    .elements
                    .iter()
                    .any(|b| b.block.id.name.as_ref() == "minecraft:pale_oak_planks")
            );
            assert!(
                parsed
                    .blocks
                    .elements
                    .iter()
                    .any(|b| b.block.id.name.as_ref() == "example:custom_machine")
            );
        }
    }
    #[test]
    fn validates_versions_format_subtypes_and_bedrock_independence() {
        assert!(validate(&options(2, 6, None), None).is_err());
        assert!(validate(&options(6, -1, None), Some(3578)).is_err());
        assert!(validate(&options(2, 6, Some(5)), Some(3578)).is_err());
        assert!(validate(&options(3, 7, None), Some(3578)).is_err());
        assert!(validate(&options(5, -1, Some(3465)), Some(3578)).is_err());
        assert_eq!(validate(&options(5, -1, None), Some(3578)).unwrap(), None);
        assert!(validate(&options(4, 0, None), None).is_ok());
        assert!(validate(&options(6, -1, Some(5)), None).is_ok());
        for format in export_formats() {
            for subtype in format.subtypes {
                for version in subtype.versions {
                    assert!(
                        java_block_states::data_version(&version.name).is_some(),
                        "no table for {}",
                        version.name
                    );
                }
            }
        }
    }
    #[test]
    fn overrides_are_simultaneous_and_remove_changed_tile_payloads() {
        let mut data = fixture(&["minecraft:chest", "minecraft:stone"]);
        data.tile_entities_list = TileEntitiesList {
            original_type: 2,
            elements: vec![TileEntities {
                pos: BlockPos { x: 0, y: 0, z: 0 },
                nbt: Value::Compound(HashMap::from([(
                    "id".into(),
                    Value::String("minecraft:chest".into()),
                )])),
            }],
        };
        let mut opts = options(2, 6, Some(3465));
        opts.overrides = vec![
            VersionBlockOverride {
                source_id: "minecraft:chest".into(),
                replacement_id: "minecraft:stone".into(),
            },
            VersionBlockOverride {
                source_id: "minecraft:stone".into(),
                replacement_id: "minecraft:gold_block".into(),
            },
        ];
        let parsed = LmSchematic::new_from_bytes(encode(&data, &opts, Some(3578)).unwrap())
            .unwrap()
            .get_blocks_pos()
            .unwrap();
        assert_eq!(
            parsed
                .blocks
                .elements
                .iter()
                .find(|b| b.pos == BlockPos { x: 0, y: 0, z: 0 })
                .unwrap()
                .block
                .id
                .name
                .as_ref(),
            "minecraft:stone"
        );
        assert_eq!(
            parsed
                .blocks
                .elements
                .iter()
                .find(|b| b.pos == BlockPos { x: 1, y: 0, z: 0 })
                .unwrap()
                .block
                .id
                .name
                .as_ref(),
            "minecraft:gold_block"
        );
        assert!(parsed.tile_entities_list.elements.is_empty());
        assert_eq!(data.tile_entities_list.elements.len(), 1);
        opts.overrides.push(opts.overrides[0].clone());
        assert!(encode(&data, &opts, Some(3578)).is_err());
        opts.overrides.pop();
        opts.overrides[0].source_id = "minecraft:absent".into();
        assert!(encode(&data, &opts, Some(3578)).is_err());
        opts.overrides[0].source_id = "minecraft:chest".into();
        opts.overrides[0].replacement_id = "minecraft:pale_oak_planks".into();
        assert!(encode(&data, &opts, Some(3578)).is_err());
    }
    #[test]
    fn preview_and_export_agree_on_modern_fallbacks_mod_ids_and_errors() {
        let data = fixture(&[
            "minecraft:pale_oak_planks",
            "minecraft:oxidized_copper_golem_statue",
            "example:machine",
        ]);
        let opts = options(2, 6, Some(3465));
        let report = plan(&data, &opts, Some(4671)).unwrap().unwrap();
        assert_eq!(report.modded_block_count, 1);
        let parsed = LmSchematic::new_from_bytes(encode(&data, &opts, Some(4671)).unwrap())
            .unwrap()
            .get_blocks_pos()
            .unwrap();
        for change in report.changes {
            let source = data
                .blocks
                .elements
                .iter()
                .find(|r| r.block.id.name.as_ref() == change.source_id)
                .unwrap();
            let block = parsed
                .blocks
                .elements
                .iter()
                .find(|r| r.pos == source.pos)
                .unwrap();
            assert_eq!(block.block.id.name.as_ref(), change.replacement_id.unwrap());
        }
        assert!(
            parsed
                .blocks
                .elements
                .iter()
                .any(|r| r.block.id.name.as_ref() == "example:machine")
        );
        let invalid = fixture(&["minecraft:does_not_exist", "minecraft:typo_stairs"]);
        assert!(
            plan(&invalid, &opts, None)
                .unwrap()
                .unwrap()
                .changes
                .iter()
                .all(|c| c.error.is_some())
        );
        assert!(encode(&invalid, &opts, None).is_err());
        let legacy = options(6, -1, Some(5));
        assert!(
            plan(&data, &legacy, None)
                .unwrap()
                .unwrap()
                .changes
                .iter()
                .any(|c| c.source_id == "example:machine" && c.error.is_some())
        );
        assert!(encode(&data, &legacy, None).is_err());
    }
    #[test]
    fn explicit_legacy_target_writes_numeric_palette_and_version_metadata() {
        let data = fixture(&["minecraft:cherry_planks", "minecraft:stone"]);
        let bytes = encode(&data, &options(6, -1, Some(5)), Some(3465)).unwrap();
        let parsed =
            crate::mcedit::mcedit_schematic::McEditSchematic::new_from_bytes(bytes).unwrap();
        let Value::Compound(root) = &parsed.nbt else {
            panic!()
        };
        assert_eq!(
            root.get("MinecraftVersion"),
            Some(&Value::String("1.7.10".into()))
        );
        assert!(matches!(root.get("Blocks"), Some(Value::ByteArray(_))));
        assert_eq!(parsed.get_blocks_pos().unwrap().size, data.size);
    }
}
