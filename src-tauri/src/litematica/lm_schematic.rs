use crate::litematica::lm_schematic_data::{LmMetadata, RegionData, RegionList, RegionNameList};
use crate::utils::block_state_pos_list::{BlockData, BlockId, BlockPos, BlockStatePosList};
use crate::utils::extend_value::NbtExt;
use crate::utils::schematic_data::{SchematicData, SchematicError, Size};
use crate::utils::tile_entities::TileEntitiesList;
use fastnbt::Value;
use fastnbt::Value::Compound;
use flate2::read::GzDecoder;
use rayon::prelude::*;
use std::collections::{BTreeMap, HashMap};
use std::fs::File;
use std::io::{BufReader, Cursor};
use std::sync::Arc;

#[derive(Debug)]
pub struct LmSchematic {
    nbt: Value,
}

impl LmSchematic {
    pub fn new(file_path: &str) -> Result<Self, SchematicError> {
        let file = File::open(file_path)?;
        let reader = BufReader::new(file);
        let decoder = GzDecoder::new(reader);
        let nbt: Value = fastnbt::from_reader(decoder)?;

        if let Compound(_) = &nbt {
            Ok(Self { nbt })
        } else {
            Err(SchematicError::InvalidFormat("Root is not a Compound"))
        }
    }

    pub fn new_from_bytes(data: Vec<u8>) -> Result<Self, SchematicError> {
        let cursor = Cursor::new(data);
        let mut decoder = GzDecoder::new(cursor);

        let nbt: Value = fastnbt::from_reader(&mut decoder)?;

        if let Compound(_) = &nbt {
            Ok(Self { nbt })
        } else {
            Err(SchematicError::InvalidFormat("Root is not a Compound"))
        }
    }

    pub fn get_data_version(&self) -> Result<i32, SchematicError> {
        let Compound(root) = &self.nbt else {
            return Err(SchematicError::InvalidFormat("Root is not a Compound"));
        };
        let data_version = root.get_i32("MinecraftDataVersion")?;
        Ok(data_version)
    }

    pub fn get_lm_version(&self) -> Result<i32, SchematicError> {
        let Compound(root) = &self.nbt else {
            return Err(SchematicError::InvalidFormat("Root is not a Compound"));
        };
        let lm_version = root.get_i32("Version")?;
        Ok(lm_version)
    }

    pub fn get_metadata(&self) -> Result<&HashMap<String, Value>, SchematicError> {
        if let Compound(root) = &self.nbt {
            root.get("Metadata")
                .and_then(|v| match v {
                    Compound(list) => Some(list),
                    _ => None,
                })
                .ok_or(SchematicError::InvalidFormat(
                    "NotFound Size is not a IntArray",
                ))
        } else {
            Err(SchematicError::InvalidFormat("Root is not a Compound"))
        }
    }

    pub fn get_regions(&self) -> Result<&HashMap<String, Value>, SchematicError> {
        if let Compound(root) = &self.nbt {
            root.get("Regions")
                .and_then(|v| match v {
                    Compound(list) => Some(list),
                    _ => None,
                })
                .ok_or(SchematicError::InvalidFormat(
                    "NotFound Size is not a IntArray",
                ))
        } else {
            Err(SchematicError::InvalidFormat("Root is not a Compound"))
        }
    }

    pub fn read_metadata(&self) -> Result<LmMetadata, SchematicError> {
        let metadata = self.get_metadata()?;

        let time_created = metadata.get_i64("TimeCreated")?;
        let time_modified = metadata.get_i64("TimeModified")?;
        let description = metadata.get_str("Description")?;
        let region_count = metadata.get_i32("RegionCount")?;
        let total_blocks = metadata.get_i32("TotalBlocks")?;
        let author = metadata.get_str("Author")?;
        let total_volume = metadata.get_i32("TotalVolume")?;
        let name = metadata.get_str("Name")?;
        let enclosing_size = metadata.get_pos("EnclosingSize")?;

        Ok(LmMetadata {
            time_created,
            time_modified,
            description: description.to_string(),
            region_count,
            total_blocks,
            author: author.to_string(),
            total_volume,
            enclosing_size,
            name: name.to_string(),
        })
    }

    pub fn process_regions(&self) -> Result<(RegionList, RegionNameList), SchematicError> {
        let regions = self.get_regions()?;
        let mut regions_list = RegionList::default();
        let mut regions_name_list = RegionNameList::default();

        for (name, region_value) in regions {
            let region = match region_value {
                Compound(r) => r,
                _ => return Err(SchematicError::InvalidFormat("null")),
            };
            let block_states = region.get_long_array("BlockStates")?;
            let position = region.get_pos("Position")?;
            let size = region.get_pos("Size")?;
            let block_state_palette = region.get_list("BlockStatePalette")?;
            let tile_entities = region.get_list("TileEntities")?;
            let entities = region.get_list("TileEntities")?;
            let palette_size = block_state_palette.len();
            let adjusted = if palette_size == 0 {
                u32::MAX
            } else {
                palette_size.saturating_sub(1) as u32
            };
            let leading_zeros = adjusted.leading_zeros();
            let bits_unclamped = 32u32.saturating_sub(leading_zeros);
            let bits = (bits_unclamped as f64).max(2.0) as i32;
            regions_list.add(RegionData {
                region_name: name.to_string(),
                block_states: block_states.clone().into_inner(),
                position,
                size,
                block_state_palette: block_state_palette.to_vec(),
                tile_entities: tile_entities.to_vec(),
                entities: entities.to_vec(),
                bits,
            });
            regions_name_list.add(name.to_string());
        }
        Ok((regions_list, regions_name_list))
    }

    pub fn parse_palette(
        &self,
        palette_list: &[Value],
    ) -> Result<Vec<Arc<BlockData>>, SchematicError> {
        let mut palette = Vec::with_capacity(palette_list.len());
        for entry in palette_list {
            let Compound(root) = entry else {
                return Err(SchematicError::InvalidFormat("Root is not a Compound"));
            };
            let name = root
                .get("Name")
                .and_then(Value::as_str)
                .map(|s| Arc::<str>::from(s))
                .unwrap_or_else(|| Arc::from("minecraft:air"));
            let mut properties = BTreeMap::new();
            if let Some(Compound(prop_map)) = root.get("Properties") {
                for (k, v) in prop_map {
                    if let Value::String(s) = v {
                        properties
                            .insert(Arc::<str>::from(k.as_str()), Arc::<str>::from(s.as_str()));
                    }
                }
            }

            palette.push(Arc::new(BlockData {
                id: BlockId { name },
                properties,
            }));
        }

        Ok(palette)
    }

    pub fn get_at(&self, index: i64, bits: i32, long_array: &[i64]) -> i32 {
        let start_offset: i64 = index.wrapping_mul(bits as i64);
        let start_arr_index = (start_offset as u64 >> 6) as usize;
        let end_arr_index = (((index + 1).wrapping_mul(bits as i64) - 1) as u64 >> 6) as usize;

        let start_bit_offset = (start_offset as u64 & 0x3F) as i32;
        let max_entry_value = u64::MAX >> (64 - bits as u32);

        if start_arr_index == end_arr_index {
            let value = long_array[start_arr_index] as u64;
            ((value >> start_bit_offset) & max_entry_value) as i32
        } else {
            let end_bit_offset = 64 - start_bit_offset;
            let first_part = long_array[start_arr_index] as u64;
            let second_part = long_array[end_arr_index] as u64;
            let combined = (first_part >> start_bit_offset) | (second_part << end_bit_offset);
            (combined & max_entry_value) as i32
        }
    }

    pub fn get_index(&self, x: i32, y: i32, z: i32, size: BlockPos) -> i32 {
        let x_size: i32 = size.x.abs();
        let z_size: i32 = size.z.abs();
        y * (x_size * z_size) + z * x_size + x
    }

    pub fn get_block_state(
        &self,
        x: i32,
        y: i32,
        z: i32,
        size: BlockPos,
        bits: i32,
        long_array: &[i64],
    ) -> i32 {
        let index = self.get_index(x, y, z, size) as i64;
        self.get_at(index, bits, long_array)
    }

    pub fn get_blocks_pos(&self) -> Result<SchematicData, SchematicError> {
        let (regions_list, regions_name_list) = self.process_regions()?;
        let tile_entities = TileEntitiesList::default();
        let metadata = self.read_metadata()?;
        let size = metadata.enclosing_size;
        let region_blocks: Vec<BlockStatePosList> = regions_name_list
            .names
            .par_iter()
            .map(|name| {
                let region = regions_list
                    .get(name)
                    .ok_or_else(|| SchematicError::MissingField(name.clone()))?;

                let palette = self.parse_palette(&region.block_state_palette)?;
                let block_states = region.block_states.clone();
                let bits = region.bits;
                let size = region.size;
                let position = region.position;

                let width = size.x.unsigned_abs() as usize;
                let height = size.y.unsigned_abs() as usize;
                let length = size.z.unsigned_abs() as usize;
                let y_blocks: Vec<BlockStatePosList> = (0..height)
                    .into_par_iter()
                    .map(|y| {
                        let mut local_blocks = BlockStatePosList::default();

                        for z in 0..length {
                            for x in 0..width {
                                let state_id = self.get_block_state(
                                    x as i32,
                                    y as i32,
                                    z as i32,
                                    size,
                                    bits,
                                    &block_states,
                                ) as usize;
                                let block_data = &palette[state_id];
                                local_blocks.add_by_pos(
                                    x as i32 + position.x,
                                    y as i32 + position.y,
                                    z as i32 + position.z,
                                    block_data.clone(),
                                );
                            }
                        }
                        local_blocks
                    })
                    .collect();

                Ok(y_blocks
                    .into_iter()
                    .fold(BlockStatePosList::default(), |mut acc, blocks| {
                        acc.merge(blocks);
                        acc
                    }))
            })
            .collect::<Result<Vec<_>, SchematicError>>()?;

        let final_block_list =
            region_blocks
                .into_iter()
                .fold(BlockStatePosList::default(), |mut acc, blocks| {
                    acc.merge(blocks);
                    acc
                });

        Ok(SchematicData::new(
            final_block_list,
            tile_entities,
            Size {
                width: size.x,
                height: size.y,
                length: size.z,
            },
        ))
    }
}
