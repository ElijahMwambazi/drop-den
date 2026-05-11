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
use state::AppState;
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
    let persisted_state = db::load_persisted_runtime_state(&db).await?;

    let state = AppState::new(
        storage_dir,
        db,
        persisted_state.join_pin,
        persisted_state.host_device_id,
        persisted_state.devices,
        persisted_state.messages,
    );

    cleanup::spawn_expired_transfer_cleanup(state.clone());

    let frontend_dist = PathBuf::from("../frontend/dist");
    let static_files = ServeDir::new(&frontend_dist)
        .not_found_service(ServeFile::new(frontend_dist.join("index.html")));

    let app = Router::new()
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
            "/api/transfers",
            get(transfers::list_transfers).delete(transfers::delete_all_transfers),
        )
        .route(
            "/api/transfers/upload",
            axum::routing::post(transfers::upload_transfer),
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
            get(messages::list_messages).post(messages::create_message),
        )
        .route("/ws", get(ws::ws_handler))
        .fallback_service(static_files)
        .layer(DefaultBodyLimit::max(1024 * 1024 * 1024))
        .layer(local_cors_layer())
        .layer(TraceLayer::new_for_http())
        .with_state(state);

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

    if origin == "http://localhost:5173" || origin == "http://127.0.0.1:5173" {
        return true;
    }

    if let Some(host) = origin.strip_prefix("http://") {
        return is_allowed_lan_dev_origin(host);
    }

    false
}

fn is_allowed_lan_dev_origin(host: &str) -> bool {
    let Some((address, port)) = host.rsplit_once(':') else {
        return false;
    };

    if port != "5173" {
        return false;
    }

    is_private_ipv4(address)
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
