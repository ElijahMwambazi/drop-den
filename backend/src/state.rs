use crate::models::{Device, Message, Transfer};
use sqlx::SqlitePool;
use std::{collections::HashMap, path::PathBuf, sync::Arc};
use tokio::sync::{broadcast, RwLock};

#[derive(Clone)]
pub struct AppState {
    pub storage_dir: PathBuf,
    pub db: SqlitePool,
    pub join_pin: Arc<RwLock<String>>,
    pub join_pin_hash: Arc<RwLock<String>>,
    pub host_device_id: Arc<RwLock<Option<String>>>,
    pub devices: Arc<RwLock<HashMap<String, Device>>>,
    pub transfers: Arc<RwLock<HashMap<String, Transfer>>>,
    pub messages: Arc<RwLock<Vec<Message>>>,
    pub transfer_ttl_seconds: Arc<RwLock<u64>>,
    pub events: broadcast::Sender<String>,
}

pub struct AppStateInit {
    pub storage_dir: PathBuf,
    pub db: SqlitePool,
    pub join_pin: String,
    pub join_pin_hash: String,
    pub host_device_id: Option<String>,
    pub devices: HashMap<String, Device>,
    pub messages: Vec<Message>,
    pub transfers: HashMap<String, Transfer>,
    pub transfer_ttl_seconds: u64,
}

impl AppState {
    pub fn new(init: AppStateInit) -> Self {
        let AppStateInit {
            storage_dir,
            db,
            join_pin,
            join_pin_hash,
            host_device_id,
            devices,
            messages,
            transfers,
            transfer_ttl_seconds,
        } = init;
        let (events, _) = broadcast::channel(256);

        Self {
            storage_dir,
            db,
            join_pin: Arc::new(RwLock::new(join_pin)),
            join_pin_hash: Arc::new(RwLock::new(join_pin_hash)),
            host_device_id: Arc::new(RwLock::new(host_device_id)),
            devices: Arc::new(RwLock::new(devices)),
            transfers: Arc::new(RwLock::new(transfers)),
            messages: Arc::new(RwLock::new(messages)),
            transfer_ttl_seconds: Arc::new(RwLock::new(transfer_ttl_seconds)),
            events,
        }
    }

    pub fn broadcast_json<T: serde::Serialize>(&self, value: &T) {
        if let Ok(payload) = serde_json::to_string(value) {
            let _ = self.events.send(payload);
        }
    }
}
