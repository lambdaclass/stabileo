use std::net::SocketAddr;

use crate::providers::claude::ClaudeProvider;
use crate::providers::gemini::GeminiProvider;
use crate::providers::openai_compat::OpenAiCompatProvider;
use crate::providers::traits::Provider;

pub struct Config {
    pub dedaliano_api_key: String,
    pub provider: Provider,
    pub addr: SocketAddr,
    pub allowed_origins: Vec<String>,
    pub log_format: LogFormat,
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

        Self {
            dedaliano_api_key: std::env::var("DEDALIANO_API_KEY")
                .expect("DEDALIANO_API_KEY must be set"),
            provider,
            addr,
            allowed_origins,
            log_format,
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
