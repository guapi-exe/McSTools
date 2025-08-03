use crate::building_gadges::to_bg_schematic::ToBgSchematic;
use crate::create::to_create_schematic::ToCreateSchematic;
use crate::data_files::files::FileManager;
use crate::database::db_apis::history_api::new_history;
use crate::database::db_apis::schematic_data_api::new_schematic_data;
use crate::database::db_apis::schematics_api::new_schematic;
use crate::database::db_apis::user_api::add_user_schematic;
use crate::database::db_control::DatabaseState;
use crate::database::db_data::Schematic;
use crate::litematica::to_lm_schematic::ToLmSchematic;
use crate::modules::modules_data::convert_data::get_unique_block_str;
use crate::utils::block_state_pos_list::{BlockStatePos, BlockStatePosList};
use crate::utils::minecraft_data::je_blocks_data::BlocksData;
use crate::utils::requirements::{get_requirements, RequirementStr};
use crate::utils::schematic_data::{SchematicData, Size};
use crate::utils::tile_entities::TileEntitiesList;
use crate::word_edit::to_we_schematic::ToWeSchematic;
use chrono::Local;
use rusqlite::version;
use std::collections::VecDeque;
use tauri::State;

#[tauri::command]
pub async fn create_map_art(
    blocks: Vec<BlockStatePos>,
    file_name: String,
    size: Size,
    schematic_type: i64,
    sub_version: i64,
    je_blocks: State<'_, BlocksData>,
    db: State<'_, DatabaseState>,
    file_manager: State<'_, FileManager>,
) -> Result<bool, String> {
    async move {
        let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let mut conn = db.0.get()?;
        let block_data = BlockStatePosList {
            elements: VecDeque::from(blocks),
        };
        let data = SchematicData::new(block_data, TileEntitiesList::default(), size);
        match schematic_type {
            1 => {
                let requirement = get_requirements(&data.blocks)?;
                let requirements_str = RequirementStr::from_requirements(&requirement, &je_blocks)
                    .export_to_string()?;
                let unique_blocks = get_unique_block_str(&data.blocks)?;
                let data = ToCreateSchematic::new(&data)?.create_schematic(true);
                let mut schematic = Schematic {
                    id: 0,
                    name: format!("map_art_{}", file_name),
                    description: "".parse()?,
                    schematic_type: 1,
                    sub_type: -1,
                    is_deleted: false,
                    sizes: size.to_string(),
                    user: "your".parse()?,
                    is_upload: false,
                    version: 0,
                    version_list: "0".parse()?,
                    created_at: "".parse()?,
                    schematic_tags: "".to_string(),
                    updated_at: now.clone(),
                    game_version: "".parse()?,
                };
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
                file_manager.save_nbt_value(
                    new_id,
                    data,
                    0,
                    sub_version as i32,
                    schematic_type as i32,
                    true,
                )?;
            }
            2 => {
                let requirement = get_requirements(&data.blocks)?;
                let requirements_str = RequirementStr::from_requirements(&requirement, &je_blocks)
                    .export_to_string()?;
                let unique_blocks = get_unique_block_str(&data.blocks)?;
                let data = ToLmSchematic::new(&data)?.lm_schematic(6);
                let mut schematic = Schematic {
                    id: 0,
                    name: format!("map_art_{}", file_name),
                    description: "".parse()?,
                    schematic_type: 2,
                    sub_type: -1,
                    is_deleted: false,
                    sizes: size.to_string(),
                    user: "your".parse()?,
                    is_upload: false,
                    version: 0,
                    version_list: "0".parse()?,
                    created_at: "".parse()?,
                    schematic_tags: "".to_string(),
                    updated_at: now.clone(),
                    game_version: "".parse()?,
                };
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
                file_manager.save_nbt_value(
                    new_id,
                    data,
                    0,
                    sub_version as i32,
                    schematic_type as i32,
                    true,
                )?;
            }
            3 => {
                let requirement = get_requirements(&data.blocks)?;
                let requirements_str = RequirementStr::from_requirements(&requirement, &je_blocks)
                    .export_to_string()?;
                let unique_blocks = get_unique_block_str(&data.blocks)?;
                let data = ToWeSchematic::new(&data)?.we_schematic(sub_version as i32)?;
                let mut schematic = Schematic {
                    id: 0,
                    name: format!("map_art_{}", file_name),
                    description: "".parse()?,
                    schematic_type: 3,
                    sub_type: sub_version as i32,
                    is_deleted: false,
                    sizes: size.to_string(),
                    user: "your".parse()?,
                    is_upload: false,
                    version: 0,
                    version_list: "0".parse()?,
                    created_at: "".parse()?,
                    schematic_tags: "".to_string(),
                    updated_at: now.clone(),
                    game_version: "".parse()?,
                };
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
                file_manager.save_nbt_value(
                    new_id,
                    data,
                    0,
                    sub_version as i32,
                    schematic_type as i32,
                    true,
                )?;
            }
            4 => {
                let requirement = get_requirements(&data.blocks)?;
                let requirements_str = RequirementStr::from_requirements(&requirement, &je_blocks)
                    .export_to_string()?;
                let unique_blocks = get_unique_block_str(&data.blocks)?;
                let data = ToBgSchematic::new(&data)?.bg_schematic(sub_version as i32)?;
                let mut schematic = Schematic {
                    id: 0,
                    name: format!("map_art_{}", file_name),
                    description: "".parse()?,
                    schematic_type: 4,
                    sub_type: sub_version as i32,
                    is_deleted: false,
                    sizes: size.to_string(),
                    user: "your".parse()?,
                    is_upload: false,
                    version: 0,
                    version_list: "0".parse()?,
                    created_at: "".parse()?,
                    schematic_tags: "".to_string(),
                    updated_at: now.clone(),
                    game_version: "".parse()?,
                };
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
                file_manager.save_json_value(
                    new_id,
                    data,
                    0,
                    sub_version as i32,
                    schematic_type as i32,
                )?;
            }
            //5 => {}
            _ => {
                anyhow::bail!("unknown schematic type: {}", schematic_type);
            }
        }
        Ok(true)
    }
    .await
    .map_err(|e: anyhow::Error| e.to_string())
}
