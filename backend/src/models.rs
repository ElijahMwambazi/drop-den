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

#[derive(Debug, Serialize, Deserialize)]
pub struct RegisteredDevice {
    #[serde(flatten)]
    pub device: Device,
    pub session_token: String,
}

impl std::ops::Deref for RegisteredDevice {
    type Target = Device;

    fn deref(&self) -> &Self::Target {
        &self.device
    }
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
    #[serde(skip_serializing)]
    pub stored_path: String,
    pub created_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    pub sender_device_id: Option<String>,
    pub body: String,
    pub created_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateMessageRequest {
    pub body: String,
}

#[derive(Debug, Serialize)]
pub struct AppConfig {
    pub app_name: String,
    pub mode: String,
    pub port: u16,
    pub local_only: bool,
    pub public_name: Option<String>,
    pub friendly_origin: Option<String>,
    pub lan_ip: Option<String>,
    pub lan_origin: Option<String>,
    pub local_origin: String,
    pub recommended_join_origin: String,
    pub has_host_device: bool,
    pub is_host_device: bool,
    pub join_pin: Option<String>,
    pub max_upload_size_bytes: u64,
    pub default_transfer_ttl_seconds: u64,
    pub data_dir: Option<String>,
    pub storage_dir: Option<String>,
    pub database_path: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateHostSettingsRequest {
    pub transfer_ttl_seconds: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct HostSettings {
    pub transfer_ttl_seconds: u64,
}

#[derive(Debug, Serialize)]
pub struct DownloadGrant {
    pub ticket: String,
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct WsEvent<T: Serialize> {
    pub event_type: String,
    pub payload: T,
}
