//! Native save-copy endpoint: no arbitrary destination paths or encoded files
//! cross the WebView boundary. Existing files are never silently overwritten.
use crate::data_files::files::FileManager;
use crate::database::{db_apis::schematics_api::find_schematic, db_control::DatabaseState};
use crate::modules::{
    blueprint_editor::{BlueprintEditorState, export_snapshot},
    schematic::encode_uploaded_schematic,
};
use crate::utils::{
    blueprint_export::{self, ExportFormat, ExportOptions},
    minecraft_data::{je_blocks_data::BlocksData, versions_data::VersionData},
    schematic_data::{SchematicData, Size},
    schematic_editing::EditRegion,
    version_conversion::VersionConversionPlan,
};
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

static EXPORT_WORKER: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(1);

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum ExportSource {
    Editor {
        session_id: u64,
        revision: u64,
        scope: String,
        region: Option<EditRegion>,
    },
    Library {
        id: i64,
    },
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExportDestination {
    File,
    Library,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportPlan {
    source_data_version: Option<i32>,
    output_data_version: Option<i32>,
    size: Size,
    compatibility: Option<VersionConversionPlan>,
    warnings: Vec<String>,
}
#[derive(Serialize)]
pub struct ExportResult {
    canceled: bool,
    filename: Option<String>,
    bytes: usize,
    destination: &'static str,
}

fn source_data(
    app: &AppHandle,
    source: ExportSource,
) -> Result<(Arc<SchematicData>, Option<i32>, String)> {
    match source {
        ExportSource::Editor {
            session_id,
            revision,
            scope,
            region,
        } => export_snapshot(
            &app.state::<BlueprintEditorState>(),
            session_id,
            revision,
            &scope,
            region,
        ),
        ExportSource::Library { id } => {
            let db = app.state::<DatabaseState>();
            let mut conn = db.0.get()?;
            let source = find_schematic(&mut conn, id)?;
            drop(conn);
            let (data, version) = app.state::<FileManager>().get_schematic_with_version(
                id,
                source.version,
                source.sub_type,
                source.schematic_type,
            )?;
            Ok((Arc::new(data), version, source.name))
        }
    }
}

#[tauri::command]
pub fn get_blueprint_export_formats() -> Vec<ExportFormat> {
    blueprint_export::export_formats()
}

#[tauri::command]
pub async fn plan_blueprint_export(
    app: AppHandle,
    source: ExportSource,
    options: ExportOptions,
) -> Result<ExportPlan, String> {
    let _permit = EXPORT_WORKER
        .acquire()
        .await
        .map_err(|_| "export worker is unavailable")?;
    tauri::async_runtime::spawn_blocking(move || -> Result<ExportPlan> {
        let (data, source_version, _) = source_data(&app, source)?;
        let output_data_version = blueprint_export::validate(&options, source_version)?;
        let compatibility = blueprint_export::plan(&data, &options, source_version)?;
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
        if options.format == 5 {
            warnings.push("BE 使用独立含水层及状态映射，不应用 Java 游戏版本转换；跨版本实体 NBT 请在游戏中复核。".into());
        }
        Ok(ExportPlan { source_data_version: source_version, output_data_version,
            size: data.size, compatibility, warnings })
    }).await.map_err(|_| "export preview worker failed".to_string())?.map_err(|e| e.to_string())
}

fn copy_filename(name: &str, extension: &str) -> String {
    let stem = std::path::Path::new(name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("blueprint");
    let clean: String = stem
        .chars()
        .filter(|c| !c.is_control() && !r#"<>:"/\|?*"#.contains(*c))
        .take(80)
        .collect();
    let clean = clean.trim_matches([' ', '.']);
    let clean = if clean.is_empty() { "blueprint" } else { clean };
    format!("{clean}_copy.{extension}")
}

#[tauri::command]
pub async fn save_blueprint_export(
    app: AppHandle,
    source: ExportSource,
    options: ExportOptions,
    destination: ExportDestination,
) -> Result<ExportResult, String> {
    let _permit = EXPORT_WORKER
        .acquire()
        .await
        .map_err(|_| "export worker is unavailable")?;
    tauri::async_runtime::spawn_blocking(move || -> Result<ExportResult> {
        // Immutable capture prevents a later edit from changing the chosen export.
        let (data, version, name) = source_data(&app, source)?;
        blueprint_export::validate(&options, version)?;
        let extension = blueprint_export::extension(options.format)?;
        let filename = copy_filename(&name, extension);
        let path = match destination {
            ExportDestination::Library => None,
            ExportDestination::File => {
                let choice = app
                    .dialog()
                    .file()
                    .add_filter("Blueprint", &[extension])
                    .set_file_name(&filename)
                    .blocking_save_file();
                let Some(choice) = choice else {
                    return Ok(ExportResult {
                        canceled: true,
                        filename: None,
                        bytes: 0,
                        destination: "file",
                    });
                };
                let path = choice
                    .into_path()
                    .map_err(|_| anyhow::anyhow!("destination must be a local file"))?;
                let path = path.with_extension(extension);
                anyhow::ensure!(
                    !path.exists(),
                    "copy destination already exists; select a new filename"
                );
                Some(path)
            }
        };
        let encoded = blueprint_export::encode(&data, &options, version)?;
        let bytes = encoded.len();
        if let Some(path) = path {
            let parent = path.parent().context("invalid destination folder")?;
            let mut temporary = tempfile::Builder::new()
                .prefix(".mcstools-export-")
                .tempfile_in(parent)?;
            temporary.write_all(&encoded)?;
            temporary.as_file().sync_all()?;
            temporary
                .persist_noclobber(&path)
                .context("could not save copy; existing files were not replaced")?;
            Ok(ExportResult {
                canceled: false,
                filename: path.file_name().map(|s| s.to_string_lossy().into_owned()),
                bytes,
                destination: "file",
            })
        } else {
            tauri::async_runtime::block_on(encode_uploaded_schematic(
                app.state::<DatabaseState>(),
                app.state::<FileManager>(),
                app.state::<VersionData>(),
                app.state::<BlocksData>(),
                filename.clone(),
                encoded,
                false,
                -1,
            ))
            .map_err(|e| anyhow::anyhow!(e))?;
            Ok(ExportResult {
                canceled: false,
                filename: Some(filename),
                bytes,
                destination: "library",
            })
        }
    })
    .await
    .map_err(|_| "export worker failed".to_string())?
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn copy_names_cannot_escape_or_replace_source() {
        assert_eq!(
            copy_filename("../chest.litematic", "schem"),
            "chest_copy.schem"
        );
        assert_eq!(
            copy_filename("chest<>:\n.litematic", "nbt"),
            "chest_copy.nbt"
        );
        assert_eq!(
            copy_filename(" . ", "schematic"),
            "blueprint_copy.schematic"
        );
    }
}
