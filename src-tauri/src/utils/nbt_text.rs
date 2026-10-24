//! Text-editor output has a much smaller budget than source import. A tiny
//! compressed array must not expand into hundreds of MB of SNBT in WebView.
use crate::utils::schematic_data::SchematicError;
use fastnbt::Value;

pub const MAX_TEXT_BYTES: usize = 8 * 1024 * 1024;

pub fn bounded_snbt(value: &Value) -> Result<String, SchematicError> {
    if !fits_text_budget(value, MAX_TEXT_BYTES) {
        // The existing UI treats an empty text preview as unavailable. The
        // blueprint itself remains available for analysis/conversion/export.
        return Ok(String::new());
    }
    Ok(fastsnbt::to_string(value)?)
}

fn fits_text_budget(value: &Value, mut maximum: usize) -> bool {
    fn visit(value: &Value, left: &mut usize, depth: usize) -> Option<()> {
        if depth > 128 {
            return None;
        }
        // Scalar suffixes, separators, and empty collection delimiters fit
        // within this allowance. Strings can double due to escaping.
        *left = left.checked_sub(32)?;
        match value {
            Value::String(text) => *left = left.checked_sub(text.len().checked_mul(2)?)?,
            Value::ByteArray(values) => *left = left.checked_sub(values.len().checked_mul(6)?)?,
            Value::IntArray(values) => *left = left.checked_sub(values.len().checked_mul(12)?)?,
            Value::LongArray(values) => *left = left.checked_sub(values.len().checked_mul(22)?)?,
            Value::List(values) => {
                for value in values {
                    visit(value, left, depth + 1)?;
                }
            }
            Value::Compound(values) => {
                for (key, value) in values {
                    *left = left.checked_sub(key.len().checked_mul(2)?.checked_add(4)?)?;
                    visit(value, left, depth + 1)?;
                }
            }
            _ => (),
        }
        Some(())
    }
    visit(value, &mut maximum, 1).is_some()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    #[test]
    fn empty_compounds_keep_their_delimiters_in_fields_and_lists() {
        let empty = Value::Compound(HashMap::new());
        for value in [
            empty.clone(),
            Value::Compound(HashMap::from([("Empty".into(), empty.clone())])),
            Value::Compound(HashMap::from([(
                "List".into(),
                Value::List(vec![empty.clone(), empty.clone()]),
            )])),
        ] {
            let text = bounded_snbt(&value).unwrap();
            assert!(text.contains("{}"), "missing empty compound: {text:?}");
            assert_eq!(fastsnbt::from_str::<Value>(&text).unwrap(), value);
        }
    }

    #[test]
    #[ignore = "cross-runtime regression; requires the frontend Node dependencies"]
    fn native_preview_survives_frontend_worker_roundtrip() {
        use crate::utils::{nbt_scan::read_gzip_java_nbt, parse_limits::ParseLimits};
        use std::io::Write;
        use std::process::{Command, Stdio};

        let path = std::env::var_os("MCS_SOURCE_TEST_PATH")
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|| {
                std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                    .join("schematic/4a4bb16a-9c60-4ef6-a225-b75396b0daf2.schem")
            });
        // Read-only: no app database, credentials, or source-file writes.
        assert!(std::fs::metadata(&path).unwrap().len() <= 8 * 1024 * 1024);
        let bytes = std::fs::read(&path).unwrap();
        let limits = ParseLimits {
            max_input_bytes: 8 * 1024 * 1024,
            max_decompressed_bytes: 16 * 1024 * 1024,
            max_nbt_allocation_bytes: 64 * 1024 * 1024,
            ..ParseLimits::default()
        };
        let original: Value = read_gzip_java_nbt(&bytes, &limits).unwrap();
        let scalar_and_empty_values = Value::Compound(HashMap::from([
            ("123".into(), Value::Int(1)),
            ("true".into(), Value::Byte(1)),
            ("short".into(), Value::Short(-32768)),
            ("float".into(), Value::Float(1.0)),
            ("double".into(), Value::Double(0.0)),
            ("negative_zero".into(), Value::Float(-0.0)),
            ("scientific".into(), Value::Double(1e30)),
            ("long".into(), Value::Long(i64::MAX)),
            (
                "bytes".into(),
                Value::ByteArray(fastnbt::ByteArray::new(vec![-128, -1, 127])),
            ),
            (
                "ints".into(),
                Value::IntArray(fastnbt::IntArray::new(vec![i32::MIN, i32::MAX])),
            ),
            (
                "longs".into(),
                Value::LongArray(fastnbt::LongArray::new(vec![i64::MIN, i64::MAX])),
            ),
            ("empty".into(), Value::Compound(HashMap::new())),
            (
                "list".into(),
                Value::List(vec![Value::Compound(HashMap::new()); 20]),
            ),
            (
                "escaped".into(),
                Value::String("引号\"、反斜线\\和换行\n".into()),
            ),
        ]));
        for original in [original, scalar_and_empty_values] {
            let text = bounded_snbt(&original).unwrap();
            assert!(
                !text.is_empty(),
                "test source exceeds the text preview budget"
            );
            let mut child = Command::new("node")
                .arg("scripts/testing/source-roundtrip.mjs")
                .current_dir(
                    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                        .parent()
                        .unwrap(),
                )
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .unwrap();
            child
                .stdin
                .take()
                .unwrap()
                .write_all(text.as_bytes())
                .unwrap();
            let result = child.wait_with_output().unwrap();
            assert!(
                result.status.success(),
                "frontend parse failed: {}",
                String::from_utf8_lossy(&result.stderr)
            );
            let returned = String::from_utf8(result.stdout).unwrap();
            let restored: Value = fastsnbt::from_str(&returned).unwrap();
            assert!(
                restored == original,
                "source round trip changed an NBT value or type"
            );
            println!(
                "source round trip OK; native text {} bytes, returned {} bytes",
                text.len(),
                returned.len()
            );
        }
    }

    #[test]
    fn checks_text_expansion_before_serializing_and_keeps_small_nbt() {
        let small = Value::Compound(HashMap::from([(
            "quoted\\key".into(),
            Value::String("a\"\\b".into()),
        )]));
        let text = bounded_snbt(&small).unwrap();
        assert_eq!(fastsnbt::from_str::<Value>(&text).unwrap(), small);
        let large = Value::Compound(HashMap::from([(
            "array".into(),
            Value::ByteArray(fastnbt::ByteArray::new(vec![-128; MAX_TEXT_BYTES / 6 + 1])),
        )]));
        assert!(bounded_snbt(&large).unwrap().is_empty());
    }
}
