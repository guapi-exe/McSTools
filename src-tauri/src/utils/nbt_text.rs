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
