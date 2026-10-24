use anyhow::{Context, Result};
use std::path::{Path, PathBuf};

/// Resolve the existing parent *before* creating the sibling temporary file.
/// On Windows, packaged-process AppData virtualization can map a logical C:
/// path to another volume. MoveFileEx then reports ERROR_NOT_SAME_DEVICE even
/// for two logical sibling paths. Using one physical parent keeps the atomic
/// rename on the same filesystem; it does not permit replacing existing files.
pub(crate) fn destination(path: &Path) -> Result<PathBuf> {
    let name = path.file_name().context("output filename is missing")?;
    let parent = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    Ok(std::fs::canonicalize(parent)
        .context("could not resolve the output directory")?
        .join(name))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn physical_sibling_commit_remains_no_clobber() {
        let dir = tempfile::tempdir().unwrap();
        let logical = dir.path().join("./blueprint.litematic");
        let path = destination(&logical).unwrap();
        assert_eq!(
            path.parent().unwrap(),
            std::fs::canonicalize(dir.path()).unwrap()
        );
        let mut file = tempfile::NamedTempFile::new_in(path.parent().unwrap()).unwrap();
        file.write_all(b"original").unwrap();
        file.persist_noclobber(&path).unwrap();
        let mut second = tempfile::NamedTempFile::new_in(path.parent().unwrap()).unwrap();
        second.write_all(b"replacement").unwrap();
        assert!(second.persist_noclobber(&path).is_err());
        assert_eq!(std::fs::read(logical).unwrap(), b"original");
    }

    #[test]
    fn missing_parent_is_not_created_or_redirected_elsewhere() {
        let dir = tempfile::tempdir().unwrap();
        let missing = dir.path().join("missing/result.schem");
        assert!(destination(&missing).is_err());
        assert!(!missing.parent().unwrap().exists());
    }
}
