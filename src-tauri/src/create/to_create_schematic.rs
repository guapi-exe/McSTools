use crate::utils::block_state_pos_list::{BlockData, BlockPos, BlockStatePos};
use crate::utils::entities::EntitiesList;
use crate::utils::schematic_data::{SchematicData, SchematicError};
use crate::utils::tile_entities::{TileEntities, TileEntitiesList};
use anyhow::Result;
use fastnbt::Value;
use fastnbt::Value::Compound;
use rayon::iter::IntoParallelRefIterator;
use rayon::iter::ParallelIterator;
use std::collections::{HashMap, VecDeque};
use std::sync::Arc;

#[derive(Debug)]
pub struct ToCreateSchematic {
    blocks: VecDeque<BlockStatePos>,
    start_pos: BlockPos,
    end_pos: BlockPos,
    width: i32,
    height: i32,
    length: i32,
    pub unique_block_states: Vec<Arc<BlockData>>,
    pub block_state_to_index: HashMap<Arc<BlockData>, usize>,
    pub tile_entities: TileEntitiesList,
    pub entities: EntitiesList,
}

impl ToCreateSchematic {
    pub fn new(schematic: &SchematicData) -> Result<Self, SchematicError> {
        let blocks = schematic.blocks.elements.clone();
        if blocks.is_empty() {
            return Err(SchematicError::InvalidFormat("Block list cannot be empty"));
        }
        let (min_position, max_position) = blocks.iter().fold(
            (
                BlockPos {
                    x: i32::MAX,
                    y: i32::MAX,
                    z: i32::MAX,
                },
                BlockPos {
                    x: i32::MIN,
                    y: i32::MIN,
                    z: i32::MIN,
                },
            ),
            |(mut min, mut max), block| {
                min.x = min.x.min(block.pos.x);
                min.y = min.y.min(block.pos.y);
                min.z = min.z.min(block.pos.z);
                max.x = max.x.max(block.pos.x);
                max.y = max.y.max(block.pos.y);
                max.z = max.z.max(block.pos.z);
                (min, max)
            },
        );

        let size = schematic.size;
        let has_source_size = size.width > 0 && size.height > 0 && size.length > 0;
        // Create/WorldEdit/Bedrock schematics normally use coordinates relative
        // to the selection origin. Preserve leading air in that coordinate
        // space when a sparse block list omits the empty positions. Litematica
        // regions can have negative positions, so those continue to use their
        // actual minimum coordinate as the origin.
        let use_zero_origin = has_source_size
            && min_position.x >= 0
            && min_position.y >= 0
            && min_position.z >= 0
            && max_position.x < size.width
            && max_position.y < size.height
            && max_position.z < size.length;
        let min = if use_zero_origin {
            BlockPos { x: 0, y: 0, z: 0 }
        } else {
            min_position
        };
        let size_max = if has_source_size {
            Some(BlockPos {
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
            })
        } else {
            None
        };
        let max = size_max.map_or(max_position, |size_max| BlockPos {
            x: max_position.x.max(size_max.x),
            y: max_position.y.max(size_max.y),
            z: max_position.z.max(size_max.z),
        });
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
            let mut index_map = HashMap::new();
            let mut unique = Vec::new();

            for block_pos in blocks.iter() {
                let block_data = &block_pos.block;
                if let std::collections::hash_map::Entry::Vacant(e) =
                    index_map.entry(block_data.clone())
                {
                    let index = unique.len();
                    unique.push(block_data.clone());
                    e.insert(index);
                }
            }

            (unique, index_map)
        };
        let mut tile_entities = schematic.tile_entities_list.clone();
        for tile in &mut tile_entities.elements {
            let (id, mut data) = crate::utils::java_entities::java_entity_data(
                &tile.nbt,
                tile_entities.original_type,
            )?;
            for key in ["x", "y", "z", "Pos"] {
                data.remove(key);
            }
            data.insert("id".into(), Value::String(id));
            tile.nbt = Compound(data);
        }
        let entities = crate::utils::java_entities::local_java_entities(
            &schematic.entities_list,
            [min.x, min.y, min.z],
        )?;

        Ok(Self {
            blocks,
            start_pos: min,
            end_pos: max,
            width,
            height,
            length,
            unique_block_states,
            block_state_to_index,
            tile_entities,
            entities,
        })
    }

    pub fn create_palette(&self) -> Value {
        let mut palette = Vec::new();

        for block in &self.unique_block_states {
            let mut compound = HashMap::new();
            compound.insert("Name".to_string(), Value::String(block.id.name.to_string()));

            if !block.properties.is_empty() {
                let mut props = HashMap::new();
                for (k, v) in &block.properties {
                    props.insert(k.to_string(), Value::String(v.to_string()));
                }
                compound.insert("Properties".to_string(), Compound(props));
            }

            palette.push(Compound(compound));
        }

        Value::List(palette)
    }
    fn build_entities_list(&self) -> Vec<Value> {
        self.entities
            .elements
            .iter()
            .map(|entity| {
                let Compound(data) = &entity.nbt else {
                    unreachable!("constructor validates entity compounds")
                };
                let position = data
                    .get("Pos")
                    .expect("constructor validates entity positions")
                    .clone();
                let coordinates = crate::utils::schematic_editing::entity_position(&entity.nbt)
                    .expect("validated position");
                let mut nbt = data.clone();
                nbt.remove("Pos");
                Compound(HashMap::from([
                    ("pos".into(), position),
                    (
                        "blockPos".into(),
                        Value::List(
                            coordinates
                                .into_iter()
                                .map(|n| Value::Int(n.floor() as i32))
                                .collect(),
                        ),
                    ),
                    ("nbt".into(), Compound(nbt)),
                ]))
            })
            .collect()
    }
    pub fn create_blocks(&self, air: bool) -> Value {
        let tile_entity_map: HashMap<(i32, i32, i32), &TileEntities> = self
            .tile_entities
            .elements
            .iter()
            .map(|te| ((te.pos.x, te.pos.y, te.pos.z), te))
            .collect();
        let block_list: Vec<Value> = self
            .blocks
            .par_iter()
            .filter_map(|block_pos| {
                let data = (*block_pos.block).clone();
                if data.id.name.to_string() == "minecraft:air" && !air {
                    return None;
                }

                let state_id = self
                    .block_state_to_index
                    .get(&data)
                    .expect("Block state not found in palette");

                let pos = Value::List(vec![
                    Value::Int(block_pos.pos.x - self.start_pos.x),
                    Value::Int(block_pos.pos.y - self.start_pos.y),
                    Value::Int(block_pos.pos.z - self.start_pos.z),
                ]);

                let mut block_tag = HashMap::new();
                block_tag.insert("state".to_string(), Value::Int(*state_id as i32));
                block_tag.insert("pos".to_string(), pos);
                if let Some(tile_entity) =
                    tile_entity_map.get(&(block_pos.pos.x, block_pos.pos.y, block_pos.pos.z))
                {
                    block_tag.insert("nbt".to_string(), tile_entity.nbt.clone());
                }
                Some(Compound(block_tag))
            })
            .collect();

        Value::List(block_list)
    }

    pub fn create_schematic(&self, air: bool) -> Value {
        self.create_schematic_for_data_version(air, 3465)
    }

    pub fn create_schematic_for_data_version(&self, air: bool, data_version: i32) -> Value {
        let mut tag = HashMap::new();

        let size = Value::List(vec![
            Value::Int(self.width),
            Value::Int(self.height),
            Value::Int(self.length),
        ]);
        tag.insert("size".to_string(), size);
        tag.insert("blocks".to_string(), self.create_blocks(air));
        tag.insert("palette".to_string(), self.create_palette());
        tag.insert(
            "entities".to_string(),
            Value::List(self.build_entities_list()),
        );
        tag.insert("DataVersion".to_string(), Value::Int(data_version)); // 你说的对别问我这里为什么写固定值

        Compound(tag)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::entities::EntitiesList;
    use crate::utils::schematic_data::Size;
    use crate::utils::tile_entities::TileEntitiesList;
    use std::collections::BTreeMap;

    fn stone() -> Arc<BlockData> {
        Arc::new(BlockData {
            id: crate::utils::block_state_pos_list::BlockId {
                name: Arc::<str>::from("minecraft:stone"),
            },
            properties: BTreeMap::new(),
        })
    }

    #[test]
    fn emits_declared_selection_size_without_an_extra_block() {
        let mut blocks = VecDeque::new();
        blocks.push_back(BlockStatePos {
            pos: BlockPos { x: 2, y: 1, z: 0 },
            block: stone(),
        });
        let source = SchematicData::new(
            crate::utils::block_state_pos_list::BlockStatePosList { elements: blocks },
            TileEntitiesList::new(),
            EntitiesList::new(),
            Size {
                width: 3,
                height: 2,
                length: 1,
            },
        );

        let writer = ToCreateSchematic::new(&source).unwrap();
        assert_eq!((writer.width, writer.height, writer.length), (3, 2, 1));
        let Compound(root) = writer.create_schematic(false) else {
            panic!("expected compound");
        };
        assert_eq!(
            root.get("size"),
            Some(&Value::List(vec![
                Value::Int(3),
                Value::Int(2),
                Value::Int(1)
            ]))
        );
        assert_eq!(root.get("DataVersion"), Some(&Value::Int(3465)));
        let target_root = match writer.create_schematic_for_data_version(false, 1631) {
            Compound(root) => root,
            _ => panic!("expected compound"),
        };
        assert_eq!(target_root.get("DataVersion"), Some(&Value::Int(1631)));
    }
}
