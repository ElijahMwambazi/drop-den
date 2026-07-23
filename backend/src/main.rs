mod auth;
mod cleanup;
mod db;
mod models;
mod rate_limit;
mod routes;
mod settings;
mod state;
mod transfer_policy;
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
};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_ansi(std::env::var("DROP_DEN_MODE").ok().as_deref() != Some("desktop"))
        .with_env_filter("drop_den_backend=debug,tower_http=info")
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
    reconcile_transfer_storage(&storage_dir, &persisted_state.transfers).await;

    let state = AppState::new(AppStateInit {
        desktop_mode: std::env::var("DROP_DEN_MODE").ok().as_deref() == Some("desktop"),
        limits: settings::ResourceLimits::from_environment(),
        storage_dir,
        db,
        join_pin: persisted_state.join_pin,
        join_pin_hash: persisted_state.join_pin_hash,
        host_device_id: persisted_state.host_device_id,
        devices: persisted_state.devices,
        sessions: persisted_state.sessions,
        messages: persisted_state.messages,
        transfers: persisted_state.transfers,
        transfer_ttl_seconds: persisted_state.transfer_ttl_seconds,
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

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await?;

    Ok(())
}

fn build_app(state: AppState, frontend_dist: PathBuf) -> Router {
    let maximum_body_size = state
        .limits
        .max_file_bytes
        .saturating_add(1024 * 1024)
        .min(usize::MAX as u64) as usize;
    let static_files = ServeDir::new(&frontend_dist)
        .not_found_service(ServeFile::new(frontend_dist.join("index.html")));

    Router::new()
        .route("/api/health", get(health::health))
        .route("/api/config", get(config::config))
        .route(
            "/api/host/settings",
            axum::routing::patch(config::update_host_settings)
                .layer(DefaultBodyLimit::max(8 * 1024)),
        )
        .route(
            "/api/devices",
            get(devices::list_devices)
                .post(devices::register_device)
                .layer(DefaultBodyLimit::max(16 * 1024)),
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
            axum::routing::post(transfers::upload_local_paths)
                .layer(DefaultBodyLimit::max(64 * 1024)),
        )
        .route(
            "/api/transfers/download-all",
            get(transfers::download_all_transfers),
        )
        .route(
            "/api/transfers/download-all-ticket",
            axum::routing::post(transfers::create_all_download_ticket),
        )
        .route(
            "/api/transfers/:id/download-ticket",
            axum::routing::post(transfers::create_transfer_download_ticket),
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
                .delete(messages::delete_all_messages)
                .layer(DefaultBodyLimit::max(16 * 1024)),
        )
        .route("/ws", get(ws::ws_handler))
        .fallback_service(static_files)
        .layer(DefaultBodyLimit::max(maximum_body_size))
        .layer(local_cors_layer())
        .with_state(state)
}

async fn remove_legacy_inbox_files(data_dir: &std::path::Path) {
    let path = data_dir.join("inbox");
    match tokio::fs::remove_dir_all(&path).await {
        Ok(()) => tracing::info!("removed legacy shared inbox storage"),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => {
            tracing::warn!(error = %error, "failed to remove legacy shared inbox storage")
        }
    }
}

async fn reconcile_transfer_storage(
    storage_dir: &std::path::Path,
    transfers: &std::collections::HashMap<String, crate::models::Transfer>,
) {
    let expected = transfers
        .values()
        .filter_map(|transfer| {
            std::path::Path::new(&transfer.stored_path)
                .parent()
                .map(std::path::Path::to_path_buf)
        })
        .collect::<std::collections::HashSet<_>>();
    let Ok(mut entries) = tokio::fs::read_dir(storage_dir).await else {
        return;
    };
    while let Ok(Some(entry)) = entries.next_entry().await {
        let path = entry.path();
        if expected.contains(&path) {
            continue;
        }
        let result = if entry
            .file_type()
            .await
            .map(|kind| kind.is_dir())
            .unwrap_or(false)
        {
            tokio::fs::remove_dir_all(path).await
        } else {
            tokio::fs::remove_file(path).await
        };
        if let Err(error) = result {
            tracing::warn!(error = %error, "failed to remove orphaned transfer storage");
        }
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
    use crate::models::{RegisteredDevice, Transfer, TransferStatus};
    use axum::{
        body::Body,
        http::{HeaderMap, Request, StatusCode},
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
        test_app_with_desktop(false).await
    }

    async fn test_app_with_desktop(desktop_mode: bool) -> TestApp {
        test_app_with_limits(desktop_mode, settings::ResourceLimits::default()).await
    }

    async fn test_app_with_limits(desktop_mode: bool, limits: settings::ResourceLimits) -> TestApp {
        let root = std::env::temp_dir().join(format!("drop-den-test-{}", Uuid::new_v4()));
        let storage_dir = root.join("transfers");
        tokio::fs::create_dir_all(&storage_dir).await.unwrap();

        let pool = db::connect_database(root.join("drop-den.sqlite"))
            .await
            .unwrap();
        let persisted = db::load_persisted_runtime_state(&pool).await.unwrap();
        let state = AppState::new(AppStateInit {
            desktop_mode,
            limits,
            storage_dir,
            db: pool,
            join_pin: persisted.join_pin,
            join_pin_hash: persisted.join_pin_hash,
            host_device_id: persisted.host_device_id,
            devices: HashMap::new(),
            sessions: HashMap::new(),
            messages: Vec::new(),
            transfers: HashMap::new(),
            transfer_ttl_seconds: persisted.transfer_ttl_seconds,
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

    fn authorized_request(method: &str, uri: &str, token: &str) -> Request<Body> {
        Request::builder()
            .method(method)
            .uri(uri)
            .header("authorization", format!("Bearer {token}"))
            .body(Body::empty())
            .unwrap()
    }

    fn authorized_json_request(method: &str, uri: &str, token: &str, body: Value) -> Request<Body> {
        Request::builder()
            .method(method)
            .uri(uri)
            .header("content-type", "application/json")
            .header("authorization", format!("Bearer {token}"))
            .body(Body::from(body.to_string()))
            .unwrap()
    }

    fn with_peer(mut request: Request<Body>, address: &str) -> Request<Body> {
        request.extensions_mut().insert(axum::extract::ConnectInfo(
            address.parse::<SocketAddr>().unwrap(),
        ));
        request
    }

    fn multipart_upload_request(token: &str, payload: &[u8]) -> Request<Body> {
        const BOUNDARY: &str = "drop-den-test-boundary";
        let mut body = format!(
            "--{BOUNDARY}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"test.txt\"\r\nContent-Type: text/plain\r\n\r\n"
        )
        .into_bytes();
        body.extend_from_slice(payload);
        body.extend_from_slice(format!("\r\n--{BOUNDARY}--\r\n").as_bytes());
        Request::post("/api/transfers/upload")
            .header("authorization", format!("Bearer {token}"))
            .header(
                "content-type",
                format!("multipart/form-data; boundary={BOUNDARY}"),
            )
            .body(Body::from(body))
            .unwrap()
    }

    async fn response_json(response: axum::response::Response) -> Value {
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        serde_json::from_slice(&bytes).unwrap()
    }

    async fn register(
        app: &Router,
        name: &str,
        pin: Option<&str>,
    ) -> (StatusCode, Option<RegisteredDevice>) {
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

    async fn seed_transfer(
        test: &TestApp,
        id: &str,
        sender_id: &str,
        target_id: Option<&str>,
        status: TransferStatus,
        payload: &[u8],
    ) -> Transfer {
        let transfer_dir = test.state.storage_dir.join(id);
        tokio::fs::create_dir_all(&transfer_dir).await.unwrap();
        let stored_path = transfer_dir.join("private.txt");
        tokio::fs::write(&stored_path, payload).await.unwrap();
        let transfer = Transfer {
            id: id.to_string(),
            filename: "private.txt".to_string(),
            mime_type: "text/plain".to_string(),
            size: payload.len() as u64,
            sender_device_id: Some(sender_id.to_string()),
            target_device_id: target_id.map(str::to_string),
            status,
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
            .insert(transfer.id.clone(), transfer.clone());
        transfer
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
            .oneshot(authorized_request(
                "POST",
                "/api/host/reset",
                &joined.session_token,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);

        let response = test
            .app
            .clone()
            .oneshot(authorized_request(
                "POST",
                "/api/host/reset",
                &host.session_token,
            ))
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
        seed_transfer(
            &test,
            "joined-private",
            &host.id,
            Some(&joined.id),
            TransferStatus::Pending,
            b"private",
        )
        .await;

        let response = test
            .app
            .clone()
            .oneshot(authorized_request(
                "DELETE",
                &format!("/api/devices/{}", other.id),
                &joined.session_token,
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
                &joined.session_token,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NO_CONTENT);
        assert!(!test.state.devices.read().await.contains_key(&joined.id));
        assert!(!test
            .state
            .transfers
            .read()
            .await
            .contains_key("joined-private"));
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
                &other.session_token,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);

        let response = test
            .app
            .clone()
            .oneshot(authorized_request(
                "PATCH",
                "/api/transfers/targeted-transfer/accept",
                &target.session_token,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        for allowed_device in [&host, &target] {
            let response = test
                .app
                .clone()
                .oneshot(authorized_request(
                    "GET",
                    "/api/transfers/targeted-transfer/download",
                    &allowed_device.session_token,
                ))
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::OK);
        }

        let response = test
            .app
            .clone()
            .oneshot(authorized_request(
                "GET",
                "/api/transfers/targeted-transfer/download",
                &other.session_token,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);

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
            .oneshot(authorized_request(
                "DELETE",
                "/api/transfers",
                &joined.session_token,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);

        let response = test
            .app
            .clone()
            .oneshot(authorized_request(
                "DELETE",
                "/api/transfers",
                &host.session_token,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NO_CONTENT);

        test.state.db.close().await;
        tokio::fs::remove_dir_all(test.root).await.unwrap();
    }

    #[tokio::test]
    async fn only_the_host_can_change_transfer_expiry() {
        let test = test_app().await;
        let (_, host) = register(&test.app, "Host", None).await;
        let host = host.unwrap();
        let pin = test.state.join_pin.read().await.clone();
        let (_, joined) = register(&test.app, "Joined", Some(&pin)).await;
        let joined = joined.unwrap();

        let response = test
            .app
            .clone()
            .oneshot(authorized_json_request(
                "PATCH",
                "/api/host/settings",
                &joined.session_token,
                json!({ "transfer_ttl_seconds": 6 * 60 * 60 }),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);

        let response = test
            .app
            .clone()
            .oneshot(authorized_json_request(
                "PATCH",
                "/api/host/settings",
                &host.session_token,
                json!({ "transfer_ttl_seconds": 59 * 60 }),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);

        let response = test
            .app
            .clone()
            .oneshot(authorized_json_request(
                "PATCH",
                "/api/host/settings",
                &host.session_token,
                json!({ "transfer_ttl_seconds": 3 * 24 * 60 * 60 }),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(*test.state.transfer_ttl_seconds.read().await, 259_200);
        assert_eq!(
            db::get_setting(&test.state.db, settings::TRANSFER_TTL_SETTING_KEY)
                .await
                .unwrap()
                .as_deref(),
            Some("259200")
        );

        let response = test
            .app
            .clone()
            .oneshot(authorized_request(
                "GET",
                "/api/config",
                &host.session_token,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response_json(response).await["default_transfer_ttl_seconds"],
            259_200
        );

        test.state.db.close().await;
        tokio::fs::remove_dir_all(test.root).await.unwrap();
    }

    #[tokio::test]
    async fn session_tokens_are_required_hashed_and_revoked() {
        let test = test_app().await;
        let (_, host) = register(&test.app, "Host", None).await;
        let host = host.unwrap();
        let pin = test.state.join_pin.read().await.clone();
        let (_, joined) = register(&test.app, "Phone", Some(&pin)).await;
        let joined = joined.unwrap();

        let stored_hash: String =
            sqlx::query_scalar("SELECT session_token_hash FROM devices WHERE id = ?")
                .bind(&joined.id)
                .fetch_one(&test.state.db)
                .await
                .unwrap();
        assert_ne!(stored_hash, joined.session_token);
        assert_eq!(stored_hash, auth::hash_session_token(&joined.session_token));

        let impersonation = Request::get("/api/devices")
            .header("X-Drop-Den-Device-Id", &joined.id)
            .body(Body::empty())
            .unwrap();
        let response = test.app.clone().oneshot(impersonation).await.unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

        let response = test
            .app
            .clone()
            .oneshot(authorized_request("GET", "/api/devices", "invalid-token"))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

        let response = test
            .app
            .clone()
            .oneshot(authorized_request(
                "GET",
                "/api/devices",
                &joined.session_token,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let devices = response_json(response).await;
        assert!(!devices.to_string().contains("session_token"));
        assert!(!devices.to_string().contains(&joined.session_token));

        let response = test
            .app
            .clone()
            .oneshot(authorized_request(
                "DELETE",
                &format!("/api/devices/{}", joined.id),
                &joined.session_token,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NO_CONTENT);

        let response = test
            .app
            .clone()
            .oneshot(authorized_request(
                "GET",
                "/api/devices",
                &joined.session_token,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

        drop(host);
        test.state.db.close().await;
        tokio::fs::remove_dir_all(test.root).await.unwrap();
    }

    #[tokio::test]
    async fn targeted_transfer_policy_hides_metadata_paths_download_and_delete() {
        let test = test_app().await;
        let (_, host) = register(&test.app, "Host", None).await;
        let host = host.unwrap();
        let pin = test.state.join_pin.read().await.clone();
        let (_, target) = register(&test.app, "Target", Some(&pin)).await;
        let target = target.unwrap();
        let pin = test.state.join_pin.read().await.clone();
        let (_, other) = register(&test.app, "Other", Some(&pin)).await;
        let other = other.unwrap();
        seed_transfer(
            &test,
            "private-policy",
            &host.id,
            Some(&target.id),
            TransferStatus::Accepted,
            &vec![7_u8; 2 * 1024 * 1024],
        )
        .await;

        let response = test
            .app
            .clone()
            .oneshot(authorized_request(
                "GET",
                "/api/transfers",
                &other.session_token,
            ))
            .await
            .unwrap();
        assert_eq!(response_json(response).await, json!([]));

        let response = test
            .app
            .clone()
            .oneshot(authorized_request(
                "GET",
                "/api/transfers",
                &target.session_token,
            ))
            .await
            .unwrap();
        let visible = response_json(response).await;
        assert_eq!(visible.as_array().unwrap().len(), 1);
        assert!(visible[0].get("stored_path").is_none());
        assert!(!visible
            .to_string()
            .contains(test.root.to_string_lossy().as_ref()));

        for (method, path) in [
            ("GET", "/api/transfers/private-policy/download"),
            ("DELETE", "/api/transfers/private-policy"),
        ] {
            let response = test
                .app
                .clone()
                .oneshot(authorized_request(method, path, &other.session_token))
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::NOT_FOUND);
        }

        let grant_response = test
            .app
            .clone()
            .oneshot(authorized_json_request(
                "POST",
                "/api/transfers/private-policy/download-ticket",
                &target.session_token,
                json!({}),
            ))
            .await
            .unwrap();
        let grant = response_json(grant_response).await;
        let ticket = grant["ticket"].as_str().unwrap();
        assert_ne!(ticket, target.session_token);
        let response = test
            .app
            .clone()
            .oneshot(
                Request::get(format!(
                    "/api/transfers/private-policy/download?ticket={ticket}"
                ))
                .body(Body::empty())
                .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response
                .into_body()
                .collect()
                .await
                .unwrap()
                .to_bytes()
                .len(),
            2 * 1024 * 1024
        );

        test.state.db.close().await;
        tokio::fs::remove_dir_all(test.root).await.unwrap();
    }

    #[tokio::test]
    async fn oversized_device_and_message_metadata_is_rejected() {
        let test = test_app().await;
        let (status, _) = register(&test.app, &"x".repeat(65), None).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        let (_, host) = register(&test.app, "Host", None).await;
        let host = host.unwrap();
        let response = test
            .app
            .clone()
            .oneshot(authorized_json_request(
                "POST",
                "/api/messages",
                &host.session_token,
                json!({ "body": "x".repeat(2_001) }),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);

        test.state.db.close().await;
        tokio::fs::remove_dir_all(test.root).await.unwrap();
    }

    #[tokio::test]
    async fn desktop_local_paths_require_loopback_host_and_regular_files() {
        let test = test_app_with_desktop(true).await;
        let (_, host) = register(&test.app, "Host", None).await;
        let host = host.unwrap();
        let pin = test.state.join_pin.read().await.clone();
        let (_, joined) = register(&test.app, "Phone", Some(&pin)).await;
        let joined = joined.unwrap();
        let source = test.root.join("source.txt");
        tokio::fs::write(&source, b"trusted local file")
            .await
            .unwrap();
        let body = json!({
            "sender_device_id": host.id,
            "paths": [source.to_string_lossy()]
        });

        let response = test
            .app
            .clone()
            .oneshot(with_peer(
                authorized_json_request(
                    "POST",
                    "/api/transfers/upload-local-paths",
                    &host.session_token,
                    body.clone(),
                ),
                "192.168.1.50:50000",
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);

        let response = test
            .app
            .clone()
            .oneshot(with_peer(
                authorized_json_request(
                    "POST",
                    "/api/transfers/upload-local-paths",
                    &joined.session_token,
                    body.clone(),
                ),
                "127.0.0.1:50000",
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);

        let response = test
            .app
            .clone()
            .oneshot(with_peer(
                authorized_json_request(
                    "POST",
                    "/api/transfers/upload-local-paths",
                    &host.session_token,
                    body,
                ),
                "127.0.0.1:50000",
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let response = test
            .app
            .clone()
            .oneshot(with_peer(
                authorized_json_request(
                    "POST",
                    "/api/transfers/upload-local-paths",
                    &host.session_token,
                    json!({
                        "sender_device_id": host.id,
                        "paths": [test.root.join("missing/../secret").to_string_lossy()]
                    }),
                ),
                "127.0.0.1:50000",
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);

        test.state.db.close().await;
        tokio::fs::remove_dir_all(test.root).await.unwrap();
    }

    #[tokio::test]
    async fn websocket_authentication_accepts_only_an_active_session() {
        let test = test_app().await;
        let (_, host) = register(&test.app, "Host", None).await;
        let host = host.unwrap();

        let missing = HeaderMap::new();
        assert_eq!(
            ws::authenticate_websocket(&test.state, &missing).await,
            Err(StatusCode::UNAUTHORIZED)
        );

        let mut invalid = HeaderMap::new();
        invalid.insert(
            "sec-websocket-protocol",
            "drop-den-v1, drop-den-auth.invalid".parse().unwrap(),
        );
        assert_eq!(
            ws::authenticate_websocket(&test.state, &invalid).await,
            Err(StatusCode::UNAUTHORIZED)
        );

        let mut valid = HeaderMap::new();
        valid.insert(
            "sec-websocket-protocol",
            format!("drop-den-v1, drop-den-auth.{}", host.session_token)
                .parse()
                .unwrap(),
        );
        let authenticated = ws::authenticate_websocket(&test.state, &valid)
            .await
            .unwrap();
        assert_eq!(authenticated.id, host.id);
        assert!(authenticated.is_host);

        test.state.db.close().await;
        tokio::fs::remove_dir_all(test.root).await.unwrap();
    }

    #[tokio::test]
    async fn oversized_and_storage_exhausting_uploads_fail_cleanly() {
        let limits = settings::ResourceLimits {
            max_file_bytes: 1,
            ..settings::ResourceLimits::default()
        };
        let test = test_app_with_limits(false, limits).await;
        let (_, host) = register(&test.app, "Host", None).await;
        let host = host.unwrap();
        let response = test
            .app
            .clone()
            .oneshot(multipart_upload_request(&host.session_token, b"AB"))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
        test.state.db.close().await;
        tokio::fs::remove_dir_all(test.root).await.unwrap();

        let limits = settings::ResourceLimits {
            max_file_bytes: 10,
            max_storage_bytes: 1,
            ..settings::ResourceLimits::default()
        };
        let test = test_app_with_limits(false, limits).await;
        let (_, host) = register(&test.app, "Host", None).await;
        let host = host.unwrap();
        let response = test
            .app
            .clone()
            .oneshot(multipart_upload_request(&host.session_token, b"AB"))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::INSUFFICIENT_STORAGE);

        test.state.db.close().await;
        tokio::fs::remove_dir_all(test.root).await.unwrap();
    }
}
