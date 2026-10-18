//! Non-destructive edits, backported from new_mcs/mcs-core. Coordinates are relative to a stable preview frame.
use crate::utils::block_state_pos_list::{BlockData, BlockId, BlockPos, BlockStatePosList};
use crate::utils::entities::EntitiesList;
use crate::utils::schematic_data::{SchematicData, Size};
use crate::utils::tile_entities::TileEntitiesList;
use anyhow::{Result, bail, ensure};
use fastnbt::Value;
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

pub const MAX_EDIT_RECORDS: usize = 2_000_000;

#[derive(Debug, Clone, Copy, serde::Serialize)]
pub struct PreviewBounds {
    pub min: [i32; 3],
    pub max: [i32; 3],
}

impl PreviewBounds {
    pub fn size(self) -> Result<Size> {
        let mut dimensions = [0; 3];
        for axis in 0..3 {
            dimensions[axis] = self.max[axis]
                .checked_sub(self.min[axis])
                .and_then(|n| n.checked_add(1))
                .filter(|n| *n > 0)
                .ok_or_else(|| anyhow::anyhow!("edit coordinate overflow"))?;
        }
        Ok(Size {
            width: dimensions[0],
            height: dimensions[1],
            length: dimensions[2],
        })
    }
}

pub fn is_air(id: &str) -> bool {
    matches!(
        id,
        "air" | "minecraft:air" | "minecraft:cave_air" | "minecraft:void_air"
    )
}

pub fn visible_bounds(data: &SchematicData) -> Result<PreviewBounds> {
    let mut result: Option<PreviewBounds> = None;
    for block in &data.blocks.elements {
        if is_air(block.block.id.name.as_ref()) {
            continue;
        }
        let p = coords(block.pos);
        match result.as_mut() {
            Some(bounds) => {
                for axis in 0..3 {
                    bounds.min[axis] = bounds.min[axis].min(p[axis]);
                    bounds.max[axis] = bounds.max[axis].max(p[axis]);
                }
            }
            None => result = Some(PreviewBounds { min: p, max: p }),
        }
    }
    let bounds = result.ok_or_else(|| anyhow::anyhow!("there are no visible blocks to edit"))?;
    bounds.size()?;
    Ok(bounds)
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EditRegion {
    pub min: [i32; 3],
    pub max: [i32; 3],
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum EditOperation {
    Replace {
        original_id: String,
        replacement_id: String,
        region: Option<EditRegion>,
        #[serde(default = "default_preserve")]
        preserve_properties: bool,
    },
    Crop {
        region: EditRegion,
    },
    CropOutside {
        region: EditRegion,
    },
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::entities::Entities;
    use crate::utils::tile_entities::TileEntities;

    fn fixture() -> SchematicData {
        let mut blocks = BlockStatePosList::default();
        let chest = Arc::new(BlockData {
            id: BlockId {
                name: Arc::from("minecraft:chest"),
            },
            properties: [("facing".into(), "north".into())].into(),
        });
        blocks.add_by_pos(-4, 64, -2, Arc::clone(&chest));
        blocks.add_by_pos(-3, 65, -1, chest);
        let nbt = Value::Compound(
            [
                ("x".into(), Value::Int(-4)),
                ("y".into(), Value::Int(64)),
                ("z".into(), Value::Int(-2)),
            ]
            .into(),
        );
        let tiles = TileEntitiesList {
            original_type: 2,
            elements: vec![TileEntities {
                pos: BlockPos {
                    x: -4,
                    y: 64,
                    z: -2,
                },
                nbt,
            }],
        };
        let entity = |x: f64| Entities {
            nbt: Value::Compound(
                [(
                    "Pos".into(),
                    Value::List(vec![
                        Value::Double(x),
                        Value::Double(64.5),
                        Value::Double(-1.5),
                    ]),
                )]
                .into(),
            ),
        };
        SchematicData::new(
            blocks,
            tiles,
            EntitiesList {
                original_type: 2,
                elements: vec![entity(-3.75), entity(-2.75)],
            },
            Size {
                width: 2,
                height: 2,
                length: 2,
            },
        )
    }
    fn bounds() -> Option<PreviewBounds> {
        Some(PreviewBounds {
            min: [-4, 64, -2],
            max: [-3, 65, -1],
        })
    }

    #[test]
    fn replace_is_an_independent_copy_and_removes_incompatible_tile_payloads() {
        let source = fixture();
        let operation = EditOperation::Replace {
            original_id: "minecraft:chest".into(),
            replacement_id: "minecraft:stone".into(),
            region: None,
            preserve_properties: false,
        };
        let edited = edit_copy(&source, bounds(), &operation).unwrap();
        assert!(
            edited
                .blocks
                .elements
                .iter()
                .all(|b| b.block.id.name.as_ref() == "minecraft:stone"
                    && b.block.properties.is_empty())
        );
        assert!(edited.tile_entities_list.elements.is_empty());
        assert_eq!(
            source.blocks.elements[0].block.id.name.as_ref(),
            "minecraft:chest"
        );
        assert_eq!(source.tile_entities_list.elements.len(), 1);
    }

    #[test]
    fn replace_can_be_limited_to_the_selected_region_and_preserve_state() {
        let operation = EditOperation::Replace {
            original_id: "minecraft:chest".into(),
            replacement_id: "minecraft:barrel".into(),
            region: Some(EditRegion {
                min: [1, 1, 1],
                max: [1, 1, 1],
            }),
            preserve_properties: true,
        };
        let edited = edit_copy(&fixture(), bounds(), &operation).unwrap();
        assert_eq!(
            edited.blocks.elements[0].block.id.name.as_ref(),
            "minecraft:chest"
        );
        assert_eq!(
            edited.blocks.elements[1].block.id.name.as_ref(),
            "minecraft:barrel"
        );
        assert_eq!(
            edited.blocks.elements[1]
                .block
                .properties
                .get("facing")
                .unwrap()
                .as_ref(),
            "north"
        );
        assert_eq!(edited.tile_entities_list.elements.len(), 1);
    }

    #[test]
    fn crop_rebases_negative_origins_tiles_and_fractional_entities() {
        let edited = edit_copy(
            &fixture(),
            bounds(),
            &EditOperation::Crop {
                region: EditRegion {
                    min: [0, 0, 0],
                    max: [0, 1, 1],
                },
            },
        )
        .unwrap();
        assert_eq!(coords(edited.blocks.elements[0].pos), [0, 0, 0]);
        assert_eq!(edited.size.width, 1);
        assert_eq!(coords(edited.tile_entities_list.elements[0].pos), [0, 0, 0]);
        let Value::Compound(tile) = &edited.tile_entities_list.elements[0].nbt else {
            panic!()
        };
        assert_eq!(tile.get("y"), Some(&Value::Int(0)));
        assert_eq!(edited.entities_list.elements.len(), 1);
        assert_eq!(
            entity_position(&edited.entities_list.elements[0].nbt),
            Some([0.25, 0.5, 0.5])
        );
    }

    #[test]
    fn crop_rejects_out_of_bounds_and_empty_selections() {
        for region in [
            EditRegion {
                min: [-1, 0, 0],
                max: [0, 0, 0],
            },
            EditRegion {
                min: [0, 0, 0],
                max: [2, 1, 1],
            },
            EditRegion {
                min: [1, 0, 0],
                max: [1, 0, 0],
            },
        ] {
            assert!(edit_copy(&fixture(), bounds(), &EditOperation::Crop { region }).is_err());
        }
    }

    #[test]
    fn shifts_nested_passengers_hanging_anchors_and_rejects_overflow() {
        let mut entity = Value::Compound(
            [
                ("TileX".into(), Value::Int(-4)),
                (
                    "Passengers".into(),
                    Value::List(vec![Value::Compound(
                        [(
                            "Pos".into(),
                            Value::List(vec![
                                Value::Double(-3.75),
                                Value::Double(64.5),
                                Value::Double(-1.5),
                            ]),
                        )]
                        .into(),
                    )]),
                ),
            ]
            .into(),
        );
        shift_position(&mut entity, [-4, 64, -2]).unwrap();
        let Value::Compound(root) = entity else {
            panic!()
        };
        assert_eq!(root.get("TileX"), Some(&Value::Int(0)));
        let Value::List(passengers) = root.get("Passengers").unwrap() else {
            panic!()
        };
        assert_eq!(entity_position(&passengers[0]), Some([0.25, 0.5, 0.5]));
        let mut malformed = Value::Compound([("x".into(), Value::Int(i32::MAX))].into());
        assert!(shift_position(&mut malformed, [-1, 0, 0]).is_err());
        assert!(
            PreviewBounds {
                min: [i32::MIN, 0, 0],
                max: [i32::MAX, 0, 0]
            }
            .size()
            .is_err()
        );
    }

    #[test]
    fn crop_outside_does_not_pull_explicit_padding_into_the_new_frame() {
        let mut source = fixture();
        source.blocks.add_by_pos(
            i32::MIN,
            0,
            0,
            Arc::new(BlockData {
                id: BlockId {
                    name: "minecraft:air".into(),
                },
                properties: Default::default(),
            }),
        );
        let output = edit_copy(
            &source,
            bounds(),
            &EditOperation::CropOutside {
                region: EditRegion {
                    min: [0, 0, 0],
                    max: [0, 1, 1],
                },
            },
        )
        .unwrap();
        assert_eq!(output.blocks.elements.len(), 1);
        assert_eq!(coords(output.blocks.elements[0].pos), [1, 1, 1]);
    }

    #[test]
    fn crop_complement_keeps_its_frame_and_excludes_tiles_and_entities_inside() {
        let source = fixture();
        let region = EditRegion {
            min: [0, 0, 0],
            max: [0, 1, 1],
        };
        let inner = edit_copy(
            &source,
            bounds(),
            &EditOperation::Crop {
                region: region.clone(),
            },
        )
        .unwrap();
        let outer = edit_copy(&source, bounds(), &EditOperation::CropOutside { region }).unwrap();
        assert_eq!(
            inner.blocks.elements.len() + outer.blocks.elements.len(),
            source.blocks.elements.len(),
        );
        assert_eq!(coords(outer.blocks.elements[0].pos), [1, 1, 1]);
        assert_eq!(outer.size.width, 2);
        assert!(outer.tile_entities_list.elements.is_empty());
        assert_eq!(outer.entities_list.elements.len(), 1);
        assert_eq!(
            entity_position(&outer.entities_list.elements[0].nbt),
            Some([1.25, 0.5, 0.5]),
        );
        assert_eq!(source.tile_entities_list.elements.len(), 1);
        assert!(
            edit_copy(
                &source,
                bounds(),
                &EditOperation::CropOutside {
                    region: EditRegion {
                        min: [0, 0, 0],
                        max: [1, 1, 1],
                    },
                },
            )
            .is_err()
        );
    }

    #[test]
    fn malformed_ids_and_unlocatable_entities_are_rejected() {
        let operation = EditOperation::Replace {
            original_id: "minecraft:chest".into(),
            replacement_id: "bad ID".into(),
            region: None,
            preserve_properties: true,
        };
        assert!(edit_copy(&fixture(), bounds(), &operation).is_err());
        let mut source = fixture();
        source.entities_list.elements.push(Entities {
            nbt: Value::Compound(HashMap::new()),
        });
        assert!(
            edit_copy(
                &source,
                bounds(),
                &EditOperation::Crop {
                    region: EditRegion {
                        min: [0, 0, 0],
                        max: [1, 1, 1]
                    }
                }
            )
            .is_err()
        );
    }
}
fn default_preserve() -> bool {
    true
}
fn coords(pos: BlockPos) -> [i32; 3] {
    [pos.x, pos.y, pos.z]
}
fn inside(point: [i32; 3], min: [i32; 3], max: [i32; 3]) -> bool {
    (0..3).all(|axis| point[axis] >= min[axis] && point[axis] <= max[axis])
}
fn valid_id(id: &str) -> bool {
    if id.len() > 160 {
        return false;
    }
    let Some((namespace, path)) = id.split_once(':') else {
        return false;
    };
    !namespace.is_empty()
        && !path.is_empty()
        && namespace
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b"_.-".contains(&b))
        && path
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b"_./-".contains(&b))
}

fn absolute_region(region: &EditRegion, bounds: PreviewBounds) -> Result<([i32; 3], [i32; 3])> {
    let mut min = [0; 3];
    let mut max = [0; 3];
    for axis in 0..3 {
        let length = i64::from(bounds.max[axis]) - i64::from(bounds.min[axis]) + 1;
        ensure!(
            region.min[axis] >= 0
                && region.max[axis] >= region.min[axis]
                && i64::from(region.max[axis]) < length,
            "edit region is outside the visible structure"
        );
        min[axis] = bounds.min[axis]
            .checked_add(region.min[axis])
            .ok_or_else(|| anyhow::anyhow!("edit coordinate overflow"))?;
        max[axis] = bounds.min[axis]
            .checked_add(region.max[axis])
            .ok_or_else(|| anyhow::anyhow!("edit coordinate overflow"))?;
    }
    Ok((min, max))
}

pub(crate) fn shift_position(value: &mut Value, offset: [i32; 3]) -> Result<()> {
    shift_position_at_depth(value, offset, 0)
}

fn shift_position_at_depth(value: &mut Value, offset: [i32; 3], depth: usize) -> Result<()> {
    ensure!(depth < 32, "entity nesting exceeds edit limit");
    if let Value::Compound(root) = value {
        for key in ["Pos", "pos", "blockPos"] {
            if let Some(value) = root.get_mut(key) {
                match value {
                    Value::List(values) if values.len() == 3 => {
                        for (item, delta) in values.iter_mut().zip(offset) {
                            match item {
                                Value::Int(v) => {
                                    *v = v.checked_sub(delta).ok_or_else(|| {
                                        anyhow::anyhow!("edit coordinate overflow")
                                    })?
                                }
                                Value::Long(v) => {
                                    *v = v.checked_sub(i64::from(delta)).ok_or_else(|| {
                                        anyhow::anyhow!("edit coordinate overflow")
                                    })?
                                }
                                Value::Double(v) => {
                                    *v -= f64::from(delta);
                                    ensure!(v.is_finite(), "nonfinite entity position");
                                }
                                Value::Float(v) => {
                                    *v -= delta as f32;
                                    ensure!(v.is_finite(), "nonfinite entity position");
                                }
                                _ => bail!("entity position cannot be shifted safely"),
                            }
                        }
                    }
                    Value::IntArray(values) if values.len() == 3 => {
                        let shifted: Result<Vec<i32>> = values
                            .iter()
                            .zip(offset)
                            .map(|(v, d)| {
                                v.checked_sub(d)
                                    .ok_or_else(|| anyhow::anyhow!("edit coordinate overflow"))
                            })
                            .collect();
                        *value = Value::IntArray(fastnbt::IntArray::new(shifted?));
                    }
                    _ => bail!("entity position cannot be shifted safely"),
                }
            }
        }
        // Hanging entities and sleeping mobs have block anchors in addition to
        // their fractional Pos. Move these with the document, not independently.
        for keys in [
            ["x", "y", "z"],
            ["X", "Y", "Z"],
            ["TileX", "TileY", "TileZ"],
            ["SleepingX", "SleepingY", "SleepingZ"],
        ] {
            for (key, delta) in keys.into_iter().zip(offset) {
                if let Some(value) = root.get_mut(key) {
                    let shifted = match value {
                        Value::Byte(v) => i64::from(*v),
                        Value::Short(v) => i64::from(*v),
                        Value::Int(v) => i64::from(*v),
                        Value::Long(v) => *v,
                        _ => bail!("entity block anchor cannot be shifted safely"),
                    }
                    .checked_sub(i64::from(delta))
                    .ok_or_else(|| anyhow::anyhow!("edit coordinate overflow"))?;
                    *value = match value {
                        Value::Byte(_) => Value::Byte(i8::try_from(shifted)?),
                        Value::Short(_) => Value::Short(i16::try_from(shifted)?),
                        Value::Int(_) => Value::Int(i32::try_from(shifted)?),
                        Value::Long(_) => Value::Long(shifted),
                        _ => unreachable!(),
                    };
                }
            }
        }
        for key in ["nbt", "Leash", "Riding"] {
            if let Some(nested) = root.get_mut(key) {
                shift_position_at_depth(nested, offset, depth + 1)?;
            }
        }
        if let Some(Value::List(passengers)) = root.get_mut("Passengers") {
            for passenger in passengers {
                shift_position_at_depth(passenger, offset, depth + 1)?;
            }
        }
    }
    Ok(())
}
pub(crate) fn entity_position(value: &Value) -> Option<[f64; 3]> {
    let Value::Compound(root) = value else {
        return None;
    };
    if let Some(Value::List(values)) = root.get("pos").or_else(|| root.get("Pos")) {
        if values.len() != 3 {
            return None;
        }
        let mut pos = [0.0; 3];
        for (axis, value) in values.iter().enumerate() {
            pos[axis] = match value {
                Value::Byte(v) => f64::from(*v),
                Value::Short(v) => f64::from(*v),
                Value::Double(v) => *v,
                Value::Float(v) => f64::from(*v),
                Value::Int(v) => f64::from(*v),
                Value::Long(v) => *v as f64,
                _ => return None,
            };
        }
        return pos.iter().all(|v| v.is_finite()).then_some(pos);
    }
    if let Some(Value::IntArray(values)) = root.get("pos").or_else(|| root.get("Pos")) {
        if values.len() == 3 {
            return Some([
                f64::from(values[0]),
                f64::from(values[1]),
                f64::from(values[2]),
            ]);
        }
    }
    root.get("nbt").and_then(entity_position)
}

pub fn edit_copy(
    source: &SchematicData,
    bounds: Option<PreviewBounds>,
    operation: &EditOperation,
) -> Result<SchematicData> {
    let bounds = bounds.ok_or_else(|| anyhow::anyhow!("there are no visible blocks to edit"))?;
    bounds.size()?;
    match operation {
        EditOperation::Replace {
            original_id,
            replacement_id,
            region,
            preserve_properties,
        } => {
            ensure!(
                valid_id(original_id) && valid_id(replacement_id),
                "invalid replacement block ID"
            );
            ensure!(
                original_id != replacement_id,
                "replacement IDs are identical"
            );
            ensure!(
                source.blocks.elements.len() <= MAX_EDIT_RECORDS,
                "preview replacement limit is 2000000 records; crop a smaller region first"
            );
            let selected = region
                .as_ref()
                .map(|region| absolute_region(region, bounds))
                .transpose()?;
            let mut output = source.clone();
            let mut changed = HashSet::new();
            let mut palette = HashMap::new();
            for block in &mut output.blocks.elements {
                if block.block.id.name.as_ref() != original_id
                    || selected.is_some_and(|(min, max)| !inside(coords(block.pos), min, max))
                {
                    continue;
                }
                let replacement = palette.entry(Arc::clone(&block.block)).or_insert_with(|| {
                    Arc::new(BlockData {
                        id: BlockId {
                            name: Arc::from(replacement_id.as_str()),
                        },
                        properties: if *preserve_properties {
                            block.block.properties.clone()
                        } else {
                            Default::default()
                        },
                    })
                });
                block.block = Arc::clone(replacement);
                changed.insert(coords(block.pos));
            }
            ensure!(
                !changed.is_empty(),
                "selected region contains no matching blocks"
            );
            // A chest's payload must not be attached to a replacement stone block.
            output
                .tile_entities_list
                .elements
                .retain(|tile| !changed.contains(&coords(tile.pos)));
            Ok(output)
        }
        EditOperation::Crop { region } | EditOperation::CropOutside { region } => {
            let (min, max) = absolute_region(region, bounds)?;
            let keep_inside = matches!(operation, EditOperation::Crop { .. });
            // The complement keeps the original frame; the excluded cuboid becomes air.
            let origin = if keep_inside { min } else { bounds.min };
            let end = if keep_inside { max } else { bounds.max };
            let mut blocks = BlockStatePosList::default();
            for block in &source.blocks.elements {
                // Explicit padding air outside the visible frame must not
                // reappear at negative coordinates in a complementary crop.
                if !inside(coords(block.pos), bounds.min, bounds.max) {
                    continue;
                }
                if inside(coords(block.pos), min, max) != keep_inside {
                    continue;
                }
                ensure!(
                    blocks.elements.len() < MAX_EDIT_RECORDS,
                    "preview crop result exceeds 2000000 records"
                );
                blocks.add_by_pos(
                    block.pos.x - origin[0],
                    block.pos.y - origin[1],
                    block.pos.z - origin[2],
                    Arc::clone(&block.block),
                );
            }
            ensure!(
                blocks.elements.iter().any(|block| !matches!(
                    block.block.id.name.as_ref(),
                    "minecraft:air" | "minecraft:cave_air" | "minecraft:void_air"
                )),
                if keep_inside {
                    "selected crop has no visible blocks"
                } else {
                    "outside crop has no visible blocks"
                }
            );
            let mut tiles = TileEntitiesList {
                original_type: source.tile_entities_list.original_type,
                elements: Vec::new(),
            };
            for tile in &source.tile_entities_list.elements {
                if !inside(coords(tile.pos), bounds.min, bounds.max) {
                    continue;
                }
                if inside(coords(tile.pos), min, max) != keep_inside {
                    continue;
                }
                let mut tile = tile.clone();
                tile.pos = BlockPos {
                    x: tile.pos.x - origin[0],
                    y: tile.pos.y - origin[1],
                    z: tile.pos.z - origin[2],
                };
                shift_position(&mut tile.nbt, origin)?;
                tiles.elements.push(tile);
            }
            let mut entities = EntitiesList {
                original_type: source.entities_list.original_type,
                elements: Vec::new(),
            };
            for entity in &source.entities_list.elements {
                let Some(position) = entity_position(&entity.nbt) else {
                    bail!("entity position cannot be determined safely for cropping")
                };
                let within = (0..3).all(|axis| {
                    position[axis] >= f64::from(min[axis])
                        && position[axis] < f64::from(max[axis]) + 1.0
                });
                let in_frame = (0..3).all(|axis| {
                    position[axis] >= f64::from(bounds.min[axis])
                        && position[axis] < f64::from(bounds.max[axis]) + 1.0
                });
                if !in_frame {
                    continue;
                }
                if within != keep_inside {
                    continue;
                }
                let mut entity = entity.clone();
                shift_position(&mut entity.nbt, origin)?;
                entities.elements.push(entity);
            }
            Ok(SchematicData::new(
                blocks,
                tiles,
                entities,
                Size {
                    width: end[0] - origin[0] + 1,
                    height: end[1] - origin[1] + 1,
                    length: end[2] - origin[2] + 1,
                },
            ))
        }
    }
}
