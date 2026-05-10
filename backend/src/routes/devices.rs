use crate::{
    models::{Device, RegisterDeviceRequest, WsEvent},
    state::AppState,
};
use axum::{extract::State, http::StatusCode, Json};
use chrono::Utc;
use uuid::Uuid;

pub async fn list_devices(State(state): State<AppState>) -> Json<Vec<Device>> {
    let devices = state.devices.read().await;
    Json(devices.values().cloned().collect())
}

pub async fn register_device(
    State(state): State<AppState>,
    Json(input): Json<RegisterDeviceRequest>,
) -> Result<Json<Device>, StatusCode> {
    if input.join_pin.trim() != state.join_pin {
        return Err(StatusCode::UNAUTHORIZED);
    }

    let device = Device {
        id: Uuid::new_v4().to_string(),
        name: input.name.trim().to_string(),
        connected_at: Utc::now(),
    };

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
