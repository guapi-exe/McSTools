//! Cross-platform connection persistence in the application's SQLite database.
//! Keys are deliberately not encrypted here: never serialize them into frontend
//! profiles/settings or logs. A copied database must be treated as private data.
use rusqlite::{Connection, OptionalExtension, params};

const ORIGIN: &str = "https://www.mcschematic.top";
const READ_ERROR: &str = "无法读取保存的连接，请稍后重试";
const WRITE_ERROR: &str = "无法保存连接，原连接保持不变";
const INVALID_KEY: &str = "保存的连接无效，请重新连接";

pub(super) fn valid_key(key: &str) -> bool {
    key.starts_with("mcs_live_")
        && key.len() <= 512
        && key
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
}

fn save_record(conn: &Connection, key: Option<&str>) -> Result<(), &'static str> {
    if key.is_some_and(|key| !valid_key(key)) {
        return Err(INVALID_KEY);
    }
    // Bound parameters only; never include a database error (or key) in logs/IPC.
    conn.execute(
        "INSERT INTO site_connections (origin, api_key) VALUES (?1, ?2)
         ON CONFLICT(origin) DO UPDATE
         SET api_key = excluded.api_key, updated_at = CURRENT_TIMESTAMP",
        params![ORIGIN, key],
    )
    .map_err(|_| WRITE_ERROR)?;
    Ok(())
}

fn read_with_legacy(
    conn: &Connection,
    read_legacy: impl FnOnce() -> Result<Option<String>, &'static str>,
    delete_legacy: impl FnOnce() -> Result<(), &'static str>,
) -> Result<Option<String>, &'static str> {
    let record: Option<Option<String>> = conn
        .query_row(
            "SELECT api_key FROM site_connections WHERE origin = ?1",
            [ORIGIN],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| READ_ERROR)?;
    if let Some(key) = record {
        if key.as_deref().is_some_and(|key| !valid_key(key)) {
            return Err(INVALID_KEY);
        }
        return Ok(key);
    }

    // One-time upgrade only. Commit before removing the old Windows entry.
    // Even a NULL key marks the migration complete, so failed legacy cleanup
    // can never resurrect an old account after an explicit disconnect.
    let key = read_legacy()?;
    save_record(conn, key.as_deref())?;
    let _ = delete_legacy();
    Ok(key)
}

pub fn read(conn: &Connection, identifier: &str) -> Result<Option<String>, &'static str> {
    read_with_legacy(
        conn,
        || legacy::read(identifier),
        || legacy::delete(identifier),
    )
}

pub fn write(conn: &Connection, identifier: &str, key: &str) -> Result<(), &'static str> {
    save_record(conn, Some(key))?;
    let _ = legacy::delete(identifier);
    Ok(())
}

pub fn delete(conn: &Connection, identifier: &str) -> Result<(), &'static str> {
    // Retain only a NULL marker, not the key. This also skips legacy migration
    // when the user disconnects before the first restore has succeeded.
    save_record(conn, None)?;
    let _ = legacy::delete(identifier);
    Ok(())
}

// Compatibility reader for earlier Windows builds; there is no vault writer.
// All platforms use the same SQLite schema and persistence path above.
#[cfg(windows)]
mod legacy {
    use windows_sys::Win32::Foundation::{ERROR_NOT_FOUND, GetLastError};
    use windows_sys::Win32::Security::Credentials::{
        CRED_TYPE_GENERIC, CredDeleteW, CredFree, CredReadW,
    };

    fn target(identifier: &str) -> Vec<u16> {
        format!("McSTools/{identifier}/www.mcschematic.top/api-v1")
            .encode_utf16()
            .chain(Some(0))
            .collect()
    }

    pub fn read(identifier: &str) -> Result<Option<String>, &'static str> {
        let target = target(identifier);
        let mut ptr = std::ptr::null_mut();
        // SAFETY: valid NUL-terminated target and output pointer. CredFree
        // releases the one returned allocation on every successful path.
        unsafe {
            if CredReadW(target.as_ptr(), CRED_TYPE_GENERIC, 0, &mut ptr) == 0 {
                return if GetLastError() == ERROR_NOT_FOUND {
                    Ok(None)
                } else {
                    Err("无法恢复旧连接，请重新输入 API Key")
                };
            }
            let credential = &*ptr;
            let result = if credential.CredentialBlobSize == 0
                || credential.CredentialBlobSize > 512
                || credential.CredentialBlob.is_null()
            {
                Err(super::INVALID_KEY)
            } else {
                let bytes = std::slice::from_raw_parts(
                    credential.CredentialBlob,
                    credential.CredentialBlobSize as usize,
                );
                String::from_utf8(bytes.to_vec())
                    .map(Some)
                    .map_err(|_| super::INVALID_KEY)
            };
            CredFree(ptr.cast());
            result
        }
    }

    pub fn delete(identifier: &str) -> Result<(), &'static str> {
        let target = target(identifier);
        // SAFETY: valid NUL-terminated target; no returned allocation.
        unsafe {
            if CredDeleteW(target.as_ptr(), CRED_TYPE_GENERIC, 0) == 0
                && GetLastError() != ERROR_NOT_FOUND
            {
                return Err("无法清理旧连接");
            }
        }
        Ok(())
    }
}

#[cfg(not(windows))]
mod legacy {
    pub fn read(_: &str) -> Result<Option<String>, &'static str> {
        Ok(None)
    }
    pub fn delete(_: &str) -> Result<(), &'static str> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::db_control::{drop_all_tables_in_transaction, initialize_schema};
    use std::cell::Cell;

    const KEY: &str = "mcs_live_fake_database_test";

    fn database() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        initialize_schema(&conn).unwrap();
        conn
    }

    fn read_database_only(conn: &Connection) -> Option<String> {
        read_with_legacy(
            conn,
            || panic!("a database record must bypass the legacy store"),
            || panic!("a database read must bypass legacy cleanup"),
        )
        .unwrap()
    }

    #[test]
    fn connection_survives_reopen_and_schema_upgrade() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("connection.sqlite");
        {
            let conn = Connection::open(&path).unwrap();
            initialize_schema(&conn).unwrap();
            save_record(&conn, Some(KEY)).unwrap();
        }
        let conn = Connection::open(&path).unwrap();
        initialize_schema(&conn).unwrap();
        assert_eq!(read_database_only(&conn).as_deref(), Some(KEY));
        save_record(&conn, Some("mcs_live_fake_replacement")).unwrap();
        drop(conn);
        let conn = Connection::open(&path).unwrap();
        assert_eq!(
            read_database_only(&conn).as_deref(),
            Some("mcs_live_fake_replacement")
        );
        save_record(&conn, None).unwrap();
        drop(conn);
        let conn = Connection::open(&path).unwrap();
        assert!(read_database_only(&conn).is_none());
    }

    #[test]
    fn migrations_are_idempotent_and_do_not_change_user_data() {
        let conn = database();
        conn.execute(
            "UPDATE user_data SET nickname = 'existing-user' WHERE id = 1",
            [],
        )
        .unwrap();
        save_record(&conn, Some(KEY)).unwrap();
        initialize_schema(&conn).unwrap();
        assert_eq!(read_database_only(&conn).as_deref(), Some(KEY));
        let nickname: String = conn
            .query_row("SELECT nickname FROM user_data WHERE id = 1", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(nickname, "existing-user");
        let logs: i64 = conn
            .query_row("SELECT count(*) FROM app_logs", [], |row| row.get(0))
            .unwrap();
        assert_eq!(logs, 0);
        assert!(
            read_with_legacy(&database(), || Ok(None), || Ok(()))
                .unwrap()
                .is_none()
        );
    }

    #[test]
    fn invalid_replacement_and_failed_write_preserve_the_saved_key() {
        let conn = database();
        save_record(&conn, Some(KEY)).unwrap();
        for key in [
            "",
            "bad-key",
            "mcs_live_x'); DROP TABLE user_data; --",
            &"mcs_live_".repeat(60),
        ] {
            assert!(save_record(&conn, Some(key)).is_err());
        }
        assert_eq!(read_database_only(&conn).as_deref(), Some(KEY));
        conn.execute_batch("PRAGMA query_only = ON").unwrap();
        assert_eq!(save_record(&conn, Some("mcs_live_new")), Err(WRITE_ERROR));
        assert_eq!(save_record(&conn, None), Err(WRITE_ERROR));
        assert_eq!(read_database_only(&conn).as_deref(), Some(KEY));
    }

    #[test]
    fn legacy_migration_commits_before_cleanup() {
        let conn = database();
        let cleaned = Cell::new(false);
        let key = read_with_legacy(
            &conn,
            || Ok(Some(KEY.into())),
            || {
                assert_eq!(read_database_only(&conn).as_deref(), Some(KEY));
                cleaned.set(true);
                Ok(())
            },
        )
        .unwrap();
        assert_eq!(key.as_deref(), Some(KEY));
        assert!(cleaned.get());
    }

    #[test]
    fn failed_migration_keeps_legacy_and_can_be_retried() {
        let conn = database();
        conn.execute_batch("PRAGMA query_only = ON").unwrap();
        assert!(
            read_with_legacy(
                &conn,
                || Ok(Some(KEY.into())),
                || panic!("must not delete before commit")
            )
            .is_err()
        );
        conn.execute_batch("PRAGMA query_only = OFF").unwrap();
        assert!(
            read_with_legacy(
                &conn,
                || Err("legacy unavailable"),
                || panic!("must not delete unread data")
            )
            .is_err()
        );
        assert_eq!(
            read_with_legacy(&conn, || Ok(Some(KEY.into())), || Ok(()))
                .unwrap()
                .as_deref(),
            Some(KEY)
        );
    }

    #[test]
    fn cleanup_failure_or_disconnect_cannot_resurrect_a_legacy_account() {
        let conn = database();
        read_with_legacy(&conn, || Ok(Some(KEY.into())), || Err("cleanup failed")).unwrap();
        save_record(&conn, None).unwrap();
        assert!(read_database_only(&conn).is_none());
        // Disconnecting before restore also records that migration is finished.
        let fresh = database();
        save_record(&fresh, None).unwrap();
        assert!(read_database_only(&fresh).is_none());
        save_record(&fresh, None).unwrap();
        assert!(read_database_only(&fresh).is_none());
    }

    #[test]
    fn corrupted_records_are_not_used_or_exposed_in_errors() {
        let conn = database();
        conn.execute(
            "INSERT INTO site_connections (origin, api_key) VALUES (?1, 'malformed-secret')",
            [ORIGIN],
        )
        .unwrap();
        assert_eq!(
            read_with_legacy(&conn, || panic!(), || panic!()),
            Err(INVALID_KEY)
        );
    }

    #[test]
    fn reset_removes_connection_table_too() {
        let conn = database();
        save_record(&conn, Some(KEY)).unwrap();
        drop_all_tables_in_transaction(&conn).unwrap();
        initialize_schema(&conn).unwrap();
        assert!(
            read_with_legacy(&conn, || Ok(None), || Ok(()))
                .unwrap()
                .is_none()
        );
    }
}
