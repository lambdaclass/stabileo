import { t } from '../../i18n';
import type { ToolDef } from '../capabilities';

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmRequest {
  system: string;
  messages: LlmMessage[];
  maxTokens: number;
  tools?: ToolDef[];
  json?: { name: string; schema: Record<string, unknown> };
  signal?: AbortSignal;
}

export interface LlmToolCall {
  name: string;
  input: unknown;
}

export interface LlmResponse {
  text: string;
  toolCalls: LlmToolCall[];
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  requestId: string;
}

export type AiErrorKind =
  | 'invalidKey'
  | 'permission'
  | 'billing'
  | 'rateLimited'
  | 'unavailable'
  | 'connection'
  | 'badRequest'
  | 'refusal'
  | 'truncated'
  | 'badResponse'
  | 'unknown';

export const RETRYABLE_KINDS: ReadonlySet<AiErrorKind> = new Set(['rateLimited', 'unavailable', 'connection']);

export class AiProviderError extends Error {
  readonly kind: AiErrorKind;
  readonly retryable: boolean;
  readonly status?: number;

  constructor(kind: AiErrorKind, status?: number, detail?: string) {
    const base = t(`ai.err.${kind}`);
    super(detail ? `${base} (${detail})` : base);
    this.name = 'AiProviderError';
    this.kind = kind;
    this.retryable = RETRYABLE_KINDS.has(kind);
    this.status = status;
  }
}

export function abortError(): DOMException {
  return new DOMException('The request was cancelled', 'AbortError');
}

export function kindForStatus(status: number | undefined): AiErrorKind {
  if (status === undefined) return 'connection';
  if (status === 401) return 'invalidKey';
  if (status === 402) return 'billing';
  if (status === 403) return 'permission';
  if (status === 429) return 'rateLimited';
  if (status >= 500) return 'unavailable';
  if (status === 400 || status === 404 || status === 413 || status === 422) return 'badRequest';
  return 'unknown';
}

const KEY_LIKE = /sk-[A-Za-z0-9_-]{6,}/g;

export function shortDetail(message: string | undefined, apiKey = ''): string | undefined {
  if (!message) return undefined;
  const oneLine = (apiKey ? message.split(apiKey).join('[redacted]') : message).replace(KEY_LIKE, '[redacted]').replace(/\s+/g, ' ').trim();
  return oneLine.length > 200 ? `${oneLine.slice(0, 200)}…` : oneLine;
}

export interface LlmProvider {
  complete(apiKey: string, req: LlmRequest): Promise<LlmResponse>;
}

export function withoutKey(err: unknown, apiKey: string): unknown {
  if (err instanceof DOMException && err.name === 'AbortError') return err;
  if (!(err instanceof AiProviderError)) return new AiProviderError('unknown');
  if (apiKey && err.message.includes(apiKey.slice(0, 12))) return new AiProviderError(err.kind, err.status);
  return err;
}
