//! Local ZIP transport for the website batch-tool backport. Archive paths are
//! display metadata only: entries are never extracted into the filesystem.
use anyhow::{Context, Result, ensure};
use flate2::read::DeflateDecoder;
use std::{
    collections::HashSet,
    io::{Read, Write},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};

pub const FILE_LIMIT: usize = 1_000;
pub const INPUT_LIMIT: usize = 256 * 1024 * 1024;
pub const ARCHIVE_LIMIT: usize = 128 * 1024 * 1024;
pub const OUTPUT_LIMIT: usize = 512 * 1024 * 1024;
pub fn check_cancel(cancel: &AtomicBool) -> Result<()> {
    ensure!(!cancel.load(Ordering::Acquire), "batch operation cancelled");
    Ok(())
}
pub fn extension(name: &str) -> String {
    name.rsplit_once('.')
        .map(|(_, ext)| ext.to_ascii_lowercase())
        .unwrap_or_default()
}
pub fn supported(name: &str) -> bool {
    matches!(
        extension(name).as_str(),
        "litematic" | "schem" | "schematic" | "nbt" | "mcstructure" | "json"
    )
}
fn bounded_text(value: &str, limit: usize) -> String {
    value
        .chars()
        .scan(0, |size, ch| {
            *size += ch.len_utf8();
            (*size <= limit).then_some(ch)
        })
        .collect()
}
pub fn safe_name(name: &str) -> String {
    let basename = name.rsplit(['/', '\\']).next().unwrap_or("");
    let clean: String = basename
        .chars()
        .map(|c| {
            if c.is_control() || r#"<>:"/\|?*"#.contains(c) {
                '-'
            } else {
                c
            }
        })
        .collect();
    let clean = clean.trim_matches([' ', '.']);
    let (stem, ext) = clean.rsplit_once('.').unwrap_or((clean, ""));
    // Leave room for collision suffixes/extensions on both UTF-8 and UTF-16 filesystems.
    let mut stem = bounded_text(stem.trim_matches([' ', '.']), 180);
    if stem.is_empty() {
        stem = "blueprint".into();
    }
    let device = stem.split('.').next().unwrap_or("").to_ascii_uppercase();
    if matches!(device.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (device.len() == 4
            && (device.starts_with("COM") || device.starts_with("LPT"))
            && matches!(device.as_bytes()[3], b'1'..=b'9'))
    {
        stem.insert(0, '_');
        stem = bounded_text(&stem, 180);
    }
    let ext = bounded_text(ext, 20);
    if ext.is_empty() {
        stem
    } else {
        format!("{stem}.{ext}")
    }
}
pub fn unique_name(name: &str, used: &mut HashSet<String>) -> String {
    let base = safe_name(name);
    if used.insert(base.to_lowercase()) {
        return base;
    }
    let (stem, ext) = base.rsplit_once('.').unwrap_or((&base, ""));
    for suffix in 2.. {
        let suffix = format!("-{suffix}");
        let stem = bounded_text(stem, 180 - suffix.len());
        let candidate = if ext.is_empty() {
            format!("{stem}{suffix}")
        } else {
            format!("{stem}{suffix}.{ext}")
        };
        if used.insert(candidate.to_lowercase()) {
            return candidate;
        }
    }
    unreachable!()
}
#[derive(Debug)]
pub struct ArchiveEntry {
    pub name: String,
    pub archive_name: String,
    pub bytes: Vec<u8>,
}
fn u16_at(bytes: &[u8], at: usize) -> Result<u16> {
    Ok(u16::from_le_bytes(
        bytes
            .get(at..at + 2)
            .context("truncated ZIP field")?
            .try_into()?,
    ))
}
fn u32_at(bytes: &[u8], at: usize) -> Result<u32> {
    Ok(u32::from_le_bytes(
        bytes
            .get(at..at + 4)
            .context("truncated ZIP field")?
            .try_into()?,
    ))
}

pub fn extract(
    source: &[u8],
    max_entries: usize,
    max_bytes: usize,
    cancel: &AtomicBool,
) -> Result<Vec<ArchiveEntry>> {
    let max_bytes = max_bytes.min(INPUT_LIMIT);
    ensure!(
        source.len() <= ARCHIVE_LIMIT && source.len() >= 22,
        "ZIP archive limit is 128 MiB or archive is truncated"
    );
    check_cancel(cancel)?;
    let eocd = (source.len().saturating_sub(65_557)..=source.len() - 22)
        .rev()
        .find(|&at| {
            source.get(at..at + 4) == Some(&[0x50, 0x4b, 0x05, 0x06])
                && u16_at(source, at + 20).is_ok_and(|n| at + 22 + n as usize == source.len())
        })
        .context("ZIP end directory is missing")?;
    let count = u16_at(source, eocd + 10)? as usize;
    ensure!(
        u16_at(source, eocd + 4)? == 0
            && u16_at(source, eocd + 6)? == 0
            && u16_at(source, eocd + 8)? as usize == count,
        "split ZIP archives are not supported"
    );
    ensure!(count <= 16_384, "ZIP has too many directory records");
    let central = u32_at(source, eocd + 16)? as usize;
    let central_size = u32_at(source, eocd + 12)? as usize;
    let central_end = central
        .checked_add(central_size)
        .context("ZIP directory size overflow")?;
    ensure!(
        central_end == eocd,
        "ZIP directory bounds are invalid or ZIP64 is unsupported"
    );
    let mut cursor = central;
    let mut entries = Vec::new();
    let mut total = 0usize;
    let mut names = HashSet::new();
    for _ in 0..count {
        check_cancel(cancel)?;
        ensure!(
            cursor + 46 <= central_end && u32_at(source, cursor)? == 0x02014b50,
            "invalid ZIP directory record"
        );
        let flags = u16_at(source, cursor + 8)?;
        let method = u16_at(source, cursor + 10)?;
        let crc = u32_at(source, cursor + 16)?;
        let compressed = u32_at(source, cursor + 20)? as usize;
        let expanded = u32_at(source, cursor + 24)? as usize;
        let name_len = u16_at(source, cursor + 28)? as usize;
        let next = cursor
            + 46
            + name_len
            + u16_at(source, cursor + 30)? as usize
            + u16_at(source, cursor + 32)? as usize;
        ensure!(next <= central_end, "ZIP directory name exceeds its bounds");
        let raw_name = &source[cursor + 46..cursor + 46 + name_len];
        let archive_name = String::from_utf8_lossy(raw_name).replace('\\', "/");
        let local = u32_at(source, cursor + 42)? as usize;
        let disk = u16_at(source, cursor + 34)?;
        cursor = next;
        if archive_name.ends_with('/') || !supported(&archive_name) {
            continue;
        }
        ensure!(
            flags & 0x41 == 0 && disk == 0,
            "encrypted or split ZIP entries are unsupported"
        );
        ensure!(
            method == 0 || method == 8,
            "ZIP supports only stored/deflate entries"
        );
        ensure!(
            entries.len() < max_entries.min(FILE_LIMIT),
            "batch file limit exceeded"
        );
        ensure!(
            expanded <= max_bytes.saturating_sub(total),
            "ZIP expanded input limit exceeded"
        );
        let local_fields_end = local.checked_add(30).context("ZIP local offset overflow")?;
        ensure!(
            local_fields_end <= central && u32_at(source, local)? == 0x04034b50,
            "invalid ZIP local header"
        );
        ensure!(
            u16_at(source, local + 6)? == flags && u16_at(source, local + 8)? == method,
            "ZIP local and central headers disagree"
        );
        let local_name_len = u16_at(source, local + 26)? as usize;
        let start = local + 30 + local_name_len + u16_at(source, local + 28)? as usize;
        let end = start
            .checked_add(compressed)
            .context("ZIP entry size overflow")?;
        ensure!(
            start <= central
                && end <= central
                && source.get(local + 30..local + 30 + local_name_len) == Some(raw_name),
            "ZIP entry data/name is outside its bounds"
        );
        if flags & 8 == 0 {
            ensure!(
                u32_at(source, local + 14)? == crc
                    && u32_at(source, local + 18)? as usize == compressed
                    && u32_at(source, local + 22)? as usize == expanded,
                "ZIP local entry sizes/CRC disagree"
            );
        }
        let bytes = if method == 0 {
            ensure!(compressed == expanded, "ZIP stored size mismatch");
            source[start..end].to_vec()
        } else {
            let mut decoder = DeflateDecoder::new(&source[start..end]);
            let mut output = Vec::new();
            let mut chunk = [0u8; 64 * 1024];
            loop {
                check_cancel(cancel)?;
                let n = decoder
                    .read(&mut chunk)
                    .context("invalid ZIP deflate stream")?;
                if n == 0 {
                    break;
                }
                ensure!(
                    n <= expanded.saturating_sub(output.len()),
                    "ZIP actual expanded size exceeds its declaration"
                );
                output.extend_from_slice(&chunk[..n]);
            }
            ensure!(
                output.len() == expanded && decoder.total_in() as usize == compressed,
                "ZIP expanded/compressed size mismatch"
            );
            output
        };
        check_cancel(cancel)?;
        ensure!(crc32fast::hash(&bytes) == crc, "ZIP entry CRC mismatch");
        total += bytes.len();
        entries.push(ArchiveEntry {
            name: unique_name(&archive_name, &mut names),
            // This is a display label, never an extraction path or a source of allocations proportional to path length.
            archive_name: if archive_name.len() > 1024 {
                format!("{}…", bounded_text(&archive_name, 1021))
            } else {
                archive_name
            },
            bytes,
        });
    }
    ensure!(cursor == central_end, "ZIP central directory size mismatch");
    ensure!(!entries.is_empty(), "ZIP contains no supported blueprints");
    Ok(entries)
}

/// ZIP32, UTF-8 names, stored entries. Stream directly into a no-clobber temp
/// file rather than retaining a second copy of all batch outputs in memory.
pub fn write_archive<W: Write>(
    writer: &mut W,
    files: &[(String, Arc<Vec<u8>>)],
    cancel: &AtomicBool,
    limit: usize,
) -> Result<usize> {
    ensure!(
        !files.is_empty() && files.len() <= FILE_LIMIT,
        "invalid ZIP output count"
    );
    let mut position = 0usize;
    let mut central = Vec::new();
    let mut names = HashSet::new();
    fn write<W: Write>(out: &mut W, data: &[u8], pos: &mut usize, limit: usize) -> Result<()> {
        ensure!(
            data.len() <= limit.saturating_sub(*pos),
            "batch ZIP output limit exceeded"
        );
        out.write_all(data)?;
        *pos += data.len();
        Ok(())
    }
    for (name, bytes) in files {
        check_cancel(cancel)?;
        ensure!(
            safe_name(name) == *name && names.insert(name.to_lowercase()),
            "unsafe or duplicate ZIP output name"
        );
        ensure!(
            name.len() <= u16::MAX as usize
                && bytes.len() <= u32::MAX as usize
                && position <= u32::MAX as usize,
            "ZIP32 output is too large"
        );
        let offset = position as u32;
        let size = bytes.len() as u32;
        let mut hasher = crc32fast::Hasher::new();
        for chunk in bytes.chunks(64 * 1024) {
            check_cancel(cancel)?;
            hasher.update(chunk);
        }
        let crc = hasher.finalize();
        let mut header = Vec::with_capacity(30);
        header.extend_from_slice(&0x04034b50u32.to_le_bytes());
        for n in [20u16, 0x800, 0, 0, 0x21] {
            header.extend_from_slice(&n.to_le_bytes());
        }
        for n in [crc, size, size] {
            header.extend_from_slice(&n.to_le_bytes());
        }
        header.extend_from_slice(&(name.len() as u16).to_le_bytes());
        header.extend_from_slice(&0u16.to_le_bytes());
        write(writer, &header, &mut position, limit)?;
        write(writer, name.as_bytes(), &mut position, limit)?;
        for chunk in bytes.chunks(64 * 1024) {
            check_cancel(cancel)?;
            write(writer, chunk, &mut position, limit)?;
        }
        central.push((name, crc, size, offset));
    }
    let central_start = position;
    for (name, crc, size, offset) in central {
        check_cancel(cancel)?;
        let mut header = Vec::with_capacity(46);
        header.extend_from_slice(&0x02014b50u32.to_le_bytes());
        for n in [20u16, 20, 0x800, 0, 0, 0x21] {
            header.extend_from_slice(&n.to_le_bytes());
        }
        for n in [crc, size, size] {
            header.extend_from_slice(&n.to_le_bytes());
        }
        for n in [name.len() as u16, 0, 0, 0, 0] {
            header.extend_from_slice(&n.to_le_bytes());
        }
        for n in [0u32, offset] {
            header.extend_from_slice(&n.to_le_bytes());
        }
        write(writer, &header, &mut position, limit)?;
        write(writer, name.as_bytes(), &mut position, limit)?;
    }
    let central_size = position - central_start;
    let mut end = Vec::with_capacity(22);
    end.extend_from_slice(&0x06054b50u32.to_le_bytes());
    for n in [0u16, 0, files.len() as u16, files.len() as u16] {
        end.extend_from_slice(&n.to_le_bytes());
    }
    end.extend_from_slice(&(central_size as u32).to_le_bytes());
    end.extend_from_slice(&(central_start as u32).to_le_bytes());
    end.extend_from_slice(&0u16.to_le_bytes());
    check_cancel(cancel)?;
    write(writer, &end, &mut position, limit)?;
    Ok(position)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn stored(name: &str, bytes: &[u8]) -> Vec<u8> {
        let mut zip = Vec::new();
        write_archive(
            &mut zip,
            &[(name.into(), Arc::new(bytes.to_vec()))],
            &AtomicBool::new(false),
            OUTPUT_LIMIT,
        )
        .unwrap();
        zip
    }
    fn set16(bytes: &mut [u8], at: usize, n: u16) {
        bytes[at..at + 2].copy_from_slice(&n.to_le_bytes());
    }
    fn set32(bytes: &mut [u8], at: usize, n: usize) {
        bytes[at..at + 4].copy_from_slice(&(n as u32).to_le_bytes());
    }
    fn central(zip: &[u8]) -> usize {
        u32_at(zip, zip.len() - 6).unwrap() as usize
    }
    fn deflated(data: &[u8]) -> Vec<u8> {
        let mut zip = stored("a.schem", data);
        let start = 30 + "a.schem".len();
        let old = central(&zip);
        let mut encoder =
            flate2::write::DeflateEncoder::new(Vec::new(), flate2::Compression::default());
        encoder.write_all(data).unwrap();
        let compressed = encoder.finish().unwrap();
        zip.splice(start..old, compressed.iter().copied());
        let center = start + compressed.len();
        let end = zip.len() - 22;
        set16(&mut zip, 8, 8);
        set16(&mut zip, center + 10, 8);
        set32(&mut zip, 18, compressed.len());
        set32(&mut zip, center + 20, compressed.len());
        set32(&mut zip, end + 16, center);
        zip
    }
    #[test]
    fn zip_stored_deflate_unicode_and_crc_round_trip() {
        let cancel = AtomicBool::new(false);
        let bytes = vec![42; 131072];
        for zip in [stored("测试.schem", &bytes), deflated(&bytes)] {
            let decoded = extract(&zip, 1000, INPUT_LIMIT, &cancel).unwrap();
            assert_eq!(decoded.len(), 1);
            assert_eq!(decoded[0].bytes, bytes);
            assert!(extract(&zip, 0, INPUT_LIMIT, &cancel).is_err());
            assert!(extract(&zip, 1000, bytes.len() - 1, &cancel).is_err());
        }
        let mut zip = stored("a.schem", b"valid");
        zip[37] ^= 1;
        assert!(
            extract(&zip, 10, 100, &cancel)
                .unwrap_err()
                .to_string()
                .contains("CRC")
        );
    }
    #[test]
    fn zip_rejects_bombs_encryption_header_mismatch_and_truncation() {
        let cancel = AtomicBool::new(false);
        let valid = deflated(&vec![0; 65536]);
        for end in [0, 1, 20, valid.len() - 1] {
            assert!(extract(&valid[..end], 10, INPUT_LIMIT, &cancel).is_err());
        }
        let mut bomb = valid.clone();
        let center = central(&bomb);
        set32(&mut bomb, 22, 1);
        set32(&mut bomb, center + 24, 1);
        assert!(
            extract(&bomb, 10, INPUT_LIMIT, &cancel)
                .unwrap_err()
                .to_string()
                .contains("actual expanded")
        );
        let mut encrypted = valid.clone();
        let center = central(&encrypted);
        set16(&mut encrypted, center + 8, 0x801);
        assert!(extract(&encrypted, 10, INPUT_LIMIT, &cancel).is_err());
        let mut mismatch = valid.clone();
        set16(&mut mismatch, 8, 0);
        assert!(extract(&mismatch, 10, INPUT_LIMIT, &cancel).is_err());
        let mut zip64 = valid.clone();
        let end = zip64.len() - 22;
        set32(&mut zip64, end + 16, u32::MAX as usize);
        assert!(extract(&zip64, 10, INPUT_LIMIT, &cancel).is_err());
    }
    #[test]
    fn archive_paths_never_become_filesystem_paths_and_names_are_case_insensitive() {
        let mut zip = stored("abcd.schem", b"x");
        let center = central(&zip);
        zip[30..40].copy_from_slice(b"../a.schem");
        zip[center + 46..center + 56].copy_from_slice(b"../a.schem");
        let decoded = extract(&zip, 10, 100, &AtomicBool::new(false)).unwrap();
        assert_eq!(decoded[0].name, "a.schem");
        assert_eq!(decoded[0].archive_name, "../a.schem");
        assert_eq!(safe_name("C:\\folder\\CON.schem"), "_CON.schem");
        assert_eq!(safe_name("../../ . "), "blueprint");
        assert_eq!(safe_name("LPT1.nbt"), "_LPT1.nbt");
        let mut used = HashSet::new();
        assert_eq!(unique_name("A.schem", &mut used), "A.schem");
        assert_eq!(unique_name("a.schem", &mut used), "a-2.schem");
        let mut out = Vec::new();
        assert!(
            write_archive(
                &mut out,
                &[("../a.schem".into(), Arc::new(vec![1]))],
                &AtomicBool::new(false),
                1000
            )
            .is_err()
        );
    }
    #[test]
    fn packaging_is_bounded_and_cancelable_and_accepts_valid_zip_comments() {
        let files = vec![("a.schem".into(), Arc::new(vec![1; 128]))];
        let mut out = Vec::new();
        assert!(write_archive(&mut out, &files, &AtomicBool::new(false), 32).is_err());
        assert!(out.len() <= 32);
        assert!(
            write_archive(
                &mut Vec::new(),
                &files,
                &AtomicBool::new(true),
                OUTPUT_LIMIT
            )
            .is_err()
        );
        let mut zip = stored("a.schem", b"x");
        let comment = b"local archive";
        let at = zip.len() - 2;
        set16(&mut zip, at, comment.len() as u16);
        zip.extend_from_slice(comment);
        assert_eq!(
            extract(&zip, 10, 100, &AtomicBool::new(false)).unwrap()[0].bytes,
            b"x"
        );
        assert!(extract(&zip, 10, 100, &AtomicBool::new(true)).is_err());
    }
    #[test]
    fn long_unicode_collisions_stay_portable_and_streamed_zip_descriptors_are_accepted() {
        let long = format!("{}.mcstructure", "楼😀".repeat(100));
        let device = safe_name(&format!("CON.{}.nbt", "x".repeat(300)));
        assert_eq!(safe_name(&device), device);
        let mut used = HashSet::new();
        for _ in 0..1000 {
            let name = unique_name(&long, &mut used);
            assert!(name.len() < 255 && name.encode_utf16().count() < 255);
            assert_eq!(safe_name(&name), name);
        }
        let mut zip = deflated(b"streamed NBT");
        let old_center = central(&zip);
        let crc = u32_at(&zip, 14).unwrap();
        let compressed = u32_at(&zip, 18).unwrap();
        let expanded = u32_at(&zip, 22).unwrap();
        let descriptor: Vec<u8> = [0x08074b50u32, crc, compressed, expanded]
            .into_iter()
            .flat_map(u32::to_le_bytes)
            .collect();
        zip.splice(old_center..old_center, descriptor);
        let center = old_center + 16;
        set16(&mut zip, 6, 0x808);
        set16(&mut zip, center + 8, 0x808);
        for at in [14, 18, 22] {
            set32(&mut zip, at, 0);
        }
        let end = zip.len() - 22;
        set32(&mut zip, end + 16, center);
        assert_eq!(
            extract(&zip, 10, 100, &AtomicBool::new(false)).unwrap()[0].bytes,
            b"streamed NBT"
        );
    }
}
