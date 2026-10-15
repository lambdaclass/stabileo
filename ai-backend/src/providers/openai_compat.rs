use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Instant;

use crate::error::ProviderError;
use super::traits::{AiRequest, AiResponse, AiRole, ToolCall};

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

        let mut messages = vec![ChatMessage {
            role: "system",
            content: &req.system_prompt,
        }];
        if req.messages.is_empty() {
            messages.push(ChatMessage {
                role: "user",
                content: &req.user_message,
            });
        } else {
            for m in &req.messages {
                messages.push(ChatMessage {
                    role: match m.role {
                        AiRole::User => "user",
                        AiRole::Assistant => "assistant",
                    },
                    content: &m.content,
                });
            }
        }

        // o-series models (o1, o3, etc.) use max_completion_tokens and don't support temperature
        let is_o_series = self.model.starts_with("o1") || self.model.starts_with("o3");
        let body = ChatRequest {
            model: &self.model,
            max_tokens: if is_o_series { None } else { Some(req.max_tokens) },
            max_completion_tokens: if is_o_series { Some(req.max_tokens) } else { None },
            temperature: if is_o_series { None } else { Some(req.temperature) },
            messages,
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

        let raw_body = resp.text().await?;
        let parsed: ChatResponse = serde_json::from_str(&raw_body)
            .map_err(|e| ProviderError::Parse(format!("{e}; body: {raw_body}")))?;

        let choice = parsed
            .choices
            .into_iter()
            .next()
            .ok_or_else(|| ProviderError::Parse("no choices in response".into()))?;

        let tool_calls = extract_tool_calls(choice.message.tool_calls);

        // OpenAI-compatible providers vary here:
        // - content may be null, a string, an array of text parts, or an object
        // - reasoning_content may also be string or structured JSON
        let content = extract_text(choice.message.content)
            .or_else(|| extract_text(choice.message.reasoning_content))
            .unwrap_or_default();

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
    /// Classic parameter for most models.
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    /// Required by o-series models (o1, o3, etc.) instead of max_tokens.
    #[serde(skip_serializing_if = "Option::is_none")]
    max_completion_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
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
    content: Option<Value>,
    #[serde(default)]
    reasoning_content: Option<Value>,
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
    arguments: Value,
}

#[derive(Deserialize)]
struct ChatUsage {
    prompt_tokens: u32,
    completion_tokens: u32,
}

fn extract_tool_calls(tool_calls: Option<Vec<ResponseToolCall>>) -> Vec<ToolCall> {
    tool_calls
        .unwrap_or_default()
        .into_iter()
        .map(|tc| ToolCall {
            name: tc.function.name,
            arguments: match tc.function.arguments {
                Value::String(s) => s,
                other => other.to_string(),
            },
        })
        .collect()
}

fn extract_text(value: Option<Value>) -> Option<String> {
    let text = extract_text_from_value(value?)?;
    let trimmed = text.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn extract_text_from_value(value: Value) -> Option<String> {
    match value {
        Value::Null => None,
        Value::String(s) => Some(s),
        Value::Array(parts) => {
            let mut out = Vec::new();
            for part in parts {
                if let Some(text) = extract_text_from_value(part) {
                    if !text.trim().is_empty() {
                        out.push(text);
                    }
                }
            }
            if out.is_empty() {
                None
            } else {
                Some(out.join("\n"))
            }
        }
        Value::Object(mut obj) => {
            if let Some(text) = obj.remove("text").and_then(extract_text_from_value) {
                return Some(text);
            }
            if let Some(text) = obj.remove("content").and_then(extract_text_from_value) {
                return Some(text);
            }
            None
        }
        other => Some(other.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_tool_call_when_content_is_null() {
        let raw = r#"{
          "model":"gpt-test",
          "choices":[
            {
              "message":{
                "content":null,
                "tool_calls":[
                  {
                    "function":{
                      "name":"create_beam",
                      "arguments":"{\"span\":6,\"q\":-10}"
                    }
                  }
                ]
              }
            }
          ],
          "usage":{"prompt_tokens":10,"completion_tokens":5}
        }"#;

        let parsed: ChatResponse = serde_json::from_str(raw).unwrap();
        let choice = parsed.choices.into_iter().next().unwrap();
        let tool_calls = extract_tool_calls(choice.message.tool_calls);

        assert_eq!(tool_calls.len(), 1);
        assert_eq!(tool_calls[0].name, "create_beam");
        assert!(tool_calls[0].arguments.contains("\"span\":6"));
    }

    #[test]
    fn extracts_text_from_array_content_parts() {
        let raw = r#"{
          "model":"gpt-test",
          "choices":[
            {
              "message":{
                "content":[
                  {"type":"text","text":"I can help with that."},
                  {"type":"text","text":"Please specify the span."}
                ]
              }
            }
          ],
          "usage":{"prompt_tokens":10,"completion_tokens":5}
        }"#;

        let parsed: ChatResponse = serde_json::from_str(raw).unwrap();
        let choice = parsed.choices.into_iter().next().unwrap();
        let text = extract_text(choice.message.content).unwrap();

        assert!(text.contains("I can help with that."));
        assert!(text.contains("Please specify the span."));
    }

    #[test]
    fn serializes_object_arguments_tool_call() {
        let raw = r#"{
          "model":"gpt-test",
          "choices":[
            {
              "message":{
                "content":null,
                "tool_calls":[
                  {
                    "function":{
                      "name":"create_beam",
                      "arguments":{"span":6,"q":-10}
                    }
                  }
                ]
              }
            }
          ],
          "usage":{"prompt_tokens":10,"completion_tokens":5}
        }"#;

        let parsed: ChatResponse = serde_json::from_str(raw).unwrap();
        let choice = parsed.choices.into_iter().next().unwrap();
        let tool_calls = extract_tool_calls(choice.message.tool_calls);

        assert_eq!(tool_calls.len(), 1);
        assert_eq!(tool_calls[0].arguments, r#"{"q":-10,"span":6}"#);
    }
}
