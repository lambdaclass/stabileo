use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::ProviderError;

// ─── Multi-turn messages ───────────────────────────────────────

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AiMessage {
    pub role: AiRole,
    pub content: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AiRole {
    User,
    Assistant,
}

// ─── Tool-call contract (provider-agnostic) ────────────────────

/// A tool the LLM can choose to call.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ToolDef {
    pub name: String,
    pub description: String,
    /// JSON Schema for the tool's parameters.
    pub parameters: Value,
}

/// A tool call the LLM chose to make.
#[derive(Clone, Debug)]
pub struct ToolCall {
    pub name: String,
    /// Raw JSON string of arguments.
    pub arguments: String,
}

// ─── Request / Response ────────────────────────────────────────

pub struct AiRequest {
    pub system_prompt: String,
    pub user_message: String,
    /// Multi-turn conversation history. When non-empty, providers use this
    /// instead of a single `user_message`.
    pub messages: Vec<AiMessage>,
    pub max_tokens: u32,
    pub temperature: f32,
    /// When non-empty, the LLM may call one of these tools instead of
    /// replying with plain text.
    pub tools: Vec<ToolDef>,
}

pub struct AiResponse {
    pub content: String,
    pub model: String,
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub latency_ms: u64,
    /// Non-empty when the LLM chose to call a tool.
    pub tool_calls: Vec<ToolCall>,
}

// ─── Provider dispatch ─────────────────────────────────────────

pub enum Provider {
    Claude(super::claude::ClaudeProvider),
    OpenAi(super::openai_compat::OpenAiCompatProvider),
    DeepSeek(super::openai_compat::OpenAiCompatProvider),
    Mistral(super::openai_compat::OpenAiCompatProvider),
    Kimi(super::openai_compat::OpenAiCompatProvider),
    Gemini(super::gemini::GeminiProvider),
    #[cfg(any(test, feature = "test-support"))]
    Stub(StubProvider),
}

impl Provider {
    pub async fn complete(&self, req: AiRequest) -> Result<AiResponse, ProviderError> {
        match self {
            Provider::Claude(p) => p.complete(req).await,
            Provider::OpenAi(p)
            | Provider::DeepSeek(p)
            | Provider::Mistral(p)
            | Provider::Kimi(p) => p.complete(req).await,
            Provider::Gemini(p) => p.complete(req).await,
            #[cfg(any(test, feature = "test-support"))]
            Provider::Stub(p) => p.complete(req).await,
        }
    }
}

// ─── Test-only stub ────────────────────────────────────────────

#[cfg(any(test, feature = "test-support"))]
pub struct StubProvider {
    response: Result<AiResponse, ProviderError>,
}

#[cfg(any(test, feature = "test-support"))]
impl StubProvider {
    pub fn ok(content: impl Into<String>) -> Self {
        Self {
            response: Ok(AiResponse {
                content: content.into(),
                model: "stub-model".into(),
                input_tokens: 100,
                output_tokens: 200,
                latency_ms: 50,
                tool_calls: vec![],
            }),
        }
    }

    pub fn ok_tool_call(name: impl Into<String>, arguments: impl Into<String>) -> Self {
        Self {
            response: Ok(AiResponse {
                content: String::new(),
                model: "stub-model".into(),
                input_tokens: 100,
                output_tokens: 200,
                latency_ms: 50,
                tool_calls: vec![ToolCall {
                    name: name.into(),
                    arguments: arguments.into(),
                }],
            }),
        }
    }

    pub fn err(error: ProviderError) -> Self {
        Self {
            response: Err(error),
        }
    }

    pub async fn complete(&self, _req: AiRequest) -> Result<AiResponse, ProviderError> {
        match &self.response {
            Ok(r) => Ok(AiResponse {
                content: r.content.clone(),
                model: r.model.clone(),
                input_tokens: r.input_tokens,
                output_tokens: r.output_tokens,
                latency_ms: r.latency_ms,
                tool_calls: r.tool_calls.clone(),
            }),
            Err(e) => Err(match e {
                ProviderError::Api { status, body } => ProviderError::Api {
                    status: *status,
                    body: body.clone(),
                },
                ProviderError::Parse(s) => ProviderError::Parse(s.clone()),
                ProviderError::Http(_) => ProviderError::Parse("stub http error".into()),
            }),
        }
    }
}
