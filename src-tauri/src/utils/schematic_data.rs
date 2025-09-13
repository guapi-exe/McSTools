use crate::utils::block_state_pos_list::{BlockPos, BlockStatePosList};
use crate::utils::tile_entities::TileEntitiesList;
use flate2::CompressError;
use flate2::DecompressError;
use regex::Error as RegexError;
use serde::{Deserialize, Serialize};
use serde_json::Error as JsonError;
use std::io::Error as IoError;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum SchematicError {
    #[error("Root element is not a Compound")]
    RootNotCompound,
    #[error("IO error: {0}")]
    Io(#[from] IoError),
    #[error("JsonError error: {0}")]
    Json(#[from] JsonError),
    #[error("JsonError error: {0}")]
    SQL(#[from] rusqlite::Error),
    #[error("NBT error: {0}")]
    Nbt(#[from] fastnbt::error::Error),
    #[error("UTF8 error: {0}")]
    UTF8(#[from] std::string::FromUtf8Error),
    #[error("SNBT error: {0}")]
    SNbt(#[from] fastsnbt::error::Error),
    #[error("Invalid data format: {0}")]
    InvalidFormat(&'static str),
    #[error("Base64 err: {0}")]
    Base64(#[from] base64::DecodeError),
    #[error("GZIP err: {0}")]
    GzipCompress(#[from] CompressError),
    #[error("GZIP err: {0}")]
    GzipDecompress(#[from] DecompressError),
    #[error("regex err: {0}")]
    Regex(#[from] RegexError),
    #[error("Type mismatch: expected '{expected}', found '{actual}'")]
    TypeMismatch {
        expected: &'static str,
        actual: String,
    },
    #[error("Missing required field: {0}")]
    MissingField(String),
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct Size {
    pub width: i32,
    pub height: i32,
    pub length: i32,
}

impl Size {
    pub fn to_string(&self) -> String {
        format!("{},{},{}", self.width, self.height, self.length)
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct
SchematicData {
    pub blocks: BlockStatePosList,
    pub tile_entities_list: TileEntitiesList,
    pub size: Size,
}

impl SchematicData {
    pub fn new(
        blocks: BlockStatePosList,
        tile_entities_list: TileEntitiesList,
        size: Size,
    ) -> Self {
        Self {
            blocks,
            tile_entities_list,
            size,
        }
    }
}

