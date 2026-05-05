use crate::{models::{CreateMessageRequest, Message, WsEvent}, state::AppState};
use axum::{extract::State, Json};
use chrono::Utc;
use uuid::Uuid;

pub async fn list_messages(State(state): State<AppState>) -> Json<Vec<Message>> {
    let messages = state.messages.read().await;
    Json(messages.clone())
}

pub async fn create_message(
    State(state): State<AppState>,
    Json(input): Json<CreateMessageRequest>,
) -> Json<Message> {
    let message = Message {
        id: Uuid::new_v4().to_string(),
        sender_device_id: input.sender_device_id,
        body: input.body.trim().to_string(),
        created_at: Utc::now(),
    };

    state.messages.write().await.push(message.clone());

    state.broadcast_json(&WsEvent {
        event_type: "message_created".to_string(),
        payload: message.clone(),
    });

    Json(message)
}
