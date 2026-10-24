use crate::utils::block_state_pos_list::{BlockData, BlockId, BlockPos, BlockStatePosList};
use crate::utils::extend_value::NbtExt;
use crate::utils::parse_limits::ParseLimits;
use crate::utils::schematic_data::SchematicError;
use fastnbt::Value;
use fastnbt::Value::Compound;
use std::collections::{BTreeMap, HashMap};
use std::sync::Arc;

pub const B1_BYTE_MASK: i64 = 0xFF;
pub const B2_BYTE_MASK: i64 = 0xFFFF;
pub const B3_BYTE_MASK: i64 = 0xFFFFFF;

pub fn deserialize(nbt: HashMap<String, Value>) -> Result<BlockStatePosList, SchematicError> {
    deserialize_with_limits(nbt, &ParseLimits::default())
}

pub fn deserialize_with_limits(
    nbt: HashMap<String, Value>,
    limits: &ParseLimits,
) -> Result<BlockStatePosList, SchematicError> {
    let mut block_list = BlockStatePosList::default();
    let pos_list = nbt.get_list("pos")?;
    let state_list = nbt.get_list("data")?;
    limits.validate_len_at_most(
        "Building Gadgets source positions",
        pos_list.len(),
        limits.max_volume,
    )?;
    limits.validate_palette_len(state_list.len())?;
    let mut palette: Vec<Option<Arc<BlockData>>> = vec![None; state_list.len()];

    for data in pos_list {
        let Value::Long(long_nbt) = data else {
            return Err(SchematicError::InvalidFormat("pos is not a Long"));
        };

        let pos = pos_from_long(*long_nbt)?;
        let state_id = read_state_id(*long_nbt);
        if let Some(Some(block)) = palette.get(state_id as usize) {
            limits.push_block(&mut block_list, pos.x, pos.y, pos.z, block)?;
            continue;
        }

        let state_value = state_list
            .get(state_id as usize)
            .ok_or_else(|| SchematicError::InvalidFormat("state not found"))?;

        let Compound(state) = state_value else {
            return Err(SchematicError::InvalidFormat("state is not a Compound"));
        };

        let block_state = state.get_compound("state")?;
        let name = block_state
            .get("Name")
            .and_then(Value::as_str)
            .map(|s| Arc::from(s))
            .unwrap_or_else(|| Arc::from("minecraft:air"));

        let mut properties = BTreeMap::new();
        if let Some(Compound(prop_map)) = block_state.get("Properties") {
            for (k, v) in prop_map {
                if let Value::String(s) = v {
                    properties.insert(Arc::from(k.as_str()), Arc::from(s.as_str()));
                }
            }
        }

        let block = Arc::new(BlockData {
            id: BlockId { name },
            properties,
        });
        limits.push_block(&mut block_list, pos.x, pos.y, pos.z, &block)?;
        palette[state_id as usize] = Some(block);
    }

    Ok(block_list)
}
pub fn pos_from_long(serialized: i64) -> Result<BlockPos, SchematicError> {
    fn sign_extend16(value: i64) -> i32 {
        ((value << 48) >> 48) as i32
    }

    let x = sign_extend16((serialized >> 24) & 0xFFFF);
    let y = ((serialized >> 16) & 0xFF) as i32;
    let z = sign_extend16(serialized & 0xFFFF);

    Ok(BlockPos { x, y, z })
}

pub fn read_state_id(serialized: i64) -> i32 {
    ((serialized >> 40) & B3_BYTE_MASK) as i32
}

pub fn int_to_rel_pos(start_pos: BlockPos, p: i32) -> BlockPos {
    let dx = ((p >> 16) & 0xFF) as i8 as i32;
    let dy = ((p >> 8) & 0xFF) as i8 as i32;
    let dz = (p & 0xFF) as i8 as i32;

    BlockPos {
        x: start_pos.x.wrapping_add(dx),
        y: start_pos.y.wrapping_add(dy),
        z: start_pos.z.wrapping_add(dz),
    }
}
pub fn rel_pos_to_int(start_pos: BlockPos, rel_pos: BlockPos) -> i32 {
    let dx = (rel_pos.x - start_pos.x) & 0xFF;
    let dy = (rel_pos.y - start_pos.y) & 0xFF;
    let dz = (rel_pos.z - start_pos.z) & 0xFF;

    (dx << 16) | (dy << 8) | dz
}
