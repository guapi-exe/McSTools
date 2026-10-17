pub struct VarIntIterator<'a> {
    source: &'a [i8],
    index: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VarIntError {
    Truncated,
    TooLong,
}

impl VarIntError {
    pub const fn message(self) -> &'static str {
        match self {
            Self::Truncated => "WorldEdit block data contains a truncated VarInt",
            Self::TooLong => "WorldEdit block data contains an overlong VarInt",
        }
    }
}

impl<'a> VarIntIterator<'a> {
    pub fn new(source: &'a [i8]) -> Self {
        VarIntIterator { source, index: 0 }
    }
}

impl<'a> Iterator for VarIntIterator<'a> {
    type Item = Result<u32, VarIntError>;

    fn next(&mut self) -> Option<Self::Item> {
        let mut value = 0u32;
        for byte_index in 0..5 {
            if self.index >= self.source.len() {
                return if byte_index == 0 {
                    None
                } else {
                    Some(Err(VarIntError::Truncated))
                };
            }

            let next_byte = self.source[self.index] as u8;
            self.index += 1;

            // A u32 VarInt may use at most four payload bits in its fifth
            // byte. Reject overflow instead of silently wrapping the shift.
            if byte_index == 4 && (next_byte & 0x70) != 0 {
                return Some(Err(VarIntError::TooLong));
            }

            value |= u32::from(next_byte & 0x7F) << (byte_index * 7);
            if next_byte & 0x80 == 0 {
                return Some(Ok(value));
            }
        }

        Some(Err(VarIntError::TooLong))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_truncated_values_without_panicking() {
        let mut iter = VarIntIterator::new(&[-128]);
        assert_eq!(iter.next(), Some(Err(VarIntError::Truncated)));
    }

    #[test]
    fn reports_overlong_values_without_panicking() {
        let mut iter = VarIntIterator::new(&[-128, -128, -128, -128, -128, 0]);
        assert_eq!(iter.next(), Some(Err(VarIntError::TooLong)));
    }

    #[test]
    fn accepts_the_largest_unsigned_five_byte_value() {
        let mut iter = VarIntIterator::new(&[-1, -1, -1, -1, 15]);
        assert_eq!(iter.next(), Some(Ok(u32::MAX)));
    }
}
