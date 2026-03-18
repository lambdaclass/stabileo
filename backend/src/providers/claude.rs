use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Instant;

use crate::error::ProviderError;
use super::traits::{AiRequest, AiResponse, AiRole, ToolCall};

pub struct ClaudeProvider {
    client: Client,
    api_key: String,
    model: String,
}

impl ClaudeProvider {
    pub fn new(api_key: String, model: String) -> Self {
        Self {
            client: Client::new(),
            api_key,
            model,
        }
    }

    pub async fn complete(&self, req: AiRequest) -> Result<AiResponse, ProviderError> {
        let start = Instant::now();

        let tools: Option<Vec<ClaudeTool>> = if req.tools.is_empty() {
            None
        } else {
            Some(req.tools.iter().map(|t| ClaudeTool {
                name: &t.name,
                description: &t.description,
                input_schema: &t.parameters,
            }).collect())
        };

        let messages = if req.messages.is_empty() {
            vec![Message {
                role: "user",
                content: &req.user_message,
            }]
        } else {
            req.messages.iter().map(|m| Message {
                role: match m.role {
                    AiRole::User => "user",
                    AiRole::Assistant => "assistant",
                },
                content: &m.content,
            }).collect()
        };

        let body = AnthropicRequest {
            model: &self.model,
            max_tokens: req.max_tokens,
            temperature: req.temperature,
            system: &req.system_prompt,
            messages,
            tools,
        };

        let resp = self
            .client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&body)
            .send()
            .await?;

        let status = resp.status().as_u16();
        if status != 200 {
            let body = resp.text().await.unwrap_or_default();
            return Err(ProviderError::Api { status, body });
        }

        let parsed: AnthropicResponse = resp
            .json()
            .await
            .map_err(|e| ProviderError::Parse(e.to_string()))?;

        let mut content_parts = Vec::new();
        let mut tool_calls = Vec::new();

        for block in parsed.content {
            match block.r#type.as_str() {
                "text" => {
                    if let Some(text) = block.text {
                        content_parts.push(text);
                    }
                }
                "tool_use" => {
                    if let (Some(name), Some(input)) = (block.name, block.input) {
                        tool_calls.push(ToolCall {
                            name,
                            arguments: serde_json::to_string(&input)
                                .unwrap_or_default(),
                        });
                    }
                }
                _ => {}
            }
        }

        Ok(AiResponse {
            content: content_parts.join(""),
            model: parsed.model,
            input_tokens: parsed.usage.input_tokens,
            output_tokens: parsed.usage.output_tokens,
            latency_ms: start.elapsed().as_millis() as u64,
            tool_calls,
        })
    }
}

// ─── Request types ─────────────────────────────────────────────

#[derive(Serialize)]
struct AnthropicRequest<'a> {
    model: &'a str,
    max_tokens: u32,
    temperature: f32,
    system: &'a str,
    messages: Vec<Message<'a>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<ClaudeTool<'a>>>,
}

#[derive(Serialize)]
struct Message<'a> {
    role: &'a str,
    content: &'a str,
}

#[derive(Serialize)]
struct ClaudeTool<'a> {
    name: &'a str,
    description: &'a str,
    input_schema: &'a Value,
}

// ─── Response types ────────────────────────────────────────────

#[derive(Deserialize)]
struct AnthropicResponse {
    model: String,
    content: Vec<ContentBlock>,
    usage: Usage,
}

#[derive(Deserialize)]
struct ContentBlock {
    r#type: String,
    #[serde(default)]
    text: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    input: Option<Value>,
}

#[derive(Deserialize)]
struct Usage {
    input_tokens: u32,
    output_tokens: u32,
}
