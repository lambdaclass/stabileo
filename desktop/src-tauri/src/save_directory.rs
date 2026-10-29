use std::fs::File;
use std::io;
use std::path::{Component, Path};

#[cfg(unix)]
mod platform {
    use super::*;
    use std::ffi::{CString, OsStr};
    use std::os::fd::{AsRawFd, FromRawFd};
    use std::os::unix::ffi::OsStrExt;

    pub struct Directory(File);
    fn name(value: &OsStr) -> io::Result<CString> {
        CString::new(value.as_bytes()).map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "invalid filename"))
    }
    impl Directory {
        pub fn open(path: &Path) -> io::Result<Self> {
            let mut dir = Self(File::open("/")?);
            for component in path.components() {
                match component {
                    Component::RootDir => (),
                    Component::Normal(part) => { dir = Self(dir.open_file(part, libc::O_RDONLY | libc::O_DIRECTORY)?); }
                    _ => return Err(io::Error::new(io::ErrorKind::InvalidInput, "absolute normalized path required")),
                }
            }
            Ok(dir)
        }
        fn open_file(&self, part: &OsStr, flags: i32) -> io::Result<File> {
            let part = name(part)?;
            let fd = unsafe { libc::openat(self.0.as_raw_fd(), part.as_ptr(), flags | libc::O_NOFOLLOW | libc::O_CLOEXEC | libc::O_NONBLOCK, 0o600) };
            if fd < 0 { Err(io::Error::last_os_error()) } else { Ok(unsafe { File::from_raw_fd(fd) }) }
        }
        pub fn read(&self, part: &OsStr) -> io::Result<File> {
            let file = self.open_file(part, libc::O_RDONLY)?;
            if !file.metadata()?.is_file() { return Err(io::Error::new(io::ErrorKind::InvalidInput, "regular file required")); }
            Ok(file)
        }
        pub fn create(&self, part: &OsStr) -> io::Result<File> { self.open_file(part, libc::O_WRONLY | libc::O_CREAT | libc::O_EXCL) }
        pub fn replace(&self, from: &OsStr, to: &OsStr) -> io::Result<()> {
            let (from, to) = (name(from)?, name(to)?);
            if unsafe { libc::renameat(self.0.as_raw_fd(), from.as_ptr(), self.0.as_raw_fd(), to.as_ptr()) } < 0 {
                return Err(io::Error::last_os_error());
            }
            Ok(())
        }
        pub fn remove(&self, part: &OsStr) {
            if let Ok(part) = name(part) { unsafe { libc::unlinkat(self.0.as_raw_fd(), part.as_ptr(), 0); } }
        }
        pub fn sync(&self) -> io::Result<()> { self.0.sync_all() }
    }
}

#[cfg(windows)]
mod platform {
    use super::*;
    use std::ffi::OsStr;
    use std::fs::{self, OpenOptions};
    use std::os::windows::fs::{MetadataExt, OpenOptionsExt};
    use std::path::PathBuf;

    pub struct Directory { path: PathBuf, _pins: Vec<File> }
    impl Directory {
        pub fn open(path: &Path) -> io::Result<Self> {
            let mut pins = Vec::new();
            let mut current = PathBuf::new();
            for component in path.components() {
                match component {
                    Component::Prefix(_) | Component::RootDir => { current.push(component); continue; }
                    Component::Normal(part) => current.push(part),
                    _ => return Err(io::Error::new(io::ErrorKind::InvalidInput, "absolute normalized path required")),
                }
                let file = OpenOptions::new().read(true).share_mode(3)
                    .custom_flags(0x02000000 | 0x00200000).open(&current)?;
                if !file.metadata()?.is_dir() || file.metadata()?.file_attributes() & 0x400 != 0 {
                    return Err(io::Error::new(io::ErrorKind::InvalidInput, "directory reparse points are not allowed"));
                }
                pins.push(file);
            }
            Ok(Self { path: path.to_owned(), _pins: pins })
        }
        pub fn read(&self, part: &OsStr) -> io::Result<File> {
            let file = OpenOptions::new().read(true).share_mode(7).custom_flags(0x00200000).open(self.path.join(part))?;
            if !file.metadata()?.is_file() || file.metadata()?.file_attributes() & 0x400 != 0 {
                return Err(io::Error::new(io::ErrorKind::InvalidInput, "regular file required"));
            }
            Ok(file)
        }
        pub fn create(&self, part: &OsStr) -> io::Result<File> {
            OpenOptions::new().write(true).create_new(true).open(self.path.join(part))
        }
        pub fn replace(&self, from: &OsStr, to: &OsStr) -> io::Result<()> {
            use std::os::windows::ffi::OsStrExt;
            #[link(name = "kernel32")]
            extern "system" { fn MoveFileExW(from: *const u16, to: *const u16, flags: u32) -> i32; }
            let from: Vec<u16> = self.path.join(from).as_os_str().encode_wide().chain(Some(0)).collect();
            let to: Vec<u16> = self.path.join(to).as_os_str().encode_wide().chain(Some(0)).collect();
            if unsafe { MoveFileExW(from.as_ptr(), to.as_ptr(), 1 | 8) } == 0 { return Err(io::Error::last_os_error()); }
            Ok(())
        }
        pub fn remove(&self, part: &OsStr) { let _ = fs::remove_file(self.path.join(part)); }
        pub fn sync(&self) -> io::Result<()> { Ok(()) }
    }
}
pub use platform::Directory;


pub fn canonical_target(path: &Path) -> io::Result<std::path::PathBuf> {
    match path.canonicalize() {
        Ok(target) => Ok(target),
        Err(e) if e.kind() == io::ErrorKind::NotFound => {
            let parent = path.parent().ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "missing parent"))?;
            let name = path.file_name().ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "missing filename"))?;
            Ok(parent.canonicalize()?.join(name))
        }
        Err(e) => Err(e),
    }
}
