//! One import pipeline for local uploads, API downloads and exported copies.
//! Parse before opening a write transaction. Install a complete no-clobber file
//! before committing all metadata/history/count changes together.
use crate::be_schematic::be_schematic::BESchematic;
use crate::building_gadges::bg_schematic::BgSchematic;
use crate::create::create_schematic::CreateSchematic;
use crate::data_files::files::FileManager;
use crate::database::{db_apis::schematics_api::find_schematic, db_data::Schematic};
use crate::litematica::lm_schematic::LmSchematic;
use crate::mcedit::{legacy_map, mcedit_schematic::McEditSchematic};
use crate::modules::modules_data::convert_data::get_unique_block_str;
use crate::utils::{
    minecraft_data::{je_blocks_data::BlocksData, versions_data::VersionData},
    requirements::{RequirementStr, get_requirements},
};
use crate::word_edit::we_schematic::WeSchematic;
use anyhow::{Context, Result, ensure};
use rusqlite::{Connection, TransactionBehavior, params};
use serde_json::Value;
use std::path::Path;

pub(crate) struct PreparedImport {
    pub schematic: Schematic,
    requirements: String,
    unique_blocks: String,
    bytes: Vec<u8>,
    legacy_version_unknown: bool,
}

pub(crate) fn prepare_import(
    file_name: &str,
    bytes: Vec<u8>,
    versions: &VersionData,
    blocks: &BlocksData,
) -> Result<PreparedImport> {
    let path = Path::new(file_name);
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let mut metadata = Schematic {
        id: 0,
        name: path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("blueprint")
            .into(),
        description: String::new(),
        schematic_type: -1,
        sub_type: -1,
        is_deleted: false,
        sizes: String::new(),
        user: "your".into(),
        is_upload: false,
        version: 0,
        lm_version: 0,
        game_version: "unknown_version".into(),
        version_list: "0".into(),
        created_at: String::new(),
        updated_at: String::new(),
        schematic_tags: String::new(),
        classification: String::new(),
    };
    let mut legacy_version_unknown = false;
    let (data, data_version) = match extension.as_str() {
        "nbt" => {
            let parsed = CreateSchematic::new_from_bytes(bytes.clone())?;
            metadata.schematic_type = 1;
            (parsed.get_blocks_pos()?, parsed.get_data_version().ok())
        }
        "litematic" => {
            let parsed = LmSchematic::new_from_bytes(bytes.clone())?;
            let details = parsed.read_metadata()?;
            metadata.schematic_type = 2;
            metadata.lm_version = parsed.get_lm_version()?;
            if !details.name.trim().is_empty() && details.name.trim() != "Unnamed" {
                metadata.name = details.name;
            }
            metadata.description = details.description;
            metadata.user = details.author;
            (parsed.get_blocks_pos()?, parsed.get_data_version().ok())
        }
        "schem" => {
            let parsed = WeSchematic::new_from_bytes(bytes.clone())?;
            metadata.schematic_type = 3;
            metadata.sub_type = parsed.get_type()?;
            (
                parsed.get_blocks_pos()?,
                parsed.get_data_version(metadata.sub_type).ok(),
            )
        }
        "json" => {
            let parsed = BgSchematic::new_from_data(bytes.clone())?;
            metadata.schematic_type = 4;
            metadata.sub_type = parsed.get_type()?;
            metadata.game_version.clear();
            (parsed.get_blocks_pos()?, None)
        }
        "mcstructure" => {
            let parsed = BESchematic::new_from_bytes(bytes.clone())?;
            metadata.schematic_type = 5;
            metadata.game_version.clear();
            (parsed.get_blocks_pos()?, None)
        }
        "schematic" => {
            let parsed = McEditSchematic::new_from_bytes(bytes.clone())?;
            metadata.schematic_type = 6;
            if let Some(name) = legacy_map::declared_game_version(&parsed.nbt) {
                metadata.game_version = name.into();
            } else {
                legacy_version_unknown = true;
            }
            (parsed.get_blocks_pos()?, None)
        }
        _ => anyhow::bail!("unsupported blueprint file extension: {extension}"),
    };
    metadata.sizes = data.size.to_string();
    if let Some(version) = data_version {
        metadata.game_version = versions
            .game_version_for_data_version(metadata.schematic_type, metadata.sub_type, version)
            .map(|value| value.name)
            .unwrap_or_else(|| "unknown_version".into());
    }
    let requirements = RequirementStr::from_requirements(&get_requirements(&data.blocks)?, blocks)
        .export_to_string()?;
    let unique_blocks = get_unique_block_str(&data.blocks)?;
    Ok(PreparedImport {
        schematic: metadata,
        requirements,
        unique_blocks,
        bytes,
        legacy_version_unknown,
    })
}

fn append_history(
    previous: Option<&str>,
    entry: Value,
    previous_versions: usize,
) -> Result<String> {
    let mut history: Vec<Value> = match previous {
        Some(raw) => {
            serde_json::from_str(raw).context("existing blueprint history is not an array")?
        }
        None => Vec::new(),
    };
    ensure!(
        history.len() == previous_versions,
        "existing blueprint history is out of sync with the version counter"
    );
    history.push(entry);
    Ok(serde_json::to_string(&history)?)
}

pub(crate) fn persist_import(
    conn: &mut Connection,
    files: &FileManager,
    mut prepared: PreparedImport,
    update_id: Option<i64>,
) -> Result<i64> {
    // Serialize version allocation and prevent another import from claiming the
    // same row/version between the existence check and file installation.
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let s = &mut prepared.schematic;
    if let Some(id) = update_id {
        let old = find_schematic(&tx, id).context("update source is missing or deleted")?;
        s.id = id;
        s.version = old
            .version
            .checked_add(1)
            .context("blueprint version counter overflow")?;
        s.version_list = if old.version_list.is_empty() {
            s.version.to_string()
        } else {
            format!("{},{}", old.version_list, s.version)
        };
        if prepared.legacy_version_unknown
            && VersionData::new()
                .game_versions_for_format(6, -1)
                .iter()
                .any(|version| version.name == old.game_version)
        {
            s.game_version = old.game_version;
        }
        tx.execute("UPDATE schematics SET name=?1, description=?2, type=?3, sub_type=?4, sizes=?5,
            user=?6, version=?7, game_version=?8, lm_version=?9, version_list=?10, updated_at=CURRENT_TIMESTAMP WHERE id=?11",
            params![s.name, s.description, s.schematic_type, s.sub_type, s.sizes, s.user, s.version, s.game_version, s.lm_version, s.version_list, s.id])?;
    } else {
        tx.execute("INSERT INTO schematics (name, description, type, sub_type, sizes, user, version_list, game_version, lm_version)
            VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            params![s.name, s.description, s.schematic_type, s.sub_type, s.sizes, s.user, s.version_list, s.game_version, s.lm_version])?;
        s.id = tx.last_insert_rowid();
        ensure!(
            tx.execute(
                "UPDATE user_data SET schematics=schematics+1 WHERE id=1",
                []
            )? == 1,
            "local user counter is missing"
        );
    }
    // History must reflect the actual row ID, timestamps and preserved user tags.
    let record = find_schematic(&tx, s.id)?;
    let previous: Option<(String, String, String)> = if update_id.is_some() {
        Some(tx.query_row("SELECT schematic, requirements, unique_blocks FROM schematics_history WHERE schematic_id=?1",
            [record.id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?))).context("existing blueprint history is missing")?)
    } else {
        None
    };
    let schematic_history = append_history(
        previous.as_ref().map(|v| v.0.as_str()),
        serde_json::to_value(&record)?,
        record
            .version
            .try_into()
            .context("invalid negative blueprint version")?,
    )?;
    let requirement_history = append_history(
        previous.as_ref().map(|v| v.1.as_str()),
        serde_json::from_str(&prepared.requirements)?,
        record
            .version
            .try_into()
            .context("invalid negative blueprint version")?,
    )?;
    let block_history = append_history(
        previous.as_ref().map(|v| v.2.as_str()),
        serde_json::from_str(&prepared.unique_blocks)?,
        record
            .version
            .try_into()
            .context("invalid negative blueprint version")?,
    )?;
    tx.execute("INSERT INTO schematic_data (schematic_id, requirements, unique_blocks) VALUES (?1,?2,?3)
        ON CONFLICT(schematic_id) DO UPDATE SET requirements=excluded.requirements, unique_blocks=excluded.unique_blocks",
        params![record.id, prepared.requirements, prepared.unique_blocks])?;
    tx.execute("INSERT INTO schematics_history (schematic_id, schematic, requirements, unique_blocks) VALUES (?1,?2,?3,?4)
        ON CONFLICT(schematic_id) DO UPDATE SET schematic=excluded.schematic, requirements=excluded.requirements, unique_blocks=excluded.unique_blocks",
        params![record.id, schematic_history, requirement_history, block_history])?;
    let file = files.create_import_file(
        record.id,
        record.version,
        record.sub_type,
        record.schematic_type,
        &prepared.bytes,
    )?;
    if let Err(error) = tx.commit() {
        if let Err(cleanup) = file.discard() {
            anyhow::bail!("import transaction failed: {error}; {cleanup}");
        }
        return Err(error)
            .context("import transaction failed; new file removed and previous version retained");
    }
    file.keep();
    Ok(record.id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::db_control::initialize_schema;
    use crate::utils::{
        block_state_pos_list::{BlockData, BlockId, BlockStatePosList},
        blueprint_export::{ExportOptions, encode, extension},
        schematic_data::{SchematicData, Size},
    };
    use std::{fs, sync::Arc};

    fn database() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON").unwrap();
        initialize_schema(&conn).unwrap();
        conn
    }
    fn fixture(format: i32, subtype: i32) -> PreparedImport {
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
        let data = SchematicData::new(
            blocks,
            Default::default(),
            Default::default(),
            Size {
                width: 2,
                height: 2,
                length: 2,
            },
        );
        let options = ExportOptions {
            format,
            subtype,
            target_data_version: if format == 6 { Some(5) } else { None },
            overrides: Vec::new(),
            include_air: false,
        };
        let bytes = encode(&data, &options, Some(3578)).unwrap();
        let labels = BlocksData {
            blocks: Vec::new(),
            block_to_cn: Default::default(),
        };
        prepare_import(
            &format!("PreserveCase.{}", extension(format).unwrap()),
            bytes,
            &VersionData::new(),
            &labels,
        )
        .unwrap()
    }
    fn count(conn: &Connection, table: &str) -> i64 {
        conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
            row.get(0)
        })
        .unwrap()
    }
    fn user_count(conn: &Connection) -> i64 {
        conn.query_row("SELECT schematics FROM user_data WHERE id=1", [], |row| {
            row.get(0)
        })
        .unwrap()
    }
    fn history(conn: &Connection, id: i64) -> Vec<Value> {
        let raw: String = conn
            .query_row(
                "SELECT schematic FROM schematics_history WHERE schematic_id=?1",
                [id],
                |row| row.get(0),
            )
            .unwrap();
        serde_json::from_str(&raw).unwrap()
    }
    fn assert_empty(conn: &Connection) {
        for table in ["schematics", "schematic_data", "schematics_history"] {
            assert_eq!(count(conn, table), 0, "{table}");
        }
        assert_eq!(user_count(conn), 0);
    }
    #[test]
    fn every_export_format_imports_with_atomic_metadata_and_original_bytes() {
        let root = tempfile::tempdir().unwrap();
        let files = FileManager::for_test(root.path().to_owned());
        let mut conn = database();
        for (format, subtype) in [
            (1, -1),
            (2, 6),
            (2, 7),
            (3, 0),
            (3, 1),
            (4, 0),
            (4, 1),
            (4, 2),
            (5, -1),
            (6, -1),
        ] {
            let prepared = fixture(format, subtype);
            let bytes = prepared.bytes.clone();
            let id = persist_import(&mut conn, &files, prepared, None).unwrap();
            let row = find_schematic(&conn, id).unwrap();
            assert_eq!(row.schematic_type, format);
            assert_eq!(
                row.sub_type,
                if [3, 4].contains(&format) {
                    subtype
                } else {
                    -1
                }
            );
            if format == 2 {
                assert_eq!(row.lm_version, subtype);
            }
            if format == 1 {
                assert_eq!(row.name, "PreserveCase.nbt");
            }
            if format == 6 {
                assert_eq!(row.game_version, "1.7.10");
            }
            let path = files.schematic_dir(id).unwrap().join(format!(
                "schematic_0.{}.{format}.{}",
                row.sub_type,
                extension(format).unwrap()
            ));
            assert_eq!(fs::read(path).unwrap(), bytes);
            let snapshots = history(&conn, id);
            assert_eq!(snapshots.len(), 1);
            assert_eq!(snapshots[0]["id"], id);
            assert!(!snapshots[0]["created_at"].as_str().unwrap().is_empty());
            let (parsed, version) = files
                .get_schematic_with_version(id, 0, row.sub_type, format)
                .unwrap();
            assert!(
                parsed
                    .blocks
                    .elements
                    .iter()
                    .any(|b| b.block.id.name.as_ref() == "minecraft:stone")
            );
            if matches!(format, 1..=3) {
                assert_eq!(version, Some(3578));
            }
        }
        assert_eq!(count(&conn, "schematics"), 10);
        assert_eq!(user_count(&conn), 10);
    }
    #[test]
    fn updated_import_retains_previous_file_tags_and_count_and_records_new_litematica_version() {
        let root = tempfile::tempdir().unwrap();
        let files = FileManager::for_test(root.path().to_owned());
        let mut conn = database();
        let prepared = fixture(1, -1);
        let original = prepared.bytes.clone();
        let id = persist_import(&mut conn, &files, prepared, None).unwrap();
        conn.execute("UPDATE schematics SET classification='kept category', schematic_tags='kept tags' WHERE id=?1", [id]).unwrap();
        persist_import(&mut conn, &files, fixture(2, 7), Some(id)).unwrap();
        let row = find_schematic(&conn, id).unwrap();
        assert_eq!((row.version, row.lm_version, row.schematic_type), (1, 7, 2));
        assert_eq!(row.version_list, "0,1");
        assert_eq!(row.classification, "kept category");
        assert_eq!(row.schematic_tags, "kept tags");
        assert_eq!(history(&conn, id).len(), 2);
        assert_eq!(history(&conn, id)[1]["version"], 1);
        assert_eq!(history(&conn, id)[1]["schematic_tags"], "kept tags");
        assert_eq!(user_count(&conn), 1);
        assert_eq!(
            fs::read(
                files
                    .schematic_dir(id)
                    .unwrap()
                    .join("schematic_0.-1.1.nbt")
            )
            .unwrap(),
            original
        );
    }
    #[test]
    fn file_install_failure_rolls_back_all_rows_and_user_count() {
        let root = tempfile::tempdir().unwrap();
        let occupied = root.path().join("not-a-directory");
        fs::write(&occupied, b"user data").unwrap();
        let files = FileManager::for_test(occupied.clone());
        let mut conn = database();
        assert!(persist_import(&mut conn, &files, fixture(1, -1), None).is_err());
        assert_empty(&conn);
        assert_eq!(fs::read(occupied).unwrap(), b"user data");
    }
    #[test]
    fn existing_future_version_is_not_overwritten_and_database_stays_on_previous_version() {
        let root = tempfile::tempdir().unwrap();
        let files = FileManager::for_test(root.path().to_owned());
        let mut conn = database();
        let id = persist_import(&mut conn, &files, fixture(1, -1), None).unwrap();
        let occupied = files
            .schematic_dir(id)
            .unwrap()
            .join("schematic_1.-1.1.nbt");
        fs::write(&occupied, b"existing file").unwrap();
        let error = persist_import(&mut conn, &files, fixture(1, -1), Some(id)).unwrap_err();
        assert!(error.to_string().contains("destination already exists"));
        assert_eq!(find_schematic(&conn, id).unwrap().version, 0);
        assert_eq!(history(&conn, id).len(), 1);
        assert_eq!(user_count(&conn), 1);
        assert_eq!(fs::read(occupied).unwrap(), b"existing file");
    }
    #[test]
    fn database_failure_before_file_install_leaves_no_record_or_file() {
        let root = tempfile::tempdir().unwrap();
        let files = FileManager::for_test(root.path().to_owned());
        let mut conn = database();
        conn.execute_batch("CREATE TRIGGER fail_data BEFORE INSERT ON schematic_data BEGIN SELECT RAISE(ABORT,'test write failure'); END;").unwrap();
        assert!(persist_import(&mut conn, &files, fixture(1, -1), None).is_err());
        assert_empty(&conn);
        assert_eq!(fs::read_dir(root.path()).unwrap().count(), 0);
    }
    #[test]
    fn failed_commit_removes_only_new_file_and_rolls_back_history() {
        let root = tempfile::tempdir().unwrap();
        let files = FileManager::for_test(root.path().to_owned());
        let mut conn = database();
        let prepared = fixture(1, -1);
        let original = prepared.bytes.clone();
        let id = persist_import(&mut conn, &files, prepared, None).unwrap();
        // A deferred FK fails at COMMIT, after the real file has been installed.
        conn.execute_batch("CREATE TABLE fail_commit (id INTEGER REFERENCES schematics(id) DEFERRABLE INITIALLY DEFERRED);
            CREATE TRIGGER fail_history AFTER UPDATE ON schematics_history BEGIN INSERT INTO fail_commit VALUES (999999); END;").unwrap();
        let error = persist_import(&mut conn, &files, fixture(2, 7), Some(id)).unwrap_err();
        assert!(error.to_string().contains("transaction failed"));
        assert_eq!(find_schematic(&conn, id).unwrap().version, 0);
        assert_eq!(history(&conn, id).len(), 1);
        assert_eq!(user_count(&conn), 1);
        let directory = files.schematic_dir(id).unwrap();
        assert!(!directory.join("schematic_1.-1.2.litematic").exists());
        assert_eq!(
            fs::read(directory.join("schematic_0.-1.1.nbt")).unwrap(),
            original
        );
        assert_eq!(fs::read_dir(directory).unwrap().count(), 1);
    }
    #[test]
    fn missing_deleted_or_corrupt_history_cannot_receive_an_update() {
        let root = tempfile::tempdir().unwrap();
        let files = FileManager::for_test(root.path().to_owned());
        let mut conn = database();
        assert!(persist_import(&mut conn, &files, fixture(1, -1), Some(99)).is_err());
        assert_empty(&conn);
        let id = persist_import(&mut conn, &files, fixture(1, -1), None).unwrap();
        conn.execute(
            "UPDATE schematics_history SET schematic='{}' WHERE schematic_id=?1",
            [id],
        )
        .unwrap();
        assert!(persist_import(&mut conn, &files, fixture(1, -1), Some(id)).is_err());
        assert_eq!(find_schematic(&conn, id).unwrap().version, 0);
        conn.execute(
            "UPDATE schematics_history SET schematic='[]' WHERE schematic_id=?1",
            [id],
        )
        .unwrap();
        assert!(
            persist_import(&mut conn, &files, fixture(1, -1), Some(id))
                .unwrap_err()
                .to_string()
                .contains("out of sync")
        );
        assert_eq!(find_schematic(&conn, id).unwrap().version, 0);
        conn.execute("UPDATE schematics SET is_deleted=1 WHERE id=?1", [id])
            .unwrap();
        assert!(persist_import(&mut conn, &files, fixture(1, -1), Some(id)).is_err());
        assert_eq!(
            fs::read_dir(files.schematic_dir(id).unwrap())
                .unwrap()
                .count(),
            1
        );
    }
    #[test]
    fn invalid_or_unknown_source_is_rejected_before_database_writes() {
        let labels = BlocksData {
            blocks: Vec::new(),
            block_to_cn: Default::default(),
        };
        assert!(prepare_import("unknown.exe", vec![0; 4], &VersionData::new(), &labels).is_err());
        assert!(prepare_import("broken.nbt", vec![0; 4], &VersionData::new(), &labels).is_err());
    }

    #[test]
    fn concurrent_updates_allocate_distinct_versions_without_losing_history() {
        let root = tempfile::tempdir().unwrap();
        let db_path = root.path().join("isolated.sqlite");
        let file_root = root.path().join("schematics");
        let files = FileManager::for_test(file_root.clone());
        let mut conn = Connection::open(&db_path).unwrap();
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .unwrap();
        initialize_schema(&conn).unwrap();
        let id = persist_import(&mut conn, &files, fixture(1, -1), None).unwrap();
        let barrier = Arc::new(std::sync::Barrier::new(2));
        std::thread::scope(|scope| {
            let mut workers = Vec::new();
            for _ in 0..2 {
                let path = db_path.clone();
                let files = FileManager::for_test(file_root.clone());
                let barrier = Arc::clone(&barrier);
                let prepared = fixture(1, -1);
                workers.push(scope.spawn(move || {
                    let mut connection = Connection::open(path).unwrap();
                    connection
                        .busy_timeout(std::time::Duration::from_secs(3))
                        .unwrap();
                    connection.execute_batch("PRAGMA foreign_keys=ON").unwrap();
                    barrier.wait();
                    persist_import(&mut connection, &files, prepared, Some(id)).unwrap()
                }));
            }
            for worker in workers {
                assert_eq!(worker.join().unwrap(), id);
            }
        });
        assert_eq!(find_schematic(&conn, id).unwrap().version, 2);
        assert_eq!(history(&conn, id).len(), 3);
        assert_eq!(user_count(&conn), 1);
        let directory = files.schematic_dir(id).unwrap();
        for version in 0..=2 {
            assert!(
                directory
                    .join(format!("schematic_{version}.-1.1.nbt"))
                    .exists()
            );
        }
    }
}
