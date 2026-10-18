//! A single bounded, ephemeral edit session. No command here writes the source
//! file or database. Stage -> render -> commit prevents failed previews from
//! changing the document or consuming undo history.
use crate::data_files::files::FileManager;
use crate::database::db_apis::schematics_api::find_schematic;
use crate::database::db_control::DatabaseState;
use crate::modules::schematic::{SchematicPreviewData, build_preview_in_frame};
use crate::utils::block_state_pos_list::BlockPos;
use crate::utils::schematic_data::{SchematicData, Size};
use crate::utils::schematic_editing::{
    EditOperation, EditRegion, MAX_EDIT_RECORDS, PreviewBounds, edit_copy, visible_bounds,
};
use anyhow::{Result, anyhow, ensure};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::{Arc, Mutex, MutexGuard};
use tauri::{AppHandle, Manager, State};

const MAX_UNDO_STEPS: usize = 3;
const MAX_HISTORY_RECORDS: usize = 4_000_000;

#[derive(Clone)]
struct Snapshot {
    data: Arc<SchematicData>,
    frame: PreviewBounds,
}

impl Snapshot {
    fn preview(&self) -> Result<SchematicPreviewData> {
        let size = self.frame.size()?;
        // Bound coordinates before the compact IPC representation is built.
        for block in &self.data.blocks.elements {
            for (p, origin) in [block.pos.x, block.pos.y, block.pos.z]
                .into_iter()
                .zip(self.frame.min)
            {
                ensure!(p.checked_sub(origin).is_some(), "edit coordinate overflow");
            }
        }
        for tile in &self.data.tile_entities_list.elements {
            for (p, origin) in [tile.pos.x, tile.pos.y, tile.pos.z]
                .into_iter()
                .zip(self.frame.min)
            {
                ensure!(p.checked_sub(origin).is_some(), "edit coordinate overflow");
            }
        }
        Ok(build_preview_in_frame(
            &self.data,
            BlockPos {
                x: self.frame.min[0],
                y: self.frame.min[1],
                z: self.frame.min[2],
            },
            size,
            self.data.blocks.elements.len(),
        ))
    }
}

#[derive(Debug, Deserialize)]
#[serde(
    tag = "action",
    content = "operation",
    rename_all = "snake_case",
    deny_unknown_fields
)]
pub enum EditorAction {
    Edit(EditOperation),
    Undo,
    Reset,
}

struct Pending {
    id: u64,
    snapshot: Snapshot,
    action: EditorAction,
}

struct Session {
    id: u64,
    source_id: i64,
    game_version: String,
    source_data_version: Option<i32>,
    source_name: String,
    source_format: i32,
    source_subtype: i32,
    revision: u64,
    original: Snapshot,
    current: Snapshot,
    history: VecDeque<Snapshot>,
    pending: Option<Pending>,
    staging: bool,
}

#[derive(Default)]
struct Store {
    sequence: u64,
    opening: Option<u64>,
    session: Option<Session>,
}

#[derive(Default)]
pub struct BlueprintEditorState(Mutex<Store>);

impl BlueprintEditorState {
    fn lock(&self) -> Result<MutexGuard<'_, Store>> {
        self.0
            .lock()
            .map_err(|_| anyhow!("editor lock unavailable"))
    }
}

#[derive(Serialize)]
pub struct EditorInfo {
    session_id: u64,
    source_id: i64,
    revision: u64,
    game_version: String,
    source_data_version: Option<i32>,
    source_name: String,
    source_format: i32,
    source_subtype: i32,
    size: Size,
    undo_steps: usize,
    modified: bool,
}

#[derive(Serialize)]
pub struct EditorPreview {
    info: EditorInfo,
    candidate_id: Option<u64>,
    preview: SchematicPreviewData,
}

impl Session {
    fn info(&self) -> Result<EditorInfo> {
        Ok(EditorInfo {
            session_id: self.id,
            source_id: self.source_id,
            revision: self.revision,
            game_version: self.game_version.clone(),
            source_data_version: self.source_data_version,
            source_name: self.source_name.clone(),
            source_format: self.source_format,
            source_subtype: self.source_subtype,
            size: self.current.frame.size()?,
            undo_steps: self.history.len(),
            modified: !Arc::ptr_eq(&self.current.data, &self.original.data),
        })
    }

    fn trim_history(&mut self) {
        while self.history.len() > MAX_UNDO_STEPS || self.retained_records() > MAX_HISTORY_RECORDS {
            if self.history.pop_front().is_none() {
                break;
            }
        }
    }

    fn retained_records(&self) -> usize {
        self.history
            .iter()
            .chain(std::iter::once(&self.current))
            .filter(|snapshot| !Arc::ptr_eq(&snapshot.data, &self.original.data))
            .map(|snapshot| snapshot.data.blocks.elements.len())
            .sum()
    }

    fn commit(&mut self, revision: u64, candidate_id: u64) -> Result<EditorInfo> {
        ensure!(self.revision == revision, "stale editor revision");
        ensure!(
            self.pending.as_ref().is_some_and(|p| p.id == candidate_id),
            "stale editor candidate"
        );
        let pending = self.pending.take().unwrap();
        match pending.action {
            EditorAction::Edit(_) => self.history.push_back(self.current.clone()),
            EditorAction::Undo => {
                self.history.pop_back();
            }
            EditorAction::Reset => self.history.clear(),
        }
        self.current = pending.snapshot;
        self.revision += 1;
        self.trim_history();
        self.info()
    }
}

fn session(store: &Store, id: u64, revision: u64) -> Result<&Session> {
    let s = store
        .session
        .as_ref()
        .filter(|s| s.id == id)
        .ok_or_else(|| anyhow!("editor session closed"))?;
    ensure!(s.revision == revision, "stale editor revision");
    Ok(s)
}

/// Capture an acknowledged revision under a short lock; the caller can then
/// crop/encode it on its worker without blocking navigation or another preview.
pub(crate) fn export_snapshot(
    state: &BlueprintEditorState,
    id: u64,
    revision: u64,
    scope: &str,
    region: Option<EditRegion>,
) -> Result<(Arc<SchematicData>, Option<i32>, String)> {
    let (snapshot, data_version, name) = {
        let store = state.lock()?;
        let s = session(&store, id, revision)?;
        ensure!(
            !s.staging && s.pending.is_none(),
            "another edit is still pending"
        );
        (
            s.current.clone(),
            s.source_data_version,
            s.source_name.clone(),
        )
    };
    let data = match scope {
        "all" => {
            ensure!(region.is_none(), "whole export must not include a region");
            snapshot.data
        }
        "inside" | "outside" => {
            let region = region.ok_or_else(|| anyhow!("export region is required"))?;
            let operation = if scope == "inside" {
                EditOperation::Crop { region }
            } else {
                EditOperation::CropOutside { region }
            };
            Arc::new(edit_copy(&snapshot.data, Some(snapshot.frame), &operation)?)
        }
        _ => return Err(anyhow!("invalid export scope")),
    };
    Ok((data, data_version, name))
}

#[tauri::command]
pub async fn open_blueprint_editor(app: AppHandle, id: i64) -> Result<EditorPreview, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<EditorPreview> {
        let state = app.state::<BlueprintEditorState>();
        let token = {
            let mut store = state.lock()?;
            // A WebView reload can lose its JS handle while the native app
            // stays alive. Resume the acknowledged document, never a staged
            // candidate whose preview may not have finished.
            if let Some(existing) = store.session.as_mut().filter(|s| s.source_id == id) {
                ensure!(!existing.staging, "another edit is still pending");
                existing.pending = None;
                let info = existing.info()?;
                let snapshot = existing.current.clone();
                drop(store);
                return Ok(EditorPreview {
                    info,
                    candidate_id: None,
                    preview: snapshot.preview()?,
                });
            }
            ensure!(store.opening.is_none(), "another editor is still opening");
            store.session = None;
            store.sequence += 1;
            let token = store.sequence;
            store.opening = Some(token);
            token
        };
        let result = (|| -> Result<(Session, SchematicPreviewData)> {
            let db = app.state::<DatabaseState>();
            let mut connection = db.0.get()?;
            let source = find_schematic(&mut connection, id)?;
            drop(connection);
            let (data, source_data_version) =
                app.state::<FileManager>().get_schematic_with_version(
                    id,
                    source.version,
                    source.sub_type,
                    source.schematic_type,
                )?;
            ensure!(
                data.blocks.elements.len() <= MAX_EDIT_RECORDS,
                "preview editing limit is 2000000 records; split a smaller blueprint first"
            );
            let frame = visible_bounds(&data)?;
            let snapshot = Snapshot {
                data: Arc::new(data),
                frame,
            };
            let preview = snapshot.preview()?;
            Ok((
                Session {
                    id: token,
                    source_id: id,
                    game_version: source.game_version,
                    source_data_version,
                    source_name: source.name,
                    source_format: source.schematic_type,
                    source_subtype: if source.schematic_type == 2 {
                        source.lm_version
                    } else {
                        source.sub_type
                    },
                    revision: 0,
                    original: snapshot.clone(),
                    current: snapshot,
                    history: VecDeque::new(),
                    pending: None,
                    staging: false,
                },
                preview,
            ))
        })();
        let mut store = state.lock()?;
        store.opening = None;
        let (new_session, preview) = result?;
        let info = new_session.info()?;
        store.session = Some(new_session);
        Ok(EditorPreview {
            info,
            candidate_id: None,
            preview,
        })
    })
    .await
    .map_err(|_| "editor worker failed".to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stage_blueprint_edit(
    app: AppHandle,
    session_id: u64,
    revision: u64,
    action: EditorAction,
) -> Result<EditorPreview, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<EditorPreview> {
        let state = app.state::<BlueprintEditorState>();
        let (base, candidate_id, info) = {
            let mut store = state.lock()?;
            let s = session(&store, session_id, revision)?;
            ensure!(
                !s.staging && s.pending.is_none(),
                "another edit is still pending"
            );
            let base = match &action {
                EditorAction::Edit(_) => s.current.clone(),
                EditorAction::Undo => s
                    .history
                    .back()
                    .cloned()
                    .ok_or_else(|| anyhow!("nothing to undo"))?,
                EditorAction::Reset => s.original.clone(),
            };
            let info = s.info()?;
            store.sequence += 1;
            let candidate_id = store.sequence;
            store.session.as_mut().unwrap().staging = true;
            (base, candidate_id, info)
        };
        let result = (|| -> Result<(Snapshot, SchematicPreviewData)> {
            let next = if let EditorAction::Edit(operation) = &action {
                let data = edit_copy(&base.data, Some(base.frame), operation)?;
                let frame = match operation {
                    EditOperation::Replace { .. } => base.frame,
                    _ => PreviewBounds {
                        min: [0; 3],
                        max: [
                            data.size.width - 1,
                            data.size.height - 1,
                            data.size.length - 1,
                        ],
                    },
                };
                Snapshot {
                    data: Arc::new(data),
                    frame,
                }
            } else {
                base
            };
            let preview = next.preview()?;
            Ok((next, preview))
        })();
        let mut store = state.lock()?;
        session(&store, session_id, revision)?;
        let s = store.session.as_mut().unwrap();
        s.staging = false;
        let (snapshot, preview) = result?;
        s.pending = Some(Pending {
            id: candidate_id,
            snapshot,
            action,
        });
        Ok(EditorPreview {
            info,
            candidate_id: Some(candidate_id),
            preview,
        })
    })
    .await
    .map_err(|_| "editor worker failed".to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn commit_blueprint_edit(
    state: State<'_, BlueprintEditorState>,
    session_id: u64,
    revision: u64,
    candidate_id: u64,
) -> Result<EditorInfo, String> {
    (|| -> Result<EditorInfo> {
        let mut store = state.lock()?;
        session(&store, session_id, revision)?;
        store
            .session
            .as_mut()
            .unwrap()
            .commit(revision, candidate_id)
    })()
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cancel_blueprint_edit(
    state: State<'_, BlueprintEditorState>,
    session_id: u64,
    candidate_id: u64,
) -> Result<(), String> {
    (|| -> Result<()> {
        let mut store = state.lock()?;
        if let Some(s) = store.session.as_mut().filter(|s| s.id == session_id) {
            if s.pending.as_ref().is_some_and(|p| p.id == candidate_id) {
                s.pending = None;
            }
        }
        Ok(())
    })()
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn close_blueprint_editor(
    state: State<'_, BlueprintEditorState>,
    session_id: u64,
) -> Result<(), String> {
    let mut store = state.lock().map_err(|e| e.to_string())?;
    if store.session.as_ref().is_some_and(|s| s.id == session_id) {
        store.session = None;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::block_state_pos_list::{BlockData, BlockId, BlockStatePosList};
    fn sample() -> Snapshot {
        let mut blocks = BlockStatePosList::default();
        blocks.add_by_pos(
            0,
            0,
            0,
            Arc::new(BlockData {
                id: BlockId {
                    name: "minecraft:stone".into(),
                },
                properties: Default::default(),
            }),
        );
        Snapshot {
            data: Arc::new(SchematicData::new(
                blocks,
                Default::default(),
                Default::default(),
                Size {
                    width: 1,
                    height: 1,
                    length: 1,
                },
            )),
            frame: PreviewBounds {
                min: [0; 3],
                max: [0; 3],
            },
        }
    }
    fn editor() -> Session {
        let original = sample();
        Session {
            id: 1,
            source_id: 7,
            game_version: "1.20.1".into(),
            source_data_version: Some(3465),
            source_name: "fixture".into(),
            source_format: 2,
            source_subtype: 6,
            revision: 0,
            current: original.clone(),
            original,
            history: VecDeque::new(),
            pending: None,
            staging: false,
        }
    }
    fn replace() -> EditorAction {
        EditorAction::Edit(EditOperation::Replace {
            original_id: "minecraft:stone".into(),
            replacement_id: "minecraft:dirt".into(),
            region: None,
            preserve_properties: false,
        })
    }
    #[test]
    fn stage_is_not_a_commit_and_stale_candidates_do_not_consume_history() {
        let mut s = editor();
        s.pending = Some(Pending {
            id: 2,
            snapshot: sample(),
            action: replace(),
        });
        assert!(!s.info().unwrap().modified);
        assert!(s.commit(1, 2).is_err());
        assert!(s.commit(0, 9).is_err());
        assert!(s.pending.is_some());
        assert_eq!(s.commit(0, 2).unwrap().undo_steps, 1);
        assert!(s.info().unwrap().modified);
        assert!(s.commit(0, 2).is_err());
        s.pending = Some(Pending {
            id: 3,
            snapshot: s.history.back().unwrap().clone(),
            action: EditorAction::Undo,
        });
        assert!(!s.commit(1, 3).unwrap().modified);
    }
    #[test]
    fn undo_is_bounded_and_reset_releases_history() {
        let mut s = editor();
        for id in 1..10 {
            s.pending = Some(Pending {
                id,
                snapshot: sample(),
                action: replace(),
            });
            s.commit(s.revision, id).unwrap();
            assert!(s.history.len() <= MAX_UNDO_STEPS);
        }
        s.pending = Some(Pending {
            id: 10,
            snapshot: s.original.clone(),
            action: EditorAction::Reset,
        });
        let info = s.commit(s.revision, 10).unwrap();
        assert_eq!(info.undo_steps, 0);
        assert!(!info.modified);
    }

    #[test]
    fn exporting_selection_is_an_independent_snapshot_without_undo_mutation() {
        let mut s = editor();
        let mut data = s.current.data.as_ref().clone();
        data.blocks
            .add_by_pos(1, 0, 0, data.blocks.elements[0].block.clone());
        data.size.width = 2;
        s.current = Snapshot {
            data: Arc::new(data),
            frame: PreviewBounds {
                min: [0; 3],
                max: [1, 0, 0],
            },
        };
        let state = BlueprintEditorState(Mutex::new(Store {
            sequence: 1,
            opening: None,
            session: Some(s),
        }));
        let selected = EditRegion {
            min: [0; 3],
            max: [0; 3],
        };
        let (inside, version, name) =
            export_snapshot(&state, 1, 0, "inside", Some(selected.clone())).unwrap();
        let (outside, _, _) = export_snapshot(&state, 1, 0, "outside", Some(selected)).unwrap();
        assert_eq!(inside.size.width, 1);
        assert_eq!(inside.blocks.elements.len(), 1);
        assert_eq!(outside.size.width, 2);
        assert_eq!(outside.blocks.elements[0].pos.x, 1);
        assert_eq!(version, Some(3465));
        assert_eq!(name, "fixture");
        let store = state.lock().unwrap();
        let session = store.session.as_ref().unwrap();
        assert_eq!(session.revision, 0);
        assert_eq!(session.current.data.blocks.elements.len(), 2);
        assert!(session.history.is_empty() && session.pending.is_none());
        drop(store);
        assert!(export_snapshot(&state, 1, 1, "all", None).is_err());
    }
}
