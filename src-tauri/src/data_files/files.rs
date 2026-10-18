use crate::be_schematic::be_schematic::BESchematic;
use crate::be_schematic::le_reader::write_nbt_le::save_nbt_le;
use crate::building_gadges::bg_schematic::BgSchematic;
use crate::create::create_schematic::CreateSchematic;
use crate::litematica::lm_schematic::LmSchematic;
use crate::mcedit::mcedit_schematic::McEditSchematic;
use crate::modules::modules_data::convert_data::{
    ConversionOutput, ConvertData, SchematicType, Target,
};
use crate::utils::nbt_scan::read_gzip_java_nbt;
use crate::utils::parse_limits::{ParseLimits, read_source_file};
use crate::utils::schematic_data::SchematicData;
use crate::word_edit::we_schematic::WeSchematic;
use anyhow::Result;
use anyhow::{Context, anyhow};
use fastnbt::Value;
use fastnbt::Value::Compound;
use flate2::Compression;
use flate2::write::GzEncoder;
use std::collections::HashMap;
use std::fs;
use std::fs::File;
use std::io;
use std::io::{Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use tempfile::NamedTempFile;

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

/// Owns only a newly created, no-clobber import file until SQLite commits.
/// Failed transactions/panics remove this file, never a previous version.
pub(crate) struct UncommittedImportFile {
    path: PathBuf,
    pending: bool,
}
impl UncommittedImportFile {
    pub fn keep(mut self) {
        self.pending = false;
    }
    pub fn discard(mut self) -> Result<()> {
        fs::remove_file(&self.path).context("could not remove the uncommitted import file")?;
        self.pending = false;
        Ok(())
    }
}
impl Drop for UncommittedImportFile {
    fn drop(&mut self) {
        if self.pending {
            let _ = fs::remove_file(&self.path);
        }
    }
}

#[derive(serde::Serialize, serde::Deserialize)]
struct ConversionMetadata {
    output: ConversionOutput,
    size: u64,
    modified_nanos: u64,
}

fn modified_nanos(metadata: &fs::Metadata) -> Option<u64> {
    metadata
        .modified()
        .ok()?
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_nanos()
        .try_into()
        .ok()
}

fn cached_output(path: &Path, metadata: &fs::Metadata) -> Option<ConversionOutput> {
    let info_path = path.with_extension(format!("{}.output.json", path.extension()?.to_str()?));
    if fs::metadata(&info_path).ok()?.len() > 4096 {
        return None;
    }
    let info: ConversionMetadata = serde_json::from_slice(&fs::read(info_path).ok()?).ok()?;
    (info.size == metadata.len() && Some(info.modified_nanos) == modified_nanos(metadata))
        .then_some(info.output)
}

impl FileManager {
    #[cfg(test)]
    pub(crate) fn for_test(data_dir: PathBuf) -> Self {
        Self { data_dir }
    }

    pub(crate) fn create_import_file(
        &self,
        id: i64,
        version: i32,
        subtype: i32,
        format: i32,
        bytes: &[u8],
    ) -> Result<UncommittedImportFile> {
        let extension = crate::utils::blueprint_export::extension(format)?;
        let directory = self.schematic_dir(id)?;
        let path = crate::utils::atomic_file::destination(&directory.join(format!(
            "schematic_{version}.{subtype}.{format}.{extension}"
        )))?;
        anyhow::ensure!(
            !path.exists(),
            "import destination already exists; existing data was not replaced"
        );
        let mut file = tempfile::Builder::new()
            .prefix(".mcstools-import-")
            .tempfile_in(path.parent().context("invalid import folder")?)?;
        file.write_all(bytes)?;
        file.as_file().sync_all()?;
        file.persist_noclobber(&path)
            .context("could not install import file without overwriting")?;
        Ok(UncommittedImportFile {
            path,
            pending: true,
        })
    }
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
            fs::create_dir_all(&schematic_dir)
                .context("Failed to create configuration directory")?;
        }
        Ok(schematic_dir)
    }
    pub fn delete_schematic_dir(&self, id: i64) -> Result<()> {
        let target_dir = self.schematic_dir(id)?;

        let path = dunce::canonicalize(&target_dir).context("Path normalization failed")?;

        if !path.starts_with(&self.data_dir) {
            return Err(anyhow::anyhow!("Illegal directory path: {:?}", path));
        }

        remove_dir_all_safe(&path)
            .with_context(|| format!("Cannot delete directory: {:?}", path))?;

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
            let mut temp_file = File::create(&temp_file).with_context(|| {
                format!("Failed to create temporary file: {}", temp_file.display())
            })?;

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
            let mut temp_file = File::create(&temp_file).with_context(|| {
                format!("Failed to create temporary file: {}", temp_file.display())
            })?;

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

    pub fn save_json_value_temp(&self, data: String) -> Result<NamedTempFile> {
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
            6 => "schematic",
            _ => "unknown",
        };

        let final_filename = format!(
            "schematic_{}.{}.{}.{}",
            version, sub_version, v_type, file_ext
        );

        let final_path = schematic_dir.join(final_filename);
        let out_path = final_path.clone();

        let bytes = nbt_bytes(&data, v_type)?;

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
            6 => "schematic",
            _ => "unknown",
        };

        let final_filename = format!(
            "schematic_{}.{}.{}.{}",
            version, sub_version, v_type, file_ext
        );

        let final_path = schematic_dir.join(final_filename);
        let out_path = final_path.clone();

        crate::utils::snbt_scan::scan_snbt(data, &ParseLimits::default())?;
        let value: Value = fastsnbt::from_str(data)?;
        let bytes = nbt_bytes(&value, v_type)?;

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
        crate::utils::snbt_scan::scan_snbt(data, &ParseLimits::default())?;
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
            6 => ".schematic",
            _ => ".unknown",
        };

        let mut temp_file = tempfile::Builder::new()
            .prefix("schematic_")
            .suffix(file_ext)
            .tempfile()?;

        let bytes = nbt_bytes(&data, v_type)?;

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
            6 => "schematic",
            _ => "unknown",
        };
        let filename = format!(
            "schematic_{}.{}.{}.{}",
            version, sub_version, v_type, file_ext
        );

        let file_path = schematic_dir.join(filename);

        let input_limit = if v_type == 2 {
            512 * 1024
        } else {
            8 * 1024 * 1024
        };
        if fs::metadata(&file_path)?.len() > input_limit as u64 {
            return Ok(String::new());
        }
        let data = read_source_file(&file_path)?;
        if data.len() > input_limit {
            return Ok(String::new());
        }
        if v_type == 4 {
            return Ok(String::from_utf8(data)?);
        }
        let limits = ParseLimits {
            max_input_bytes: input_limit,
            max_decompressed_bytes: 16 * 1024 * 1024,
            max_nbt_allocation_bytes: 64 * 1024 * 1024,
            ..ParseLimits::default()
        };
        let parsed: Result<Value, crate::utils::schematic_data::SchematicError> = match v_type {
            1 | 2 | 3 => read_gzip_java_nbt(&data, &limits),
            5 => {
                crate::be_schematic::le_reader::read_nbt_le::load_nbt_le_with_limits(&data, &limits)
                    .map(Compound)
            }
            6 => {
                McEditSchematic::new_from_bytes_with_limits(&data, &limits).map(|source| source.nbt)
            }
            _ => return Err(anyhow!("UNK: {}", v_type)),
        };
        match parsed {
            Ok(value) => Ok(crate::utils::nbt_text::bounded_snbt(&value)?),
            Err(crate::utils::schematic_data::SchematicError::LimitExceeded(_)) => {
                Ok(String::new())
            }
            Err(error) => Err(error.into()),
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
            6 => "schematic",
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
        let dest_path = crate::utils::atomic_file::destination(&dest_path)?;

        // A save/copy must never truncate the original (including aliases) or
        // another existing file. Commit a complete temporary copy atomically.
        anyhow::ensure!(
            !dest_path.exists(),
            "copy destination already exists; select a new filename"
        );
        let mut source = File::open(&file_path)?;
        let mut temporary = tempfile::Builder::new()
            .prefix(".mcstools-copy-")
            .tempfile_in(dest_path.parent().context("invalid destination folder")?)?;
        io::copy(&mut source, &mut temporary)?;
        temporary.as_file().sync_all()?;
        temporary
            .persist_noclobber(&dest_path)
            .context("copy destination already exists or is not writable")?;

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
            SchematicType::McEdit,
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
                            output: cached_output(&path, &metadata),
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

    /// Replace only a derived conversion slot, never the source file slot.
    /// The data file is committed atomically so failed encoding/writes leave
    /// the previous conversion intact. Metadata is advisory and fingerprinted
    /// by file size/time, so obsolete labels are ignored on later reads.
    pub fn save_conversion_data(
        &self,
        id: i64,
        version: i32,
        source_format: i32,
        source_subtype: i32,
        options: &crate::utils::blueprint_export::ExportOptions,
        data: &[u8],
        output: ConversionOutput,
    ) -> Result<PathBuf> {
        let subtype = crate::utils::blueprint_export::cache_subtype(options);
        anyhow::ensure!(
            (source_format, source_subtype) != (options.format, subtype),
            "conversion would overwrite the source; use save copy instead"
        );
        let ext = crate::utils::blueprint_export::extension(options.format)?;
        let directory = fs::canonicalize(self.schematic_dir(id)?)?;
        let path = directory.join(format!(
            "schematic_{version}.{subtype}.{}.{ext}",
            options.format
        ));
        let mut temporary = tempfile::Builder::new()
            .prefix(".convert-")
            .tempfile_in(&directory)?;
        temporary.write_all(data)?;
        temporary.as_file().sync_all()?;
        temporary
            .persist(&path)
            .context("failed to save conversion file")?;
        let metadata = fs::metadata(&path)?;
        if let Some(modified_nanos) = modified_nanos(&metadata) {
            let info = ConversionMetadata {
                output,
                size: metadata.len(),
                modified_nanos,
            };
            let bytes = serde_json::to_vec(&info)?;
            let mut temporary = tempfile::Builder::new()
                .prefix(".convert-info-")
                .tempfile_in(&directory)?;
            temporary.write_all(&bytes)?;
            temporary.as_file().sync_all()?;
            temporary
                .persist(path.with_extension(format!("{ext}.output.json")))
                .context("conversion file saved, but its version label could not be saved")?;
        }
        Ok(path)
    }

    pub fn get_schematic_data(
        &self,
        id: i64,
        version: i32,
        sub_version: i32,
        v_type: i32,
    ) -> Result<SchematicData> {
        Ok(self
            .get_schematic_with_version(id, version, sub_version, v_type)?
            .0)
    }

    /// Parse once and retain the exact source DataVersion. The library's
    /// display label is a registry boundary, not the original numeric value.
    pub fn get_schematic_with_version(
        &self,
        id: i64,
        version: i32,
        sub_version: i32,
        v_type: i32,
    ) -> Result<(SchematicData, Option<i32>)> {
        let schematic_dir = self.schematic_dir(id)?;
        let file_ext = match v_type {
            1 => "nbt",
            2 => "litematic",
            3 => "schem",
            4 => "json",
            5 => "mcstructure",
            6 => "schematic",
            _ => "unknown",
        };
        let filename = format!(
            "schematic_{}.{}.{}.{}",
            version, sub_version, v_type, file_ext
        );

        let file_path = schematic_dir.join(filename);
        let data = read_source_file(&file_path)
            .with_context(|| format!("Unable to read blueprint file: {}", file_path.display()))?;
        match v_type {
            1 => {
                let schematic = CreateSchematic::new_from_bytes(data)?;
                Ok((
                    schematic.get_blocks_pos_with_limits(&ParseLimits::default())?,
                    schematic.get_data_version().ok(),
                ))
            }
            2 => {
                let schematic = LmSchematic::new_from_bytes(data)?;
                Ok((
                    schematic.get_blocks_pos_with_limits(&ParseLimits::default())?,
                    schematic.get_data_version().ok(),
                ))
            }
            3 => {
                let schematic = WeSchematic::new_from_bytes(data)?;
                let subtype = schematic.get_type()?;
                Ok((
                    schematic.get_blocks_pos_with_limits(&ParseLimits::default())?,
                    schematic.get_data_version(subtype).ok(),
                ))
            }
            4 => {
                let schematic = BgSchematic::new_from_data(data)?;
                Ok((
                    schematic.get_blocks_pos_with_limits(&ParseLimits::default())?,
                    None,
                ))
            }
            5 => {
                let schematic = BESchematic::new_from_bytes(data)?;
                Ok((
                    schematic.get_blocks_pos_with_limits(&ParseLimits::default())?,
                    None,
                ))
            }
            6 => {
                let schematic = McEditSchematic::new_from_bytes(data)?;
                let data_version = crate::mcedit::legacy_map::declared_game_version(&schematic.nbt)
                    .and_then(|name| {
                        crate::utils::minecraft_data::versions_data::VersionData::new()
                            .game_version_id(name)
                    });
                Ok((
                    schematic.get_blocks_pos_with_limits(&ParseLimits::default())?,
                    data_version,
                ))
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
            6 => "schematic",
            5 => "mcstructure",
            _ => "unknown",
        };
        let filename = format!(
            "schematic_{}.{}.{}.{}",
            version, sub_version, v_type, file_ext
        );

        let file_path = schematic_dir.join(filename);
        let data = read_source_file(&file_path)
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
            6 => {
                let schematic = McEditSchematic::new_from_bytes(data)?;
                Ok(schematic.nbt)
            }
            _ => Err(anyhow!("UNK: {}", v_type)),
        }
    }
}

fn nbt_bytes(data: &Value, v_type: i32) -> Result<Vec<u8>> {
    if v_type == 6 {
        // Legacy MCEdit schematics must use the root compound name "Schematic".
        Ok(fastnbt::to_bytes_with_opts(
            data,
            fastnbt::SerOpts::new().root_name("Schematic"),
        )?)
    } else {
        Ok(fastnbt::to_bytes(data)?)
    }
}

#[cfg(test)]
mod exact_version_tests {
    use super::*;
    use crate::utils::block_state_pos_list::{BlockData, BlockId, BlockStatePosList};
    use crate::utils::blueprint_export::{ExportOptions, encode};
    use crate::utils::schematic_data::Size;
    use std::sync::Arc;
    fn cache_options(format: i32, subtype: i32) -> ExportOptions {
        ExportOptions {
            format,
            subtype,
            target_data_version: None,
            overrides: Vec::new(),
            include_air: false,
        }
    }
    fn output() -> ConversionOutput {
        ConversionOutput {
            data_version: Some(3578),
            game_version: Some("1.20.2".into()),
            format_version: 6,
        }
    }

    #[test]
    fn text_preview_refuses_expanded_arrays_without_changing_the_source() {
        let temporary = tempfile::tempdir().unwrap();
        let manager = FileManager {
            data_dir: temporary.path().to_owned(),
        };
        let nbt = Value::Compound(HashMap::from([(
            "data".into(),
            Value::ByteArray(fastnbt::ByteArray::new(vec![0; 17 * 1024 * 1024])),
        )]));
        let raw = fastnbt::to_bytes(&nbt).unwrap();
        let mut encoder = GzEncoder::new(Vec::new(), Compression::fast());
        encoder.write_all(&raw).unwrap();
        let encoded = encoder.finish().unwrap();
        assert!(encoded.len() < 512 * 1024);
        for (id, format, ext) in [
            (1, 1, "nbt"),
            (2, 2, "litematic"),
            (3, 3, "schem"),
            (4, 6, "schematic"),
        ] {
            let path = manager
                .save_schematic_data(id, encoded.clone(), 0, -1, format, ext.into())
                .unwrap();
            assert!(
                manager
                    .read_schematic_str(id, 0, -1, format)
                    .unwrap()
                    .is_empty()
            );
            assert_eq!(fs::read(&path).unwrap(), encoded);
            // The small text-editor budget does not ban normal source parsing.
            assert!(manager.get_schematic_value(id, 0, -1, format).is_ok());
        }
    }

    #[test]
    fn malformed_snbt_does_not_overwrite_existing_file() {
        let temporary = tempfile::tempdir().unwrap();
        let manager = FileManager {
            data_dir: temporary.path().to_owned(),
        };
        let source = manager
            .save_schematic_data(1, b"original".to_vec(), 0, -1, 2, "litematic".into())
            .unwrap();
        let deep = format!("{}0{}", "{a:".repeat(130), "}".repeat(130));
        assert!(manager.save_snbt_value(1, &deep, 0, -1, 2, true).is_err());
        assert_eq!(fs::read(source).unwrap(), b"original");
    }
    #[test]
    fn conversion_cache_cannot_replace_original_even_for_other_litematica_versions() {
        let temporary = tempfile::tempdir().unwrap();
        let manager = FileManager {
            data_dir: temporary.path().to_owned(),
        };
        let original = manager
            .save_schematic_data(1, b"original".to_vec(), 0, -1, 2, "litematic".into())
            .unwrap();
        for subtype in 3..=7 {
            let result = manager.save_conversion_data(
                1,
                0,
                2,
                -1,
                &cache_options(2, subtype),
                b"replacement",
                output(),
            );
            assert!(
                result
                    .unwrap_err()
                    .to_string()
                    .contains("overwrite the source")
            );
            assert_eq!(fs::read(&original).unwrap(), b"original");
        }
    }
    #[test]
    fn conversion_cache_replaces_only_derived_slot_and_records_actual_output() {
        let temporary = tempfile::tempdir().unwrap();
        let manager = FileManager {
            data_dir: temporary.path().to_owned(),
        };
        let original = manager
            .save_schematic_data(1, b"original".to_vec(), 3, 0, 3, "schem".into())
            .unwrap();
        let options = cache_options(3, 1);
        let path = manager
            .save_conversion_data(1, 3, 3, 0, &options, b"first", output())
            .unwrap();
        let changed = ConversionOutput {
            data_version: Some(1343),
            game_version: Some("1.12.2".into()),
            format_version: 1,
        };
        manager
            .save_conversion_data(1, 3, 3, 0, &options, b"second complete file", changed)
            .unwrap();
        assert_eq!(fs::read(&original).unwrap(), b"original");
        assert_eq!(fs::read(&path).unwrap(), b"second complete file");
        let data = manager.get_convert_data(1, 3, 0, 3).unwrap();
        let stored = &data.schematics[&SchematicType::We][&1];
        assert_eq!(stored.size, "20");
        assert_eq!(stored.output.as_ref().unwrap().data_version, Some(1343));
        assert_eq!(
            stored.output.as_ref().unwrap().game_version.as_deref(),
            Some("1.12.2")
        );
        assert!(data.schematics[&SchematicType::We][&0].output.is_none());
        // An older writer/manual edit must not keep the previous target label.
        fs::write(&path, b"other").unwrap();
        assert!(
            manager.get_convert_data(1, 3, 0, 3).unwrap().schematics[&SchematicType::We][&1]
                .output
                .is_none()
        );
        manager
            .save_conversion_data(1, 3, 3, 0, &options, b"same length", output())
            .unwrap();
        let file = File::options().write(true).open(&path).unwrap();
        file.set_modified(std::time::UNIX_EPOCH + std::time::Duration::from_secs(100))
            .unwrap();
        assert!(cached_output(&path, &file.metadata().unwrap()).is_none());
    }
    #[test]
    fn copy_preserves_existing_destination_and_original() {
        let temporary = tempfile::tempdir().unwrap();
        let manager = FileManager {
            data_dir: temporary.path().to_owned(),
        };
        let original = manager
            .save_schematic_data(1, b"original".to_vec(), 0, -1, 2, "litematic".into())
            .unwrap();
        assert!(
            manager
                .copy_file(1, 0, -1, 2, original.to_string_lossy().into_owned())
                .is_err()
        );
        assert_eq!(fs::read(&original).unwrap(), b"original");
        let destination = temporary.path().join("copy.litematic");
        manager
            .copy_file(1, 0, -1, 2, destination.to_string_lossy().into_owned())
            .unwrap();
        fs::write(&destination, b"do not replace").unwrap();
        assert!(
            manager
                .copy_file(1, 0, -1, 2, destination.to_string_lossy().into_owned())
                .is_err()
        );
        assert_eq!(fs::read(&destination).unwrap(), b"do not replace");
    }
    #[test]
    fn file_manager_returns_exact_versions_without_using_ui_labels() {
        let temporary = tempfile::tempdir().unwrap();
        let manager = FileManager {
            data_dir: temporary.path().to_owned(),
        };
        let mut blocks = BlockStatePosList::default();
        blocks.add_by_pos(
            0,
            0,
            0,
            Arc::new(BlockData {
                id: BlockId {
                    name: "minecraft:stone".into(),
                },
                properties: Default::default(),
            }),
        );
        let data = SchematicData::new(
            blocks,
            Default::default(),
            Default::default(),
            Size {
                width: 2,
                height: 2,
                length: 2,
            },
        );
        for (format, subtype, target, expected, ext) in [
            (1, -1, None, 3578, "nbt"),
            (2, 6, None, 3578, "litematic"),
            (3, 0, None, 3578, "schem"),
            (3, 1, None, 3578, "schem"),
            (6, -1, Some(5), 5, "schematic"),
        ] {
            let options = ExportOptions {
                format,
                subtype,
                target_data_version: target,
                overrides: Vec::new(),
                include_air: false,
            };
            let bytes = encode(&data, &options, Some(3578)).unwrap();
            let stored_subtype = if format == 2 { -1 } else { subtype };
            manager
                .save_schematic_data(1, bytes, 0, stored_subtype, format, ext.into())
                .unwrap();
            let (parsed, version) = manager
                .get_schematic_with_version(1, 0, stored_subtype, format)
                .unwrap();
            assert_eq!(version, Some(expected));
            assert_eq!(parsed.size, data.size);
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
        return Err(anyhow::anyhow!(
            "The directory still exists: {:?}",
            path.as_ref()
        ));
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
