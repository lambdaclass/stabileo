use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Instant;

use crate::error::ProviderError;
use super::traits::{AiRequest, AiResponse};

/// Shared adapter for OpenAI-compatible APIs (OpenAI, DeepSeek, Mistral, Kimi/Moonshot).
pub struct OpenAiCompatProvider {
    client: Client,
    base_url: String,
    api_key: String,
    model: String,
}

impl OpenAiCompatProvider {
    pub fn new(base_url: String, api_key: String, model: String) -> Self {
        Self {
            client: Client::new(),
            base_url,
            api_key,
            model,
        }
    }

    pub fn openai(api_key: String, model: String) -> Self {
        Self::new("https://api.openai.com/v1".into(), api_key, model)
    }

    pub fn deepseek(api_key: String, model: String) -> Self {
        Self::new("https://api.deepseek.com/v1".into(), api_key, model)
    }

    pub fn mistral(api_key: String, model: String) -> Self {
        Self::new("https://api.mistral.ai/v1".into(), api_key, model)
    }

    pub fn kimi(api_key: String, model: String) -> Self {
        Self::new("https://api.moonshot.cn/v1".into(), api_key, model)
    }

    pub async fn complete(&self, req: AiRequest) -> Result<AiResponse, ProviderError> {
        let start = Instant::now();

        let body = ChatRequest {
            model: &self.model,
            max_tokens: req.max_tokens,
            temperature: req.temperature,
            messages: vec![
                ChatMessage {
                    role: "system",
                    content: &req.system_prompt,
                },
                ChatMessage {
                    role: "user",
                    content: &req.user_message,
                },
            ],
        };

        let resp = self
            .client
            .post(format!("{}/chat/completions", self.base_url))
            .header("Authorization", format!("Bearer {}", self.api_key))
            .json(&body)
            .send()
            .await?;

        let status = resp.status().as_u16();
        if status != 200 {
            let body = resp.text().await.unwrap_or_default();
            return Err(ProviderError::Api { status, body });
        }

        let parsed: ChatResponse = resp
            .json()
            .await
            .map_err(|e| ProviderError::Parse(e.to_string()))?;

        let choice = parsed
            .choices
            .into_iter()
            .next()
            .ok_or_else(|| ProviderError::Parse("no choices in response".into()))?;

        Ok(AiResponse {
            content: choice.message.content,
            model: parsed.model,
            input_tokens: parsed.usage.prompt_tokens,
            output_tokens: parsed.usage.completion_tokens,
            latency_ms: start.elapsed().as_millis() as u64,
        })
    }
}

#[derive(Serialize)]
struct ChatRequest<'a> {
    model: &'a str,
    max_tokens: u32,
    temperature: f32,
    messages: Vec<ChatMessage<'a>>,
}

#[derive(Serialize)]
struct ChatMessage<'a> {
    role: &'a str,
    content: &'a str,
}

#[derive(Deserialize)]
struct ChatResponse {
    model: String,
    choices: Vec<Choice>,
    usage: ChatUsage,
}

#[derive(Deserialize)]
struct Choice {
    message: ResponseMessage,
}

#[derive(Deserialize)]
struct ResponseMessage {
    content: String,
}

#[derive(Deserialize)]
struct ChatUsage {
    prompt_tokens: u32,
    completion_tokens: u32,
}
