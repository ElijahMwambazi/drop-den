#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    thread,
    time::{Duration, Instant},
};
use tauri::{Manager, WindowEvent};
use tauri_plugin_shell::{process::CommandChild, ShellExt};

const BACKEND_URL: &str = "http://127.0.0.1:8080";
const HEALTH_URL: &str = "http://127.0.0.1:8080/api/health";

struct BackendChild(std::sync::Mutex<Option<CommandChild>>);

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let child = start_backend_sidecar(app)?;

            app.manage(BackendChild(std::sync::Mutex::new(Some(child))));

            wait_for_backend_health(Duration::from_secs(15))?;

            if let Some(window) = app.get_webview_window("main") {
                window.show()?;
                window.set_focus()?;
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::CloseRequested { .. }) {
                if let Some(state) = window.try_state::<BackendChild>() {
                    if let Ok(mut child) = state.0.lock() {
                        if let Some(child) = child.take() {
    let _ = child.kill();
}
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run Drop Den desktop app");
}

fn start_backend_sidecar(app: &tauri::App) -> tauri::Result<CommandChild> {
    let command = app.shell().sidecar("drop-den-backend").map_err(|error| {
        tauri::Error::Anyhow(anyhow::anyhow!(
            "failed to create backend sidecar command: {error}"
        ))
    })?;

    let (_rx, child) = command
        .env("DROP_DEN_MODE", "desktop")
        .env("DROP_DEN_PORT", "8080")
        .env("DROP_DEN_PUBLIC_NAME", "127.0.0.1")
        .env("DROP_DEN_DATA_DIR", desktop_data_dir(app))
        .env(
            "DROP_DEN_STORAGE_DIR",
            desktop_data_dir(app).join("transfers"),
        )
        .env(
            "DROP_DEN_DATABASE_PATH",
            desktop_data_dir(app).join("drop-den.sqlite"),
        )
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
