use crate::{
    auth::{generate_session_token, hash_session_token, require_authenticated_device},
    db,
    models::{Device, RegisterDeviceRequest, RegisteredDevice},
    state::AppState,
};
use axum::{
    extract::{ConnectInfo, Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use chrono::Utc;
use std::{net::SocketAddr, time::Duration};
use uuid::Uuid;

pub async fn list_devices(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<Device>>, StatusCode> {
    require_authenticated_device(&state, &headers).await?;

    let devices = state.devices.read().await;
    Ok(Json(devices.values().cloned().collect()))
}

pub async fn register_device(
    State(state): State<AppState>,
    peer: Option<ConnectInfo<SocketAddr>>,
    Json(input): Json<RegisterDeviceRequest>,
) -> Result<Json<RegisteredDevice>, StatusCode> {
    let peer_key = peer
        .map(|ConnectInfo(address)| address.ip().to_string())
        .unwrap_or_else(|| "unknown".to_string());
    if !state
        .rate_limiter
        .check(format!("pair:{peer_key}"), 12, Duration::from_secs(5 * 60))
        .await
    {
        return Err(StatusCode::TOO_MANY_REQUESTS);
    }
    let trimmed_name = input.name.trim();

    if trimmed_name.is_empty() || trimmed_name.chars().count() > 64 {
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
    let session_token = generate_session_token();
    let session_token_hash = hash_session_token(&session_token);

    db::insert_device(&state.db, &device, &session_token_hash)
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
    state
        .sessions
        .write()
        .await
        .insert(session_token_hash, device.id.clone());

    state.broadcast_all("device_registered", &device);

    Ok(Json(RegisteredDevice {
        device,
        session_token,
    }))
}

pub async fn remove_device(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(device_id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let requester = require_authenticated_device(&state, &headers).await?;
    let host_device_id = state.host_device_id.read().await.clone();
    let requester_is_host = requester.is_host;
    let removing_self = requester.id == device_id;

    if !requester_is_host && !removing_self {
        return Err(StatusCode::FORBIDDEN);
    }

    if host_device_id.as_deref() == Some(device_id.as_str()) {
        return Err(StatusCode::BAD_REQUEST);
    }

    remove_transfers_targeted_to(&state, &device_id).await?;

    db::delete_device(&state.db, &device_id)
        .await
        .map_err(|error| {
            tracing::error!(error = %error, device_id = %device_id, "failed to delete device from sqlite");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    detach_sender_metadata(&state, &device_id).await;

    let removed = state.devices.write().await.remove(&device_id);

    if let Some(device) = removed {
        state
            .sessions
            .write()
            .await
            .retain(|_, active_device_id| active_device_id != &device_id);
        state
            .download_tickets
            .write()
            .await
            .retain(|_, ticket| ticket.device_id != device_id);
        state.broadcast_and_disconnect("device_removed", &device, [device_id]);

        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

pub async fn reset_host_identity(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<StatusCode, StatusCode> {
    let requester = require_authenticated_device(&state, &headers).await?;
    let requesting_device_id = requester.id;
    let host_device_id = state.host_device_id.read().await.clone();

    if host_device_id.as_deref() != Some(requesting_device_id.as_str()) {
        return Err(StatusCode::FORBIDDEN);
    }

    remove_transfers_targeted_to(&state, &requesting_device_id).await?;

    db::release_host_device(&state.db, &requesting_device_id)
        .await
        .map_err(|error| {
            tracing::error!(error = %error, "failed to reset host device");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    detach_sender_metadata(&state, &requesting_device_id).await;

    *state.host_device_id.write().await = None;
    state.devices.write().await.remove(&requesting_device_id);
    state
        .sessions
        .write()
        .await
        .retain(|_, device_id| device_id != &requesting_device_id);
    state
        .download_tickets
        .write()
        .await
        .retain(|_, ticket| ticket.device_id != requesting_device_id);
    state.broadcast_to_and_disconnect(
        "session_revoked",
        &serde_json::json!({}),
        [requesting_device_id],
    );
    state.broadcast_all("host_reset", &serde_json::json!({}));

    Ok(StatusCode::NO_CONTENT)
}

pub async fn reset_desktop_data(
    State(state): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
) -> Result<StatusCode, StatusCode> {
    if !state.desktop_mode || !peer.ip().is_loopback() {
        return Err(StatusCode::FORBIDDEN);
    }

    let requester = require_authenticated_device(&state, &headers).await?;
    if !requester.is_host {
        return Err(StatusCode::FORBIDDEN);
    }

    let new_pin = db::generate_join_pin();
    let new_pin_hash = db::hash_join_pin(&new_pin).map_err(|error| {
        tracing::error!(error = %error, "failed to hash join pin during desktop reset");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    db::reset_all_data(&state.db, &new_pin_hash)
        .await
        .map_err(|error| {
            tracing::error!(error = %error, "failed to reset desktop data");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let removed_transfers = state
        .transfers
        .write()
        .await
        .drain()
        .map(|(_, transfer)| transfer)
        .collect::<Vec<_>>();

    state.messages.write().await.clear();
    state.devices.write().await.clear();
    state.sessions.write().await.clear();
    state.download_tickets.write().await.clear();
    *state.host_device_id.write().await = None;
    *state.join_pin.write().await = new_pin;
    *state.join_pin_hash.write().await = new_pin_hash;

    for transfer in removed_transfers {
        super::transfers::remove_transfer_files(&transfer).await;
    }

    state.broadcast_and_disconnect("desktop_reset", &serde_json::json!({}), std::iter::empty());

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

async fn remove_transfers_targeted_to(state: &AppState, device_id: &str) -> Result<(), StatusCode> {
    let targeted = state
        .transfers
        .read()
        .await
        .values()
        .filter(|transfer| transfer.target_device_id.as_deref() == Some(device_id))
        .cloned()
        .collect::<Vec<_>>();

    for transfer in targeted {
        db::delete_transfer(&state.db, &transfer.id)
            .await
            .map_err(|error| {
                tracing::error!(
                    error = %error,
                    transfer_id = %transfer.id,
                    "failed to remove transfer for a revoked recipient"
                );
                StatusCode::INTERNAL_SERVER_ERROR
            })?;
        state.transfers.write().await.remove(&transfer.id);
        super::transfers::remove_transfer_files(&transfer).await;

        let host_id = state.host_device_id.read().await.clone();
        let audience = [
            host_id,
            transfer.sender_device_id.clone(),
            transfer.target_device_id.clone(),
        ]
        .into_iter()
        .flatten()
        .collect::<std::collections::HashSet<_>>();
        state.broadcast_to("transfer_deleted", &transfer, audience);
    }

    Ok(())
}

async fn detach_sender_metadata(state: &AppState, device_id: &str) {
    for transfer in state.transfers.write().await.values_mut() {
        if transfer.sender_device_id.as_deref() == Some(device_id) {
            transfer.sender_device_id = None;
        }
    }
    for message in state.messages.write().await.iter_mut() {
        if message.sender_device_id.as_deref() == Some(device_id) {
            message.sender_device_id = None;
        }
    }
}
