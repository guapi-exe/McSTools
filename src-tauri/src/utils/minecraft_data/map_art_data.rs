use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use tauri::{AppHandle, Manager};
use tauri::path::BaseDirectory;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockColorData {
    pub left_top: Vec<u8>,
    pub right_bottom: Vec<u8>,
    pub right_top: Vec<u8>,
    pub left_bottom: Vec<u8>,
    #[serde(rename = "average_rgb")]
    pub average: Vec<u8>,
    #[serde(rename = "low_rgb")]
    pub low: Vec<u8>,
    #[serde(rename = "normal_rgb")]
    pub normal: Vec<u8>,
    #[serde(rename = "high_rgb")]
    pub high: Vec<u8>,
    #[serde(rename = "average_rgb_hex")]
    pub average_hex: String,
    #[serde(rename = "low_rgb_hex")]
    pub low_hex: String,
    #[serde(rename = "normal_rgb_hex")]
    pub normal_hex: String,
    #[serde(rename = "high_rgb_hex")]
    pub high_hex: String,
    pub zh_cn: String,
}

pub type CategoryBlocks = HashMap<String, HashMap<String, BlockColorData>>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MapArtsData {
    #[serde(flatten)]
    pub categories: CategoryBlocks,
}

impl MapArtsData {
    pub fn new(app: &AppHandle) -> Result<Self> {
        let path = app.path().resolve("data/blocks_art.json", BaseDirectory::Resource)?;
        let str = fs::read_to_string(path)?;
        let raw_block = serde_json::from_str(str.as_str())?;
        Ok(raw_block)
    }
}
