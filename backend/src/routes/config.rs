use crate::{
    auth::{optional_authenticated_device, require_host_device},
    db,
    models::{AppConfig, HostSettings, UpdateHostSettingsRequest},
    settings::valid_transfer_ttl_seconds,
    state::AppState,
};
use axum::{
    extract::{ConnectInfo, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use local_ip_address::local_ip;
use std::net::SocketAddr;

struct DesktopPaths {
    data_dir: Option<String>,
    storage_dir: Option<String>,
    database_path: Option<String>,
}

pub async fn config(
    State(state): State<AppState>,
    peer: Option<ConnectInfo<SocketAddr>>,
    headers: HeaderMap,
) -> Json<AppConfig> {
    let host_device_id = state.host_device_id.read().await.clone();
    let authenticated = optional_authenticated_device(&state, &headers).await;
    let is_host_device = authenticated
        .as_ref()
        .map(|device| device.is_host)
        .unwrap_or(false);

    let mode = std::env::var("DROP_DEN_MODE").unwrap_or_else(|_| "development".to_string());
    let is_loopback = peer
        .map(|ConnectInfo(address)| address.ip().is_loopback())
        .unwrap_or(false);
    let desktop_paths = if mode == "desktop" && is_host_device && is_loopback {
        Some(DesktopPaths {
            data_dir: std::env::var("DROP_DEN_DATA_DIR").ok(),
            storage_dir: Some(state.storage_dir.to_string_lossy().to_string()),
            database_path: std::env::var("DROP_DEN_DATABASE_PATH").ok(),
        })
    } else {
        None
    };
    let port = std::env::var("DROP_DEN_PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or_else(|| if mode == "packaged" { 80 } else { 8080 });

    let public_name = std::env::var("DROP_DEN_PUBLIC_NAME").ok();
    let friendly_origin = public_name.as_ref().map(|name| origin_for(name, port));

    let lan_ip = detect_lan_ip();
    let lan_origin = lan_ip.as_ref().map(|ip| origin_for(ip, port));

    let local_origin = origin_for("localhost", port);

    let recommended_join_origin = if mode == "packaged" || mode == "desktop" {
        lan_origin.clone().unwrap_or_else(|| local_origin.clone())
    } else {
        lan_ip
            .as_ref()
            .map(|ip| origin_for(ip, 5173))
            .unwrap_or_else(|| origin_for("localhost", 5173))
    };

    Json(AppConfig {
        app_name: "Drop Den".to_string(),
        mode,
        port,
        local_only: true,
        public_name,
        friendly_origin,
        lan_ip,
        lan_origin,
        local_origin,
        recommended_join_origin,
        has_host_device: host_device_id.is_some(),
        is_host_device,
        join_pin: if is_host_device {
            Some(state.join_pin.read().await.clone())
        } else {
            None
        },
        max_upload_size_bytes: state.limits.max_file_bytes,
        default_transfer_ttl_seconds: *state.transfer_ttl_seconds.read().await,
        data_dir: desktop_paths
            .as_ref()
            .and_then(|paths| paths.data_dir.clone()),
        storage_dir: desktop_paths
            .as_ref()
            .and_then(|paths| paths.storage_dir.clone()),
        database_path: desktop_paths
            .as_ref()
            .and_then(|paths| paths.database_path.clone()),
    })
}

pub async fn update_host_settings(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<UpdateHostSettingsRequest>,
) -> Result<Json<HostSettings>, StatusCode> {
    require_host_device(&state, &headers).await?;

    if !valid_transfer_ttl_seconds(payload.transfer_ttl_seconds) {
        return Err(StatusCode::BAD_REQUEST);
    }

    db::set_setting(
        &state.db,
        crate::settings::TRANSFER_TTL_SETTING_KEY,
        &payload.transfer_ttl_seconds.to_string(),
    )
    .await
    .map_err(|error| {
        tracing::error!(error = %error, "failed to persist host settings");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    *state.transfer_ttl_seconds.write().await = payload.transfer_ttl_seconds;
    let settings = HostSettings {
        transfer_ttl_seconds: payload.transfer_ttl_seconds,
    };

    state.broadcast_all("config_updated", &settings);

    Ok(Json(settings))
}

fn detect_lan_ip() -> Option<String> {
    local_ip().ok().map(|ip| ip.to_string())
}

fn origin_for(host: &str, port: u16) -> String {
    if port == 80 {
        format!("http://{host}")
    } else {
        format!("http://{host}:{port}")
    }
}
