mod auth;
mod cleanup;
mod db;
mod models;
mod routes;
mod state;
mod ws;

use axum::{
    extract::DefaultBodyLimit,
    http::{request::Parts, HeaderValue, Method},
    routing::get,
    Router,
};
use routes::{config, devices, health, messages, transfers};
use state::{AppState, AppStateInit};
use std::{net::SocketAddr, path::PathBuf};
use tower_http::{
    cors::{AllowOrigin, CorsLayer},
    services::{ServeDir, ServeFile},
    trace::TraceLayer,
};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter("drop_den_backend=debug,tower_http=debug")
        .init();

    let data_dir = configured_data_dir();
    tokio::fs::create_dir_all(&data_dir).await?;

    let storage_dir = configured_storage_dir(&data_dir);
    tokio::fs::create_dir_all(&storage_dir).await?;

    let database_path = configured_database_path(&data_dir);
    let db = db::connect_database(database_path).await?;
    remove_legacy_inbox_files(&data_dir).await;

    if should_reset_host() {
        db::reset_host_device(&db).await?;
        tracing::warn!(
        "DROP_DEN_RESET_HOST=1 was set. Persisted host device was cleared. The next registered browser device will become host."
    );
    }

    let persisted_state = db::load_persisted_runtime_state(&db).await?;

    let state = AppState::new(AppStateInit {
        storage_dir,
        db,
        join_pin: persisted_state.join_pin,
        join_pin_hash: persisted_state.join_pin_hash,
        host_device_id: persisted_state.host_device_id,
        devices: persisted_state.devices,
        messages: persisted_state.messages,
        transfers: persisted_state.transfers,
    });

    cleanup::spawn_expired_transfer_cleanup(state.clone());

    let app = build_app(state, configured_frontend_dist_dir());

    let port = configured_port();
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("Drop Den backend listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.map_err(|error| {
        if port == 80 && error.kind() == std::io::ErrorKind::PermissionDenied {
            anyhow::anyhow!(
                "Port 80 requires elevated bind permissions. For testing, use DROP_DEN_PORT=8080. For packaged mode, install Drop Den as a systemd service with CAP_NET_BIND_SERVICE."
            )
        } else if error.kind() == std::io::ErrorKind::AddrInUse {
            anyhow::anyhow!(
                "Port {port} is already in use. Stop the existing Drop Den/backend process or choose another DROP_DEN_PORT."
            )
        } else {
            anyhow::anyhow!("Could not bind to {addr}: {error}")
        }
    })?;

    axum::serve(listener, app).await?;

    Ok(())
}

fn build_app(state: AppState, frontend_dist: PathBuf) -> Router {
    let static_files = ServeDir::new(&frontend_dist)
        .not_found_service(ServeFile::new(frontend_dist.join("index.html")));

    Router::new()
        .route("/api/health", get(health::health))
        .route("/api/config", get(config::config))
        .route(
            "/api/devices",
            get(devices::list_devices).post(devices::register_device),
        )
        .route(
            "/api/devices/:id",
            axum::routing::delete(devices::remove_device),
        )
        .route(
            "/api/desktop/reset-host",
            axum::routing::post(devices::reset_host_identity),
        )
        .route(
            "/api/host/reset",
            axum::routing::post(devices::reset_host_identity),
        )
        .route(
            "/api/desktop/reset-all",
            axum::routing::post(devices::reset_desktop_data),
        )
        .route(
            "/api/transfers",
            get(transfers::list_transfers).delete(transfers::delete_all_transfers),
        )
        .route(
            "/api/transfers/upload",
            axum::routing::post(transfers::upload_transfer),
        )
        .route(
            "/api/transfers/upload-local-paths",
            axum::routing::post(transfers::upload_local_paths),
        )
        .route(
            "/api/transfers/download-all",
            get(transfers::download_all_transfers),
        )
        .route(
            "/api/transfers/:id/download",
            get(transfers::download_transfer),
        )
        .route(
            "/api/transfers/:id/accept",
            axum::routing::patch(transfers::accept_transfer),
        )
        .route(
            "/api/transfers/:id/reject",
            axum::routing::patch(transfers::reject_transfer),
        )
        .route(
            "/api/transfers/:id",
            axum::routing::delete(transfers::delete_transfer),
        )
        .route(
            "/api/messages",
            get(messages::list_messages)
                .post(messages::create_message)
                .delete(messages::delete_all_messages),
        )
        .route("/ws", get(ws::ws_handler))
        .fallback_service(static_files)
        .layer(DefaultBodyLimit::max(1024 * 1024 * 1024))
        .layer(local_cors_layer())
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

async fn remove_legacy_inbox_files(data_dir: &std::path::Path) {
    let path = data_dir.join("inbox");
    match tokio::fs::remove_dir_all(&path).await {
        Ok(()) => tracing::info!(path = %path.display(), "removed legacy shared inbox storage"),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => tracing::warn!(
            path = %path.display(),
            error = %error,
            "failed to remove legacy shared inbox storage"
        ),
    }
}

fn should_reset_host() -> bool {
    matches!(
        std::env::var("DROP_DEN_RESET_HOST").ok().as_deref(),
        Some("1") | Some("true") | Some("yes")
    )
}

fn local_cors_layer() -> CorsLayer {
    CorsLayer::new()
        .allow_origin(AllowOrigin::predicate(
            |origin: &HeaderValue, _request_parts: &Parts| is_allowed_local_origin(origin),
        ))
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([
            axum::http::header::CONTENT_TYPE,
            axum::http::header::ACCEPT,
            axum::http::header::AUTHORIZATION,
            axum::http::HeaderName::from_static(auth::DEVICE_ID_HEADER),
        ])
}

fn is_allowed_local_origin(origin: &HeaderValue) -> bool {
    let Ok(origin) = origin.to_str() else {
        return false;
    };

    if origin == "tauri://localhost" || origin == "http://tauri.localhost" {
        return true;
    }

    if let Some(host) = origin.strip_prefix("http://") {
        return is_allowed_local_http_origin(host);
    }

    false
}

fn is_allowed_local_http_origin(host: &str) -> bool {
    let Some((address, port)) = host.rsplit_once(':') else {
        return false;
    };

    let allowed_port = matches!(port, "5173" | "8080" | "18080");

    if !allowed_port {
        return false;
    }

    address == "localhost" || address == "127.0.0.1" || is_private_ipv4(address)
}

fn is_private_ipv4(address: &str) -> bool {
    let octets = address
        .split('.')
        .map(str::parse::<u8>)
        .collect::<Result<Vec<_>, _>>();

    let Ok(octets) = octets else {
        return false;
    };

    if octets.len() != 4 {
        return false;
    }

    let first = octets[0];
    let second = octets[1];

    first == 10 || (first == 172 && (16..=31).contains(&second)) || (first == 192 && second == 168)
}

fn configured_data_dir() -> PathBuf {
    std::env::var("DROP_DEN_DATA_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("../storage"))
}

fn configured_storage_dir(data_dir: &std::path::Path) -> PathBuf {
    std::env::var("DROP_DEN_STORAGE_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| data_dir.join("transfers"))
}

fn configured_database_path(data_dir: &std::path::Path) -> PathBuf {
    std::env::var("DROP_DEN_DATABASE_PATH")
        .map(PathBuf::from)
        .unwrap_or_else(|_| data_dir.join("drop-den.sqlite"))
}

fn configured_port() -> u16 {
    let mode = std::env::var("DROP_DEN_MODE").unwrap_or_else(|_| "development".to_string());

    std::env::var("DROP_DEN_PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or_else(|| if mode == "packaged" { 80 } else { 8080 })
}

fn configured_frontend_dist_dir() -> PathBuf {
    std::env::var("DROP_DEN_FRONTEND_DIST")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("../frontend/dist"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{Device, Transfer, TransferStatus};
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use chrono::{Duration, Utc};
    use http_body_util::BodyExt;
    use serde_json::{json, Value};
    use std::collections::HashMap;
    use tower::ServiceExt;
    use uuid::Uuid;

    struct TestApp {
        app: Router,
        state: AppState,
        root: PathBuf,
    }

    async fn test_app() -> TestApp {
        let root = std::env::temp_dir().join(format!("drop-den-test-{}", Uuid::new_v4()));
        let storage_dir = root.join("transfers");
        tokio::fs::create_dir_all(&storage_dir).await.unwrap();

        let pool = db::connect_database(root.join("drop-den.sqlite"))
            .await
            .unwrap();
        let persisted = db::load_persisted_runtime_state(&pool).await.unwrap();
        let state = AppState::new(AppStateInit {
            storage_dir,
            db: pool,
            join_pin: persisted.join_pin,
            join_pin_hash: persisted.join_pin_hash,
            host_device_id: persisted.host_device_id,
            devices: HashMap::new(),
            messages: Vec::new(),
            transfers: HashMap::new(),
        });
        let app = build_app(state.clone(), root.join("missing-frontend"));

        TestApp { app, state, root }
    }

    fn json_request(method: &str, uri: &str, body: Value) -> Request<Body> {
        Request::builder()
            .method(method)
            .uri(uri)
            .header("content-type", "application/json")
            .body(Body::from(body.to_string()))
            .unwrap()
    }

    fn authorized_request(method: &str, uri: &str, device_id: &str) -> Request<Body> {
        Request::builder()
            .method(method)
            .uri(uri)
            .header(auth::DEVICE_ID_HEADER, device_id)
            .body(Body::empty())
            .unwrap()
    }

    async fn response_json(response: axum::response::Response) -> Value {
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        serde_json::from_slice(&bytes).unwrap()
    }

    async fn register(app: &Router, name: &str, pin: Option<&str>) -> (StatusCode, Option<Device>) {
        let response = app
            .clone()
            .oneshot(json_request(
                "POST",
                "/api/devices",
                json!({ "name": name, "join_pin": pin }),
            ))
            .await
            .unwrap();
        let status = response.status();
        let device = if status.is_success() {
            Some(serde_json::from_value(response_json(response).await).unwrap())
        } else {
            None
        };
        (status, device)
    }

    #[tokio::test]
    async fn join_flow_requires_the_current_pin_and_rotates_it() {
        let test = test_app().await;

        let (status, host) = register(&test.app, "Host laptop", None).await;
        assert_eq!(status, StatusCode::OK);
        let host = host.unwrap();
        assert_eq!(
            test.state.host_device_id.read().await.as_deref(),
            Some(host.id.as_str())
        );

        let first_pin = test.state.join_pin.read().await.clone();
        let (status, _) = register(&test.app, "Unknown phone", Some("000000")).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);

        let (status, joined) = register(&test.app, "Joined phone", Some(&first_pin)).await;
        assert_eq!(status, StatusCode::OK);
        assert!(joined.is_some());

        let second_pin = test.state.join_pin.read().await.clone();
        assert_ne!(first_pin, second_pin);
        let (status, _) = register(&test.app, "Replay attempt", Some(&first_pin)).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);

        test.state.db.close().await;
        tokio::fs::remove_dir_all(test.root).await.unwrap();
    }

    #[tokio::test]
    async fn host_identity_can_be_reset_from_any_runtime_by_the_host_only() {
        let test = test_app().await;
        let (_, host) = register(&test.app, "Host", None).await;
        let host = host.unwrap();
        let pin = test.state.join_pin.read().await.clone();
        let (_, joined) = register(&test.app, "Joined", Some(&pin)).await;
        let joined = joined.unwrap();

        let response = test
            .app
            .clone()
            .oneshot(authorized_request("POST", "/api/host/reset", &joined.id))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);

        let response = test
            .app
            .clone()
            .oneshot(authorized_request("POST", "/api/host/reset", &host.id))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NO_CONTENT);
        assert!(test.state.host_device_id.read().await.is_none());
        assert!(!test.state.devices.read().await.contains_key(&host.id));
        assert!(test.state.devices.read().await.contains_key(&joined.id));

        let (status, replacement_host) = register(&test.app, "Replacement host", None).await;
        assert_eq!(status, StatusCode::OK);
        let replacement_host = replacement_host.unwrap();
        assert_eq!(
            test.state.host_device_id.read().await.as_deref(),
            Some(replacement_host.id.as_str())
        );

        test.state.db.close().await;
        tokio::fs::remove_dir_all(test.root).await.unwrap();
    }

    #[tokio::test]
    async fn joined_device_can_remove_itself_but_not_another_device() {
        let test = test_app().await;
        let (_, host) = register(&test.app, "Host", None).await;
        let host = host.unwrap();
        let pin = test.state.join_pin.read().await.clone();
        let (_, joined) = register(&test.app, "Joined", Some(&pin)).await;
        let joined = joined.unwrap();
        let pin = test.state.join_pin.read().await.clone();
        let (_, other) = register(&test.app, "Other", Some(&pin)).await;
        let other = other.unwrap();

        let response = test
            .app
            .clone()
            .oneshot(authorized_request(
                "DELETE",
                &format!("/api/devices/{}", other.id),
                &joined.id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);

        let response = test
            .app
            .clone()
            .oneshot(authorized_request(
                "DELETE",
                &format!("/api/devices/{}", joined.id),
                &joined.id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NO_CONTENT);
        assert!(!test.state.devices.read().await.contains_key(&joined.id));
        assert!(test.state.devices.read().await.contains_key(&host.id));
        assert!(test.state.devices.read().await.contains_key(&other.id));

        test.state.db.close().await;
        tokio::fs::remove_dir_all(test.root).await.unwrap();
    }

    #[tokio::test]
    async fn only_the_target_can_review_and_access_a_targeted_transfer() {
        let test = test_app().await;
        let (_, host) = register(&test.app, "Host", None).await;
        let host = host.unwrap();
        let pin = test.state.join_pin.read().await.clone();
        let (_, target) = register(&test.app, "Target", Some(&pin)).await;
        let target = target.unwrap();
        let pin = test.state.join_pin.read().await.clone();
        let (_, other) = register(&test.app, "Other", Some(&pin)).await;
        let other = other.unwrap();

        let transfer_dir = test.state.storage_dir.join("targeted-transfer");
        tokio::fs::create_dir_all(&transfer_dir).await.unwrap();
        let stored_path = transfer_dir.join("private.txt");
        tokio::fs::write(&stored_path, b"private payload")
            .await
            .unwrap();
        let transfer = Transfer {
            id: "targeted-transfer".to_string(),
            filename: "private.txt".to_string(),
            mime_type: "text/plain".to_string(),
            size: 15,
            sender_device_id: Some(host.id.clone()),
            target_device_id: Some(target.id.clone()),
            status: TransferStatus::Pending,
            stored_path: stored_path.to_string_lossy().to_string(),
            created_at: Utc::now(),
            expires_at: Utc::now() + Duration::hours(1),
        };
        db::insert_transfer(&test.state.db, &transfer)
            .await
            .unwrap();
        test.state
            .transfers
            .write()
            .await
            .insert(transfer.id.clone(), transfer);

        let response = test
            .app
            .clone()
            .oneshot(authorized_request(
                "PATCH",
                "/api/transfers/targeted-transfer/accept",
                &other.id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);

        let response = test
            .app
            .clone()
            .oneshot(authorized_request(
                "PATCH",
                "/api/transfers/targeted-transfer/accept",
                &target.id,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        for allowed_device in [&host.id, &target.id] {
            let response = test
                .app
                .clone()
                .oneshot(
                    Request::get(format!(
                        "/api/transfers/targeted-transfer/download?device_id={allowed_device}"
                    ))
                    .body(Body::empty())
                    .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::OK);
        }

        let response = test
            .app
            .clone()
            .oneshot(
                Request::get(format!(
                    "/api/transfers/targeted-transfer/download?device_id={}",
                    other.id
                ))
                .body(Body::empty())
                .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);

        test.state.db.close().await;
        tokio::fs::remove_dir_all(test.root).await.unwrap();
    }

    #[tokio::test]
    async fn delete_all_transfers_is_host_only() {
        let test = test_app().await;
        let (_, host) = register(&test.app, "Host", None).await;
        let host = host.unwrap();
        let pin = test.state.join_pin.read().await.clone();
        let (_, joined) = register(&test.app, "Joined", Some(&pin)).await;
        let joined = joined.unwrap();

        let response = test
            .app
            .clone()
            .oneshot(authorized_request("DELETE", "/api/transfers", &joined.id))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);

        let response = test
            .app
            .clone()
            .oneshot(authorized_request("DELETE", "/api/transfers", &host.id))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NO_CONTENT);

        test.state.db.close().await;
        tokio::fs::remove_dir_all(test.root).await.unwrap();
    }
}
