use axum::Json;
use serde_json::{json, Value};

pub async fn config() -> Json<Value> {
    Json(json!({
        "app_name": "Drop Den",
        "port": 8080,
        "local_only": true,
        "join_url_note": "Use the host machine LAN IP, for example http://192.168.1.25:8080"
    }))
}
