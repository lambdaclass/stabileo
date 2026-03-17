use crate::error::ProviderError;

pub struct AiRequest {
    pub system_prompt: String,
    pub user_message: String,
    pub max_tokens: u32,
    pub temperature: f32,
}

pub struct AiResponse {
    pub content: String,
    pub model: String,
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub latency_ms: u64,
}

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

/// Test-only provider that returns a canned response or error.
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
