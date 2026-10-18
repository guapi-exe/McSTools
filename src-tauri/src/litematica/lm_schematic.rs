use crate::litematica::lm_schematic_data::{LmMetadata, RegionData, RegionList, RegionNameList};
use crate::utils::block_state_pos_list::{BlockData, BlockId, BlockPos, BlockStatePosList};
use crate::utils::entities::EntitiesList;
use crate::utils::extend_value::NbtExt;
use crate::utils::nbt_scan::read_gzip_java_nbt;
use crate::utils::parse_limits::{ParseLimits, read_source_file};
use crate::utils::schematic_data::{SchematicData, SchematicError, Size};
use crate::utils::tile_entities::{TileEntities, TileEntitiesList};
use fastnbt::Value;
use fastnbt::Value::Compound;
use std::collections::{BTreeMap, HashMap};
use std::sync::Arc;

#[derive(Debug)]
pub struct LmSchematic {
    pub nbt: Value,
}

impl LmSchematic {
    pub fn new(file_path: &str) -> Result<Self, SchematicError> {
        Self::new_from_bytes(read_source_file(file_path)?)
    }

    pub fn new_from_bytes(data: impl AsRef<[u8]>) -> Result<Self, SchematicError> {
        Self::new_from_bytes_with_limits(data.as_ref(), &ParseLimits::default())
    }

    pub fn new_from_bytes_with_limits(
        data: &[u8],
        limits: &ParseLimits,
    ) -> Result<Self, SchematicError> {
        let nbt = read_gzip_java_nbt(data, limits)?;
        Ok(Self { nbt })
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

    pub fn process_regions(
        &self,
    ) -> Result<
        (
            RegionList,
            RegionNameList,
            HashMap<String, TileEntitiesList>,
            HashMap<String, EntitiesList>,
        ),
        SchematicError,
    > {
        let regions = self.get_regions()?;
        // Litematica v1 stored block entities and entities in wrapper tags
        // (`TileNBT` / `EntityData`). Versions 2+ store the payload directly.
        let legacy_entity_wrappers = self.get_lm_version().unwrap_or(2) <= 1;
        let mut regions_list = RegionList::default();
        let mut regions_name_list = RegionNameList::default();
        let mut region_tile_entities: HashMap<String, TileEntitiesList> = HashMap::new();
        let mut region_entities: HashMap<String, EntitiesList> = HashMap::new();

        for (name, region_value) in regions {
            let region = match region_value {
                Compound(r) => r,
                _ => return Err(SchematicError::InvalidFormat("Region is not a Compound")),
            };

            let block_states = region.get_long_array("BlockStates")?;
            let position = region.get_pos("Position")?;
            let size = region.get_pos("Size")?;
            let block_state_palette = region.get_list("BlockStatePalette")?;

            let region_min = region_min_corner(position, size)?;
            let width = size.x.unsigned_abs() as usize;
            let height = size.y.unsigned_abs() as usize;
            let length = size.z.unsigned_abs() as usize;
            if width == 0 || height == 0 || length == 0 {
                return Err(SchematicError::InvalidFormat(
                    "Litematica region dimensions must be positive",
                ));
            }
            let volume = width
                .checked_mul(height)
                .and_then(|value| value.checked_mul(length))
                .ok_or(SchematicError::InvalidFormat(
                    "Litematica region volume overflow",
                ))?;
            let palette_size = block_state_palette.len();
            if palette_size == 0 {
                return Err(SchematicError::InvalidFormat(
                    "Litematica region palette cannot be empty",
                ));
            }
            let bits =
                (usize::BITS - (palette_size.saturating_sub(1)).leading_zeros()).max(2) as usize;
            let required_longs = volume
                .checked_mul(bits)
                .map(|value| value.div_ceil(64))
                .ok_or(SchematicError::InvalidFormat(
                    "Litematica region block state volume overflow",
                ))?;
            if block_states.len() < required_longs {
                return Err(SchematicError::InvalidFormat(
                    "Litematica BlockStates array is shorter than the region volume",
                ));
            }

            let tile_entities_raw: Vec<Value> = region
                .get("TileEntities")
                .and_then(|v| match v {
                    Value::List(list) => Some(list.clone()),
                    _ => None,
                })
                .unwrap_or_else(|| vec![]);

            let tile_entities = offset_region_tile_entities(
                &tile_entities_raw,
                region_min,
                size,
                legacy_entity_wrappers,
            )?;

            let entities_raw: Vec<Value> = region
                .get("Entities")
                .and_then(|v| match v {
                    Value::List(list) => Some(list.clone()),
                    _ => None,
                })
                .unwrap_or_else(|| vec![]);

            let entities = offset_region_entities(&entities_raw, position, legacy_entity_wrappers)?;

            regions_list.add(RegionData {
                region_name: name.to_string(),
                block_states: block_states.clone().into_inner(),
                position,
                size,
                block_state_palette: block_state_palette.to_vec(),
                tile_entities: tile_entities
                    .elements
                    .iter()
                    .map(|entity| entity.nbt.clone())
                    .collect(),
                entities: entities
                    .elements
                    .iter()
                    .map(|entity| entity.nbt.clone())
                    .collect(),
                bits: bits as i32,
            });

            regions_name_list.add(name.to_string());
            region_tile_entities.insert(name.to_string(), tile_entities);
            region_entities.insert(name.to_string(), entities);
        }

        Ok((
            regions_list,
            regions_name_list,
            region_tile_entities,
            region_entities,
        ))
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
        self.get_blocks_pos_with_limits(&ParseLimits {
            retain_air_blocks: true,
            ..ParseLimits::default()
        })
    }

    pub fn get_blocks_pos_with_limits(
        &self,
        limits: &ParseLimits,
    ) -> Result<SchematicData, SchematicError> {
        let size = self.read_metadata()?.enclosing_size;
        limits.validate_dimensions(size.x, size.y, size.z)?;
        let regions = self.get_regions()?;
        validate_enclosing_bounds(regions, size)?;
        let legacy_wrappers = self.get_lm_version().unwrap_or(2) <= 1;
        let mut blocks = BlockStatePosList::default();
        let mut tiles = TileEntitiesList::default();
        tiles.original_type = 2;
        let mut entities = EntitiesList::default();
        entities.original_type = 2;
        let mut source_cells = 0usize;

        // Borrow each region directly. No duplicated packed array, parallel Y
        // lists or second merge buffer. Each retained state shares its palette.
        for value in regions.values() {
            let Compound(region) = value else {
                return Err(SchematicError::InvalidFormat("Region is not a Compound"));
            };
            let position = region.get_pos("Position")?;
            let region_size = region.get_pos("Size")?;
            let volume =
                limits.validate_signed_dimensions(region_size.x, region_size.y, region_size.z)?;
            source_cells = source_cells.checked_add(volume).ok_or_else(|| {
                SchematicError::LimitExceeded("Litematica aggregate source volume overflow".into())
            })?;
            limits.check(
                "Litematica aggregate source volume",
                source_cells,
                limits.max_volume,
            )?;
            let palette_raw = region.get_list("BlockStatePalette")?;
            limits.check(
                "palette entries",
                palette_raw.len(),
                limits.max_palette_entries,
            )?;
            if palette_raw.is_empty() {
                return Err(SchematicError::InvalidFormat(
                    "Litematica region palette cannot be empty",
                ));
            }
            let palette = self.parse_palette(palette_raw)?;
            let packed = region.get_long_array("BlockStates")?;
            let bits = (usize::BITS - (palette.len() - 1).leading_zeros()).max(2) as usize;
            let required = volume
                .checked_mul(bits)
                .ok_or_else(|| {
                    SchematicError::LimitExceeded("packed state length overflow".into())
                })?
                .div_ceil(64);
            if packed.len() < required {
                return Err(SchematicError::InvalidFormat(
                    "Litematica BlockStates array is shorter than the region volume",
                ));
            }
            let min = region_min_corner(position, region_size)?;
            let width = region_size.x.unsigned_abs() as usize;
            let plane = width * region_size.z.unsigned_abs() as usize;
            for index in 0..volume {
                let state = self.get_at(index as i64, bits as i32, packed) as usize;
                let block = palette.get(state).ok_or(SchematicError::InvalidFormat(
                    "Litematica block state index exceeds the palette",
                ))?;
                if !limits.should_retain_block(block) {
                    continue;
                }
                // validate_enclosing_bounds checked the inclusive axis endpoints.
                limits.push_block(
                    &mut blocks,
                    min.x + (index % width) as i32,
                    min.y + (index / plane) as i32,
                    min.z + ((index % plane) / width) as i32,
                    block,
                )?;
            }
            let tile_raw = match region.get("TileEntities") {
                Some(Value::List(entries)) => entries.as_slice(),
                _ => &[],
            };
            tiles.elements.extend(
                offset_region_tile_entities(tile_raw, min, region_size, legacy_wrappers)?.elements,
            );
            let entity_raw = match region.get("Entities") {
                Some(Value::List(entries)) => entries.as_slice(),
                _ => &[],
            };
            entities
                .elements
                .extend(offset_region_entities(entity_raw, position, legacy_wrappers)?.elements);
        }
        Ok(SchematicData::new(
            blocks,
            tiles,
            entities,
            Size {
                width: size.x,
                height: size.y,
                length: size.z,
            },
        ))
    }
}

fn region_min_corner(position: BlockPos, size: BlockPos) -> Result<BlockPos, SchematicError> {
    let min_axis = |position: i32, size: i32| {
        if size < 0 {
            position
                .checked_add(size)
                .and_then(|value| value.checked_add(1))
        } else {
            Some(position)
        }
    };

    Ok(BlockPos {
        x: min_axis(position.x, size.x).ok_or(SchematicError::InvalidFormat(
            "Litematica region x coordinate overflow",
        ))?,
        y: min_axis(position.y, size.y).ok_or(SchematicError::InvalidFormat(
            "Litematica region y coordinate overflow",
        ))?,
        z: min_axis(position.z, size.z).ok_or(SchematicError::InvalidFormat(
            "Litematica region z coordinate overflow",
        ))?,
    })
}

/// Verify that region extents are compatible with Metadata.EnclosingSize.
///
/// EnclosingSize describes the selection dimensions, not an absolute origin,
/// so regions may legitimately start at a non-zero or negative relative
/// position. We therefore compare only the aggregate extents and still allow
/// metadata to reserve empty border blocks.
fn validate_enclosing_bounds(
    regions: &HashMap<String, Value>,
    enclosing_size: BlockPos,
) -> Result<(), SchematicError> {
    let mut enclosing_min: Option<BlockPos> = None;
    let mut enclosing_max: Option<BlockPos> = None;

    for (_name, value) in regions {
        let Compound(region) = value else {
            return Err(SchematicError::InvalidFormat("Region is not a Compound"));
        };
        let position = region.get_pos("Position")?;
        let region_size = region.get_pos("Size")?;
        let width = region_size.x.unsigned_abs() as i32;
        let height = region_size.y.unsigned_abs() as i32;
        let length = region_size.z.unsigned_abs() as i32;
        if width <= 0 || height <= 0 || length <= 0 {
            return Err(SchematicError::InvalidFormat(
                "Litematica region dimensions must be positive",
            ));
        }
        let min = region_min_corner(position, region_size)?;
        let max = BlockPos {
            x: min
                .x
                .checked_add(width - 1)
                .ok_or(SchematicError::InvalidFormat(
                    "Litematica region x bounds overflow",
                ))?,
            y: min
                .y
                .checked_add(height - 1)
                .ok_or(SchematicError::InvalidFormat(
                    "Litematica region y bounds overflow",
                ))?,
            z: min
                .z
                .checked_add(length - 1)
                .ok_or(SchematicError::InvalidFormat(
                    "Litematica region z bounds overflow",
                ))?,
        };

        if let Some(current_min) = enclosing_min.as_mut() {
            current_min.x = current_min.x.min(min.x);
            current_min.y = current_min.y.min(min.y);
            current_min.z = current_min.z.min(min.z);
        } else {
            enclosing_min = Some(min);
        }
        if let Some(current_max) = enclosing_max.as_mut() {
            current_max.x = current_max.x.max(max.x);
            current_max.y = current_max.y.max(max.y);
            current_max.z = current_max.z.max(max.z);
        } else {
            enclosing_max = Some(max);
        }
    }

    let (Some(min), Some(max)) = (enclosing_min, enclosing_max) else {
        return Err(SchematicError::InvalidFormat(
            "Litematica schematic must contain at least one region",
        ));
    };
    let width = max
        .x
        .checked_sub(min.x)
        .and_then(|value| value.checked_add(1))
        .ok_or(SchematicError::InvalidFormat(
            "Litematica enclosing x bounds overflow",
        ))?;
    let height = max
        .y
        .checked_sub(min.y)
        .and_then(|value| value.checked_add(1))
        .ok_or(SchematicError::InvalidFormat(
            "Litematica enclosing y bounds overflow",
        ))?;
    let length = max
        .z
        .checked_sub(min.z)
        .and_then(|value| value.checked_add(1))
        .ok_or(SchematicError::InvalidFormat(
            "Litematica enclosing z bounds overflow",
        ))?;

    if width > enclosing_size.x || height > enclosing_size.y || length > enclosing_size.z {
        return Err(SchematicError::InvalidFormat(
            "Litematica regions exceed Metadata.EnclosingSize",
        ));
    }

    Ok(())
}

fn region_coordinate(value: &Value, axis: &'static str) -> Result<i32, SchematicError> {
    let value = value
        .as_i64()
        .ok_or_else(|| SchematicError::MissingField(axis.to_string()))?;
    i32::try_from(value)
        .map_err(|_| SchematicError::InvalidFormat("Litematica coordinate exceeds i32"))
}

fn offset_region_tile_entities(
    entries: &[Value],
    region_min: BlockPos,
    region_size: BlockPos,
    legacy_wrapper: bool,
) -> Result<TileEntitiesList, SchematicError> {
    let mut result = TileEntitiesList {
        original_type: 2,
        elements: Vec::with_capacity(entries.len()),
    };
    let dimensions = [
        i64::from(region_size.x.unsigned_abs()),
        i64::from(region_size.y.unsigned_abs()),
        i64::from(region_size.z.unsigned_abs()),
    ];

    for entry in entries {
        let Compound(map) = entry else {
            return Err(SchematicError::InvalidFormat(
                "TileEntity is not a Compound",
            ));
        };

        let local = BlockPos {
            x: region_coordinate(
                map.get("x")
                    .ok_or(SchematicError::MissingField("x".into()))?,
                "x",
            )?,
            y: region_coordinate(
                map.get("y")
                    .ok_or(SchematicError::MissingField("y".into()))?,
                "y",
            )?,
            z: region_coordinate(
                map.get("z")
                    .ok_or(SchematicError::MissingField("z".into()))?,
                "z",
            )?,
        };
        if local.x < 0
            || local.y < 0
            || local.z < 0
            || i64::from(local.x) >= dimensions[0]
            || i64::from(local.y) >= dimensions[1]
            || i64::from(local.z) >= dimensions[2]
        {
            return Err(SchematicError::InvalidFormat(
                "Litematica tile entity position is outside its region",
            ));
        }
        let pos = BlockPos {
            x: region_min
                .x
                .checked_add(local.x)
                .ok_or(SchematicError::InvalidFormat(
                    "Litematica tile entity x overflow",
                ))?,
            y: region_min
                .y
                .checked_add(local.y)
                .ok_or(SchematicError::InvalidFormat(
                    "Litematica tile entity y overflow",
                ))?,
            z: region_min
                .z
                .checked_add(local.z)
                .ok_or(SchematicError::InvalidFormat(
                    "Litematica tile entity z overflow",
                ))?,
        };

        let mut nbt = if legacy_wrapper {
            match map.get("TileNBT") {
                Some(Compound(tile_nbt)) => tile_nbt.clone(),
                Some(_) => {
                    return Err(SchematicError::InvalidFormat(
                        "Litematica v1 TileNBT is not a Compound",
                    ));
                }
                None => {
                    return Err(SchematicError::MissingField("TileNBT".into()));
                }
            }
        } else {
            map.clone()
        };
        nbt.insert("x".to_string(), Value::Int(pos.x));
        nbt.insert("y".to_string(), Value::Int(pos.y));
        nbt.insert("z".to_string(), Value::Int(pos.z));
        result.elements.push(TileEntities {
            pos,
            nbt: Compound(nbt),
        });
    }

    Ok(result)
}

fn numeric_value(value: &Value) -> Option<f64> {
    match value {
        Value::Byte(value) => Some(*value as f64),
        Value::Short(value) => Some(*value as f64),
        Value::Int(value) => Some(*value as f64),
        Value::Long(value) => Some(*value as f64),
        Value::Float(value) => Some(*value as f64),
        Value::Double(value) => Some(*value),
        _ => None,
    }
}

fn offset_entity_nbt(value: &Value, region_position: BlockPos) -> Value {
    let Compound(map) = value else {
        return value.clone();
    };

    let mut normalized = map.clone();
    if let Some(position) = map.get("Pos") {
        if let Some(coordinates) = entity_position_coordinates(position) {
            normalized.insert(
                "Pos".to_string(),
                Value::List(vec![
                    Value::Double(coordinates[0] + region_position.x as f64),
                    Value::Double(coordinates[1] + region_position.y as f64),
                    Value::Double(coordinates[2] + region_position.z as f64),
                ]),
            );
        }
    }

    Compound(normalized)
}

fn entity_position_coordinates(value: &Value) -> Option<Vec<f64>> {
    match value {
        Value::List(position) if position.len() == 3 => position
            .iter()
            .map(numeric_value)
            .collect::<Option<Vec<_>>>(),
        Value::IntArray(position) if position.len() == 3 => {
            Some(position.iter().map(|value| *value as f64).collect())
        }
        _ => None,
    }
}

fn offset_region_entities(
    entries: &[Value],
    region_position: BlockPos,
    legacy_wrapper: bool,
) -> Result<EntitiesList, SchematicError> {
    let entries = entries
        .iter()
        .map(|entry| {
            if legacy_wrapper {
                offset_legacy_entity_nbt(entry, region_position)
            } else {
                Ok(offset_entity_nbt(entry, region_position))
            }
        })
        .collect::<Result<Vec<_>, SchematicError>>()?;
    EntitiesList::from_nbt(&entries, 2)
}

fn offset_legacy_entity_nbt(
    value: &Value,
    region_position: BlockPos,
) -> Result<Value, SchematicError> {
    let Compound(wrapper) = value else {
        return Err(SchematicError::InvalidFormat(
            "Litematica v1 Entity wrapper is not a Compound",
        ));
    };

    let coordinate = |name: &str| {
        wrapper
            .get(name)
            .and_then(numeric_value)
            .ok_or_else(|| SchematicError::MissingField(name.to_string()))
    };
    let payload = match wrapper.get("EntityData") {
        Some(Compound(entity)) => entity.clone(),
        Some(_) => {
            return Err(SchematicError::InvalidFormat(
                "Litematica v1 EntityData is not a Compound",
            ));
        }
        None => return Err(SchematicError::MissingField("EntityData".into())),
    };

    let mut normalized = payload;
    normalized.insert(
        "Pos".to_string(),
        Value::List(vec![
            Value::Double(coordinate("dx")? + region_position.x as f64),
            Value::Double(coordinate("dy")? + region_position.y as f64),
            Value::Double(coordinate("dz")? + region_position.z as f64),
        ]),
    );
    Ok(Compound(normalized))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn compound(entries: impl IntoIterator<Item = (String, Value)>) -> Value {
        Compound(entries.into_iter().collect())
    }

    fn metadata(width: i32, height: i32, length: i32) -> Value {
        compound([
            ("TimeCreated".to_string(), Value::Long(0)),
            ("TimeModified".to_string(), Value::Long(0)),
            ("Description".to_string(), Value::String(String::new())),
            ("RegionCount".to_string(), Value::Int(1)),
            ("TotalBlocks".to_string(), Value::Int(1)),
            ("Author".to_string(), Value::String("test".to_string())),
            (
                "TotalVolume".to_string(),
                Value::Int(width * height * length),
            ),
            ("Name".to_string(), Value::String("test".to_string())),
            (
                "EnclosingSize".to_string(),
                compound([
                    ("x".to_string(), Value::Int(width)),
                    ("y".to_string(), Value::Int(height)),
                    ("z".to_string(), Value::Int(length)),
                ]),
            ),
        ])
    }

    fn palette() -> Value {
        Value::List(vec![
            compound([(
                "Name".to_string(),
                Value::String("minecraft:air".to_string()),
            )]),
            compound([(
                "Name".to_string(),
                Value::String("minecraft:stone".to_string()),
            )]),
        ])
    }

    fn region(legacy_wrappers: bool) -> Value {
        let tile_entity = if legacy_wrappers {
            compound([
                ("x".to_string(), Value::Int(0)),
                ("y".to_string(), Value::Int(0)),
                ("z".to_string(), Value::Int(0)),
                (
                    "TileNBT".to_string(),
                    compound([(
                        "id".to_string(),
                        Value::String("minecraft:chest".to_string()),
                    )]),
                ),
            ])
        } else {
            compound([
                ("x".to_string(), Value::Int(0)),
                ("y".to_string(), Value::Int(0)),
                ("z".to_string(), Value::Int(0)),
                (
                    "id".to_string(),
                    Value::String("minecraft:chest".to_string()),
                ),
            ])
        };

        let entity = if legacy_wrappers {
            compound([
                ("dx".to_string(), Value::Double(0.5)),
                ("dy".to_string(), Value::Double(0.25)),
                ("dz".to_string(), Value::Double(0.75)),
                (
                    "EntityData".to_string(),
                    compound([(
                        "id".to_string(),
                        Value::String("minecraft:item".to_string()),
                    )]),
                ),
            ])
        } else {
            compound([
                (
                    "Pos".to_string(),
                    Value::List(vec![
                        Value::Double(0.5),
                        Value::Double(0.25),
                        Value::Double(0.75),
                    ]),
                ),
                (
                    "id".to_string(),
                    Value::String("minecraft:item".to_string()),
                ),
            ])
        };

        compound([
            (
                "Position".to_string(),
                compound([
                    ("x".to_string(), Value::Int(5)),
                    ("y".to_string(), Value::Int(10)),
                    ("z".to_string(), Value::Int(20)),
                ]),
            ),
            (
                "Size".to_string(),
                compound([
                    ("x".to_string(), Value::Int(-2)),
                    ("y".to_string(), Value::Int(1)),
                    ("z".to_string(), Value::Int(1)),
                ]),
            ),
            ("BlockStatePalette".to_string(), palette()),
            (
                "BlockStates".to_string(),
                Value::LongArray(fastnbt::LongArray::new(vec![1])),
            ),
            ("TileEntities".to_string(), Value::List(vec![tile_entity])),
            ("Entities".to_string(), Value::List(vec![entity])),
            ("DataVersion".to_string(), Value::Int(3465)),
        ])
    }

    fn fixture(version: i32) -> LmSchematic {
        let legacy_wrappers = version <= 1;
        LmSchematic {
            nbt: compound([
                ("Version".to_string(), Value::Int(version)),
                ("MinecraftDataVersion".to_string(), Value::Int(3465)),
                ("Metadata".to_string(), metadata(7, 1, 1)),
                (
                    "Regions".to_string(),
                    compound([("test".to_string(), region(legacy_wrappers))]),
                ),
            ]),
        }
    }

    #[test]
    fn normalizes_negative_region_coordinates_and_direct_entities() {
        let data = fixture(2).get_blocks_pos().expect("decode fixture");
        assert_eq!(data.size.width, 7);
        assert_eq!(data.blocks.elements[0].pos, BlockPos { x: 4, y: 10, z: 20 });
        assert_eq!(
            data.blocks.elements[0].block.id.name.as_ref(),
            "minecraft:stone"
        );

        assert_eq!(
            data.tile_entities_list.elements[0].pos,
            BlockPos { x: 4, y: 10, z: 20 }
        );
        let Value::Compound(entity) = &data.entities_list.elements[0].nbt else {
            panic!("expected entity compound");
        };
        let Value::List(position) = entity.get("Pos").expect("entity position") else {
            panic!("expected entity position list");
        };
        assert_eq!(position[0], Value::Double(5.5));
        assert_eq!(position[1], Value::Double(10.25));
        assert_eq!(position[2], Value::Double(20.75));
    }

    #[test]
    fn unwraps_litematica_v1_entity_and_tile_entity_payloads() {
        let data = fixture(1).get_blocks_pos().expect("decode v1 fixture");
        let tile = &data.tile_entities_list.elements[0];
        assert_eq!(tile.pos, BlockPos { x: 4, y: 10, z: 20 });
        let Value::Compound(tile_nbt) = &tile.nbt else {
            panic!("expected tile entity compound");
        };
        assert_eq!(
            tile_nbt.get("id").and_then(Value::as_str),
            Some("minecraft:chest")
        );

        let Value::Compound(entity) = &data.entities_list.elements[0].nbt else {
            panic!("expected entity compound");
        };
        let Value::List(position) = entity.get("Pos").expect("entity position") else {
            panic!("expected entity position list");
        };
        assert_eq!(position[0], Value::Double(5.5));
        assert_eq!(entity.get("EntityData"), None);
    }

    #[test]
    fn rejects_regions_that_exceed_metadata_enclosing_size() {
        let mut schematic = fixture(2);
        let Compound(root) = &mut schematic.nbt else {
            panic!("expected root compound");
        };
        let Compound(metadata) = root.get_mut("Metadata").expect("metadata") else {
            panic!("expected metadata compound");
        };
        let Compound(enclosing) = metadata.get_mut("EnclosingSize").expect("enclosing size") else {
            panic!("expected enclosing size compound");
        };
        enclosing.insert("x".to_string(), Value::Int(1));

        let error = schematic
            .get_blocks_pos()
            .expect_err("invalid enclosing size");
        assert!(error.to_string().contains("EnclosingSize"));
    }

    #[test]
    fn rejects_out_of_bounds_region_tile_entities() {
        let mut schematic = fixture(2);
        let Compound(root) = &mut schematic.nbt else {
            panic!("expected root compound");
        };
        let Compound(regions) = root.get_mut("Regions").expect("regions") else {
            panic!("expected regions compound");
        };
        let Compound(region) = regions.get_mut("test").expect("test region") else {
            panic!("expected region compound");
        };
        let Value::List(tile_entities) = region.get_mut("TileEntities").expect("tile entities")
        else {
            panic!("expected tile entity list");
        };
        let Compound(tile_entity) = &mut tile_entities[0] else {
            panic!("expected tile entity compound");
        };
        tile_entity.insert("x".to_string(), Value::Int(2));

        let error = schematic
            .get_blocks_pos()
            .expect_err("invalid tile entity position");
        assert!(error.to_string().contains("outside its region"));
    }
}
