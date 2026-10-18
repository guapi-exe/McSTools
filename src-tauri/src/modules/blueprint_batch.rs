//! Ephemeral, local-only batch conversion. Source and result bytes remain in
//! native memory; parsing/encoding use the same bounded core as individual exports.
use super::batch_archive::{self as archive, FILE_LIMIT, INPUT_LIMIT, OUTPUT_LIMIT, check_cancel};
use crate::utils::{
    blueprint_export::{self, ExportOptions},
    parse_limits::ParseLimits,
    schematic_data::SchematicData,
};
use anyhow::{Context, Result, ensure};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
};
use tauri::{
    AppHandle, Manager,
    ipc::{InvokeBody, Request},
};
use tauri_plugin_dialog::DialogExt;
static INPUT_WORKER: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(1);

#[derive(Clone, Default)]
pub struct BlueprintBatchState(Arc<Mutex<Store>>);
#[derive(Default)]
struct Store {
    next: u64,
    session: Option<Session>,
}
struct Session {
    id: u64,
    entries: Vec<Entry>,
    input_bytes: usize,
    output_bytes: usize,
    options: Option<ExportOptions>,
    job: Option<Job>,
}
struct Job {
    id: u64,
    kind: &'static str,
    cancel: Arc<AtomicBool>,
}
struct Entry {
    info: BatchItem,
    input: Arc<Vec<u8>>,
    output: Option<Arc<Vec<u8>>>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchItem {
    pub id: u64,
    pub name: String,
    pub origin: &'static str,
    pub archive_name: Option<String>,
    pub size: usize,
    pub status: &'static str,
    pub error: Option<String>,
    pub output_name: Option<String>,
    pub output_bytes: usize,
    pub source_data_version: Option<i32>,
    pub output_data_version: Option<i32>,
    pub warnings: Vec<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchSnapshot {
    pub id: u64,
    pub items: Vec<BatchItem>,
    pub input_bytes: usize,
    pub output_bytes: usize,
    pub busy: Option<&'static str>,
    pub stopping: bool,
    pub options: Option<ExportOptions>,
}
struct Ticket {
    batch: u64,
    job: u64,
    cancel: Arc<AtomicBool>,
}
struct Input {
    name: String,
    archive_name: Option<String>,
    bytes: Vec<u8>,
}
struct Conversion {
    bytes: Vec<u8>,
    source_version: Option<i32>,
    output_version: Option<i32>,
    warnings: Vec<String>,
}
impl Store {
    fn next(&mut self) -> Result<u64> {
        self.next = self.next.checked_add(1).context("batch ID overflow")?;
        Ok(self.next)
    }
    fn session(&mut self, id: u64) -> Result<&mut Session> {
        self.session
            .as_mut()
            .filter(|s| s.id == id)
            .context("stale batch session")
    }
}
impl Session {
    fn snapshot(&self) -> BatchSnapshot {
        BatchSnapshot {
            id: self.id,
            items: self.entries.iter().map(|e| e.info.clone()).collect(),
            input_bytes: self.input_bytes,
            output_bytes: self.output_bytes,
            busy: self.job.as_ref().map(|j| j.kind),
            stopping: self
                .job
                .as_ref()
                .is_some_and(|j| j.cancel.load(Ordering::Acquire)),
            options: self.options.clone(),
        }
    }
}
impl BlueprintBatchState {
    pub fn create(&self) -> Result<BatchSnapshot> {
        let mut store = self
            .0
            .lock()
            .map_err(|_| anyhow::anyhow!("batch lock failed"))?;
        ensure!(store.session.is_none(), "another batch session is open");
        let id = store.next()?;
        store.session = Some(Session {
            id,
            entries: Vec::new(),
            input_bytes: 0,
            output_bytes: 0,
            options: None,
            job: None,
        });
        Ok(store.session(id)?.snapshot())
    }
    pub fn snapshot(&self, id: u64) -> Result<BatchSnapshot> {
        Ok(self
            .0
            .lock()
            .map_err(|_| anyhow::anyhow!("batch lock failed"))?
            .session(id)?
            .snapshot())
    }
    fn begin(&self, id: u64, kind: &'static str) -> Result<Ticket> {
        let mut store = self
            .0
            .lock()
            .map_err(|_| anyhow::anyhow!("batch lock failed"))?;
        ensure!(
            store.session(id)?.job.is_none(),
            "another batch operation is running"
        );
        let job = store.next()?;
        let cancel = Arc::new(AtomicBool::new(false));
        store.session(id)?.job = Some(Job {
            id: job,
            kind,
            cancel: cancel.clone(),
        });
        Ok(Ticket {
            batch: id,
            job,
            cancel,
        })
    }
    fn finish(&self, ticket: &Ticket) {
        if let Ok(mut store) = self.0.lock() {
            if let Ok(session) = store.session(ticket.batch) {
                if session.job.as_ref().is_some_and(|j| j.id == ticket.job) {
                    session.job = None;
                }
            }
        }
    }
    pub fn cancel(&self, id: u64) -> Result<()> {
        let mut store = self
            .0
            .lock()
            .map_err(|_| anyhow::anyhow!("batch lock failed"))?;
        if let Some(job) = &store.session(id)?.job {
            job.cancel.store(true, Ordering::Release);
        }
        Ok(())
    }
    pub fn release(&self, id: u64) -> Result<()> {
        let mut store = self
            .0
            .lock()
            .map_err(|_| anyhow::anyhow!("batch lock failed"))?;
        if store.session.as_ref().is_some_and(|s| s.id == id) {
            if let Some(job) = store.session.as_ref().and_then(|s| s.job.as_ref()) {
                job.cancel.store(true, Ordering::Release);
            }
            store.session = None;
        }
        Ok(())
    }
    pub fn remove(&self, id: u64, items: &[u64]) -> Result<BatchSnapshot> {
        let mut store = self
            .0
            .lock()
            .map_err(|_| anyhow::anyhow!("batch lock failed"))?;
        let session = store.session(id)?;
        ensure!(session.job.is_none(), "another batch operation is running");
        let ids: HashSet<_> = items.iter().copied().collect();
        session
            .entries
            .retain(|entry| !ids.contains(&entry.info.id));
        session.input_bytes = session.entries.iter().map(|e| e.input.len()).sum();
        session.output_bytes = session
            .entries
            .iter()
            .map(|e| e.output.as_ref().map_or(0, |b| b.len()))
            .sum();
        if session.output_bytes == 0 {
            session.options = None;
        }
        Ok(session.snapshot())
    }
    fn commit_inputs(&self, ticket: &Ticket, inputs: Vec<Input>) -> Result<BatchSnapshot> {
        check_cancel(&ticket.cancel)?;
        let mut store = self
            .0
            .lock()
            .map_err(|_| anyhow::anyhow!("batch lock failed"))?;
        let session = store.session(ticket.batch)?;
        ensure!(
            session.job.as_ref().is_some_and(|j| j.id == ticket.job),
            "stale batch operation"
        );
        ensure!(
            session.entries.len() + inputs.len() <= FILE_LIMIT,
            "batch file limit is 1000"
        );
        let size = inputs
            .iter()
            .try_fold(0usize, |n, entry| n.checked_add(entry.bytes.len()))
            .context("batch size overflow")?;
        ensure!(
            size <= INPUT_LIMIT.saturating_sub(session.input_bytes),
            "batch input limit is 256 MiB"
        );
        let mut names: HashSet<_> = session
            .entries
            .iter()
            .map(|e| e.info.name.to_lowercase())
            .collect();
        let mut staged = Vec::with_capacity(inputs.len());
        for input in inputs {
            let id = store.next()?;
            staged.push(Entry {
                info: BatchItem {
                    id,
                    name: archive::unique_name(&input.name, &mut names),
                    origin: if input.archive_name.is_some() {
                        "zip"
                    } else {
                        "file"
                    },
                    archive_name: input.archive_name,
                    size: input.bytes.len(),
                    status: "queued",
                    error: None,
                    output_name: None,
                    output_bytes: 0,
                    source_data_version: None,
                    output_data_version: None,
                    warnings: Vec::new(),
                },
                input: Arc::new(input.bytes),
                output: None,
            });
        }
        check_cancel(&ticket.cancel)?;
        let session = store.session(ticket.batch)?;
        session.entries.extend(staged);
        session.input_bytes += size;
        session.job = None;
        Ok(session.snapshot())
    }
    fn prepare_conversion(
        &self,
        id: u64,
        item_id: u64,
        options: &ExportOptions,
    ) -> Result<(Ticket, Arc<Vec<u8>>, String)> {
        let mut store = self
            .0
            .lock()
            .map_err(|_| anyhow::anyhow!("batch lock failed"))?;
        let session = store.session(id)?;
        ensure!(session.job.is_none(), "another batch operation is running");
        if session.output_bytes > 0 {
            ensure!(
                session.options.as_ref().is_some_and(
                    |p| serde_json::to_value(p).ok() == serde_json::to_value(options).ok()
                ),
                "clear completed results before changing batch output settings"
            );
        }
        let entry = session
            .entries
            .iter_mut()
            .find(|e| e.info.id == item_id)
            .context("batch item not found")?;
        ensure!(entry.output.is_none(), "batch item is already completed");
        entry.info.status = "processing";
        entry.info.error = None;
        let bytes = entry.input.clone();
        let name = entry.info.name.clone();
        session.options = Some(options.clone());
        let job = store.next()?;
        let cancel = Arc::new(AtomicBool::new(false));
        store.session(id)?.job = Some(Job {
            id: job,
            kind: "convert",
            cancel: cancel.clone(),
        });
        Ok((
            Ticket {
                batch: id,
                job,
                cancel,
            },
            bytes,
            name,
        ))
    }
    fn finish_conversion(
        &self,
        ticket: &Ticket,
        item_id: u64,
        options: &ExportOptions,
        result: Result<Conversion>,
    ) -> Result<BatchItem> {
        let mut store = self
            .0
            .lock()
            .map_err(|_| anyhow::anyhow!("batch lock failed"))?;
        let session = store.session(ticket.batch)?;
        ensure!(
            session.job.as_ref().is_some_and(|j| j.id == ticket.job),
            "stale batch operation"
        );
        let mut used: HashSet<_> = session
            .entries
            .iter()
            .filter_map(|e| e.info.output_name.as_ref().map(|n| n.to_lowercase()))
            .collect();
        let entry = session
            .entries
            .iter_mut()
            .find(|e| e.info.id == item_id)
            .context("batch item not found")?;
        let result = result.and_then(|out| {
            ensure!(
                out.bytes.len() <= OUTPUT_LIMIT.saturating_sub(session.output_bytes),
                "batch output limit is 512 MiB; save and clear completed results"
            );
            Ok(out)
        });
        if ticket.cancel.load(Ordering::Acquire) {
            entry.info.status = "queued";
            entry.info.error = None;
        } else {
            match result {
                Ok(out) => {
                    let stem = entry
                        .info
                        .name
                        .rsplit_once('.')
                        .map_or(entry.info.name.as_str(), |(s, _)| s);
                    let filename = archive::unique_name(
                        &format!(
                            "{stem}-converted.{}",
                            blueprint_export::extension(options.format)?
                        ),
                        &mut used,
                    );
                    entry.info.status = "success";
                    entry.info.output_name = Some(filename);
                    entry.info.output_bytes = out.bytes.len();
                    entry.info.source_data_version = out.source_version;
                    entry.info.output_data_version = out.output_version;
                    entry.info.warnings = out.warnings;
                    session.output_bytes += out.bytes.len();
                    entry.output = Some(Arc::new(out.bytes));
                }
                Err(error) => {
                    entry.info.status = "error";
                    entry.info.error = Some(error.to_string());
                }
            }
        }
        session.job = None;
        Ok(entry.info.clone())
    }
    fn outputs(&self, id: u64, ids: &[u64]) -> Result<Vec<(String, Arc<Vec<u8>>)>> {
        ensure!(
            !ids.is_empty() && ids.len() <= FILE_LIMIT,
            "select batch results to save"
        );
        let mut seen = HashSet::new();
        let mut store = self
            .0
            .lock()
            .map_err(|_| anyhow::anyhow!("batch lock failed"))?;
        let session = store.session(id)?;
        ids.iter()
            .map(|id| {
                ensure!(seen.insert(*id), "duplicate batch output selection");
                let entry = session
                    .entries
                    .iter()
                    .find(|e| e.info.id == *id)
                    .context("batch output not found")?;
                Ok((
                    entry
                        .info
                        .output_name
                        .clone()
                        .context("batch item has no result")?,
                    entry.output.clone().context("batch item has no result")?,
                ))
            })
            .collect()
    }
}

fn expand_input(
    name: String,
    bytes: Vec<u8>,
    count: usize,
    budget: usize,
    cancel: &AtomicBool,
) -> Result<Vec<Input>> {
    check_cancel(cancel)?;
    if archive::extension(&name) == "zip" {
        Ok(archive::extract(&bytes, count, budget, cancel)?
            .into_iter()
            .map(|entry| Input {
                name: entry.name,
                archive_name: Some(entry.archive_name),
                bytes: entry.bytes,
            })
            .collect())
    } else {
        ensure!(
            archive::supported(&name),
            "unsupported batch file extension"
        );
        ensure!(
            count > 0 && bytes.len() <= budget,
            "batch input limit exceeded"
        );
        Ok(vec![Input {
            name: archive::safe_name(&name),
            archive_name: None,
            bytes,
        }])
    }
}
fn read_selected(path: &Path, cancel: &AtomicBool) -> Result<Vec<u8>> {
    let file = std::fs::File::open(path)?;
    let metadata = file.metadata()?;
    let limit = if archive::extension(&path.to_string_lossy()) == "zip" {
        archive::ARCHIVE_LIMIT
    } else {
        INPUT_LIMIT
    };
    ensure!(
        metadata.is_file() && metadata.len() <= limit as u64,
        "selected batch file exceeds the size limit"
    );
    let mut reader = file.take((limit + 1) as u64);
    let mut bytes = Vec::new();
    let mut chunk = [0u8; 64 * 1024];
    loop {
        check_cancel(cancel)?;
        let n = reader.read(&mut chunk)?;
        if n == 0 {
            break;
        }
        ensure!(
            n <= limit.saturating_sub(bytes.len()),
            "selected batch file grew beyond its limit"
        );
        bytes.extend_from_slice(&chunk[..n]);
    }
    Ok(bytes)
}
fn parse_source(name: &str, bytes: &[u8]) -> Result<(SchematicData, Option<i32>)> {
    use crate::{
        be_schematic::be_schematic::BESchematic,
        building_gadges::bg_schematic::BgSchematic,
        create::create_schematic::CreateSchematic,
        litematica::lm_schematic::LmSchematic,
        mcedit::{legacy_map, mcedit_schematic::McEditSchematic},
        word_edit::we_schematic::WeSchematic,
    };
    let limits = ParseLimits::default();
    limits.validate_input(bytes.len())?;
    Ok(match archive::extension(name).as_str() {
        "nbt" => {
            let s = CreateSchematic::new_from_bytes(bytes)?;
            (
                s.get_blocks_pos_with_limits(&limits)?,
                s.get_data_version().ok(),
            )
        }
        "litematic" => {
            let s = LmSchematic::new_from_bytes(bytes)?;
            (
                s.get_blocks_pos_with_limits(&limits)?,
                s.get_data_version().ok(),
            )
        }
        "schem" => {
            let s = WeSchematic::new_from_bytes(bytes)?;
            let subtype = s.get_type()?;
            (
                s.get_blocks_pos_with_limits(&limits)?,
                s.get_data_version(subtype).ok(),
            )
        }
        "json" => {
            let s = BgSchematic::new_from_slice(bytes)?;
            (s.get_blocks_pos_with_limits(&limits)?, None)
        }
        "mcstructure" => {
            let s = BESchematic::new_from_bytes(bytes)?;
            (s.get_blocks_pos_with_limits(&limits)?, None)
        }
        "schematic" => {
            let s = McEditSchematic::new_from_bytes(bytes)?;
            let version = legacy_map::declared_game_version(&s.nbt).and_then(|name| {
                crate::utils::minecraft_data::versions_data::VersionData::new()
                    .game_version_id(name)
            });
            (s.get_blocks_pos_with_limits(&limits)?, version)
        }
        _ => anyhow::bail!("unsupported batch file extension"),
    })
}
fn convert(
    name: &str,
    input: &[u8],
    options: &ExportOptions,
    cancel: &AtomicBool,
) -> Result<Conversion> {
    check_cancel(cancel)?;
    let (data, source_version) = parse_source(name, input)?;
    check_cancel(cancel)?;
    let output_version = blueprint_export::validate(options, source_version)?;
    let warnings = blueprint_export::warnings(&data, options, source_version);
    let bytes = blueprint_export::encode(&data, options, source_version)?;
    check_cancel(cancel)?;
    Ok(Conversion {
        bytes,
        source_version,
        output_version,
        warnings,
    })
}

#[tauri::command]
pub fn create_blueprint_batch(app: AppHandle) -> Result<BatchSnapshot, String> {
    app.state::<BlueprintBatchState>()
        .create()
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub fn get_blueprint_batch(app: AppHandle, batch_id: u64) -> Result<BatchSnapshot, String> {
    app.state::<BlueprintBatchState>()
        .snapshot(batch_id)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub fn cancel_blueprint_batch(app: AppHandle, batch_id: u64) -> Result<(), String> {
    app.state::<BlueprintBatchState>()
        .cancel(batch_id)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub fn release_blueprint_batch(app: AppHandle, batch_id: u64) -> Result<(), String> {
    app.state::<BlueprintBatchState>()
        .release(batch_id)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub fn remove_blueprint_batch_items(
    app: AppHandle,
    batch_id: u64,
    item_ids: Vec<u64>,
) -> Result<BatchSnapshot, String> {
    app.state::<BlueprintBatchState>()
        .remove(batch_id, &item_ids)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn pick_blueprint_batch_files(
    app: AppHandle,
    batch_id: u64,
) -> Result<BatchSnapshot, String> {
    let permit = INPUT_WORKER
        .try_acquire()
        .map_err(|_| "another batch import is still finishing")?;
    let state = app.state::<BlueprintBatchState>().inner().clone();
    let ticket = state.begin(batch_id, "import").map_err(|e| e.to_string())?;
    let cancel = ticket.cancel.clone();
    let before = state.snapshot(batch_id).map_err(|e| e.to_string())?;
    let result = tauri::async_runtime::spawn_blocking(move || -> Result<Vec<Input>> {
        let _permit = permit;
        let choices = app
            .dialog()
            .file()
            .add_filter(
                "Blueprints / ZIP",
                &[
                    "litematic",
                    "schem",
                    "schematic",
                    "nbt",
                    "mcstructure",
                    "json",
                    "zip",
                ],
            )
            .blocking_pick_files();
        check_cancel(&cancel)?;
        let mut inputs = Vec::new();
        let mut size = before.input_bytes;
        for choice in choices.unwrap_or_default() {
            check_cancel(&cancel)?;
            ensure!(
                before.items.len() + inputs.len() < FILE_LIMIT,
                "batch file limit is 1000"
            );
            let path = choice
                .into_path()
                .map_err(|_| anyhow::anyhow!("batch source must be a local file"))?;
            let name = path
                .file_name()
                .context("batch filename missing")?
                .to_string_lossy()
                .into_owned();
            let expanded = expand_input(
                name,
                read_selected(&path, &cancel)?,
                FILE_LIMIT.saturating_sub(before.items.len() + inputs.len()),
                INPUT_LIMIT.saturating_sub(size),
                &cancel,
            )?;
            size += expanded.iter().map(|i| i.bytes.len()).sum::<usize>();
            inputs.extend(expanded);
        }
        Ok(inputs)
    })
    .await
    .map_err(|_| anyhow::anyhow!("batch import worker failed"))
    .and_then(|r| r);
    let result = result.and_then(|inputs| state.commit_inputs(&ticket, inputs));
    state.finish(&ticket);
    result.map_err(|e| e.to_string())
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct DropMetadata {
    protocol: u8,
    batch_id: u64,
    name: String,
}
fn decode_input(body: &[u8]) -> Result<(DropMetadata, &[u8])> {
    ensure!(
        (4..=INPUT_LIMIT + 4100).contains(&body.len()),
        "batch payload limit exceeded"
    );
    let length = u32::from_le_bytes(body[..4].try_into()?) as usize;
    ensure!(
        length <= 4096 && length <= body.len() - 4,
        "invalid batch metadata length"
    );
    let metadata: DropMetadata = serde_json::from_slice(&body[4..4 + length])?;
    ensure!(
        metadata.protocol == 1 && metadata.name.len() <= 1024,
        "invalid batch metadata"
    );
    let source = &body[4 + length..];
    if archive::extension(&metadata.name) == "zip" {
        ensure!(
            source.len() <= archive::ARCHIVE_LIMIT,
            "ZIP archive limit is 128 MiB"
        );
    } else {
        ensure!(
            archive::supported(&metadata.name),
            "unsupported batch file extension"
        );
        ensure!(source.len() <= INPUT_LIMIT, "batch input limit is 256 MiB");
    }
    Ok((metadata, source))
}
#[tauri::command]
pub async fn add_blueprint_batch_file(
    app: AppHandle,
    request: Request<'_>,
) -> Result<BatchSnapshot, String> {
    let permit = INPUT_WORKER
        .try_acquire()
        .map_err(|_| "another batch import is still finishing")?;
    let InvokeBody::Raw(body) = request.body() else {
        return Err("batch input requires binary IPC".into());
    };
    let (metadata, source) = decode_input(body).map_err(|e| e.to_string())?;
    let state = app.state::<BlueprintBatchState>().inner().clone();
    let before = state
        .snapshot(metadata.batch_id)
        .map_err(|e| e.to_string())?;
    if before.items.len() >= FILE_LIMIT {
        return Err("batch file limit is 1000".into());
    }
    if archive::extension(&metadata.name) != "zip"
        && source.len() > INPUT_LIMIT.saturating_sub(before.input_bytes)
    {
        return Err("batch input limit is 256 MiB".into());
    }
    let ticket = state
        .begin(metadata.batch_id, "import")
        .map_err(|e| e.to_string())?;
    let cancel = ticket.cancel.clone();
    let bytes = source.to_vec();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let _permit = permit;
        expand_input(
            metadata.name,
            bytes,
            FILE_LIMIT - before.items.len(),
            INPUT_LIMIT - before.input_bytes,
            &cancel,
        )
    })
    .await
    .map_err(|_| anyhow::anyhow!("batch input worker failed"))
    .and_then(|r| r);
    let result = result.and_then(|inputs| state.commit_inputs(&ticket, inputs));
    state.finish(&ticket);
    result.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn convert_blueprint_batch_item(
    app: AppHandle,
    batch_id: u64,
    item_id: u64,
    options: ExportOptions,
) -> Result<BatchItem, String> {
    let state = app.state::<BlueprintBatchState>().inner().clone();
    let (ticket, bytes, name) = state
        .prepare_conversion(batch_id, item_id, &options)
        .map_err(|e| e.to_string())?;
    let result = match super::blueprint_export::EXPORT_WORKER.acquire().await {
        Ok(permit) => {
            let cancel = ticket.cancel.clone();
            let captured = options.clone();
            tauri::async_runtime::spawn_blocking(move || {
                let _permit = permit;
                convert(&name, &bytes, &captured, &cancel)
            })
            .await
            .map_err(|_| anyhow::anyhow!("batch conversion worker failed"))
            .and_then(|r| r)
        }
        Err(_) => Err(anyhow::anyhow!("export worker is unavailable")),
    };
    state
        .finish_conversion(&ticket, item_id, &options, result)
        .map_err(|e| e.to_string())
}

#[derive(Serialize)]
pub struct BatchSaveResult {
    pub canceled: bool,
    pub filename: Option<String>,
    pub bytes: usize,
}
fn save_copy(
    path: &Path,
    files: &[(String, Arc<Vec<u8>>)],
    zip: bool,
    cancel: &AtomicBool,
) -> Result<usize> {
    check_cancel(cancel)?;
    ensure!(
        !path.exists(),
        "copy destination already exists; choose a new filename"
    );
    let mut temporary = tempfile::Builder::new()
        .prefix(".mcstools-batch-")
        .tempfile_in(path.parent().context("invalid output folder")?)?;
    let size = if zip {
        archive::write_archive(&mut temporary, files, cancel, OUTPUT_LIMIT)?
    } else {
        ensure!(files.len() == 1, "single-file save requires one output");
        let bytes = &files[0].1;
        for chunk in bytes.chunks(64 * 1024) {
            check_cancel(cancel)?;
            temporary.write_all(chunk)?;
        }
        bytes.len()
    };
    check_cancel(cancel)?;
    temporary.as_file().sync_all()?;
    check_cancel(cancel)?;
    temporary
        .persist_noclobber(path)
        .context("could not save batch result; existing files were not replaced")?;
    Ok(size)
}
#[tauri::command]
pub async fn save_blueprint_batch_results(
    app: AppHandle,
    batch_id: u64,
    item_ids: Vec<u64>,
    zip: bool,
) -> Result<BatchSaveResult, String> {
    let state = app.state::<BlueprintBatchState>().inner().clone();
    let files = state
        .outputs(batch_id, &item_ids)
        .map_err(|e| e.to_string())?;
    if !zip && files.len() != 1 {
        return Err("select one result or save a ZIP".into());
    }
    let ticket = state.begin(batch_id, "save").map_err(|e| e.to_string())?;
    let cancel = ticket.cancel.clone();
    let result = tauri::async_runtime::spawn_blocking(move || -> Result<BatchSaveResult> {
        let filename = if zip {
            "mcstools-batch.zip".into()
        } else {
            files[0].0.clone()
        };
        let extension = archive::extension(&filename);
        let choice = app
            .dialog()
            .file()
            .add_filter("Batch result", &[&extension])
            .set_file_name(&filename)
            .blocking_save_file();
        if choice.is_none() || cancel.load(Ordering::Acquire) {
            return Ok(BatchSaveResult {
                canceled: true,
                filename: None,
                bytes: 0,
            });
        }
        let path: PathBuf = choice
            .unwrap()
            .into_path()
            .map_err(|_| anyhow::anyhow!("batch destination must be local"))?
            .with_extension(extension);
        let bytes = save_copy(&path, &files, zip, &cancel)?;
        Ok(BatchSaveResult {
            canceled: false,
            filename: path.file_name().map(|n| n.to_string_lossy().into_owned()),
            bytes,
        })
    })
    .await
    .map_err(|_| anyhow::anyhow!("batch save worker failed"))
    .and_then(|r| r);
    state.finish(&ticket);
    result.map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::{
        block_state_pos_list::{BlockData, BlockId, BlockStatePosList},
        schematic_data::Size,
    };
    fn fixture() -> SchematicData {
        let mut blocks = BlockStatePosList::default();
        for (x, id) in ["minecraft:stone", "minecraft:red_wool"].iter().enumerate() {
            blocks.add_by_pos(
                x as i32,
                0,
                0,
                Arc::new(BlockData {
                    id: BlockId { name: (*id).into() },
                    properties: Default::default(),
                }),
            );
        }
        SchematicData::new(
            blocks,
            Default::default(),
            Default::default(),
            Size {
                width: 3,
                height: 2,
                length: 2,
            },
        )
    }
    fn options(format: i32, subtype: i32, target: Option<i32>) -> ExportOptions {
        ExportOptions {
            format,
            subtype,
            target_data_version: target,
            overrides: vec![],
            include_air: false,
        }
    }
    fn add(state: &BlueprintBatchState, id: u64, files: Vec<(&str, Vec<u8>)>) -> BatchSnapshot {
        let ticket = state.begin(id, "import").unwrap();
        let inputs = files
            .into_iter()
            .map(|(name, bytes)| Input {
                name: name.into(),
                archive_name: None,
                bytes,
            })
            .collect();
        state.commit_inputs(&ticket, inputs).unwrap()
    }
    fn run(state: &BlueprintBatchState, id: u64, item: u64, opts: &ExportOptions) -> BatchItem {
        let (ticket, bytes, name) = state.prepare_conversion(id, item, opts).unwrap();
        let result = convert(&name, &bytes, opts, &ticket.cancel);
        state
            .finish_conversion(&ticket, item, opts, result)
            .unwrap()
    }
    #[test]
    fn batch_all_source_formats_use_shared_parser_and_exact_versioned_encoder() {
        let source = fixture();
        let cancel = AtomicBool::new(false);
        for (format, subtype, version) in [
            (1, -1, None),
            (2, 6, None),
            (3, 0, None),
            (3, 1, None),
            (4, 0, None),
            (4, 1, None),
            (4, 2, None),
            (5, -1, None),
            (6, -1, Some(5)),
        ] {
            let input =
                blueprint_export::encode(&source, &options(format, subtype, version), Some(3578))
                    .unwrap();
            let filename = format!("input.{}", blueprint_export::extension(format).unwrap());
            let out = convert(&filename, &input, &options(2, 6, Some(3955)), &cancel).unwrap();
            let (round_trip, version) = parse_source("converted.litematic", &out.bytes).unwrap();
            assert_eq!(version, Some(3955));
            // The BG encoder represents the occupied bounds, not the source's empty selection padding.
            let expected = if format == 4 {
                Size {
                    width: 2,
                    height: 1,
                    length: 1,
                }
            } else {
                source.size
            };
            assert_eq!(round_trip.size, expected, "format {format}/{subtype}");
            assert_eq!(round_trip.blocks.elements.len(), 2);
            for record in &source.blocks.elements {
                let actual = round_trip
                    .blocks
                    .elements
                    .iter()
                    .find(|block| block.pos == record.pos)
                    .unwrap();
                assert_eq!(actual.block, record.block, "format {format}/{subtype}");
            }
        }
        let bytes = blueprint_export::encode(&source, &options(2, 6, None), Some(3578)).unwrap();
        let out = convert("source.litematic", &bytes, &options(3, 0, None), &cancel).unwrap();
        assert_eq!(out.output_version, Some(3578));
        assert_eq!(
            parse_source("copy.schem", &out.bytes).unwrap().1,
            Some(3578)
        );
        assert!(convert("source.litematic", &bytes, &options(6, -1, None), &cancel).is_err());
    }
    #[test]
    fn one_failure_does_not_discard_success_and_successes_pin_configuration() {
        let state = BlueprintBatchState::default();
        let id = state.create().unwrap().id;
        let source =
            blueprint_export::encode(&fixture(), &options(2, 6, None), Some(3578)).unwrap();
        let queue = add(
            &state,
            id,
            vec![
                ("bad.litematic", vec![1, 2]),
                ("same.litematic", source.clone()),
                ("SAME.litematic", source.clone()),
            ],
        );
        let target = options(6, -1, Some(5));
        assert_eq!(run(&state, id, queue.items[0].id, &target).status, "error");
        assert_eq!(
            run(&state, id, queue.items[1].id, &target).status,
            "success"
        );
        assert_eq!(
            run(&state, id, queue.items[2].id, &target).status,
            "success"
        );
        let snapshot = state.snapshot(id).unwrap();
        assert_ne!(snapshot.items[1].output_name, snapshot.items[2].output_name);
        let outputs = state.outputs(id, &[queue.items[1].id]).unwrap();
        assert_eq!(
            parse_source("copy.schematic", &outputs[0].1).unwrap().1,
            Some(5)
        );
        assert!(
            state
                .prepare_conversion(id, queue.items[0].id, &options(5, -1, None))
                .is_err()
        );
        let result = state
            .remove(id, &[queue.items[1].id, queue.items[2].id])
            .unwrap();
        assert_eq!(result.output_bytes, 0);
        assert!(result.options.is_none());
        assert_eq!(
            run(&state, id, queue.items[0].id, &options(5, -1, None)).status,
            "error"
        );
    }
    #[test]
    fn cancellation_release_and_stale_completion_cannot_publish_results() {
        let state = BlueprintBatchState::default();
        let id = state.create().unwrap().id;
        let queue = add(&state, id, vec![("a.nbt", vec![1])]);
        let target = options(5, -1, None);
        let (ticket, _, _) = state
            .prepare_conversion(id, queue.items[0].id, &target)
            .unwrap();
        assert!(
            state
                .prepare_conversion(id, queue.items[0].id, &target)
                .is_err()
        );
        state.cancel(id).unwrap();
        let out = Conversion {
            bytes: vec![7],
            source_version: None,
            output_version: None,
            warnings: vec![],
        };
        assert_eq!(
            state
                .finish_conversion(&ticket, queue.items[0].id, &target, Ok(out))
                .unwrap()
                .status,
            "queued"
        );
        assert_eq!(state.snapshot(id).unwrap().output_bytes, 0);
        let (late, _, _) = state
            .prepare_conversion(id, queue.items[0].id, &target)
            .unwrap();
        state.release(id).unwrap();
        let next = state.create().unwrap().id;
        assert_ne!(next, id);
        assert!(
            state
                .finish_conversion(
                    &late,
                    queue.items[0].id,
                    &target,
                    Err(anyhow::anyhow!("late"))
                )
                .is_err()
        );
        assert!(state.snapshot(next).unwrap().items.is_empty());
    }
    #[test]
    fn input_staging_is_atomic_and_failed_or_cancelled_import_leaves_queue_unchanged() {
        let state = BlueprintBatchState::default();
        let id = state.create().unwrap().id;
        let ticket = state.begin(id, "import").unwrap();
        let many = (0..=FILE_LIMIT)
            .map(|n| Input {
                name: format!("{n}.schem"),
                archive_name: None,
                bytes: vec![1],
            })
            .collect();
        assert!(state.commit_inputs(&ticket, many).is_err());
        assert!(state.snapshot(id).unwrap().items.is_empty());
        state.finish(&ticket);
        let ticket = state.begin(id, "import").unwrap();
        state.cancel(id).unwrap();
        assert!(state.commit_inputs(&ticket, vec![]).is_err());
        state.finish(&ticket);
        assert!(expand_input("x.nbt".into(), vec![1, 2], 1, 1, &AtomicBool::new(false)).is_err());
        assert!(state.snapshot(id).unwrap().items.is_empty());
    }
    #[test]
    fn saves_are_no_clobber_atomic_and_zip_packages_read_back() {
        let temp = tempfile::tempdir().unwrap();
        let existing = temp.path().join("existing.schem");
        std::fs::write(&existing, b"original").unwrap();
        let files = vec![
            ("one.schem".into(), Arc::new(vec![1, 2, 3])),
            ("two.nbt".into(), Arc::new(vec![4])),
        ];
        assert!(save_copy(&existing, &files[..1], false, &AtomicBool::new(false)).is_err());
        assert_eq!(std::fs::read(&existing).unwrap(), b"original");
        let cancelled = temp.path().join("cancelled.zip");
        assert!(save_copy(&cancelled, &files, true, &AtomicBool::new(true)).is_err());
        assert!(!cancelled.exists());
        let zip = temp.path().join("outputs.zip");
        save_copy(&zip, &files, true, &AtomicBool::new(false)).unwrap();
        let archive = archive::extract(
            &std::fs::read(zip).unwrap(),
            10,
            100,
            &AtomicBool::new(false),
        )
        .unwrap();
        assert_eq!(archive.len(), 2);
        assert_eq!(archive[0].bytes, vec![1, 2, 3]);
        assert_eq!(
            std::fs::read_dir(temp.path()).unwrap().count(),
            2,
            "no failed-save temp files remain"
        );
    }
    #[test]
    fn raw_batch_protocol_is_borrowed_and_rejects_bad_metadata_before_copying() {
        fn body(meta: serde_json::Value) -> Vec<u8> {
            let text = serde_json::to_vec(&meta).unwrap();
            let mut out = (text.len() as u32).to_le_bytes().to_vec();
            out.extend(text);
            out.extend([0, 255, 12]);
            out
        }
        let valid = body(serde_json::json!({"protocol":1,"batch_id":17,"name":"蓝图.schem"}));
        let (metadata, bytes) = decode_input(&valid).unwrap();
        assert_eq!(metadata.batch_id, 17);
        assert_eq!(metadata.name, "蓝图.schem");
        assert_eq!(bytes, [0, 255, 12]);
        assert_eq!(
            bytes.as_ptr(),
            valid[valid.len() - 3..].as_ptr(),
            "decoding borrows input until the worker is reserved"
        );
        for metadata in [
            serde_json::json!({"protocol":2,"batch_id":17,"name":"x.schem"}),
            serde_json::json!({"protocol":1,"batch_id":17,"name":"x.exe"}),
            serde_json::json!({"protocol":1,"batch_id":17,"name":"x.schem","extra":true}),
            serde_json::json!({"protocol":1,"batch_id":17,"name":"字".repeat(400)+".schem"}),
        ] {
            assert!(decode_input(&body(metadata)).is_err());
        }
        for end in [0, 1, 3, 4, 10] {
            assert!(decode_input(&valid[..end]).is_err());
        }
        assert!(decode_input(&u32::MAX.to_le_bytes()).is_err());
    }
    #[test]
    fn cumulative_output_budget_rejects_one_result_without_locking_the_queue() {
        let state = BlueprintBatchState::default();
        let id = state.create().unwrap().id;
        let queue = add(&state, id, vec![("a.nbt", vec![1])]);
        let target = options(5, -1, None);
        let (ticket, _, _) = state
            .prepare_conversion(id, queue.items[0].id, &target)
            .unwrap();
        // Exercise the 512 MiB boundary without allocating that much test memory.
        state.0.lock().unwrap().session(id).unwrap().output_bytes = OUTPUT_LIMIT - 1;
        let result = state
            .finish_conversion(
                &ticket,
                queue.items[0].id,
                &target,
                Ok(Conversion {
                    bytes: vec![1, 2],
                    source_version: None,
                    output_version: None,
                    warnings: vec![],
                }),
            )
            .unwrap();
        assert_eq!(result.status, "error");
        assert!(result.error.unwrap().contains("512 MiB"));
        assert!(state.snapshot(id).unwrap().busy.is_none());
        assert!(state.outputs(id, &[queue.items[0].id]).is_err());
        assert!(
            state
                .remove(id, &[queue.items[0].id])
                .unwrap()
                .items
                .is_empty()
        );
    }
}
