use crate::data_files::files::FileManager;
use crate::database::db_apis::schematics_api::find_schematic;
use crate::database::db_control::DatabaseState;
use anyhow::{anyhow, bail, ensure};
use fastnbt::Value;
use fastnbt::Value::{Compound, Int, List, String as NbtString};
use std::collections::HashMap;
use tauri::State;

fn get_compound<'a>(
	map: &'a HashMap<String, Value>,
	key: &str,
) -> anyhow::Result<&'a HashMap<String, Value>> {
	map.get(key)
		.and_then(|value| match value {
			Compound(compound) => Some(compound),
			_ => None,
		})
		.ok_or_else(|| anyhow!("missing or invalid compound: {}", key))
}

fn get_list<'a>(map: &'a HashMap<String, Value>, key: &str) -> anyhow::Result<&'a Vec<Value>> {
	map.get(key)
		.and_then(|value| match value {
			List(list) => Some(list),
			_ => None,
		})
		.ok_or_else(|| anyhow!("missing or invalid list: {}", key))
}

fn is_air_palette_entry(value: &Value) -> bool {
	matches!(
		value,
		Compound(entry) if matches!(entry.get("name"), Some(NbtString(name)) if name == "minecraft:air")
	)
}

fn has_air_in_be(data: &Value) -> anyhow::Result<bool> {
	let Compound(root) = data else {
		bail!("BE schematic root must be a compound");
	};

	let structure = get_compound(root, "structure")?;
	let palette = get_compound(structure, "palette")?;
	let default = get_compound(palette, "default")?;
	let block_palette = get_list(default, "block_palette")?;

	let air_indices: Vec<usize> = block_palette
		.iter()
		.enumerate()
		.filter_map(|(index, block)| is_air_palette_entry(block).then_some(index))
		.collect();

	if air_indices.is_empty() {
		return Ok(false);
	}

	let block_indices = get_list(structure, "block_indices")?;
	for layer in block_indices {
		let List(values) = layer else {
			bail!("block_indices layer must be a list");
		};

		if values.iter().any(|value| matches!(value, Int(state_id) if *state_id >= 0 && air_indices.contains(&(*state_id as usize)))) {
			return Ok(true);
		}
	}

	Ok(false)
}

fn get_compound_mut<'a>(
	map: &'a mut HashMap<String, Value>,
	key: &str,
) -> anyhow::Result<&'a mut HashMap<String, Value>> {
	map.get_mut(key)
		.and_then(|value| match value {
			Compound(compound) => Some(compound),
			_ => None,
		})
		.ok_or_else(|| anyhow!("missing or invalid compound: {}", key))
}

fn get_list_mut<'a>(
	map: &'a mut HashMap<String, Value>,
	key: &str,
) -> anyhow::Result<&'a mut Vec<Value>> {
	map.get_mut(key)
		.and_then(|value| match value {
			List(list) => Some(list),
			_ => None,
		})
		.ok_or_else(|| anyhow!("missing or invalid list: {}", key))
}

fn clear_air_from_be(data: &mut Value) -> anyhow::Result<()> {
	let Compound(root) = data else {
		bail!("BE schematic root must be a compound");
	};

	let structure = get_compound_mut(root, "structure")?;
	let palette = get_compound_mut(structure, "palette")?;
	let default = get_compound_mut(palette, "default")?;
	let block_palette = get_list_mut(default, "block_palette")?;

	let old_palette = std::mem::take(block_palette);
	let mut remap = vec![None; old_palette.len()];
	let mut new_palette = Vec::with_capacity(old_palette.len());

	for (index, block) in old_palette.into_iter().enumerate() {
		if is_air_palette_entry(&block) {
			continue;
		}

		remap[index] = Some(new_palette.len() as i32);
		new_palette.push(block);
	}

	*block_palette = new_palette;

	if remap.iter().all(Option::is_some) {
		return Ok(());
	}

	let block_indices = get_list_mut(structure, "block_indices")?;
	for layer in block_indices.iter_mut() {
		let List(values) = layer else {
			bail!("block_indices layer must be a list");
		};

		for value in values.iter_mut() {
			let Int(state_id) = value else {
				continue;
			};

			if *state_id < 0 {
				continue;
			}

			let palette_index = *state_id as usize;
			ensure!(
				palette_index < remap.len(),
				"invalid block index in block_indices: {}",
				state_id
			);

			*state_id = remap[palette_index].unwrap_or(-1);
		}
	}

	Ok(())
}

#[tauri::command]
pub async fn be_has_air(
	db: State<'_, DatabaseState>,
	file_manager: State<'_, FileManager>,
	id: i64,
) -> anyhow::Result<bool, String> {
	async move {
		let mut conn = db.0.get()?;
		let schematic = find_schematic(&mut conn, id)?;
		let version = schematic.version;
		let sub_version = schematic.sub_type;
		let v_type = schematic.schematic_type;

		ensure!(v_type == 5, "be_has_air only supports BE schematics");

		let data = file_manager.get_schematic_value(id, version, sub_version, v_type)?;
		has_air_in_be(&data)
	}
	.await
	.map_err(|e: anyhow::Error| e.to_string())
}

#[tauri::command]
pub async fn be_clear_air(
	db: State<'_, DatabaseState>,
	file_manager: State<'_, FileManager>,
	id: i64,
) -> anyhow::Result<bool, String> {
	async move {
		let mut conn = db.0.get()?;
		let schematic = find_schematic(&mut conn, id)?;
		let version = schematic.version;
		let sub_version = schematic.sub_type;
		let v_type = schematic.schematic_type;

		ensure!(v_type == 5, "be_clear_air only supports BE schematics");

		let mut data = file_manager.get_schematic_value(id, version, sub_version, v_type)?;
		clear_air_from_be(&mut data)?;

		let Compound(root) = data else {
			bail!("BE schematic root must be a compound");
		};

		file_manager.save_nbt_le_value(id, root, version, sub_version, v_type)?;
		Ok(true)
	}
	.await
	.map_err(|e: anyhow::Error| e.to_string())
}
