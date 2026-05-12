use crate::models::{Device, Message, Transfer, TransferStatus};
use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use chrono::{DateTime, Duration, Utc};
use rand_core::OsRng;
use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    Row, SqlitePool,
};
use std::{collections::HashMap, path::PathBuf};

const DEFAULT_MESSAGE_TTL_SECONDS: i64 = 24 * 60 * 60;

pub struct PersistedRuntimeState {
    pub join_pin: String,
    pub join_pin_hash: String,
    pub host_device_id: Option<String>,
    pub devices: HashMap<String, Device>,
    pub messages: Vec<Message>,
    pub transfers: HashMap<String, Transfer>,
}

pub async fn connect_database(database_path: PathBuf) -> anyhow::Result<SqlitePool> {
    if let Some(parent) = database_path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    let options = SqliteConnectOptions::new()
        .filename(&database_path)
        .create_if_missing(true)
        .foreign_keys(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await?;

    sqlx::migrate!("./migrations").run(&pool).await?;

    tracing::info!("SQLite database ready at {}", database_path.display());

    Ok(pool)
}

pub async fn load_persisted_runtime_state(
    pool: &SqlitePool,
) -> anyhow::Result<PersistedRuntimeState> {
    let join_pin = generate_join_pin();
    let join_pin_hash = hash_join_pin(&join_pin)?;

    set_setting(pool, "join_pin_hash", &join_pin_hash).await?;
    delete_setting(pool, "join_pin").await?;

    let host_device_id = get_setting(pool, "host_device_id").await?;
    let devices = load_devices(pool).await?;
    let messages = load_messages(pool).await?;
    let transfers = load_transfers(pool).await?;

    Ok(PersistedRuntimeState {
        join_pin,
        join_pin_hash,
        host_device_id,
        devices,
        messages,
        transfers,
    })
}

pub async fn get_setting(pool: &SqlitePool, key: &str) -> anyhow::Result<Option<String>> {
    let row = sqlx::query("SELECT value FROM app_settings WHERE key = ?")
        .bind(key)
        .fetch_optional(pool)
        .await?;

    Ok(row.map(|row| row.get::<String, _>("value")))
}

pub async fn delete_setting(pool: &SqlitePool, key: &str) -> anyhow::Result<()> {
    sqlx::query("DELETE FROM app_settings WHERE key = ?")
        .bind(key)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn set_setting(pool: &SqlitePool, key: &str, value: &str) -> anyhow::Result<()> {
    sqlx::query(
        r#"
        INSERT INTO app_settings (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = CURRENT_TIMESTAMP
        "#,
    )
    .bind(key)
    .bind(value)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn insert_device(pool: &SqlitePool, device: &Device) -> anyhow::Result<()> {
    sqlx::query(
        r#"
        INSERT INTO devices (id, name, connected_at)
        VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            connected_at = excluded.connected_at
        "#,
    )
    .bind(&device.id)
    .bind(&device.name)
    .bind(device.connected_at.to_rfc3339())
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn delete_device(pool: &SqlitePool, device_id: &str) -> anyhow::Result<()> {
    sqlx::query("DELETE FROM devices WHERE id = ?")
        .bind(device_id)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn insert_message(pool: &SqlitePool, message: &Message) -> anyhow::Result<()> {
    sqlx::query(
        r#"
        INSERT INTO messages (id, sender_device_id, body, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            sender_device_id = excluded.sender_device_id,
            body = excluded.body,
            created_at = excluded.created_at,
            expires_at = excluded.expires_at
        "#,
    )
    .bind(&message.id)
    .bind(&message.sender_device_id)
    .bind(&message.body)
    .bind(message.created_at.to_rfc3339())
    .bind(message.expires_at.to_rfc3339())
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn delete_expired_messages(pool: &SqlitePool, now: DateTime<Utc>) -> anyhow::Result<u64> {
    let result =
        sqlx::query("DELETE FROM messages WHERE expires_at IS NOT NULL AND expires_at <= ?")
            .bind(now.to_rfc3339())
            .execute(pool)
            .await?;

    Ok(result.rows_affected())
}

pub async fn insert_transfer(pool: &SqlitePool, transfer: &Transfer) -> anyhow::Result<()> {
    sqlx::query(
        r#"
        INSERT INTO transfers (
            id,
            filename,
            mime_type,
            size,
            sender_device_id,
            target_device_id,
            status,
            stored_path,
            created_at,
            expires_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            filename = excluded.filename,
            mime_type = excluded.mime_type,
            size = excluded.size,
            sender_device_id = excluded.sender_device_id,
            target_device_id = excluded.target_device_id,
            status = excluded.status,
            stored_path = excluded.stored_path,
            created_at = excluded.created_at,
            expires_at = excluded.expires_at
        "#,
    )
    .bind(&transfer.id)
    .bind(&transfer.filename)
    .bind(&transfer.mime_type)
    .bind(transfer.size as i64)
    .bind(&transfer.sender_device_id)
    .bind(&transfer.target_device_id)
    .bind(transfer_status_to_str(&transfer.status))
    .bind(&transfer.stored_path)
    .bind(transfer.created_at.to_rfc3339())
    .bind(transfer.expires_at.to_rfc3339())
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn update_transfer_status(
    pool: &SqlitePool,
    transfer_id: &str,
    status: &TransferStatus,
) -> anyhow::Result<()> {
    sqlx::query("UPDATE transfers SET status = ? WHERE id = ?")
        .bind(transfer_status_to_str(status))
        .bind(transfer_id)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn delete_transfer(pool: &SqlitePool, transfer_id: &str) -> anyhow::Result<()> {
    sqlx::query("DELETE FROM transfers WHERE id = ?")
        .bind(transfer_id)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn delete_all_transfers(pool: &SqlitePool) -> anyhow::Result<()> {
    sqlx::query("DELETE FROM transfers").execute(pool).await?;

    Ok(())
}

pub async fn delete_expired_transfers(
    pool: &SqlitePool,
    now: DateTime<Utc>,
) -> anyhow::Result<u64> {
    let result = sqlx::query("DELETE FROM transfers WHERE expires_at <= ?")
        .bind(now.to_rfc3339())
        .execute(pool)
        .await?;

    Ok(result.rows_affected())
}

async fn load_devices(pool: &SqlitePool) -> anyhow::Result<HashMap<String, Device>> {
    let rows = sqlx::query("SELECT id, name, connected_at FROM devices ORDER BY connected_at ASC")
        .fetch_all(pool)
        .await?;

    let mut devices = HashMap::new();

    for row in rows {
        let id = row.get::<String, _>("id");
        let name = row.get::<String, _>("name");
        let connected_at = parse_datetime(row.get::<String, _>("connected_at"))?;

        devices.insert(
            id.clone(),
            Device {
                id,
                name,
                connected_at,
            },
        );
    }

    Ok(devices)
}

async fn load_messages(pool: &SqlitePool) -> anyhow::Result<Vec<Message>> {
    let rows = sqlx::query(
        r#"
        SELECT id, sender_device_id, body, created_at, expires_at
        FROM messages
        ORDER BY created_at ASC
        "#,
    )
    .fetch_all(pool)
    .await?;

    let now = Utc::now();
    let mut messages = Vec::new();

    for row in rows {
        let created_at = parse_datetime(row.get::<String, _>("created_at"))?;
        let expires_at = match row.try_get::<Option<String>, _>("expires_at")? {
            Some(value) => parse_datetime(value)?,
            None => created_at + Duration::seconds(DEFAULT_MESSAGE_TTL_SECONDS),
        };

        if now >= expires_at {
            continue;
        }

        messages.push(Message {
            id: row.get::<String, _>("id"),
            sender_device_id: row.get::<Option<String>, _>("sender_device_id"),
            body: row.get::<String, _>("body"),
            created_at,
            expires_at,
        });
    }

    delete_expired_messages(pool, now).await?;

    Ok(messages)
}

async fn load_transfers(pool: &SqlitePool) -> anyhow::Result<HashMap<String, Transfer>> {
    let rows = sqlx::query(
        r#"
        SELECT
            id,
            filename,
            mime_type,
            size,
            sender_device_id,
            target_device_id,
            status,
            stored_path,
            created_at,
            expires_at
        FROM transfers
        ORDER BY created_at ASC
        "#,
    )
    .fetch_all(pool)
    .await?;

    let now = Utc::now();
    let mut transfers = HashMap::new();
    let mut stale_transfer_ids = Vec::new();

    for row in rows {
        let id = row.get::<String, _>("id");
        let stored_path = row.get::<String, _>("stored_path");
        let expires_at = parse_datetime(row.get::<String, _>("expires_at"))?;

        if now >= expires_at {
            stale_transfer_ids.push(id);
            continue;
        }

        if tokio::fs::metadata(&stored_path).await.is_err() {
            stale_transfer_ids.push(id);
            continue;
        }

        let status = parse_transfer_status(row.get::<String, _>("status"))?;

        let transfer = Transfer {
            id: id.clone(),
            filename: row.get::<String, _>("filename"),
            mime_type: row.get::<String, _>("mime_type"),
            size: row.get::<i64, _>("size") as u64,
            sender_device_id: row.get::<Option<String>, _>("sender_device_id"),
            target_device_id: row.get::<Option<String>, _>("target_device_id"),
            status,
            stored_path,
            created_at: parse_datetime(row.get::<String, _>("created_at"))?,
            expires_at,
        };

        transfers.insert(id, transfer);
    }

    for transfer_id in stale_transfer_ids {
        delete_transfer(pool, &transfer_id).await?;
    }

    Ok(transfers)
}

fn parse_datetime(value: String) -> anyhow::Result<DateTime<Utc>> {
    Ok(DateTime::parse_from_rfc3339(&value)?.with_timezone(&Utc))
}

fn parse_transfer_status(value: String) -> anyhow::Result<TransferStatus> {
    match value.as_str() {
        "available" => Ok(TransferStatus::Available),
        "pending" => Ok(TransferStatus::Pending),
        "accepted" => Ok(TransferStatus::Accepted),
        "rejected" => Ok(TransferStatus::Rejected),
        _ => anyhow::bail!("unknown transfer status: {value}"),
    }
}

fn transfer_status_to_str(status: &TransferStatus) -> &'static str {
    match status {
        TransferStatus::Available => "available",
        TransferStatus::Pending => "pending",
        TransferStatus::Accepted => "accepted",
        TransferStatus::Rejected => "rejected",
    }
}

pub fn generate_join_pin() -> String {
    let value = uuid::Uuid::new_v4().as_u128() % 1_000_000;
    format!("{value:06}")
}

pub fn hash_join_pin(pin: &str) -> anyhow::Result<String> {
    let salt = SaltString::generate(&mut OsRng);

    let hash = Argon2::default()
        .hash_password(pin.as_bytes(), &salt)
        .map_err(|error| anyhow::anyhow!("failed to hash join pin: {error}"))?
        .to_string();

    Ok(hash)
}

pub fn verify_join_pin(pin: &str, hash: &str) -> anyhow::Result<bool> {
    let parsed_hash = PasswordHash::new(hash)
        .map_err(|error| anyhow::anyhow!("failed to parse join pin hash: {error}"))?;

    Ok(Argon2::default()
        .verify_password(pin.as_bytes(), &parsed_hash)
        .is_ok())
}
