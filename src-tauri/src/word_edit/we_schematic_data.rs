use crate::utils::block_state_pos_list::BlockData;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WeMetadata {
    //we蓝图 metadata参数较为自由暂时弃用
    pub(crate) we_offset_x: i64,
    pub(crate) we_offset_y: i64,
    pub(crate) we_offset_z: String,
    pub(crate) created_by: i32,
    pub(crate) author: i32,
    pub(crate) data: String,
    pub(crate) name: i32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct WeSize {
    pub length: i32,
    pub width: i32,
    pub height: i32,
}
impl WeSize {
    pub fn to_string(&self) -> String {
        format!("{},{},{}", self.width, self.height, self.length)
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct WeVersion {
    pub version: i32,
    pub data_version: i32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct WeOffset {
    pub offset: Vec<i32>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct WeSchematicData {
    pub type_version: i32,
    pub size: WeSize,
    pub palette: HashMap<i32, Arc<BlockData>>,
    pub palette_max: i32,
    pub block_data: Vec<i8>,
}
