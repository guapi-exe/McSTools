use crate::utils::block_state_pos_list::{BlockData, BlockStatePosList};
use crate::utils::schematic_data::SchematicError;
use dashmap::DashMap;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Target {
    pub has: bool,
    pub size: String,
    pub version: i32,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConvertData {
    pub schematic_type: SchematicType,
    pub schematic_type_id: i32,
    pub sub_type: i32,
    pub version: i32,
    pub size: String,
    pub schematics: HashMap<SchematicType, HashMap<i32, Target>>,
}

#[derive(Debug, Clone, Hash, Eq, PartialEq, Serialize, Deserialize)]
pub enum SchematicType {
    Create,
    Litematic,
    Bg,
    We,
    Be,
}

impl SchematicType {
    pub fn from_code(code: i32) -> Option<Self> {
        match code {
            1 => Some(Self::Create),
            2 => Some(Self::Litematic),
            3 => Some(Self::We),
            4 => Some(Self::Bg),
            5 => Some(Self::Be),
            _ => None,
        }
    }

    pub fn get_sub_versions(&self) -> Vec<i32> {
        match self {
            SchematicType::Bg => vec![-1, 0, 1, 2],
            SchematicType::We => vec![-1, 0, 1],
            _ => vec![-1],
        }
    }

    pub fn file_extension(&self) -> &'static str {
        match self {
            SchematicType::Create => "nbt",
            SchematicType::Litematic => "litematic",
            SchematicType::We => "schem",
            SchematicType::Bg => "json",
            SchematicType::Be => "mcstructure",
        }
    }
    pub fn type_id(&self) -> &'static i32 {
        match self {
            SchematicType::Create => &1,
            SchematicType::Litematic => &2,
            SchematicType::We => &3,
            SchematicType::Bg => &4,
            SchematicType::Be => &5,
        }
    }
}

pub fn get_unique_block(blocks: &BlockStatePosList) -> Result<Vec<Arc<BlockData>>, SchematicError> {
    let seen: DashMap<Arc<BlockData>, usize> = DashMap::new();
    let unique = Mutex::new(Vec::new());

    blocks.elements.par_iter().for_each(|block_pos| {
        let block_data = block_pos.block.clone();
        let entry = seen.entry(block_data.clone());
        match entry {
            dashmap::mapref::entry::Entry::Occupied(_) => {}
            dashmap::mapref::entry::Entry::Vacant(vacant) => {
                let mut unique_lock = unique.lock().unwrap();
                let index = unique_lock.len();
                vacant.insert(index);
                unique_lock.push(block_data);
            }
        }
    });

    Ok(unique.into_inner().unwrap())
}

pub fn get_unique_block_str(blocks: &BlockStatePosList) -> Result<String, SchematicError> {
    let unique = get_unique_block(blocks)?;
    let str = serde_json::to_string(&unique).map_err(SchematicError::Json)?;
    Ok(str)
}
