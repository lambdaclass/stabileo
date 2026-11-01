export function choice<T extends string>(name: string, value: string | undefined, options: readonly T[], fallback: T): T {
  if (value === undefined) return fallback;
  const v = value.trim().toLowerCase();
  const hit = options.find((o) => o === v);
  if (hit === undefined) throw new AiActionError(`${name} must be one of ${options.join(', ')}, got ${JSON.stringify(promptLabel(value))}`);
  return hit;
}

export class AiActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiActionError';
  }
}

export const MAX_TEXT_BYTES = 16 * 1024;
export const MAX_MESSAGES = 40;
export const MAX_LIST_LEN = 2_000;
export const MAX_PROMPT_BYTES = 400 * 1024;
export const MAX_LABEL_CHARS = 64;

const encoder = new TextEncoder();

export function byteLength(value: string): number {
  return encoder.encode(value).length;
}

export function checkText(field: string, value: string): void {
  const len = byteLength(value);
  if (len > MAX_TEXT_BYTES) {
    throw new AiActionError(`${field} is too long (${len} bytes, max ${MAX_TEXT_BYTES})`);
  }
}

export function checkListLen(field: string, len: number, max: number): void {
  if (len > max) {
    throw new AiActionError(`${field} has too many entries (${len}, max ${max})`);
  }
}

export function checkPromptSize(system: string, user: string): void {
  const total = byteLength(system) + byteLength(user);
  if (total > MAX_PROMPT_BYTES) {
    throw new AiActionError(
      `request is too large for the AI provider (${total} bytes, max ${MAX_PROMPT_BYTES})`,
    );
  }
}

const ALPHA = /^[A-Za-z]+$/;
const ALNUM = /^[A-Za-z0-9]+$/;

export function sanitizeLocale(locale?: string | null): string {
  if (locale === undefined || locale === null) return 'en';
  const [primary, ...rest] = locale.split('-');
  const primaryOk = primary.length >= 2 && primary.length <= 3 && ALPHA.test(primary);
  const restOk = rest.every((p) => p.length >= 2 && p.length <= 8 && ALNUM.test(p));
  return primaryOk && restOk && byteLength(locale) <= 16 ? locale : 'en';
}

const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const MARKUP = new Set(['`', '#', '<', '>', '{', '}', '[', ']']);

export function promptLine(text: string, maxChars = Infinity): string {
  const cleaned = Array.from(text)
    .map((c) => (CONTROL.test(c) || MARKUP.has(c) ? ' ' : c))
    .slice(0, maxChars)
    .join('');
  return cleaned.split(/\s+/).filter((w) => w.length > 0).join(' ');
}

export const promptLabel = (name: string): string => promptLine(name, MAX_LABEL_CHARS);
