use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Instant;

use crate::error::ProviderError;
use super::traits::{AiRequest, AiResponse, AiRole, ImageAttachment, ToolCall};

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


        let messages: Vec<MessageOwned> = if req.messages.is_empty() {
            vec![build_user_message(&req.user_message, &req.images)]
        } else {
            let mut msgs: Vec<MessageOwned> = req.messages.iter().map(|m| MessageOwned {
                role: match m.role {
                    AiRole::User => "user".into(),
                    AiRole::Assistant => "assistant".into(),
                },
                content: MessageContent::Text(m.content.clone()),
            }).collect();
            // Attach images to the last user message if present
            if !req.images.is_empty() {
                if let Some(last_user) = msgs.iter_mut().rev().find(|m| m.role == "user") {
                    let text = match &last_user.content {
                        MessageContent::Text(t) => t.clone(),
                        MessageContent::Blocks(blocks) => blocks.iter()
                            .filter_map(|b| if let ContentBlockOut::Text { text } = b { Some(text.as_str()) } else { None })
                            .collect::<Vec<_>>().join(""),
                    };
                    let mut blocks = Vec::new();
                    for img in &req.images {
                        blocks.push(ContentBlockOut::Image {
                            source: ImageSource {
                                r#type: "base64".into(),
                                media_type: img.media_type.clone(),
                                data: img.data.clone(),
                            },
                        });
                    }
                    blocks.push(ContentBlockOut::Text { text });
                    last_user.content = MessageContent::Blocks(blocks);
                }
            }
            msgs
        };

        let tools_owned: Option<Vec<ClaudeToolOwned>> = if req.tools.is_empty() {
            None
        } else {
            Some(req.tools.iter().map(|t| ClaudeToolOwned {
                name: t.name.clone(),
                description: t.description.clone(),
                input_schema: t.parameters.clone(),
            }).collect())
        };

        let body = AnthropicRequest {
            model: self.model.clone(),
            max_tokens: req.max_tokens,
            temperature: req.temperature,
            system: req.system_prompt.clone(),
            messages,
            tools: tools_owned,
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

// ─── Multimodal message builder ───────────────────────────────

fn build_user_message(text: &str, images: &[ImageAttachment]) -> MessageOwned {
    if images.is_empty() {
        return MessageOwned {
            role: "user".into(),
            content: MessageContent::Text(text.into()),
        };
    }
    let mut blocks = Vec::new();
    for img in images {
        blocks.push(ContentBlockOut::Image {
            source: ImageSource {
                r#type: "base64".into(),
                media_type: img.media_type.clone(),
                data: img.data.clone(),
            },
        });
    }
    blocks.push(ContentBlockOut::Text { text: text.into() });
    MessageOwned {
        role: "user".into(),
        content: MessageContent::Blocks(blocks),
    }
}

// ─── Request types ─────────────────────────────────────────────

#[derive(Serialize)]
struct AnthropicRequest {
    model: String,
    max_tokens: u32,
    temperature: f32,
    system: String,
    messages: Vec<MessageOwned>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<ClaudeToolOwned>>,
}

#[derive(Serialize)]
struct MessageOwned {
    role: String,
    content: MessageContent,
}

#[derive(Serialize)]
#[serde(untagged)]
enum MessageContent {
    Text(String),
    Blocks(Vec<ContentBlockOut>),
}

#[derive(Serialize)]
#[serde(tag = "type")]
enum ContentBlockOut {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "image")]
    Image { source: ImageSource },
}

#[derive(Serialize)]
struct ImageSource {
    r#type: String,
    media_type: String,
    data: String,
}

#[derive(Serialize)]
struct ClaudeToolOwned {
    name: String,
    description: String,
    input_schema: Value,
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
