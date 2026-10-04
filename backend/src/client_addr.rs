//! Resolves which network address a request really came from.
//!
//! Drop Den is not meant to run behind a reverse proxy: a proxy makes every
//! client look like loopback. The single exception is development mode, where
//! the Vite dev server proxies LAN requests from 127.0.0.1. Only there, and
//! only when the TCP peer is loopback, is `X-Forwarded-For` consulted.

use axum::http::HeaderMap;
use std::net::IpAddr;

/// Returns the effective client address, or `None` when it cannot be trusted
/// or parsed. Callers must treat `None` as non-loopback.
pub fn effective_client_ip(
    peer: Option<IpAddr>,
    headers: &HeaderMap,
    trust_forwarded_for: bool,
) -> Option<IpAddr> {
    let peer = peer?.to_canonical();

    if !trust_forwarded_for || !peer.is_loopback() {
        return Some(peer);
    }

    // The dev proxy appends the real client address, so the rightmost entry is
    // the only one a LAN client cannot forge.
    let last_hop = headers
        .get_all("x-forwarded-for")
        .iter()
        .filter_map(|value| value.to_str().ok())
        .flat_map(|value| value.split(','))
        .map(str::trim)
        .next_back();

    match last_hop {
        None => Some(peer),
        Some(value) => value.parse::<IpAddr>().ok().map(|ip| ip.to_canonical()),
    }
}

pub fn is_loopback(peer: Option<IpAddr>, headers: &HeaderMap, trust_forwarded_for: bool) -> bool {
    effective_client_ip(peer, headers, trust_forwarded_for)
        .map(|ip| ip.is_loopback())
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn headers(values: &[&str]) -> HeaderMap {
        let mut map = HeaderMap::new();
        for value in values {
            map.append("x-forwarded-for", value.parse().unwrap());
        }
        map
    }

    fn ip(value: &str) -> Option<IpAddr> {
        Some(value.parse().unwrap())
    }

    #[test]
    fn missing_peer_is_never_loopback() {
        assert!(!is_loopback(None, &HeaderMap::new(), true));
        assert!(!is_loopback(None, &HeaderMap::new(), false));
    }

    #[test]
    fn forwarded_header_is_ignored_unless_trusted() {
        let spoofed = headers(&["127.0.0.1"]);
        assert!(!is_loopback(ip("192.168.1.20"), &spoofed, true));
        assert!(!is_loopback(ip("192.168.1.20"), &spoofed, false));
        let lan = headers(&["192.168.1.20"]);
        assert!(is_loopback(ip("127.0.0.1"), &lan, false));
    }

    #[test]
    fn trusted_proxy_uses_the_rightmost_entry() {
        assert!(!is_loopback(
            ip("127.0.0.1"),
            &headers(&["192.168.1.20"]),
            true
        ));
        assert!(!is_loopback(
            ip("127.0.0.1"),
            &headers(&["127.0.0.1, 192.168.1.20"]),
            true
        ));
        assert!(!is_loopback(
            ip("127.0.0.1"),
            &headers(&["127.0.0.1", "192.168.1.20"]),
            true
        ));
        assert!(is_loopback(ip("127.0.0.1"), &headers(&["::1"]), true));
        assert!(is_loopback(ip("::1"), &HeaderMap::new(), true));
    }

    #[test]
    fn malformed_forwarded_header_fails_closed() {
        assert!(!is_loopback(
            ip("127.0.0.1"),
            &headers(&["not-an-ip"]),
            true
        ));
    }

    #[test]
    fn ipv4_mapped_loopback_is_loopback() {
        assert!(is_loopback(
            ip("::ffff:127.0.0.1"),
            &HeaderMap::new(),
            false
        ));
    }
}
