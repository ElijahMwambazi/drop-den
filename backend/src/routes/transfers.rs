use crate::{
    auth::{require_registered_device, require_registered_device_id},
    models::{Transfer, TransferStatus, WsEvent},
    state::AppState,
};
use axum::{
    body::Body,
    extract::{Multipart, Path, Query, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use chrono::{Duration, Utc};
use std::{
    io::{Cursor, Write},
    path::PathBuf,
};
use tokio::{fs::File, io::AsyncWriteExt};
use uuid::Uuid;
use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

const MAX_UPLOAD_SIZE_BYTES: u64 = 250 * 1024 * 1024;
const DEFAULT_TRANSFER_TTL_SECONDS: i64 = 24 * 60 * 60;

#[derive(Debug, serde::Deserialize)]
pub struct DeviceQuery {
    pub device_id: Option<String>,
}

pub async fn list_transfers(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<Transfer>>, StatusCode> {
    require_registered_device(&state, &headers).await?;

    let transfers = state.transfers.read().await;
    Ok(Json(transfers.values().cloned().collect()))
}

pub async fn upload_transfer(
    State(state): State<AppState>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> Result<Json<Transfer>, StatusCode> {
    let requesting_device_id = require_registered_device(&state, &headers).await?;
    let transfer_id = Uuid::new_v4().to_string();
    let transfer_dir = state.storage_dir.join(&transfer_id);
    tokio::fs::create_dir_all(&transfer_dir)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut target_device_id: Option<String> = None;
    let mut saved_transfer: Option<Transfer> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)?
    {
        let name = field.name().unwrap_or_default().to_string();

        match name.as_str() {
            "target_device_id" => {
                target_device_id = field.text().await.ok().filter(|value| !value.is_empty());
            }
            "file" => {
                let filename = field
                    .file_name()
                    .map(sanitize_filename)
                    .unwrap_or_else(|| "upload.bin".to_string());
                let mime_type = field
                    .content_type()
                    .map(|mime| mime.to_string())
                    .unwrap_or_else(|| "application/octet-stream".to_string());

                let file_path = transfer_dir.join(&filename);
                let mut file = File::create(&file_path)
                    .await
                    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

                let mut size: u64 = 0;
                let mut field = field;

                while let Some(chunk) = field.chunk().await.map_err(|_| StatusCode::BAD_REQUEST)? {
                    size += chunk.len() as u64;

                    if size > MAX_UPLOAD_SIZE_BYTES {
                        let _ = tokio::fs::remove_dir_all(&transfer_dir).await;
                        return Err(StatusCode::PAYLOAD_TOO_LARGE);
                    }

                    file.write_all(&chunk)
                        .await
                        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
                }

                let status = if target_device_id.is_some() {
                    TransferStatus::Pending
                } else {
                    TransferStatus::Available
                };

                let created_at = Utc::now();
                let expires_at = created_at + Duration::seconds(DEFAULT_TRANSFER_TTL_SECONDS);

                saved_transfer = Some(Transfer {
                    id: transfer_id.clone(),
                    filename,
                    mime_type,
                    size,
                    sender_device_id: Some(requesting_device_id.clone()),
                    target_device_id: target_device_id.clone(),
                    status,
                    stored_path: file_path.to_string_lossy().to_string(),
                    created_at,
                    expires_at,
                });
            }
            _ => {}
        }
    }

    let transfer = saved_transfer.ok_or(StatusCode::BAD_REQUEST)?;
    state
        .transfers
        .write()
        .await
        .insert(transfer.id.clone(), transfer.clone());

    state.broadcast_json(&WsEvent {
        event_type: "transfer_created".to_string(),
        payload: transfer.clone(),
    });

    Ok(Json(transfer))
}

pub async fn download_transfer(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(query): Query<DeviceQuery>,
) -> Result<Response, StatusCode> {
    require_registered_device_id(&state, query.device_id.as_deref()).await?;
    let transfer = {
        let transfers = state.transfers.read().await;
        transfers.get(&id).cloned()
    }
    .ok_or(StatusCode::NOT_FOUND)?;

    if is_expired(&transfer) {
        return Err(StatusCode::GONE);
    }

    if !is_downloadable(&transfer) {
        return Err(StatusCode::FORBIDDEN);
    }

    let bytes = tokio::fs::read(&transfer.stored_path)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;

    let response = Response::builder()
        .header(header::CONTENT_TYPE, transfer.mime_type)
        .header(
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"{}\"", transfer.filename),
        )
        .body(Body::from(bytes))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(response)
}

pub async fn download_all_transfers(
    State(state): State<AppState>,
    Query(query): Query<DeviceQuery>,
) -> Result<Response, StatusCode> {
    require_registered_device_id(&state, query.device_id.as_deref()).await?;

    let mut transfers = {
        let transfers = state.transfers.read().await;
        transfers
            .values()
            .filter(|transfer| is_downloadable(transfer))
            .cloned()
            .collect::<Vec<_>>()
    };

    transfers.sort_by_key(|transfer| transfer.created_at);

    let cursor = Cursor::new(Vec::<u8>::new());
    let mut zip = ZipWriter::new(cursor);

    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

    for (index, transfer) in transfers.iter().enumerate() {
        let bytes = tokio::fs::read(&transfer.stored_path)
            .await
            .map_err(|_| StatusCode::NOT_FOUND)?;

        let filename = zip_filename(index, &transfer.filename);

        zip.start_file(filename, options)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        zip.write_all(&bytes)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    let cursor = zip
        .finish()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let bytes = cursor.into_inner();

    let response = Response::builder()
        .header(header::CONTENT_TYPE, "application/zip")
        .header(
            header::CONTENT_DISPOSITION,
            "attachment; filename=\"drop-den-transfers.zip\"",
        )
        .body(Body::from(bytes))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(response)
}

pub async fn accept_transfer(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Transfer>, StatusCode> {
    require_registered_device(&state, &headers).await?;
    update_transfer_status(state, id, TransferStatus::Accepted).await
}

pub async fn reject_transfer(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Transfer>, StatusCode> {
    require_registered_device(&state, &headers).await?;
    update_transfer_status(state, id, TransferStatus::Rejected).await
}

pub async fn delete_transfer(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, StatusCode> {
    require_registered_device(&state, &headers).await?;
    let removed = state.transfers.write().await.remove(&id);

    if let Some(transfer) = removed {
        remove_transfer_files(&transfer).await;

        state.broadcast_json(&WsEvent {
            event_type: "transfer_deleted".to_string(),
            payload: transfer,
        });

        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

pub async fn delete_all_transfers(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, StatusCode> {
    require_registered_device(&state, &headers).await?;

    let removed_transfers = {
        let mut transfers = state.transfers.write().await;
        transfers
            .drain()
            .map(|(_, transfer)| transfer)
            .collect::<Vec<_>>()
    };

    for transfer in removed_transfers {
        remove_transfer_files(&transfer).await;

        state.broadcast_json(&WsEvent {
            event_type: "transfer_deleted".to_string(),
            payload: transfer,
        });
    }

    Ok(StatusCode::NO_CONTENT)
}

async fn update_transfer_status(
    state: AppState,
    id: String,
    status: TransferStatus,
) -> Result<Json<Transfer>, StatusCode> {
    let transfer = {
        let mut transfers = state.transfers.write().await;
        let transfer = transfers.get_mut(&id).ok_or(StatusCode::NOT_FOUND)?;

        if is_expired(transfer) {
            return Err(StatusCode::GONE);
        }

        transfer.status = status;
        transfer.clone()
    };

    state.broadcast_json(&WsEvent {
        event_type: "transfer_updated".to_string(),
        payload: transfer.clone(),
    });

    Ok(Json(transfer))
}

fn is_downloadable(transfer: &Transfer) -> bool {
    !is_expired(transfer)
        && matches!(
            transfer.status,
            TransferStatus::Available | TransferStatus::Accepted
        )
}

fn is_expired(transfer: &Transfer) -> bool {
    Utc::now() >= transfer.expires_at
}

fn sanitize_filename(input: &str) -> String {
    input
        .chars()
        .filter(|c| c.is_alphanumeric() || matches!(c, '.' | '-' | '_'))
        .collect::<String>()
}

fn zip_filename(index: usize, filename: &str) -> String {
    let sanitized = sanitize_filename(filename);

    if sanitized.is_empty() {
        return format!("{:03}-file", index + 1);
    }

    format!("{:03}-{}", index + 1, sanitized)
}

async fn remove_transfer_files(transfer: &Transfer) {
    let path = PathBuf::from(&transfer.stored_path);

    if let Some(parent) = path.parent() {
        let _ = tokio::fs::remove_dir_all(parent).await;
    }
}
