CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    connected_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY NOT NULL,
    sender_device_id TEXT,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (sender_device_id) REFERENCES devices(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS transfers (
    id TEXT PRIMARY KEY NOT NULL,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    sender_device_id TEXT,
    target_device_id TEXT,
    status TEXT NOT NULL CHECK (
        status IN ('available', 'pending', 'accepted', 'rejected')
    ),
    stored_path TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (sender_device_id) REFERENCES devices(id) ON DELETE SET NULL,
    FOREIGN KEY (target_device_id) REFERENCES devices(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_created_at
ON messages(created_at);

CREATE INDEX IF NOT EXISTS idx_transfers_created_at
ON transfers(created_at);

CREATE INDEX IF NOT EXISTS idx_transfers_expires_at
ON transfers(expires_at);

CREATE INDEX IF NOT EXISTS idx_transfers_sender_device_id
ON transfers(sender_device_id);

CREATE INDEX IF NOT EXISTS idx_transfers_target_device_id
ON transfers(target_device_id);