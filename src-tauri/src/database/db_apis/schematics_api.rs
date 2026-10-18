use crate::database::db_control::DatabaseState;
use crate::database::db_data::{PaginatedResponse, Schematic};
use anyhow::Result;
use r2d2::PooledConnection;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::params;
use tauri::State;

pub fn delete_schematic_data(
    conn: &mut PooledConnection<SqliteConnectionManager>,
    id: i64,
) -> Result<i64> {
    let tx = conn.transaction()?;
    tx.execute(
        r#"UPDATE schematics
        SET is_deleted = TRUE,
            updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now')
        WHERE id = ?
        AND is_deleted = FALSE"#,
        params![id],
    )?;
    tx.commit()?;
    Ok(id)
}

pub fn update_schematic(
    conn: &mut PooledConnection<SqliteConnectionManager>,
    schematic: Schematic,
) -> Result<i64> {
    let tx = conn.transaction()?;

    tx.execute(
        r#"UPDATE schematics
        SET
            name = ?1,
            description = ?2,
            type = ?3,
            sub_type = ?4,
            sizes = ?5,
            user = ?6,
            version = ?7,
            game_version = ?8,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?9"#,
        params![
            schematic.name,
            schematic.description,
            schematic.schematic_type,
            schematic.sub_type,
            schematic.sizes,
            schematic.user,
            schematic.version,
            schematic.game_version,
            schematic.id
        ],
    )?;

    tx.commit()?;

    Ok(schematic.id)
}

pub fn update_schematic_name(
    conn: &mut PooledConnection<SqliteConnectionManager>,
    name: String,
    description: String,
    schematic_tags: String,
    schematic_id: i64,
) -> Result<i64> {
    let tx = conn.transaction()?;

    tx.execute(
        r#"UPDATE schematics
        SET
            name = ?1,
            description = ?2,
            schematic_tags = ?3,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?4"#,
        params![name, description, schematic_tags, schematic_id],
    )?;

    tx.commit()?;

    Ok(schematic_id)
}

pub fn update_schematic_classification(
    conn: &mut PooledConnection<SqliteConnectionManager>,
    classification: String,
    schematic_id: i64,
) -> Result<i64> {
    let tx = conn.transaction()?;

    tx.execute(
        r#"UPDATE schematics
        SET
            classification = ?1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?2"#,
        params![classification, schematic_id],
    )?;

    tx.commit()?;

    Ok(schematic_id)
}

pub fn update_schematic_lm_version(
    conn: &mut PooledConnection<SqliteConnectionManager>,
    lm_version: i32,
    schematic_id: i64,
) -> Result<i64> {
    let tx = conn.transaction()?;

    tx.execute(
        r#"UPDATE schematics
        SET
            lm_version = ?1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?2"#,
        params![lm_version, schematic_id],
    )?;

    tx.commit()?;

    Ok(schematic_id)
}

pub fn update_schematic_game_version(
    conn: &mut PooledConnection<SqliteConnectionManager>,
    game_version: &str,
    schematic_id: i64,
) -> Result<i64> {
    let tx = conn.transaction()?;

    tx.execute(
        r#"UPDATE schematics
        SET
            game_version = ?1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?2"#,
        params![game_version, schematic_id],
    )?;

    tx.commit()?;

    Ok(schematic_id)
}

pub fn new_schematic(
    mut conn: &mut PooledConnection<SqliteConnectionManager>,
    schematic: Schematic,
) -> Result<i64> {
    let tx = conn.transaction()?;
    tx.execute(
        r#"INSERT INTO schematics (
            name, description, type, sub_type,
            sizes, user, version_list, game_version, lm_version
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)"#,
        params![
            schematic.name,
            schematic.description,
            schematic.schematic_type,
            schematic.sub_type,
            schematic.sizes,
            schematic.user,
            schematic.version_list,
            schematic.game_version,
            schematic.lm_version
        ],
    )?;
    let rowid = tx.last_insert_rowid();
    tx.commit()?;

    Ok(rowid)
}

pub fn find_schematic(conn: &rusqlite::Connection, id: i64) -> Result<Schematic> {
    let schematic = conn.query_row(
        "SELECT * FROM schematics WHERE id = ? AND is_deleted = FALSE",
        [id],
        |row| {
            Ok(Schematic {
                id: row.get("id")?,
                name: row.get("name")?,
                description: row.get("description")?,
                schematic_type: row.get("type")?,
                sub_type: row.get("sub_type")?,
                is_deleted: row.get("is_deleted")?,
                sizes: row.get("sizes")?,
                user: row.get("user")?,
                is_upload: row.get("is_upload")?,
                version: row.get("version")?,
                version_list: row.get("version_list")?,
                created_at: row.get("created_at")?,
                updated_at: row.get("updated_at")?,
                schematic_tags: row.get("schematic_tags")?,
                game_version: row.get("game_version")?,
                lm_version: row.get("lm_version")?,
                classification: row.get("classification")?,
            })
        },
    );
    Ok(schematic?)
}

pub fn get_schematic_version(
    mut conn: &mut PooledConnection<SqliteConnectionManager>,
    id: i64,
) -> Result<i32> {
    let tx = conn.transaction()?;
    let schematic = tx.query_row(
        "SELECT * FROM schematics WHERE id = ? AND is_deleted = FALSE",
        [id],
        |row| Ok(row.get("version")?),
    );
    tx.commit()?;
    Ok(schematic?)
}

#[tauri::command]
pub fn add_schematic(db: State<'_, DatabaseState>, schematic: Schematic) -> Result<i64, String> {
    let mut conn = db.0.get().map_err(|e| e.to_string())?;

    let new = new_schematic(&mut conn, schematic).map_err(|e| e.to_string())?;
    Ok(new)
}

#[tauri::command]
pub fn update_schematic_tauri(
    db: State<'_, DatabaseState>,
    schematic: Schematic,
) -> Result<i64, String> {
    let mut conn = db.0.get().map_err(|e| e.to_string())?;

    let new = update_schematic(&mut conn, schematic).map_err(|e| e.to_string())?;
    Ok(new)
}

#[tauri::command]
pub fn get_schematic(db: State<'_, DatabaseState>, id: i64) -> Result<Schematic, String> {
    let mut conn = db.0.get().map_err(|e| e.to_string())?;
    let schematic = find_schematic(&mut conn, id);
    Ok(schematic.map_err(|e| e.to_string())?)
}
#[tauri::command]
pub fn get_schematics(
    db: State<'_, DatabaseState>,
    filter: &str,
    classification_filter: &str,
    page: i32,
    page_size: i32,
    sort_by: Option<String>,
    sort_order: Option<String>,
    schematic_type: Option<i32>,
    game_version: Option<String>,
) -> Result<PaginatedResponse<Schematic>, String> {
    let conn = db.0.get().map_err(|e| e.to_string())?;
    let page = page.max(1);
    let page_size = page_size.clamp(1, 100);

    let offset = (page - 1) * page_size;

    let search_pattern = if filter.is_empty() {
        "".to_string()
    } else {
        format!("%{}%", filter)
    };

    let classification_pattern = if classification_filter.is_empty() {
        "".to_string()
    } else {
        format!("%{}%", classification_filter)
    };

    // -1 / "" mean "no filter" for the optional dimension filters.
    let type_param = schematic_type.unwrap_or(-1);
    let version_param = game_version.unwrap_or_default();

    // Sort keys are formatted into the SQL, so only whitelisted values are
    // accepted — anything else falls back to the default ordering.
    let sort_column = match sort_by.as_deref() {
        Some("updated_at") => "updated_at",
        Some("name") => "name",
        _ => "created_at",
    };
    let sort_direction = match sort_order.as_deref() {
        Some("asc") => "ASC",
        _ => "DESC",
    };

    let where_clause = r#"
        WHERE
            is_deleted = FALSE
            AND (?2 = '' OR schematic_tags LIKE ?2)
            AND (?1 = '' OR name LIKE ?1 OR description LIKE ?1 OR schematic_tags LIKE ?1)
            AND (?3 < 0 OR type = ?3)
            AND (?4 = '' OR game_version = ?4)
    "#;

    let total: i64 = conn
        .query_row(
            &format!("SELECT COUNT(*) FROM schematics {where_clause}"),
            rusqlite::params![
                search_pattern,
                classification_pattern,
                type_param,
                version_param
            ],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let sql = format!(
        r#"SELECT * FROM schematics {where_clause} ORDER BY {sort_column} {sort_direction} LIMIT ?5 OFFSET ?6"#
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let schematics = stmt
        .query_map(
            rusqlite::params![
                search_pattern,
                classification_pattern,
                type_param,
                version_param,
                page_size,
                offset
            ],
            |row| {
                Ok(Schematic {
                    id: row.get("id")?,
                    name: row.get("name")?,
                    description: row.get("description")?,
                    schematic_type: row.get("type")?,
                    sub_type: row.get("sub_type")?,
                    is_deleted: row.get("is_deleted")?,
                    sizes: row.get("sizes")?,
                    user: row.get("user")?,
                    is_upload: row.get("is_upload")?,
                    version: row.get("version")?,
                    version_list: row.get("version_list")?,
                    created_at: row.get("created_at")?,
                    updated_at: row.get("updated_at")?,
                    schematic_tags: row.get("schematic_tags")?,
                    game_version: row.get("game_version")?,
                    lm_version: row.get("lm_version")?,
                    classification: row.get("classification")?,
                })
            },
        )
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(PaginatedResponse {
        data: schematics,
        page,
        page_size,
        total,
    })
}

#[tauri::command]
pub fn delete_schematic_database(db: State<'_, DatabaseState>, id: i64) -> Result<i64, String> {
    let mut conn = db.0.get().map_err(|e| e.to_string())?;

    let new = delete_schematic_data(&mut conn, id).map_err(|e| e.to_string())?;
    Ok(new)
}

#[tauri::command]
pub fn count_schematics(
    db: State<'_, DatabaseState>,
    classification_filter: &str,
    filter: Option<String>,
) -> Result<i64, String> {
    let conn = db.0.get().map_err(|e| e.to_string())?;

    // 如果传空字符串，就表示不过滤 classification
    let filter_pattern = if classification_filter.is_empty() {
        "".to_string()
    } else {
        format!("%{}%", classification_filter)
    };

    // Same text matching as get_schematics so counts stay consistent with the
    // list when a search keyword is active.
    let keyword = filter.unwrap_or_default();
    let search_pattern = if keyword.is_empty() {
        "".to_string()
    } else {
        format!("%{}%", keyword)
    };

    let mut stmt = conn
        .prepare(
            r#"
            SELECT COUNT(*) FROM schematics
            WHERE
                (?1 = '' OR schematic_tags LIKE ?1)
                AND (?2 = '' OR name LIKE ?2 OR description LIKE ?2 OR schematic_tags LIKE ?2)
                AND is_deleted = FALSE
            "#,
        )
        .map_err(|e| e.to_string())?;

    let count: i64 = stmt
        .query_row(rusqlite::params![filter_pattern, search_pattern], |row| {
            row.get(0)
        })
        .map_err(|e| e.to_string())?;

    Ok(count)
}

/// Distinct game versions actually present in the library, newest first.
/// Drives the game-version filter dropdown without hardcoding a list.
#[tauri::command]
pub fn get_distinct_game_versions(db: State<'_, DatabaseState>) -> Result<Vec<String>, String> {
    let conn = db.0.get().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            r#"
            SELECT DISTINCT game_version FROM schematics
            WHERE is_deleted = FALSE AND game_version != ''
            ORDER BY game_version DESC
            "#,
        )
        .map_err(|e| e.to_string())?;

    let versions = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(versions)
}
