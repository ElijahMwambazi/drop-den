use crate::state::AppState;
use axum::http::{header, HeaderMap, StatusCode};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand_core::{OsRng, RngCore};
use sha2::{Digest, Sha256};

const BEARER_PREFIX: &str = "Bearer ";
const SESSION_TOKEN_BYTES: usize = 32;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthenticatedDevice {
    pub id: String,
    pub is_host: bool,
}

pub fn generate_session_token() -> String {
    let mut bytes = [0_u8; SESSION_TOKEN_BYTES];
    OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

pub fn hash_session_token(token: &str) -> String {
    let digest = Sha256::digest(token.as_bytes());
    URL_SAFE_NO_PAD.encode(digest)
}

fn bearer_token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix(BEARER_PREFIX))
        .map(str::trim)
        .filter(|value| !value.is_empty() && !value.contains(char::is_whitespace))
}

pub async fn authenticate_session_token(
    state: &AppState,
    token: &str,
) -> Result<AuthenticatedDevice, StatusCode> {
    let token_hash = hash_session_token(token);
    let device_id = state
        .sessions
        .read()
        .await
        .get(&token_hash)
        .cloned()
        .ok_or(StatusCode::UNAUTHORIZED)?;

    if !state.devices.read().await.contains_key(&device_id) {
        return Err(StatusCode::UNAUTHORIZED);
    }

    let is_host = state.host_device_id.read().await.as_deref() == Some(device_id.as_str());
    Ok(AuthenticatedDevice {
        id: device_id,
        is_host,
    })
}

pub async fn require_authenticated_device(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<AuthenticatedDevice, StatusCode> {
    let token = bearer_token(headers).ok_or(StatusCode::UNAUTHORIZED)?;
    authenticate_session_token(state, token).await
}

pub async fn optional_authenticated_device(
    state: &AppState,
    headers: &HeaderMap,
) -> Option<AuthenticatedDevice> {
    let token = bearer_token(headers)?;
    authenticate_session_token(state, token).await.ok()
}

pub async fn require_host_device(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<AuthenticatedDevice, StatusCode> {
    let device = require_authenticated_device(state, headers).await?;
    if device.is_host {
        Ok(device)
    } else {
        Err(StatusCode::FORBIDDEN)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_tokens_are_high_entropy_and_hash_to_a_distinct_value() {
        let first = generate_session_token();
        let second = generate_session_token();
        assert_ne!(first, second);
        assert!(first.len() >= 43);
        assert_ne!(first, hash_session_token(&first));
        assert_eq!(hash_session_token(&first), hash_session_token(&first));
    }

    #[test]
    fn only_bearer_authorization_is_accepted() {
        let mut headers = HeaderMap::new();
        headers.insert(
            header::AUTHORIZATION,
            "Bearer secret_value".parse().unwrap(),
        );
        assert_eq!(bearer_token(&headers), Some("secret_value"));
        headers.insert(header::AUTHORIZATION, "Device abc".parse().unwrap());
        assert_eq!(bearer_token(&headers), None);
    }
}
