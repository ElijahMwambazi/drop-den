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
    pub join_pin: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TransferStatus {
    Available,
    Pending,
    Accepted,
    Rejected,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transfer {
    pub id: String,
    pub filename: String,
    pub mime_type: String,
    pub size: u64,
    pub sender_device_id: Option<String>,
    pub target_device_id: Option<String>,
    pub status: TransferStatus,
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
pub struct AppConfig {
    pub app_name: String,
    pub port: u16,
    pub local_only: bool,
    pub has_host_device: bool,
    pub is_host_device: bool,
    pub join_pin: Option<String>,
    pub max_upload_size_bytes: u64,
}

#[derive(Debug, Serialize)]
pub struct WsEvent<T: Serialize> {
    pub event_type: String,
    pub payload: T,
}
