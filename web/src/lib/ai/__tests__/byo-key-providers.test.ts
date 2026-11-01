import { afterEach, describe, expect, it, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { anthropicProvider, anthropicParams, mapAnthropicError, ANTHROPIC_MODEL } from '../providers/anthropic';
import { openaiProvider, openaiParams, mapOpenAiError, OPENAI_MODEL } from '../providers/openai';
import { AiProviderError, shortDetail, withoutKey, type LlmRequest } from '../providers/types';
import { buildModel } from '../browser-provider';
import { AiActionError } from '../capabilities';
import { t } from '../../i18n';
import es from '../../i18n/locales/es';
import en from '../../i18n/locales/en';
import pt from '../../i18n/locales/pt';
import de from '../../i18n/locales/de';
import fr from '../../i18n/locales/fr';
import tr from '../../i18n/locales/tr';

const KEY = 'sk-ant-test-0123456789abcdef';

interface Captured {
  url: string;
  headers: Headers;
  body: Record<string, unknown>;
}

function sse(events: Array<Record<string, unknown>>): string {
  return events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
}

function anthropicStream(opts: { content: Array<Record<string, unknown>>; stopReason: string; stopDetails?: unknown }): string {
  const events: Array<Record<string, unknown>> = [
    {
      type: 'message_start',
      message: {
        id: 'msg_test', type: 'message', role: 'assistant', model: ANTHROPIC_MODEL, content: [],
        stop_reason: null, stop_sequence: null, stop_details: null, usage: { input_tokens: 11, output_tokens: 1 },
      },
    },
  ];
  opts.content.forEach((block, index) => {
    if (block.type === 'text') {
      events.push({ type: 'content_block_start', index, content_block: { type: 'text', text: '' } });
      events.push({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: block.text } });
    } else {
      events.push({ type: 'content_block_start', index, content_block: { type: 'tool_use', id: 'tu_1', name: block.name, input: {} } });
      events.push({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input) } });
    }
    events.push({ type: 'content_block_stop', index });
  });
  events.push({
    type: 'message_delta',
    delta: { stop_reason: opts.stopReason, stop_sequence: null, stop_details: opts.stopDetails ?? null },
    usage: { output_tokens: 42 },
  });
  events.push({ type: 'message_stop' });
  return sse(events);
}

function stubFetch(respond: () => Response): Captured[] {
  const calls: Captured[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, headers: new Headers(init?.headers), body: JSON.parse(String(init?.body ?? '{}')) });
    return respond();
  }));
  return calls;
}

const sseResponse = (body: string) => new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'x-should-retry': 'false' } });

const req: LlmRequest = {
  system: 'You are a test.',
  messages: [{ role: 'user', content: 'Build a beam' }],
  maxTokens: 32000,
  tools: [{ name: 'create_beam', description: 'Beam', input_schema: { type: 'object', properties: { span: { type: 'number' } }, required: ['span'] } }],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('key never reaches an error message', () => {
  it('redacts a key a provider echoes in a 400 and turns unknown failures into a generic error', async () => {
    stubFetch(() => jsonResponse(400, { type: 'error', error: { type: 'invalid_request_error', message: `bad header ${KEY} rejected` } }));
    const err = await buildModel({ provider: 'anthropic', apiKey: KEY }, 'Build a beam', 'en', '2d').catch((e) => e);
    expect(err).toBeInstanceOf(AiProviderError);
    expect(err.kind).toBe('badRequest');
    expect(err.message).not.toContain(KEY);
    expect(err.message).not.toContain('0123456789abcdef');
    expect(shortDetail('key sk-proj-abcdef123456 leaked')).toBe('key [redacted] leaked');
    expect(shortDetail('header_sk-proj-abcdef123456 leaked')).toBe('header_[redacted] leaked');
    stubFetch(() => jsonResponse(400, { type: 'error', error: { type: 'invalid_request_error', message: `${'x'.repeat(190)}_${KEY}` } }));
    const cut = await buildModel({ provider: 'anthropic', apiKey: KEY }, 'Build a beam', 'en', '2d').catch((e) => e);
    expect(cut.message).not.toMatch(/sk-ant|0123456789abcdef/);
    const generic = withoutKey(new TypeError(`fetch failed for ${KEY}`), KEY) as AiProviderError;
    expect(generic).toBeInstanceOf(AiProviderError);
    expect(generic.kind).toBe('unknown');
    expect(generic.message).not.toContain(KEY);
  });
});

describe('several tool calls in one answer', () => {
  it('are refused instead of applying only the first', async () => {
    stubFetch(() => sseResponse(anthropicStream({
      content: [
        { type: 'tool_use', name: 'create_beam', input: { span: 6, interpretation: 'a' } },
        { type: 'tool_use', name: 'create_beam', input: { span: 8, interpretation: 'b' } },
      ],
      stopReason: 'tool_use',
    })));
    const err = await buildModel({ provider: 'anthropic', apiKey: KEY }, 'Build two beams', 'en', '2d').catch((e) => e);
    expect(err).toBeInstanceOf(AiActionError);
    expect(err.message).toContain('several changes at once');
  });
});

describe('Anthropic browser provider', () => {
  it('sends the key only to api.anthropic.com, with the browser header, the model and adaptive thinking', async () => {
    const calls = stubFetch(() => sseResponse(anthropicStream({ content: [{ type: 'text', text: 'ok' }], stopReason: 'end_turn' })));
    const resp = await anthropicProvider.complete(KEY, req);

    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(new URL(call.url).origin).toBe('https://api.anthropic.com');
    expect(new URL(call.url).pathname).toBe('/v1/messages');
    expect(call.headers.get('authorization') ?? call.headers.get('x-api-key')).toMatch(new RegExp(`^(Bearer )?${KEY}$`));
    expect(call.headers.get('anthropic-dangerous-direct-browser-access')).toBe('true');
    expect(call.body.model).toBe('claude-opus-5-5');
    expect(call.body.thinking).toEqual({ type: 'adaptive' });
    expect(call.body.stream).toBe(true);
    expect(call.body.max_tokens).toBe(32000);
    expect(call.body).not.toHaveProperty('temperature');
    expect(call.body).not.toHaveProperty('top_p');
    expect(JSON.stringify(call.body)).not.toContain('budget_tokens');
    expect(call.body.tool_choice).toEqual({ type: 'auto', disable_parallel_tool_use: true });
    expect(call.body.system).toBe('You are a test.');
    expect(call.body.messages).toEqual([{ role: 'user', content: 'Build a beam' }]);

    expect(resp.text).toBe('ok');
    expect(resp.model).toBe(ANTHROPIC_MODEL);
    expect(resp.inputTokens).toBe(11);
    expect(resp.outputTokens).toBe(42);
    expect(resp.requestId).toBe('msg_test');
  });

  it('never forces a tool and puts a JSON schema in output_config.format', () => {
    const params = anthropicParams({ ...req, tools: undefined, json: { name: 'x', schema: { type: 'object' } } });
    expect(params).not.toHaveProperty('tool_choice');
    expect(params).not.toHaveProperty('tools');
    expect(params.output_config?.format).toEqual({ type: 'json_schema', schema: { type: 'object' } });
    const withTools = anthropicParams(req);
    expect(withTools.tool_choice).toEqual({ type: 'auto', disable_parallel_tool_use: true });
  });

  it('reads tool calls from the stream', async () => {
    stubFetch(() => sseResponse(anthropicStream({
      content: [{ type: 'text', text: 'Building.' }, { type: 'tool_use', name: 'create_beam', input: { span: 6 } }],
      stopReason: 'tool_use',
    })));
    const resp = await anthropicProvider.complete(KEY, req);
    expect(resp.toolCalls).toEqual([{ name: 'create_beam', input: { span: 6 } }]);
    expect(resp.text).toBe('Building.');
  });

  it('throws a refusal instead of reading content when stop_reason is refusal', async () => {
    stubFetch(() => sseResponse(anthropicStream({
      content: [{ type: 'tool_use', name: 'create_beam', input: { span: 6 } }],
      stopReason: 'refusal',
      stopDetails: { type: 'refusal', category: null, explanation: 'declined' },
    })));
    const err = await anthropicProvider.complete(KEY, req).catch((e) => e);
    expect(err).toBeInstanceOf(AiProviderError);
    expect(err.kind).toBe('refusal');
    expect(err.message).toContain(t('ai.err.refusal'));
  });

  it('throws truncated on max_tokens rather than returning a partial answer', async () => {
    stubFetch(() => sseResponse(anthropicStream({ content: [{ type: 'text', text: '{"half": ' }], stopReason: 'max_tokens' })));
    const err = await anthropicProvider.complete(KEY, req).catch((e) => e);
    expect(err.kind).toBe('truncated');
  });

  it('maps a 401 to the invalid-key message without echoing the key', async () => {
    stubFetch(() => jsonResponse(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }));
    const err = await anthropicProvider.complete(KEY, req).catch((e) => e);
    expect(err).toBeInstanceOf(AiProviderError);
    expect(err.kind).toBe('invalidKey');
    expect(err.retryable).toBe(false);
    expect(err.message).toBe(t('ai.err.invalidKey'));
    expect(err.message).not.toContain(KEY);
  });

  it('maps rate limits, overload and 5xx to retryable errors, and network failures to connection', () => {
    const h = new Headers();
    const rate = mapAnthropicError(Anthropic.APIError.generate(429, { error: { type: 'rate_limit_error' } }, 'rate', h)) as AiProviderError;
    const overloaded = mapAnthropicError(Anthropic.APIError.generate(529, { error: { type: 'overloaded_error' } }, 'overloaded', h)) as AiProviderError;
    const server = mapAnthropicError(Anthropic.APIError.generate(500, undefined, 'boom', h)) as AiProviderError;
    const conn = mapAnthropicError(new Anthropic.APIConnectionError({ message: 'offline' })) as AiProviderError;
    const billing = mapAnthropicError(Anthropic.APIError.generate(402, { error: { type: 'billing_error' } }, 'billing', h)) as AiProviderError;
    expect([rate.kind, overloaded.kind, server.kind, conn.kind, billing.kind])
      .toEqual(['rateLimited', 'unavailable', 'unavailable', 'connection', 'billing']);
    expect([rate.retryable, overloaded.retryable, server.retryable, conn.retryable, billing.retryable])
      .toEqual([true, true, true, true, false]);
  });

  it('turns a user abort into an AbortError', () => {
    const mapped = mapAnthropicError(new Anthropic.APIUserAbortError()) as Error;
    expect(mapped.name).toBe('AbortError');
  });
});

function chatCompletion(message: Record<string, unknown>, finish: string): Record<string, unknown> {
  return {
    id: 'chatcmpl_test', object: 'chat.completion', created: 0, model: OPENAI_MODEL,
    choices: [{ index: 0, message: { role: 'assistant', content: null, refusal: null, ...message }, finish_reason: finish }],
    usage: { prompt_tokens: 7, completion_tokens: 9, total_tokens: 16 },
  };
}

describe('OpenAI browser provider', () => {
  const OKEY = 'sk-openai-test-abcdef0123';

  it('sends the key only to api.openai.com with the model, no temperature, and function tools', async () => {
    const calls = stubFetch(() => jsonResponse(200, chatCompletion({ content: 'hi' }, 'stop')));
    const resp = await openaiProvider.complete(OKEY, req);
    const call = calls[0];
    expect(new URL(call.url).origin).toBe('https://api.openai.com');
    expect(new URL(call.url).pathname).toBe('/v1/chat/completions');
    expect(call.headers.get('authorization')).toBe(`Bearer ${OKEY}`);
    expect(call.body.model).toBe('gpt-6-astra');
    expect(call.body.max_completion_tokens).toBe(32000);
    expect(call.body).not.toHaveProperty('temperature');
    expect(call.body).not.toHaveProperty('max_tokens');
    expect(call.body.tool_choice).toBe('auto');
    expect(call.body.parallel_tool_calls).toBe(false);
    expect(call.body.messages).toEqual([
      { role: 'system', content: 'You are a test.' },
      { role: 'user', content: 'Build a beam' },
    ]);
    expect((call.body.tools as Array<{ type: string; function: { name: string } }>)[0]).toMatchObject({ type: 'function', function: { name: 'create_beam' } });
    expect(resp).toMatchObject({ text: 'hi', model: OPENAI_MODEL, inputTokens: 7, outputTokens: 9, requestId: 'chatcmpl_test' });
  });

  it('asks for a strict JSON schema response format', () => {
    const params = openaiParams({ ...req, tools: undefined, json: { name: 'review', schema: { type: 'object' } } });
    expect(params.response_format).toEqual({ type: 'json_schema', json_schema: { name: 'review', schema: { type: 'object' }, strict: true } });
    expect(params).not.toHaveProperty('tools');
  });

  it('parses tool call arguments', async () => {
    stubFetch(() => jsonResponse(200, chatCompletion({
      tool_calls: [{ id: 'c1', type: 'function', function: { name: 'create_beam', arguments: '{"span":8}' } }],
    }, 'tool_calls')));
    const resp = await openaiProvider.complete(OKEY, req);
    expect(resp.toolCalls).toEqual([{ name: 'create_beam', input: { span: 8 } }]);
  });

  it('throws on a refusal, a content filter and a cut-off answer', async () => {
    stubFetch(() => jsonResponse(200, chatCompletion({ refusal: 'no' }, 'stop')));
    expect((await openaiProvider.complete(OKEY, req).catch((e) => e)).kind).toBe('refusal');
    stubFetch(() => jsonResponse(200, chatCompletion({ content: '' }, 'content_filter')));
    expect((await openaiProvider.complete(OKEY, req).catch((e) => e)).kind).toBe('refusal');
    stubFetch(() => jsonResponse(200, chatCompletion({ content: '{"a":' }, 'length')));
    expect((await openaiProvider.complete(OKEY, req).catch((e) => e)).kind).toBe('truncated');
  });

  it('maps a 401 to the invalid-key message without echoing the key', async () => {
    stubFetch(() => jsonResponse(401, { error: { message: 'Incorrect API key provided', type: 'invalid_request_error', code: 'invalid_api_key' } }));
    const err = await openaiProvider.complete(OKEY, req).catch((e) => e);
    expect(err.kind).toBe('invalidKey');
    expect(err.message).toBe(t('ai.err.invalidKey'));
    expect(err.message).not.toContain(OKEY);
  });

  it('maps 429, insufficient quota, 5xx and network failures', () => {
    const h = new Headers();
    const rate = mapOpenAiError(OpenAI.APIError.generate(429, { error: { code: 'rate_limit_exceeded' } }, 'rate', h)) as AiProviderError;
    const quota = mapOpenAiError(OpenAI.APIError.generate(429, { error: { code: 'insufficient_quota' } }, 'quota', h)) as AiProviderError;
    const server = mapOpenAiError(OpenAI.APIError.generate(503, undefined, 'down', h)) as AiProviderError;
    const conn = mapOpenAiError(new OpenAI.APIConnectionError({ message: 'offline' })) as AiProviderError;
    expect([rate.kind, quota.kind, server.kind, conn.kind]).toEqual(['rateLimited', 'billing', 'unavailable', 'connection']);
    expect((mapOpenAiError(new OpenAI.APIUserAbortError()) as Error).name).toBe('AbortError');
  });
});

describe('every error kind has a message in every full dictionary', () => {
  it('has a non-empty message in es, en, pt, de, fr and tr', () => {
    const dicts: Record<string, Record<string, string>> = { es, en, pt, de, fr, tr };
    const keys = ['invalidKey', 'permission', 'billing', 'rateLimited', 'unavailable', 'connection', 'badRequest', 'refusal', 'truncated', 'badResponse', 'unknown']
      .map((kind) => `ai.err.${kind}`).concat('ai.key.forgetFailed');
    for (const [locale, dict] of Object.entries(dicts)) {
      for (const key of keys) expect(dict[key]?.trim(), `${locale} ${key}`).toBeTruthy();
    }
  });
});
