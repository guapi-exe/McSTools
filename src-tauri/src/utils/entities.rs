use fastnbt::Value;
use fastnbt::Value::Compound;
use serde::{Deserialize, Serialize};
use crate::utils::block_state_pos_list::BlockPos;
use crate::utils::schematic_data::SchematicError;
use crate::utils::tile_entities::TileEntities;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Entities {
    pub(crate) nbt: Value,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct EntitiesList {
    pub(crate) original_type: i32,
    pub(crate) elements: Vec<Entities>,
}

impl EntitiesList {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn from_nbt(list: &[Value], original_type:i32) -> Result<Self, SchematicError> {
        let mut entities = Vec::new();

        for entry in list {
            entities.push(Entities {
                nbt: entry.clone(),
            });
        }

        Ok(Self {
            original_type,
            elements: entities,
        })
    }
}
