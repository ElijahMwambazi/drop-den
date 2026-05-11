use crate::{
    auth::require_registered_device,
    db,
    models::{CreateMessageRequest, Message, WsEvent},
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
    require_registered_device(&state, &headers).await?;

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
    let requesting_device_id = require_registered_device(&state, &headers).await?;

    let body = input.body.trim();

    if body.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let created_at = Utc::now();
    let expires_at = created_at + Duration::seconds(DEFAULT_MESSAGE_TTL_SECONDS);

    let message = Message {
        id: Uuid::new_v4().to_string(),
        sender_device_id: Some(requesting_device_id),
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

    state.broadcast_json(&WsEvent {
        event_type: "message_created".to_string(),
        payload: message.clone(),
    });

    Ok(Json(message))
}
