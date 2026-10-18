//! Native save-copy endpoint: no arbitrary destination paths or encoded files
//! cross the WebView boundary. Existing files are never silently overwritten.
use crate::data_files::files::FileManager;
use crate::database::{db_apis::schematics_api::find_schematic, db_control::DatabaseState};
use crate::modules::{
    blueprint_editor::{BlueprintEditorState, export_snapshot},
    modules_data::convert_data::{ConversionOutput, Target},
    schematic::encode_uploaded_schematic,
};
use crate::utils::{
    blueprint_export::{self, ExportFormat, ExportOptions},
    minecraft_data::versions_data::VersionData,
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

pub(crate) static EXPORT_WORKER: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(1);

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum ExportSource {
    Generated {
        generation_id: u64,
    },
    Editor {
        session_id: u64,
        revision: u64,
        scope: String,
        region: Option<EditRegion>,
    },
    Library {
        id: i64,
        version: i32,
    },
}
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExportDestination {
    File,
    Library,
    Converted,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportPlan {
    source_data_version: Option<i32>,
    output_data_version: Option<i32>,
    size: Size,
    compatibility: Option<VersionConversionPlan>,
    warnings: Vec<String>,
    can_save_cache: bool,
    cached: Option<Target>,
}
#[derive(Serialize)]
pub struct ExportResult {
    canceled: bool,
    filename: Option<String>,
    bytes: usize,
    destination: &'static str,
}

struct LibrarySource {
    id: i64,
    version: i32,
    format: i32,
    subtype: i32,
}
struct ParsedSource {
    data: Arc<SchematicData>,
    data_version: Option<i32>,
    name: String,
    library: Option<LibrarySource>,
}
impl ParsedSource {
    fn can_cache(&self, options: &ExportOptions) -> bool {
        self.library.as_ref().is_some_and(|source| {
            (source.format, source.subtype)
                != (options.format, blueprint_export::cache_subtype(options))
        })
    }
}

fn source_data(app: &AppHandle, source: ExportSource) -> Result<ParsedSource> {
    match source {
        ExportSource::Generated { generation_id } => {
            use crate::modules::generated_blueprint::{
                GeneratedBlueprintState, SOURCE_DATA_VERSION,
            };
            let source = app
                .state::<GeneratedBlueprintState>()
                .snapshot(generation_id)?;
            Ok(ParsedSource {
                data: source.data,
                data_version: Some(SOURCE_DATA_VERSION),
                name: source.name,
                library: None,
            })
        }
        ExportSource::Editor {
            session_id,
            revision,
            scope,
            region,
        } => {
            let (data, data_version, name) = export_snapshot(
                &app.state::<BlueprintEditorState>(),
                session_id,
                revision,
                &scope,
                region,
            )?;
            Ok(ParsedSource {
                data,
                data_version,
                name,
                library: None,
            })
        }
        ExportSource::Library {
            id,
            version: expected_version,
        } => {
            let db = app.state::<DatabaseState>();
            let mut conn = db.0.get()?;
            let source = find_schematic(&mut conn, id)?;
            drop(conn);
            anyhow::ensure!(!source.is_deleted, "source blueprint has been deleted");
            anyhow::ensure!(
                source.version == expected_version,
                "stale source version; reopen the export dialog"
            );
            let (data, version) = app.state::<FileManager>().get_schematic_with_version(
                id,
                source.version,
                source.sub_type,
                source.schematic_type,
            )?;
            Ok(ParsedSource {
                data: Arc::new(data),
                data_version: version,
                name: source.name,
                library: Some(LibrarySource {
                    id,
                    version: source.version,
                    format: source.schematic_type,
                    subtype: source.sub_type,
                }),
            })
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
        let _permit = _permit;
        let parsed = source_data(&app, source)?;
        let data = &parsed.data;
        let source_version = parsed.data_version;
        let can_save_cache = parsed.can_cache(&options);
        let cached = if let Some(source) = &parsed.library {
            let conversions = app.state::<FileManager>().get_convert_data(
                source.id,
                source.version,
                source.subtype,
                source.format,
            )?;
            crate::modules::modules_data::convert_data::SchematicType::from_code(options.format)
                .and_then(|kind| {
                    conversions
                        .schematics
                        .get(&kind)?
                        .get(&blueprint_export::cache_subtype(&options))
                        .cloned()
                })
        } else {
            None
        };
        let output_data_version = blueprint_export::validate(&options, source_version)?;
        let compatibility = blueprint_export::plan(&data, &options, source_version)?;
        let warnings = blueprint_export::warnings(&data, &options, source_version);
        Ok(ExportPlan {
            source_data_version: source_version,
            output_data_version,
            size: data.size,
            compatibility,
            warnings,
            can_save_cache,
            cached,
        })
    })
    .await
    .map_err(|_| "export preview worker failed".to_string())?
    .map_err(|e| e.to_string())
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
        let _permit = _permit;
        // Immutable capture prevents a later edit from changing the chosen export.
        let parsed = source_data(&app, source)?;
        let data = &parsed.data;
        let version = parsed.data_version;
        let name = &parsed.name;
        if matches!(destination, ExportDestination::Converted) {
            anyhow::ensure!(
                parsed.can_cache(&options),
                "conversion would overwrite the source; use save copy instead"
            );
        }
        blueprint_export::validate(&options, version)?;
        let extension = blueprint_export::extension(options.format)?;
        let filename = copy_filename(&name, extension);
        let path = match destination {
            ExportDestination::Library | ExportDestination::Converted => None,
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
                let path = crate::utils::atomic_file::destination(&path.with_extension(extension))?;
                anyhow::ensure!(
                    !path.exists(),
                    "copy destination already exists; select a new filename"
                );
                Some(path)
            }
        };
        let encoded = blueprint_export::encode_named(&data, &options, version, name)?;
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
        } else if matches!(destination, ExportDestination::Converted) {
            let source = parsed
                .library
                .as_ref()
                .context("conversion cache requires a library source")?;
            let output_version = blueprint_export::validate(&options, version)?;
            let versions = app.state::<VersionData>();
            let game_version = output_version.and_then(|id| {
                versions
                    .get_name(id)
                    .map(|name| name.to_string())
                    .or_else(|| {
                        crate::mcedit::legacy_map::legacy_version_for_data_version(id)
                            .map(str::to_string)
                    })
            });
            let output = ConversionOutput {
                data_version: output_version,
                game_version,
                format_version: options.subtype,
            };
            let path = app.state::<FileManager>().save_conversion_data(
                source.id,
                source.version,
                source.format,
                source.subtype,
                &options,
                &encoded,
                output,
            )?;
            Ok(ExportResult {
                canceled: false,
                filename: path.file_name().map(|s| s.to_string_lossy().into_owned()),
                bytes,
                destination: "converted",
            })
        } else {
            tauri::async_runtime::block_on(encode_uploaded_schematic(
                app.clone(),
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
