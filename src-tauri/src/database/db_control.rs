use anyhow::{Context, Result};
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use std::path::PathBuf;
use rusqlite::Connection;
use tauri::{AppHandle, Manager};

type SqlitePool = Pool<SqliteConnectionManager>;

#[derive(Clone)]
pub struct DatabaseState(pub SqlitePool);

fn get_db_path(app: &AppHandle) -> Result<PathBuf> {
    let data_dir = app
        .path()
        .app_data_dir()
        .context("Unable to retrieve the application data directory")?
        .join("data");

    if !data_dir.exists() {
        std::fs::create_dir_all(&data_dir).context("Failed to create data directory")?;
    }

    Ok(data_dir)
}

pub fn init_db(app_handle: &AppHandle) -> Result<DatabaseState> {
    let db_path = get_db_path(app_handle)?.join("mcs_tools.db");
    let manager = SqliteConnectionManager::file(db_path)
        .with_flags(
            rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE | rusqlite::OpenFlags::SQLITE_OPEN_CREATE,
        )
        .with_init(|conn| {
            conn.execute_batch(
                "PRAGMA journal_mode = WAL;
                 PRAGMA synchronous = NORMAL;
                 PRAGMA foreign_keys = ON;",
            )
        });

    let pool = Pool::builder()
        .max_size(5)
        .build(manager)
        .context("创建连接池失败")?;

    let conn = pool.get()?;
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS schematics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            type INTEGER DEFAULT -1, -- TYPE-> nbt 1 litematic 2 schem 3 json 4 mcstruct 5
            sub_type INTEGER DEFAULT -1, -- SUB Schem 0 新 1 旧 json 0 1.20+ 1 1.16+ 2 1.12+
            is_deleted BLOB DEFAULT FALSE,
            sizes TEXT DEFAULT '',
            user TEXT DEFAULT '', -- 简单的记录用户名，个人存储应该不太需要详细记录
            version INTEGER DEFAULT 0,
            game_version TEXT DEFAULT '',
            classification TEXT DEFAULT '',
            lm_version INTEGER DEFAULT 0,
            version_list TEXT DEFAULT '', -- 版本控制器记录版本号id
            is_upload BLOB DEFAULT FALSE,
            schematic_tags TEXT DEFAULT '{}', -- 元数据（JSON格式存储）
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_schematic_search
        ON schematics(created_at DESC, name, description);


        CREATE TABLE IF NOT EXISTS schematics_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            schematic_id INTEGER NOT NULL,
            schematic TEXT DEFAULT '{}', -- 元数据（JSON格式存储）
            requirements TEXT DEFAULT '{}', -- 元数据（JSON格式存储）
            unique_blocks TEXT DEFAULT '{}', -- 元数据（JSON格式存储）
            FOREIGN KEY (
                schematic_id
            ) REFERENCES schematics (
                id
            ) ON DELETE CASCADE,

            UNIQUE(schematic_id)
        );

        CREATE INDEX IF NOT EXISTS idx_schematics_history
        ON schematics_history(schematic_id);

        CREATE TABLE IF NOT EXISTS schematic_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            schematic_id INTEGER NOT NULL,
            requirements TEXT DEFAULT '{}', -- 元数据（JSON格式存储）
            unique_blocks TEXT DEFAULT '{}', -- 元数据（JSON格式存储）

            FOREIGN KEY (
                schematic_id
            ) REFERENCES schematics (
                id
            ) ON DELETE CASCADE,

            UNIQUE(schematic_id)
        );
        CREATE INDEX IF NOT EXISTS idx_requirements_schematic
        ON schematic_data(schematic_id);

        CREATE TABLE IF NOT EXISTS app_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            level TEXT DEFAULT 'INFO' CHECK(level IN ('TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR')),
            target TEXT DEFAULT '',
            message TEXT DEFAULT '',
            context TEXT DEFAULT ''
        );

        CREATE INDEX IF NOT EXISTS idx_logs_search
        ON app_logs(timestamp DESC, level, target);

        CREATE TABLE IF NOT EXISTS user_data (
            id INTEGER PRIMARY KEY,
            nickname TEXT DEFAULT '',
            avatar TEXT DEFAULT '',
            qq TEXT DEFAULT '',
            classification TEXT DEFAULT '',
            accessToken TEXT DEFAULT '', -- qq登录凭证
            openid TEXT DEFAULT '',-- qq登录唯一身份码
            schematics INTEGER DEFAULT 0,
            cloud INTEGER DEFAULT 0
        );

        INSERT INTO user_data (id, nickname, avatar, qq, accessToken, openid, schematics, cloud)
        SELECT 1, '', '', '', '', '', 0, 0
        WHERE NOT EXISTS (SELECT 1 FROM user_data WHERE id = 1);
        "#,
    )?;
    add_column_if_missing_schematics(&conn)?;
    add_column_if_missing_user(&conn)?;
    Ok(DatabaseState(pool))
}

fn add_column_if_missing_schematics(conn: &Connection) -> Result<()> {
    let mut stmt = conn.prepare("PRAGMA table_info(schematics)")?;
    let columns: Vec<String> = stmt.query_map([], |row| row.get(1))?
        .collect::<rusqlite::Result<Vec<String>>>()?;

    if !columns.contains(&"schematic_tags".to_string()) {
        conn.execute_batch(
            "ALTER TABLE schematics ADD COLUMN schematic_tags TEXT DEFAULT '{}';"
        )?;
    }

    if !columns.contains(&"lm_version".to_string()) {
        conn.execute_batch(
            "ALTER TABLE schematics ADD COLUMN lm_version INTEGER DEFAULT 0;"
        )?;
    }

    if !columns.contains(&"classification".to_string()) {
        conn.execute_batch(
            "ALTER TABLE schematics ADD COLUMN classification TEXT DEFAULT '';"
        )?;
    }

    Ok(())
}

fn add_column_if_missing_user(conn: &Connection) -> Result<()> {
    let mut stmt = conn.prepare("PRAGMA table_info(user_data)")?;
    let columns: Vec<String> = stmt.query_map([], |row| row.get(1))?
        .collect::<rusqlite::Result<Vec<String>>>()?;

    if !columns.contains(&"classification".to_string()) {
        conn.execute_batch(
            "ALTER TABLE user_data ADD COLUMN classification TEXT DEFAULT '';"
        )?;
    }

    Ok(())
}

pub fn drop_all_tables_in_transaction(conn: &Connection) -> Result<()> {
    let tables = [
        "app_logs",
        "user_data",
        "schematics_history",
        "schematic_data",
        "schematics"
    ];

    for table in tables.iter() {
        conn.execute_batch(&format!("DROP TABLE IF EXISTS {};", table))
            .context(format!("Delete {} table failed", table))?;
    }

    let indexes = [
        "idx_schematics_history",
        "idx_requirements_schematic",
        "idx_logs_search",
        "idx_schematic_search"
    ];

    for index in indexes.iter() {
        conn.execute_batch(&format!("DROP INDEX IF EXISTS {};", index))
            .context(format!("Delete {} Indexing failed", index))?;
    }

    Ok(())
}