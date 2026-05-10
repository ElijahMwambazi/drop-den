mod auth;
mod cleanup;
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

    let storage_dir = PathBuf::from("../storage/transfers");
    tokio::fs::create_dir_all(&storage_dir).await?;

    let state = AppState::new(storage_dir);

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

    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));
    tracing::info!("Drop Den backend listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
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
