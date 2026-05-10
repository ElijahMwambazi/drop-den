use crate::{models::AppConfig, state::AppState};
use axum::{extract::State, Json};

pub async fn config(State(state): State<AppState>) -> Json<AppConfig> {
    Json(AppConfig {
        app_name: "Drop Den".to_string(),
        port: 8080,
        local_only: true,
        join_pin: state.join_pin.clone(),
    })
}
