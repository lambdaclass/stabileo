#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod atomic_save;
mod save_directory;

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;
use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, RunEvent, Runtime, State};
use tauri_plugin_fs::FsExt;

#[tauri::command]
async fn atomic_save(app: AppHandle, path: PathBuf, content: String) -> Result<(), String> {
    if !path.is_absolute() { return Err("absolute save path required".into()); }
    tauri::async_runtime::spawn_blocking(move || {
        atomic_save::save_authorized(&path, content.as_bytes(), || app.fs_scope().is_allowed(&path))
            .map_err(|e| e.to_string())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
fn resolve_selected_path(app: AppHandle, path: PathBuf) -> Result<PathBuf, String> {
    let scope = app.fs_scope();
    if !scope.is_allowed(&path) { return Err("path was not selected by the user".into()); }
    let target = save_directory::canonical_target(&path).map_err(|e| e.to_string())?;
    scope.allow_file(&target).map_err(|e| e.to_string())?;
    Ok(target)
}

const RECENT_MAX: usize = 8;
const RECENT_FILE: &str = "recent.json";

/// Files the system asked the app to open, until the page takes them.
#[derive(Default)]
struct Pending(Mutex<Vec<PathBuf>>);

/// The menu's labels in the page's language, by key; a missing key reads in English.
#[derive(Default)]
struct Labels(Mutex<HashMap<String, String>>);

/// Recently opened or saved projects, newest first. Only paths the user picked get in.
#[derive(Default)]
struct Recent(Mutex<Vec<PathBuf>>);

fn is_project(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("ded") || e.eq_ignore_ascii_case("json"))
}

fn project_args(args: &[String], cwd: &Path) -> Vec<PathBuf> {
    args.iter()
        .skip(1)
        .filter(|a| !a.starts_with('-'))
        .map(|a| {
            let p = PathBuf::from(a);
            if p.is_absolute() { p } else { cwd.join(p) }
        })
        .filter(|p| is_project(p) && p.is_file())
        .filter_map(|p| p.canonicalize().ok())
        .collect()
}

/// Let the page read `paths` (and nothing else new), then tell it they are waiting.
fn queue_open<R: Runtime>(app: &AppHandle<R>, paths: Vec<PathBuf>) {
    if paths.is_empty() {
        return;
    }
    let scope = app.fs_scope();
    let allowed: Vec<PathBuf> = paths.into_iter().filter_map(|p| p.canonicalize().ok()).filter(|p| scope.allow_file(p).is_ok()).collect();
    app.state::<Pending>().0.lock().unwrap().extend(allowed);
    let _ = app.emit("desktop://open-pending", ());
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

#[tauri::command]
fn take_pending_files(pending: State<Pending>) -> Vec<String> {
    std::mem::take(&mut *pending.0.lock().unwrap())
        .into_iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect()
}

fn recent_path<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join(RECENT_FILE))
}

fn load_recent<R: Runtime>(app: &AppHandle<R>) -> Vec<PathBuf> {
    recent_path(app)
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str::<Vec<PathBuf>>(&s).ok())
        .unwrap_or_default()
        .into_iter()
        .filter(|p| is_project(p))
        .take(RECENT_MAX)
        .collect()
}

fn store_recent<R: Runtime>(app: &AppHandle<R>, recent: &[PathBuf]) {
    if let Some(p) = recent_path(app) {
        if let Some(dir) = p.parent() {
            let _ = fs::create_dir_all(dir);
        }
        if let Ok(json) = serde_json::to_string(recent) {
            let _ = fs::write(p, json);
        }
    }
}

/// Record a project the user just opened or saved. Refused for a path outside the fs scope, so the
/// page cannot plant a file in the menu that the user never chose.
#[tauri::command]
fn note_recent<R: Runtime>(app: AppHandle<R>, path: String) -> Result<(), String> {
    let p = PathBuf::from(path);
    if !is_project(&p) || !app.fs_scope().is_allowed(&p) {
        return Err("not a project the user picked".into());
    }
    let list = {
        let state = app.state::<Recent>();
        let mut recent = state.0.lock().unwrap();
        recent.retain(|x| x != &p);
        recent.insert(0, p);
        recent.truncate(RECENT_MAX);
        recent.clone()
    };
    store_recent(&app, &list);
    set_menu(&app, &list).map_err(|e| e.to_string())
}

#[derive(Serialize)]
struct SystemInfo {
    version: String,
    os: &'static str,
    arch: &'static str,
}

#[tauri::command]
fn system_info<R: Runtime>(app: AppHandle<R>) -> SystemInfo {
    SystemInfo {
        version: app.package_info().version.to_string(),
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
    }
}

/// Whether the updater can replace this installation: not a Linux package manager's install.
#[tauri::command]
fn can_self_update() -> bool {
    !cfg!(target_os = "linux") || std::env::var_os("APPIMAGE").is_some()
}

const LOG_MAX: u64 = 1 << 20;

fn append_log<R: Runtime>(app: &AppHandle<R>, line: &str) {
    use std::io::Write;
    let Ok(dir) = app.path().app_log_dir() else { return };
    if fs::create_dir_all(&dir).is_err() {
        return;
    }
    let path = dir.join("stabileo.log");
    if fs::metadata(&path).map(|m| m.len() > LOG_MAX).unwrap_or(false) {
        if rotate_log(&path, &dir.join("stabileo.old.log")).is_err() { return; }
    }
    if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(path) {
        let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
        let _ = writeln!(f, "{secs} {line}");
    }
}

/// Leave after the page has dealt with unsaved changes.
#[tauri::command]
fn exit_app<R: Runtime>(app: AppHandle<R>) {
    app.exit(0);
}

/// The page's log lines. The launch test (`.github/workflows/desktop.yml`) sets
/// `STABILEO_SELFCHECK_OUT` to collect them (a Windows release build has no console) and
/// `STABILEO_EXIT_AFTER_SELFCHECK` to leave with the self-check's verdict.
///
/// Every line also goes to `stabileo.log` in the system's log folder for the app (macOS
/// `~/Library/Logs/com.stabileo.desktop`, Windows `%LOCALAPPDATA%\com.stabileo.desktop\logs`, Linux
/// `~/.local/share/com.stabileo.desktop/logs`), kept under 1 MB with one previous file beside it.
#[tauri::command]
fn log_line<R: Runtime>(app: AppHandle<R>, line: String) {
    println!("{line}");
    append_log(&app, &line);
    if let Some(out) = std::env::var_os("STABILEO_SELFCHECK_OUT") {
        use std::io::Write;
        if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(out) {
            let _ = writeln!(f, "{line}");
        }
    }
    if std::env::var_os("STABILEO_EXIT_AFTER_SELFCHECK").is_some() {
        if let Some(verdict) = line.strip_prefix("stabileo-selfcheck ") {
            app.exit(if verdict.starts_with("ok") { 0 } else { 1 });
        }
    }
}

/// Relabel the menu in the page's language (`web/src/lib/platform/desktop-text.ts`).
#[tauri::command]
fn set_menu_labels<R: Runtime>(app: AppHandle<R>, labels: HashMap<String, String>) -> Result<(), String> {
    *app.state::<Labels>().0.lock().unwrap() = labels;
    let recent = app.state::<Recent>().0.lock().unwrap().clone();
    set_menu(&app, &recent).map_err(|e| e.to_string())
}

fn build_menu<R: Runtime>(app: &AppHandle<R>, recent: &[PathBuf]) -> tauri::Result<Menu<R>> {
    let labels = app.state::<Labels>().0.lock().unwrap().clone();
    let l = |key: &str, en: &str| -> String { labels.get(key).cloned().unwrap_or_else(|| en.to_string()) };
    let mut open_recent = SubmenuBuilder::new(app, l("menuOpenRecent", "Open Recent"));
    for (i, p) in recent.iter().enumerate() {
        open_recent = open_recent.item(&MenuItemBuilder::with_id(format!("recent:{i}"), p.to_string_lossy()).build(app)?);
    }
    if recent.is_empty() {
        open_recent = open_recent.item(&MenuItemBuilder::with_id("recent:none", l("menuNoRecent", "No recent projects")).enabled(false).build(app)?);
    } else {
        open_recent = open_recent.separator().text("recent:clear", l("menuClearRecent", "Clear Menu"));
    }

    let mut file = SubmenuBuilder::new(app, l("menuFile", "File"))
        .item(&MenuItemBuilder::with_id("new", l("menuNew", "New")).accelerator("CmdOrCtrl+N").build(app)?)
        .item(&MenuItemBuilder::with_id("open", l("menuOpen", "Open…")).accelerator("CmdOrCtrl+O").build(app)?)
        .item(&open_recent.build()?)
        .separator()
        .item(&MenuItemBuilder::with_id("save", l("menuSave", "Save")).accelerator("CmdOrCtrl+S").build(app)?)
        .item(&MenuItemBuilder::with_id("save_as", l("menuSaveAs", "Save As…")).accelerator("CmdOrCtrl+Shift+S").build(app)?);
    if !cfg!(target_os = "macos") {
        file = file
            .separator()
            .item(&MenuItemBuilder::with_id("quit", l("menuQuit", "Quit")).accelerator("CmdOrCtrl+Q").build(app)?);
    }

    let edit = SubmenuBuilder::new(app, l("menuEdit", "Edit"))
        .item(&PredefinedMenuItem::cut(app, Some(&l("menuCut", "Cut")))?)
        .item(&PredefinedMenuItem::copy(app, Some(&l("menuCopy", "Copy")))?)
        .item(&PredefinedMenuItem::paste(app, Some(&l("menuPaste", "Paste")))?)
        .item(&PredefinedMenuItem::select_all(app, Some(&l("menuSelectAll", "Select All")))?);

    let mut help = SubmenuBuilder::new(app, l("menuHelp", "Help"))
        .text("check_updates", l("menuCheckUpdates", "Check for Updates…"))
        .text("report", l("menuReport", "Report a Problem…"));
    if !cfg!(target_os = "macos") {
        help = help.separator().text("about", l("menuAbout", "About Stabileo"));
    }

    let mut menu = MenuBuilder::new(app);
    if cfg!(target_os = "macos") {
        let app_menu = SubmenuBuilder::new(app, "Stabileo")
            .text("about", l("menuAbout", "About Stabileo"))
            .text("check_updates_app", l("menuCheckUpdates", "Check for Updates…"))
            .separator()
            .item(&PredefinedMenuItem::services(app, Some(&l("menuServices", "Services")))?)
            .separator()
            .item(&PredefinedMenuItem::hide(app, Some(&l("menuHide", "Hide Stabileo")))?)
            .item(&PredefinedMenuItem::hide_others(app, Some(&l("menuHideOthers", "Hide Others")))?)
            .item(&PredefinedMenuItem::show_all(app, Some(&l("menuShowAll", "Show All")))?)
            .separator()
            .item(&MenuItemBuilder::with_id("quit", l("menuQuitApp", "Quit Stabileo")).accelerator("CmdOrCtrl+Q").build(app)?)
            .build()?;
        let window = SubmenuBuilder::new(app, l("menuWindow", "Window"))
            .item(&PredefinedMenuItem::minimize(app, Some(&l("menuMinimize", "Minimize")))?)
            .item(&PredefinedMenuItem::fullscreen(app, Some(&l("menuFullscreen", "Enter Full Screen")))?)
            .build()?;
        menu = menu.item(&app_menu).item(&file.build()?).item(&edit.build()?).item(&window);
    } else {
        menu = menu.item(&file.build()?).item(&edit.build()?);
    }
    menu.item(&help.build()?).build()
}

fn set_menu<R: Runtime>(app: &AppHandle<R>, recent: &[PathBuf]) -> tauri::Result<()> {
    app.set_menu(build_menu(app, recent)?)?;
    Ok(())
}

fn on_menu<R: Runtime>(app: &AppHandle<R>, id: &str) {
    if let Some(i) = id.strip_prefix("recent:") {
        if i == "clear" {
            app.state::<Recent>().0.lock().unwrap().clear();
            store_recent(app, &[]);
            let _ = set_menu(app, &[]);
        } else if let Ok(i) = i.parse::<usize>() {
            let path = app.state::<Recent>().0.lock().unwrap().get(i).cloned();
            if let Some(p) = path.filter(|p| p.is_file()) {
                queue_open(app, vec![p]);
            }
        }
        return;
    }
    let cmd = if id == "check_updates_app" { "check_updates" } else { id };
    let _ = app.emit("desktop://menu", cmd);
}

fn main() {
    let builder = tauri::Builder::default();

    #[cfg(any(windows, target_os = "linux"))]
    let builder = {
        builder.plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            queue_open(app, project_args(&args, Path::new(&cwd)));
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
    };

    let app = builder
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(Pending::default())
        .manage(Recent::default())
        .manage(Labels::default())
        .invoke_handler(tauri::generate_handler![
            atomic_save,
            resolve_selected_path,
            take_pending_files,
            note_recent,
            system_info,
            can_self_update,
            exit_app,
            log_line,
            set_menu_labels
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let recent = load_recent(&handle);
            *app.state::<Recent>().0.lock().unwrap() = recent.clone();
            set_menu(&handle, &recent)?;
            app.on_menu_event(|app, event| on_menu(app, event.id().as_ref()));
            let args: Vec<String> = std::env::args().collect();
            let cwd = std::env::current_dir().unwrap_or_default();
            queue_open(&handle, project_args(&args, &cwd));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building the Stabileo desktop app");

    app.run(|app, event| match event {
        #[cfg(target_os = "macos")]
        RunEvent::Opened { urls } => {
            let paths = urls.into_iter().filter_map(|u| u.to_file_path().ok()).filter(|p| is_project(p)).collect();
            queue_open(app, paths);
        }
        RunEvent::ExitRequested { api, code: None, .. } => {
            if app.get_webview_window("main").is_some() {
                api.prevent_exit();
                let _ = app.emit("desktop://menu", "quit");
            }
        }
        _ => {}
    });
}

fn rotate_log(path: &std::path::Path, old: &std::path::Path) -> std::io::Result<()> {
    match fs::remove_file(old) {
        Ok(()) => {},
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {},
        Err(error) => return Err(error),
    }
    fs::rename(path, old)
}

#[test]
fn repeated_log_rotation() {
    let dir = std::env::temp_dir().join(format!("stabileo-log-test-{}", std::process::id()));
    fs::create_dir_all(&dir).unwrap();
    let path = dir.join("current");
    let old = dir.join("old");
    for content in ["first", "second", "third"] {
        fs::write(&path, content).unwrap();
        rotate_log(&path, &old).unwrap();
        assert_eq!(fs::read_to_string(&old).unwrap(), content);
        assert!(!path.exists());
    }
    fs::remove_dir_all(dir).unwrap();
}


#[test]
fn launch_with_relative_parent_path_can_save() {
    let root = std::env::temp_dir().join(format!("stabileo-launch-parent-{}", std::process::id()));
    fs::create_dir_all(root.join("child")).unwrap();
    fs::write(root.join("model.ded"), "original").unwrap();
    let paths = project_args(&["stabileo".into(), "../model.ded".into()], &root.join("child"));
    assert_eq!(paths, vec![root.join("model.ded").canonicalize().unwrap()]);
    atomic_save::save_authorized(&paths[0], b"saved", || true).unwrap();
    assert_eq!(fs::read_to_string(root.join("model.ded")).unwrap(), "saved");
    fs::remove_dir_all(root).unwrap();
}
