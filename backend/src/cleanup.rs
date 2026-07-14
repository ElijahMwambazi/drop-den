use crate::{
    db,
    models::{Transfer, WsEvent},
    state::AppState,
};
use chrono::Utc;
use std::{collections::HashSet, path::PathBuf};
use tokio::time::{self, Duration};

const CLEANUP_INTERVAL_SECONDS: u64 = 5 * 60;

pub fn spawn_expired_transfer_cleanup(state: AppState) {
    tokio::spawn(async move {
        let mut interval = time::interval(Duration::from_secs(CLEANUP_INTERVAL_SECONDS));

        loop {
            interval.tick().await;
            cleanup_expired_transfers(state.clone()).await;
            cleanup_expired_messages(state.clone()).await;
            cleanup_inbox(&state).await;
        }
    });
}

pub async fn cleanup_inbox(state: &AppState) {
    let _write_guard = state.inbox_write_lock.lock().await;
    let items = match db::list_all_inbox_items(&state.db).await {
        Ok(items) => items,
        Err(error) => {
            tracing::warn!(error = %error, "failed to inspect shared inbox during cleanup");
            return;
        }
    };
    let now = Utc::now();
    let mut retained_item_directories = HashSet::new();

    for item in items {
        let file_is_missing = tokio::fs::metadata(&item.stored_path).await.is_err();

        if now < item.expires_at && !file_is_missing {
            if let Some(parent) = std::path::Path::new(&item.stored_path).parent() {
                retained_item_directories.insert(parent.to_path_buf());
            }
            continue;
        }

        if let Err(error) = db::delete_inbox_metadata(&state.db, &item.id).await {
            tracing::warn!(
                error = %error,
                inbox_item_id = %item.id,
                "failed to delete stale inbox metadata"
            );
            if let Some(parent) = std::path::Path::new(&item.stored_path).parent() {
                retained_item_directories.insert(parent.to_path_buf());
            }
            continue;
        }

        super::routes::inbox::remove_inbox_item_files(&state.inbox_dir, &item).await;
    }

    cleanup_orphaned_inbox_paths(state, &retained_item_directories).await;
}

async fn cleanup_orphaned_inbox_paths(state: &AppState, retained: &HashSet<PathBuf>) {
    let mut owner_entries = match tokio::fs::read_dir(&state.inbox_dir).await {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return,
        Err(error) => {
            tracing::warn!(error = %error, "failed to scan inbox directory for orphaned files");
            return;
        }
    };

    while let Ok(Some(owner_entry)) = owner_entries.next_entry().await {
        let owner_path = owner_entry.path();
        let file_type = match owner_entry.file_type().await {
            Ok(file_type) => file_type,
            Err(_) => continue,
        };

        if !file_type.is_dir() {
            let _ = tokio::fs::remove_file(owner_path).await;
            continue;
        }

        let mut item_entries = match tokio::fs::read_dir(&owner_path).await {
            Ok(entries) => entries,
            Err(_) => continue,
        };

        while let Ok(Some(item_entry)) = item_entries.next_entry().await {
            let item_path = item_entry.path();

            if retained.contains(&item_path) {
                continue;
            }

            match item_entry.file_type().await {
                Ok(item_type) if item_type.is_dir() => {
                    let _ = tokio::fs::remove_dir_all(item_path).await;
                }
                Ok(_) => {
                    let _ = tokio::fs::remove_file(item_path).await;
                }
                Err(_) => {}
            }
        }

        let _ = tokio::fs::remove_dir(owner_path).await;
    }
}

async fn cleanup_expired_transfers(state: AppState) {
    let now = Utc::now();

    let expired_transfers = {
        let mut transfers = state.transfers.write().await;

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

    if expired_transfers.is_empty() {
        return;
    }

    if let Err(error) = db::delete_expired_transfers(&state.db, now).await {
        tracing::warn!(error = %error, "failed to delete expired transfer metadata from sqlite");
    }

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
