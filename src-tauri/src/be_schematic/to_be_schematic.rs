use crate::be_schematic::bedrock_map::bedrock_map;
use crate::utils::block_state_pos_list::{BlockData, BlockPos, BlockStatePos};
use crate::utils::entities::EntitiesList;
use crate::utils::schematic_data::{SchematicData, SchematicError};
use crate::utils::tile_entities::TileEntitiesList;

use anyhow::Result;
use fastnbt::Value;
use rayon::iter::IndexedParallelIterator;
use rayon::iter::IntoParallelRefIterator;
use rayon::iter::ParallelIterator;
use std::collections::{BTreeMap, HashMap, VecDeque};
use std::sync::Arc;

/// Bedrock's block palette state version used by current `.mcstructure`
/// writers.  Without this field Bedrock may treat otherwise valid states as
/// legacy/unknown states (fluids and block states are especially affected).
const BEDROCK_BLOCK_STATE_VERSION: i32 = 17_959_425;

#[derive(Debug)]
pub struct ToBESchematic {
    blocks: VecDeque<BlockStatePos>,
    pub start_pos: BlockPos,
    pub end_pos: BlockPos,
    pub width: i32,
    pub height: i32,
    pub length: i32,
    pub unique_block_states: Vec<Arc<BlockData>>,
    pub block_state_to_index: HashMap<Arc<BlockData>, usize>,
    pub tile_entities: TileEntitiesList,
    pub entities: EntitiesList,
}

struct EncodedBedrockPalette {
    states: Vec<Arc<BlockData>>,
    indices: HashMap<BlockData, i32>,
    air_index: i32,
    water_source_index: Option<i32>,
}

impl ToBESchematic {
    pub fn new(schematic: &SchematicData) -> Result<Self, SchematicError> {
        let blocks = schematic.blocks.clone().elements;
        let size = schematic.size;
        if size.width <= 0 || size.height <= 0 || size.length <= 0 {
            return Err(SchematicError::InvalidFormat(
                "schematic dimensions must be positive",
            ));
        }

        let observed_min = if blocks.is_empty() {
            // A valid structure may intentionally contain no blocks (both
            // layers are -1) or only implicit air. Keep its declared extent
            // instead of manufacturing a block just to obtain an origin.
            BlockPos { x: 0, y: 0, z: 0 }
        } else {
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
        let observed_max = blocks.iter().fold(observed_min, |mut max, block| {
            max.x = max.x.max(block.pos.x);
            max.y = max.y.max(block.pos.y);
            max.z = max.z.max(block.pos.z);
            max
        });
        let use_zero_origin = observed_min.x >= 0
            && observed_min.y >= 0
            && observed_min.z >= 0
            && observed_max.x < size.width
            && observed_max.y < size.height
            && observed_max.z < size.length;
        let min = if use_zero_origin {
            BlockPos { x: 0, y: 0, z: 0 }
        } else {
            observed_min
        };
        let max_from_size = BlockPos {
            x: min
                .x
                .checked_add(size.width - 1)
                .ok_or(SchematicError::InvalidFormat("schematic width overflow"))?,
            y: min
                .y
                .checked_add(size.height - 1)
                .ok_or(SchematicError::InvalidFormat("schematic height overflow"))?,
            z: min
                .z
                .checked_add(size.length - 1)
                .ok_or(SchematicError::InvalidFormat("schematic length overflow"))?,
        };
        let max = observed_max;
        let max = BlockPos {
            x: max.x.max(max_from_size.x),
            y: max.y.max(max_from_size.y),
            z: max.z.max(max_from_size.z),
        };
        let width = max
            .x
            .checked_sub(min.x)
            .and_then(|value| value.checked_add(1))
            .ok_or(SchematicError::InvalidFormat("schematic width overflow"))?;
        let height = max
            .y
            .checked_sub(min.y)
            .and_then(|value| value.checked_add(1))
            .ok_or(SchematicError::InvalidFormat("schematic height overflow"))?;
        let length = max
            .z
            .checked_sub(min.z)
            .and_then(|value| value.checked_add(1))
            .ok_or(SchematicError::InvalidFormat("schematic length overflow"))?;
        if [width, height, length]
            .into_iter()
            .any(|dimension| dimension <= 0)
        {
            return Err(SchematicError::InvalidFormat(
                "schematic dimensions must be positive",
            ));
        }

        let (unique_block_states, block_state_to_index) = {
            let mut seen = HashMap::new();
            let mut unique = Vec::new();
            let mut index_map = HashMap::new();

            for block_pos in &blocks {
                let block_data = block_pos.block.clone();

                if !seen.contains_key(&block_data) {
                    let index = unique.len();
                    seen.insert(block_data.clone(), index);
                    unique.push(block_data.clone());
                    index_map.insert(block_data, index);
                }
            }

            let air = Arc::new(BlockData {
                id: crate::utils::block_state_pos_list::BlockId {
                    name: Arc::from("minecraft:air"),
                },
                properties: Default::default(),
            });
            if !seen.contains_key(&air) {
                let index = unique.len();
                seen.insert(air.clone(), index);
                unique.push(air.clone());
                index_map.insert(air, index);
            }

            (unique, index_map)
        };

        Ok(Self {
            blocks,
            start_pos: min,
            end_pos: max,
            width,
            height,
            length,
            unique_block_states,
            block_state_to_index,
            tile_entities: schematic.tile_entities_list.clone(),
            entities: schematic.entities_list.clone(),
        })
    }

    fn build_size(&self) -> Vec<Value> {
        vec![
            Value::Int(self.width),
            Value::Int(self.height),
            Value::Int(self.length),
        ]
    }

    fn build_bedrock_palette(&self) -> EncodedBedrockPalette {
        let mut states = self
            .unique_block_states
            .iter()
            .map(|block| mapped_bedrock_block(block))
            .collect::<Vec<_>>();
        let mut indices = HashMap::new();
        for (index, state) in states.iter().enumerate() {
            indices.entry((**state).clone()).or_insert(index as i32);
        }

        let air_index = states
            .iter()
            .position(|block| block.id.name.as_ref() == "minecraft:air")
            .unwrap_or(0) as i32;

        // Java waterlogged blocks do not carry a Bedrock liquid state in the
        // primary palette. Add one canonical source-water entry for the
        // secondary layer when the source needs it. Pure water and bubble
        // columns remain in the primary layer; the secondary layer is only a
        // water overlay in the .mcstructure format.
        let water_source_index = self
            .blocks
            .iter()
            .any(|block| needs_water_source(&block.block))
            .then(|| {
                let source = Arc::new(BlockData {
                    id: crate::utils::block_state_pos_list::BlockId {
                        name: Arc::from("minecraft:water"),
                    },
                    properties: {
                        let mut properties = BTreeMap::new();
                        properties.insert(Arc::from("liquid_depth"), Arc::from("0"));
                        properties
                    },
                });
                ensure_palette_state(&mut states, &mut indices, source)
            });

        EncodedBedrockPalette {
            states,
            indices,
            air_index,
            water_source_index,
        }
    }

    /// 构建 `block_palette`
    fn build_palette(&self, palette: &EncodedBedrockPalette) -> Value {
        Value::List(palette.states.iter().map(bedrock_palette_entry).collect())
    }

    /// 构建 `block_indices` (X → Y → Z)
    fn build_block_indices(&self, palette: &EncodedBedrockPalette) -> Value {
        let total_blocks = (self.length as usize)
            .checked_mul(self.width as usize)
            .and_then(|value| value.checked_mul(self.height as usize))
            .unwrap_or(0);

        // Keep collision handling deterministic. Sparse imports can contain
        // overlapping regions or duplicate coordinates; parallel atomic
        // stores made the winning state depend on scheduling.
        let mut final_indices = vec![palette.air_index; total_blocks];
        let mut liquid_indices = vec![-1; total_blocks];
        for block in &self.blocks {
            let dx = i64::from(block.pos.x) - i64::from(self.start_pos.x);
            let dy = i64::from(block.pos.y) - i64::from(self.start_pos.y);
            let dz = i64::from(block.pos.z) - i64::from(self.start_pos.z);
            let id = dx * i64::from(self.height) * i64::from(self.length)
                + dy * i64::from(self.length)
                + dz;

            if id >= 0
                && usize::try_from(id)
                    .ok()
                    .is_some_and(|index| index < total_blocks)
            {
                let index = id as usize;
                let bedrock_block = self
                    .block_state_to_index
                    .get(&block.block)
                    .and_then(|state| palette.states.get(*state))
                    .cloned()
                    .unwrap_or_else(|| mapped_bedrock_block(&block.block));
                let bedrock_index = palette
                    .indices
                    .get(bedrock_block.as_ref())
                    .copied()
                    .unwrap_or(palette.air_index);

                // The first mcstructure layer always owns the visible block,
                // including water, lava and bubble_column. The second layer
                // is a separate water overlay for waterlogged blocks.
                final_indices[index] = bedrock_index;
                liquid_indices[index] = if needs_water_source(&block.block) {
                    palette.water_source_index.unwrap_or(-1)
                } else {
                    -1
                };
            }
        }

        let final_list: Vec<Value> = final_indices.into_iter().map(Value::Int).collect();
        let liquid_list: Vec<Value> = liquid_indices.into_iter().map(Value::Int).collect();

        let mut block_indices = Vec::new();
        block_indices.push(Value::List(final_list));
        block_indices.push(Value::List(liquid_list));

        Value::List(block_indices)
    }

    fn build_block_position_data(&self) -> Value {
        let mut entries = HashMap::new();
        for tile_entity in &self.tile_entities.elements {
            let dx = tile_entity.pos.x - self.start_pos.x;
            let dy = tile_entity.pos.y - self.start_pos.y;
            let dz = tile_entity.pos.z - self.start_pos.z;
            if dx < 0
                || dy < 0
                || dz < 0
                || dx >= self.width
                || dy >= self.height
                || dz >= self.length
            {
                continue;
            }
            let index = (i64::from(dx) * i64::from(self.height) * i64::from(self.length))
                + (i64::from(dy) * i64::from(self.length))
                + i64::from(dz);
            let mut position_data = HashMap::new();
            position_data.insert(
                "block_entity_data".to_string(),
                localize_block_entity_nbt(&tile_entity.nbt, dx, dy, dz),
            );
            entries.insert(index.to_string(), Value::Compound(position_data));
        }
        Value::Compound(entries)
    }

    fn build_entities(&self) -> Value {
        Value::List(
            self.entities
                .elements
                .iter()
                .map(|entity| localize_entity_nbt(&entity.nbt, self.start_pos))
                .collect(),
        )
    }

    /// 转换为 Bedrock `.mcstructure` NBT 结构
    pub fn to_be_value(&self) -> Result<HashMap<String, Value>, SchematicError> {
        let palette = self.build_bedrock_palette();
        let mut default_map = HashMap::new();
        default_map.insert("block_palette".to_string(), self.build_palette(&palette));
        default_map.insert(
            "block_position_data".to_string(),
            self.build_block_position_data(),
        );

        let mut palette_map = HashMap::new();
        palette_map.insert("default".to_string(), Value::Compound(default_map));

        let mut structure_map = HashMap::new();
        structure_map.insert("palette".to_string(), Value::Compound(palette_map));
        structure_map.insert(
            "block_indices".to_string(),
            self.build_block_indices(&palette),
        );
        structure_map.insert("entities".to_string(), self.build_entities());

        let mut root = HashMap::new();
        root.insert("format_version".to_string(), Value::Int(1));
        root.insert("size".to_string(), Value::List(self.build_size()));
        root.insert("structure".to_string(), Value::Compound(structure_map));
        root.insert(
            "structure_world_origin".to_string(),
            Value::List(vec![Value::Int(0), Value::Int(0), Value::Int(0)]),
        );

        Ok(root)
    }
}

fn mapped_bedrock_block(block: &BlockData) -> Arc<BlockData> {
    // Legacy Java schematics can expose `flowing_water`/`flowing_lava` as
    // separate block names.  They are not present in the flattened Java
    // mapping table, so normalize them explicitly before consulting the
    // generated state map instead of silently replacing them with stone.
    if let Some(fluid) = legacy_fluid_state(block) {
        return fluid;
    }

    // The bundled table resolves omitted Java defaults (log axis, stair shape,
    // etc.). Unknown/modded names are made loadable as stone instead of
    // aborting the complete structure export.
    bedrock_map().to_bedrock(block).unwrap_or_else(|| {
        eprintln!(
            "[bedrock-map] {} has no Bedrock mapping; using minecraft:stone",
            block.id.name
        );
        Arc::new(BlockData {
            id: crate::utils::block_state_pos_list::BlockId {
                name: Arc::from("minecraft:stone"),
            },
            properties: Default::default(),
        })
    })
}

fn legacy_fluid_state(block: &BlockData) -> Option<Arc<BlockData>> {
    let name = block
        .id
        .name
        .strip_prefix("minecraft:")
        .unwrap_or(block.id.name.as_ref());
    let (bedrock_name, default_is_flowing) = match name {
        "water" => ("minecraft:water", false),
        "flowing_water" => ("minecraft:flowing_water", true),
        "lava" => ("minecraft:lava", false),
        "flowing_lava" => ("minecraft:flowing_lava", true),
        _ => return None,
    };

    let depth = block
        .properties
        .get("liquid_depth")
        .or_else(|| block.properties.get("level"))
        .and_then(|value| value.parse::<i32>().ok())
        .unwrap_or(0)
        .clamp(0, 15);
    let is_flowing = default_is_flowing || depth > 0;
    let state_name = match (name, is_flowing) {
        ("water", true) => "minecraft:flowing_water",
        ("water", false) => "minecraft:water",
        ("flowing_water", _) => "minecraft:flowing_water",
        ("lava", true) => "minecraft:flowing_lava",
        ("lava", false) => "minecraft:lava",
        ("flowing_lava", _) => "minecraft:flowing_lava",
        _ => bedrock_name,
    };

    let mut properties = BTreeMap::new();
    properties.insert(Arc::from("liquid_depth"), Arc::from(depth.to_string()));
    Some(Arc::new(BlockData {
        id: crate::utils::block_state_pos_list::BlockId {
            name: Arc::from(state_name),
        },
        properties,
    }))
}

fn ensure_palette_state(
    states: &mut Vec<Arc<BlockData>>,
    indices: &mut HashMap<BlockData, i32>,
    state: Arc<BlockData>,
) -> i32 {
    if let Some(index) = indices.get(state.as_ref()) {
        return *index;
    }
    let index = i32::try_from(states.len()).unwrap_or(i32::MAX);
    states.push(state.clone());
    indices.insert((*state).clone(), index);
    index
}

fn bedrock_palette_entry(block: &Arc<BlockData>) -> Value {
    let mut map = HashMap::new();
    map.insert("name".to_string(), Value::String(block.id.name.to_string()));

    let mut states_map = HashMap::new();
    for (key, value) in &block.properties {
        let state_value = match value.as_ref() {
            "true" => Value::Byte(1),
            "false" => Value::Byte(0),
            value if value.parse::<i32>().is_ok() => {
                Value::Int(value.parse::<i32>().unwrap_or_default())
            }
            value => Value::String(value.to_string()),
        };
        states_map.insert(key.to_string(), state_value);
    }
    map.insert("states".to_string(), Value::Compound(states_map));
    map.insert(
        "version".to_string(),
        Value::Int(BEDROCK_BLOCK_STATE_VERSION),
    );
    Value::Compound(map)
}

fn java_name(block: &BlockData) -> &str {
    block
        .id
        .name
        .strip_prefix("minecraft:")
        .unwrap_or(block.id.name.as_ref())
}

fn has_true_property(block: &BlockData, key: &str) -> bool {
    block
        .properties
        .get(key)
        .is_some_and(|value| matches!(value.as_ref(), "true" | "1"))
}

fn needs_water_source(block: &BlockData) -> bool {
    // Fluids and bubble columns are complete primary-layer blocks in
    // Bedrock.  They must never be duplicated into the water overlay, even
    // when a malformed legacy state carries an unrelated `waterlogged` flag.
    if matches!(
        java_name(block),
        "water" | "flowing_water" | "lava" | "flowing_lava" | "bubble_column"
    ) {
        return false;
    }
    // The secondary layer represents an explicit co-located fluid, not every
    // block that happens to live near or depend on water. In particular,
    // lily pads and frogspawn sit above water, while kelp/seagrass carry their
    // own aquatic behaviour. Adding an overlay for them creates floating or
    // duplicated water when the structure is loaded.
    has_true_property(block, "waterlogged")
}

/// Bedrock stores block-entity coordinates relative to the structure origin.
/// Importers keep the source coordinates in `TileEntities.pos` and often leave
/// the same world coordinates inside the NBT payload, so rewrite the standard
/// lowercase position tags while preserving every other payload field.
fn localize_block_entity_nbt(nbt: &Value, x: i32, y: i32, z: i32) -> Value {
    let Value::Compound(map) = nbt else {
        return nbt.clone();
    };

    let mut localized = map.clone();
    localized.insert("x".to_string(), Value::Int(x));
    localized.insert("y".to_string(), Value::Int(y));
    localized.insert("z".to_string(), Value::Int(z));
    Value::Compound(localized)
}

/// Convert Java-style entity payloads into the local, Bedrock-compatible
/// entity payload used by `structure.entities`.  Entity positions are world
/// coordinates in Litematica/Create/MCEdit data, while mcstructure stores
/// positions relative to the structure origin.  The recursive walk also
/// handles passengers and nested entity wrappers emitted by third-party
/// exporters.
fn localize_entity_nbt(nbt: &Value, start_pos: BlockPos) -> Value {
    let delta = [
        -(start_pos.x as f64),
        -(start_pos.y as f64),
        -(start_pos.z as f64),
    ];
    localize_entity_value(nbt, delta, start_pos)
}

fn localize_entity_value(value: &Value, delta: [f64; 3], start_pos: BlockPos) -> Value {
    let Value::Compound(map) = value else {
        return match value {
            Value::List(values) => Value::List(
                values
                    .iter()
                    .map(|entry| localize_entity_value(entry, delta, start_pos))
                    .collect(),
            ),
            _ => value.clone(),
        };
    };

    let mut localized = HashMap::with_capacity(map.len() + 1);
    for (key, child) in map {
        let normalized_key = if key == "pos" { "Pos" } else { key.as_str() };
        let child = if normalized_key == "Pos" {
            shift_entity_position(child, delta)
        } else if key == "block_pos" {
            shift_block_position(child, start_pos)
        } else {
            localize_entity_value(child, delta, start_pos)
        };
        localized.insert(normalized_key.to_string(), child);
    }

    // Java payloads use `id`; Bedrock structure entities use `identifier`.
    // Keep `id` for round-tripping, but add the Bedrock key so the game can
    // instantiate the entity instead of silently dropping it.
    if !localized.contains_key("identifier") {
        if let Some(Value::String(id)) = localized.get("id") {
            localized.insert("identifier".to_string(), Value::String(id.clone()));
        } else if let Some(Value::Compound(inner)) = localized.get("nbt") {
            if let Some(Value::String(id)) = inner.get("id") {
                localized.insert("identifier".to_string(), Value::String(id.clone()));
            }
        }
    }

    Value::Compound(localized)
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

fn shift_entity_position(value: &Value, delta: [f64; 3]) -> Value {
    let coordinates = match value {
        Value::List(values) if values.len() == 3 => {
            values.iter().map(numeric_value).collect::<Option<Vec<_>>>()
        }
        Value::IntArray(values) if values.len() == 3 => {
            Some(values.iter().map(|value| *value as f64).collect())
        }
        Value::LongArray(values) if values.len() == 3 => {
            Some(values.iter().map(|value| *value as f64).collect())
        }
        _ => None,
    };
    let Some(coordinates) = coordinates else {
        return value.clone();
    };
    Value::List(
        coordinates
            .into_iter()
            .zip(delta)
            .map(|(coordinate, offset)| Value::Double(coordinate + offset))
            .collect(),
    )
}

fn shift_block_position(value: &Value, start_pos: BlockPos) -> Value {
    let offset = [start_pos.x, start_pos.y, start_pos.z];
    match value {
        Value::IntArray(values) if values.len() == 3 => Value::IntArray(fastnbt::IntArray::new(
            values
                .iter()
                .zip(offset)
                .map(|(coordinate, origin)| coordinate.saturating_sub(origin))
                .collect(),
        )),
        Value::List(values) if values.len() == 3 => Value::List(
            values
                .iter()
                .zip(offset)
                .map(|(coordinate, origin)| match coordinate {
                    Value::Byte(value) => Value::Int(i32::from(*value).saturating_sub(origin)),
                    Value::Short(value) => Value::Int(i32::from(*value).saturating_sub(origin)),
                    Value::Int(value) => Value::Int(value.saturating_sub(origin)),
                    Value::Long(value) => Value::Int(
                        i32::try_from(*value)
                            .unwrap_or(if *value < 0 { i32::MIN } else { i32::MAX })
                            .saturating_sub(origin),
                    ),
                    _ => coordinate.clone(),
                })
                .collect(),
        ),
        _ => value.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::block_state_pos_list::{BlockData, BlockId, BlockStatePosList};
    use crate::utils::entities::EntitiesList;
    use crate::utils::schematic_data::{SchematicData, Size};
    use crate::utils::tile_entities::TileEntitiesList;
    use std::collections::BTreeMap;

    #[test]
    fn preserves_leading_air_from_declared_selection_size() {
        let stone = Arc::new(BlockData {
            id: BlockId {
                name: Arc::from("minecraft:stone"),
            },
            properties: BTreeMap::new(),
        });
        let mut blocks = BlockStatePosList::default();
        blocks.add(BlockPos { x: 2, y: 0, z: 0 }, stone);
        let source = SchematicData::new(
            blocks,
            TileEntitiesList::default(),
            EntitiesList::default(),
            Size {
                width: 3,
                height: 1,
                length: 1,
            },
        );

        let writer = ToBESchematic::new(&source).expect("build writer");
        assert_eq!(writer.start_pos, BlockPos { x: 0, y: 0, z: 0 });
        assert_eq!((writer.width, writer.height, writer.length), (3, 1, 1));

        let root = writer.to_be_value().expect("encode writer");
        let Value::Compound(structure) = root.get("structure").expect("structure") else {
            panic!("expected structure compound");
        };
        let Value::List(block_indices) = structure.get("block_indices").expect("indices") else {
            panic!("expected block_indices list");
        };
        let Value::List(primary) = &block_indices[0] else {
            panic!("expected primary layer");
        };
        assert_eq!(primary.len(), 3);
        assert_ne!(primary[0], primary[2]);
        assert_ne!(primary[1], primary[2]);
    }

    #[test]
    fn writes_empty_structures_using_the_declared_extent() {
        let source = SchematicData::new(
            BlockStatePosList::default(),
            TileEntitiesList::default(),
            EntitiesList::default(),
            Size {
                width: 2,
                height: 3,
                length: 4,
            },
        );

        let writer = ToBESchematic::new(&source).expect("build empty writer");
        assert_eq!(writer.start_pos, BlockPos { x: 0, y: 0, z: 0 });
        assert_eq!(writer.end_pos, BlockPos { x: 1, y: 2, z: 3 });

        let root = writer.to_be_value().expect("encode empty structure");
        let Value::Compound(structure) = root.get("structure").expect("structure") else {
            panic!("expected structure compound");
        };
        let Value::List(layers) = structure.get("block_indices").expect("indices") else {
            panic!("expected block index layers");
        };
        let Value::List(primary) = &layers[0] else {
            panic!("expected primary layer");
        };
        let Value::List(secondary) = &layers[1] else {
            panic!("expected secondary layer");
        };

        assert_eq!(primary.len(), 24);
        assert_eq!(secondary.len(), 24);
        assert!(secondary.iter().all(|index| *index == Value::Int(-1)));
    }

    #[test]
    fn aquatic_blocks_without_waterlogged_state_do_not_create_an_overlay() {
        for name in [
            "minecraft:kelp",
            "minecraft:kelp_plant",
            "minecraft:seagrass",
            "minecraft:tall_seagrass",
            "minecraft:lily_pad",
            "minecraft:frogspawn",
        ] {
            let block = BlockData {
                id: BlockId {
                    name: Arc::from(name),
                },
                properties: BTreeMap::new(),
            };
            assert!(!needs_water_source(&block), "unexpected overlay for {name}");
        }
    }

    #[test]
    fn emits_default_bedrock_states_for_common_map_art_blocks() {
        let mut blocks = BlockStatePosList::default();
        for (x, name) in [
            (0, "minecraft:oak_log"),
            (1, "minecraft:redstone_ore"),
            (2, "minecraft:white_glazed_terracotta"),
        ] {
            blocks.add(
                BlockPos { x, y: 0, z: 0 },
                Arc::new(BlockData {
                    id: BlockId {
                        name: Arc::from(name),
                    },
                    properties: BTreeMap::new(),
                }),
            );
        }
        let source = SchematicData::new(
            blocks,
            TileEntitiesList::default(),
            EntitiesList::default(),
            Size {
                width: 3,
                height: 1,
                length: 1,
            },
        );
        let root = ToBESchematic::new(&source)
            .expect("build writer")
            .to_be_value()
            .expect("encode common map art blocks");
        let Value::Compound(structure) = root.get("structure").expect("structure") else {
            panic!("expected structure compound");
        };
        let Value::Compound(palette) = structure.get("palette").expect("palette") else {
            panic!("expected palette compound");
        };
        let Value::Compound(default) = palette.get("default").expect("default palette") else {
            panic!("expected default palette");
        };
        let Value::List(entries) = default.get("block_palette").expect("block palette") else {
            panic!("expected block palette list");
        };
        // The writer always includes an explicit air state so positions that
        // are not present in the sparse source can be represented safely.
        assert_eq!(entries.len(), 4);
        let palette_text = format!("{entries:?}");
        assert!(palette_text.contains("pillar_axis"));
        assert!(palette_text.contains("facing_direction"));
    }

    #[test]
    fn falls_back_unknown_java_blocks_to_loadable_bedrock_state() {
        let mut blocks = BlockStatePosList::default();
        blocks.add(
            BlockPos { x: 0, y: 0, z: 0 },
            Arc::new(BlockData {
                id: BlockId {
                    name: Arc::from("example:modded_block"),
                },
                properties: BTreeMap::new(),
            }),
        );
        let source = SchematicData::new(
            blocks,
            TileEntitiesList::default(),
            EntitiesList::default(),
            Size {
                width: 1,
                height: 1,
                length: 1,
            },
        );
        let root = ToBESchematic::new(&source)
            .expect("build writer")
            .to_be_value()
            .expect("encode unknown block");
        let Value::Compound(structure) = root.get("structure").expect("structure") else {
            panic!("expected structure");
        };
        let Value::Compound(palette) = structure.get("palette").expect("palette") else {
            panic!("expected palette");
        };
        let Value::Compound(default) = palette.get("default").expect("default") else {
            panic!("expected default palette");
        };
        let Value::List(entries) = default.get("block_palette").expect("block palette") else {
            panic!("expected block palette");
        };
        assert!(format!("{entries:?}").contains("minecraft:stone"));
        assert!(!format!("{entries:?}").contains("example:modded_block"));
    }

    #[test]
    fn localizes_block_entity_coordinates_inside_mcstructure_payload() {
        let stone = Arc::new(BlockData {
            id: BlockId {
                name: Arc::from("minecraft:stone"),
            },
            properties: BTreeMap::new(),
        });
        let mut blocks = BlockStatePosList::default();
        blocks.add(
            BlockPos {
                x: 10,
                y: 20,
                z: 30,
            },
            stone,
        );
        let tile_entity = crate::utils::tile_entities::TileEntities {
            pos: BlockPos {
                x: 10,
                y: 20,
                z: 30,
            },
            nbt: Value::Compound(
                [
                    (
                        "id".to_string(),
                        Value::String("minecraft:chest".to_string()),
                    ),
                    ("x".to_string(), Value::Int(110)),
                    ("y".to_string(), Value::Int(220)),
                    ("z".to_string(), Value::Int(330)),
                    ("CustomName".to_string(), Value::String("kept".to_string())),
                ]
                .into_iter()
                .collect(),
            ),
        };
        let source = SchematicData::new(
            blocks,
            TileEntitiesList {
                original_type: 2,
                elements: vec![tile_entity],
            },
            EntitiesList::default(),
            Size {
                width: 1,
                height: 1,
                length: 1,
            },
        );

        let root = ToBESchematic::new(&source)
            .expect("build writer")
            .to_be_value()
            .expect("encode writer");
        let Value::Compound(structure) = root.get("structure").expect("structure") else {
            panic!("expected structure compound");
        };
        let Value::Compound(palette) = structure.get("palette").expect("palette") else {
            panic!("expected palette compound");
        };
        let Value::Compound(default) = palette.get("default").expect("default palette") else {
            panic!("expected default palette");
        };
        let Value::Compound(position_data) = default
            .get("block_position_data")
            .expect("block position data")
        else {
            panic!("expected block position data");
        };
        let Value::Compound(entry) = position_data.get("0").expect("entity entry") else {
            panic!("expected entity entry");
        };
        let Value::Compound(nbt) = entry.get("block_entity_data").expect("entity payload") else {
            panic!("expected entity payload");
        };
        assert_eq!(nbt.get("x"), Some(&Value::Int(0)));
        assert_eq!(nbt.get("y"), Some(&Value::Int(0)));
        assert_eq!(nbt.get("z"), Some(&Value::Int(0)));
        assert_eq!(
            nbt.get("CustomName"),
            Some(&Value::String("kept".to_string()))
        );
    }

    #[test]
    fn localizes_and_marks_java_entities_for_bedrock() {
        let mut blocks = BlockStatePosList::default();
        blocks.add(
            BlockPos {
                x: 10,
                y: 20,
                z: 30,
            },
            Arc::new(BlockData {
                id: BlockId {
                    name: Arc::from("minecraft:stone"),
                },
                properties: BTreeMap::new(),
            }),
        );
        let entity = crate::utils::entities::Entities {
            nbt: Value::Compound(
                [
                    (
                        "id".to_string(),
                        Value::String("minecraft:item".to_string()),
                    ),
                    (
                        "Pos".to_string(),
                        Value::List(vec![
                            Value::Double(10.5),
                            Value::Double(20.0),
                            Value::Double(30.25),
                        ]),
                    ),
                ]
                .into_iter()
                .collect(),
            ),
        };
        let source = SchematicData::new(
            blocks,
            TileEntitiesList::default(),
            EntitiesList {
                original_type: 1,
                elements: vec![entity],
            },
            Size {
                width: 1,
                height: 1,
                length: 1,
            },
        );

        let root = ToBESchematic::new(&source)
            .expect("build writer")
            .to_be_value()
            .expect("encode entity");
        let Value::Compound(structure) = root.get("structure").expect("structure") else {
            panic!("expected structure");
        };
        let Value::List(entities) = structure.get("entities").expect("entities") else {
            panic!("expected entities");
        };
        let Value::Compound(entity) = &entities[0] else {
            panic!("expected entity compound");
        };
        assert_eq!(
            entity.get("identifier"),
            Some(&Value::String("minecraft:item".to_string()))
        );
        assert_eq!(
            entity.get("Pos"),
            Some(&Value::List(vec![
                Value::Double(0.5),
                Value::Double(0.0),
                Value::Double(0.25),
            ]))
        );
    }

    #[test]
    fn writes_fluids_and_waterlogged_blocks_to_the_correct_layers() {
        fn block(name: &str, properties: &[(&str, &str)]) -> Arc<BlockData> {
            Arc::new(BlockData {
                id: BlockId {
                    name: Arc::from(name),
                },
                properties: properties
                    .iter()
                    .map(|(key, value)| (Arc::from(*key), Arc::from(*value)))
                    .collect(),
            })
        }

        let mut blocks = BlockStatePosList::default();
        blocks.add(
            BlockPos { x: 0, y: 0, z: 0 },
            block(
                "minecraft:oak_stairs",
                &[
                    ("facing", "north"),
                    ("half", "bottom"),
                    ("shape", "straight"),
                    ("waterlogged", "true"),
                ],
            ),
        );
        blocks.add(
            BlockPos { x: 1, y: 0, z: 0 },
            block("minecraft:water", &[("level", "0")]),
        );
        blocks.add(
            BlockPos { x: 2, y: 0, z: 0 },
            block(
                "minecraft:bubble_column",
                &[("drag", "true"), ("waterlogged", "true")],
            ),
        );
        blocks.add(
            BlockPos { x: 3, y: 0, z: 0 },
            block("minecraft:kelp_plant", &[]),
        );
        blocks.add(
            BlockPos { x: 4, y: 0, z: 0 },
            block("minecraft:frogspawn", &[]),
        );
        let source = SchematicData::new(
            blocks,
            TileEntitiesList::default(),
            EntitiesList::default(),
            Size {
                width: 5,
                height: 1,
                length: 1,
            },
        );

        let root = ToBESchematic::new(&source)
            .expect("build writer")
            .to_be_value()
            .expect("encode fluids");
        let Value::Compound(structure) = root.get("structure").expect("structure") else {
            panic!("expected structure");
        };
        let Value::Compound(palette) = structure.get("palette").expect("palette") else {
            panic!("expected palette");
        };
        let Value::Compound(default) = palette.get("default").expect("default") else {
            panic!("expected default palette");
        };
        let Value::List(palette_entries) = default.get("block_palette").expect("palette") else {
            panic!("expected block palette");
        };
        for entry in palette_entries {
            let Value::Compound(entry) = entry else {
                panic!("expected palette entry");
            };
            assert_eq!(
                entry.get("version"),
                Some(&Value::Int(BEDROCK_BLOCK_STATE_VERSION))
            );
        }
        let palette_name = |index: &Value| -> &str {
            let Value::Int(index) = index else {
                panic!("palette index")
            };
            let Value::Compound(entry) = &palette_entries[*index as usize] else {
                panic!("palette entry")
            };
            entry
                .get("name")
                .and_then(Value::as_str)
                .expect("palette name")
        };
        let Value::List(layers) = structure.get("block_indices").expect("indices") else {
            panic!("expected layers");
        };
        let Value::List(primary) = &layers[0] else {
            panic!("primary layer")
        };
        let Value::List(liquid) = &layers[1] else {
            panic!("liquid layer")
        };

        assert_eq!(palette_name(&primary[0]), "minecraft:oak_stairs");
        assert_eq!(palette_name(&liquid[0]), "minecraft:water");
        assert_eq!(palette_name(&primary[1]), "minecraft:water");
        assert_eq!(liquid[1], Value::Int(-1));
        assert_eq!(palette_name(&primary[2]), "minecraft:bubble_column");
        assert_eq!(liquid[2], Value::Int(-1));
        assert_eq!(palette_name(&primary[3]), "minecraft:kelp");
        assert_eq!(liquid[3], Value::Int(-1));
        assert_eq!(palette_name(&primary[4]), "minecraft:frog_spawn");
        assert_eq!(liquid[4], Value::Int(-1));

        let decoded = crate::be_schematic::be_schematic::BESchematic {
            nbt: Value::Compound(root),
        }
        .get_blocks_pos()
        .expect("decode fluid layers");
        let find = |x| {
            decoded
                .blocks
                .elements
                .iter()
                .find(|block| block.pos == BlockPos { x, y: 0, z: 0 })
                .expect("decoded block")
        };
        assert_eq!(
            find(0)
                .block
                .properties
                .get("waterlogged")
                .map(AsRef::as_ref),
            Some("true")
        );
        assert_eq!(find(1).block.id.name.as_ref(), "minecraft:water");
        assert_eq!(find(2).block.id.name.as_ref(), "minecraft:bubble_column");
    }

    #[test]
    fn normalizes_legacy_flowing_fluids_without_falling_back_to_stone() {
        fn block(name: &str, level: Option<&str>) -> Arc<BlockData> {
            Arc::new(BlockData {
                id: BlockId {
                    name: Arc::from(name),
                },
                properties: level
                    .map(|level| {
                        [(Arc::<str>::from("level"), Arc::<str>::from(level))]
                            .into_iter()
                            .collect()
                    })
                    .unwrap_or_default(),
            })
        }

        let mut blocks = BlockStatePosList::default();
        blocks.add(
            BlockPos { x: 0, y: 0, z: 0 },
            block("minecraft:flowing_water", Some("7")),
        );
        blocks.add(
            BlockPos { x: 1, y: 0, z: 0 },
            block("minecraft:flowing_lava", None),
        );
        let source = SchematicData::new(
            blocks,
            TileEntitiesList::default(),
            EntitiesList::default(),
            Size {
                width: 2,
                height: 1,
                length: 1,
            },
        );

        let root = ToBESchematic::new(&source)
            .expect("build writer")
            .to_be_value()
            .expect("encode legacy fluids");
        let Value::Compound(structure) = root.get("structure").expect("structure") else {
            panic!("expected structure");
        };
        let Value::Compound(palette) = structure.get("palette").expect("palette") else {
            panic!("expected palette");
        };
        let Value::Compound(default) = palette.get("default").expect("default palette") else {
            panic!("expected default palette");
        };
        let Value::List(entries) = default.get("block_palette").expect("block palette") else {
            panic!("expected block palette");
        };
        let Value::List(layers) = structure.get("block_indices").expect("block indices") else {
            panic!("expected layers");
        };
        let Value::List(primary) = &layers[0] else {
            panic!("expected primary layer");
        };

        let entry_for = |index: &Value| -> &HashMap<String, Value> {
            let Value::Int(index) = index else {
                panic!("expected integer palette index")
            };
            let Value::Compound(entry) = &entries[*index as usize] else {
                panic!("expected palette entry")
            };
            entry
        };
        let water = entry_for(&primary[0]);
        assert_eq!(
            water.get("name"),
            Some(&Value::String("minecraft:flowing_water".to_string()))
        );
        let Value::Compound(water_states) = water.get("states").expect("water states") else {
            panic!("expected water states");
        };
        assert_eq!(water_states.get("liquid_depth"), Some(&Value::Int(7)));

        let lava = entry_for(&primary[1]);
        assert_eq!(
            lava.get("name"),
            Some(&Value::String("minecraft:flowing_lava".to_string()))
        );
        let Value::Compound(lava_states) = lava.get("states").expect("lava states") else {
            panic!("expected lava states");
        };
        assert_eq!(lava_states.get("liquid_depth"), Some(&Value::Int(0)));
    }
}
