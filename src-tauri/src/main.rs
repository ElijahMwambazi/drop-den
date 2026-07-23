#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager, WindowEvent,
};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};

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
const LOG_FILE_NAME: &str = "drop-den.log";
const LOG_FILE_MAX_BYTES: u64 = 2 * 1024 * 1024;
const LOG_ARCHIVE_COUNT: usize = 4;
const MAX_LOG_MESSAGE_CHARS: usize = 8 * 1024;
const MAX_DIAGNOSTICS_BYTES: usize = 64 * 1024;

struct BackendChild(Mutex<Option<CommandChild>>);

struct DesktopLog {
    writer: Mutex<LogWriter>,
}

struct LogWriter {
    directory: PathBuf,
    file: Option<File>,
}

impl DesktopLog {
    fn new(directory: PathBuf) -> std::io::Result<Self> {
        Ok(Self {
            writer: Mutex::new(LogWriter::new(directory)?),
        })
    }

    fn write(&self, source: &str, level: &str, message: &str) -> std::io::Result<()> {
        let mut writer = self
            .writer
            .lock()
            .map_err(|_| std::io::Error::other("desktop log is locked"))?;
        writer.write(source, level, message)
    }
}

impl LogWriter {
    fn new(directory: PathBuf) -> std::io::Result<Self> {
        fs::create_dir_all(&directory)?;
        let active_path = directory.join(LOG_FILE_NAME);
        if fs::metadata(&active_path).is_ok_and(|metadata| metadata.len() >= LOG_FILE_MAX_BYTES) {
            rotate_log_files(&directory)?;
        }

        let file = open_active_log(&directory)?;
        Ok(Self {
            directory,
            file: Some(file),
        })
    }

    fn write(&mut self, source: &str, level: &str, message: &str) -> std::io::Result<()> {
        let message = message
            .lines()
            .collect::<Vec<_>>()
            .join(" ")
            .chars()
            .take(MAX_LOG_MESSAGE_CHARS)
            .collect::<String>();
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let line = format!("[{timestamp}] {level} {source}: {message}\n");

        let should_rotate = self
            .file
            .as_ref()
            .and_then(|file| file.metadata().ok())
            .is_some_and(|metadata| {
                metadata.len().saturating_add(line.len() as u64) > LOG_FILE_MAX_BYTES
            });
        if should_rotate {
            self.rotate()?;
        }

        let file = self
            .file
            .as_mut()
            .ok_or_else(|| std::io::Error::other("desktop log file is unavailable"))?;
        file.write_all(line.as_bytes())?;
        file.flush()
    }

    fn rotate(&mut self) -> std::io::Result<()> {
        self.file.take();
        let rotation_result = rotate_log_files(&self.directory);
        self.file = Some(open_active_log(&self.directory)?);
        rotation_result
    }
}

fn open_active_log(directory: &Path) -> std::io::Result<File> {
    OpenOptions::new()
        .create(true)
        .append(true)
        .open(directory.join(LOG_FILE_NAME))
}

fn archived_log_path(directory: &Path, index: usize) -> PathBuf {
    directory.join(format!("drop-den.{index}.log"))
}

fn rotate_log_files(directory: &Path) -> std::io::Result<()> {
    let oldest = archived_log_path(directory, LOG_ARCHIVE_COUNT);
    if oldest.exists() {
        fs::remove_file(oldest)?;
    }

    for index in (1..LOG_ARCHIVE_COUNT).rev() {
        let source = archived_log_path(directory, index);
        if source.exists() {
            fs::rename(source, archived_log_path(directory, index + 1))?;
        }
    }

    let active = directory.join(LOG_FILE_NAME);
    if active.exists() {
        fs::rename(active, archived_log_path(directory, 1))?;
    }

    Ok(())
}

fn desktop_log(app: &AppHandle, source: &str, level: &str, message: &str) {
    if let Some(logger) = app.try_state::<DesktopLog>() {
        if let Err(error) = logger.write(source, level, message) {
            eprintln!("failed to write desktop log: {error}");
        }
    }

    #[cfg(debug_assertions)]
    eprintln!("[{level}] {source}: {}", message.trim());
}

fn collect_sanitized_logs(app: &AppHandle) -> String {
    let directory = logs_dir(app);
    let paths = (1..=LOG_ARCHIVE_COUNT)
        .rev()
        .map(|index| archived_log_path(&directory, index))
        .chain(std::iter::once(directory.join(LOG_FILE_NAME)));
    let mut output = String::new();

    for path in paths {
        let Ok(bytes) = fs::read(&path) else {
            continue;
        };
        let contents = String::from_utf8_lossy(&bytes);
        let sanitized = sanitize_support_text(app, &contents);
        if sanitized.trim().is_empty() {
            continue;
        }

        if !output.is_empty() {
            output.push('\n');
        }
        output.push_str("--- log segment ---\n");
        output.push_str(&sanitized);
        if !sanitized.ends_with('\n') {
            output.push('\n');
        }
    }

    if output.is_empty() {
        "No application log entries were available.\n".to_string()
    } else {
        output
    }
}

fn sanitize_support_text(app: &AppHandle, text: &str) -> String {
    let configured_storage = read_desktop_settings(app)
        .and_then(|settings| settings.transfer_storage_dir)
        .unwrap_or_else(|| default_transfer_storage_dir(app));
    let replacements = [
        (
            configured_storage.to_string_lossy().to_string(),
            "<transfer-storage>",
        ),
        (
            desktop_data_dir(app).to_string_lossy().to_string(),
            "<app-data>",
        ),
    ];

    text.lines()
        .map(|line| {
            let lower = line.to_ascii_lowercase();
            if lower.contains("authorization:")
                || lower.contains("bearer ")
                || lower.contains("session_token")
                || lower.contains("join_pin")
            {
                return "[redacted sensitive log line]".to_string();
            }

            let mut sanitized = redact_query_value(line, "ticket=");
            for (value, replacement) in &replacements {
                if !value.is_empty() {
                    sanitized = sanitized.replace(value, replacement);
                }
            }
            sanitized
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn redact_query_value(input: &str, marker: &str) -> String {
    let mut output = input.to_string();
    let mut cursor = 0;

    loop {
        let lower = output.to_ascii_lowercase();
        let Some(relative_index) = lower[cursor..].find(marker) else {
            break;
        };
        let value_start = cursor + relative_index + marker.len();
        let value_end = output[value_start..]
            .find(|character: char| {
                character.is_whitespace() || matches!(character, '&' | '"' | '\'' | ',' | '}' | ']')
            })
            .map(|offset| value_start + offset)
            .unwrap_or(output.len());

        output.replace_range(value_start..value_end, "<redacted>");
        cursor = value_start + "<redacted>".len();
    }

    output
}

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
            open_logs_folder,
            export_support_bundle,
            restart_app
        ])
        .setup(|app| {
            let logger = DesktopLog::new(logs_dir(app.handle())).map_err(|error| {
                tauri::Error::Anyhow(anyhow::anyhow!(
                    "failed to initialize desktop logging: {error}"
                ))
            })?;
            app.manage(logger);
            desktop_log(app.handle(), "desktop", "INFO", "desktop app starting");

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
                    desktop_log(
                        app,
                        "desktop",
                        "ERROR",
                        &format!("failed to open Drop Den window: {error}"),
                    );
                }
            }
            "copy_join_url" => match fetch_join_url() {
                Ok(join_url) => {
                    if let Err(error) = app.clipboard().write_text(join_url) {
                        desktop_log(
                            app,
                            "desktop",
                            "ERROR",
                            &format!("failed to copy join URL: {error}"),
                        );
                    }
                }
                Err(error) => {
                    desktop_log(
                        app,
                        "desktop",
                        "ERROR",
                        &format!("failed to fetch join URL: {error}"),
                    );
                }
            },
            "copy_local_url" => {
                if let Err(error) = app.clipboard().write_text(BACKEND_URL.to_string()) {
                    desktop_log(
                        app,
                        "desktop",
                        "ERROR",
                        &format!("failed to copy local URL: {error}"),
                    );
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

    let (mut rx, child) = command
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

    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    let message = String::from_utf8_lossy(&bytes);
                    desktop_log(&app_handle, "backend", "INFO", &message);
                }
                CommandEvent::Stderr(bytes) => {
                    let message = String::from_utf8_lossy(&bytes);
                    desktop_log(&app_handle, "backend", "INFO", &message);
                }
                CommandEvent::Error(error) => {
                    desktop_log(&app_handle, "backend", "ERROR", &error);
                }
                CommandEvent::Terminated(payload) => {
                    desktop_log(
                        &app_handle,
                        "backend",
                        "INFO",
                        &format!(
                            "backend process stopped (code: {:?}, signal: {:?})",
                            payload.code, payload.signal
                        ),
                    );
                }
                _ => {}
            }
        }
    });

    Ok(child)
}

fn desktop_data_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("drop-den-desktop"))
}

fn logs_dir(app: &AppHandle) -> PathBuf {
    desktop_data_dir(app).join("logs")
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
fn open_logs_folder(app: AppHandle) -> Result<(), String> {
    let directory = logs_dir(&app);
    fs::create_dir_all(&directory)
        .map_err(|error| format!("failed to create logs directory: {error}"))?;
    open_path(&directory)
}

#[tauri::command]
fn export_support_bundle(
    app: AppHandle,
    destination_path: String,
    diagnostics: String,
) -> Result<String, String> {
    if diagnostics.len() > MAX_DIAGNOSTICS_BYTES {
        return Err("diagnostics report is too large".to_string());
    }

    let destination = PathBuf::from(destination_path);
    if !destination.is_absolute() {
        return Err("support report path must be absolute".to_string());
    }
    if destination
        .extension()
        .and_then(|extension| extension.to_str())
        .is_none_or(|extension| !extension.eq_ignore_ascii_case("txt"))
    {
        return Err("support report must use a .txt extension".to_string());
    }

    let sanitized_diagnostics = sanitize_support_text(&app, &diagnostics);
    let recent_logs = collect_sanitized_logs(&app);
    let report = format!(
        "{sanitized_diagnostics}\n\nRecent application logs\n\
         =======================\n\
         {recent_logs}"
    );

    fs::write(&destination, report)
        .map_err(|error| format!("failed to save support report: {error}"))?;
    desktop_log(&app, "desktop", "INFO", "sanitized support report exported");

    Ok(destination.to_string_lossy().to_string())
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
fn restart_app(app: AppHandle) -> Result<(), String> {
    stop_backend(&app);

    // Give the operating system a moment to release the backend port before
    // replacing the sidecar in the same desktop process.
    thread::sleep(Duration::from_millis(250));

    let child = start_backend_sidecar(&app)
        .map_err(|error| format!("failed to restart the desktop backend: {error}"))?;

    let state = app
        .try_state::<BackendChild>()
        .ok_or_else(|| "desktop backend state is unavailable".to_string())?;
    let mut managed_child = state
        .0
        .lock()
        .map_err(|_| "desktop backend state is locked".to_string())?;
    *managed_child = Some(child);
    drop(managed_child);

    wait_for_backend_health(Duration::from_secs(15))
        .map_err(|error| format!("restarted backend did not become ready: {error}"))?;

    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main desktop window is unavailable".to_string())?;
    window
        .eval("window.location.reload()")
        .map_err(|error| format!("failed to reload the desktop window: {error}"))?;

    Ok(())
}

fn configured_transfer_storage_dir(app: &AppHandle) -> PathBuf {
    let default_dir = default_transfer_storage_dir(app);
    let configured_dir = read_desktop_settings(app)
        .and_then(|settings| settings.transfer_storage_dir)
        .unwrap_or_else(|| default_dir.clone());

    if let Err(error) = validate_writable_directory(&configured_dir) {
        desktop_log(
            app,
            "desktop",
            "WARN",
            &format!(
                "configured transfer storage directory is unavailable: {error}; using fallback"
            ),
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
            desktop_log(
                app,
                "desktop",
                "ERROR",
                &format!("failed to read desktop settings: {error}"),
            );
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

    desktop_log(app, "desktop", "INFO", "using bundled frontend dist");

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

    #[test]
    fn support_report_redacts_download_tickets() {
        let sanitized = redact_query_value(
            "GET /api/transfers/example/download?ticket=secret-value&preview=1",
            "ticket=",
        );

        assert_eq!(
            sanitized,
            "GET /api/transfers/example/download?ticket=<redacted>&preview=1"
        );
        assert!(!sanitized.contains("secret-value"));
    }

    #[test]
    fn desktop_logs_rotate_at_the_size_limit() {
        let directory = unique_temp_path("logs");
        std::fs::create_dir_all(&directory).unwrap();
        std::fs::write(
            directory.join(LOG_FILE_NAME),
            vec![b'x'; LOG_FILE_MAX_BYTES as usize],
        )
        .unwrap();

        let mut writer = LogWriter::new(directory.clone()).unwrap();
        writer
            .write("desktop", "INFO", "new active log entry")
            .unwrap();
        drop(writer);

        assert!(archived_log_path(&directory, 1).is_file());
        assert!(directory.join(LOG_FILE_NAME).is_file());
        assert!(
            std::fs::metadata(directory.join(LOG_FILE_NAME))
                .unwrap()
                .len()
                < LOG_FILE_MAX_BYTES
        );

        std::fs::remove_dir_all(directory).unwrap();
    }
}
