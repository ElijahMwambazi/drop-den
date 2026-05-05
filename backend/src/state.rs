use crate::models::{Device, Message, Transfer};
use std::{collections::HashMap, path::PathBuf, sync::Arc};
use tokio::sync::{broadcast, RwLock};

#[derive(Clone)]
pub struct AppState {
    pub storage_dir: PathBuf,
    pub devices: Arc<RwLock<HashMap<String, Device>>>,
    pub transfers: Arc<RwLock<HashMap<String, Transfer>>>,
    pub messages: Arc<RwLock<Vec<Message>>>,
    pub events: broadcast::Sender<String>,
}

impl AppState {
    pub fn new(storage_dir: PathBuf) -> Self {
        let (events, _) = broadcast::channel(256);

        Self {
            storage_dir,
            devices: Arc::new(RwLock::new(HashMap::new())),
            transfers: Arc::new(RwLock::new(HashMap::new())),
            messages: Arc::new(RwLock::new(Vec::new())),
            events,
        }
    }

    pub fn broadcast_json<T: serde::Serialize>(&self, value: &T) {
        if let Ok(payload) = serde_json::to_string(value) {
            let _ = self.events.send(payload);
        }
    }
}
