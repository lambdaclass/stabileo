import { API_URL } from '../api/client';
import { APP_VERSION } from '../build-info';
import { usageConsent } from './consent.svelte';

export type PropValue = string | number | boolean;
export type UsageProps = Record<string, PropValue>;

interface QueuedEvent {
  name: string;
  at: string;
  props: UsageProps;
}

export interface UsageContext {
  appMode(): string | null;
  locale(): string | null;
  enabled(): boolean;
}

export const INSTALL_ID_KEY = 'stabileo-install-id';
export const EVENTS_PATH = '/api/v1/insights/events';

const FLUSH_MS = 30_000;
const MAX_QUEUE = 50;
const MAX_HELD = 200;
const MAX_STRING = 120;
const PROP_KEY = /^[a-z][a-z0-9_]{0,31}$/;
const EVENT_NAME = /^[a-z][a-z0-9_.:-]{0,63}$/;

let queue: QueuedEvent[] = [];
let held: QueuedEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let serverOff = false;
let context: UsageContext = { appMode: () => null, locale: () => null, enabled: () => false };
const sessionId = randomId();

function randomId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function installId(): string {
  try {
    const existing = localStorage.getItem(INSTALL_ID_KEY);
    if (existing && /^[A-Za-z0-9-]{8,64}$/.test(existing)) return existing;
    const fresh = randomId();
    localStorage.setItem(INSTALL_ID_KEY, fresh);
    return fresh;
  } catch {
    return sessionId;
  }
}

function automated(): boolean {
  return typeof navigator !== 'undefined' && navigator.webdriver === true;
}

/** Keeps only scalar props with safe keys, cutting long strings: nothing else is ever sent. */
export function cleanProps(props: Record<string, unknown> = {}): UsageProps {
  const out: UsageProps = {};
  for (const [key, value] of Object.entries(props)) {
    if (!PROP_KEY.test(key) || Object.keys(out).length >= 20) continue;
    if (typeof value === 'string') out[key] = value.slice(0, MAX_STRING);
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    else if (typeof value === 'boolean') out[key] = value;
  }
  return out;
}

export function setUsageContext(next: UsageContext): void {
  context = next;
}

function schedule(): void {
  if (queue.length >= MAX_QUEUE) void flushUsage();
  else if (queue.length > 0 && !timer) timer = setTimeout(() => void flushUsage(), FLUSH_MS);
}

/** Until the person answers the usage notice, events wait in memory: sent if they agree, dropped if not. */
export function trackUsage(name: string, props: Record<string, unknown> = {}): void {
  if (usageConsent.choice === 'denied' || serverOff || automated() || !EVENT_NAME.test(name)) return;
  const event = { name, at: new Date().toISOString(), props: cleanProps(props) };
  if (!usageConsent.granted) {
    if (held.length < MAX_HELD) held.push(event);
    return;
  }
  queue.push(event);
  schedule();
}

export function pendingUsage(): readonly QueuedEvent[] {
  return queue;
}

export function heldUsage(): readonly QueuedEvent[] {
  return held;
}

function payload(events: QueuedEvent[]) {
  return {
    install_id: installId(),
    session_id: sessionId,
    app_version: APP_VERSION,
    app_mode: context.appMode(),
    locale: context.locale(),
    events,
  };
}

export async function flushUsage(opts: { keepalive?: boolean } = {}): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (queue.length === 0) return;
  const events = queue;
  queue = [];
  if (!usageConsent.granted || !context.enabled()) return;
  try {
    const resp = await fetch(`${API_URL}${EVENTS_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload(events)),
      keepalive: opts.keepalive === true,
    });
    if (resp.status === 429) return;
    if (resp.ok) {
      const body = (await resp.json().catch(() => null)) as { enabled?: boolean } | null;
      if (body && body.enabled === false) serverOff = true;
    }
  } catch {
    /* offline or blocked: these events are dropped, never retried */
  }
}

export function installUsageLifecycle(): () => void {
  if (typeof document === 'undefined') return () => {};
  const onHide = () => {
    if (document.visibilityState === 'hidden') void flushUsage({ keepalive: true });
  };
  document.addEventListener('visibilitychange', onHide);
  return () => document.removeEventListener('visibilitychange', onHide);
}

usageConsent.onChange((c) => {
  if (c === 'denied') {
    queue = [];
    held = [];
  } else if (held.length > 0) {
    queue.push(...held);
    held = [];
    schedule();
  }
});

