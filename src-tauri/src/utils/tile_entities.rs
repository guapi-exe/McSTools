use crate::utils::block_state_pos_list::BlockPos;
use fastnbt::Value;
use fastnbt::Value::Compound;
use serde::{Deserialize, Serialize};
use crate::utils::extend_value::NbtExt;
use crate::utils::schematic_data::SchematicError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TileEntities {
    pub pos: BlockPos,
    pub nbt: Value,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct TileEntitiesList {
    pub original_type: i32,
    pub elements: Vec<TileEntities>,
}

impl TileEntitiesList {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn from_nbt_lm(list: &[Value], original_type:i32) -> Result<Self, SchematicError> {
        let mut entities = Vec::new();

        for entry in list {
            let Compound(root) = entry else {
                return Err(SchematicError::InvalidFormat("TileEntity is not a Compound"));
            };

            let x = root.get_i32("x")?;
            let y = root.get_i32("y")?;
            let z = root.get_i32("z")?;

            entities.push(TileEntities {
                pos: BlockPos { x, y, z },
                nbt: entry.clone(),
            });
        }

        Ok(Self {
            original_type,
            elements: entities,
        })
    }
}
