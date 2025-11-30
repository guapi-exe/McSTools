use std::collections::{BTreeMap, VecDeque};
use std::io::Read;
use std::sync::Arc;
use rayon::prelude::*;
use tauri::State;
use crate::data_files::files::FileManager;
use crate::database::db_apis::schematics_api::find_schematic;
use crate::database::db_control::DatabaseState;
use crate::utils::block_state_pos_list::{BlockData, BlockId, BlockPos, BlockStatePos, BlockStatePosList};
use crate::utils::schematic_data::{SchematicData, Size};
use anyhow::{anyhow, Result};
use crate::be_schematic::to_be_schematic::ToBESchematic;
use crate::building_gadges::to_bg_schematic::ToBgSchematic;
use crate::create::to_create_schematic::ToCreateSchematic;
use crate::litematica::to_lm_schematic::ToLmSchematic;
use crate::utils::entities::EntitiesList;
use crate::utils::tile_entities::TileEntitiesList;
use crate::word_edit::to_we_schematic::ToWeSchematic;
use fastnbt::Value;
use fastnbt::Value::Compound;
use std::collections::HashMap;

#[derive(Clone, Debug)]
struct Offset {
    x: i32,
    y: i32,
    z: i32,
}

#[tauri::command]
pub async fn schematic_split(
    db: State<'_, DatabaseState>,
    file_manager: State<'_, FileManager>,
    schematic_id: i64,
    split_type: i64,
    split_number: i64,
    air_frame: bool,
) -> Result<Vec<(i64, Size, Vec<u8>)>, String> {
    async move {
        let mut conn = db.0.get()?;
        let schematic = find_schematic(&mut conn, schematic_id)?;
        let version = schematic.version;
        let sub_version = schematic.sub_type;
        let v_type = schematic.schematic_type;
        let data = file_manager.get_schematic_data(schematic_id, version, sub_version, v_type)?;

        let size = &data.size;
        let blocks = &data.blocks;

        let split_parts = split_schematic_parts(
            &blocks.elements,
            &data.tile_entities_list,
            &data.entities_list,
            size,
            split_type,
            split_number as usize,
            air_frame,
        )?;

        let mut results = Vec::new();
        for (index, (blocks, tile_entities, entities, part_size, _offset)) in split_parts.into_iter().enumerate() {
            let schematic = SchematicData::new(blocks, tile_entities, entities, part_size.clone());
            let temp_file = match v_type {
                1 => {
                    let data = ToCreateSchematic::new(&schematic)?.create_schematic(false);
                    file_manager.save_nbt_value_temp(data, v_type, true)?
                }
                2 => {
                    let data = ToLmSchematic::new(&schematic)?.lm_schematic(6);
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


fn split_schematic_parts(
    blocks: &VecDeque<BlockStatePos>,
    tile_entities: &TileEntitiesList,
    entities: &EntitiesList,
    size: &Size,
    split_type: i64,
    split_number: usize,
    air_frame: bool,
) -> Result<Vec<(BlockStatePosList, TileEntitiesList, EntitiesList, Size, Offset)>> {
    if split_number == 0 {
        return Err(anyhow!("Split number must be at least 1"));
    }
    let split_blocks = split_block_positions(blocks, size, split_type, split_number)?;

    let air = Arc::new(BlockData {
        id: BlockId {
            name: Arc::from("minecraft:air"),
        },
        properties: BTreeMap::new(),
    });

    let mut results = Vec::with_capacity(split_number);
    for (i, (mut block_list, part_size, offset)) in split_blocks.into_iter().enumerate() {
        let corner_positions = [
            BlockPos { x: offset.x - 1, y: offset.y, z: offset.z - 1 },
            BlockPos { x: offset.x - 1, y: offset.y, z: offset.z + part_size.length },
            BlockPos { x: offset.x + part_size.width, y: offset.y, z: offset.z - 1 },
            BlockPos { x: offset.x + part_size.width, y: offset.y, z: offset.z + part_size.length },
            BlockPos { x: offset.x - 1, y: offset.y + part_size.height - 1, z: offset.z - 1 },
            BlockPos { x: offset.x - 1, y: offset.y + part_size.height - 1, z: offset.z + part_size.length },
            BlockPos { x: offset.x + part_size.width, y: offset.y + part_size.height - 1, z: offset.z - 1 },
            BlockPos { x: offset.x + part_size.width, y: offset.y + part_size.height - 1, z: offset.z + part_size.length },
        ];
        if air_frame {
            if split_type != 3 {
                for pos in corner_positions {
                    block_list.elements.push_back(BlockStatePos::new(pos, Arc::clone(&air)));
                }
            }
        }
        let mut part_tile_entities = TileEntitiesList {
            original_type: tile_entities.original_type,
            elements: tile_entities
                .elements
                .iter()
                .filter(|te| {
                    let pos = te.pos;
                    pos.x >= offset.x && pos.x < offset.x + part_size.width &&
                        pos.y >= offset.y && pos.y < offset.y + part_size.height &&
                        pos.z >= offset.z && pos.z < offset.z + part_size.length
                })
                .cloned()
                .collect(),
        };

        if tile_entities.original_type == 2 {
            part_tile_entities.elements.iter_mut().for_each(|te| {
                let nx = te.pos.x - offset.x;
                let ny = te.pos.y - offset.y;
                let nz = te.pos.z - offset.z;

                te.pos.x = nx;
                te.pos.y = ny;
                te.pos.z = nz;

                match &te.nbt {
                    Compound(map) => {
                        let mut new_map = map.clone();
                        new_map.insert("x".to_string(), Value::Int(nx));
                        new_map.insert("y".to_string(), Value::Int(ny));
                        new_map.insert("z".to_string(), Value::Int(nz));
                        te.nbt = Compound(new_map);
                    }
                    other => {
                        let mut new_map = HashMap::new();
                        new_map.insert("x".to_string(), Value::Int(nx));
                        new_map.insert("y".to_string(), Value::Int(ny));
                        new_map.insert("z".to_string(), Value::Int(nz));
                        new_map.insert("nbt".to_string(), other.clone());
                        te.nbt = Compound(new_map);
                    }
                }
            });
        }

        if tile_entities.original_type == 3 {
            part_tile_entities.elements.iter_mut().for_each(|te| {
                let nx = te.pos.x - offset.x;
                let ny = te.pos.y - offset.y;
                let nz = te.pos.z - offset.z;

                te.pos.x = nx;
                te.pos.y = ny;
                te.pos.z = nz;

                match &te.nbt {
                    Compound(map) => {
                        let mut new_map = map.clone();
                        let new_pos = vec![
                            nx, ny, nz,
                        ];
                        new_map.insert("Pos".to_string(), Value::IntArray(fastnbt::IntArray::new(new_pos)));
                        te.nbt = Compound(new_map);
                    }
                    other => {
                        let mut new_map = HashMap::new();
                        let new_pos = vec![
                            nx, ny, nz,
                        ];
                        new_map.insert("Pos".to_string(), Value::IntArray(fastnbt::IntArray::new(new_pos)));
                        new_map.insert("nbt".to_string(), other.clone());
                        te.nbt = Compound(new_map);
                    }
                }
            });
        }

        let part_entities = if i == 0 {
            entities.clone()
        } else {
            EntitiesList::default()
        };

        results.push((block_list, part_tile_entities, part_entities, part_size, offset));
    }

    Ok(results)
}



fn split_block_positions(
    blocks: &VecDeque<BlockStatePos>,
    size: &Size,
    split_type: i64,
    split_number: usize,
) -> Result<Vec<(BlockStatePosList, Size, Offset)>> {
    if split_number == 0 {
        return Err(anyhow!("Split number must be at least 1"));
    }
    let min = {
        let global_min = blocks
            .par_iter()
            .with_min_len(1_000_000)
            .fold(
                || BlockPos {
                    x: i32::MAX,
                    y: i32::MAX,
                    z: i32::MAX,
                },
                |mut acc, bp| {
                    acc.x = std::cmp::min(acc.x, bp.pos.x);
                    acc.y = std::cmp::min(acc.y, bp.pos.y);
                    acc.z = std::cmp::min(acc.z, bp.pos.z);
                    acc
                },
            )
            .reduce(
                || BlockPos {
                    x: i32::MAX,
                    y: i32::MAX,
                    z: i32::MAX,
                },
                |mut rel, tem| {
                    rel.x = std::cmp::min(rel.x, tem.x);
                    rel.y = std::cmp::min(rel.y, tem.y);
                    rel.z = std::cmp::min(rel.z, tem.z);
                    rel
                },
            );

        BlockPos {
            x: global_min.x,
            y: global_min.y,
            z: global_min.z,
        }
    };

    match split_type {
        1 | 2 => {
            let (dim_size, axis_idx) = match split_type {
                1 => (size.width, 0),
                2 => (size.height, 1),
                _ => unreachable!(),
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

            let mut offsets = Vec::with_capacity(split_number);
            let mut part_sizes = Vec::with_capacity(split_number);

            let mut cumulative = 0;
            for i in 0..split_number {
                let part_length = if i == split_number - 1 {
                    step + remainder
                } else {
                    step
                };
                let offset = match split_type {
                    1 => Offset { x: cumulative, y: 0, z: 0 },
                    2 => Offset { x: 0, y: cumulative, z: 0 },
                    _ => unreachable!(),
                };
                let size = match split_type {
                    1 => Size { width: part_length, height: size.height, length: size.length },
                    2 => Size { width: size.width, height: part_length, length: size.length },
                    _ => unreachable!(),
                };
                part_sizes.push(size);
                offsets.push(offset);
                cumulative += part_length;
            }

            let result = blocks.par_iter().fold(
                || vec![VecDeque::new(); split_number],
                |mut local_groups, block| {
                    let pos = match axis_idx {
                        0 => block.pos.x - min.x,
                        1 => block.pos.y - min.y,
                        _ => unreachable!(),
                    };

                    let mut cumulative = 0;
                    let mut group_idx = split_number - 1;
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

            Ok(result.into_iter()
                .enumerate()
                .map(|(i, elements)| (
                    BlockStatePosList { elements },
                    part_sizes[i].clone(),
                    offsets[i].clone(),
                ))
                .collect())
        }

        3 => {
            let sqrt = (split_number as f64).sqrt() as usize;
            if sqrt * sqrt != split_number {
                return Err(anyhow!("For grid split, split_number must be a perfect square (e.g. 4, 9, 16)"));
            }

            let x_parts = sqrt;
            let z_parts = sqrt;

            if size.width < x_parts as i32 || size.length < z_parts as i32 {
                return Err(anyhow!(
                    "Grid split count ({x_parts}x{z_parts}) is too large for size ({}x{})",
                    size.width,
                    size.length
                ));
            }

            let x_step = size.width / x_parts as i32;
            let x_rem = size.width % x_parts as i32;

            let z_step = size.length / z_parts as i32;
            let z_rem = size.length % z_parts as i32;

            let mut part_sizes = Vec::with_capacity(split_number);
            let mut offsets = Vec::with_capacity(split_number);

            let mut x_cum = 0;
            for xi in 0..x_parts {
                let w = if xi == x_parts - 1 { x_step + x_rem } else { x_step };
                let mut z_cum = 0;
                for zi in 0..z_parts {
                    let l = if zi == z_parts - 1 { z_step + z_rem } else { z_step };
                    part_sizes.push(Size { width: w, height: size.height, length: l });
                    offsets.push(Offset { x: x_cum, y: 0, z: z_cum });
                    z_cum += l;
                }
                x_cum += w;
            }

            let result = blocks.par_iter().fold(
                || vec![VecDeque::new(); split_number],
                |mut local_groups, block| {
                    let norm_x = block.pos.x - min.x;
                    let norm_z = block.pos.z - min.z;

                    let mut x_cum = 0;
                    let mut xi = x_parts - 1;
                    for i in 0..x_parts {
                        x_cum += if i == x_parts - 1 { x_step + x_rem } else { x_step };
                        if norm_x < x_cum {
                            xi = i;
                            break;
                        }
                    }

                    let mut z_cum = 0;
                    let mut zi = z_parts - 1;
                    for j in 0..z_parts {
                        z_cum += if j == z_parts - 1 { z_step + z_rem } else { z_step };
                        if norm_z < z_cum {
                            zi = j;
                            break;
                        }
                    }

                    let group_idx = xi * z_parts + zi;
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

            Ok(result.into_iter()
                .enumerate()
                .map(|(i, elements)| (
                    BlockStatePosList { elements },
                    part_sizes[i].clone(),
                    offsets[i].clone(),
                ))
                .collect())
        }

        _ => Err(anyhow!("Invalid split type: {}", split_type)),
    }
}

