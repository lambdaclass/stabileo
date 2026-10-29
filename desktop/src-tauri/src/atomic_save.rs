use crate::save_directory::Directory;
use std::ffi::{OsStr, OsString};
use std::fs::File;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock, Weak};
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

pub fn save_authorized(path: &Path, content: &[u8], mut authorize: impl FnMut() -> bool) -> io::Result<()> {
    if !authorize() { return Err(io::Error::new(io::ErrorKind::PermissionDenied, "save path was not selected by the user")); }
    static LOCKS: OnceLock<Mutex<HashMap<PathBuf, Weak<Mutex<()>>>>> = OnceLock::new();
    let lock = {
        let mut locks = LOCKS.get_or_init(Mutex::default).lock().unwrap();
        locks.retain(|_, lock| lock.strong_count() > 0);
        let lock = locks.get(path).and_then(Weak::upgrade).unwrap_or_else(|| Arc::new(Mutex::new(())));
        locks.insert(path.to_owned(), Arc::downgrade(&lock));
        lock
    };
    let _saving = lock.lock().unwrap();
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
    #[test]
    fn unauthorized_missing_parent_is_denied_before_traversal() {
        let path = std::env::temp_dir().join("stabileo-nonexistent-parent/child/a.ded");
        let err = save_authorized(&path, b"no", || false).unwrap_err();
        assert_eq!(err.kind(), io::ErrorKind::PermissionDenied);
    }

    #[test]
    fn selected_parent_components_are_canonical_and_saveable() {
        let root = std::env::temp_dir().join(format!("stabileo-parent-{}", std::process::id()));
        fs::create_dir_all(root.join("child")).unwrap();
        fs::write(root.join("a.ded"), "old").unwrap();
        let target = crate::save_directory::canonical_target(&root.join("child/../a.ded")).unwrap();
        save(&target, b"new").unwrap();
        assert_eq!(fs::read_to_string(root.join("a.ded")).unwrap(), "new");
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn explicitly_selected_symlink_directory_resolves_before_pinning() {
        use std::os::unix::fs::symlink;
        let root = std::env::temp_dir().join(format!("stabileo-selected-link-{}", std::process::id()));
        fs::create_dir_all(root.join("real")).unwrap();
        symlink(root.join("real"), root.join("selected")).unwrap();
        let target = crate::save_directory::canonical_target(&root.join("selected/new.ded")).unwrap();
        fs::remove_file(root.join("selected")).unwrap();
        fs::create_dir(root.join("outside")).unwrap();
        symlink(root.join("outside"), root.join("selected")).unwrap();
        save(&target, b"selected").unwrap();
        assert_eq!(fs::read_to_string(root.join("real/new.ded")).unwrap(), "selected");
        assert!(!root.join("outside/new.ded").exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn concurrent_saves_keep_a_complete_previous_version() {
        let root = std::env::temp_dir().canonicalize().unwrap().join(format!("stabileo-concurrent-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("a.ded");
        fs::write(&path, "original").unwrap();
        std::thread::scope(|scope| {
            for i in 0..8 {
                let path = &path;
                scope.spawn(move || save(path, format!("version-{i}").as_bytes()).unwrap());
            }
        });
        let current = fs::read_to_string(&path).unwrap();
        let backup = fs::read_to_string(root.join("a.ded.bak")).unwrap();
        assert!(current.starts_with("version-"));
        assert!(backup.starts_with("version-"));
        assert_ne!(current, backup);
        assert_eq!(fs::read_dir(&root).unwrap().count(), 2);
        fs::remove_dir_all(root).unwrap();
    }

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
        let mut checks = 0;
        save_authorized(&parent.join("a.ded"), b"new", || {
            checks += 1;
            if checks == 1 { return true; }
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
