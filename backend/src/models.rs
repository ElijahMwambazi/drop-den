use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Device {
    pub id: String,
    pub name: String,
    pub connected_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct RegisterDeviceRequest {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transfer {
    pub id: String,
    pub filename: String,
    pub mime_type: String,
    pub size: u64,
    pub sender_device_id: Option<String>,
    pub target_device_id: Option<String>,
    pub stored_path: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    pub sender_device_id: Option<String>,
    pub body: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateMessageRequest {
    pub sender_device_id: Option<String>,
    pub body: String,
}

#[derive(Debug, Serialize)]
pub struct WsEvent<T: Serialize> {
    pub event_type: String,
    pub payload: T,
}
