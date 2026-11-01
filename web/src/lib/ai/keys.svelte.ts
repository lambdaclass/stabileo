export type AiProviderId = 'anthropic' | 'openai';

export const AI_PROVIDERS: readonly AiProviderId[] = ['anthropic', 'openai'];

export interface AiCredentials {
  provider: AiProviderId;
  apiKey: string;
}

const KEY_PREFIX = 'stabileo.ai.key.';
const PROVIDER_KEY = 'stabileo.ai.provider';

function read(name: string): string | null {
  try {
    return globalThis.localStorage?.getItem(name) ?? null;
  } catch {
    return null;
  }
}

function write(name: string, value: string | null): boolean {
  try {
    if (value === null) globalThis.localStorage?.removeItem(name);
    else globalThis.localStorage?.setItem(name, value);
    return (globalThis.localStorage?.getItem(name) ?? null) === value;
  } catch {
    return false;
  }
}

function isProvider(value: unknown): value is AiProviderId {
  return value === 'anthropic' || value === 'openai';
}

function loadKeys(): Record<AiProviderId, string> {
  return {
    anthropic: read(KEY_PREFIX + 'anthropic') ?? '',
    openai: read(KEY_PREFIX + 'openai') ?? '',
  };
}

class AiKeyStore {
  keys = $state<Record<AiProviderId, string>>(loadKeys());
  provider = $state<AiProviderId>(((p) => (isProvider(p) ? p : 'anthropic'))(read(PROVIDER_KEY)));

  hasKey(provider: AiProviderId): boolean {
    return this.keys[provider].length > 0;
  }

  get active(): AiCredentials | null {
    const apiKey = this.keys[this.provider];
    return apiKey ? { provider: this.provider, apiKey } : null;
  }

  setProvider(provider: AiProviderId): void {
    this.provider = provider;
    write(PROVIDER_KEY, provider);
  }

  setKey(provider: AiProviderId, apiKey: string): void {
    const trimmed = apiKey.trim();
    this.keys = { ...this.keys, [provider]: trimmed };
    write(KEY_PREFIX + provider, trimmed || null);
  }

  forget(provider: AiProviderId): boolean {
    this.keys = { ...this.keys, [provider]: '' };
    return write(KEY_PREFIX + provider, null);
  }

  reload(): void {
    this.keys = loadKeys();
    const p = read(PROVIDER_KEY);
    this.provider = isProvider(p) ? p : 'anthropic';
  }
}

export const aiKeys = new AiKeyStore();
