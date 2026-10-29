use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

static SEQUENCE: AtomicU64 = AtomicU64::new(0);

fn temporary(path: &Path) -> io::Result<(PathBuf, File)> {
    for _ in 0..100 {
        let name = format!(".stabileo-{}-{}.tmp", std::process::id(), SEQUENCE.fetch_add(1, Ordering::Relaxed));
        let temp = path.with_file_name(name);
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        match options.open(&temp) {
            Ok(file) => return Ok((temp, file)),
            Err(e) if e.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e),
        }
    }
    Err(io::Error::new(io::ErrorKind::AlreadyExists, "cannot stage save"))
}

#[cfg(not(windows))]
fn replace(from: &Path, to: &Path) -> io::Result<()> { fs::rename(from, to) }

#[cfg(windows)]
fn replace(from: &Path, to: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    #[link(name = "kernel32")]
    extern "system" { fn MoveFileExW(from: *const u16, to: *const u16, flags: u32) -> i32; }
    let from: Vec<u16> = from.as_os_str().encode_wide().chain(Some(0)).collect();
    let to: Vec<u16> = to.as_os_str().encode_wide().chain(Some(0)).collect();
    if unsafe { MoveFileExW(from.as_ptr(), to.as_ptr(), 1 | 8) } == 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(())
}

pub fn save(path: &Path, content: &[u8]) -> io::Result<()> {
    save_with(path, |file| file.write_all(content))
}

fn save_with(path: &Path, write: impl FnOnce(&mut File) -> io::Result<()>) -> io::Result<()> {
    if fs::symlink_metadata(path).is_ok_and(|m| !m.is_file() || m.file_type().is_symlink()) {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "save target must be a regular file"));
    }
    let (temp, mut file) = temporary(path)?;
    let result = (|| {
        if let Ok(metadata) = fs::metadata(path) { file.set_permissions(metadata.permissions())?; }
        write(&mut file)?;
        file.sync_all()?;
        drop(file);
        if path.exists() {
            let mut backup_name = path.as_os_str().to_owned();
            backup_name.push(".bak");
            let backup = PathBuf::from(backup_name);
            let (backup_temp, mut backup_file) = temporary(path)?;
            let backed_up = (|| {
                backup_file.set_permissions(fs::metadata(path)?.permissions())?;
                io::copy(&mut File::open(path)?, &mut backup_file)?;
                backup_file.sync_all()?;
                drop(backup_file);
                replace(&backup_temp, &backup)
            })();
            let _ = fs::remove_file(&backup_temp);
            backed_up?;
        }
        replace(&temp, path)?;
        #[cfg(unix)]
        File::open(path.parent().unwrap_or(Path::new(".")))?.sync_all()?;
        Ok(())
    })();
    let _ = fs::remove_file(&temp);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(unix)]
    #[test]
    fn preserves_private_permissions() {
        use std::os::unix::fs::PermissionsExt;
        let path = std::env::temp_dir().join(format!("stabileo-private-{}.ded", std::process::id()));
        fs::write(&path, "private").unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).unwrap();
        save(&path, b"new private").unwrap();
        let backup = path.with_extension("ded.bak");
        for file in [&path, &backup] {
            assert_eq!(fs::metadata(file).unwrap().permissions().mode() & 0o777, 0o600);
            fs::remove_file(file).unwrap();
        }
    }

    #[test]
    fn replacement_keeps_backup_and_failed_write_keeps_original() {
        let dir = std::env::temp_dir().join(format!("stabileo-save-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("project.ded");
        fs::write(&path, "original").unwrap();
        let result = save_with(&path, |file| {
            file.write_all(b"partial")?;
            Err(io::Error::new(io::ErrorKind::Other, "disk full"))
        });
        assert!(result.is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "original");
        save(&path, b"new").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "new");
        assert_eq!(fs::read_to_string(dir.join("project.ded.bak")).unwrap(), "original");
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 2);
        fs::remove_dir_all(dir).unwrap();
    }
}
