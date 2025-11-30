use crate::building_gadges::bg_schematic::BgSchematic;
use crate::create::create_schematic::CreateSchematic;
use crate::litematica::lm_schematic::LmSchematic;
use crate::modules::modules_data::convert_data::{ConvertData, SchematicType, Target};
use crate::utils::schematic_data::SchematicData;
use crate::word_edit::we_schematic::WeSchematic;
use anyhow::Result;
use anyhow::{anyhow, Context};
use fastnbt::Value;
use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use tempfile::NamedTempFile;
use flate2::Compression;
use std::collections::HashMap;
use std::fs;
use std::fs::File;
use std::io;
use std::io::{Cursor, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use fastnbt::Value::Compound;
use tauri::{AppHandle, Manager};
use crate::be_schematic::be_schematic::BESchematic;
use crate::be_schematic::le_reader::read_nbt_le::load_nbt_le;
use crate::be_schematic::le_reader::write_nbt_le::save_nbt_le;

#[derive(Debug)]
pub struct FileData {
    pub version: i32,
    pub v_type: i32,
    pub sub_type: i32,
}

#[derive(Debug)]
pub struct FileManager {
    data_dir: PathBuf,
}

impl FileManager {
    pub fn new(app: &AppHandle) -> Result<FileManager> {
        let data_dir = app
            .path()
            .app_data_dir()
            .context("Unable to retrieve the application data directory")?
            .join("data")
            .join("schematic");
        if !data_dir.exists() {
            fs::create_dir_all(&data_dir).context("Failed to create configuration directory")?;
        }
        Ok(Self { data_dir })
    }
    pub fn schematic_dir(&self, id: i64) -> Result<PathBuf> {
        let schematic_dir = self.data_dir.join(format!("schematic-{}", id));
        if !schematic_dir.exists() {
            fs::create_dir_all(&schematic_dir).context("Failed to create configuration directory")?;
        }
        Ok(schematic_dir)
    }
    pub fn delete_schematic_dir(&self, id: i64) -> Result<()> {
        let target_dir = self.schematic_dir(id)?;

        let path = dunce::canonicalize(&target_dir).context("Path normalization failed")?;

        if !path.starts_with(&self.data_dir) {
            return Err(anyhow::anyhow!("Illegal directory path: {:?}", path));
        }

        remove_dir_all_safe(&path).with_context(|| format!("Cannot delete directory: {:?}", path))?;

        Ok(())
    }

    pub fn save_schematic(
        &self,
        id: i64,
        mut file: File,
        version: i32,
        sub_version: i32,
        v_type: i32,
        file_ext: String,
    ) -> Result<PathBuf> {
        let schematic_dir = self.schematic_dir(id)?;
        let temp_file = schematic_dir.join(format!(
            "temp_{}_{}_{}.{}",
            version, sub_version, v_type, file_ext
        ));

        {
            let mut temp_file = File::create(&temp_file)
                .with_context(|| format!("Failed to create temporary file: {}", temp_file.display()))?;

            io::copy(&mut file, &mut temp_file).with_context(|| "File content copying failed")?;
        }

        let final_filename = format!(
            "schematic_{}.{}.{}.{}",
            version, sub_version, v_type, file_ext
        );
        let final_path = schematic_dir.join(final_filename);

        fs::rename(&temp_file, &final_path).with_context(|| {
            format!(
                "Rename failed: {} → {}",
                temp_file.display(),
                final_path.display()
            )
        })?;
        Ok(final_path)
    }

    pub fn save_schematic_data(
        &self,
        id: i64,
        data: Vec<u8>,
        version: i32,
        sub_version: i32,
        v_type: i32,
        file_ext: String,
    ) -> Result<PathBuf> {
        let schematic_dir = self.schematic_dir(id)?;
        let temp_file = schematic_dir.join(format!(
            "temp_{}_{}_{}.{}",
            version, sub_version, v_type, file_ext
        ));

        {
            let mut temp_file = File::create(&temp_file)
                .with_context(|| format!("Failed to create temporary file: {}", temp_file.display()))?;

            temp_file
                .write_all(&data)
                .with_context(|| "File write failed".to_string())?;
        }

        let final_filename = format!(
            "schematic_{}.{}.{}.{}",
            version, sub_version, v_type, file_ext
        );
        let final_path = schematic_dir.join(final_filename);

        fs::rename(&temp_file, &final_path).with_context(|| {
            format!(
                "Rename failed: {} → {}",
                temp_file.display(),
                final_path.display()
            )
        })?;
        Ok(final_path)
    }

    pub fn save_json_value(
        &self,
        id: i64,
        data: String,
        version: i32,
        sub_version: i32,
        v_type: i32,
    ) -> Result<PathBuf> {
        let schematic_dir = self.schematic_dir(id)?;

        let final_filename = format!(
            "schematic_{}.{}.{}.{}",
            version, sub_version, v_type, "json"
        );
        let final_path = schematic_dir.join(final_filename);
        let out_path = final_path.clone();
        let mut file = File::create(final_path)?;
        file.write_all(data.as_bytes())?;
        Ok(out_path)
    }

    pub fn save_json_value_temp(
        &self,
        data: String,
    ) -> Result<NamedTempFile> {
        let mut temp_file = tempfile::Builder::new()
            .prefix("schematic_")
            .suffix(".json")
            .tempfile()?;

        temp_file.write_all(data.as_bytes())?;

        temp_file.seek(SeekFrom::Start(0))?;

        Ok(temp_file)
    }

    pub fn save_nbt_value(
        &self,
        id: i64,
        data: Value,
        version: i32,
        sub_version: i32,
        v_type: i32,
        compress: bool,
    ) -> Result<PathBuf> {
        let schematic_dir = self.schematic_dir(id)?;

        let file_ext = match v_type {
            1 => "nbt",
            2 => "litematic",
            3 => "schem",
            4 => "json",
            _ => "unknown",
        };

        let final_filename = format!(
            "schematic_{}.{}.{}.{}",
            version, sub_version, v_type, file_ext
        );

        let final_path = schematic_dir.join(final_filename);
        let out_path = final_path.clone();

        let bytes = fastnbt::to_bytes(&data)?;

        if compress {
            let file = File::create(final_path)?;
            let mut encoder = GzEncoder::new(file, Compression::default());
            encoder.write_all(&bytes)?;
            encoder.finish()?;
        } else {
            let mut file = File::create(final_path)?;
            file.write_all(&bytes)?;
        }

        Ok(out_path)
    }

    pub fn save_snbt_value(
        &self,
        id: i64,
        data: &str,
        version: i32,
        sub_version: i32,
        v_type: i32,
        compress: bool,
    ) -> Result<PathBuf> {
        let schematic_dir = self.schematic_dir(id)?;

        let file_ext = match v_type {
            1 => "nbt",
            2 => "litematic",
            3 => "schem",
            4 => "json",
            _ => "unknown",
        };

        let final_filename = format!(
            "schematic_{}.{}.{}.{}",
            version, sub_version, v_type, file_ext
        );

        let final_path = schematic_dir.join(final_filename);
        let out_path = final_path.clone();

        let value: Value = fastsnbt::from_str(data)?;
        let bytes = fastnbt::to_bytes(&value)?;

        if compress {
            let file = File::create(final_path)?;
            let mut encoder = GzEncoder::new(file, Compression::default());
            encoder.write_all(&bytes)?;
            encoder.finish()?;
        } else {
            let mut file = File::create(final_path)?;
            file.write_all(&bytes)?;
        }

        Ok(out_path)
    }

    pub fn save_snbt_le_value(
        &self,
        id: i64,
        data: &str,
        version: i32,
        sub_version: i32,
        v_type: i32,
    ) -> Result<PathBuf> {
        let schematic_dir = self.schematic_dir(id)?;

        let file_ext = match v_type {
            5 => "mcstructure",
            _ => "unknown",
        };

        let final_filename = format!(
            "schematic_{}.{}.{}.{}",
            version, sub_version, v_type, file_ext
        );

        let final_path = schematic_dir.join(final_filename);
        let out_path = final_path.clone();
        let value: HashMap<String, Value> = fastsnbt::from_str(data)?;
        let file = File::create(final_path)?;
        save_nbt_le(file, "Schematic", &value)?;

        Ok(out_path)
    }
    pub fn save_nbt_le_value(
        &self,
        id: i64,
        data: HashMap<String, Value>,
        version: i32,
        sub_version: i32,
        v_type: i32,
    ) -> Result<PathBuf> {
        let schematic_dir = self.schematic_dir(id)?;

        let file_ext = match v_type {
            5 => "mcstructure",
            _ => "unknown",
        };

        let final_filename = format!(
            "schematic_{}.{}.{}.{}",
            version, sub_version, v_type, file_ext
        );

        let final_path = schematic_dir.join(final_filename);
        let out_path = final_path.clone();

        let file = File::create(final_path)?;
        save_nbt_le(file, "Schematic", &data)?;

        Ok(out_path)
    }

    pub fn save_nbt_value_temp(
        &self,
        data: Value,
        v_type: i32,
        compress: bool,
    ) -> Result<NamedTempFile> {

        let file_ext = match v_type {
            1 => ".nbt",
            2 => ".litematic",
            3 => ".schem",
            4 => ".json",
            _ => ".unknown",
        };

        let mut temp_file = tempfile::Builder::new()
            .prefix("schematic_")
            .suffix(file_ext)
            .tempfile()?;

        let bytes = fastnbt::to_bytes(&data)?;

        if compress {
            let mut encoder = GzEncoder::new(&mut temp_file, Compression::default());
            encoder.write_all(&bytes)?;
            encoder.finish()?;
        } else {
            temp_file.write_all(&bytes)?;
        }

        temp_file.seek(SeekFrom::Start(0))?;

        Ok(temp_file)
    }

    pub fn save_nbt_value_le_temp(
        &self,
        data: HashMap<String, Value>,
        v_type: i32,
    ) -> Result<NamedTempFile> {

        let file_ext = match v_type {
            5 => ".mcstructure",
            _ => ".unknown",
        };

        let mut temp_file = tempfile::Builder::new()
            .prefix("schematic_")
            .suffix(file_ext)
            .tempfile()?;

        save_nbt_le(&temp_file, "Schematic", &data)?;

        temp_file.seek(SeekFrom::Start(0))?;

        Ok(temp_file)
    }
    pub fn read_schematic_str(
        &self,
        id: i64,
        version: i32,
        sub_version: i32,
        v_type: i32,
    ) -> Result<String> {
        let schematic_dir = self.schematic_dir(id)?;
        let file_ext = match v_type {
            1 => "nbt",
            2 => "litematic",
            3 => "schem",
            4 => "json",
            5 => "mcstructure",
            _ => "unknown",
        };
        let filename = format!(
            "schematic_{}.{}.{}.{}",
            version, sub_version, v_type, file_ext
        );

        let file_path = schematic_dir.join(filename);

        let data = fs::read(&file_path)
            .with_context(|| format!("Unable to read schematic file: {}", file_path.display()))?;
        match v_type {
            1 => {
                if data.len() > 8 * 1024 * 1024 {
                    return Ok(String::new());
                }
                let cursor = Cursor::new(data);
                let mut decoder = GzDecoder::new(cursor);

                let nbt: Value = fastnbt::from_reader(&mut decoder)?;
                let ser = fastsnbt::to_string(&nbt)?;
                Ok(ser)
            }
            2 => {
                if data.len() > 1 * 512 * 1024 {
                    return Ok(String::new());
                }
                let cursor = Cursor::new(data);
                let mut decoder = GzDecoder::new(cursor);

                let nbt: Value = fastnbt::from_reader(&mut decoder)?;
                let ser = fastsnbt::to_string(&nbt)?;
                Ok(ser)
            }
            3 => {
                if data.len() > 8 * 1024 * 1024 {
                    return Ok(String::new());
                }
                let cursor = Cursor::new(data);
                let mut decoder = GzDecoder::new(cursor);

                let nbt: Value = fastnbt::from_reader(&mut decoder)?;
                let ser = fastsnbt::to_string(&nbt)?;
                Ok(ser)
            }
            4 => {
                if data.len() > 8 * 1024 * 1024 {
                    return Ok(String::new());
                }
                let json_str = String::from_utf8(data)?;
                Ok(json_str)
            }
            5 => {
                if data.len() > 8 * 1024 * 1024 {
                    return Ok(String::new());
                }
                let nbt = load_nbt_le(&data[..])?;
                let value = Compound(nbt);
                let ser = fastsnbt::to_string(&value)?;
                Ok(ser)
            }
            _ => Err(anyhow!("UNK: {}", v_type)),
        }
    }

    pub fn copy_file(
        &self,
        id: i64,
        version: i32,
        sub_version: i32,
        v_type: i32,
        target_path: String,
    ) -> Result<bool> {
        let schematic_dir = self.schematic_dir(id)?;
        let file_ext = match v_type {
            1 => "nbt",
            2 => "litematic",
            3 => "schem",
            4 => "json",
            5 => "mcstructure",
            _ => "unknown",
        };
        let filename = format!(
            "schematic_{}.{}.{}.{}",
            version, sub_version, v_type, file_ext
        );
        let path = PathBuf::from(&target_path);
        let file_path = schematic_dir.join(&filename);
        let dest_path = if path.is_dir() {
            path.join(&filename)
        } else {
            path.to_path_buf()
        };

        if let Some(parent) = dest_path.parent() {
            fs::create_dir_all(parent)?;
        }

        fs::copy(&file_path, &dest_path).map_err(|e| anyhow::anyhow!("File copying failed: {}", e))?;

        Ok(true)
    }
    pub fn get_convert_data(
        &self,
        id: i64,
        version: i32,
        main_sub_version: i32,
        v_type: i32,
    ) -> Result<ConvertData> {
        let schematic_dir = self.schematic_dir(id)?;
        let mut convert_data = ConvertData {
            schematic_type: SchematicType::from_code(v_type).unwrap_or(SchematicType::Create),
            schematic_type_id: v_type,
            sub_type: main_sub_version,
            version,
            size: String::new(),
            schematics: HashMap::new(),
        };

        for schematic_type in [
            SchematicType::Create,
            SchematicType::Litematic,
            SchematicType::Bg,
            SchematicType::We,
            SchematicType::Be,
        ] {
            let mut version_map = HashMap::new();

            for sub_v in schematic_type.get_sub_versions() {
                let filename = format!(
                    "schematic_{}.{}.{}.{}",
                    version,
                    sub_v,
                    schematic_type.type_id(),
                    schematic_type.file_extension()
                );
                let path = schematic_dir.join(&filename);

                if path.exists() {
                    let metadata = fs::metadata(&path)?;
                    version_map.insert(
                        sub_v,
                        Target {
                            has: true,
                            size: metadata.len().to_string(),
                            version,
                        },
                    );
                }
            }

            if !version_map.is_empty() {
                convert_data.schematics.insert(schematic_type, version_map);
            }
        }

        if let Some(versions) = convert_data.schematics.get(&convert_data.schematic_type) {
            convert_data.size = versions
                .get(&main_sub_version)
                .map(|t| t.size.clone())
                .unwrap_or_default();
        }

        Ok(convert_data)
    }

    pub fn get_schematic_data(
        &self,
        id: i64,
        version: i32,
        sub_version: i32,
        v_type: i32,
    ) -> Result<SchematicData> {
        let schematic_dir = self.schematic_dir(id)?;
        let file_ext = match v_type {
            1 => "nbt",
            2 => "litematic",
            3 => "schem",
            4 => "json",
            5 => "mcstructure",
            _ => "unknown",
        };
        let filename = format!(
            "schematic_{}.{}.{}.{}",
            version, sub_version, v_type, file_ext
        );

        let file_path = schematic_dir.join(filename);
        let data = fs::read(&file_path)
            .with_context(|| format!("Unable to read blueprint file: {}", file_path.display()))?;
        match v_type {
            1 => {
                let schematic = CreateSchematic::new_from_bytes(data)?;
                let blocks = schematic.get_blocks_pos();
                Ok(blocks?)
            }
            2 => {
                let schematic = LmSchematic::new_from_bytes(data)?;
                let blocks = schematic.get_blocks_pos();
                Ok(blocks?)
            }
            3 => {
                let schematic = WeSchematic::new_from_bytes(data)?;
                let blocks = schematic.get_blocks_pos();
                Ok(blocks?)
            }
            4 => {
                let schematic = BgSchematic::new_from_data(data)?;
                let blocks = schematic.get_blocks_pos();
                Ok(blocks?)
            }
            5 => {
                let schematic = BESchematic::new_from_bytes(data)?;
                let blocks = schematic.get_blocks_pos();
                Ok(blocks?)
            }
            _ => Err(anyhow!("UNK: {}", v_type)),
        }
    }
    pub fn get_schematic_value(
        &self,
        id: i64,
        version: i32,
        sub_version: i32,
        v_type: i32,
    ) -> Result<Value> {
        let schematic_dir = self.schematic_dir(id)?;
        let file_ext = match v_type {
            1 => "nbt",
            2 => "litematic",
            3 => "schem",
            5 => "mcstructure",
            _ => "unknown",
        };
        let filename = format!(
            "schematic_{}.{}.{}.{}",
            version, sub_version, v_type, file_ext
        );

        let file_path = schematic_dir.join(filename);
        let data = fs::read(&file_path)
            .with_context(|| format!("Unable to read blueprint file: {}", file_path.display()))?;
        match v_type {
            1 => {
                let schematic = CreateSchematic::new_from_bytes(data)?;
                Ok(schematic.nbt)
            }
            2 => {
                let schematic = LmSchematic::new_from_bytes(data)?;
                Ok(schematic.nbt)
            }
            3 => {
                let schematic = WeSchematic::new_from_bytes(data)?;
                Ok(schematic.nbt)
            }
            5 => {
                let schematic = BESchematic::new_from_bytes(data)?;
                Ok(schematic.nbt)
            }
            _ => Err(anyhow!("UNK: {}", v_type)),
        }
    }
}

fn remove_dir_all_safe<P: AsRef<Path>>(path: P) -> Result<()> {
    #[cfg(target_os = "windows")]
    {
        let _lock = open_file_lock(path.as_ref())?;
    }

    fs::remove_dir_all(&path)?;

    if path.as_ref().exists() {
        return Err(anyhow::anyhow!("The directory still exists: {:?}", path.as_ref()));
    }

    Ok(())
}
#[cfg(target_os = "windows")]
fn open_file_lock(path: &Path) -> Result<fs::File> {
    use std::os::windows::fs::OpenOptionsExt;

    let file = fs::OpenOptions::new()
        .write(true)
        .share_mode(0) // 独占模式
        .open(path)
        .context("Unable to lock file")?;

    Ok(file)
}
