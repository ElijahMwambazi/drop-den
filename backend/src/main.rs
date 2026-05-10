mod models;
mod routes;
mod state;
mod ws;

use axum::{extract::DefaultBodyLimit, routing::get, Router};
use routes::{config, devices, health, messages, transfers};
use state::AppState;
use std::{net::SocketAddr, path::PathBuf};
use tower_http::{cors::CorsLayer, trace::TraceLayer};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter("drop_den_backend=debug,tower_http=debug")
        .init();

    let storage_dir = PathBuf::from("../storage/transfers");
    tokio::fs::create_dir_all(&storage_dir).await?;

    let state = AppState::new(storage_dir);

    let app = Router::new()
        .route("/api/health", get(health::health))
        .route("/api/config", get(config::config))
        .route(
            "/api/devices",
            get(devices::list_devices).post(devices::register_device),
        )
        .route("/api/transfers", get(transfers::list_transfers))
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
        .layer(DefaultBodyLimit::max(1024 * 1024 * 1024))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));
    tracing::info!("Drop Den backend listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
