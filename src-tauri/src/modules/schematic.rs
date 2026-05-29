use crate::building_gadges::bg_schematic::BgSchematic;
use crate::create::create_schematic::CreateSchematic;
use crate::data_files::files::FileManager;
use crate::database::db_apis::history_api::{new_history, update_history};
use crate::database::db_apis::schematic_data_api::{new_schematic_data, update_schematic_data};
use crate::database::db_apis::schematics_api::{delete_schematic_data, find_schematic, get_schematic_version, new_schematic, update_schematic, update_schematic_classification, update_schematic_name};
use crate::database::db_apis::user_api::add_user_schematic;
use crate::database::db_control::DatabaseState;
use crate::database::db_data::Schematic;
use crate::litematica::lm_schematic::LmSchematic;
use crate::modules::modules_data::convert_data::get_unique_block_str;
use crate::utils::block_state_pos_list::{BlockData, BlockPos};
use crate::utils::minecraft_data::je_blocks_data::BlocksData;
use crate::utils::minecraft_data::versions_data::VersionData;
use crate::utils::requirements::{get_requirements, RequirementStr};
use crate::utils::schematic_data::{SchematicData};
use crate::word_edit::we_schematic::WeSchematic;
use anyhow::Result;
use chrono::{Local};
use fastnbt::Value;
use std::collections::{BTreeMap, HashMap};
use std::path::Path;
use std::sync::Arc;
use tauri::State;
use crate::be_schematic::be_schematic::BESchematic;

#[derive(Debug, serde::Serialize)]
pub struct SchematicPreviewBlockState {
    pub id: String,
    pub properties: BTreeMap<String, String>,
}

#[derive(Debug, serde::Serialize)]
pub struct SchematicPreviewMaterial {
    pub id: String,
    pub count: u64,
}

#[derive(Debug, serde::Serialize)]
pub struct SchematicPreviewData {
    pub size: crate::utils::schematic_data::Size,
    pub palette: Vec<SchematicPreviewBlockState>,
    pub blocks: Vec<i32>,
    pub materials: Vec<SchematicPreviewMaterial>,
    pub tile_entities_list: crate::utils::tile_entities::TileEntitiesList,
}

fn is_air_block_id(id: &str) -> bool {
    id.eq_ignore_ascii_case("minecraft:air") || id.eq_ignore_ascii_case("air")
}

fn preview_state_from_block(block: &BlockData) -> SchematicPreviewBlockState {
    SchematicPreviewBlockState {
        id: block.id.name.to_string(),
        properties: block
            .properties
            .iter()
            .map(|(key, value)| (key.to_string(), value.to_string()))
            .collect(),
    }
}

fn build_schematic_preview_data(data: SchematicData) -> SchematicPreviewData {
    let mut min = BlockPos { x: 0, y: 0, z: 0 };
    let mut has_blocks = false;
    let mut non_air_count = 0usize;

    for block in data.blocks.elements.iter() {
        let block_id = block.block.id.name.as_ref();
        if is_air_block_id(block_id) {
            continue;
        }

        if !has_blocks {
            min = block.pos;
            has_blocks = true;
        } else {
            min.x = min.x.min(block.pos.x);
            min.y = min.y.min(block.pos.y);
            min.z = min.z.min(block.pos.z);
        }

        non_air_count += 1;
    }

    let mut palette_lookup: HashMap<Arc<BlockData>, i32> = HashMap::new();
    let mut palette = Vec::new();
    let mut blocks = Vec::with_capacity(non_air_count.saturating_mul(4));
    let mut material_counts: BTreeMap<String, u64> = BTreeMap::new();

    for block in data.blocks.elements.iter() {
        let block_id = block.block.id.name.as_ref();
        if is_air_block_id(block_id) {
            continue;
        }

        let block_data = Arc::clone(&block.block);
        let palette_index = if let Some(index) = palette_lookup.get(&block_data) {
            *index
        } else {
            let index = palette.len() as i32;
            palette.push(preview_state_from_block(&block_data));
            palette_lookup.insert(block_data, index);
            index
        };

        blocks.push(block.pos.x - min.x);
        blocks.push(block.pos.y - min.y);
        blocks.push(block.pos.z - min.z);
        blocks.push(palette_index);

        let material_id = block_id.to_string();
        *material_counts.entry(material_id).or_insert(0) += 1;
    }

    let mut materials = material_counts
        .into_iter()
        .map(|(id, count)| SchematicPreviewMaterial { id, count })
        .collect::<Vec<_>>();
    materials.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.id.cmp(&b.id)));

    let mut tile_entities_list = data.tile_entities_list;
    for tile_entity in tile_entities_list.elements.iter_mut() {
        tile_entity.pos.x -= min.x;
        tile_entity.pos.y -= min.y;
        tile_entity.pos.z -= min.z;
    }

    SchematicPreviewData {
        size: data.size,
        palette,
        blocks,
        materials,
        tile_entities_list,
    }
}

#[tauri::command]
pub async fn encode_uploaded_schematic(
    db: State<'_, DatabaseState>,
    file_manager: State<'_, FileManager>,
    versions_data: State<'_, VersionData>,
    je_blocks: State<'_, BlocksData>,
    file_name: String,
    data: Vec<u8>,
    update: bool,
    update_id: i64,
) -> Result<(), String> {
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    async move {
        let path = Path::new(&file_name);
        let (file_ext_str, file_name_str) = {
            let ext = path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_lowercase())
                .unwrap_or_else(|| "unknown".into());

            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .map(|n| n.to_lowercase())
                .unwrap_or_else(|| "unnamed".into());

            (ext, name)
        };
        match file_ext_str.as_str() {
            "nbt" => {
                let original_data = data.clone();
                let schematic = CreateSchematic::new_from_bytes(data)?;
                let schematic_data = schematic.get_blocks_pos()?;
                let requirement = get_requirements(&schematic_data.blocks)?;
                let unique_blocks = get_unique_block_str(&schematic_data.blocks)?;
                let requirements_str = RequirementStr::from_requirements(&requirement, &je_blocks)
                    .export_to_string()?;
                let size = schematic.get_size()?;
                let sizes = match size {
                    list => list
                        .iter()
                        .filter_map(|v| match v {
                            Value::Int(n) => Some(*n),
                            _ => None,
                        })
                        .collect::<Vec<i32>>(),
                };

                let sizes_str = sizes
                    .iter()
                    .map(|n| n.to_string())
                    .collect::<Vec<_>>()
                    .join(",");

                let mut conn = db.0.get()?;
                let data_version = schematic.get_data_version()?;
                let game_version = versions_data
                    .get_name(data_version)
                    .map(|arc_str| arc_str.to_string())
                    .unwrap_or_else(|| "unknown_version".to_string());
                let mut schematic = Schematic {
                    id: 0,
                    name: file_name_str,
                    description: "".parse()?,
                    schematic_type: 1,
                    sub_type: -1,
                    is_deleted: false,
                    sizes: sizes_str,
                    user: "your".parse()?,
                    is_upload: false,
                    version: 0,
                    version_list: "0".parse()?,
                    created_at: "".parse()?,
                    schematic_tags: "".to_string(),
                    classification: "".to_string(),
                    updated_at: now.clone(),
                    game_version,
                    lm_version: 0,
                };

                if update {
                    let version = get_schematic_version(&mut conn, update_id)?;
                    schematic.id = update_id;
                    schematic.version = version + 1;
                    let schematic_id = update_schematic(&mut conn, schematic.clone())?;
                    update_schematic_data(
                        &mut conn,
                        schematic_id,
                        requirements_str.clone(),
                        unique_blocks.clone(),
                    )?;
                    let schematic_str = serde_json::to_string(&schematic)?;
                    update_history(
                        &mut conn,
                        schematic_id,
                        schematic_str,
                        requirements_str,
                        unique_blocks,
                    )?;
                    file_manager.save_schematic_data(
                        schematic_id,
                        original_data,
                        version + 1,
                        -1,
                        1,
                        file_ext_str,
                    )?
                } else {
                    let schematic_id = new_schematic(&mut conn, schematic.clone())?;
                    new_schematic_data(
                        &mut conn,
                        schematic_id,
                        requirements_str.clone(),
                        unique_blocks.clone(),
                    )?;
                    add_user_schematic(&mut conn, 1)?;
                    let schematic_str = serde_json::to_string(&schematic)?;
                    new_history(
                        &mut conn,
                        schematic_id,
                        schematic_str,
                        requirements_str,
                        unique_blocks,
                    )?;
                    file_manager.save_schematic_data(
                        schematic_id,
                        original_data,
                        0,
                        -1,
                        1,
                        file_ext_str,
                    )?
                }
            }
            "json" => {
                let original_data = data.clone();

                let schematic = BgSchematic::new_from_data(data)?;
                let schematic_data = schematic.get_blocks_pos()?;
                let requirement = get_requirements(&schematic_data.blocks)?;
                let unique_blocks = get_unique_block_str(&schematic_data.blocks)?;
                let requirements_str = RequirementStr::from_requirements(&requirement, &je_blocks)
                    .export_to_string()?;

                let sizes = schematic.get_size()?;
                let schematic_type = schematic.get_type()?;
                let mut conn = db.0.get()?;

                let mut schematic = Schematic {
                    id: 0,
                    name: file_name_str,
                    description: "".parse()?,
                    schematic_type: 4,
                    sub_type: schematic_type,
                    is_deleted: false,
                    sizes: sizes.to_string(),
                    user: "your".parse()?,
                    is_upload: false,
                    version: 0,
                    version_list: "0".parse()?,
                    created_at: "".parse()?,
                    schematic_tags: "".to_string(),
                    classification: "".to_string(),
                    updated_at: now.clone(),
                    game_version: "".parse()?,
                    lm_version: 0,
                };
                if update {
                    let version = get_schematic_version(&mut conn, update_id)?;
                    schematic.id = update_id;
                    schematic.version = version + 1;
                    let schematic_id = update_schematic(&mut conn, schematic.clone())?;
                    update_schematic_data(
                        &mut conn,
                        schematic_id,
                        requirements_str.clone(),
                        unique_blocks.clone(),
                    )?;
                    let schematic_str = serde_json::to_string(&schematic)?;
                    update_history(
                        &mut conn,
                        schematic_id,
                        schematic_str,
                        requirements_str,
                        unique_blocks,
                    )?;
                    file_manager.save_schematic_data(
                        schematic_id,
                        original_data,
                        version + 1,
                        schematic_type,
                        4,
                        file_ext_str,
                    )?
                } else {
                    let schematic_id = new_schematic(&mut conn, schematic.clone())?;
                    new_schematic_data(
                        &mut conn,
                        schematic_id,
                        requirements_str.clone(),
                        unique_blocks.clone(),
                    )?;
                    add_user_schematic(&mut conn, 1)?;
                    let schematic_str = serde_json::to_string(&schematic)?;
                    new_history(
                        &mut conn,
                        schematic_id,
                        schematic_str,
                        requirements_str,
                        unique_blocks,
                    )?;
                    file_manager.save_schematic_data(
                        schematic_id,
                        original_data,
                        0,
                        schematic_type,
                        4,
                        file_ext_str,
                    )?
                }
            }
            "schem" => {
                let original_data = data.clone();
                let schematic = WeSchematic::new_from_bytes(data)?;
                let schematic_data = schematic.get_blocks_pos()?;
                let requirement = get_requirements(&schematic_data.blocks)?;
                let unique_blocks = get_unique_block_str(&schematic_data.blocks)?;
                let requirements_str = RequirementStr::from_requirements(&requirement, &je_blocks)
                    .export_to_string()?;
                let type_version = schematic.get_type()?;
                let sizes = schematic.get_size(type_version)?;
                let sizes_str = sizes.to_string();
                let mut conn = db.0.get()?;
                let data_version = schematic.get_data_version(type_version)?;
                let game_version = versions_data
                    .get_name(data_version)
                    .map(|arc_str| arc_str.to_string())
                    .unwrap_or_else(|| "unknown_version".to_string());
                let mut schematic = Schematic {
                    id: 0,
                    name: file_name_str,
                    description: "".parse()?,
                    schematic_type: 3,
                    sub_type: type_version,
                    is_deleted: false,
                    sizes: sizes_str,
                    user: "your".parse()?,
                    is_upload: false,
                    version: 0,
                    version_list: "0".parse()?,
                    created_at: "".parse()?,
                    schematic_tags: "".to_string(),
                    classification: "".to_string(),
                    updated_at: now.clone(),
                    game_version,
                    lm_version: 0,
                };

                if update {
                    let version = get_schematic_version(&mut conn, update_id)?;
                    schematic.id = update_id;
                    schematic.version = version + 1;
                    let schematic_id = update_schematic(&mut conn, schematic.clone())?;
                    update_schematic_data(
                        &mut conn,
                        schematic_id,
                        requirements_str.clone(),
                        unique_blocks.clone(),
                    )?;
                    let schematic_str = serde_json::to_string(&schematic)?;
                    update_history(
                        &mut conn,
                        schematic_id,
                        schematic_str,
                        requirements_str,
                        unique_blocks,
                    )?;
                    file_manager.save_schematic_data(
                        schematic_id,
                        original_data,
                        version + 1,
                        type_version,
                        3,
                        file_ext_str,
                    )?
                } else {
                    let schematic_id = new_schematic(&mut conn, schematic.clone())?;
                    new_schematic_data(
                        &mut conn,
                        schematic_id,
                        requirements_str.clone(),
                        unique_blocks.clone(),
                    )?;
                    add_user_schematic(&mut conn, 1)?;
                    let schematic_str = serde_json::to_string(&schematic)?;
                    new_history(
                        &mut conn,
                        schematic_id,
                        schematic_str,
                        requirements_str,
                        unique_blocks,
                    )?;
                    file_manager.save_schematic_data(
                        schematic_id,
                        original_data,
                        0,
                        type_version,
                        3,
                        file_ext_str,
                    )?
                }
            }
            "litematic" => {
                let original_data = data.clone();
                let schematic = LmSchematic::new_from_bytes(data)?;
                let schematic_data = schematic.get_blocks_pos()?;
                let requirement = get_requirements(&schematic_data.blocks)?;
                let unique_blocks = get_unique_block_str(&schematic_data.blocks)?;
                let requirements_str = RequirementStr::from_requirements(&requirement, &je_blocks)
                    .export_to_string()?;
                let metadata = schematic.read_metadata()?;
                let sizes_pos = metadata.enclosing_size;
                let description = metadata.description;
                let author = metadata.author;
                let mut conn = db.0.get()?;
                let data_version = schematic.get_data_version()?;
                let lm_version = schematic.get_lm_version()?;
                let game_version = versions_data
                    .get_name(data_version)
                    .map(|arc_str| arc_str.to_string())
                    .unwrap_or_else(|| "unknown_version".to_string());
                let name = if metadata.name.trim() == "Unnamed" {
                    file_name_str
                } else {
                    metadata.name
                };
                let mut schematic = Schematic {
                    id: 0,
                    name,
                    description,
                    schematic_type: 2,
                    sub_type: -1,
                    is_deleted: false,
                    sizes: sizes_pos.to_string(),
                    user: author,
                    is_upload: false,
                    version: 0,
                    version_list: "0".parse()?,
                    created_at: "".parse()?,
                    schematic_tags: "".to_string(),
                    classification: "".to_string(),
                    updated_at: now.clone(),
                    game_version,
                    lm_version,
                };
                if update {
                    let version = get_schematic_version(&mut conn, update_id)?;
                    schematic.id = update_id;
                    schematic.version = version + 1;
                    let schematic_id = update_schematic(&mut conn, schematic.clone())?;
                    update_schematic_data(
                        &mut conn,
                        schematic_id,
                        requirements_str.clone(),
                        unique_blocks.clone(),
                    )?;
                    let schematic_str = serde_json::to_string(&schematic)?;
                    update_history(
                        &mut conn,
                        schematic_id,
                        schematic_str,
                        requirements_str,
                        unique_blocks,
                    )?;
                    file_manager.save_schematic_data(
                        schematic_id,
                        original_data,
                        version + 1,
                        -1,
                        2,
                        file_ext_str,
                    )?
                } else {
                    let schematic_id = new_schematic(&mut conn, schematic.clone())?;
                    new_schematic_data(
                        &mut conn,
                        schematic_id,
                        requirements_str.clone(),
                        unique_blocks.clone(),
                    )?;
                    add_user_schematic(&mut conn, 1)?;
                    let schematic_str = serde_json::to_string(&schematic)?;
                    new_history(
                        &mut conn,
                        schematic_id,
                        schematic_str,
                        requirements_str,
                        unique_blocks,
                    )?;
                    file_manager.save_schematic_data(
                        schematic_id,
                        original_data,
                        0,
                        -1,
                        2,
                        file_ext_str,
                    )?
                }
            }
            "mcstructure" => {
                let original_data = data.clone();
                let schematic = BESchematic::new_from_bytes(data)?;
                let schematic_data = schematic.get_blocks_pos()?;
                let requirement = get_requirements(&schematic_data.blocks)?;
                let unique_blocks = get_unique_block_str(&schematic_data.blocks)?;
                let requirements_str = RequirementStr::from_requirements(&requirement, &je_blocks)
                    .export_to_string()?;
                let size = schematic.get_size()?;

                let mut conn = db.0.get()?;
                let mut schematic = Schematic {
                    id: 0,
                    name: file_name_str,
                    description: "".parse()?,
                    schematic_type: 5,
                    sub_type: -1,
                    is_deleted: false,
                    sizes: size.to_string(),
                    user: "your".parse()?,
                    is_upload: false,
                    version: 0,
                    version_list: "0".parse()?,
                    created_at: "".parse()?,
                    schematic_tags: "".to_string(),
                    classification: "".to_string(),
                    updated_at: now.clone(),
                    game_version:"".parse()?,
                    lm_version: 0,
                };

                if update {
                    let version = get_schematic_version(&mut conn, update_id)?;
                    schematic.id = update_id;
                    schematic.version = version + 1;
                    let schematic_id = update_schematic(&mut conn, schematic.clone())?;
                    update_schematic_data(
                        &mut conn,
                        schematic_id,
                        requirements_str.clone(),
                        unique_blocks.clone(),
                    )?;
                    let schematic_str = serde_json::to_string(&schematic)?;
                    update_history(
                        &mut conn,
                        schematic_id,
                        schematic_str,
                        requirements_str,
                        unique_blocks,
                    )?;
                    file_manager.save_schematic_data(
                        schematic_id,
                        original_data,
                        version + 1,
                        -1,
                        5,
                        file_ext_str,
                    )?
                } else {
                    let schematic_id = new_schematic(&mut conn, schematic.clone())?;
                    new_schematic_data(
                        &mut conn,
                        schematic_id,
                        requirements_str.clone(),
                        unique_blocks.clone(),
                    )?;
                    add_user_schematic(&mut conn, 1)?;
                    let schematic_str = serde_json::to_string(&schematic)?;
                    new_history(
                        &mut conn,
                        schematic_id,
                        schematic_str,
                        requirements_str,
                        unique_blocks,
                    )?;
                    file_manager.save_schematic_data(
                        schematic_id,
                        original_data,
                        0,
                        -1,
                        5,
                        file_ext_str,
                    )?
                }
            }
            _ => {
                let mut conn = db.0.get()?;
                let original_data = data.clone();
                let mut schematic = Schematic {
                    id: 0,
                    name: "未解析".parse()?,
                    description: "".parse()?,
                    schematic_type: -1,
                    sub_type: -1,
                    is_deleted: false,
                    sizes: "".to_string(),
                    user: "your".parse()?,
                    is_upload: false,
                    version: 0,
                    version_list: "0".parse()?,
                    created_at: "".parse()?,
                    schematic_tags: "".to_string(),
                    classification: "".to_string(),
                    updated_at: now.clone(),
                    game_version: "".parse()?,
                    lm_version: 0,
                };
                if update {
                    let version = get_schematic_version(&mut conn, update_id)?;
                    schematic.id = update_id;
                    schematic.version = version + 1;
                    let schematic_id = update_schematic(&mut conn, schematic.clone())?;
                    update_schematic_data(
                        &mut conn,
                        schematic_id,
                        "{}".to_string(),
                        "{}".to_string(),
                    )?;
                    let schematic_str = serde_json::to_string(&schematic)?;
                    update_history(
                        &mut conn,
                        schematic_id,
                        schematic_str,
                        "{}".to_string(),
                        "{}".to_string(),
                    )?;
                    file_manager.save_schematic_data(
                        schematic_id,
                        original_data,
                        version + 1,
                        -1,
                        -1,
                        file_ext_str,
                    )?
                } else {
                    let schematic_id = new_schematic(&mut conn, schematic.clone())?;
                    new_schematic_data(
                        &mut conn,
                        schematic_id,
                        "{}".to_string(),
                        "{}".to_string(),
                    )?;
                    add_user_schematic(&mut conn, 1)?;
                    let schematic_str = serde_json::to_string(&schematic)?;
                    new_history(
                        &mut conn,
                        schematic_id,
                        schematic_str,
                        "{}".to_string(),
                        "{}".to_string(),
                    )?;
                    file_manager.save_schematic_data(
                        schematic_id,
                        original_data,
                        0,
                        -1,
                        -1,
                        file_ext_str,
                    )?
                }
            }
        };
        Ok(())
    }
    .await
    .map_err(|e: anyhow::Error| e.to_string())
}

#[tauri::command]
pub async fn get_schematic_str(
    db: State<'_, DatabaseState>,
    file_manager: State<'_, FileManager>,
    id: i64,
) -> Result<String, String> {
    async move {
        let mut conn = db.0.get()?;
        let schematic = find_schematic(&mut conn, id)?;
        let version = schematic.version;
        let sub_version = schematic.sub_type;
        let v_type = schematic.schematic_type;
        let str = file_manager.read_schematic_str(id, version, sub_version, v_type)?;
        Ok(str)
    }
    .await
    .map_err(|e: anyhow::Error| e.to_string())
}

#[tauri::command]
pub async fn get_schematic_data(
    db: State<'_, DatabaseState>,
    file_manager: State<'_, FileManager>,
    id: i64,
) -> Result<SchematicData, String> {
    async move {
        let mut conn = db.0.get()?;
        let schematic = find_schematic(&mut conn, id)?;
        let version = schematic.version;
        let sub_version = schematic.sub_type;
        let v_type = schematic.schematic_type;
        let data = file_manager.get_schematic_data(id, version, sub_version, v_type)?;
        Ok(data)
    }
        .await
        .map_err(|e: anyhow::Error| e.to_string())
}

#[tauri::command]
pub async fn get_schematic_preview_data(
    db: State<'_, DatabaseState>,
    file_manager: State<'_, FileManager>,
    id: i64,
) -> Result<SchematicPreviewData, String> {
    async move {
        let mut conn = db.0.get()?;
        let schematic = find_schematic(&mut conn, id)?;
        let version = schematic.version;
        let sub_version = schematic.sub_type;
        let v_type = schematic.schematic_type;
        let data = file_manager.get_schematic_data(id, version, sub_version, v_type)?;
        Ok(build_schematic_preview_data(data))
    }
        .await
        .map_err(|e: anyhow::Error| e.to_string())
}

#[tauri::command]
pub async fn delete_schematic(
    db: State<'_, DatabaseState>,
    file_manager: State<'_, FileManager>,
    id: i64,
) -> Result<bool, String> {
    async move {
        let mut conn = db.0.get()?;
        delete_schematic_data(&mut conn, id)?;
        //file_manager.delete_schematic_dir(id)?; 删文件权限问题暂时不实现
        add_user_schematic(&mut conn, -1)?;
        Ok(true)
    }
    .await
    .map_err(|e: anyhow::Error| e.to_string())
}

#[tauri::command]
pub async fn copy_schematic(
    id: i64,
    sub: i32,
    version: i32,
    v_type: i32,
    target: String,
    file_manager: State<'_, FileManager>,
) -> Result<bool, String> {
    async move {
        let result = file_manager.copy_file(id, version, sub, v_type, target)?;
        Ok(result)
    }
    .await
    .map_err(|e: anyhow::Error| e.to_string())
}
#[tauri::command]
pub async fn update_schematic_name_description(
    db: State<'_, DatabaseState>,
    schematic_id: i64,
    name: String,
    schematic_tags: String,
    description: String,
) -> Result<bool, String> {
    async move {
        let mut conn = db.0.get()?;
        update_schematic_name(&mut conn, name, description, schematic_tags, schematic_id)?;
        Ok(true)
    }
    .await
    .map_err(|e: anyhow::Error| e.to_string())
}

#[tauri::command]
pub async fn update_schematic_classification_tauri(
    db: State<'_, DatabaseState>,
    schematic_id: i64,
    classification: String,
) -> Result<bool, String> {
    async move {
        let mut conn = db.0.get()?;
        update_schematic_classification(&mut conn, classification, schematic_id)?;
        Ok(true)
    }
        .await
        .map_err(|e: anyhow::Error| e.to_string())
}

#[tauri::command]
pub async fn save_snbt(
    db: State<'_, DatabaseState>,
    file_manager: State<'_, FileManager>,
    id: i64,
    snbt: String,
) -> Result<bool, String> {
    async move {
        let mut conn = db.0.get()?;
        let schematic = find_schematic(&mut conn, id)?;
        let version = schematic.version;
        let sub_version = schematic.sub_type;
        let v_type = schematic.schematic_type;
        if v_type == 5 {
            file_manager.save_snbt_le_value(
                id,
                &snbt,
                version,
                sub_version,
                v_type,
            )?;
        }else {
            file_manager.save_snbt_value(
                id,
                &snbt,
                version,
                sub_version,
                v_type,
                true,
            )?;
        }

        Ok(true)
    }
        .await
        .map_err(|e: anyhow::Error| e.to_string())
}
