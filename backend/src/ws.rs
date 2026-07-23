use crate::{
    auth::{authenticate_session_token, AuthenticatedDevice},
    state::{AppEvent, AppState, EventAudience},
};
use axum::{
    extract::{
        ws::{Message, WebSocket},
        State, WebSocketUpgrade,
    },
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use futures_util::{SinkExt, StreamExt};

const APP_PROTOCOL: &str = "drop-den-v1";
const AUTH_PROTOCOL_PREFIX: &str = "drop-den-auth.";

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Response {
    let Ok(device) = authenticate_websocket(&state, &headers).await else {
        return StatusCode::UNAUTHORIZED.into_response();
    };

    ws.protocols([APP_PROTOCOL])
        .on_upgrade(move |socket| handle_socket(socket, state, device.id))
}

pub(crate) async fn authenticate_websocket(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<AuthenticatedDevice, StatusCode> {
    let token = websocket_token(headers).ok_or(StatusCode::UNAUTHORIZED)?;
    authenticate_session_token(state, token).await
}

fn websocket_token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get("sec-websocket-protocol")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| {
            value
                .split(',')
                .map(str::trim)
                .find_map(|protocol| protocol.strip_prefix(AUTH_PROTOCOL_PREFIX))
        })
        .filter(|token| !token.is_empty() && !token.contains(char::is_whitespace))
}

async fn handle_socket(socket: WebSocket, state: AppState, device_id: String) {
    let (mut sender, mut receiver) = socket.split();
    let mut events = state.events.subscribe();

    loop {
        tokio::select! {
            event = events.recv() => {
                let Ok(event) = event else {
                    break;
                };
                if event_is_visible(&event, &device_id) {
                    let Some(payload) = AppState::serialize_event(&event) else {
                        continue;
                    };
                    if sender.send(Message::Text(payload)).await.is_err() {
                        break;
                    }
                }
                if event.disconnect_devices.contains(&device_id)
                    || !session_is_active(&state, &device_id).await
                {
                    let _ = sender.send(Message::Close(None)).await;
                    break;
                }
            }
            message = receiver.next() => {
                match message {
                    Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break,
                    _ => {}
                }
            }
        }
    }
}

fn event_is_visible(event: &AppEvent, device_id: &str) -> bool {
    match &event.audience {
        EventAudience::AllAuthenticated => true,
        EventAudience::Devices(device_ids) => device_ids.contains(device_id),
    }
}

async fn session_is_active(state: &AppState, device_id: &str) -> bool {
    state
        .sessions
        .read()
        .await
        .values()
        .any(|active_device_id| active_device_id == device_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::header::SEC_WEBSOCKET_PROTOCOL;

    #[test]
    fn websocket_token_comes_from_a_subprotocol_not_a_url() {
        let mut headers = HeaderMap::new();
        assert_eq!(websocket_token(&headers), None);
        headers.insert(
            SEC_WEBSOCKET_PROTOCOL,
            "drop-den-v1, drop-den-auth.secret_token".parse().unwrap(),
        );
        assert_eq!(websocket_token(&headers), Some("secret_token"));
    }

    #[test]
    fn malformed_websocket_tokens_are_rejected() {
        let mut headers = HeaderMap::new();
        headers.insert(
            SEC_WEBSOCKET_PROTOCOL,
            "drop-den-v1, drop-den-auth.bad token".parse().unwrap(),
        );
        assert_eq!(websocket_token(&headers), None);
    }
}
