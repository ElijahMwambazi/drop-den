ALTER TABLE devices ADD COLUMN session_token_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_session_token_hash
ON devices(session_token_hash)
WHERE session_token_hash IS NOT NULL;

-- Legacy device IDs were accepted as credentials. Revoke every legacy device
-- and remove content whose authorization depended on those identities.
DELETE FROM transfers;
DELETE FROM messages;
DELETE FROM devices;
DELETE FROM app_settings WHERE key = 'host_device_id';

INSERT INTO app_settings (key, value, updated_at)
VALUES ('auth_scheme_version', '1', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET
    value = excluded.value,
    updated_at = CURRENT_TIMESTAMP;
