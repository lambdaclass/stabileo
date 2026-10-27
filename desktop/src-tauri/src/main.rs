#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;
use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, RunEvent, Runtime, State};
use tauri_plugin_fs::FsExt;

const RECENT_MAX: usize = 8;
const RECENT_FILE: &str = "recent.json";

/// Files the system asked the app to open, until the page takes them.
#[derive(Default)]
struct Pending(Mutex<Vec<PathBuf>>);

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
        .collect()
}

/// Let the page read `paths` (and nothing else new), then tell it they are waiting.
fn queue_open<R: Runtime>(app: &AppHandle<R>, paths: Vec<PathBuf>) {
    if paths.is_empty() {
        return;
    }
    let scope = app.fs_scope();
    let mut pending = app.state::<Pending>().0.lock().unwrap();
    for p in paths {
        if scope.allow_file(&p).is_ok() {
            pending.push(p);
        }
    }
    drop(pending);
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

/// Leave after the page has dealt with unsaved changes.
#[tauri::command]
fn exit_app<R: Runtime>(app: AppHandle<R>) {
    app.exit(0);
}

#[tauri::command]
fn log_line(line: String) {
    println!("{line}");
}

fn build_menu<R: Runtime>(app: &AppHandle<R>, recent: &[PathBuf]) -> tauri::Result<Menu<R>> {
    let mut open_recent = SubmenuBuilder::new(app, "Open Recent");
    for (i, p) in recent.iter().enumerate() {
        open_recent = open_recent.item(&MenuItemBuilder::with_id(format!("recent:{i}"), p.to_string_lossy()).build(app)?);
    }
    if recent.is_empty() {
        open_recent = open_recent.item(&MenuItemBuilder::with_id("recent:none", "No recent projects").enabled(false).build(app)?);
    } else {
        open_recent = open_recent.separator().text("recent:clear", "Clear Menu");
    }

    let mut file = SubmenuBuilder::new(app, "File")
        .item(&MenuItemBuilder::with_id("new", "New").accelerator("CmdOrCtrl+N").build(app)?)
        .item(&MenuItemBuilder::with_id("open", "Open…").accelerator("CmdOrCtrl+O").build(app)?)
        .item(&open_recent.build()?)
        .separator()
        .item(&MenuItemBuilder::with_id("save", "Save").accelerator("CmdOrCtrl+S").build(app)?)
        .item(&MenuItemBuilder::with_id("save_as", "Save As…").accelerator("CmdOrCtrl+Shift+S").build(app)?);
    if !cfg!(target_os = "macos") {
        file = file
            .separator()
            .item(&MenuItemBuilder::with_id("quit", "Quit").accelerator("CmdOrCtrl+Q").build(app)?);
    }

    let edit = SubmenuBuilder::new(app, "Edit")
        .item(&PredefinedMenuItem::cut(app, None)?)
        .item(&PredefinedMenuItem::copy(app, None)?)
        .item(&PredefinedMenuItem::paste(app, None)?)
        .item(&PredefinedMenuItem::select_all(app, None)?);

    let mut help = SubmenuBuilder::new(app, "Help")
        .text("check_updates", "Check for Updates…")
        .text("report", "Report a Problem…");
    if !cfg!(target_os = "macos") {
        help = help.separator().text("about", "About Stabileo");
    }

    let mut menu = MenuBuilder::new(app);
    if cfg!(target_os = "macos") {
        let app_menu = SubmenuBuilder::new(app, "Stabileo")
            .text("about", "About Stabileo")
            .text("check_updates_app", "Check for Updates…")
            .separator()
            .item(&PredefinedMenuItem::services(app, None)?)
            .separator()
            .item(&PredefinedMenuItem::hide(app, None)?)
            .item(&PredefinedMenuItem::hide_others(app, None)?)
            .item(&PredefinedMenuItem::show_all(app, None)?)
            .separator()
            .item(&MenuItemBuilder::with_id("quit", "Quit Stabileo").accelerator("CmdOrCtrl+Q").build(app)?)
            .build()?;
        let window = SubmenuBuilder::new(app, "Window")
            .item(&PredefinedMenuItem::minimize(app, None)?)
            .item(&PredefinedMenuItem::fullscreen(app, None)?)
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
    let mut builder = tauri::Builder::default();

    #[cfg(any(windows, target_os = "linux"))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            queue_open(app, project_args(&args, Path::new(&cwd)));
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }));
    }

    let app = builder
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(Pending::default())
        .manage(Recent::default())
        .invoke_handler(tauri::generate_handler![
            take_pending_files,
            note_recent,
            system_info,
            can_self_update,
            exit_app,
            log_line
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
