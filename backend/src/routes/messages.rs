use crate::{
    auth::{require_authenticated_device, require_host_device},
    db,
    models::{CreateMessageRequest, Message},
    state::AppState,
};
use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    Json,
};
use chrono::{Duration, Utc};
use uuid::Uuid;

const DEFAULT_MESSAGE_TTL_SECONDS: i64 = 24 * 60 * 60;

pub async fn list_messages(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<Message>>, StatusCode> {
    require_authenticated_device(&state, &headers).await?;

    let now = Utc::now();
    let mut messages = state.messages.write().await;

    messages.retain(|message| now < message.expires_at);

    Ok(Json(messages.clone()))
}

pub async fn create_message(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateMessageRequest>,
) -> Result<Json<Message>, StatusCode> {
    let requester = require_authenticated_device(&state, &headers).await?;

    let body = input.body.trim();

    if body.is_empty() || body.chars().count() > 2_000 {
        return Err(StatusCode::BAD_REQUEST);
    }

    let created_at = Utc::now();
    let expires_at = created_at + Duration::seconds(DEFAULT_MESSAGE_TTL_SECONDS);

    let message = Message {
        id: Uuid::new_v4().to_string(),
        sender_device_id: Some(requester.id),
        body: body.to_string(),
        created_at,
        expires_at,
    };

    db::insert_message(&state.db, &message)
        .await
        .map_err(|error| {
            tracing::error!(error = %error, "failed to persist message");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    state.messages.write().await.push(message.clone());

    state.broadcast_all("message_created", &message);

    Ok(Json(message))
}

pub async fn delete_all_messages(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<StatusCode, StatusCode> {
    require_host_device(&state, &headers).await?;

    db::delete_all_messages(&state.db).await.map_err(|error| {
        tracing::error!(error = %error, "failed to delete all messages");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    state.messages.write().await.clear();

    state.broadcast_all("messages_cleared", &serde_json::json!({}));

    Ok(StatusCode::NO_CONTENT)
}
