use crate::be_schematic::to_be_schematic::ToBESchematic;
use crate::building_gadges::to_bg_schematic::ToBgSchematic;
use crate::create::to_create_schematic::ToCreateSchematic;
use crate::data_files::files::FileManager;
use crate::database::db_apis::schematics_api::{find_schematic, update_schematic_lm_version};
use crate::database::db_control::DatabaseState;
use crate::litematica::to_lm_schematic::ToLmSchematic;
use crate::mcedit::legacy_map::normalize_schematic_for_legacy;
use crate::mcedit::to_mcedit_schematic::ToMcEditSchematic;
use crate::modules::modules_data::convert_data::ConvertData;
use crate::utils::minecraft_data::java_block_states::{
    data_version as java_data_version, normalize_schematic_for_java,
};
use crate::utils::minecraft_data::je_blocks_data::{BlocksData, SubData};
use crate::utils::minecraft_data::map_art_data::{BlockColorData, MapArtsData};
use crate::utils::minecraft_data::versions_data::VersionData;
use crate::word_edit::to_we_schematic::ToWeSchematic;
use fastnbt::Value::Compound;
use std::collections::HashMap;
use tauri::State;

#[tauri::command]
pub async fn get_schematic_convert_data(
    db: State<'_, DatabaseState>,
    file_manager: State<'_, FileManager>,
    id: i64,
) -> anyhow::Result<ConvertData, String> {
    async move {
        let mut conn = db.0.get()?;
        let schematic = find_schematic(&mut conn, id)?;
        let version = schematic.version;
        let sub_version = schematic.sub_type;
        let v_type = schematic.schematic_type;
        let data = file_manager.get_convert_data(id, version, sub_version, v_type)?;
        Ok(data)
    }
    .await
    .map_err(|e: anyhow::Error| e.to_string())
}

#[tauri::command]
pub async fn get_je_blocks(
    je_blocks: State<'_, BlocksData>,
) -> anyhow::Result<Vec<SubData>, String> {
    async move {
        let data = je_blocks.blocks.clone();
        Ok(data)
    }
    .await
    .map_err(|e: anyhow::Error| e.to_string())
}

#[tauri::command]
pub async fn get_map_arts(
    map_arts: State<'_, MapArtsData>,
) -> anyhow::Result<HashMap<String, HashMap<String, BlockColorData>>, String> {
    async move {
        let data = map_arts.categories.clone();
        Ok(data)
    }
    .await
    .map_err(|e: anyhow::Error| e.to_string())
}

#[tauri::command]
pub async fn convert(
    db: State<'_, DatabaseState>,
    file_manager: State<'_, FileManager>,
    versions_data: State<'_, VersionData>,
    id: i64,
    schematic_type: i64,
    lm_version: i64,
    we_version: i64,
    bg_version: i64,
    je_version: String,
    legacy_version: String,
    vi_air: bool,
) -> anyhow::Result<bool, String> {
    async move {
        if !(1..=6).contains(&schematic_type) {
            anyhow::bail!("unknown schematic type: {schematic_type}");
        }
        if schematic_type == 2 && !matches!(lm_version, 3..=7) {
            anyhow::bail!("unsupported Litematica format version: {lm_version}");
        }
        if schematic_type == 3 && !matches!(we_version, 0..=1) {
            anyhow::bail!("unsupported WorldEdit format version: {we_version}");
        }
        if schematic_type == 4 && !matches!(bg_version, 0..=2) {
            anyhow::bail!("unsupported Builder Helper format version: {bg_version}");
        }

        let mut conn = db.0.get()?;
        let schematic = find_schematic(&mut conn, id)?;
        let version = schematic.version;
        let sub_version = schematic.sub_type;
        let v_type = schematic.schematic_type;
        let data = file_manager.get_schematic_data(id, version, sub_version, v_type)?;
        let target_java_version = if je_version.trim().is_empty() {
            "1.20.4".to_string()
        } else {
            je_version
        };
        let target_legacy_version = if legacy_version.trim().is_empty() {
            "1.7.10".to_string()
        } else {
            legacy_version
        };
        let (java_data, java_data_version) = if matches!(schematic_type, 1..=4) {
            let format_sub_version = if schematic_type == 3 { we_version as i32 } else { -1 };
            let supported_versions = versions_data
                .game_versions_for_format(schematic_type as i32, format_sub_version)
                .into_iter()
                .filter(|version| java_data_version(&version.name).is_some())
                .collect::<Vec<_>>();
            if !supported_versions
                .iter()
                .any(|version| version.name == target_java_version)
            {
                anyhow::bail!(
                    "Java target version {target_java_version} is not supported by schematic type {schematic_type}"
                );
            }
            let data_version = java_data_version(&target_java_version).ok_or_else(|| {
                anyhow::anyhow!("Java target version {target_java_version} has no bundled block-state table")
            })?;
            (
                normalize_schematic_for_java(&target_java_version, &data)?,
                data_version,
            )
        } else {
            (data.clone(), 0)
        };
        match schematic_type {
            1 => {
                let data = ToCreateSchematic::new(&java_data)?
                    .create_schematic_for_data_version(vi_air, java_data_version);
                file_manager.save_nbt_value(id, data, version, -1, schematic_type as i32, true)?;
            }
            2 => {
                let data = ToLmSchematic::new(&java_data)?
                    .lm_schematic_for_data_version(lm_version as i32, java_data_version);
                file_manager.save_nbt_value(id, data, version, -1, schematic_type as i32, true)?;
            }
            3 => {
                let data = ToWeSchematic::new(&java_data)?
                    .we_schematic_for_data_version(we_version as i32, java_data_version)?;
                file_manager.save_nbt_value(
                    id,
                    data,
                    version,
                    we_version as i32,
                    schematic_type as i32,
                    true,
                )?;
            }
            4 => {
                let data = ToBgSchematic::new(&java_data)?.bg_schematic(bg_version as i32)?;
                file_manager.save_json_value(
                    id,
                    data,
                    version,
                    bg_version as i32,
                    schematic_type as i32,
                )?;
            }
            5 => {
                let data = ToBESchematic::new(&data)?.to_be_value()?;
                file_manager.save_nbt_le_value(id, data, version, -1, schematic_type as i32)?;
            }
            6 => {
                let legacy_data = normalize_schematic_for_legacy(&target_legacy_version, &data)?;
                let data = ToMcEditSchematic::new(&legacy_data)?.mcedit_schematic()?;
                file_manager.save_nbt_value(id, data, version, -1, schematic_type as i32, true)?;
            }
            _ => unreachable!("schematic type was validated before conversion"),
        }
        Ok(true)
    }
    .await
    .map_err(|e: anyhow::Error| e.to_string())
}

#[tauri::command]
pub async fn convert_lm(
    db: State<'_, DatabaseState>,
    file_manager: State<'_, FileManager>,
    id: i64,
    lm_version: i64,
) -> anyhow::Result<bool, String> {
    async move {
        let mut conn = db.0.get()?;
        let schematic = find_schematic(&mut conn, id)?;
        let version = schematic.version;
        let sub_version = schematic.sub_type;
        let v_type = schematic.schematic_type;
        let mut data = file_manager.get_schematic_value(id, version, sub_version, v_type)?;

        if let Compound(ref mut nbt_map) = data {
            nbt_map.insert(
                "Version".to_string(),
                fastnbt::Value::Int(lm_version as i32),
            );
        }
        update_schematic_lm_version(&mut conn, lm_version as i32, id)?;
        file_manager.save_nbt_value(id, data, 0, sub_version, v_type, true)?;
        Ok(true)
    }
    .await
    .map_err(|e: anyhow::Error| e.to_string())
}
