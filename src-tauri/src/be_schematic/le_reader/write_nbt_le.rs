use std::collections::HashMap;
use std::io::{self, Write};
use fastnbt::{Tag, Value};

pub fn write_u8(w: &mut impl Write, v: u8) -> io::Result<()> {
    w.write_all(&[v])
}
pub fn write_i8(w: &mut impl Write, v: i8) -> io::Result<()> {
    write_u8(w, v as u8)
}
pub fn write_i16_le(w: &mut impl Write, v: i16) -> io::Result<()> {
    w.write_all(&v.to_le_bytes())
}
pub fn write_i32_le(w: &mut impl Write, v: i32) -> io::Result<()> {
    w.write_all(&v.to_le_bytes())
}
pub fn write_i64_le(w: &mut impl Write, v: i64) -> io::Result<()> {
    w.write_all(&v.to_le_bytes())
}
pub fn write_f32_le(w: &mut impl Write, v: f32) -> io::Result<()> {
    w.write_all(&v.to_le_bytes())
}
pub fn write_f64_le(w: &mut impl Write, v: f64) -> io::Result<()> {
    w.write_all(&v.to_le_bytes())
}

pub fn write_string_le(w: &mut impl Write, s: &str) -> io::Result<()> {
    let len = s.len();
    if len > i16::MAX as usize {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "string too long"));
    }
    write_i16_le(w, len as i16)?;
    w.write_all(s.as_bytes())
}

pub fn write_tag(w: &mut impl Write, name: &str, val: &Value) -> io::Result<()> {
    let tag_id = match val {
        Value::Byte(_) => Tag::Byte,
        Value::Short(_) => Tag::Short,
        Value::Int(_) => Tag::Int,
        Value::Long(_) => Tag::Long,
        Value::Float(_) => Tag::Float,
        Value::Double(_) => Tag::Double,
        Value::ByteArray(_) => Tag::ByteArray,
        Value::String(_) => Tag::String,
        Value::List(_) => Tag::List,
        Value::Compound(_) => Tag::Compound,
        Value::IntArray(_) => Tag::IntArray,
        Value::LongArray(_) => Tag::LongArray,
    };
    write_u8(w, tag_id as u8)?;
    write_string_le(w, name)?;
    write_tag_payload(w, val)
}

pub fn write_tag_payload(w: &mut impl Write, val: &Value) -> io::Result<()> {
    match val {
        Value::Byte(v) => write_i8(w, *v),
        Value::Short(v) => write_i16_le(w, *v),
        Value::Int(v) => write_i32_le(w, *v),
        Value::Long(v) => write_i64_le(w, *v),
        Value::Float(v) => write_f32_le(w, *v),
        Value::Double(v) => write_f64_le(w, *v),
        Value::ByteArray(arr) => {
            write_i32_le(w, arr.len() as i32)?;
            for b in arr.iter() {
                write_i8(w, *b)?;
            }
            Ok(())
        }
        Value::String(s) => write_string_le(w, s),
        Value::List(list) => {
            let tag_id = if let Some(first) = list.first() {
                match first {
                    Value::Byte(_) => Tag::Byte,
                    Value::Short(_) => Tag::Short,
                    Value::Int(_) => Tag::Int,
                    Value::Long(_) => Tag::Long,
                    Value::Float(_) => Tag::Float,
                    Value::Double(_) => Tag::Double,
                    Value::ByteArray(_) => Tag::ByteArray,
                    Value::String(_) => Tag::String,
                    Value::List(_) => Tag::List,
                    Value::Compound(_) => Tag::Compound,
                    Value::IntArray(_) => Tag::IntArray,
                    Value::LongArray(_) => Tag::LongArray,
                }
            } else {
                Tag::End
            };
            write_u8(w, tag_id as u8)?;
            write_i32_le(w, list.len() as i32)?;
            for v in list {
                write_tag_payload(w, v)?;
            }
            Ok(())
        }
        Value::Compound(map) => {
            for (k, v) in map {
                write_tag(w, k, v)?;
            }
            // Compound 结尾 TAG_End
            write_u8(w, 0)
        }
        Value::IntArray(arr) => {
            write_i32_le(w, arr.len() as i32)?;
            for v in arr.iter() {
                write_i32_le(w, *v)?;
            }
            Ok(())
        }
        Value::LongArray(arr) => {
            write_i32_le(w, arr.len() as i32)?;
            for v in arr.iter() {
                write_i64_le(w, *v)?;
            }
            Ok(())
        }
    }
}

/// 写入根 Compound
pub fn save_nbt_le(mut w: impl Write, name: &str, root: &HashMap<String, Value>) -> io::Result<()> {
    write_u8(&mut w, Tag::Compound as u8)?;
    write_string_le(&mut w, name)?;
    for (k, v) in root {
        write_tag(&mut w, k, v)?;
    }
    write_u8(&mut w, 0)?; // TAG_End
    Ok(())
}
