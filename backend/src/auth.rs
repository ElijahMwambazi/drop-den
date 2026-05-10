use crate::state::AppState;
use axum::http::{HeaderMap, StatusCode};

pub const DEVICE_ID_HEADER: &str = "x-drop-den-device-id";

pub async fn require_registered_device(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<String, StatusCode> {
    let device_id = headers
        .get(DEVICE_ID_HEADER)
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let devices = state.devices.read().await;

    if devices.contains_key(device_id) {
        Ok(device_id.to_string())
    } else {
        Err(StatusCode::UNAUTHORIZED)
    }
}

pub async fn require_registered_device_id(
    state: &AppState,
    device_id: Option<&str>,
) -> Result<String, StatusCode> {
    let device_id = device_id
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let devices = state.devices.read().await;

    if devices.contains_key(device_id) {
        Ok(device_id.to_string())
    } else {
        Err(StatusCode::UNAUTHORIZED)
    }
}
