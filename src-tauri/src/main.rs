#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager, WindowEvent,
};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_shell::{process::CommandChild, ShellExt};

#[derive(Debug, Deserialize)]
struct AppConfig {
    recommended_join_origin: String,
}

#[derive(Debug, Default, Deserialize, Serialize)]
struct DesktopSettings {
    transfer_storage_dir: Option<PathBuf>,
}

#[derive(Debug, Serialize)]
struct TransferStoragePreference {
    configured_dir: String,
    using_fallback: bool,
}

const BACKEND_PORT: &str = "18080";
const BACKEND_URL: &str = "http://127.0.0.1:18080";
const HEALTH_URL: &str = "http://127.0.0.1:18080/api/health";

struct BackendChild(Mutex<Option<CommandChild>>);

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            open_data_folder,
            open_transfers_folder,
            set_transfer_storage_dir,
            get_transfer_storage_preference,
            reset_transfer_storage_dir,
            restart_app
        ])
        .setup(|app| {
            let child = start_backend_sidecar(app.handle())?;
            app.manage(BackendChild(Mutex::new(Some(child))));

            setup_tray(app.handle())?;

            wait_for_backend_health(Duration::from_secs(15))?;
            show_main_window(app.handle())?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::CloseRequested { .. }) {
                stop_backend(window.app_handle());
                window.app_handle().exit(0);
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run Drop Den desktop app");
}

fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let open_item = MenuItem::with_id(app, "open", "Open Drop Den", true, None::<&str>)?;
    let copy_join_url_item =
        MenuItem::with_id(app, "copy_join_url", "Copy Join URL", true, None::<&str>)?;
    let copy_local_url_item =
        MenuItem::with_id(app, "copy_local_url", "Copy Local URL", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &open_item,
            &copy_join_url_item,
            &copy_local_url_item,
            &quit_item,
        ],
    )?;

    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or_else(|| tauri::Error::Anyhow(anyhow::anyhow!("default window icon not found")))?;

    TrayIconBuilder::new()
        .icon(icon)
        .tooltip("Drop Den")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => {
                if let Err(error) = show_main_window(app) {
                    eprintln!("failed to open Drop Den window: {error}");
                }
            }
            "copy_join_url" => match fetch_join_url() {
                Ok(join_url) => {
                    if let Err(error) = app.clipboard().write_text(join_url) {
                        eprintln!("failed to copy join URL: {error}");
                    }
                }
                Err(error) => {
                    eprintln!("failed to fetch join URL: {error}");
                }
            },
            "copy_local_url" => {
                if let Err(error) = app.clipboard().write_text(BACKEND_URL.to_string()) {
                    eprintln!("failed to copy local URL: {error}");
                }
            }
            "quit" => {
                stop_backend(app);
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}

fn show_main_window(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        window.show()?;
        window.set_focus()?;
    }

    Ok(())
}

fn stop_backend(app: &AppHandle) {
    if let Some(state) = app.try_state::<BackendChild>() {
        if let Ok(mut child) = state.0.lock() {
            if let Some(child) = child.take() {
                let _ = child.kill();
            }
        }
    }
}

fn start_backend_sidecar(app: &AppHandle) -> tauri::Result<CommandChild> {
    let data_dir = desktop_data_dir(app);
    let storage_dir = configured_transfer_storage_dir(app);
    let database_path = data_dir.join("drop-den.sqlite");

    let frontend_dist = bundled_frontend_dist(app)?;

    let command = app.shell().sidecar("drop-den-backend").map_err(|error| {
        tauri::Error::Anyhow(anyhow::anyhow!(
            "failed to create backend sidecar command: {error}"
        ))
    })?;

    let (_rx, child) = command
        .env("DROP_DEN_MODE", "desktop")
        .env("DROP_DEN_PORT", BACKEND_PORT)
        .env("DROP_DEN_PUBLIC_NAME", "127.0.0.1")
        .env("DROP_DEN_DATA_DIR", data_dir)
        .env("DROP_DEN_STORAGE_DIR", storage_dir)
        .env("DROP_DEN_DATABASE_PATH", database_path)
        .env("DROP_DEN_FRONTEND_DIST", frontend_dist)
        .spawn()
        .map_err(|error| {
            tauri::Error::Anyhow(anyhow::anyhow!("failed to spawn backend sidecar: {error}"))
        })?;

    Ok(child)
}

fn desktop_data_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("drop-den-desktop"))
}

#[tauri::command]
fn open_data_folder(app: AppHandle) -> Result<(), String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("failed to resolve app data directory: {error}"))?;

    std::fs::create_dir_all(&data_dir)
        .map_err(|error| format!("failed to create data directory: {error}"))?;

    open_path(&data_dir)
}

#[tauri::command]
fn open_transfers_folder(app: AppHandle) -> Result<(), String> {
    let transfers_dir = configured_transfer_storage_dir(&app);

    std::fs::create_dir_all(&transfers_dir)
        .map_err(|error| format!("failed to create transfers directory: {error}"))?;

    open_path(&transfers_dir)
}

#[tauri::command]
fn set_transfer_storage_dir(app: AppHandle, path: String) -> Result<String, String> {
    let trimmed_path = path.trim();

    if trimmed_path.is_empty() {
        return Err("transfer storage directory cannot be empty".to_string());
    }

    let storage_dir = PathBuf::from(trimmed_path);

    if !storage_dir.is_absolute() {
        return Err("transfer storage directory must be an absolute path".to_string());
    }

    validate_writable_directory(&storage_dir)?;

    let settings = DesktopSettings {
        transfer_storage_dir: Some(storage_dir.clone()),
    };
    write_desktop_settings(&app, &settings)?;

    Ok(storage_dir.to_string_lossy().to_string())
}

#[tauri::command]
fn get_transfer_storage_preference(app: AppHandle) -> TransferStoragePreference {
    let default_dir = default_transfer_storage_dir(&app);
    let configured_dir = read_desktop_settings(&app)
        .and_then(|settings| settings.transfer_storage_dir)
        .unwrap_or_else(|| default_dir.clone());
    let using_fallback =
        configured_dir != default_dir && validate_writable_directory(&configured_dir).is_err();

    TransferStoragePreference {
        configured_dir: configured_dir.to_string_lossy().to_string(),
        using_fallback,
    }
}

#[tauri::command]
fn reset_transfer_storage_dir(app: AppHandle) -> Result<String, String> {
    let default_dir = default_transfer_storage_dir(&app);
    validate_writable_directory(&default_dir)?;
    write_desktop_settings(&app, &DesktopSettings::default())?;

    Ok(default_dir.to_string_lossy().to_string())
}

#[tauri::command]
fn restart_app(app: AppHandle) {
    app.restart();
}

fn configured_transfer_storage_dir(app: &AppHandle) -> PathBuf {
    let default_dir = default_transfer_storage_dir(app);
    let configured_dir = read_desktop_settings(app)
        .and_then(|settings| settings.transfer_storage_dir)
        .unwrap_or_else(|| default_dir.clone());

    if let Err(error) = validate_writable_directory(&configured_dir) {
        eprintln!(
            "configured transfer storage directory is unavailable ({}): {error}; using {}",
            configured_dir.display(),
            default_dir.display()
        );

        return default_dir;
    }

    configured_dir
}

fn default_transfer_storage_dir(app: &AppHandle) -> PathBuf {
    desktop_data_dir(app).join("transfers")
}

fn desktop_settings_path(app: &AppHandle) -> PathBuf {
    desktop_data_dir(app).join("desktop-settings.json")
}

fn read_desktop_settings(app: &AppHandle) -> Option<DesktopSettings> {
    let contents = std::fs::read_to_string(desktop_settings_path(app)).ok()?;

    match serde_json::from_str(&contents) {
        Ok(settings) => Some(settings),
        Err(error) => {
            eprintln!("failed to read desktop settings: {error}");
            None
        }
    }
}

fn write_desktop_settings(app: &AppHandle, settings: &DesktopSettings) -> Result<(), String> {
    let settings_path = desktop_settings_path(app);
    let data_dir = settings_path
        .parent()
        .ok_or_else(|| "desktop settings path has no parent directory".to_string())?;

    std::fs::create_dir_all(data_dir)
        .map_err(|error| format!("failed to create app data directory: {error}"))?;

    let contents = serde_json::to_vec_pretty(settings)
        .map_err(|error| format!("failed to serialize desktop settings: {error}"))?;

    std::fs::write(settings_path, contents)
        .map_err(|error| format!("failed to save desktop settings: {error}"))
}

fn validate_writable_directory(path: &Path) -> Result<(), String> {
    std::fs::create_dir_all(path)
        .map_err(|error| format!("failed to create transfer storage directory: {error}"))?;

    if !path.is_dir() {
        return Err("transfer storage path is not a directory".to_string());
    }

    let probe_path = path.join(format!(".drop-den-write-test-{}", std::process::id()));
    std::fs::write(&probe_path, b"drop-den")
        .map_err(|error| format!("transfer storage directory is not writable: {error}"))?;
    std::fs::remove_file(&probe_path)
        .map_err(|error| format!("failed to remove transfer storage write test: {error}"))?;

    Ok(())
}

fn open_path(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|error| format!("failed to open folder: {error}"))?;

        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(path)
            .spawn()
            .map_err(|error| format!("failed to open folder: {error}"))?;

        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|error| format!("failed to open folder: {error}"))?;

        return Ok(());
    }

    #[allow(unreachable_code)]
    Err("opening folders is not supported on this platform".to_string())
}

fn bundled_frontend_dist(app: &AppHandle) -> tauri::Result<PathBuf> {
    let frontend_dist = app
        .path()
        .resolve("frontend-dist", tauri::path::BaseDirectory::Resource)
        .map_err(|error| {
            tauri::Error::Anyhow(anyhow::anyhow!(
                "failed to resolve bundled frontend-dist resource path: {error}"
            ))
        })?;

    let index_html = frontend_dist.join("index.html");

    if !index_html.is_file() {
        return Err(tauri::Error::Anyhow(anyhow::anyhow!(
            "bundled frontend dist is missing index.html at {}",
            index_html.display()
        )));
    }

    eprintln!("using bundled frontend dist: {}", frontend_dist.display());

    Ok(frontend_dist)
}

fn fetch_join_url() -> anyhow::Result<String> {
    let config: AppConfig = reqwest::blocking::get(format!("{BACKEND_URL}/api/config"))?
        .error_for_status()?
        .json()?;

    Ok(config.recommended_join_origin)
}

fn wait_for_backend_health(timeout: Duration) -> tauri::Result<()> {
    let started_at = Instant::now();

    while started_at.elapsed() < timeout {
        if let Ok(response) = reqwest::blocking::get(HEALTH_URL) {
            if response.status().is_success() {
                return Ok(());
            }
        }

        thread::sleep(Duration::from_millis(250));
    }

    Err(tauri::Error::Anyhow(anyhow::anyhow!(
        "Drop Den backend did not become ready at {BACKEND_URL}"
    )))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_path(name: &str) -> PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();

        std::env::temp_dir().join(format!(
            "drop-den-{name}-{}-{timestamp}",
            std::process::id()
        ))
    }

    #[test]
    fn desktop_settings_preserve_a_custom_transfer_directory() {
        let expected = unique_temp_path("custom-storage");
        let settings = DesktopSettings {
            transfer_storage_dir: Some(expected.clone()),
        };

        let json = serde_json::to_string(&settings).unwrap();
        let restored: DesktopSettings = serde_json::from_str(&json).unwrap();

        assert_eq!(restored.transfer_storage_dir, Some(expected));
    }

    #[test]
    fn writable_directory_validation_creates_and_checks_the_directory() {
        let path = unique_temp_path("writable-storage");

        validate_writable_directory(&path).unwrap();
        assert!(path.is_dir());
        assert_eq!(std::fs::read_dir(&path).unwrap().count(), 0);

        std::fs::remove_dir_all(path).unwrap();
    }

    #[test]
    fn writable_directory_validation_rejects_a_file() {
        let path = unique_temp_path("storage-file");
        std::fs::write(&path, b"not a directory").unwrap();

        let error = validate_writable_directory(&path).unwrap_err();
        assert!(error.contains("failed to create transfer storage directory"));

        std::fs::remove_file(path).unwrap();
    }
}
