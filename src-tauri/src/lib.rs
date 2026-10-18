mod CMS;
mod be_schematic;
mod building_gadges;
pub mod create;
mod data_files;
mod database;
pub mod litematica;
mod map_art;
mod mcedit;
pub mod modules;
mod split_schematic;
pub mod utils;
mod word_edit;

use crate::database::db_control;
use crate::mcedit::legacy_map::get_legacy_block_versions;
use crate::utils::minecraft_data::java_block_states::{
    get_java_block_by_state_id, get_java_block_state, get_java_block_versions,
};
use crate::utils::minecraft_data::je_blocks_data::BlocksData;
use crate::utils::minecraft_data::map_art_data::MapArtsData;
use CMS::get_cms_data::perform_search;
use data_files::data_flies::clear_app_data;
use data_files::{config, config::get_config, config::update_config, files::FileManager};
use database::db_apis::logs_api::{add_logs, get_logs};
use database::db_apis::schematic_data_api::{get_schematic_requirements, get_unique_block};
use database::db_apis::schematics_api::{
    add_schematic, count_schematics, get_distinct_game_versions, get_schematic, get_schematics,
};
use database::db_apis::user_api::{
    get_user_classification, get_user_data, update_user_classification_tauri,
};
use modules::be_clear_air::{be_clear_air, be_has_air};
use modules::convert::{
    convert_lm, get_je_blocks, get_map_arts, get_schematic_convert_data,
};
use modules::history::get_history;
use modules::map_art::{create_map_art, create_map_art_from_pixels};
use modules::mcs_api::{McsApiState, import_mcs_blueprint, mcs_api_get, mcs_api_preview, set_mcs_api_key};
use modules::blueprint_editor::{BlueprintEditorState, open_blueprint_editor, stage_blueprint_edit, commit_blueprint_edit, cancel_blueprint_edit, close_blueprint_editor};
use modules::blueprint_export::{get_blueprint_export_formats, plan_blueprint_export, save_blueprint_export};
use modules::generated_blueprint::{GeneratedBlueprintState, stage_generated_blueprint, release_generated_blueprint};
use modules::replace::schematic_replacement;
use modules::schematic::{
    copy_schematic, delete_schematic, encode_uploaded_schematic, get_schematic_data,
    get_schematic_preview_data, get_schematic_str, save_snbt,
    update_schematic_classification_tauri, update_schematic_game_version_tauri,
    update_schematic_name_description,
};
use split_schematic::split_schematic::schematic_split;
use tauri::Manager;
use utils::loading::close_splashscreen;
use utils::minecraft_data::versions_data::{VersionData, get_schematic_game_versions};
use utils::open_dev::open_dev;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            let db_state = db_control::init_db(app.handle())?;
            app.manage(db_state);
            let config = config::init_config(app.handle())
                .expect("Configuration system initialization failed");
            app.manage(config);
            let file_manager = FileManager::new(app.handle())?;
            app.manage(file_manager);
            let version_data = VersionData::new();
            app.manage(version_data);
            let je_blocks = BlocksData::new(app.handle())?;
            app.manage(je_blocks);
            let map_arts = MapArtsData::new(app.handle())?;
            app.manage(map_arts);
            app.manage(McsApiState::new()?);
            app.manage(BlueprintEditorState::default());
            app.manage(GeneratedBlueprintState::default());
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            close_splashscreen,
            get_config,
            convert_lm,
            be_has_air,
            be_clear_air,
            get_history,
            update_config,
            save_snbt,
            open_dev,
            encode_uploaded_schematic,
            count_schematics,
            get_distinct_game_versions,
            create_map_art,
            create_map_art_from_pixels,
            update_schematic_name_description,
            update_schematic_game_version_tauri,
            get_user_data,
            get_user_classification,
            copy_schematic,
            delete_schematic,
            add_logs,
            schematic_split,
            schematic_replacement,
            update_user_classification_tauri,
            update_schematic_classification_tauri,
            get_je_blocks,
            perform_search,
            get_map_arts,
            set_mcs_api_key,
            mcs_api_get,
            mcs_api_preview,
            import_mcs_blueprint,
            open_blueprint_editor,
            stage_blueprint_edit,
            commit_blueprint_edit,
            cancel_blueprint_edit,
            close_blueprint_editor,
            get_blueprint_export_formats,
            stage_generated_blueprint,
            release_generated_blueprint,
            plan_blueprint_export,
            save_blueprint_export,
            clear_app_data,
            get_logs,
            add_schematic,
            get_schematic,
            get_schematics,
            get_schematic_requirements,
            get_unique_block,
            get_schematic_str,
            get_schematic_data,
            get_schematic_preview_data,
            get_schematic_convert_data,
            get_java_block_versions,
            get_java_block_state,
            get_java_block_by_state_id,
            get_legacy_block_versions,
            get_schematic_game_versions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
