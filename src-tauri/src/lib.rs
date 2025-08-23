mod CMS;
mod be_schematic;
mod building_gadges;
pub mod create;
mod data_files;
mod database;
pub mod litematica;
mod map_art;
pub mod modules;
pub mod utils;
mod word_edit;
mod split_schematic;

use crate::database::db_control;
use crate::litematica::lm_schematic::LmSchematic;
use crate::utils::minecraft_data::je_blocks_data::BlocksData;
use crate::utils::minecraft_data::map_art_data::MapArtsData;
use crate::utils::schematic_data::SchematicError;
use data_files::{config, config::get_config, config::update_config, files::FileManager};
use database::db_apis::logs_api::{add_logs, get_logs};
use database::db_apis::schematic_data_api::{get_schematic_requirements, get_unique_block};
use database::db_apis::schematics_api::{add_schematic, get_schematic, get_schematics, count_schematics};
use database::db_apis::user_api::{get_user_data, update_user_classification_tauri, get_user_classification};
use modules::convert::{convert, get_je_blocks, get_map_arts, get_schematic_convert_data};
use modules::history::get_history;
use modules::map_art::create_map_art;
use modules::modules_data;
use modules::replace::schematic_replacement;
use modules::schematic::{
    copy_schematic, delete_schematic, encode_uploaded_schematic, get_schematic_str,
    update_schematic_name_description, get_schematic_data, update_schematic_classification_tauri
};
use split_schematic::split_schematic::schematic_split;
use std::time::Instant;
use sysinfo::{Pid, ProcessesToUpdate, System};
use tauri::Manager;
use utils::loading::close_splashscreen;
use utils::minecraft_data::versions_data::VersionData;
use CMS::get_cms_data::perform_search;
use utils::open_dev::open_dev;
use data_files::data_flies::clear_app_data;

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
            let config = config::init_config(app.handle()).expect("Configuration system initialization failed");
            app.manage(config);
            let file_manager = FileManager::new(app.handle())?;
            app.manage(file_manager);
            let version_data = VersionData::new();
            app.manage(version_data);
            let je_blocks = BlocksData::new()?;
            app.manage(je_blocks);
            let map_arts = MapArtsData::new()?;
            app.manage(map_arts);
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            close_splashscreen,
            get_config,
            convert,
            get_history,
            update_config,
            open_dev,
            encode_uploaded_schematic,
            count_schematics,
            create_map_art,
            update_schematic_name_description,
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
            clear_app_data,
            get_logs,
            add_schematic,
            get_schematic,
            get_schematics,
            get_schematic_requirements,
            get_unique_block,
            get_schematic_str,
            get_schematic_data,
            get_schematic_convert_data
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[test]
fn test_unique() -> Result<(), SchematicError> {
    let mut sys = System::new_all();
    let pid = Pid::from(std::process::id() as usize);

    sys.refresh_processes(ProcessesToUpdate::All, false);
    let start_mem = sys.process(pid).map(|p| p.memory()).unwrap_or(0);
    let start_time = Instant::now();
    let schematic2 =
        LmSchematic::new("./schematic/36fbf6f4-5f07-4370-b4c5-cefdb12c4b92.litematic")?;
    let schem2 = schematic2.get_blocks_pos()?;
    let unique_blocks = modules_data::convert_data::get_unique_block(&schem2.blocks);
    println!("unique_blocks: {:?}", unique_blocks);
    sys.refresh_processes(ProcessesToUpdate::All, false);
    let end_mem = sys.process(pid).map(|p| p.memory()).unwrap_or(0);
    let duration = start_time.elapsed();

    println!("执行时间: {:.2} 秒", duration.as_secs_f64());
    println!(
        "内存消耗: {} KB → {} KB (增量: {} KB)",
        start_mem / 1024,
        end_mem / 1024,
        (end_mem - start_mem) / 1024
    );
    Ok(())
}
