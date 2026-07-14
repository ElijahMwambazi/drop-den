use crate::{auth::require_registered_device, db, models::InboxItem, state::AppState};
use axum::{
    extract::{Multipart, Path, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use chrono::{Duration, Utc};
use serde_json::json;
use tokio::{fs::File, io::AsyncWriteExt};
use uuid::Uuid;

pub const MAX_INBOX_ITEM_SIZE_BYTES: u64 = 250 * 1024 * 1024;
pub const MAX_INBOX_ITEMS_PER_DEVICE: u64 = 50;
pub const MAX_TOTAL_INBOX_SIZE_BYTES: u64 = 500 * 1024 * 1024;
pub const INBOX_TTL_SECONDS: i64 = 24 * 60 * 60;

pub async fn list_inbox_items(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<InboxItem>>, InboxApiError> {
    let owner_device_id = authorize(&state, &headers).await?;
    let items = db::list_inbox_items_for_device(&state.db, &owner_device_id)
        .await
        .map_err(internal_error)?;
    let now = Utc::now();

    Ok(Json(
        items
            .into_iter()
            .filter(|item| now < item.expires_at)
            .collect(),
    ))
}

pub async fn upload_inbox_item(
    State(state): State<AppState>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> Result<Json<InboxItem>, InboxApiError> {
    let owner_device_id = authorize(&state, &headers).await?;
    let _write_guard = state.inbox_write_lock.lock().await;
    let (current_total_bytes, owner_count) = db::inbox_usage(&state.db, &owner_device_id)
        .await
        .map_err(internal_error)?;

    if owner_count >= MAX_INBOX_ITEMS_PER_DEVICE {
        return Err(InboxApiError::new(
            StatusCode::CONFLICT,
            "inbox_item_limit",
            "This device inbox already contains 50 items.",
        ));
    }

    if current_total_bytes >= MAX_TOTAL_INBOX_SIZE_BYTES {
        return Err(InboxApiError::new(
            StatusCode::INSUFFICIENT_STORAGE,
            "inbox_storage_limit",
            "The shared inbox has reached its 500 MiB storage limit.",
        ));
    }

    let item_id = Uuid::new_v4().to_string();
    let item_dir = state.inbox_dir.join(&owner_device_id).join(&item_id);
    let stored_path = item_dir.join("content");
    let mut saved_item: Option<InboxItem> = None;

    loop {
        let field = match multipart.next_field().await {
            Ok(Some(field)) => field,
            Ok(None) => break,
            Err(_) => {
                remove_item_directory(&item_dir).await;
                return Err(InboxApiError::new(
                    StatusCode::BAD_REQUEST,
                    "invalid_multipart",
                    "The inbox upload could not be read.",
                ));
            }
        };

        if field.name() != Some("file") {
            continue;
        }

        if saved_item.is_some() {
            remove_item_directory(&item_dir).await;
            return Err(InboxApiError::new(
                StatusCode::BAD_REQUEST,
                "single_file_required",
                "Upload one inbox file per request.",
            ));
        }

        let filename = field
            .file_name()
            .map(sanitize_filename)
            .filter(|name| !name.is_empty())
            .unwrap_or_else(|| "shared-file.bin".to_string());
        let mime_type = field
            .content_type()
            .map(ToString::to_string)
            .unwrap_or_else(|| "application/octet-stream".to_string());

        if let Err(error) = tokio::fs::create_dir_all(&item_dir).await {
            return Err(internal_error(error));
        }
        let mut file = match File::create(&stored_path).await {
            Ok(file) => file,
            Err(error) => {
                remove_item_directory(&item_dir).await;
                return Err(internal_error(error));
            }
        };
        let mut size = 0_u64;
        let mut field = field;

        loop {
            let chunk = match field.chunk().await {
                Ok(Some(chunk)) => chunk,
                Ok(None) => break,
                Err(_) => {
                    drop(file);
                    remove_item_directory(&item_dir).await;
                    return Err(InboxApiError::new(
                        StatusCode::BAD_REQUEST,
                        "invalid_upload",
                        "The shared file upload was interrupted.",
                    ));
                }
            };
            size += chunk.len() as u64;

            if size > MAX_INBOX_ITEM_SIZE_BYTES {
                drop(file);
                remove_item_directory(&item_dir).await;
                return Err(InboxApiError::new(
                    StatusCode::PAYLOAD_TOO_LARGE,
                    "inbox_item_too_large",
                    "Inbox items cannot exceed 250 MiB.",
                ));
            }

            if current_total_bytes.saturating_add(size) > MAX_TOTAL_INBOX_SIZE_BYTES {
                drop(file);
                remove_item_directory(&item_dir).await;
                return Err(InboxApiError::new(
                    StatusCode::INSUFFICIENT_STORAGE,
                    "inbox_storage_limit",
                    "The shared inbox cannot exceed 500 MiB.",
                ));
            }

            if let Err(error) = file.write_all(&chunk).await {
                drop(file);
                remove_item_directory(&item_dir).await;
                return Err(internal_error(error));
            }
        }

        if let Err(error) = file.flush().await {
            drop(file);
            remove_item_directory(&item_dir).await;
            return Err(internal_error(error));
        }
        let created_at = Utc::now();
        saved_item = Some(InboxItem {
            id: item_id.clone(),
            owner_device_id: owner_device_id.clone(),
            filename,
            mime_type,
            size,
            stored_path: stored_path.to_string_lossy().to_string(),
            created_at,
            expires_at: created_at + Duration::seconds(INBOX_TTL_SECONDS),
        });
    }

    let item = saved_item.ok_or_else(|| {
        InboxApiError::new(
            StatusCode::BAD_REQUEST,
            "file_required",
            "Add a file using the multipart field named 'file'.",
        )
    })?;

    if let Err(error) = db::insert_inbox_item(&state.db, &item).await {
        remove_item_directory(&item_dir).await;
        return Err(internal_error(error));
    }

    Ok(Json(item))
}

pub async fn delete_inbox_item(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(item_id): Path<String>,
) -> Result<StatusCode, InboxApiError> {
    let owner_device_id = authorize(&state, &headers).await?;
    let _write_guard = state.inbox_write_lock.lock().await;
    let item = db::delete_inbox_item(&state.db, &item_id, &owner_device_id)
        .await
        .map_err(internal_error)?
        .ok_or_else(|| {
            InboxApiError::new(
                StatusCode::NOT_FOUND,
                "inbox_item_not_found",
                "That inbox item is unavailable.",
            )
        })?;

    remove_inbox_item_files(&state.inbox_dir, &item).await;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn clear_inbox(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<StatusCode, InboxApiError> {
    let owner_device_id = authorize(&state, &headers).await?;
    let _write_guard = state.inbox_write_lock.lock().await;
    let items = db::delete_all_inbox_items_for_device(&state.db, &owner_device_id)
        .await
        .map_err(internal_error)?;

    for item in items {
        remove_inbox_item_files(&state.inbox_dir, &item).await;
    }

    Ok(StatusCode::NO_CONTENT)
}

pub(crate) async fn remove_inbox_item_files(inbox_dir: &std::path::Path, item: &InboxItem) {
    let path = std::path::Path::new(&item.stored_path);

    if let Some(parent) = path.parent() {
        if !parent.starts_with(inbox_dir) {
            tracing::warn!(
                inbox_item_id = %item.id,
                path = %parent.display(),
                "refusing to remove an inbox path outside the managed inbox directory"
            );
            return;
        }

        remove_item_directory(parent).await;
    }
}

pub(crate) async fn remove_device_inbox_directory(state: &AppState, device_id: &str) {
    remove_item_directory(&state.inbox_dir.join(device_id)).await;
}

pub(crate) async fn clear_all_inbox_files(state: &AppState) {
    remove_item_directory(&state.inbox_dir).await;

    if let Err(error) = tokio::fs::create_dir_all(&state.inbox_dir).await {
        tracing::warn!(
            path = %state.inbox_dir.display(),
            error = %error,
            "failed to recreate inbox directory"
        );
    }
}

async fn remove_item_directory(path: &std::path::Path) {
    match tokio::fs::remove_dir_all(path).await {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => {
            tracing::warn!(path = %path.display(), error = %error, "failed to remove inbox files");
        }
    }
}

async fn authorize(state: &AppState, headers: &HeaderMap) -> Result<String, InboxApiError> {
    require_registered_device(state, headers)
        .await
        .map_err(|status| {
            InboxApiError::new(
                status,
                "device_required",
                "Register this device before using the shared inbox.",
            )
        })
}

fn sanitize_filename(value: &str) -> String {
    let sanitized = value
        .chars()
        .map(|character| match character {
            '/' | '\\' | '\0' => '_',
            character if character.is_control() => '_',
            character => character,
        })
        .collect::<String>();

    sanitized
        .trim()
        .trim_matches('.')
        .chars()
        .take(180)
        .collect()
}

fn internal_error(error: impl std::fmt::Display) -> InboxApiError {
    tracing::error!(error = %error, "shared inbox operation failed");
    InboxApiError::new(
        StatusCode::INTERNAL_SERVER_ERROR,
        "inbox_unavailable",
        "The shared inbox is temporarily unavailable.",
    )
}

#[derive(Debug)]
pub struct InboxApiError {
    status: StatusCode,
    code: &'static str,
    message: &'static str,
}

impl InboxApiError {
    fn new(status: StatusCode, code: &'static str, message: &'static str) -> Self {
        Self {
            status,
            code,
            message,
        }
    }
}

impl IntoResponse for InboxApiError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(json!({
                "code": self.code,
                "message": self.message,
            })),
        )
            .into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::sanitize_filename;

    #[test]
    fn sanitizes_untrusted_display_names() {
        assert_eq!(
            sanitize_filename("../../secret\\file.txt"),
            "_.._secret_file.txt"
        );
        assert_eq!(sanitize_filename("..."), "");
    }
}
