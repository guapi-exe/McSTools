//! Bounded ephemeral snapshots for toolbox output. Never writes the user's library.
//! The common exporter owns format/version conversion and transactional saving.
use crate::utils::{
    block_state_pos_list::{BlockData, BlockId, BlockStatePosList},
    entities::EntitiesList,
    minecraft_data::java_block_states,
    schematic_data::{SchematicData, Size},
    tile_entities::TileEntitiesList,
};
use anyhow::{ensure, Context, Result};
use serde::Deserialize;
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    sync::{Arc, Mutex},
};
use tauri::{
    ipc::{InvokeBody, Request},
    AppHandle, Manager,
};

// Same canonical source as the website generator (Java 1.21/1.21.1).
pub const SOURCE_DATA_VERSION: i32 = 3955;
const MAX_VOLUME: usize = 8_000_000;
const MAX_RECORDS: usize = 4_000_000;
const MAX_METADATA: usize = 1024 * 1024;
const MAX_PAYLOAD: usize = 4 + MAX_METADATA + MAX_VOLUME * 2;
static GENERATOR: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(1);

#[derive(Clone)]
pub struct GeneratedSnapshot {
    pub data: Arc<SchematicData>,
    pub name: String,
}
#[derive(Default)]
pub struct GeneratedBlueprintState(Mutex<SnapshotStore>);
#[derive(Default)]
struct SnapshotStore {
    next: u64,
    entries: HashMap<u64, GeneratedSnapshot>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Metadata {
    protocol: u8,
    name: String,
    size: [i32; 3],
    palette: Vec<String>,
}

fn decode(payload: &[u8], record_budget: usize) -> Result<GeneratedSnapshot> {
    ensure!(
        payload.len() >= 4 && payload.len() <= MAX_PAYLOAD,
        "generated payload exceeds the byte limit"
    );
    let length = u32::from_le_bytes(payload[..4].try_into()?) as usize;
    ensure!(
        length <= MAX_METADATA && length <= payload.len() - 4,
        "invalid generated metadata length"
    );
    let metadata: Metadata = serde_json::from_slice(&payload[4..4 + length])?;
    ensure!(
        metadata.protocol == 1,
        "unsupported generated payload protocol"
    );
    ensure!(
        !metadata.name.trim().is_empty()
            && metadata.name.chars().count() <= 120
            && !metadata.name.chars().any(char::is_control),
        "invalid generated name"
    );
    ensure!(
        metadata.size.iter().all(|n| (1..=32767).contains(n)),
        "invalid generated dimensions"
    );
    let volume = metadata
        .size
        .iter()
        .try_fold(1usize, |v, n| v.checked_mul(*n as usize))
        .context("generated volume overflow")?;
    ensure!(
        volume <= MAX_VOLUME,
        "generated volume limit is 8 million cells"
    );
    let cells = &payload[4 + length..];
    ensure!(
        cells.len() == volume * 2,
        "incomplete generated block array"
    );
    ensure!(
        (2..=4096).contains(&metadata.palette.len()) && metadata.palette[0] == "minecraft:air",
        "invalid generated palette"
    );
    let registry =
        java_block_states::version("1.21.1").context("missing generated source registry")?;
    let mut seen = HashSet::new();
    let mut palette = Vec::with_capacity(metadata.palette.len());
    for id in metadata.palette {
        ensure!(
            id.starts_with("minecraft:")
                && id.len() <= 160
                && seen.insert(id.clone())
                && registry.block_by_name(&id).is_some(),
            "invalid generated source block: {id}"
        );
        palette.push(Arc::new(BlockData {
            id: BlockId {
                name: Arc::from(id),
            },
            properties: BTreeMap::new(),
        }));
    }
    // Validate before allocating records. Air is implicit, dimensions remain authoritative.
    let mut count = 0;
    for cell in cells.chunks_exact(2) {
        let index = u16::from_le_bytes([cell[0], cell[1]]) as usize;
        ensure!(
            index < palette.len(),
            "generated palette index out of range"
        );
        count += usize::from(index != 0);
        ensure!(count <= record_budget, "generated snapshots exceed the 4 million block budget; close another export or lower resolution");
    }
    ensure!(count > 0, "generated source has no visible blocks");
    let [width, height, length] = metadata.size;
    let mut blocks = BlockStatePosList::default();
    blocks.elements.try_reserve_exact(count)?;
    for (position, cell) in cells.chunks_exact(2).enumerate() {
        let index = u16::from_le_bytes([cell[0], cell[1]]) as usize;
        if index == 0 {
            continue;
        }
        let x = position % width as usize;
        let yz = position / width as usize;
        blocks.add_by_pos(
            x as i32,
            (yz / length as usize) as i32,
            (yz % length as usize) as i32,
            palette[index].clone(),
        );
    }
    Ok(GeneratedSnapshot {
        data: Arc::new(SchematicData::new(
            blocks,
            TileEntitiesList::default(),
            EntitiesList::default(),
            Size {
                width,
                height,
                length,
            },
        )),
        name: metadata.name,
    })
}

impl GeneratedBlueprintState {
    fn stage(&self, payload: &[u8]) -> Result<u64> {
        let mut store = self
            .0
            .lock()
            .map_err(|_| anyhow::anyhow!("generated snapshot lock failed"))?;
        ensure!(
            store.entries.len() < 2,
            "close another generated export before preparing a new one"
        );
        let used: usize = store
            .entries
            .values()
            .map(|entry| entry.data.blocks.elements.len())
            .sum();
        let snapshot = decode(payload, MAX_RECORDS.saturating_sub(used))?;
        store.next = store
            .next
            .checked_add(1)
            .context("generated snapshot ID overflow")?;
        let id = store.next;
        store.entries.insert(id, snapshot);
        Ok(id)
    }
    pub fn snapshot(&self, id: u64) -> Result<GeneratedSnapshot> {
        self.0
            .lock()
            .map_err(|_| anyhow::anyhow!("generated snapshot lock failed"))?
            .entries
            .get(&id)
            .cloned()
            .context("stale generated source; reopen the export dialog")
    }
    fn release(&self, id: u64) -> Result<()> {
        self.0
            .lock()
            .map_err(|_| anyhow::anyhow!("generated snapshot lock failed"))?
            .entries
            .remove(&id);
        Ok(())
    }
}

#[tauri::command]
pub async fn stage_generated_blueprint(
    app: AppHandle,
    request: Request<'_>,
) -> Result<u64, String> {
    let permit = GENERATOR
        .try_acquire()
        .map_err(|_| "another generated source is being prepared")?;
    let InvokeBody::Raw(body) = request.body() else {
        return Err("generated source requires binary IPC".into());
    };
    if body.len() > MAX_PAYLOAD {
        return Err("generated payload exceeds the byte limit".into());
    }
    let payload = body.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _permit = permit;
        app.state::<GeneratedBlueprintState>()
            .stage(&payload)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|_| "generated source worker failed".to_string())?
}

#[tauri::command]
pub async fn release_generated_blueprint(app: AppHandle, generation_id: u64) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<GeneratedBlueprintState>()
            .release(generation_id)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|_| "generated source release failed".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn payload(size: [i32; 3], palette: &[&str], cells: &[u16]) -> Vec<u8> {
        let meta = serde_json::to_vec(
            &serde_json::json!({"protocol":1,"name":"test","size":size,"palette":palette}),
        )
        .unwrap();
        let mut out = (meta.len() as u32).to_le_bytes().to_vec();
        out.extend(meta);
        for n in cells {
            out.extend(n.to_le_bytes());
        }
        out
    }
    #[test]
    fn dense_yzx_preserves_dimensions_and_shares_states() {
        let source = decode(
            &payload(
                [2, 2, 3],
                &["minecraft:air", "minecraft:stone"],
                &[1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1],
            ),
            10,
        )
        .unwrap();
        let blocks = &source.data.blocks.elements;
        assert_eq!(blocks.len(), 3);
        assert_eq!(blocks[1].pos.to_string(), "1,0,2");
        assert_eq!(blocks[2].pos.to_string(), "1,1,2");
        assert!(Arc::ptr_eq(&blocks[0].block, &blocks[2].block));
        assert_eq!(
            source.data.size,
            Size {
                width: 2,
                height: 2,
                length: 3
            }
        );
    }
    #[test]
    fn reject_malformed_and_oversized_sources_before_installing() {
        let valid = payload([2, 1, 1], &["minecraft:air", "minecraft:stone"], &[0, 1]);
        for end in 0..valid.len() {
            assert!(decode(&valid[..end], 10).is_err());
        }
        assert!(decode(
            &payload([2, 1, 1], &["minecraft:air", "minecraft:stone"], &[1, 1]),
            1
        )
        .is_err());
        assert!(decode(
            &payload([1, 1, 1], &["minecraft:air", "minecraft:stone"], &[2]),
            10
        )
        .is_err());
        assert!(decode(
            &payload(
                [1, 1, 1],
                &["minecraft:air", "minecraft:not_a_real_block"],
                &[1]
            ),
            10
        )
        .is_err());
        assert!(decode(
            &payload([1, 1, 1], &["minecraft:air", "minecraft:stone"], &[0]),
            10
        )
        .is_err());
        assert!(decode(
            &payload(
                [32767, 32767, 32767],
                &["minecraft:air", "minecraft:stone"],
                &[]
            ),
            10
        )
        .is_err());
    }
    #[test]
    fn snapshots_are_bounded_immutable_and_released_by_exact_id() {
        let store = GeneratedBlueprintState::default();
        let bytes = payload([1, 1, 1], &["minecraft:air", "minecraft:stone"], &[1]);
        let first = store.stage(&bytes).unwrap();
        let captured = store.snapshot(first).unwrap();
        let second = store.stage(&bytes).unwrap();
        assert!(store.stage(&bytes).is_err());
        store.release(first).unwrap();
        assert!(store.snapshot(first).is_err());
        assert_eq!(captured.data.blocks.elements.len(), 1);
        let third = store.stage(&bytes).unwrap();
        assert!(third > second);
        store.release(first).unwrap();
        assert!(store.snapshot(third).is_ok());
    }

    #[test]
    fn generated_source_round_trips_through_shared_formats_and_legacy_target() {
        use crate::utils::{
            blueprint_export::{encode, ExportOptions},
            parse_limits::ParseLimits,
        };
        let source = decode(
            &payload(
                [2, 2, 2],
                &["minecraft:air", "minecraft:red_wool", "minecraft:stone"],
                &[0, 1, 0, 2, 1, 0, 2, 0],
            ),
            10,
        )
        .unwrap();
        for (format, subtype, target) in [
            (1, -1, None),
            (2, 6, None),
            (3, 0, None),
            (3, 1, None),
            (4, 0, None),
            (5, -1, None),
            (6, -1, Some(5)),
        ] {
            let options = ExportOptions {
                format,
                subtype,
                target_data_version: target,
                overrides: vec![],
                include_air: false,
            };
            let bytes = encode(&source.data, &options, Some(SOURCE_DATA_VERSION)).unwrap();
            let limits = ParseLimits::default();
            let parsed = match format {
                1 => crate::create::create_schematic::CreateSchematic::new_from_bytes(&bytes)
                    .unwrap()
                    .get_blocks_pos_with_limits(&limits)
                    .unwrap(),
                2 => {
                    let parsed =
                        crate::litematica::lm_schematic::LmSchematic::new_from_bytes(&bytes)
                            .unwrap();
                    assert_eq!(parsed.get_data_version().unwrap(), SOURCE_DATA_VERSION);
                    parsed.get_blocks_pos_with_limits(&limits).unwrap()
                }
                3 => crate::word_edit::we_schematic::WeSchematic::new_from_bytes(&bytes)
                    .unwrap()
                    .get_blocks_pos_with_limits(&limits)
                    .unwrap(),
                4 => crate::building_gadges::bg_schematic::BgSchematic::new_from_slice(&bytes)
                    .unwrap()
                    .get_blocks_pos_with_limits(&limits)
                    .unwrap(),
                5 => crate::be_schematic::be_schematic::BESchematic::new_from_bytes(&bytes)
                    .unwrap()
                    .get_blocks_pos_with_limits(&limits)
                    .unwrap(),
                _ => {
                    let parsed =
                        crate::mcedit::mcedit_schematic::McEditSchematic::new_from_bytes(&bytes)
                            .unwrap();
                    assert_eq!(
                        crate::mcedit::legacy_map::declared_game_version(&parsed.nbt),
                        Some("1.7.10")
                    );
                    parsed.get_blocks_pos_with_limits(&limits).unwrap()
                }
            };
            assert_eq!(parsed.size, source.data.size, "format {format}");
            assert_eq!(parsed.blocks.elements.len(), 4, "format {format}");
            for record in &source.data.blocks.elements {
                let actual = parsed
                    .blocks
                    .elements
                    .iter()
                    .find(|block| block.pos == record.pos)
                    .unwrap();
                assert_eq!(actual.block.id, record.block.id, "format {format}");
            }
        }
    }
}
