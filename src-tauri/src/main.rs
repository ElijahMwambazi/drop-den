#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
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

const BACKEND_PORT: &str = "18080";
const BACKEND_URL: &str = "http://127.0.0.1:18080";
const HEALTH_URL: &str = "http://127.0.0.1:18080/api/health";

struct BackendChild(Mutex<Option<CommandChild>>);

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            let child = start_backend_sidecar(app)?;
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
    let copy_url_item =
        MenuItem::with_id(app, "copy_local_url", "Copy Local URL", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&open_item, &copy_url_item, &quit_item])?;

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

fn start_backend_sidecar(app: &tauri::App) -> tauri::Result<CommandChild> {
    let data_dir = desktop_data_dir(app);
    let storage_dir = data_dir.join("transfers");
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

fn desktop_data_dir(app: &tauri::App) -> std::path::PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("drop-den-desktop"))
}

fn bundled_frontend_dist(app: &tauri::App) -> tauri::Result<std::path::PathBuf> {
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
