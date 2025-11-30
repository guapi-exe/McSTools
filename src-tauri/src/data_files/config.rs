use anyhow::{Context, Result};
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub fn get_config_dir(app: &AppHandle) -> Result<PathBuf> {
    let path_resolver = app.path();

    let config_dir = path_resolver
        .app_config_dir()
        .context("Unable to obtain configuration directory")?
        .join("mc-blueprint-tool");

    if !config_dir.exists() {
        fs::create_dir_all(&config_dir).context("Failed to create configuration directory")?;
    }
    Ok(config_dir)
}

pub fn init_config(app: &AppHandle) -> Result<Value> {
    let config_file = get_config_dir(app)?.join("config.json");

    if !config_file.exists() {
        let default_config = json!({
            "theme": "dark",
            "auto_update": true,
            "max_history": 10,
            "workspace": {
                "last_project": "",
                "recent_files": []
            }
        });

        fs::write(&config_file, serde_json::to_string_pretty(&default_config)?)
            .context("Failed to write default configuration")?;
        Ok(default_config)
    } else {
        let config = read_config(app)?;
        Ok(config)
    }
}

pub fn read_config(app: &AppHandle) -> Result<Value> {
    let config_file = get_config_dir(app)?.join("config.json");
    let content = fs::read_to_string(config_file).context("Failed to read configuration file")?;

    serde_json::from_str(&content).context("Failed to parse configuration file")
}

pub fn save_config(app: &AppHandle, config: Value) -> Result<()> {
    let config_file = get_config_dir(app)?.join("config.json");
    fs::write(&config_file, serde_json::to_string_pretty(&config)?).context("Failed to save configuration")
}

#[tauri::command]
pub async fn get_config(app: AppHandle) -> Result<Value, String> {
    read_config(&app).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_config(app: AppHandle, new_config: Value) -> Result<(), String> {
    save_config(&app, new_config).map_err(|e| e.to_string())
}
