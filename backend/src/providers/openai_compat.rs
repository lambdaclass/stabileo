use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Instant;

use crate::error::ProviderError;
use super::traits::{AiRequest, AiResponse, ToolCall};

/// Shared adapter for OpenAI-compatible APIs (OpenAI, DeepSeek, Mistral, Kimi).
pub struct OpenAiCompatProvider {
    client: Client,
    base_url: String,
    api_key: String,
    model: String,
    extra_headers: Vec<(&'static str, String)>,
}

impl OpenAiCompatProvider {
    fn build(base_url: String, api_key: String, model: String, extra_headers: Vec<(&'static str, String)>) -> Self {
        Self {
            client: Client::new(),
            base_url,
            api_key,
            model,
            extra_headers,
        }
    }

    pub fn new(base_url: String, api_key: String, model: String) -> Self {
        Self::build(base_url, api_key, model, vec![])
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
        Self::build(
            "https://api.kimi.com/coding/v1".into(),
            api_key,
            model,
            vec![("User-Agent", "claude-code/1.0".into())],
        )
    }

    pub async fn complete(&self, req: AiRequest) -> Result<AiResponse, ProviderError> {
        let start = Instant::now();

        let tools: Option<Vec<ChatTool>> = if req.tools.is_empty() {
            None
        } else {
            Some(req.tools.iter().map(|t| ChatTool {
                r#type: "function",
                function: ChatFunction {
                    name: &t.name,
                    description: &t.description,
                    parameters: &t.parameters,
                },
            }).collect())
        };

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
            tools,
        };

        let mut request = self
            .client
            .post(format!("{}/chat/completions", self.base_url))
            .header("Authorization", format!("Bearer {}", self.api_key));

        for (key, value) in &self.extra_headers {
            request = request.header(*key, value);
        }

        let resp = request.json(&body).send().await?;

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

        // Extract tool calls if present
        let tool_calls: Vec<ToolCall> = choice
            .message
            .tool_calls
            .unwrap_or_default()
            .into_iter()
            .map(|tc| ToolCall {
                name: tc.function.name,
                arguments: tc.function.arguments,
            })
            .collect();

        // Kimi Code returns content in reasoning_content, with content often empty
        let content = if choice.message.content.is_empty() {
            choice.message.reasoning_content.unwrap_or_default()
        } else {
            choice.message.content
        };

        Ok(AiResponse {
            content,
            model: parsed.model,
            input_tokens: parsed.usage.prompt_tokens,
            output_tokens: parsed.usage.completion_tokens,
            latency_ms: start.elapsed().as_millis() as u64,
            tool_calls,
        })
    }
}

// ─── Request types ─────────────────────────────────────────────

#[derive(Serialize)]
struct ChatRequest<'a> {
    model: &'a str,
    max_tokens: u32,
    temperature: f32,
    messages: Vec<ChatMessage<'a>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<ChatTool<'a>>>,
}

#[derive(Serialize)]
struct ChatMessage<'a> {
    role: &'a str,
    content: &'a str,
}

#[derive(Serialize)]
struct ChatTool<'a> {
    r#type: &'a str,
    function: ChatFunction<'a>,
}

#[derive(Serialize)]
struct ChatFunction<'a> {
    name: &'a str,
    description: &'a str,
    parameters: &'a Value,
}

// ─── Response types ────────────────────────────────────────────

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
    #[serde(default)]
    content: String,
    #[serde(default)]
    reasoning_content: Option<String>,
    #[serde(default)]
    tool_calls: Option<Vec<ResponseToolCall>>,
}

#[derive(Deserialize)]
struct ResponseToolCall {
    function: ResponseFunction,
}

#[derive(Deserialize)]
struct ResponseFunction {
    name: String,
    arguments: String,
}

#[derive(Deserialize)]
struct ChatUsage {
    prompt_tokens: u32,
    completion_tokens: u32,
}
