use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Schematic {
    pub id: i64,
    pub name: String,
    pub description: String,
    #[serde(default = "default_type")]
    pub schematic_type: i32,
    #[serde(default = "default_type")]
    pub sub_type: i32,
    #[serde(default)]
    pub is_deleted: bool,
    pub sizes: String,
    pub user: String,
    pub is_upload: bool,
    pub version: i32,
    pub game_version: String,
    pub version_list: String,
    pub created_at: String,
    pub schematic_tags: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
pub struct PaginatedResponse<T> {
    pub data: Vec<T>,
    pub page: i32,
    pub page_size: i32,
}
#[derive(Debug, Serialize, Deserialize)]
pub struct LogEntry {
    pub level: String,
    pub target: String,
    pub message: String,
    pub context: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UserData {
    pub id: i64,
    pub nickname: String,
    pub avatar: String,
    pub qq: String,
    pub access_token: String,
    pub openid: String,
    pub schematics: i32,
    pub cloud: i32,
}

fn default_type() -> i32 {
    -1
}
