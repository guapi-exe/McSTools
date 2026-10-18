//! Shared inclusive export frame: preserve empty margins, never add an air border.
pub const MAX_DENSE_EXPORT_VOLUME: i64 = 64_000_000;

pub(crate) fn conversion_bounds(
    blocks: &crate::utils::block_state_pos_list::BlockStatePosList,
    size: crate::utils::schematic_data::Size,
) -> Result<
    (
        crate::utils::block_state_pos_list::BlockPos,
        crate::utils::block_state_pos_list::BlockPos,
        crate::utils::schematic_data::Size,
    ),
    crate::utils::schematic_data::SchematicError,
> {
    use crate::utils::block_state_pos_list::BlockPos;
    use crate::utils::schematic_data::SchematicError;
    let invalid = || SchematicError::InvalidFormat("conversion dimensions exceed supported bounds");
    let mut min = BlockPos { x: 0, y: 0, z: 0 };
    let mut max = min;
    if let Some(first) = blocks.elements.front() {
        min = first.pos;
        max = first.pos;
        for b in &blocks.elements {
            min.x = min.x.min(b.pos.x);
            min.y = min.y.min(b.pos.y);
            min.z = min.z.min(b.pos.z);
            max.x = max.x.max(b.pos.x);
            max.y = max.y.max(b.pos.y);
            max.z = max.z.max(b.pos.z);
        }
    }
    if size.width <= 0 || size.height <= 0 || size.length <= 0 {
        return Err(invalid());
    }
    if min.x >= 0
        && min.y >= 0
        && min.z >= 0
        && max.x < size.width
        && max.y < size.height
        && max.z < size.length
    {
        min = BlockPos { x: 0, y: 0, z: 0 };
    }
    max.x = max
        .x
        .max(min.x.checked_add(size.width - 1).ok_or_else(invalid)?);
    max.y = max
        .y
        .max(min.y.checked_add(size.height - 1).ok_or_else(invalid)?);
    max.z = max
        .z
        .max(min.z.checked_add(size.length - 1).ok_or_else(invalid)?);
    let dimension = |lo: i32, hi: i32| {
        hi.checked_sub(lo)
            .and_then(|v| v.checked_add(1))
            .ok_or_else(invalid)
    };
    let size = crate::utils::schematic_data::Size {
        width: dimension(min.x, max.x)?,
        height: dimension(min.y, max.y)?,
        length: dimension(min.z, max.z)?,
    };
    let volume = i64::from(size.width)
        .checked_mul(i64::from(size.height))
        .and_then(|v| v.checked_mul(i64::from(size.length)))
        .ok_or_else(invalid)?;
    if volume > MAX_DENSE_EXPORT_VOLUME {
        return Err(SchematicError::InvalidFormat(
            "export volume exceeds 64000000 cells; crop or split the blueprint first",
        ));
    }
    Ok((min, max, size))
}
