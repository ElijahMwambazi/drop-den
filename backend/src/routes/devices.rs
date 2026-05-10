use crate::{
    models::{Device, RegisterDeviceRequest, WsEvent},
    state::AppState,
};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use chrono::Utc;
use serde::Deserialize;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub struct RemoveDeviceQuery {
    pub requesting_device_id: String,
}

pub async fn list_devices(State(state): State<AppState>) -> Json<Vec<Device>> {
    let devices = state.devices.read().await;
    Json(devices.values().cloned().collect())
}

pub async fn register_device(
    State(state): State<AppState>,
    Json(input): Json<RegisterDeviceRequest>,
) -> Result<Json<Device>, StatusCode> {
    let trimmed_name = input.name.trim();

    if trimmed_name.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let mut host_device_id = state.host_device_id.write().await;
    let is_first_device = host_device_id.is_none();

    if !is_first_device {
        let submitted_pin = input.join_pin.unwrap_or_default();

        if submitted_pin.trim() != state.join_pin {
            return Err(StatusCode::UNAUTHORIZED);
        }
    }

    let device = Device {
        id: Uuid::new_v4().to_string(),
        name: trimmed_name.to_string(),
        connected_at: Utc::now(),
    };

    if is_first_device {
        *host_device_id = Some(device.id.clone());
    }

    drop(host_device_id);

    state
        .devices
        .write()
        .await
        .insert(device.id.clone(), device.clone());

    state.broadcast_json(&WsEvent {
        event_type: "device_registered".to_string(),
        payload: device.clone(),
    });

    Ok(Json(device))
}

pub async fn remove_device(
    State(state): State<AppState>,
    Path(device_id): Path<String>,
    Query(query): Query<RemoveDeviceQuery>,
) -> Result<StatusCode, StatusCode> {
    let host_device_id = state.host_device_id.read().await.clone();

    if host_device_id.as_deref() != Some(query.requesting_device_id.as_str()) {
        return Err(StatusCode::FORBIDDEN);
    }

    if host_device_id.as_deref() == Some(device_id.as_str()) {
        return Err(StatusCode::BAD_REQUEST);
    }

    let removed = state.devices.write().await.remove(&device_id);

    if let Some(device) = removed {
        state.broadcast_json(&WsEvent {
            event_type: "device_removed".to_string(),
            payload: device,
        });

        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}
