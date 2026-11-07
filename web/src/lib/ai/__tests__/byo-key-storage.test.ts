import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aiKeys } from '../keys.svelte';
import { reviewModel, buildModel } from '../client';
import { modelStore } from '../../store/model.svelte';
import { serializeProject } from '../../store/file';
import { generateShareURL } from '../../utils/url-sharing';

const ANTHROPIC_KEY = 'sk-ant-secret-KEY-do-not-leak-1234';
const OPENAI_KEY = 'sk-openai-secret-KEY-do-not-leak-5678';

function memoryStorage(): Storage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => { data.delete(k); },
    setItem: (k, v) => { data.set(k, String(v)); },
  };
}

let storage: ReturnType<typeof memoryStorage>;

beforeEach(() => {
  storage = memoryStorage();
  vi.stubGlobal('localStorage', storage);
  aiKeys.reload();
});

afterEach(() => {
  aiKeys.forget('anthropic');
  aiKeys.forget('openai');
  vi.unstubAllGlobals();
});

describe('BYO AI key storage', () => {
  it('keeps one key per provider in localStorage and forgets each on its own', () => {
    aiKeys.setKey('anthropic', `  ${ANTHROPIC_KEY}  `);
    aiKeys.setKey('openai', OPENAI_KEY);
    expect(storage.data.get('stabileo.ai.key.anthropic')).toBe(ANTHROPIC_KEY);
    expect(storage.data.get('stabileo.ai.key.openai')).toBe(OPENAI_KEY);

    aiKeys.setProvider('openai');
    expect(aiKeys.active).toEqual({ provider: 'openai', apiKey: OPENAI_KEY });
    aiKeys.setProvider('anthropic');
    expect(aiKeys.active).toEqual({ provider: 'anthropic', apiKey: ANTHROPIC_KEY });

    expect(aiKeys.forget('anthropic')).toBe(true);
    expect(storage.data.has('stabileo.ai.key.anthropic')).toBe(false);
    expect(storage.data.get('stabileo.ai.key.openai')).toBe(OPENAI_KEY);
    expect(aiKeys.active).toBeNull();
    expect(aiKeys.hasKey('openai')).toBe(true);
  });

  it('survives a reload and a blocked storage', () => {
    aiKeys.setKey('anthropic', ANTHROPIC_KEY);
    aiKeys.reload();
    expect(aiKeys.keys.anthropic).toBe(ANTHROPIC_KEY);

    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('SecurityError'); },
      removeItem: () => { throw new Error('SecurityError'); },
    });
    expect(() => aiKeys.setKey('openai', OPENAI_KEY)).not.toThrow();
    expect(aiKeys.keys.openai).toBe(OPENAI_KEY);
    expect(aiKeys.forget('openai')).toBe(false);
    expect(() => aiKeys.reload()).not.toThrow();
    expect(aiKeys.keys.anthropic).toBe('');
  });

  it('never writes the key into a saved project or a share link', () => {
    aiKeys.setKey('anthropic', ANTHROPIC_KEY);
    aiKeys.setKey('openai', OPENAI_KEY);
    modelStore.clear();
    const a = modelStore.addNode(0, 0);
    const b = modelStore.addNode(6, 0);
    modelStore.addElement(a, b);
    modelStore.addSupport(a, 'pinned');

    vi.stubGlobal('location', { origin: 'https://stabileo.com', pathname: '/app', hash: '', search: '' });
    const project = serializeProject();
    const share = generateShareURL();
    expect(share).not.toBeNull();
    for (const text of [project, share!.url, decodeURIComponent(share!.url)]) {
      expect(text).not.toContain(ANTHROPIC_KEY);
      expect(text).not.toContain(OPENAI_KEY);
      expect(text).not.toContain('do-not-leak');
    }
    modelStore.clear();
  });
});

describe('client routing', () => {
  it('goes to the browser provider when a key is set and never calls the Stabileo backend', async () => {
    aiKeys.setKey('anthropic', ANTHROPIC_KEY);
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      urls.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      return new Response(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'bad' } }), {
        status: 401, headers: { 'content-type': 'application/json' },
      });
    }));
    const err = await reviewModel({ meta: {}, diagnostics: [] } as never, 'en').catch((e) => e);
    expect(err.kind).toBe('invalidKey');
    expect(urls.every((u) => u.startsWith('https://api.anthropic.com/'))).toBe(true);
    expect(urls.length).toBeGreaterThan(0);
  });

  it('uses the OpenAI key when OpenAI is the chosen provider', async () => {
    aiKeys.setKey('openai', OPENAI_KEY);
    aiKeys.setProvider('openai');
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      urls.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      return new Response(JSON.stringify({ error: { message: 'bad', type: 'invalid_request_error' } }), {
        status: 401, headers: { 'content-type': 'application/json' },
      });
    }));
    const err = await buildModel('a 6 m beam', 'en', '2d').catch((e) => e);
    expect(err.kind).toBe('invalidKey');
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((u) => u.startsWith('https://api.openai.com/'))).toBe(true);
    aiKeys.setProvider('anthropic');
  });

  it('falls back to the backend path when no key is set', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      urls.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      return new Response(JSON.stringify({ error: 'backend says no' }), { status: 500 });
    }));
    const err = await reviewModel({} as never, 'en').catch((e) => e);
    expect(err.message).toBe('backend says no');
    expect(urls).toHaveLength(1);
    expect(urls[0]).toMatch(/\/api\/ai\/review-model$/);
  });
});
