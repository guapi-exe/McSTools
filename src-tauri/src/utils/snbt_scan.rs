//! Backported from new_mcs (c7b2359); shared bounded source preflight.
use crate::utils::parse_limits::ParseLimits;
use crate::utils::schematic_data::SchematicError;

const HARD_MAX_SNBT_DEPTH: usize = 512;

/// Quote-aware structural preflight for textual SNBT.
///
/// This deliberately leaves numeric and schema semantics to `fastsnbt`, but
/// rejects excessive nesting, collection entries, string/token bytes and total
/// tokens before `fastsnbt` recursively materializes the value tree.
pub(crate) fn scan_snbt(input: &str, limits: &ParseLimits) -> Result<(), SchematicError> {
    if input.len() > limits.max_input_bytes {
        return Err(SchematicError::LimitExceeded(format!(
            "SNBT input is {} bytes; limit is {}",
            input.len(),
            limits.max_input_bytes
        )));
    }
    if limits.max_nbt_depth > HARD_MAX_SNBT_DEPTH {
        return Err(SchematicError::LimitExceeded(format!(
            "configured SNBT depth {} exceeds scanner safety cap {HARD_MAX_SNBT_DEPTH}",
            limits.max_nbt_depth
        )));
    }

    Scanner {
        input: input.as_bytes(),
        offset: 0,
        tags_seen: 0,
        limits,
        stack: Vec::new(),
        root_closed: false,
    }
    .scan()
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum ContainerKind {
    Compound,
    List,
}

struct Frame {
    kind: ContainerKind,
    entries: usize,
    current_has_content: bool,
}

struct Scanner<'a> {
    input: &'a [u8],
    offset: usize,
    tags_seen: usize,
    limits: &'a ParseLimits,
    stack: Vec<Frame>,
    root_closed: bool,
}

impl Scanner<'_> {
    fn scan(mut self) -> Result<(), SchematicError> {
        self.skip_whitespace();
        if self.peek() != Some(b'{') {
            return Err(self.malformed("SNBT root must be a Compound"));
        }

        while let Some(byte) = self.peek() {
            if byte.is_ascii_whitespace() {
                self.offset += 1;
                continue;
            }
            if self.root_closed {
                return Err(self.malformed("trailing data after SNBT root"));
            }

            match byte {
                b'{' => self.open_container(ContainerKind::Compound, false)?,
                b'[' => {
                    let typed = self
                        .input
                        .get(self.offset + 1)
                        .copied()
                        .is_some_and(|kind| {
                            matches!(kind, b'B' | b'I' | b'L')
                                && self.input.get(self.offset + 2) == Some(&b';')
                        });
                    self.open_container(ContainerKind::List, typed)?;
                }
                b'}' => self.close_container(ContainerKind::Compound)?,
                b']' => self.close_container(ContainerKind::List)?,
                b',' => {
                    self.finish_entry()?;
                    self.offset += 1;
                }
                b':' => self.offset += 1,
                b'\'' | b'"' => self.scan_quoted(byte)?,
                b';' => self.offset += 1,
                _ => self.scan_token()?,
            }
        }

        if !self.stack.is_empty() {
            return Err(self.malformed("unterminated SNBT container"));
        }
        if !self.root_closed {
            return Err(self.malformed("missing SNBT root Compound"));
        }
        Ok(())
    }

    fn open_container(
        &mut self,
        kind: ContainerKind,
        typed_array: bool,
    ) -> Result<(), SchematicError> {
        if !self.stack.is_empty() {
            self.mark_content()?;
        }
        self.bump_tags(1)?;
        self.stack.push(Frame {
            kind,
            entries: 0,
            current_has_content: false,
        });
        if self.stack.len() > self.limits.max_nbt_depth {
            return Err(SchematicError::LimitExceeded(format!(
                "SNBT depth {} exceeds limit {}",
                self.stack.len(),
                self.limits.max_nbt_depth
            )));
        }
        self.offset += if typed_array { 3 } else { 1 };
        Ok(())
    }

    fn close_container(&mut self, expected: ContainerKind) -> Result<(), SchematicError> {
        let actual = self
            .stack
            .last()
            .ok_or_else(|| self.malformed("unexpected closing delimiter"))?
            .kind;
        if actual != expected {
            return Err(self.malformed("mismatched SNBT closing delimiter"));
        }
        self.finish_entry()?;
        self.stack.pop();
        self.offset += 1;
        if self.stack.is_empty() {
            self.root_closed = true;
        }
        Ok(())
    }

    fn finish_entry(&mut self) -> Result<(), SchematicError> {
        let Some(frame) = self.stack.last_mut() else {
            return Err(self.malformed("separator outside SNBT container"));
        };
        if !frame.current_has_content {
            return Ok(());
        }
        frame.entries = frame.entries.checked_add(1).ok_or_else(|| {
            SchematicError::NbtPreflight("SNBT collection count overflow".to_string())
        })?;
        if frame.entries > self.limits.max_nbt_sequence_len {
            return Err(SchematicError::LimitExceeded(format!(
                "SNBT collection length {} exceeds limit {}",
                frame.entries, self.limits.max_nbt_sequence_len
            )));
        }
        frame.current_has_content = false;
        Ok(())
    }

    fn scan_quoted(&mut self, quote: u8) -> Result<(), SchematicError> {
        self.mark_content()?;
        self.bump_tags(1)?;
        self.offset += 1;
        let start = self.offset;
        let mut escaped = false;
        while let Some(byte) = self.peek() {
            if self.offset.saturating_sub(start) > self.limits.max_snbt_string_bytes {
                return Err(SchematicError::LimitExceeded(format!(
                    "SNBT string exceeds {} bytes",
                    self.limits.max_snbt_string_bytes
                )));
            }
            self.offset += 1;
            if escaped {
                escaped = false;
            } else if byte == b'\\' {
                escaped = true;
            } else if byte == quote {
                return Ok(());
            }
        }
        Err(self.malformed("unterminated quoted SNBT string"))
    }

    fn scan_token(&mut self) -> Result<(), SchematicError> {
        self.mark_content()?;
        self.bump_tags(1)?;
        let start = self.offset;
        while let Some(byte) = self.peek() {
            if byte.is_ascii_whitespace()
                || matches!(
                    byte,
                    b'{' | b'}' | b'[' | b']' | b',' | b':' | b';' | b'\'' | b'"'
                )
            {
                break;
            }
            self.offset += 1;
            if self.offset - start > self.limits.max_snbt_string_bytes {
                return Err(SchematicError::LimitExceeded(format!(
                    "SNBT token exceeds {} bytes",
                    self.limits.max_snbt_string_bytes
                )));
            }
        }
        if self.offset == start {
            return Err(self.malformed("invalid SNBT token"));
        }
        Ok(())
    }

    fn mark_content(&mut self) -> Result<(), SchematicError> {
        let Some(frame) = self.stack.last_mut() else {
            return Err(SchematicError::NbtPreflight(format!(
                "SNBT byte {}: SNBT value outside root Compound",
                self.offset
            )));
        };
        frame.current_has_content = true;
        Ok(())
    }

    fn bump_tags(&mut self, count: usize) -> Result<(), SchematicError> {
        self.tags_seen = self
            .tags_seen
            .checked_add(count)
            .ok_or_else(|| SchematicError::NbtPreflight("SNBT token count overflow".to_string()))?;
        if self.tags_seen > self.limits.max_nbt_tags {
            return Err(SchematicError::LimitExceeded(format!(
                "SNBT token count {} exceeds limit {}",
                self.tags_seen, self.limits.max_nbt_tags
            )));
        }
        let allocation = self
            .tags_seen
            .checked_mul(std::mem::size_of::<fastnbt::Value>() + std::mem::size_of::<String>())
            .and_then(|value| value.checked_add(self.input.len()))
            .ok_or_else(|| {
                SchematicError::LimitExceeded("SNBT allocation accounting overflow".into())
            })?;
        self.limits.check(
            "estimated SNBT allocation bytes",
            allocation,
            self.limits.max_nbt_allocation_bytes,
        )?;
        Ok(())
    }

    fn skip_whitespace(&mut self) {
        while self.peek().is_some_and(|byte| byte.is_ascii_whitespace()) {
            self.offset += 1;
        }
    }

    fn peek(&self) -> Option<u8> {
        self.input.get(self.offset).copied()
    }

    fn malformed(&self, message: &str) -> SchematicError {
        SchematicError::NbtPreflight(format!("SNBT byte {}: {message}", self.offset))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_deep_snbt() {
        let input = format!("{}0{}", "{a:".repeat(5), "}".repeat(5));
        let limits = ParseLimits {
            max_nbt_depth: 4,
            ..ParseLimits::default()
        };
        assert!(matches!(
            scan_snbt(&input, &limits),
            Err(SchematicError::LimitExceeded(_))
        ));
    }

    #[test]
    fn rejects_long_snbt_list() {
        let limits = ParseLimits {
            max_nbt_sequence_len: 2,
            ..ParseLimits::default()
        };
        assert!(matches!(
            scan_snbt("{a:[1,2,3]}", &limits),
            Err(SchematicError::LimitExceeded(_))
        ));
    }

    #[test]
    fn quoted_delimiters_do_not_change_depth() {
        let limits = ParseLimits {
            max_nbt_depth: 1,
            ..ParseLimits::default()
        };
        scan_snbt("{a:'{[}]'}", &limits).unwrap();
        scan_snbt("{a:[I;]}", &ParseLimits::default()).unwrap();
    }
}
