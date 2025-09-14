use crate::building_gadges::to_bg_schematic::ToBgSchematic;
use crate::create::to_create_schematic::ToCreateSchematic;
use crate::data_files::files::FileManager;
use crate::database::db_apis::history_api::new_history;
use crate::database::db_apis::schematic_data_api::new_schematic_data;
use crate::database::db_apis::schematics_api::{find_schematic, new_schematic};
use crate::database::db_apis::user_api::add_user_schematic;
use crate::database::db_control::DatabaseState;
use crate::litematica::to_lm_schematic::ToLmSchematic;
use crate::modules::modules_data::convert_data::get_unique_block_str;
use crate::modules::modules_data::replace_data::{ReplacementRule, RuleMatcher};
use crate::utils::block_state_pos_list::{BlockData, BlockId};
use crate::utils::minecraft_data::je_blocks_data::BlocksData;
use crate::utils::requirements::{get_requirements, RequirementStr};
use crate::word_edit::to_we_schematic::ToWeSchematic;
use rayon::prelude::*;
use std::sync::Arc;
use tauri::State;
use crate::be_schematic::to_be_schematic::ToBESchematic;

#[tauri::command]
pub async fn schematic_replacement(
    rules: Vec<ReplacementRule>,
    db: State<'_, DatabaseState>,
    je_blocks: State<'_, BlocksData>,
    file_manager: State<'_, FileManager>,
) -> Result<bool, String> {
    async move {
        let schematic_id = rules[0].schematic_id.clone();
        let mut conn = db.0.get()?;
        let mut schematic = find_schematic(&mut conn, schematic_id)?;
        let version = schematic.version;
        let sub_version = schematic.sub_type;
        let v_type = schematic.schematic_type;
        let mut data =
            file_manager.get_schematic_data(schematic_id, version, sub_version, v_type)?;
        let mut rule_cache = Vec::with_capacity(rules.len());
        for rule in &rules {
            let matcher = match rule.mode {
                0 => {
                    let original = rule
                        .original_id
                        .as_ref()
                        .ok_or(anyhow::anyhow!("unknow original"))?;
                    let replacement = rule
                        .replacement_id
                        .as_ref()
                        .ok_or(anyhow::anyhow!("unknow replacement"))?;
                    RuleMatcher::IdMatch {
                        original: original.clone(),
                        replacement: replacement.clone(),
                    }
                }
                1 => {
                    let original = rule
                        .original_details
                        .as_ref()
                        .ok_or(anyhow::anyhow!("unknow original"))?;
                    let replacement = rule
                        .replacement_details
                        .as_ref()
                        .ok_or(anyhow::anyhow!("unknow replacement"))?;
                    RuleMatcher::FullMatch {
                        original: original.clone(),
                        replacement: replacement.clone(),
                    }
                }
                _ => return Err(anyhow::anyhow!("unknow type: {}", rule.mode)),
            };
            rule_cache.push((matcher, rule.global));
        }

        data.blocks.elements.par_iter_mut().for_each(|block| {
            for (matcher, global) in &rule_cache {
                let matches = match matcher {
                    RuleMatcher::IdMatch { original, .. } => {
                        block.block.id.name.as_ref() == *original
                    }
                    RuleMatcher::FullMatch { original, .. } => {
                        block.block.id == original.id
                            && block.block.properties.len() == original.properties.len()
                            && block.block.properties.iter().all(|(k, v)| {
                                original
                                    .properties
                                    .get(k.as_ref())
                                    .map(|ov| ov.as_ref() == v.as_ref())
                                    .unwrap_or(false)
                            })
                    }
                };
                if matches {
                    let new_block = match matcher {
                        RuleMatcher::IdMatch { replacement, .. } => BlockData {
                            id: BlockId {
                                name: Arc::from(replacement.as_str()),
                            },
                            properties: block.block.properties.clone(),
                        },
                        RuleMatcher::FullMatch { replacement, .. } => replacement.clone(),
                    };

                    let old = Arc::make_mut(&mut block.block);
                    *old = new_block;
                }
            }
        });
        match v_type {
            1 => {
                let requirement = get_requirements(&data.blocks)?;
                let requirements_str = RequirementStr::from_requirements(&requirement, &je_blocks)
                    .export_to_string()?;
                let unique_blocks = get_unique_block_str(&data.blocks)?;
                let data = ToCreateSchematic::new(&data)?.create_schematic(true);
                schematic.name = format!("replace_schematic_{}", schematic_id);
                let new_id = new_schematic(&mut conn, schematic.clone())?;
                new_schematic_data(
                    &mut conn,
                    new_id,
                    requirements_str.clone(),
                    unique_blocks.clone(),
                )?;
                add_user_schematic(&mut conn, 1)?;
                let schematic_str = serde_json::to_string(&schematic)?;
                new_history(
                    &mut conn,
                    new_id,
                    schematic_str,
                    requirements_str,
                    unique_blocks,
                )?;
                file_manager.save_nbt_value(new_id, data, 0, sub_version, v_type, true)?;
            }
            2 => {
                let requirement = get_requirements(&data.blocks)?;
                let requirements_str = RequirementStr::from_requirements(&requirement, &je_blocks)
                    .export_to_string()?;
                let unique_blocks = get_unique_block_str(&data.blocks)?;
                let data = ToLmSchematic::new(&data)?.lm_schematic(6);
                schematic.name = format!("replace_schematic_{}", schematic_id);
                let new_id = new_schematic(&mut conn, schematic.clone())?;
                new_schematic_data(
                    &mut conn,
                    new_id,
                    requirements_str.clone(),
                    unique_blocks.clone(),
                )?;
                add_user_schematic(&mut conn, 1)?;
                let schematic_str = serde_json::to_string(&schematic)?;
                new_history(
                    &mut conn,
                    new_id,
                    schematic_str,
                    requirements_str,
                    unique_blocks,
                )?;
                file_manager.save_nbt_value(new_id, data, 0, sub_version, v_type, true)?;
            }
            3 => {
                let requirement = get_requirements(&data.blocks)?;
                let requirements_str = RequirementStr::from_requirements(&requirement, &je_blocks)
                    .export_to_string()?;
                let unique_blocks = get_unique_block_str(&data.blocks)?;
                let data = ToWeSchematic::new(&data)?.we_schematic(sub_version)?;
                schematic.name = format!("replace_schematic_{}", schematic_id);
                let new_id = new_schematic(&mut conn, schematic.clone())?;
                new_schematic_data(
                    &mut conn,
                    new_id,
                    requirements_str.clone(),
                    unique_blocks.clone(),
                )?;
                add_user_schematic(&mut conn, 1)?;
                let schematic_str = serde_json::to_string(&schematic)?;
                new_history(
                    &mut conn,
                    new_id,
                    schematic_str,
                    requirements_str,
                    unique_blocks,
                )?;
                file_manager.save_nbt_value(new_id, data, 0, sub_version, v_type, true)?;
            }
            4 => {
                let requirement = get_requirements(&data.blocks)?;
                let requirements_str = RequirementStr::from_requirements(&requirement, &je_blocks)
                    .export_to_string()?;
                let unique_blocks = get_unique_block_str(&data.blocks)?;
                let data = ToBgSchematic::new(&data)?.bg_schematic(sub_version)?;
                schematic.name = format!("replace_schematic_{}", schematic_id);
                let new_id = new_schematic(&mut conn, schematic.clone())?;
                new_schematic_data(
                    &mut conn,
                    new_id,
                    requirements_str.clone(),
                    unique_blocks.clone(),
                )?;
                add_user_schematic(&mut conn, 1)?;
                let schematic_str = serde_json::to_string(&schematic)?;
                new_history(
                    &mut conn,
                    new_id,
                    schematic_str,
                    requirements_str,
                    unique_blocks,
                )?;
                file_manager.save_json_value(new_id, data, 0, sub_version, v_type)?;
            }
            5 => {
                let requirement = get_requirements(&data.blocks)?;
                let requirements_str = RequirementStr::from_requirements(&requirement, &je_blocks)
                    .export_to_string()?;
                let unique_blocks = get_unique_block_str(&data.blocks)?;
                let data = ToBESchematic::new(&data)?.to_be_value();
                schematic.name = format!("replace_schematic_{}", schematic_id);
                let new_id = new_schematic(&mut conn, schematic.clone())?;
                new_schematic_data(
                    &mut conn,
                    new_id,
                    requirements_str.clone(),
                    unique_blocks.clone(),
                )?;
                add_user_schematic(&mut conn, 1)?;
                let schematic_str = serde_json::to_string(&schematic)?;
                new_history(
                    &mut conn,
                    new_id,
                    schematic_str,
                    requirements_str,
                    unique_blocks,
                )?;
                file_manager.save_nbt_le_value(new_id, data, 0, sub_version, v_type)?;
            }
            _ => return Err(anyhow::anyhow!("unknow type: {}", v_type)),
        }
        Ok(true)
    }
    .await
    .map_err(|e: anyhow::Error| e.to_string())
}
