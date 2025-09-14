use std::collections::VecDeque;
use std::io::Read;
use rayon::prelude::*;
use tauri::State;
use crate::data_files::files::FileManager;
use crate::database::db_apis::schematics_api::find_schematic;
use crate::database::db_control::DatabaseState;
use crate::utils::block_state_pos_list::{BlockStatePos, BlockStatePosList};
use crate::utils::schematic_data::{SchematicData, Size};
use anyhow::{anyhow, Result};
use crate::be_schematic::to_be_schematic::ToBESchematic;
use crate::building_gadges::to_bg_schematic::ToBgSchematic;
use crate::create::to_create_schematic::ToCreateSchematic;
use crate::litematica::to_lm_schematic::ToLmSchematic;
use crate::utils::tile_entities::TileEntitiesList;
use crate::word_edit::to_we_schematic::ToWeSchematic;

#[tauri::command]
pub async fn schematic_split(
    db: State<'_, DatabaseState>,
    file_manager: State<'_, FileManager>,
    schematic_id: i64,
    split_type: i64,
    split_number: i64
) -> Result<Vec<(i64, Size, Vec<u8>)>, String> {
    async move {
        let mut conn = db.0.get()?;
        let mut schematic = find_schematic(&mut conn, schematic_id)?;
        let version = schematic.version;
        let sub_version = schematic.sub_type;
        let v_type = schematic.schematic_type;
        let mut data = file_manager.get_schematic_data(schematic_id, version, sub_version, v_type)?;

        let size = &data.size;
        let blocks = &data.blocks;

        let split_parts = split_block_positions(
            &blocks.elements,
            size,
            split_type,
            split_number as usize
        )?;
        let mut results = Vec::new();
        for (index, (blocks, part_size)) in split_parts.into_iter().enumerate() {

            let schematic = SchematicData::new(blocks, TileEntitiesList::new(), part_size.clone());
            let temp_file = match v_type {
                1 => {
                    let data = ToCreateSchematic::new(&schematic)?.create_schematic(false);
                    file_manager.save_nbt_value_temp(data, v_type, true)?
                }
                2 => {
                    let data = ToLmSchematic::new(&schematic)?.lm_schematic(sub_version);
                    file_manager.save_nbt_value_temp(data, v_type, true)?
                }
                3 => {
                    let data = ToWeSchematic::new(&schematic)?.we_schematic(sub_version)?;
                    file_manager.save_nbt_value_temp(data, v_type, true)?
                }
                4 => {
                    let data = ToBgSchematic::new(&schematic)?.bg_schematic(sub_version)?;
                    file_manager.save_json_value_temp(data)?
                }
                5 => {
                    let data = ToBESchematic::new(&schematic)?.to_be_value();
                    file_manager.save_nbt_value_le_temp(data, v_type)?
                }
                _ => {
                    anyhow::bail!("unknown schematic type: {}", v_type);
                }
            };


            let mut file = temp_file.into_file();
            let mut bytes = Vec::new();
            file.read_to_end(&mut bytes)?;

            results.push((index as i64, part_size, bytes));
        }

        Ok(results)
    }
        .await
        .map_err(|e: anyhow::Error| e.to_string())
}

fn split_block_positions(
    blocks: &VecDeque<BlockStatePos>,
    size: &Size,
    split_type: i64,
    split_number: usize,
) -> Result<Vec<(BlockStatePosList, Size)>> {
    if split_number == 0 {
        return Err(anyhow!("Split number must be at least 1"));
    }

    let (dim_size, axis_idx) = match split_type {
        1 => (size.width, 0),
        2 => (size.height, 1),
        _ => return Err(anyhow!("Invalid split type: {}", split_type)),
    };

    if dim_size < split_number as i32 {
        return Err(anyhow!(
            "Dimension size {} is smaller than split count {}",
            dim_size,
            split_number
        ));
    }

    let step = dim_size / split_number as i32;
    let remainder = dim_size % split_number as i32;

    let part_sizes: Vec<Size> = (0..split_number)
        .map(|i| {
            let part_length = if i == split_number - 1 {
                step + remainder
            } else {
                step
            };
            match split_type {
                1 => Size { width: part_length, height: size.height, length: size.length },
                2 => Size { width: size.width, height: part_length, length: size.length },
                _ => unreachable!(),
            }
        })
        .collect();

    let result = blocks.par_iter().fold(
        || vec![VecDeque::new(); split_number], // 每个线程初始分组
        |mut local_groups, block| {
            let pos = match axis_idx {
                0 => block.pos.x,
                1 => block.pos.y,
                _ => unreachable!(),
            };
            let mut cumulative = 0;
            let mut group_idx = split_number - 1; // 默认为最后一组
            for i in 0..split_number {
                cumulative += if i == split_number - 1 {
                    step + remainder
                } else {
                    step
                };
                if pos < cumulative {
                    group_idx = i;
                    break;
                }
            }
            local_groups[group_idx].push_back(block.clone());
            local_groups
        },
    ).reduce(
        || vec![VecDeque::new(); split_number],
        |mut global_groups, local_groups| {
            for (i, mut group) in local_groups.into_iter().enumerate() {
                global_groups[i].append(&mut group);
            }
            global_groups
        },
    );

    let parts_with_size = result.into_iter()
        .enumerate()
        .map(|(i, elements)| (
            BlockStatePosList { elements },
            part_sizes[i].clone()
        ))
        .collect();

    Ok(parts_with_size)
}