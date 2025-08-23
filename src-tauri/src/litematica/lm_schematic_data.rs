use crate::utils::block_state_pos_list::BlockPos;
use fastnbt::Value;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LmMetadata {
    pub time_created: i64,
    pub time_modified: i64,
    pub description: String,
    pub region_count: i32,
    pub total_blocks: i32,
    pub author: String,
    pub total_volume: i32,
    pub enclosing_size: BlockPos,
    pub name: String,
}
#[derive(Debug, Clone)]
pub struct RegionData {
    pub region_name: String,
    pub block_states: Vec<i64>,
    pub position: BlockPos,
    pub size: BlockPos,
    pub block_state_palette: Vec<Value>,
    pub tile_entities: Vec<Value>,
    pub entities: Vec<Value>,
    pub bits: i32,
}

#[derive(Debug, Clone, Default)]
pub struct RegionList {
    pub(crate) map: HashMap<String, RegionData>,
}

#[derive(Debug, Clone, Default)]
pub struct RegionNameList {
    pub(crate) names: Vec<String>,
}

impl RegionNameList {
    pub fn add(&mut self, region_name: String) {
        self.names.push(region_name);
    }
}

impl RegionList {
    pub fn add(&mut self, data: RegionData) -> Option<RegionData> {
        self.map.insert(data.region_name.clone(), data)
    }

    pub fn get(&self, name: &str) -> Option<&RegionData> {
        self.map.get(name)
    }

    pub fn into_vec(self) -> Vec<RegionData> {
        self.map.into_values().collect()
    }
}
