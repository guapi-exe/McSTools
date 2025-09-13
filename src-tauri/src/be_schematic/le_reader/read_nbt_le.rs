use std::collections::HashMap;
use std::io::{self, Read};
use fastnbt::{ByteArray, IntArray, LongArray, Tag, Value};

pub fn read_exact<const N: usize>(r: &mut impl Read) -> io::Result<[u8; N]> {
    let mut buf = [0u8; N];
    r.read_exact(&mut buf)?;
    Ok(buf)
}

/// Read primitives in little-endian
pub fn read_u8(r: &mut impl Read) -> io::Result<u8> {
    let b = read_exact::<1>(r)?;
    Ok(b[0])
}
pub fn read_i8(r: &mut impl Read) -> io::Result<i8> {
    Ok(read_u8(r)? as i8)
}
pub fn read_i16_le(r: &mut impl Read) -> io::Result<i16> {
    let b = read_exact::<2>(r)?;
    Ok(i16::from_le_bytes(b))
}
pub fn read_i32_le(r: &mut impl Read) -> io::Result<i32> {
    let b = read_exact::<4>(r)?;
    Ok(i32::from_le_bytes(b))
}
pub fn read_i64_le(r: &mut impl Read) -> io::Result<i64> {
    let b = read_exact::<8>(r)?;
    Ok(i64::from_le_bytes(b))
}
pub fn read_f32_le(r: &mut impl Read) -> io::Result<f32> {
    let b = read_exact::<4>(r)?;
    Ok(f32::from_le_bytes(b))
}
pub fn read_f64_le(r: &mut impl Read) -> io::Result<f64> {
    let b = read_exact::<8>(r)?;
    Ok(f64::from_le_bytes(b))
}

/// BE使用小端在前I16数组存储STR数据
pub fn read_string_le(r: &mut impl Read) -> io::Result<String> {
    let ln = read_i16_le(r)?;
    if ln < 0 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "negative string length",
        ));
    }
    let mut buf = vec![0u8; ln as usize];
    r.read_exact(&mut buf)?;
    Ok(String::from_utf8(buf).map_err(|e| {
        io::Error::new(io::ErrorKind::InvalidData, format!("utf8 error: {}", e))
    })?)
}
pub fn tag_from_u8(b: u8) -> io::Result<Tag> {
    match b {
        0 => Ok(Tag::End),
        1 => Ok(Tag::Byte),
        2 => Ok(Tag::Short),
        3 => Ok(Tag::Int),
        4 => Ok(Tag::Long),
        5 => Ok(Tag::Float),
        6 => Ok(Tag::Double),
        7 => Ok(Tag::ByteArray),
        8 => Ok(Tag::String),
        9 => Ok(Tag::List),
        10 => Ok(Tag::Compound),
        11 => Ok(Tag::IntArray),
        12 => Ok(Tag::LongArray),
        _ => Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!("unknown tag id {}", b),
        )),
    }
}
pub fn read_tag_payload(r: &mut impl Read, tag_id: Tag) -> io::Result<Value> {
    match tag_id {
        Tag::End => Err(io::Error::new(io::ErrorKind::InvalidData, "unexpected TAG_End")),
        Tag::Byte => Ok(Value::Byte(read_i8(r)?)),
        Tag::Short => Ok(Value::Short(read_i16_le(r)?)),
        Tag::Int => Ok(Value::Int(read_i32_le(r)?)),
        Tag::Long => Ok(Value::Long(read_i64_le(r)?)),
        Tag::Float => Ok(Value::Float(read_f32_le(r)?)),
        Tag::Double => Ok(Value::Double(read_f64_le(r)?)),

        Tag::ByteArray => {
            let len = read_i32_le(r)?; // 长度是 i32
            if len < 0 {
                return Err(io::Error::new(io::ErrorKind::InvalidData, "negative byte array length"));
            }
            let mut buf = vec![0u8; len as usize];
            r.read_exact(&mut buf)?;
            let vec_i8: Vec<i8> = buf.into_iter().map(|b| b as i8).collect();
            Ok(Value::ByteArray(ByteArray::new(vec_i8)))
        }

        Tag::String => Ok(Value::String(read_string_le(r)?)),

        Tag::List => {
            let elem_tag = read_u8(r)?;
            let len = read_i32_le(r)?;
            if len < 0 {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    "negative list length",
                ));
            }
            let mut v = Vec::with_capacity(len as usize);
            for _ in 0..len {
                let el = read_tag_payload(r, tag_from_u8(elem_tag)?)?;
                v.push(el);
            }
            Ok(Value::List(v))
        }
        Tag::Compound => {
            let mut map = HashMap::new();
            loop {
                let t = read_u8(r)?;
                if tag_from_u8(t)? == Tag::End {
                    break;
                }
                let name = read_string_le(r)?;
                let payload = read_tag_payload(r, tag_from_u8(t)?)?;
                map.insert(name, payload);
            }
            Ok(Value::Compound(map))
        }
        Tag::IntArray => {
            let len = read_i32_le(r)?;
            if len < 0 {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    "negative int array length",
                ));
            }
            let mut v = Vec::with_capacity(len as usize);
            for _ in 0..len {
                v.push(read_i32_le(r)?);
            }
            Ok(Value::IntArray(IntArray::new(v)))
        }
        Tag::LongArray => {
            let len = read_i32_le(r)?;
            if len < 0 {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    "negative long array length",
                ));
            }
            let mut v = Vec::with_capacity(len as usize);
            for _ in 0..len {
                v.push(read_i64_le(r)?);
            }
            Ok(Value::LongArray(LongArray::new(v)))
        }

    }
}
pub fn load_nbt_le(mut r: impl Read) -> io::Result<HashMap<String, Value>> {
    let tag_id = tag_from_u8(read_u8(&mut r)?)?;
    if tag_id != Tag::Compound {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!("root tag must be compound (10), got {}", tag_id),
        ));
    }
    let _root_name = read_string_le(&mut r)?;
    match read_tag_payload(&mut r, Tag::Compound)? {
        Value::Compound(m) => Ok(m),
        _ => Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "root payload not compound",
        )),
    }
}