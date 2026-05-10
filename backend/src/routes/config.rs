use crate::{models::AppConfig, state::AppState};
use axum::{
    extract::{Query, State},
    Json,
};
use serde::Deserialize;

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

    Json(AppConfig {
        app_name: "Drop Den".to_string(),
        port: 8080,
        local_only: true,
        has_host_device: host_device_id.is_some(),
        is_host_device,
        join_pin: if is_host_device {
            Some(state.join_pin.clone())
        } else {
            None
        },
    })
}
