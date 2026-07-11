use crate::{
    auth::require_registered_device,
    db,
    models::{Device, RegisterDeviceRequest, WsEvent},
    state::AppState,
};
use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use chrono::Utc;
use uuid::Uuid;

pub async fn list_devices(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<Device>>, StatusCode> {
    require_registered_device(&state, &headers).await?;

    let devices = state.devices.read().await;
    Ok(Json(devices.values().cloned().collect()))
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
        let current_hash = state.join_pin_hash.read().await.clone();

        let is_valid_pin =
            db::verify_join_pin(submitted_pin.trim(), &current_hash).map_err(|error| {
                tracing::error!(error = %error, "failed to verify join pin");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

        if !is_valid_pin {
            return Err(StatusCode::UNAUTHORIZED);
        }
    }

    let device = Device {
        id: Uuid::new_v4().to_string(),
        name: trimmed_name.to_string(),
        connected_at: Utc::now(),
    };

    db::insert_device(&state.db, &device)
        .await
        .map_err(|error| {
            tracing::error!(error = %error, "failed to persist registered device");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if is_first_device {
        db::set_setting(&state.db, "host_device_id", &device.id)
            .await
            .map_err(|error| {
                tracing::error!(error = %error, "failed to persist host device id");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

        *host_device_id = Some(device.id.clone());
    } else {
        rotate_join_pin(&state).await?;
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
    headers: HeaderMap,
    Path(device_id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let requesting_device_id = require_registered_device(&state, &headers).await?;
    let host_device_id = state.host_device_id.read().await.clone();

    if host_device_id.as_deref() != Some(requesting_device_id.as_str()) {
        return Err(StatusCode::FORBIDDEN);
    }

    if host_device_id.as_deref() == Some(device_id.as_str()) {
        return Err(StatusCode::BAD_REQUEST);
    }

    db::delete_device(&state.db, &device_id)
        .await
        .map_err(|error| {
            tracing::error!(error = %error, device_id = %device_id, "failed to delete device from sqlite");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

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

pub async fn reset_host_identity(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<StatusCode, StatusCode> {
    if std::env::var("DROP_DEN_MODE").ok().as_deref() != Some("desktop") {
        return Err(StatusCode::FORBIDDEN);
    }

    let requesting_device_id = require_registered_device(&state, &headers).await?;
    let host_device_id = state.host_device_id.read().await.clone();

    if host_device_id.as_deref() != Some(requesting_device_id.as_str()) {
        return Err(StatusCode::FORBIDDEN);
    }

    db::reset_host_device(&state.db).await.map_err(|error| {
        tracing::error!(error = %error, "failed to reset host device");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    *state.host_device_id.write().await = None;

    state.broadcast_json(&WsEvent {
        event_type: "host_reset".to_string(),
        payload: serde_json::json!({}),
    });

    Ok(StatusCode::NO_CONTENT)
}

async fn rotate_join_pin(state: &AppState) -> Result<(), StatusCode> {
    let new_pin = db::generate_join_pin();
    let new_hash = db::hash_join_pin(&new_pin).map_err(|error| {
        tracing::error!(error = %error, "failed to hash rotated join pin");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    db::set_setting(&state.db, "join_pin_hash", &new_hash)
        .await
        .map_err(|error| {
            tracing::error!(error = %error, "failed to persist rotated join pin hash");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    *state.join_pin.write().await = new_pin;
    *state.join_pin_hash.write().await = new_hash;

    Ok(())
}
