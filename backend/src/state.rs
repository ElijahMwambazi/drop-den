use crate::{
    models::{Device, Message, Transfer, WsEvent},
    rate_limit::RateLimiter,
    settings::ResourceLimits,
};
use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;
use sqlx::SqlitePool;
use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    sync::Arc,
};
use tokio::sync::{broadcast, Mutex, RwLock};

#[derive(Clone)]
pub enum EventAudience {
    AllAuthenticated,
    Devices(HashSet<String>),
}

#[derive(Clone)]
pub struct AppEvent {
    pub event_type: String,
    pub payload: Value,
    pub audience: EventAudience,
    pub disconnect_devices: HashSet<String>,
}

#[derive(Clone)]
pub enum DownloadScope {
    Transfer(String),
    AllVisible,
}

#[derive(Clone)]
pub struct DownloadTicket {
    pub device_id: String,
    pub scope: DownloadScope,
    pub expires_at: DateTime<Utc>,
}

#[derive(Clone)]
pub struct AppState {
    pub desktop_mode: bool,
    pub limits: ResourceLimits,
    pub storage_dir: PathBuf,
    pub db: SqlitePool,
    pub join_pin: Arc<RwLock<String>>,
    pub join_pin_hash: Arc<RwLock<String>>,
    pub host_device_id: Arc<RwLock<Option<String>>>,
    pub devices: Arc<RwLock<HashMap<String, Device>>>,
    pub sessions: Arc<RwLock<HashMap<String, String>>>,
    pub download_tickets: Arc<RwLock<HashMap<String, DownloadTicket>>>,
    pub rate_limiter: RateLimiter,
    pub upload_lock: Arc<Mutex<()>>,
    pub transfers: Arc<RwLock<HashMap<String, Transfer>>>,
    pub messages: Arc<RwLock<Vec<Message>>>,
    pub transfer_ttl_seconds: Arc<RwLock<u64>>,
    pub events: broadcast::Sender<AppEvent>,
}

pub struct AppStateInit {
    pub desktop_mode: bool,
    pub limits: ResourceLimits,
    pub storage_dir: PathBuf,
    pub db: SqlitePool,
    pub join_pin: String,
    pub join_pin_hash: String,
    pub host_device_id: Option<String>,
    pub devices: HashMap<String, Device>,
    pub sessions: HashMap<String, String>,
    pub messages: Vec<Message>,
    pub transfers: HashMap<String, Transfer>,
    pub transfer_ttl_seconds: u64,
}

impl AppState {
    pub fn new(init: AppStateInit) -> Self {
        let AppStateInit {
            desktop_mode,
            limits,
            storage_dir,
            db,
            join_pin,
            join_pin_hash,
            host_device_id,
            devices,
            sessions,
            messages,
            transfers,
            transfer_ttl_seconds,
        } = init;
        let (events, _) = broadcast::channel(256);

        Self {
            desktop_mode,
            limits,
            storage_dir,
            db,
            join_pin: Arc::new(RwLock::new(join_pin)),
            join_pin_hash: Arc::new(RwLock::new(join_pin_hash)),
            host_device_id: Arc::new(RwLock::new(host_device_id)),
            devices: Arc::new(RwLock::new(devices)),
            sessions: Arc::new(RwLock::new(sessions)),
            download_tickets: Arc::new(RwLock::new(HashMap::new())),
            rate_limiter: RateLimiter::default(),
            upload_lock: Arc::new(Mutex::new(())),
            transfers: Arc::new(RwLock::new(transfers)),
            messages: Arc::new(RwLock::new(messages)),
            transfer_ttl_seconds: Arc::new(RwLock::new(transfer_ttl_seconds)),
            events,
        }
    }

    pub fn broadcast_all<T: Serialize>(&self, event_type: &str, payload: &T) {
        self.broadcast(AppEvent {
            event_type: event_type.to_string(),
            payload: serde_json::to_value(payload).unwrap_or(Value::Null),
            audience: EventAudience::AllAuthenticated,
            disconnect_devices: HashSet::new(),
        });
    }

    pub fn broadcast_to<T: Serialize>(
        &self,
        event_type: &str,
        payload: &T,
        device_ids: impl IntoIterator<Item = String>,
    ) {
        self.broadcast(AppEvent {
            event_type: event_type.to_string(),
            payload: serde_json::to_value(payload).unwrap_or(Value::Null),
            audience: EventAudience::Devices(device_ids.into_iter().collect()),
            disconnect_devices: HashSet::new(),
        });
    }

    pub fn broadcast_and_disconnect<T: Serialize>(
        &self,
        event_type: &str,
        payload: &T,
        disconnect_devices: impl IntoIterator<Item = String>,
    ) {
        let disconnect_devices = disconnect_devices.into_iter().collect::<HashSet<_>>();
        self.broadcast(AppEvent {
            event_type: event_type.to_string(),
            payload: serde_json::to_value(payload).unwrap_or(Value::Null),
            audience: EventAudience::AllAuthenticated,
            disconnect_devices,
        });
    }

    pub fn broadcast_to_and_disconnect<T: Serialize>(
        &self,
        event_type: &str,
        payload: &T,
        device_ids: impl IntoIterator<Item = String>,
    ) {
        let device_ids = device_ids.into_iter().collect::<HashSet<_>>();
        self.broadcast(AppEvent {
            event_type: event_type.to_string(),
            payload: serde_json::to_value(payload).unwrap_or(Value::Null),
            audience: EventAudience::Devices(device_ids.clone()),
            disconnect_devices: device_ids,
        });
    }

    fn broadcast(&self, event: AppEvent) {
        let _ = self.events.send(event);
    }

    pub fn serialize_event(event: &AppEvent) -> Option<String> {
        serde_json::to_string(&WsEvent {
            event_type: event.event_type.clone(),
            payload: event.payload.clone(),
        })
        .ok()
    }
}
