use crate::save_directory::Directory;
use std::ffi::{OsStr, OsString};
use std::fs::File;
use std::io::{self, Write};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};

static SEQUENCE: AtomicU64 = AtomicU64::new(0);

fn temporary(dir: &Directory) -> io::Result<(OsString, File)> {
    for _ in 0..100 {
        let name = OsString::from(format!(".stabileo-{}-{}.tmp", std::process::id(), SEQUENCE.fetch_add(1, Ordering::Relaxed)));
        match dir.create(&name) {
            Ok(file) => return Ok((name, file)),
            Err(e) if e.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e),
        }
    }
    Err(io::Error::new(io::ErrorKind::AlreadyExists, "cannot stage save"))
}

pub fn save_authorized(path: &Path, content: &[u8], authorize: impl FnOnce() -> bool) -> io::Result<()> {
    let dir = Directory::open(path.parent().ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "missing parent"))?)?;
    if !authorize() { return Err(io::Error::new(io::ErrorKind::PermissionDenied, "save path was not selected by the user")); }
    save_in(&dir, path.file_name().ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "missing filename"))?, |file| file.write_all(content))
}

fn save_in(dir: &Directory, name: &OsStr, write: impl FnOnce(&mut File) -> io::Result<()>) -> io::Result<()> {
    let mut original = match dir.read(name) {
        Ok(file) => Some(file),
        Err(e) if e.kind() == io::ErrorKind::NotFound => None,
        Err(e) => return Err(e),
    };
    let (temp, mut file) = temporary(dir)?;
    let result = (|| {
        if let Some(old) = &original { file.set_permissions(old.metadata()?.permissions())?; }
        write(&mut file)?;
        file.sync_all()?;
        drop(file);
        if let Some(old) = &mut original {
            let mut backup = name.to_owned();
            backup.push(".bak");
            let (backup_temp, mut backup_file) = temporary(dir)?;
            let backed_up = (|| {
                backup_file.set_permissions(old.metadata()?.permissions())?;
                io::copy(old, &mut backup_file)?;
                backup_file.sync_all()?;
                drop(backup_file);
                dir.replace(&backup_temp, &backup)
            })();
            dir.remove(&backup_temp);
            backed_up?;
        }
        dir.replace(&temp, name)?;
        dir.sync()
    })();
    dir.remove(&temp);
    result
}

#[cfg(test)]
fn save(path: &Path, content: &[u8]) -> io::Result<()> { save_authorized(path, content, || true) }
#[cfg(test)]
fn save_with(path: &Path, write: impl FnOnce(&mut File) -> io::Result<()>) -> io::Result<()> {
    save_in(&Directory::open(path.parent().unwrap())?, path.file_name().unwrap(), write)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    #[cfg(unix)]
    #[test]
    fn parent_swap_after_authorization_stays_in_pinned_directory() {
        use std::os::unix::fs::symlink;
        let root = std::env::temp_dir().canonicalize().unwrap().join(format!("stabileo-race-{}", std::process::id()));
        let parent = root.join("selected");
        let moved = root.join("moved");
        let outside = root.join("outside");
        fs::create_dir_all(&parent).unwrap();
        fs::create_dir_all(&outside).unwrap();
        fs::write(parent.join("a.ded"), "old").unwrap();
        fs::write(outside.join("a.ded"), "untouched").unwrap();
        save_authorized(&parent.join("a.ded"), b"new", || {
            fs::rename(&parent, &moved).unwrap();
            symlink(&outside, &parent).unwrap();
            true
        }).unwrap();
        assert_eq!(fs::read_to_string(outside.join("a.ded")).unwrap(), "untouched");
        assert_eq!(fs::read_to_string(moved.join("a.ded")).unwrap(), "new");
        assert_eq!(fs::read_to_string(moved.join("a.ded.bak")).unwrap(), "old");
        assert!(save(&parent.join("a.ded"), b"escape").is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn refuses_symlink_target_and_unauthorized_save() {
        use std::os::unix::fs::symlink;
        let root = std::env::temp_dir().canonicalize().unwrap().join(format!("stabileo-links-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("real.ded"), "keep").unwrap();
        symlink(root.join("real.ded"), root.join("link.ded")).unwrap();
        assert!(save(&root.join("link.ded"), b"replace").is_err());
        assert!(save_authorized(&root.join("real.ded"), b"replace", || false).is_err());
        assert_eq!(fs::read_to_string(root.join("real.ded")).unwrap(), "keep");
        assert_eq!(fs::read_dir(&root).unwrap().count(), 2);
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn preserves_private_permissions() {
        use std::os::unix::fs::PermissionsExt;
        let path = std::env::temp_dir().canonicalize().unwrap().join(format!("stabileo-private-{}.ded", std::process::id()));
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
        let dir = std::env::temp_dir().canonicalize().unwrap().join(format!("stabileo-save-test-{}", std::process::id()));
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
