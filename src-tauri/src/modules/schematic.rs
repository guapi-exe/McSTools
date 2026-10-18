use crate::data_files::files::FileManager;
use crate::database::db_apis::schematics_api::{
    delete_schematic_data, find_schematic, update_schematic_classification,
    update_schematic_game_version, update_schematic_name,
};
use crate::database::db_apis::user_api::add_user_schematic;
use crate::database::db_control::DatabaseState;
use crate::utils::block_state_pos_list::{BlockData, BlockPos};
use crate::utils::minecraft_data::je_blocks_data::BlocksData;
use crate::utils::minecraft_data::versions_data::VersionData;
use crate::utils::schematic_data::SchematicData;
use anyhow::Result;
use fastnbt::Value;
use std::collections::{BTreeMap, HashMap};
use std::sync::Arc;
use tauri::State;

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
    crate::utils::schematic_editing::is_air(id)
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

    build_preview_in_frame(&data, min, data.size, non_air_count)
}

// Editing keeps its coordinate frame when a boundary block becomes air.
// Recomputing the minimum for every preview would shift subsequent selections.
pub(crate) fn build_preview_in_frame(
    data: &SchematicData,
    min: BlockPos,
    size: crate::utils::schematic_data::Size,
    non_air_count: usize,
) -> SchematicPreviewData {
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

    let mut tile_entities_list = data.tile_entities_list.clone();
    for tile_entity in tile_entities_list.elements.iter_mut() {
        tile_entity.pos.x -= min.x;
        tile_entity.pos.y -= min.y;
        tile_entity.pos.z -= min.z;
    }

    SchematicPreviewData {
        size,
        palette,
        blocks,
        materials,
        tile_entities_list,
    }
}

static IMPORT_WORKER: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(1);

#[tauri::command]
pub async fn encode_uploaded_schematic(
    app: tauri::AppHandle,
    file_name: String,
    data: Vec<u8>,
    update: bool,
    update_id: i64,
) -> Result<(), String> {
    let _permit = IMPORT_WORKER
        .acquire()
        .await
        .map_err(|_| "import worker is unavailable")?;
    tauri::async_runtime::spawn_blocking(move || -> Result<()> {
        use tauri::Manager;
        let prepared = super::blueprint_import::prepare_import(
            &file_name,
            data,
            &app.state::<VersionData>(),
            &app.state::<BlocksData>(),
        )?;
        let db = app.state::<DatabaseState>();
        let mut conn = db.0.get()?;
        super::blueprint_import::persist_import(
            &mut conn,
            &app.state::<FileManager>(),
            prepared,
            update.then_some(update_id),
        )?;
        Ok(())
    })
    .await
    .map_err(|_| "blueprint import worker failed".to_string())?
    .map_err(|error| error.to_string())
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

fn set_game_data_version(
    data: &mut Value,
    schematic_type: i32,
    _schematic_sub_type: i32,
    data_version: i32,
) -> Result<(), &'static str> {
    let Value::Compound(root) = data else {
        return Err("schematic root is not a compound");
    };

    match schematic_type {
        1 => {
            root.insert("DataVersion".to_string(), Value::Int(data_version));
        }
        2 => {
            root.insert("MinecraftDataVersion".to_string(), Value::Int(data_version));
        }
        3 => {
            // WorldEdit has both a direct root and an older `Schematic`
            // wrapper.  Detect the actual NBT shape instead of trusting the
            // database subtype, which can be stale after an imported file is
            // replaced.
            if let Some(Value::Compound(nested)) = root.get_mut("Schematic") {
                nested.insert("DataVersion".to_string(), Value::Int(data_version));
            } else {
                root.insert("DataVersion".to_string(), Value::Int(data_version));
            }
        }
        6 => {
            // Legacy `.schematic` has no DataVersion tag.  Its selected game
            // version is retained in the database for filtering and display.
        }
        _ => return Err("this schematic format has no Java game version"),
    }

    Ok(())
}

#[tauri::command]
pub async fn update_schematic_game_version_tauri(
    db: State<'_, DatabaseState>,
    file_manager: State<'_, FileManager>,
    versions_data: State<'_, VersionData>,
    id: i64,
    game_version: String,
) -> Result<bool, String> {
    async move {
        let mut conn = db.0.get()?;
        let schematic = find_schematic(&mut conn, id)?;
        let option = versions_data
            .game_versions_for_format(schematic.schematic_type, schematic.sub_type)
            .into_iter()
            .find(|version| version.name == game_version)
            .ok_or_else(|| {
                anyhow::anyhow!(
                    "unsupported game version {game_version} for schematic type {}",
                    schematic.schematic_type
                )
            })?;

        if schematic.schematic_type != 6 {
            let mut data = file_manager.get_schematic_value(
                id,
                schematic.version,
                schematic.sub_type,
                schematic.schematic_type,
            )?;
            set_game_data_version(
                &mut data,
                schematic.schematic_type,
                schematic.sub_type,
                option.id,
            )
            .map_err(anyhow::Error::msg)?;
            file_manager.save_nbt_value(
                id,
                data,
                schematic.version,
                schematic.sub_type,
                schematic.schematic_type,
                true,
            )?;
        }

        update_schematic_game_version(&mut conn, &game_version, id)?;
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
            file_manager.save_snbt_le_value(id, &snbt, version, sub_version, v_type)?;
        } else {
            file_manager.save_snbt_value(id, &snbt, version, sub_version, v_type, true)?;
        }

        Ok(true)
    }
    .await
    .map_err(|e: anyhow::Error| e.to_string())
}

#[cfg(test)]
mod game_version_tests {
    use super::set_game_data_version;
    use fastnbt::Value;
    use std::collections::HashMap;

    #[test]
    fn writes_data_version_to_supported_java_roots() {
        let mut create = Value::Compound(HashMap::new());
        set_game_data_version(&mut create, 1, -1, 3465).expect("create root");
        let Value::Compound(create_root) = create else {
            panic!("expected compound root");
        };
        assert_eq!(create_root.get("DataVersion"), Some(&Value::Int(3465)));

        let mut litematic = Value::Compound(HashMap::new());
        set_game_data_version(&mut litematic, 2, -1, 3700).expect("litematic root");
        let Value::Compound(litematic_root) = litematic else {
            panic!("expected compound root");
        };
        assert_eq!(
            litematic_root.get("MinecraftDataVersion"),
            Some(&Value::Int(3700))
        );
    }

    #[test]
    fn writes_data_version_to_both_worldedit_root_shapes() {
        let mut modern = Value::Compound(HashMap::new());
        set_game_data_version(&mut modern, 3, 0, 3955).expect("modern WorldEdit root");
        let Value::Compound(modern_root) = modern else {
            panic!("expected compound root");
        };
        assert_eq!(modern_root.get("DataVersion"), Some(&Value::Int(3955)));

        let mut nested_root = HashMap::new();
        nested_root.insert("Schematic".to_string(), Value::Compound(HashMap::new()));
        let mut nested = Value::Compound(nested_root);
        set_game_data_version(&mut nested, 3, 1, 1343).expect("wrapped WorldEdit root");
        let Value::Compound(root) = nested else {
            panic!("expected compound root");
        };
        let Value::Compound(schematic) = root.get("Schematic").expect("Schematic root") else {
            panic!("expected nested compound");
        };
        assert_eq!(schematic.get("DataVersion"), Some(&Value::Int(1343)));
    }

    #[test]
    fn worldedit_shape_takes_precedence_over_stale_subtype() {
        let mut direct_root = Value::Compound(HashMap::new());
        set_game_data_version(&mut direct_root, 3, 1, 3465)
            .expect("direct root should not depend on subtype");
        let Value::Compound(direct) = direct_root else {
            panic!("expected compound root");
        };
        assert_eq!(direct.get("DataVersion"), Some(&Value::Int(3465)));

        let mut wrapped_map = HashMap::new();
        wrapped_map.insert("Schematic".to_string(), Value::Compound(HashMap::new()));
        let mut wrapped_root = Value::Compound(wrapped_map);
        set_game_data_version(&mut wrapped_root, 3, 0, 3700)
            .expect("wrapped root should not depend on subtype");
        let Value::Compound(root) = wrapped_root else {
            panic!("expected compound root");
        };
        let Value::Compound(schematic) = root.get("Schematic").expect("Schematic root") else {
            panic!("expected nested compound");
        };
        assert_eq!(schematic.get("DataVersion"), Some(&Value::Int(3700)));
    }

    #[test]
    fn legacy_schematic_game_version_is_metadata_only() {
        let mut legacy = Value::Compound(HashMap::new());
        set_game_data_version(&mut legacy, 6, -1, 1343).expect("legacy format");
        let Value::Compound(root) = legacy else {
            panic!("expected compound root");
        };
        assert!(!root.contains_key("DataVersion"));
    }
}
