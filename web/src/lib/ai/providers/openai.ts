import OpenAI from 'openai';
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import {
  AiProviderError,
  abortError,
  kindForStatus,
  shortDetail,
  type LlmProvider,
  type LlmRequest,
  type LlmResponse,
} from './types';

export const OPENAI_MODEL = 'gpt-6-astra';

export function openaiParams(req: LlmRequest): ChatCompletionCreateParamsNonStreaming {
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: req.system },
    ...req.messages.map((m) => ({ role: m.role, content: m.content }) as ChatCompletionMessageParam),
  ];
  const params: ChatCompletionCreateParamsNonStreaming = {
    model: OPENAI_MODEL,
    messages,
    max_completion_tokens: req.maxTokens,
    reasoning_effort: 'high',
  };
  if (req.tools && req.tools.length > 0) {
    params.tools = req.tools.map((tool) => ({
      type: 'function' as const,
      function: { name: tool.name, description: tool.description, parameters: tool.input_schema },
    }));
    params.tool_choice = 'auto';
    params.parallel_tool_calls = false;
  }
  if (req.json) {
    params.response_format = {
      type: 'json_schema',
      json_schema: { name: req.json.name, schema: req.json.schema, strict: true },
    };
  }
  return params;
}

export function mapOpenAiError(err: unknown, apiKey = ''): unknown {
  if (err instanceof OpenAI.APIUserAbortError) return abortError();
  if (err instanceof DOMException && err.name === 'AbortError') return err;
  if (err instanceof OpenAI.APIConnectionError) return new AiProviderError('connection');
  if (err instanceof OpenAI.AuthenticationError) return new AiProviderError('invalidKey', 401);
  if (err instanceof OpenAI.RateLimitError) {
    return new AiProviderError(err.code === 'insufficient_quota' ? 'billing' : 'rateLimited', 429);
  }
  if (err instanceof OpenAI.InternalServerError) return new AiProviderError('unavailable', err.status);
  if (err instanceof OpenAI.APIError) {
    const kind = kindForStatus(err.status);
    return new AiProviderError(kind, err.status, kind === 'badRequest' || kind === 'unknown' ? shortDetail(err.message, apiKey) : undefined);
  }
  return err;
}

function parseArguments(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function readOpenAiCompletion(completion: ChatCompletion, startedAt: number): LlmResponse {
  const choice = completion.choices[0];
  if (!choice) throw new AiProviderError('badResponse');
  if (choice.message.refusal) throw new AiProviderError('refusal', undefined, shortDetail(choice.message.refusal));
  if (choice.finish_reason === 'content_filter') throw new AiProviderError('refusal');
  if (choice.finish_reason === 'length') throw new AiProviderError('truncated');
  const toolCalls: LlmResponse['toolCalls'] = [];
  for (const call of choice.message.tool_calls ?? []) {
    if (call.type === 'function') toolCalls.push({ name: call.function.name, input: parseArguments(call.function.arguments) });
  }
  return {
    text: choice.message.content ?? '',
    toolCalls,
    model: completion.model,
    inputTokens: completion.usage?.prompt_tokens ?? 0,
    outputTokens: completion.usage?.completion_tokens ?? 0,
    latencyMs: Math.round(performance.now() - startedAt),
    requestId: completion.id,
  };
}

export const openaiProvider: LlmProvider = {
  async complete(apiKey, req) {
    if (req.signal?.aborted) throw abortError();
    const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
    const startedAt = performance.now();
    let completion: ChatCompletion;
    try {
      completion = await client.chat.completions.create(openaiParams(req), { signal: req.signal });
    } catch (err) {
      throw mapOpenAiError(err, apiKey);
    }
    return readOpenAiCompletion(completion, startedAt);
  },
};
