use std::net::SocketAddr;

use crate::app::DEFAULT_MAX_BODY_BYTES;
use crate::middleware::rate_limit::RateLimitConfig;

use crate::providers::claude::ClaudeProvider;
use crate::providers::gemini::GeminiProvider;
use crate::providers::openai_compat::OpenAiCompatProvider;
use crate::providers::traits::Provider;

pub struct Config {
    pub dedaliano_api_key: String,
    pub provider: Provider,
    pub provider_timeout_secs: u64,
    pub addr: SocketAddr,
    pub allowed_origins: Vec<String>,
    pub log_format: LogFormat,
    pub rate_limit: RateLimitConfig,
    pub max_body_bytes: usize,
}

/// Shortest accepted `DEDALIANO_API_KEY`. An empty key would accept
/// "Authorization: Bearer " and a short one can be guessed.
pub const MIN_API_KEY_LEN: usize = 16;

pub fn validate_api_key(key: &str) -> Result<(), String> {
    if key == "your-api-key-here" {
        return Err("DEDALIANO_API_KEY is still the .env.example placeholder".into());
    }
    if key.trim().len() < MIN_API_KEY_LEN {
        return Err(format!(
            "DEDALIANO_API_KEY must be at least {MIN_API_KEY_LEN} characters"
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::validate_api_key;

    #[test]
    fn api_key_must_be_long_and_not_the_placeholder() {
        assert!(validate_api_key("").is_err());
        assert!(validate_api_key("short").is_err());
        assert!(validate_api_key("                    ").is_err());
        assert!(validate_api_key("your-api-key-here").is_err());
        assert!(validate_api_key("f3b1c9e07a5d4c2b8e6f").is_ok());
    }
}

fn env_parse<T: std::str::FromStr>(name: &str, default: T) -> T {
    std::env::var(name)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

pub enum LogFormat {
    Pretty,
    Json,
}

impl Config {
    pub fn from_env() -> Self {
        let host = std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".into());
        let port: u16 = std::env::var("PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(3001);
        let addr: SocketAddr = format!("{host}:{port}").parse().expect("valid address");

        let allowed_origins = std::env::var("ALLOWED_ORIGINS")
            .unwrap_or_else(|_| "https://stabileo.com,https://dedaliano.com".into())
            .split(',')
            .map(|s| s.trim().to_string())
            .collect();

        let log_format = match std::env::var("LOG_FORMAT").as_deref() {
            Ok("json") => LogFormat::Json,
            _ => LogFormat::Pretty,
        };

        let ai_provider = std::env::var("AI_PROVIDER").unwrap_or_else(|_| "claude".into());
        let provider = build_provider(&ai_provider);

        let provider_timeout_secs: u64 = std::env::var("PROVIDER_TIMEOUT_SECS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(90);

        let dedaliano_api_key =
            std::env::var("DEDALIANO_API_KEY").expect("DEDALIANO_API_KEY must be set");
        if let Err(e) = validate_api_key(&dedaliano_api_key) {
            panic!("{e}");
        }

        let rate_limit = RateLimitConfig {
            per_minute: env_parse("RATE_LIMIT_PER_MINUTE", 20),
            max_concurrent: env_parse("MAX_CONCURRENT_AI_REQUESTS", 8),
            trust_proxy_headers: matches!(
                std::env::var("TRUST_PROXY_HEADERS").as_deref(),
                Ok("1" | "true")
            ),
        };
        let max_body_bytes = env_parse("MAX_BODY_BYTES", DEFAULT_MAX_BODY_BYTES);

        Self {
            dedaliano_api_key,
            provider,
            provider_timeout_secs,
            addr,
            allowed_origins,
            log_format,
            rate_limit,
            max_body_bytes,
        }
    }
}

fn env_key(name: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| panic!("{name} must be set"))
}

fn build_provider(name: &str) -> Provider {
    match name {
        "claude" => {
            let api_key = env_key("ANTHROPIC_API_KEY");
            let model = std::env::var("AI_MODEL")
                .unwrap_or_else(|_| "claude-sonnet-4-20250514".into());
            Provider::Claude(ClaudeProvider::new(api_key, model))
        }
        "openai" => {
            let api_key = env_key("OPENAI_API_KEY");
            let model =
                std::env::var("AI_MODEL").unwrap_or_else(|_| "gpt-4o".into());
            Provider::OpenAi(OpenAiCompatProvider::openai(api_key, model))
        }
        "deepseek" => {
            let api_key = env_key("DEEPSEEK_API_KEY");
            let model =
                std::env::var("AI_MODEL").unwrap_or_else(|_| "deepseek-chat".into());
            Provider::DeepSeek(OpenAiCompatProvider::deepseek(api_key, model))
        }
        "mistral" => {
            let api_key = env_key("MISTRAL_API_KEY");
            let model = std::env::var("AI_MODEL")
                .unwrap_or_else(|_| "mistral-large-latest".into());
            Provider::Mistral(OpenAiCompatProvider::mistral(api_key, model))
        }
        "kimi" => {
            let api_key = env_key("KIMI_API_KEY");
            let model = std::env::var("AI_MODEL")
                .unwrap_or_else(|_| "kimi-k2-0711-preview".into());
            Provider::Kimi(OpenAiCompatProvider::kimi(api_key, model))
        }
        "gemini" => {
            let api_key = env_key("GEMINI_API_KEY");
            let model = std::env::var("AI_MODEL")
                .unwrap_or_else(|_| "gemini-2.5-flash".into());
            Provider::Gemini(GeminiProvider::new(api_key, model))
        }
        other => panic!("unknown AI_PROVIDER: {other} (valid: claude, openai, deepseek, mistral, kimi, gemini)"),
    }
}
