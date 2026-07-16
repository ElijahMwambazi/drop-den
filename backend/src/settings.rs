pub const TRANSFER_TTL_SETTING_KEY: &str = "transfer_ttl_seconds";
pub const DEFAULT_TRANSFER_TTL_SECONDS: u64 = 24 * 60 * 60;
pub const MIN_TRANSFER_TTL_SECONDS: u64 = 60 * 60;
pub const MAX_TRANSFER_TTL_SECONDS: u64 = 30 * 24 * 60 * 60;

pub fn valid_transfer_ttl_seconds(value: u64) -> bool {
    (MIN_TRANSFER_TTL_SECONDS..=MAX_TRANSFER_TTL_SECONDS).contains(&value)
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
