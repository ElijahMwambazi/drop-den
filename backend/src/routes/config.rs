use crate::{models::AppConfig, state::AppState};
use axum::{
    extract::{Query, State},
    Json,
};
use serde::Deserialize;

const MAX_UPLOAD_SIZE_BYTES: u64 = 250 * 1024 * 1024;
const DEFAULT_TRANSFER_TTL_SECONDS: u64 = 24 * 60 * 60;

#[derive(Debug, Deserialize)]
pub struct ConfigQuery {
    pub device_id: Option<String>,
}

pub async fn config(
    State(state): State<AppState>,
    Query(query): Query<ConfigQuery>,
) -> Json<AppConfig> {
    let host_device_id = state.host_device_id.read().await.clone();
    let is_host_device = match (&host_device_id, &query.device_id) {
        (Some(host_id), Some(device_id)) => host_id == device_id,
        _ => false,
    };

    let mode = std::env::var("DROP_DEN_MODE").unwrap_or_else(|_| "development".to_string());
    let port = std::env::var("DROP_DEN_PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or_else(|| if mode == "packaged" { 80 } else { 8080 });

    let public_name = std::env::var("DROP_DEN_PUBLIC_NAME").ok();
    let friendly_origin = public_name.as_ref().map(|name| {
        if port == 80 {
            format!("http://{name}")
        } else {
            format!("http://{name}:{port}")
        }
    });

    Json(AppConfig {
        app_name: "Drop Den".to_string(),
        mode,
        port,
        local_only: true,
        public_name,
        friendly_origin,
        has_host_device: host_device_id.is_some(),
        is_host_device,
        join_pin: if is_host_device {
            Some(state.join_pin.clone())
        } else {
            None
        },
        max_upload_size_bytes: MAX_UPLOAD_SIZE_BYTES,
        default_transfer_ttl_seconds: DEFAULT_TRANSFER_TTL_SECONDS,
    })
}
