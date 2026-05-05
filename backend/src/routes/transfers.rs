use crate::{models::{Transfer, WsEvent}, state::AppState};
use axum::{
    body::Body,
    extract::{Multipart, Path, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use chrono::Utc;
use std::path::PathBuf;
use tokio::{fs::File, io::AsyncWriteExt};
use uuid::Uuid;

pub async fn list_transfers(State(state): State<AppState>) -> Json<Vec<Transfer>> {
    let transfers = state.transfers.read().await;
    Json(transfers.values().cloned().collect())
}

pub async fn upload_transfer(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<Transfer>, StatusCode> {
    let transfer_id = Uuid::new_v4().to_string();
    let transfer_dir = state.storage_dir.join(&transfer_id);
    tokio::fs::create_dir_all(&transfer_dir)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut sender_device_id: Option<String> = None;
    let mut target_device_id: Option<String> = None;
    let mut saved_transfer: Option<Transfer> = None;

    while let Some(field) = multipart.next_field().await.map_err(|_| StatusCode::BAD_REQUEST)? {
        let name = field.name().unwrap_or_default().to_string();

        match name.as_str() {
            "sender_device_id" => {
                sender_device_id = field.text().await.ok().filter(|value| !value.is_empty());
            }
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
                    file.write_all(&chunk)
                        .await
                        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
                }

                saved_transfer = Some(Transfer {
                    id: transfer_id.clone(),
                    filename,
                    mime_type,
                    size,
                    sender_device_id: sender_device_id.clone(),
                    target_device_id: target_device_id.clone(),
                    stored_path: file_path.to_string_lossy().to_string(),
                    created_at: Utc::now(),
                });
            }
            _ => {}
        }
    }

    let transfer = saved_transfer.ok_or(StatusCode::BAD_REQUEST)?;
    state.transfers.write().await.insert(transfer.id.clone(), transfer.clone());

    state.broadcast_json(&WsEvent {
        event_type: "transfer_created".to_string(),
        payload: transfer.clone(),
    });

    Ok(Json(transfer))
}

pub async fn download_transfer(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Response, StatusCode> {
    let transfer = {
        let transfers = state.transfers.read().await;
        transfers.get(&id).cloned()
    }
    .ok_or(StatusCode::NOT_FOUND)?;

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

pub async fn delete_transfer(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let removed = state.transfers.write().await.remove(&id);

    if let Some(transfer) = removed {
        let path = PathBuf::from(&transfer.stored_path);
        if let Some(parent) = path.parent() {
            let _ = tokio::fs::remove_dir_all(parent).await;
        }

        state.broadcast_json(&WsEvent {
            event_type: "transfer_deleted".to_string(),
            payload: transfer,
        });

        StatusCode::NO_CONTENT
    } else {
        StatusCode::NOT_FOUND
    }
}

fn sanitize_filename(input: &str) -> String {
    input
        .chars()
        .filter(|c| c.is_alphanumeric() || matches!(c, '.' | '-' | '_'))
        .collect::<String>()
}
