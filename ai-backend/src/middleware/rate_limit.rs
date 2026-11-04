//! Per-client rate limiting and a global concurrency cap for the AI routes.
//!
//! Every AI request costs money at the provider and holds a connection open
//! for up to the provider timeout. The bearer token alone does not bound that:
//! a browser client has to carry it, so anyone who can load the web app can
//! read it. These limits keep one client from exhausting the provider budget
//! or the server's connection pool.

use std::collections::HashMap;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use axum::extract::{ConnectInfo, Request, State};
use axum::middleware::Next;
use axum::response::Response;
use tokio::sync::Semaphore;

use crate::error::AppError;

const WINDOW: Duration = Duration::from_secs(60);
/// Above this many tracked clients, expired windows are dropped on insert so
/// the table cannot grow without bound under a spray of source addresses.
const PRUNE_THRESHOLD: usize = 10_000;

#[derive(Clone, Debug)]
pub struct RateLimitConfig {
    /// Requests per client per minute. 0 disables the per-client limit.
    pub per_minute: u32,
    /// AI requests in flight at once across all clients.
    pub max_concurrent: usize,
    /// Take the client address from `X-Real-IP` (set by the reverse proxy in
    /// nginx.conf). Only enable when the backend is reachable solely through
    /// that proxy; otherwise a client can choose its own bucket.
    pub trust_proxy_headers: bool,
}

pub struct RateLimiter {
    config: RateLimitConfig,
    windows: Mutex<HashMap<IpAddr, (Instant, u32)>>,
    in_flight: Semaphore,
}

impl RateLimiter {
    pub fn new(config: RateLimitConfig) -> Arc<Self> {
        let permits = config.max_concurrent.max(1);
        Arc::new(Self {
            config,
            windows: Mutex::new(HashMap::new()),
            in_flight: Semaphore::new(permits),
        })
    }

    /// Count one request for `ip`. Returns the seconds until the window resets
    /// when the client is over its limit.
    fn check(&self, ip: IpAddr, now: Instant) -> Result<(), u64> {
        if self.config.per_minute == 0 {
            return Ok(());
        }
        let mut windows = self.windows.lock().unwrap_or_else(|e| e.into_inner());
        if windows.len() >= PRUNE_THRESHOLD {
            windows.retain(|_, (start, _)| now.duration_since(*start) < WINDOW);
        }
        let entry = windows.entry(ip).or_insert((now, 0));
        if now.duration_since(entry.0) >= WINDOW {
            *entry = (now, 0);
        }
        if entry.1 >= self.config.per_minute {
            let remaining = WINDOW.saturating_sub(now.duration_since(entry.0));
            return Err(remaining.as_secs().max(1));
        }
        entry.1 += 1;
        Ok(())
    }

    fn client_ip(&self, req: &Request) -> IpAddr {
        if self.config.trust_proxy_headers {
            if let Some(ip) = req
                .headers()
                .get("x-real-ip")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.trim().parse::<IpAddr>().ok())
            {
                return ip;
            }
        }
        req.extensions()
            .get::<ConnectInfo<SocketAddr>>()
            .map(|ci| ci.0.ip())
            .unwrap_or(IpAddr::V4(Ipv4Addr::UNSPECIFIED))
    }
}

pub async fn rate_limit(
    State(limiter): State<Arc<RateLimiter>>,
    req: Request,
    next: Next,
) -> Result<Response, AppError> {
    let ip = limiter.client_ip(&req);
    limiter
        .check(ip, Instant::now())
        .map_err(|retry_after| AppError::RateLimited { retry_after })?;
    let _permit = limiter
        .in_flight
        .try_acquire()
        .map_err(|_| AppError::Busy)?;
    Ok(next.run(req).await)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn limiter(per_minute: u32) -> Arc<RateLimiter> {
        RateLimiter::new(RateLimitConfig {
            per_minute,
            max_concurrent: 4,
            trust_proxy_headers: false,
        })
    }

    #[test]
    fn limits_each_client_separately_and_resets_after_window() {
        let l = limiter(2);
        let a: IpAddr = "10.0.0.1".parse().unwrap();
        let b: IpAddr = "10.0.0.2".parse().unwrap();
        let t0 = Instant::now();
        assert!(l.check(a, t0).is_ok());
        assert!(l.check(a, t0).is_ok());
        assert!(l.check(a, t0).is_err());
        assert!(l.check(b, t0).is_ok());
        assert!(l.check(a, t0 + WINDOW).is_ok());
    }

    #[test]
    fn zero_disables_the_per_client_limit() {
        let l = limiter(0);
        let a: IpAddr = "10.0.0.1".parse().unwrap();
        for _ in 0..100 {
            assert!(l.check(a, Instant::now()).is_ok());
        }
    }
}
