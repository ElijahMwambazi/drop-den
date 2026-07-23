use crate::{
    auth::{
        generate_session_token, hash_session_token, optional_authenticated_device,
        require_authenticated_device, require_host_device, AuthenticatedDevice,
    },
    db,
    models::{DownloadGrant, Transfer, TransferStatus},
    state::{AppState, DownloadScope, DownloadTicket},
    transfer_policy,
};
use axum::{
    body::{Body, Bytes},
    extract::{ConnectInfo, Multipart, Path, Query, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use chrono::{Duration, Utc};
use std::{
    io::{Read, Write},
    net::SocketAddr,
    path::{Path as FsPath, PathBuf},
};
use tokio::{
    fs::{self, File},
    io::{AsyncReadExt, AsyncWriteExt},
};
use tokio_util::io::ReaderStream;
use uuid::Uuid;
use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

const MAX_FILENAME_CHARS: usize = 180;
const MAX_MIME_TYPE_CHARS: usize = 128;
const DOWNLOAD_TICKET_TTL_SECONDS: i64 = 5 * 60;

#[derive(Debug, serde::Deserialize, Default)]
pub struct DownloadQuery {
    pub ticket: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
pub struct LocalPathUploadRequest {
    pub sender_device_id: Option<String>,
    pub target_device_id: Option<String>,
    pub paths: Vec<String>,
}

pub async fn list_transfers(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<Transfer>>, StatusCode> {
    let requester = require_authenticated_device(&state, &headers).await?;
    let transfers = state.transfers.read().await;
    Ok(Json(
        transfers
            .values()
            .filter(|transfer| {
                transfer_policy::can_view(transfer, &requester.id, requester.is_host)
            })
            .cloned()
            .collect(),
    ))
}

pub async fn upload_transfer(
    State(state): State<AppState>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> Result<Json<Transfer>, StatusCode> {
    let requester = require_authenticated_device(&state, &headers).await?;
    if !state
        .rate_limiter
        .check(
            format!("upload:{}", requester.id),
            60,
            std::time::Duration::from_secs(60),
        )
        .await
    {
        return Err(StatusCode::TOO_MANY_REQUESTS);
    }
    let _upload_guard = state.upload_lock.lock().await;
    let transfer_ttl_seconds = *state.transfer_ttl_seconds.read().await as i64;
    let transfer_id = Uuid::new_v4().to_string();
    let transfer_dir = state.storage_dir.join(&transfer_id);
    fs::create_dir_all(&transfer_dir)
        .await
        .map_err(storage_error_status)?;

    let result = save_multipart_transfer(
        &state,
        &requester,
        &mut multipart,
        &transfer_id,
        &transfer_dir,
        transfer_ttl_seconds,
    )
    .await;

    let transfer = match result {
        Ok(transfer) => transfer,
        Err(status) => {
            let _ = fs::remove_dir_all(&transfer_dir).await;
            return Err(status);
        }
    };

    persist_and_publish_transfer(&state, &transfer).await?;
    Ok(Json(transfer))
}

async fn save_multipart_transfer(
    state: &AppState,
    requester: &AuthenticatedDevice,
    multipart: &mut Multipart,
    transfer_id: &str,
    transfer_dir: &FsPath,
    transfer_ttl_seconds: i64,
) -> Result<Transfer, StatusCode> {
    let mut target_device_id: Option<String> = None;
    let mut saved_file: Option<(String, String, u64, PathBuf)> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)?
    {
        match field.name().unwrap_or_default() {
            "target_device_id" => {
                let value = field.text().await.map_err(|_| StatusCode::BAD_REQUEST)?;
                target_device_id = (!value.is_empty()).then_some(value);
            }
            "file" if saved_file.is_none() => {
                let filename = safe_filename(field.file_name().unwrap_or("upload.bin"));
                let mime_type =
                    safe_mime_type(field.content_type().unwrap_or("application/octet-stream"))?;
                let file_path = transfer_dir.join(&filename);
                let mut file = File::create(&file_path)
                    .await
                    .map_err(storage_error_status)?;
                let mut size = 0_u64;
                let mut field = field;

                while let Some(chunk) = field.chunk().await.map_err(|_| StatusCode::BAD_REQUEST)? {
                    size = size
                        .checked_add(chunk.len() as u64)
                        .ok_or(StatusCode::PAYLOAD_TOO_LARGE)?;
                    if size > state.limits.max_file_bytes {
                        return Err(StatusCode::PAYLOAD_TOO_LARGE);
                    }
                    if !has_storage_capacity(state, size).await {
                        return Err(StatusCode::INSUFFICIENT_STORAGE);
                    }
                    file.write_all(&chunk).await.map_err(storage_error_status)?;
                }
                file.flush().await.map_err(storage_error_status)?;
                saved_file = Some((filename, mime_type, size, file_path));
            }
            "file" => return Err(StatusCode::BAD_REQUEST),
            _ => {}
        }
    }

    validate_target(state, target_device_id.as_deref()).await?;
    let (filename, mime_type, size, file_path) = saved_file.ok_or(StatusCode::BAD_REQUEST)?;
    let created_at = Utc::now();

    Ok(Transfer {
        id: transfer_id.to_string(),
        filename,
        mime_type,
        size,
        sender_device_id: Some(requester.id.clone()),
        target_device_id: target_device_id.clone(),
        status: if target_device_id.is_some() {
            TransferStatus::Pending
        } else {
            TransferStatus::Available
        },
        stored_path: file_path.to_string_lossy().to_string(),
        created_at,
        expires_at: created_at + Duration::seconds(transfer_ttl_seconds),
    })
}

pub async fn upload_local_paths(
    State(state): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(payload): Json<LocalPathUploadRequest>,
) -> Result<Json<Vec<Transfer>>, StatusCode> {
    if !state.desktop_mode || !peer.ip().is_loopback() {
        return Err(StatusCode::FORBIDDEN);
    }

    let requester = require_host_device(&state, &headers).await?;
    if !state
        .rate_limiter
        .check(
            format!("upload:{}", requester.id),
            60,
            std::time::Duration::from_secs(60),
        )
        .await
    {
        return Err(StatusCode::TOO_MANY_REQUESTS);
    }
    let _upload_guard = state.upload_lock.lock().await;
    if payload
        .sender_device_id
        .as_deref()
        .is_some_and(|id| id != requester.id)
    {
        return Err(StatusCode::FORBIDDEN);
    }
    if payload.paths.is_empty() || payload.paths.len() > state.limits.max_files_per_batch {
        return Err(StatusCode::BAD_REQUEST);
    }
    validate_target(&state, payload.target_device_id.as_deref()).await?;

    let mut sources = Vec::with_capacity(payload.paths.len());
    let mut batch_size = 0_u64;
    for raw_path in payload.paths {
        let source_path = fs::canonicalize(raw_path)
            .await
            .map_err(|_| StatusCode::BAD_REQUEST)?;
        let metadata = fs::metadata(&source_path)
            .await
            .map_err(|_| StatusCode::BAD_REQUEST)?;
        if !metadata.is_file() {
            return Err(StatusCode::BAD_REQUEST);
        }
        if metadata.len() > state.limits.max_file_bytes {
            tracing::warn!(
                file_bytes = metadata.len(),
                max_file_bytes = state.limits.max_file_bytes,
                "desktop transfer copy rejected because a file is too large"
            );
            return Err(StatusCode::PAYLOAD_TOO_LARGE);
        }
        batch_size = batch_size
            .checked_add(metadata.len())
            .ok_or(StatusCode::PAYLOAD_TOO_LARGE)?;
        if batch_size > state.limits.max_batch_bytes {
            tracing::warn!(
                batch_bytes = batch_size,
                max_batch_bytes = state.limits.max_batch_bytes,
                "desktop transfer copy rejected because the batch is too large"
            );
            return Err(StatusCode::PAYLOAD_TOO_LARGE);
        }
        sources.push((source_path, metadata.len()));
    }
    if !has_storage_capacity(&state, batch_size).await {
        tracing::warn!(
            batch_bytes = batch_size,
            max_storage_bytes = state.limits.max_storage_bytes,
            "desktop transfer copy rejected because transfer storage is full"
        );
        return Err(StatusCode::INSUFFICIENT_STORAGE);
    }

    tracing::info!(
        file_count = sources.len(),
        total_bytes = batch_size,
        "desktop transfer copy started"
    );

    let transfer_ttl_seconds = *state.transfer_ttl_seconds.read().await as i64;
    let mut created = Vec::with_capacity(sources.len());
    for (source_path, size) in sources {
        let filename = safe_filename(
            source_path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("upload.bin"),
        );
        let transfer_id = Uuid::new_v4().to_string();
        let transfer_dir = state.storage_dir.join(&transfer_id);
        fs::create_dir_all(&transfer_dir)
            .await
            .map_err(storage_error_status)?;
        let file_path = transfer_dir.join(&filename);
        if let Err(error) = fs::copy(&source_path, &file_path).await {
            let _ = fs::remove_dir_all(&transfer_dir).await;
            return Err(storage_error_status(error));
        }
        let created_at = Utc::now();
        let transfer = Transfer {
            id: transfer_id,
            filename,
            mime_type: guess_mime_type(&source_path),
            size,
            sender_device_id: Some(requester.id.clone()),
            target_device_id: payload.target_device_id.clone(),
            status: if payload.target_device_id.is_some() {
                TransferStatus::Pending
            } else {
                TransferStatus::Available
            },
            stored_path: file_path.to_string_lossy().to_string(),
            created_at,
            expires_at: created_at + Duration::seconds(transfer_ttl_seconds),
        };
        if let Err(status) = persist_and_publish_transfer(&state, &transfer).await {
            remove_transfer_files(&transfer).await;
            return Err(status);
        }
        created.push(transfer);
    }

    tracing::info!(
        file_count = created.len(),
        total_bytes = batch_size,
        "desktop transfer copy completed"
    );

    Ok(Json(created))
}

pub async fn download_transfer(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Query(query): Query<DownloadQuery>,
) -> Result<Response, StatusCode> {
    let requester = download_requester(
        &state,
        &headers,
        query.ticket.as_deref(),
        &DownloadScope::Transfer(id.clone()),
    )
    .await?;
    let transfer = state
        .transfers
        .read()
        .await
        .get(&id)
        .filter(|transfer| {
            transfer_policy::can_download(transfer, &requester.id, requester.is_host)
        })
        .cloned()
        .ok_or(StatusCode::NOT_FOUND)?;

    let file = File::open(&transfer.stored_path)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;
    Response::builder()
        .header(header::CONTENT_TYPE, transfer.mime_type)
        .header(header::CONTENT_LENGTH, transfer.size)
        .header(
            header::CONTENT_DISPOSITION,
            format!(
                "attachment; filename=\"{}\"",
                safe_filename(&transfer.filename)
            ),
        )
        .body(Body::from_stream(ReaderStream::new(file)))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn download_all_transfers(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<DownloadQuery>,
) -> Result<Response, StatusCode> {
    let requester = download_requester(
        &state,
        &headers,
        query.ticket.as_deref(),
        &DownloadScope::AllVisible,
    )
    .await?;
    let mut transfers = state
        .transfers
        .read()
        .await
        .values()
        .filter(|transfer| {
            transfer_policy::can_download(transfer, &requester.id, requester.is_host)
        })
        .cloned()
        .collect::<Vec<_>>();
    transfers.sort_by_key(|transfer| transfer.created_at);

    let zip_path = state
        .storage_dir
        .join(format!(".download-{}.zip", Uuid::new_v4()));
    let build_path = zip_path.clone();
    let build_result = tokio::task::spawn_blocking(move || build_zip(&build_path, &transfers))
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if let Err(status) = build_result {
        let _ = fs::remove_file(&zip_path).await;
        return Err(status);
    }
    let file = File::open(&zip_path)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let stream = temporary_file_stream(file, zip_path);

    Response::builder()
        .header(header::CONTENT_TYPE, "application/zip")
        .header(
            header::CONTENT_DISPOSITION,
            "attachment; filename=\"drop-den-transfers.zip\"",
        )
        .body(Body::from_stream(stream))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn create_transfer_download_ticket(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<DownloadGrant>, StatusCode> {
    let requester = require_authenticated_device(&state, &headers).await?;
    let allowed = state
        .transfers
        .read()
        .await
        .get(&id)
        .is_some_and(|transfer| {
            transfer_policy::can_download(transfer, &requester.id, requester.is_host)
        });
    if !allowed {
        return Err(StatusCode::NOT_FOUND);
    }
    Ok(Json(
        issue_download_ticket(&state, requester.id, DownloadScope::Transfer(id)).await,
    ))
}

pub async fn create_all_download_ticket(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<DownloadGrant>, StatusCode> {
    let requester = require_authenticated_device(&state, &headers).await?;
    Ok(Json(
        issue_download_ticket(&state, requester.id, DownloadScope::AllVisible).await,
    ))
}

pub async fn accept_transfer(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Transfer>, StatusCode> {
    let requester = require_authenticated_device(&state, &headers).await?;
    update_transfer_status(state, id, requester, TransferStatus::Accepted).await
}

pub async fn reject_transfer(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Transfer>, StatusCode> {
    let requester = require_authenticated_device(&state, &headers).await?;
    update_transfer_status(state, id, requester, TransferStatus::Rejected).await
}

pub async fn delete_transfer(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, StatusCode> {
    let requester = require_authenticated_device(&state, &headers).await?;
    let transfer = state
        .transfers
        .read()
        .await
        .get(&id)
        .filter(|transfer| transfer_policy::can_delete(transfer, &requester.id, requester.is_host))
        .cloned()
        .ok_or(StatusCode::NOT_FOUND)?;

    db::delete_transfer(&state.db, &transfer.id)
        .await
        .map_err(|error| {
            tracing::error!(error = %error, transfer_id = %transfer.id, "failed to delete transfer metadata");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    state.transfers.write().await.remove(&id);
    remove_transfer_files(&transfer).await;
    publish_transfer_event(&state, "transfer_deleted", &transfer).await;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn delete_all_transfers(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, StatusCode> {
    require_host_device(&state, &headers).await?;
    let removed = state
        .transfers
        .write()
        .await
        .drain()
        .map(|(_, transfer)| transfer)
        .collect::<Vec<_>>();
    db::delete_all_transfers(&state.db).await.map_err(|error| {
        tracing::error!(error = %error, "failed to delete all transfer metadata");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    let deleted_count = removed.len();
    for transfer in removed {
        remove_transfer_files(&transfer).await;
    }
    state.broadcast_all(
        "transfers_cleared",
        &serde_json::json!({ "deleted_count": deleted_count }),
    );
    Ok(StatusCode::NO_CONTENT)
}

async fn update_transfer_status(
    state: AppState,
    id: String,
    requester: AuthenticatedDevice,
    status: TransferStatus,
) -> Result<Json<Transfer>, StatusCode> {
    let transfer = {
        let mut transfers = state.transfers.write().await;
        let transfer = transfers
            .get_mut(&id)
            .filter(|transfer| transfer_policy::can_review(transfer, &requester.id))
            .ok_or(StatusCode::NOT_FOUND)?;
        transfer.status = status;
        db::update_transfer_status(&state.db, &transfer.id, &transfer.status)
            .await
            .map_err(|error| {
                tracing::error!(error = %error, transfer_id = %transfer.id, "failed to persist transfer status");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;
        transfer.clone()
    };
    publish_transfer_event(&state, "transfer_updated", &transfer).await;
    Ok(Json(transfer))
}

async fn persist_and_publish_transfer(
    state: &AppState,
    transfer: &Transfer,
) -> Result<(), StatusCode> {
    db::insert_transfer(&state.db, transfer)
        .await
        .map_err(|error| {
            tracing::error!(error = %error, transfer_id = %transfer.id, "failed to persist transfer");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    state
        .transfers
        .write()
        .await
        .insert(transfer.id.clone(), transfer.clone());
    publish_transfer_event(state, "transfer_created", transfer).await;
    Ok(())
}

async fn publish_transfer_event(state: &AppState, event_type: &str, transfer: &Transfer) {
    let host_id = state.host_device_id.read().await.clone();
    if let Some(device_ids) = transfer_policy::event_devices(transfer, host_id.as_deref()) {
        state.broadcast_to(event_type, transfer, device_ids);
    } else {
        state.broadcast_all(event_type, transfer);
    }
}

async fn validate_target(state: &AppState, target: Option<&str>) -> Result<(), StatusCode> {
    if let Some(target) = target {
        if target.len() > 128 || !state.devices.read().await.contains_key(target) {
            return Err(StatusCode::BAD_REQUEST);
        }
    }
    Ok(())
}

async fn issue_download_ticket(
    state: &AppState,
    device_id: String,
    scope: DownloadScope,
) -> DownloadGrant {
    let ticket = generate_session_token();
    let expires_at = Utc::now() + Duration::seconds(DOWNLOAD_TICKET_TTL_SECONDS);
    let mut tickets = state.download_tickets.write().await;
    tickets.retain(|_, value| value.expires_at > Utc::now());
    tickets.insert(
        hash_session_token(&ticket),
        DownloadTicket {
            device_id,
            scope,
            expires_at,
        },
    );
    DownloadGrant { ticket, expires_at }
}

async fn download_requester(
    state: &AppState,
    headers: &HeaderMap,
    ticket: Option<&str>,
    expected_scope: &DownloadScope,
) -> Result<AuthenticatedDevice, StatusCode> {
    if let Some(requester) = optional_authenticated_device(state, headers).await {
        return Ok(requester);
    }
    let ticket = ticket.ok_or(StatusCode::UNAUTHORIZED)?;
    let stored = state
        .download_tickets
        .read()
        .await
        .get(&hash_session_token(ticket))
        .filter(|stored| stored.expires_at > Utc::now())
        .filter(|stored| download_scope_matches(&stored.scope, expected_scope))
        .cloned()
        .ok_or(StatusCode::UNAUTHORIZED)?;
    if !state.devices.read().await.contains_key(&stored.device_id) {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let is_host = state.host_device_id.read().await.as_deref() == Some(stored.device_id.as_str());
    Ok(AuthenticatedDevice {
        id: stored.device_id,
        is_host,
    })
}

fn download_scope_matches(actual: &DownloadScope, expected: &DownloadScope) -> bool {
    match (actual, expected) {
        (DownloadScope::AllVisible, DownloadScope::AllVisible) => true,
        (DownloadScope::Transfer(actual), DownloadScope::Transfer(expected)) => actual == expected,
        _ => false,
    }
}

async fn has_storage_capacity(state: &AppState, incoming: u64) -> bool {
    let used = state
        .transfers
        .read()
        .await
        .values()
        .map(|transfer| transfer.size)
        .sum::<u64>();
    used.checked_add(incoming)
        .is_some_and(|total| total <= state.limits.max_storage_bytes)
}

fn build_zip(path: &FsPath, transfers: &[Transfer]) -> Result<(), StatusCode> {
    let file = std::fs::File::create(path).map_err(storage_error_status)?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    let mut buffer = [0_u8; 64 * 1024];

    for (index, transfer) in transfers.iter().enumerate() {
        let mut source =
            std::fs::File::open(&transfer.stored_path).map_err(|_| StatusCode::NOT_FOUND)?;
        zip.start_file(zip_filename(index, &transfer.filename), options)
            .map_err(zip_error_status)?;
        loop {
            let read = source
                .read(&mut buffer)
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
            if read == 0 {
                break;
            }
            zip.write_all(&buffer[..read])
                .map_err(storage_error_status)?;
        }
    }
    zip.finish().map_err(zip_error_status)?;
    Ok(())
}

fn temporary_file_stream(
    mut file: File,
    path: PathBuf,
) -> impl futures_util::Stream<Item = Result<Bytes, std::io::Error>> {
    async_stream::try_stream! {
        let _guard = TemporaryFile(path);
        let mut buffer = vec![0_u8; 64 * 1024];
        loop {
            let read = file.read(&mut buffer).await?;
            if read == 0 {
                break;
            }
            yield Bytes::copy_from_slice(&buffer[..read]);
        }
    }
}

struct TemporaryFile(PathBuf);

impl Drop for TemporaryFile {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

fn safe_filename(input: &str) -> String {
    let sanitized = input
        .chars()
        .filter(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_')
        })
        .take(MAX_FILENAME_CHARS)
        .collect::<String>();
    if sanitized.is_empty() || sanitized == "." || sanitized == ".." {
        "upload.bin".to_string()
    } else {
        sanitized
    }
}

fn safe_mime_type(input: &str) -> Result<String, StatusCode> {
    if input.is_empty()
        || input.len() > MAX_MIME_TYPE_CHARS
        || !input
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'/' | b'-' | b'+' | b'.'))
    {
        return Err(StatusCode::BAD_REQUEST);
    }
    Ok(input.to_string())
}

fn zip_filename(index: usize, filename: &str) -> String {
    format!("{:03}-{}", index + 1, safe_filename(filename))
}

fn storage_error_status(error: std::io::Error) -> StatusCode {
    if matches!(error.raw_os_error(), Some(28 | 39 | 112)) {
        StatusCode::INSUFFICIENT_STORAGE
    } else {
        StatusCode::INTERNAL_SERVER_ERROR
    }
}

fn zip_error_status(error: zip::result::ZipError) -> StatusCode {
    match error {
        zip::result::ZipError::Io(error) => storage_error_status(error),
        _ => StatusCode::INTERNAL_SERVER_ERROR,
    }
}

pub(crate) async fn remove_transfer_files(transfer: &Transfer) {
    if let Some(parent) = PathBuf::from(&transfer.stored_path).parent() {
        let _ = fs::remove_dir_all(parent).await;
    }
}

fn guess_mime_type(path: &FsPath) -> String {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("png") => "image/png",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("mp4") => "video/mp4",
        Some("webm") => "video/webm",
        Some("mp3") => "audio/mpeg",
        Some("wav") => "audio/wav",
        Some("ogg") => "audio/ogg",
        Some("pdf") => "application/pdf",
        Some("txt") => "text/plain",
        Some("json") => "application/json",
        Some("zip") => "application/zip",
        _ => "application/octet-stream",
    }
    .to_string()
}
