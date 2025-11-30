use crate::database::db_control::DatabaseState;
use crate::database::db_data::{UserData};
use anyhow::{Result};
use r2d2::PooledConnection;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::{params};
use tauri::State;

pub fn add_user_schematic(
    conn: &mut PooledConnection<SqliteConnectionManager>,
    number: i64,
) -> Result<i64> {
    let tx = conn.transaction()?;
    tx.execute(
        "UPDATE user_data SET schematics = schematics + ?1 WHERE id = 1",
        [number],
    )?;

    let new_value: i64 =
        tx.query_row("SELECT schematics FROM user_data WHERE id = 1", [], |row| {
            row.get(0)
        })?;

    tx.commit()?;

    Ok(new_value)
}

pub fn update_user_classification(
    conn: &mut PooledConnection<SqliteConnectionManager>,
    classification: String,
) -> Result<i64> {
    let tx = conn.transaction()?;

    tx.execute(
        r#"UPDATE user_data
        SET
            classification = ?1
        WHERE id = 1"#,
        params![classification],
    )?;

    tx.commit()?;

    Ok(conn.last_insert_rowid())
}

pub fn add_cloud(conn: &mut PooledConnection<SqliteConnectionManager>) -> Result<i64> {
    let tx = conn.transaction()?;
    tx.execute("UPDATE user_data SET cloud = cloud + 1 WHERE id = 1", [])?;

    let new_value: i64 = tx.query_row("SELECT cloud FROM user_data WHERE id = 1", [], |row| {
        row.get(0)
    })?;

    tx.commit()?;

    Ok(new_value)
}

#[tauri::command]
pub fn get_user_data(db: State<'_, DatabaseState>) -> Result<UserData, String> {
    let conn = db.0.get().map_err(|e| e.to_string())?;
    Ok(conn
        .query_row("SELECT * FROM user_data WHERE id = 1", [], |row| {
            Ok(UserData {
                id: row.get("id")?,
                nickname: row.get("nickname")?,
                avatar: row.get("avatar")?,
                qq: row.get("qq")?,
                access_token: row.get("accessToken")?,
                openid: row.get("openid")?,
                schematics: row.get("schematics")?,
                classification: row.get("classification")?,
                cloud: row.get("cloud")?,
            })
        })
        .map_err(|e| e.to_string())?)
}

#[tauri::command]
pub fn get_user_classification(db: State<'_, DatabaseState>) -> Result<String, String> {
    let conn = db.0.get().map_err(|e| e.to_string())?;
    Ok(conn
        .query_row("SELECT * FROM user_data WHERE id = 1", [], |row| {
            Ok(row.get("classification")?)
        })
        .map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn update_user_classification_tauri(
    db: State<'_, DatabaseState>,
    classification: String,
) -> Result<bool, String> {
    async move {
        let mut conn = db.0.get()?;
        update_user_classification(&mut conn, classification)?;
        Ok(true)
    }
        .await
        .map_err(|e: anyhow::Error| e.to_string())
}