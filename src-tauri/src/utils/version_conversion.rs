//! Preview and export share the block-state normalizer. Overrides are applied
//! simultaneously to the original palette, never as a replacement chain.
use crate::utils::block_state_pos_list::{BlockData, BlockId, BlockStatePos, BlockStatePosList};
use crate::utils::minecraft_data::{
    java_block_states,
    versions_data::{GameVersionOption, VersionData},
};
use crate::utils::schematic_data::SchematicData;
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::sync::Arc;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionBlockChange {
    pub source_id: String,
    pub replacement_id: Option<String>,
    pub count: usize,
    pub id_changed: bool,
    pub properties_changed: bool,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionConversionPlan {
    pub target: GameVersionOption,
    pub changes: Vec<VersionBlockChange>,
    pub target_blocks: Vec<String>,
    pub modded_block_count: usize,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VersionBlockOverride {
    pub source_id: String,
    pub replacement_id: String,
}

pub fn target_version(format: i32, subtype: i32, id: i32) -> Result<GameVersionOption> {
    match format {
        3 => {
            anyhow::ensure!((-1..=1).contains(&subtype), "unsupported WorldEdit subtype")
        }
        2 => anyhow::ensure!(
            (-1..=0).contains(&subtype) || (3..=7).contains(&subtype),
            "unsupported Litematica subtype"
        ),
        4 => anyhow::ensure!(
            (0..=2).contains(&subtype),
            "unsupported Building Gadgets subtype"
        ),
        _ => (),
    }
    VersionData::new()
        .game_versions_for_format(format, subtype)
        .into_iter()
        .find(|v| v.id == id)
        .context("target Minecraft version is unsupported for the selected format")
}

pub fn target_blocks(version: &str) -> Vec<String> {
    let mut ids: Vec<String> = if let Some(registry) = java_block_states::version(version) {
        registry
            .block_names()
            .map(|name| format!("minecraft:{name}"))
            .collect()
    } else {
        crate::mcedit::legacy_map::block_names_for_version(version)
    };
    ids.sort();
    ids
}

pub fn plan(
    data: &SchematicData,
    format: i32,
    subtype: i32,
    id: i32,
) -> Result<VersionConversionPlan> {
    let target = target_version(format, subtype, id)?;
    let mut states: HashMap<&BlockData, usize> = HashMap::new();
    let mut id_counts: HashMap<&str, usize> = HashMap::new();
    for record in &data.blocks.elements {
        *states.entry(record.block.as_ref()).or_default() += 1;
        *id_counts.entry(record.block.id.name.as_ref()).or_default() += 1;
    }
    let mut changes: BTreeMap<String, VersionBlockChange> = BTreeMap::new();
    let mut modded_block_count = 0;
    for (source, count) in states {
        if !source.id.name.starts_with("minecraft:") {
            modded_block_count += count;
        }
        let mapped = if format == 6 && !source.id.name.starts_with("minecraft:") {
            Err(crate::utils::schematic_data::SchematicError::MissingField(
                "MCEdit numeric palettes cannot preserve a namespaced mod block; choose a replacement".into()))
        } else {
            java_block_states::normalize_block_for_java(&target.name, source)
        };
        let (replacement, id_changed, properties_changed, error) = match mapped {
            Ok(mapped) if mapped.as_ref() == source => continue,
            Ok(mapped) => (
                Some(mapped.id.name.to_string()),
                mapped.id != source.id,
                mapped.properties != source.properties,
                None,
            ),
            Err(error) => (None, true, false, Some(error.to_string())),
        };
        let entry = changes
            .entry(source.id.name.to_string())
            .or_insert_with(|| VersionBlockChange {
                source_id: source.id.name.to_string(),
                replacement_id: replacement.clone(),
                count: id_counts[source.id.name.as_ref()],
                id_changed: false,
                properties_changed: false,
                error: None,
            });
        // One row represents an ID-level override. If different source states
        // need different IDs, do not pick a random suggestion from HashMap order.
        if entry.replacement_id != replacement && entry.error.is_none() {
            entry.error =
                Some("source states map to different blocks; choose a single replacement".into());
            entry.replacement_id = None;
        }
        entry.id_changed |= id_changed;
        entry.properties_changed |= properties_changed;
        if error.is_some() {
            entry.error = error;
            entry.replacement_id = None;
        }
    }
    let mut changes: Vec<_> = changes.into_values().collect();
    changes.sort_by(|a, b| b.count.cmp(&a.count).then(a.source_id.cmp(&b.source_id)));
    let target_blocks = target_blocks(&target.name);
    Ok(VersionConversionPlan {
        target,
        changes,
        target_blocks,
        modded_block_count,
    })
}

fn valid_id(id: &str) -> bool {
    let Some((namespace, path)) = id.split_once(':') else {
        return false;
    };
    id.len() <= 160
        && !namespace.is_empty()
        && !path.is_empty()
        && namespace
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b"_.-".contains(&b))
        && path
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b"_./-".contains(&b))
}

pub fn apply_overrides(
    data: &SchematicData,
    target: &GameVersionOption,
    overrides: &[VersionBlockOverride],
) -> Result<SchematicData> {
    anyhow::ensure!(overrides.len() <= 4096, "version replacement limit is 4096");
    let sources: HashSet<_> = data
        .blocks
        .elements
        .iter()
        .map(|r| r.block.id.name.as_ref())
        .collect();
    let allowed: HashSet<_> = target_blocks(&target.name).into_iter().collect();
    let mut replacements = HashMap::new();
    for rule in overrides {
        anyhow::ensure!(
            valid_id(&rule.source_id) && valid_id(&rule.replacement_id),
            "invalid version replacement block ID"
        );
        anyhow::ensure!(
            sources.contains(rule.source_id.as_str()),
            "replacement source block is absent from the blueprint"
        );
        anyhow::ensure!(
            allowed.contains(&rule.replacement_id),
            "replacement block is unavailable in the target Minecraft version"
        );
        anyhow::ensure!(
            replacements
                .insert(rule.source_id.as_str(), rule.replacement_id.as_str())
                .is_none(),
            "duplicate version replacement source"
        );
    }
    let mut cache = HashMap::new();
    let tile_positions: HashSet<_> = data
        .tile_entities_list
        .elements
        .iter()
        .map(|tile| (tile.pos.x, tile.pos.y, tile.pos.z))
        .collect();
    let mut changed_positions = HashSet::new();
    let blocks = data
        .blocks
        .elements
        .iter()
        .map(|record| {
            let source = record.block.as_ref();
            let mapped = if let Some(&replacement) = replacements.get(source.id.name.as_ref()) {
                let pos = (record.pos.x, record.pos.y, record.pos.z);
                if replacement != source.id.name.as_ref() && tile_positions.contains(&pos) {
                    changed_positions.insert(pos);
                }
                cache
                    .entry(source.clone())
                    .or_insert_with(|| {
                        Arc::new(BlockData {
                            id: BlockId {
                                name: Arc::from(replacement),
                            },
                            properties: source.properties.clone(),
                        })
                    })
                    .clone()
            } else {
                record.block.clone()
            };
            BlockStatePos {
                pos: record.pos,
                block: mapped,
            }
        })
        .collect();
    let mut tiles = data.tile_entities_list.clone();
    tiles
        .elements
        .retain(|tile| !changed_positions.contains(&(tile.pos.x, tile.pos.y, tile.pos.z)));
    let edited = SchematicData::new(
        BlockStatePosList { elements: blocks },
        tiles,
        data.entities_list.clone(),
        data.size,
    );
    Ok(edited)
}
