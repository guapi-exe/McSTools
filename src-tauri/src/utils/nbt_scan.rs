//! Backported from new_mcs (c7b2359); shared bounded source preflight.
use crate::utils::parse_limits::ParseLimits;
use crate::utils::schematic_data::SchematicError;
use flate2::bufread::GzDecoder;
use serde::de::DeserializeOwned;
use std::io::{self, BufReader, Cursor, Read};

const TAG_END: u8 = 0;
const TAG_BYTE: u8 = 1;
const TAG_SHORT: u8 = 2;
const TAG_INT: u8 = 3;
const TAG_LONG: u8 = 4;
const TAG_FLOAT: u8 = 5;
const TAG_DOUBLE: u8 = 6;
const TAG_BYTE_ARRAY: u8 = 7;
const TAG_STRING: u8 = 8;
const TAG_LIST: u8 = 9;
const TAG_COMPOUND: u8 = 10;
const TAG_INT_ARRAY: u8 = 11;
const TAG_LONG_ARRAY: u8 = 12;
const HARD_MAX_NBT_DEPTH: usize = 512;

/// Validate before allocating the NBT tree, then deserialize directly from a
/// second bounded gzip stream. This avoids retaining the entire decompressed
/// source alongside fastnbt's owned arrays and block records.
pub(crate) fn read_gzip_java_nbt<T: DeserializeOwned>(
    data: &[u8],
    limits: &ParseLimits,
) -> Result<T, SchematicError> {
    scan_gzip_java_nbt(data, limits)?;
    let reader = BufReader::with_capacity(
        64 * 1024,
        GzDecoder::new(data).take(limits.max_decompressed_bytes as u64),
    );
    fastnbt::from_reader_with_opts(reader, deserializer_options(limits))
        .map_err(SchematicError::Nbt)
}

/// fastnbt shares one cap between lists and packed primitive arrays. Only use
/// these options after our preflight: it enforces the stricter list/tag caps
/// and accounts for each array's element width and total decoded byte budget.
pub(crate) fn deserializer_options(limits: &ParseLimits) -> fastnbt::DeOpts {
    fastnbt::DeOpts::new().max_seq_len(
        limits
            .max_nbt_sequence_len
            .max(limits.max_decompressed_bytes),
    )
}

pub(crate) fn scan_gzip_java_nbt(data: &[u8], limits: &ParseLimits) -> Result<(), SchematicError> {
    if data.len() > limits.max_input_bytes {
        return Err(SchematicError::LimitExceeded(format!(
            "compressed NBT input is {} bytes; limit is {}",
            data.len(),
            limits.max_input_bytes
        )));
    }

    let max_plus_one = limits
        .max_decompressed_bytes
        .checked_add(1)
        .ok_or_else(|| {
            SchematicError::LimitExceeded("decompressed byte limit overflow".to_string())
        })?;
    let mut reader =
        BufReader::with_capacity(64 * 1024, GzDecoder::new(data).take(max_plus_one as u64));
    scan_reader_nbt(&mut reader, limits, false)?;
    // bufread::GzDecoder does not swallow bytes following the first member.
    // Reject concatenated members/junk instead of hiding an unchecked payload.
    if !reader.into_inner().into_inner().into_inner().is_empty() {
        return Err(SchematicError::NbtPreflight(
            "trailing bytes after gzip member".into(),
        ));
    }
    Ok(())
}

pub(crate) fn scan_java_nbt(input: &[u8], limits: &ParseLimits) -> Result<(), SchematicError> {
    limits.validate_input(input.len())?;
    scan_reader_nbt(Cursor::new(input), limits, false)
}

pub(crate) fn scan_little_endian_nbt(
    input: &[u8],
    limits: &ParseLimits,
) -> Result<(), SchematicError> {
    limits.validate_input(input.len())?;
    scan_reader_nbt(Cursor::new(input), limits, true)
}

pub(crate) fn read_raw_java_nbt<T: DeserializeOwned>(
    data: &[u8],
    limits: &ParseLimits,
) -> Result<T, SchematicError> {
    scan_java_nbt(data, limits)?;
    fastnbt::from_bytes_with_opts(data, deserializer_options(limits)).map_err(SchematicError::Nbt)
}

fn scan_reader_nbt<R: Read>(
    reader: R,
    limits: &ParseLimits,
    little_endian: bool,
) -> Result<(), SchematicError> {
    if limits.max_nbt_depth > HARD_MAX_NBT_DEPTH {
        return Err(SchematicError::LimitExceeded(format!(
            "configured NBT depth {} exceeds scanner safety cap {HARD_MAX_NBT_DEPTH}",
            limits.max_nbt_depth
        )));
    }
    Scanner {
        reader,
        offset: 0,
        tags_seen: 0,
        allocation_bytes: 0,
        limits,
        little_endian,
    }
    .scan_root()
}

struct Scanner<'a, R> {
    reader: R,
    offset: usize,
    tags_seen: usize,
    allocation_bytes: usize,
    limits: &'a ParseLimits,
    little_endian: bool,
}

impl<R: Read> Scanner<'_, R> {
    fn scan_root(mut self) -> Result<(), SchematicError> {
        let tag = self.read_u8()?;
        if tag != TAG_COMPOUND {
            return Err(self.malformed(format!("root tag must be Compound (10), got {tag}")));
        }
        self.read_string("root name")?;
        self.bump_tags(1)?;
        self.scan_payload(TAG_COMPOUND, 1)?;
        if self.reader.read(&mut [0])? != 0 {
            return Err(self.malformed("trailing bytes after root Compound".to_string()));
        }
        Ok(())
    }

    fn scan_payload(&mut self, tag: u8, depth: usize) -> Result<(), SchematicError> {
        if depth > self.limits.max_nbt_depth {
            return Err(SchematicError::LimitExceeded(format!(
                "NBT depth {depth} exceeds limit {}",
                self.limits.max_nbt_depth
            )));
        }

        match tag {
            TAG_BYTE => self.skip(1),
            TAG_SHORT => self.skip(2),
            TAG_INT | TAG_FLOAT => self.skip(4),
            TAG_LONG | TAG_DOUBLE => self.skip(8),
            TAG_BYTE_ARRAY => self.scan_array(1, "ByteArray"),
            TAG_STRING => self.read_string("string payload").map(|_| ()),
            TAG_LIST => self.scan_list(depth),
            TAG_COMPOUND => self.scan_compound(depth),
            TAG_INT_ARRAY => self.scan_array(4, "IntArray"),
            TAG_LONG_ARRAY => self.scan_array(8, "LongArray"),
            TAG_END => Err(self.malformed("unexpected End tag payload".to_string())),
            other => Err(self.malformed(format!("unknown NBT tag id {other}"))),
        }
    }

    fn scan_compound(&mut self, depth: usize) -> Result<(), SchematicError> {
        loop {
            let tag = self.read_u8()?;
            if tag == TAG_END {
                return Ok(());
            }
            self.bump_tags(1)?;
            self.read_string("tag name")?;
            self.scan_payload(tag, depth + 1)?;
        }
    }

    fn scan_list(&mut self, depth: usize) -> Result<(), SchematicError> {
        let element_tag = self.read_u8()?;
        if element_tag > TAG_LONG_ARRAY {
            return Err(self.malformed(format!("unknown list element tag {element_tag}")));
        }
        let length = self.read_sequence_len("List", self.limits.max_nbt_sequence_len)?;
        if element_tag == TAG_END {
            if length == 0 {
                return Ok(());
            }
            return Err(self.malformed("non-empty List cannot contain End tags".to_string()));
        }

        self.bump_tags(length)?;
        if depth + 1 > self.limits.max_nbt_depth {
            return Err(SchematicError::LimitExceeded(format!(
                "NBT depth {} exceeds limit {}",
                depth + 1,
                self.limits.max_nbt_depth
            )));
        }

        if let Some(width) = fixed_payload_width(element_tag) {
            let bytes = length.checked_mul(width).ok_or_else(|| {
                SchematicError::NbtPreflight("List byte length overflow".to_string())
            })?;
            return self.skip(bytes);
        }

        for _ in 0..length {
            self.scan_payload(element_tag, depth + 1)?;
        }
        Ok(())
    }

    fn scan_array(&mut self, element_width: usize, label: &str) -> Result<(), SchematicError> {
        let length =
            self.read_sequence_len(label, self.limits.max_decompressed_bytes / element_width)?;
        let bytes = length
            .checked_mul(element_width)
            .ok_or_else(|| SchematicError::NbtPreflight(format!("{label} byte length overflow")))?;
        self.account_allocation(bytes)?;
        self.skip(bytes)
    }

    fn read_sequence_len(&mut self, label: &str, maximum: usize) -> Result<usize, SchematicError> {
        let length = self.read_i32()?;
        if length < 0 {
            return Err(self.malformed(format!("{label} has negative length {length}")));
        }
        let length = length as usize;
        if length > maximum {
            return Err(SchematicError::LimitExceeded(format!(
                "NBT {label} length {length} exceeds limit {}",
                maximum
            )));
        }
        Ok(length)
    }

    fn read_string(&mut self, label: &str) -> Result<(), SchematicError> {
        let length = usize::from(self.read_u16()?);
        if length > self.limits.max_nbt_string_bytes {
            return Err(SchematicError::LimitExceeded(format!(
                "NBT {label} length {length} exceeds limit {}",
                self.limits.max_nbt_string_bytes
            )));
        }
        self.account_allocation(length)?;
        self.skip(length)
    }

    fn bump_tags(&mut self, count: usize) -> Result<(), SchematicError> {
        let bytes = count
            .checked_mul(std::mem::size_of::<fastnbt::Value>() + std::mem::size_of::<String>())
            .ok_or_else(|| {
                SchematicError::LimitExceeded("NBT allocation accounting overflow".into())
            })?;
        self.account_allocation(bytes)?;
        self.tags_seen = self
            .tags_seen
            .checked_add(count)
            .ok_or_else(|| SchematicError::NbtPreflight("NBT tag count overflow".to_string()))?;
        if self.tags_seen > self.limits.max_nbt_tags {
            return Err(SchematicError::LimitExceeded(format!(
                "NBT tag count {} exceeds limit {}",
                self.tags_seen, self.limits.max_nbt_tags
            )));
        }
        Ok(())
    }

    fn account_allocation(&mut self, bytes: usize) -> Result<(), SchematicError> {
        self.allocation_bytes = self.allocation_bytes.checked_add(bytes).ok_or_else(|| {
            SchematicError::LimitExceeded("NBT allocation accounting overflow".into())
        })?;
        self.limits.check(
            "estimated NBT allocation bytes",
            self.allocation_bytes,
            self.limits.max_nbt_allocation_bytes,
        )
    }

    fn read_u8(&mut self) -> Result<u8, SchematicError> {
        Ok(self.read::<1>()?[0])
    }

    fn read_u16(&mut self) -> Result<u16, SchematicError> {
        let bytes = self.read()?;
        Ok(if self.little_endian {
            u16::from_le_bytes(bytes)
        } else {
            u16::from_be_bytes(bytes)
        })
    }

    fn read_i32(&mut self) -> Result<i32, SchematicError> {
        let bytes = self.read()?;
        Ok(if self.little_endian {
            i32::from_le_bytes(bytes)
        } else {
            i32::from_be_bytes(bytes)
        })
    }

    fn skip(&mut self, length: usize) -> Result<(), SchematicError> {
        let end = self.checked_end(length)?;
        let read = io::copy(
            &mut self.reader.by_ref().take(length as u64),
            &mut io::sink(),
        )?;
        if read != length as u64 {
            return Err(self.malformed(format!(
                "truncated payload: need {length} bytes, {read} remain"
            )));
        }
        self.offset = end;
        Ok(())
    }

    fn read<const N: usize>(&mut self) -> Result<[u8; N], SchematicError> {
        let end = self.checked_end(N)?;
        let mut bytes = [0; N];
        if let Err(error) = self.reader.read_exact(&mut bytes) {
            return Err(if error.kind() == io::ErrorKind::UnexpectedEof {
                self.malformed(format!("truncated payload: need {N} bytes"))
            } else {
                SchematicError::Io(error)
            });
        }
        self.offset = end;
        Ok(bytes)
    }

    fn checked_end(&self, length: usize) -> Result<usize, SchematicError> {
        let end = self
            .offset
            .checked_add(length)
            .ok_or_else(|| SchematicError::NbtPreflight("NBT offset overflow".to_string()))?;
        if end > self.limits.max_decompressed_bytes {
            return Err(SchematicError::LimitExceeded(format!(
                "schematic expands beyond {} bytes",
                self.limits.max_decompressed_bytes
            )));
        }
        Ok(end)
    }

    fn malformed(&self, message: String) -> SchematicError {
        SchematicError::NbtPreflight(format!("at byte {}: {message}", self.offset))
    }
}

fn fixed_payload_width(tag: u8) -> Option<usize> {
    match tag {
        TAG_BYTE => Some(1),
        TAG_SHORT => Some(2),
        TAG_INT | TAG_FLOAT => Some(4),
        TAG_LONG | TAG_DOUBLE => Some(8),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::Compression;
    use flate2::write::GzEncoder;
    use std::io::Write;

    fn gzip(raw: &[u8]) -> Vec<u8> {
        let mut encoder = GzEncoder::new(Vec::new(), Compression::fast());
        encoder.write_all(raw).unwrap();
        encoder.finish().unwrap()
    }

    fn nested_compounds(levels: usize) -> Vec<u8> {
        let mut raw = vec![TAG_COMPOUND, 0, 0];
        for _ in 0..levels {
            raw.extend_from_slice(&[TAG_COMPOUND, 0, 0]);
        }
        raw.extend(std::iter::repeat_n(TAG_END, levels + 1));
        raw
    }

    #[test]
    fn rejects_nbt_deeper_than_configured_limit() {
        let limits = ParseLimits {
            max_nbt_depth: 3,
            ..ParseLimits::default()
        };
        let error = read_gzip_java_nbt::<fastnbt::Value>(&gzip(&nested_compounds(4)), &limits)
            .expect_err("deep NBT must be rejected");
        assert!(matches!(error, SchematicError::LimitExceeded(_)));
    }

    #[test]
    fn rejects_concatenated_gzip_members_and_unknown_empty_list_tags() {
        let valid = [TAG_COMPOUND, 0, 0, TAG_END];
        let mut compressed = gzip(&valid);
        compressed.extend(gzip(&valid));
        assert!(
            read_gzip_java_nbt::<fastnbt::Value>(&compressed, &ParseLimits::default())
                .unwrap_err()
                .to_string()
                .contains("trailing bytes after gzip")
        );
        let invalid_list = [
            TAG_COMPOUND,
            0,
            0,
            TAG_LIST,
            0,
            1,
            b'x',
            13,
            0,
            0,
            0,
            0,
            TAG_END,
        ];
        assert!(scan_java_nbt(&invalid_list, &ParseLimits::default()).is_err());
    }

    #[test]
    fn value_slot_budget_precedes_large_list_allocation() {
        let limits = ParseLimits {
            max_nbt_allocation_bytes: 512,
            ..ParseLimits::default()
        };
        let raw = [
            TAG_COMPOUND,
            0,
            0,
            TAG_LIST,
            0,
            1,
            b'x',
            TAG_BYTE,
            0,
            0,
            0,
            100,
        ];
        let error = read_gzip_java_nbt::<fastnbt::Value>(&gzip(&raw), &limits).unwrap_err();
        assert!(error.to_string().contains("estimated NBT allocation bytes"));
    }

    #[test]
    fn raw_and_little_endian_input_have_the_same_structural_guards() {
        let mut raw = vec![TAG_COMPOUND, 0, 0, TAG_INT_ARRAY, 1, 0, b'x'];
        raw.extend_from_slice(&i32::MAX.to_le_bytes());
        assert!(matches!(
            scan_little_endian_nbt(&raw, &ParseLimits::default()),
            Err(SchematicError::LimitExceeded(_))
        ));
        let limits = ParseLimits {
            max_input_bytes: 3,
            ..ParseLimits::default()
        };
        assert!(scan_java_nbt(&[10, 0, 0, 0], &limits).is_err());
        assert!(scan_little_endian_nbt(&[10, 0, 0, 0], &limits).is_err());
    }

    #[test]
    fn rejects_oversized_compressed_input_before_gzip_decode() {
        let limits = ParseLimits {
            max_input_bytes: 1,
            ..ParseLimits::default()
        };
        let error = read_gzip_java_nbt::<fastnbt::Value>(&[0, 1], &limits)
            .expect_err("oversized compressed input must fail before gzip decoding");
        assert!(matches!(error, SchematicError::LimitExceeded(_)));
    }

    #[test]
    fn rejects_declared_list_before_reading_payload() {
        let mut raw = vec![TAG_COMPOUND, 0, 0, TAG_LIST, 0, 1, b'x', TAG_BYTE];
        raw.extend_from_slice(&101_i32.to_be_bytes());
        let limits = ParseLimits {
            max_nbt_sequence_len: 100,
            ..ParseLimits::default()
        };
        let error = read_gzip_java_nbt::<fastnbt::Value>(&gzip(&raw), &limits)
            .expect_err("oversized List must be rejected before payload allocation");
        assert!(matches!(error, SchematicError::LimitExceeded(_)));
    }

    #[test]
    fn primitive_arrays_are_byte_bounded_not_list_entry_bounded() {
        let limits = ParseLimits {
            max_nbt_sequence_len: 2,
            max_decompressed_bytes: 256,
            ..ParseLimits::default()
        };
        for (tag, width) in [(TAG_BYTE_ARRAY, 1), (TAG_INT_ARRAY, 4), (TAG_LONG_ARRAY, 8)] {
            let mut raw = vec![TAG_COMPOUND, 0, 0, tag, 0, 1, b'a'];
            raw.extend_from_slice(&8_i32.to_be_bytes());
            raw.resize(raw.len() + 8 * width, 0);
            raw.push(TAG_END);
            // Exercises both preflight AND fastnbt's shared sequence option.
            let actual: fastnbt::Value = read_gzip_java_nbt(&gzip(&raw), &limits).unwrap();
            assert_eq!(actual, fastnbt::from_bytes::<fastnbt::Value>(&raw).unwrap());
        }

        // Lists must keep the stricter entry guard even though the library's
        // shared sequence option is relaxed to allow packed primitive arrays.
        let raw = [
            TAG_COMPOUND,
            0,
            0,
            TAG_LIST,
            0,
            1,
            b'a',
            TAG_BYTE,
            0,
            0,
            0,
            3,
            1,
            2,
            3,
            TAG_END,
        ];
        let error = read_gzip_java_nbt::<fastnbt::Value>(&gzip(&raw), &limits).unwrap_err();
        assert!(error.to_string().contains("List length 3 exceeds limit 2"));
    }

    #[test]
    fn primitive_array_width_and_cumulative_bytes_are_checked_before_payload() {
        let limits = ParseLimits {
            max_decompressed_bytes: 64,
            ..ParseLimits::default()
        };
        for (tag, length, label, maximum) in [
            (TAG_BYTE_ARRAY, 65_i32, "ByteArray", 64),
            (TAG_INT_ARRAY, 17, "IntArray", 16),
            (TAG_LONG_ARRAY, 9, "LongArray", 8),
        ] {
            let mut raw = vec![TAG_COMPOUND, 0, 0, tag, 0, 1, b'a'];
            raw.extend_from_slice(&length.to_be_bytes());
            let error = read_gzip_java_nbt::<fastnbt::Value>(&gzip(&raw), &limits).unwrap_err();
            assert!(
                error
                    .to_string()
                    .contains(&format!("{label} length {length} exceeds limit {maximum}"))
            );
        }

        let mut raw = vec![TAG_COMPOUND, 0, 0, TAG_LONG_ARRAY, 0, 1, b'a'];
        raw.extend_from_slice(&8_i32.to_be_bytes());
        // The array alone fits, but not its NBT header and the root tag.
        let error = read_gzip_java_nbt::<fastnbt::Value>(&gzip(&raw), &limits).unwrap_err();
        assert!(
            error
                .to_string()
                .contains("schematic expands beyond 64 bytes")
        );
    }

    #[test]
    fn rejects_oversized_string_payload() {
        let mut raw = vec![TAG_COMPOUND, 0, 0, TAG_STRING, 0, 1, b'x', 0, 5];
        raw.extend_from_slice(b"hello");
        raw.push(TAG_END);
        let limits = ParseLimits {
            max_nbt_string_bytes: 4,
            ..ParseLimits::default()
        };
        let error = scan_java_nbt(&raw, &limits).expect_err("oversized String must be rejected");
        assert!(matches!(error, SchematicError::LimitExceeded(_)));
    }

    #[test]
    fn streaming_deserialization_matches_the_owned_nbt_values() {
        let raw = vec![
            TAG_COMPOUND,
            0,
            0,
            TAG_INT,
            0,
            1,
            b'n',
            0,
            0,
            0,
            42,
            TAG_BYTE_ARRAY,
            0,
            1,
            b'b',
            0,
            0,
            0,
            3,
            0,
            128,
            255,
            TAG_LONG_ARRAY,
            0,
            1,
            b'l',
            0,
            0,
            0,
            1,
            255,
            255,
            255,
            255,
            255,
            255,
            255,
            254,
            TAG_COMPOUND,
            0,
            1,
            b'c',
            TAG_STRING,
            0,
            1,
            b's',
            0,
            2,
            b'o',
            b'k',
            TAG_END,
            TAG_END,
        ];
        let expected: fastnbt::Value = fastnbt::from_bytes(&raw).unwrap();
        let limits = ParseLimits {
            max_decompressed_bytes: raw.len(),
            ..ParseLimits::default()
        };
        let actual: fastnbt::Value = read_gzip_java_nbt(&gzip(&raw), &limits).unwrap();
        assert_eq!(actual, expected);
        let tight = ParseLimits {
            max_decompressed_bytes: raw.len() - 1,
            ..limits
        };
        assert!(matches!(
            read_gzip_java_nbt::<fastnbt::Value>(&gzip(&raw), &tight),
            Err(SchematicError::LimitExceeded(_))
        ));
    }

    #[test]
    fn streaming_preflight_rejects_bad_crc_truncation_trailing_and_negative_arrays() {
        let limits = ParseLimits::default();
        let valid = [TAG_COMPOUND, 0, 0, TAG_END];
        let mut bad_crc = gzip(&valid);
        let crc = bad_crc.len() - 8;
        bad_crc[crc] ^= 1;
        assert!(read_gzip_java_nbt::<fastnbt::Value>(&bad_crc, &limits).is_err());
        for raw in [
            vec![TAG_COMPOUND, 0, 0, TAG_INT, 0, 1, b'a', 0],
            vec![TAG_COMPOUND, 0, 0, TAG_END, 1],
            vec![
                TAG_COMPOUND,
                0,
                0,
                TAG_BYTE_ARRAY,
                0,
                1,
                b'a',
                255,
                255,
                255,
                255,
                TAG_END,
            ],
        ] {
            assert!(matches!(
                read_gzip_java_nbt::<fastnbt::Value>(&gzip(&raw), &limits),
                Err(SchematicError::NbtPreflight(_))
            ));
        }
        let overflow = ParseLimits {
            max_decompressed_bytes: usize::MAX,
            ..limits
        };
        assert!(matches!(
            scan_gzip_java_nbt(&gzip(&valid), &overflow),
            Err(SchematicError::LimitExceeded(_))
        ));
    }

    #[test]
    fn deserializes_above_512_mib_without_a_full_decompressed_source_buffer() {
        #[derive(serde::Deserialize)]
        struct Marker {
            marker: i32,
        }
        // Independent arrays keep the test's own peak allocation small.
        let mut encoder = GzEncoder::new(Vec::new(), Compression::fast());
        encoder
            .write_all(&[
                TAG_COMPOUND,
                0,
                0,
                TAG_LIST,
                0,
                3,
                b'p',
                b'a',
                b'd',
                TAG_BYTE_ARRAY,
            ])
            .unwrap();
        encoder.write_all(&513_i32.to_be_bytes()).unwrap();
        let zeros = [0; 65_536];
        for _ in 0..513 {
            encoder.write_all(&(1024_i32 * 1024).to_be_bytes()).unwrap();
            for _ in 0..16 {
                encoder.write_all(&zeros).unwrap();
            }
        }
        encoder
            .write_all(&[
                TAG_INT, 0, 6, b'm', b'a', b'r', b'k', b'e', b'r', 0, 0, 0, 42, TAG_END,
            ])
            .unwrap();
        let bytes = encoder.finish().unwrap();
        let parsed: Marker = read_gzip_java_nbt(&bytes, &ParseLimits::default()).unwrap();
        assert_eq!(parsed.marker, 42);
    }
}
