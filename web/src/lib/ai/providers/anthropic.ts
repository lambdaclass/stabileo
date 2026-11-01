import Anthropic from '@anthropic-ai/sdk';
import {
  AiProviderError,
  abortError,
  kindForStatus,
  shortDetail,
  type LlmProvider,
  type LlmRequest,
  type LlmResponse,
} from './types';

export const ANTHROPIC_MODEL = 'claude-opus-5-5';

export function anthropicParams(req: LlmRequest): Anthropic.MessageStreamParams {
  const params: Anthropic.MessageStreamParams = {
    model: ANTHROPIC_MODEL,
    max_tokens: req.maxTokens,
    thinking: { type: 'adaptive' },
    system: req.system,
    messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
    output_config: {
      effort: 'high',
      ...(req.json ? { format: { type: 'json_schema' as const, schema: req.json.schema } } : {}),
    },
  };
  if (req.tools && req.tools.length > 0) {
    params.tools = req.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema as Anthropic.Tool.InputSchema,
      ...(tool.strict ? { strict: true } : {}),
    }));
    params.tool_choice = { type: 'auto', disable_parallel_tool_use: true };
  }
  return params;
}

export function mapAnthropicError(err: unknown): unknown {
  if (err instanceof Anthropic.APIUserAbortError) return abortError();
  if (err instanceof DOMException && err.name === 'AbortError') return err;
  if (err instanceof Anthropic.APIConnectionError) return new AiProviderError('connection');
  if (err instanceof Anthropic.AuthenticationError) return new AiProviderError('invalidKey', 401);
  if (err instanceof Anthropic.RateLimitError) return new AiProviderError('rateLimited', 429);
  if (err instanceof Anthropic.InternalServerError) return new AiProviderError('unavailable', err.status);
  if (err instanceof Anthropic.APIError) {
    const kind = kindForStatus(err.status);
    return new AiProviderError(kind, err.status, kind === 'badRequest' || kind === 'unknown' ? shortDetail(err.message) : undefined);
  }
  return err;
}

export function readAnthropicMessage(msg: Anthropic.Message, startedAt: number): LlmResponse {
  if (msg.stop_reason === 'refusal') {
    throw new AiProviderError('refusal', undefined, shortDetail(msg.stop_details?.explanation ?? undefined));
  }
  if (msg.stop_reason === 'max_tokens' || msg.stop_reason === 'model_context_window_exceeded') {
    throw new AiProviderError('truncated');
  }
  const text: string[] = [];
  const toolCalls: LlmResponse['toolCalls'] = [];
  for (const block of msg.content) {
    if (block.type === 'text') text.push(block.text);
    else if (block.type === 'tool_use') toolCalls.push({ name: block.name, input: block.input });
  }
  return {
    text: text.join(''),
    toolCalls,
    model: msg.model,
    inputTokens: msg.usage.input_tokens,
    outputTokens: msg.usage.output_tokens,
    latencyMs: Math.round(performance.now() - startedAt),
    requestId: msg.id,
  };
}

export const anthropicProvider: LlmProvider = {
  async complete(apiKey, req) {
    if (req.signal?.aborted) throw abortError();
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
    const startedAt = performance.now();
    let msg: Anthropic.Message;
    try {
      msg = await client.messages.stream(anthropicParams(req), { signal: req.signal }).finalMessage();
    } catch (err) {
      throw mapAnthropicError(err);
    }
    return readAnthropicMessage(msg, startedAt);
  },
};
