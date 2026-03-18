use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Instant;

use crate::error::ProviderError;
use super::traits::{AiRequest, AiResponse, AiRole};

pub struct GeminiProvider {
    client: Client,
    api_key: String,
    model: String,
}

impl GeminiProvider {
    pub fn new(api_key: String, model: String) -> Self {
        Self {
            client: Client::new(),
            api_key,
            model,
        }
    }

    pub async fn complete(&self, req: AiRequest) -> Result<AiResponse, ProviderError> {
        let start = Instant::now();

        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
            self.model, self.api_key,
        );

        let body = GeminiRequest {
            system_instruction: SystemInstruction {
                parts: vec![Part {
                    text: &req.system_prompt,
                }],
            },
            contents: if req.messages.is_empty() {
                vec![Content {
                    role: "user",
                    parts: vec![Part {
                        text: &req.user_message,
                    }],
                }]
            } else {
                req.messages.iter().map(|m| Content {
                    role: match m.role {
                        AiRole::User => "user",
                        AiRole::Assistant => "model",
                    },
                    parts: vec![Part { text: &m.content }],
                }).collect()
            },
            generation_config: GenerationConfig {
                max_output_tokens: req.max_tokens,
                temperature: req.temperature,
            },
        };

        let resp = self
            .client
            .post(&url)
            .json(&body)
            .send()
            .await?;

        let status = resp.status().as_u16();
        if status != 200 {
            let body = resp.text().await.unwrap_or_default();
            return Err(ProviderError::Api { status, body });
        }

        let parsed: GeminiResponse = resp
            .json()
            .await
            .map_err(|e| ProviderError::Parse(e.to_string()))?;

        let content = parsed
            .candidates
            .into_iter()
            .next()
            .and_then(|c| c.content.parts.into_iter().next())
            .map(|p| p.text)
            .unwrap_or_default();

        let (input_tokens, output_tokens) = parsed
            .usage_metadata
            .map(|u| (u.prompt_token_count, u.candidates_token_count))
            .unwrap_or((0, 0));

        // Gemini tool calling not yet implemented — tools in request are ignored.
        Ok(AiResponse {
            content,
            model: self.model.clone(),
            input_tokens,
            output_tokens,
            latency_ms: start.elapsed().as_millis() as u64,
            tool_calls: vec![],
        })
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GeminiRequest<'a> {
    system_instruction: SystemInstruction<'a>,
    contents: Vec<Content<'a>>,
    generation_config: GenerationConfig,
}

#[derive(Serialize)]
struct SystemInstruction<'a> {
    parts: Vec<Part<'a>>,
}

#[derive(Serialize)]
struct Content<'a> {
    role: &'a str,
    parts: Vec<Part<'a>>,
}

#[derive(Serialize)]
struct Part<'a> {
    text: &'a str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GenerationConfig {
    max_output_tokens: u32,
    temperature: f32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiResponse {
    candidates: Vec<Candidate>,
    usage_metadata: Option<UsageMetadata>,
}

#[derive(Deserialize)]
struct Candidate {
    content: ResponseContent,
}

#[derive(Deserialize)]
struct ResponseContent {
    parts: Vec<ResponsePart>,
}

#[derive(Deserialize)]
struct ResponsePart {
    text: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UsageMetadata {
    prompt_token_count: u32,
    candidates_token_count: u32,
}
