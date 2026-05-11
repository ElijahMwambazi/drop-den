use crate::models::{Device, Message, Transfer};
use sqlx::SqlitePool;
use std::{collections::HashMap, path::PathBuf, sync::Arc};
use tokio::sync::{broadcast, RwLock};

#[derive(Clone)]
pub struct AppState {
    pub storage_dir: PathBuf,
    pub db: SqlitePool,
    pub join_pin: String,
    pub host_device_id: Arc<RwLock<Option<String>>>,
    pub devices: Arc<RwLock<HashMap<String, Device>>>,
    pub transfers: Arc<RwLock<HashMap<String, Transfer>>>,
    pub messages: Arc<RwLock<Vec<Message>>>,
    pub events: broadcast::Sender<String>,
}

impl AppState {
    pub fn new(
        storage_dir: PathBuf,
        db: SqlitePool,
        join_pin: String,
        host_device_id: Option<String>,
        devices: HashMap<String, Device>,
        messages: Vec<Message>,
    ) -> Self {
        let (events, _) = broadcast::channel(256);

        Self {
            storage_dir,
            db,
            join_pin,
            host_device_id: Arc::new(RwLock::new(host_device_id)),
            devices: Arc::new(RwLock::new(devices)),
            transfers: Arc::new(RwLock::new(HashMap::new())),
            messages: Arc::new(RwLock::new(messages)),
            events,
        }
    }

    pub fn broadcast_json<T: serde::Serialize>(&self, value: &T) {
        if let Ok(payload) = serde_json::to_string(value) {
            let _ = self.events.send(payload);
        }
    }
}
