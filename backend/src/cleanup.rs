use crate::{
    db,
    models::{Transfer, WsEvent},
    state::AppState,
};
use chrono::Utc;
use std::path::PathBuf;
use tokio::time::{self, Duration};

const CLEANUP_INTERVAL_SECONDS: u64 = 5 * 60;

pub fn spawn_expired_transfer_cleanup(state: AppState) {
    tokio::spawn(async move {
        let mut interval = time::interval(Duration::from_secs(CLEANUP_INTERVAL_SECONDS));

        loop {
            interval.tick().await;
            cleanup_expired_transfers(state.clone()).await;
            cleanup_expired_messages(state.clone()).await;
        }
    });
}

async fn cleanup_expired_transfers(state: AppState) {
    let expired_transfers = {
        let mut transfers = state.transfers.write().await;
        let now = Utc::now();

        let expired_ids = transfers
            .iter()
            .filter_map(|(id, transfer)| {
                if now >= transfer.expires_at {
                    Some(id.clone())
                } else {
                    None
                }
            })
            .collect::<Vec<_>>();

        expired_ids
            .into_iter()
            .filter_map(|id| transfers.remove(&id))
            .collect::<Vec<_>>()
    };

    for transfer in expired_transfers {
        remove_transfer_files(&transfer).await;

        state.broadcast_json(&WsEvent {
            event_type: "transfer_deleted".to_string(),
            payload: transfer,
        });
    }
}

async fn remove_transfer_files(transfer: &Transfer) {
    let path = PathBuf::from(&transfer.stored_path);

    if let Some(parent) = path.parent() {
        if let Err(error) = tokio::fs::remove_dir_all(parent).await {
            tracing::warn!(
                transfer_id = %transfer.id,
                path = %parent.display(),
                error = %error,
                "failed to remove expired transfer directory"
            );
        }
    }
}

async fn cleanup_expired_messages(state: AppState) {
    let now = Utc::now();

    let removed_count = {
        let mut messages = state.messages.write().await;
        let before = messages.len();

        messages.retain(|message| now < message.expires_at);

        before.saturating_sub(messages.len())
    };

    if removed_count == 0 {
        return;
    }

    if let Err(error) = db::delete_expired_messages(&state.db, now).await {
        tracing::warn!(error = %error, "failed to delete expired messages from sqlite");
    }

    state.broadcast_json(&WsEvent {
        event_type: "messages_deleted".to_string(),
        payload: removed_count,
    });
}
