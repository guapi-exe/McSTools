use tauri::{AppHandle, Manager, State};
use std::fs;
use anyhow::{Context};
use anyhow::Result;
use crate::database::db_control::{drop_all_tables_in_transaction, DatabaseState};
#[tauri::command]
pub async fn clear_app_data(
    app_handle: AppHandle,
    db: State<'_, DatabaseState>
) -> Result<(), String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .context("Unable to retrieve the application data directory").map_err(|e| e.to_string())?
        .join("data")
        .join("schematic");
    if !app_data_dir.exists() {
        return Ok(());
    }
    let conn = db.0.get().map_err(|e| e.to_string())?;
    drop_all_tables_in_transaction(&conn).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(&app_data_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();

        if path.is_file() {
            fs::remove_file(&path).map_err(|e| format!("Cannot delete {}: {}", path.display(), e))?;
        }
        if path.is_dir() {
            fs::remove_dir_all(&path).map_err(|e| format!("Cannot delete {}: {}", path.display(), e))?;
        }
    }
    Ok(())
}
