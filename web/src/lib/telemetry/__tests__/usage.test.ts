import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let storage: Map<string, string>;
let sent: { url: string; body: Record<string, unknown>; keepalive: boolean }[];
let reply: () => Response;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function load() {
  vi.resetModules();
  const consent = await import('../consent.svelte');
  const usage = await import('../usage');
  return { ...consent, ...usage };
}

beforeEach(() => {
  storage = new Map();
  sent = [];
  reply = () => json(202, { accepted: 1, rejected: 0, enabled: true });
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, String(v)),
    removeItem: (k: string) => void storage.delete(k),
  });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    sent.push({ url, body: JSON.parse(String(init.body)), keepalive: init.keepalive === true });
    return reply();
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('anonymous usage', () => {
  it('queues nothing until the user agrees', async () => {
    const { trackUsage, pendingUsage, flushUsage } = await load();
    trackUsage('solve', { outcome: 'ok' });
    expect(pendingUsage()).toEqual([]);
    await flushUsage();
    expect(sent).toEqual([]);
  });

  it('sends a batch with the shared fields and a stable random install id', async () => {
    const { usageConsent, trackUsage, flushUsage, setUsageContext, INSTALL_ID_KEY } = await load();
    usageConsent.set('granted');
    setUsageContext({ appMode: () => 'basic', locale: () => 'es' });
    trackUsage('tool.select', { tool: 'member' });
    trackUsage('solve', { outcome: 'ok', ms: 12 });
    await flushUsage();

    expect(sent).toHaveLength(1);
    const body = sent[0].body;
    expect(sent[0].url).toMatch(/\/api\/v1\/insights\/events$/);
    expect(body.install_id).toBe(storage.get(INSTALL_ID_KEY));
    expect(body.app_mode).toBe('basic');
    expect(body.locale).toBe('es');
    expect((body.events as { name: string; props: unknown }[]).map((e) => [e.name, e.props])).toEqual([
      ['tool.select', { tool: 'member' }],
      ['solve', { outcome: 'ok', ms: 12 }],
    ]);

    trackUsage('solve', {});
    await flushUsage();
    expect(sent[1].body.install_id).toBe(body.install_id);
  });

  it('keeps only scalar props with safe keys, and cuts long strings', async () => {
    const { cleanProps } = await load();
    const props = cleanProps({
      tool: 'member',
      ms: 4,
      dim3: true,
      geometry: { nodes: [1, 2] },
      list: [1],
      'Bad Key': 'x',
      nan: Number.NaN,
      note: 'x'.repeat(200),
    });
    expect(props).toEqual({ tool: 'member', ms: 4, dim3: true, note: 'x'.repeat(120) });
  });

  it('ignores malformed event names', async () => {
    const { usageConsent, trackUsage, pendingUsage } = await load();
    usageConsent.set('granted');
    trackUsage('Not A Name');
    trackUsage('ok.name');
    expect(pendingUsage().map((e) => e.name)).toEqual(['ok.name']);
  });

  it('stops queueing for the visit once the server says it is switched off', async () => {
    const { usageConsent, trackUsage, flushUsage, pendingUsage } = await load();
    usageConsent.set('granted');
    reply = () => json(202, { accepted: 0, rejected: 0, enabled: false });
    trackUsage('solve');
    await flushUsage();
    trackUsage('solve');
    expect(pendingUsage()).toEqual([]);
  });

  it('drops the queue when the user stops sharing, and sends on hide with keepalive', async () => {
    const { usageConsent, trackUsage, pendingUsage, installUsageLifecycle } = await load();
    const listeners: Record<string, () => void> = {};
    vi.stubGlobal('document', {
      visibilityState: 'visible',
      addEventListener: (k: string, f: () => void) => { listeners[k] = f; },
      removeEventListener: () => {},
    });
    const stop = installUsageLifecycle();
    usageConsent.set('granted');
    trackUsage('solve');
    usageConsent.set('denied');
    expect(pendingUsage()).toEqual([]);

    usageConsent.set('granted');
    trackUsage('solve');
    (globalThis.document as { visibilityState: string }).visibilityState = 'hidden';
    listeners.visibilitychange();
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].keepalive).toBe(true);
    stop();
  });

  it('flushes on its own after the interval', async () => {
    vi.useFakeTimers();
    const { usageConsent, trackUsage } = await load();
    usageConsent.set('granted');
    trackUsage('solve');
    expect(sent).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(sent).toHaveLength(1);
  });
});

describe('the usage consent', () => {
  it('starts undecided and remembers the choice', async () => {
    let { usageConsent, USAGE_CONSENT_KEY } = await load();
    expect(usageConsent.choice).toBe('undecided');
    usageConsent.set('denied');
    expect(JSON.parse(storage.get(USAGE_CONSENT_KEY)!).choice).toBe('denied');

    ({ usageConsent } = await load());
    expect(usageConsent.choice).toBe('denied');
    expect(usageConsent.decided).toBe(true);
    expect(usageConsent.granted).toBe(false);
  });

  it('reads a corrupt record as undecided', async () => {
    storage.set('stabileo-usage-consent', '{not json');
    const { usageConsent } = await load();
    expect(usageConsent.choice).toBe('undecided');
  });
});
