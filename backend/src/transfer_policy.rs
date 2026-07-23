use crate::models::{Transfer, TransferStatus};
use chrono::Utc;
use std::collections::HashSet;

pub fn can_view(transfer: &Transfer, device_id: &str, is_host: bool) -> bool {
    if is_host || transfer.target_device_id.is_none() {
        return true;
    }

    transfer.sender_device_id.as_deref() == Some(device_id)
        || transfer.target_device_id.as_deref() == Some(device_id)
}

pub fn can_download(transfer: &Transfer, device_id: &str, is_host: bool) -> bool {
    can_view(transfer, device_id, is_host)
        && !is_expired(transfer)
        && matches!(
            transfer.status,
            TransferStatus::Available | TransferStatus::Accepted
        )
}

pub fn can_delete(transfer: &Transfer, device_id: &str, is_host: bool) -> bool {
    is_host || transfer.sender_device_id.as_deref() == Some(device_id)
}

pub fn can_review(transfer: &Transfer, device_id: &str) -> bool {
    !is_expired(transfer)
        && transfer.status == TransferStatus::Pending
        && transfer.target_device_id.as_deref() == Some(device_id)
}

pub fn is_expired(transfer: &Transfer) -> bool {
    Utc::now() >= transfer.expires_at
}

pub fn event_devices(transfer: &Transfer, host_device_id: Option<&str>) -> Option<HashSet<String>> {
    transfer.target_device_id.as_ref()?;

    Some(
        [
            host_device_id,
            transfer.sender_device_id.as_deref(),
            transfer.target_device_id.as_deref(),
        ]
        .into_iter()
        .flatten()
        .map(str::to_string)
        .collect(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration;

    fn targeted(status: TransferStatus) -> Transfer {
        Transfer {
            id: "transfer".into(),
            filename: "private.txt".into(),
            mime_type: "text/plain".into(),
            size: 1,
            sender_device_id: Some("sender".into()),
            target_device_id: Some("target".into()),
            status,
            stored_path: "/private/server/path".into(),
            created_at: Utc::now(),
            expires_at: Utc::now() + Duration::hours(1),
        }
    }

    #[test]
    fn targeted_visibility_and_deletion_are_role_scoped() {
        let transfer = targeted(TransferStatus::Accepted);
        assert!(can_view(&transfer, "sender", false));
        assert!(can_view(&transfer, "target", false));
        assert!(can_view(&transfer, "host", true));
        assert!(!can_view(&transfer, "other", false));
        assert!(can_delete(&transfer, "sender", false));
        assert!(can_delete(&transfer, "host", true));
        assert!(!can_delete(&transfer, "target", false));
    }

    #[test]
    fn only_a_pending_target_can_review() {
        let transfer = targeted(TransferStatus::Pending);
        assert!(can_review(&transfer, "target"));
        assert!(!can_review(&transfer, "sender"));
        assert!(!can_download(&transfer, "target", false));
    }
}
