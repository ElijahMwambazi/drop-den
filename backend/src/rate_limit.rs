use std::{
    collections::{HashMap, VecDeque},
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::Mutex;

#[derive(Clone, Default)]
pub struct RateLimiter {
    attempts: Arc<Mutex<HashMap<String, VecDeque<Instant>>>>,
}

impl RateLimiter {
    pub async fn check(&self, key: String, maximum: usize, window: Duration) -> bool {
        let now = Instant::now();
        let cutoff = now.checked_sub(window).unwrap_or(now);
        let mut attempts = self.attempts.lock().await;
        let entries = attempts.entry(key).or_default();
        while entries.front().is_some_and(|attempt| *attempt < cutoff) {
            entries.pop_front();
        }
        if entries.len() >= maximum {
            return false;
        }
        entries.push_back(now);
        true
    }
}
