use crate::{
    auth::require_registered_device,
    models::{CreateMessageRequest, Message, WsEvent},
    state::AppState,
};
use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    Json,
};
use chrono::Utc;
use uuid::Uuid;

pub async fn list_messages(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<Message>>, StatusCode> {
    require_registered_device(&state, &headers).await?;

    let messages = state.messages.read().await;
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

    let message = Message {
        id: Uuid::new_v4().to_string(),
        sender_device_id: Some(requesting_device_id),
        body: body.to_string(),
        created_at: Utc::now(),
    };

    state.messages.write().await.push(message.clone());

    state.broadcast_json(&WsEvent {
        event_type: "message_created".to_string(),
        payload: message.clone(),
    });

    Ok(Json(message))
}
