pub const TRANSFER_TTL_SETTING_KEY: &str = "transfer_ttl_seconds";
pub const DEFAULT_TRANSFER_TTL_SECONDS: u64 = 24 * 60 * 60;
pub const MIN_TRANSFER_TTL_SECONDS: u64 = 60 * 60;
pub const MAX_TRANSFER_TTL_SECONDS: u64 = 30 * 24 * 60 * 60;
pub const DEFAULT_MAX_FILE_BYTES: u64 = 1024 * 1024 * 1024;
pub const DEFAULT_MAX_BATCH_BYTES: u64 = 4 * 1024 * 1024 * 1024;
pub const DEFAULT_MAX_STORAGE_BYTES: u64 = 50 * 1024 * 1024 * 1024;
pub const DEFAULT_MAX_FILES_PER_BATCH: usize = 50;

#[derive(Debug, Clone, Copy)]
pub struct ResourceLimits {
    pub max_file_bytes: u64,
    pub max_batch_bytes: u64,
    pub max_storage_bytes: u64,
    pub max_files_per_batch: usize,
}

impl Default for ResourceLimits {
    fn default() -> Self {
        Self {
            max_file_bytes: DEFAULT_MAX_FILE_BYTES,
            max_batch_bytes: DEFAULT_MAX_BATCH_BYTES,
            max_storage_bytes: DEFAULT_MAX_STORAGE_BYTES,
            max_files_per_batch: DEFAULT_MAX_FILES_PER_BATCH,
        }
    }
}

impl ResourceLimits {
    pub fn from_environment() -> Self {
        Self {
            max_file_bytes: env_u64("DROP_DEN_MAX_FILE_BYTES", DEFAULT_MAX_FILE_BYTES),
            max_batch_bytes: env_u64("DROP_DEN_MAX_BATCH_BYTES", DEFAULT_MAX_BATCH_BYTES),
            max_storage_bytes: env_u64("DROP_DEN_MAX_STORAGE_BYTES", DEFAULT_MAX_STORAGE_BYTES),
            max_files_per_batch: env_u64(
                "DROP_DEN_MAX_FILES_PER_BATCH",
                DEFAULT_MAX_FILES_PER_BATCH as u64,
            )
            .min(usize::MAX as u64) as usize,
        }
    }
}

pub fn valid_transfer_ttl_seconds(value: u64) -> bool {
    (MIN_TRANSFER_TTL_SECONDS..=MAX_TRANSFER_TTL_SECONDS).contains(&value)
}

fn env_u64(name: &str, default: u64) -> u64 {
    std::env::var(name)
        .ok()
        .and_then(|value| value.parse().ok())
        .filter(|value| *value > 0)
        .unwrap_or(default)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transfer_ttl_bounds_are_inclusive() {
        assert!(!valid_transfer_ttl_seconds(MIN_TRANSFER_TTL_SECONDS - 1));
        assert!(valid_transfer_ttl_seconds(MIN_TRANSFER_TTL_SECONDS));
        assert!(valid_transfer_ttl_seconds(MAX_TRANSFER_TTL_SECONDS));
        assert!(!valid_transfer_ttl_seconds(MAX_TRANSFER_TTL_SECONDS + 1));
    }
}
