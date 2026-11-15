import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../features', () => ({ accounts: () => true }));
vi.mock('../ad-consent-banner', () => ({ mountAdConsentBanner: vi.fn() }));

const { startTracking, tracking, resetTrackingForTests } = await import('../tracking');
const { adConsent } = await import('../ad-consent.svelte');

let finishHash: (hash: ArrayBuffer) => void;
let calls: unknown[][];

beforeEach(async () => {
  resetTrackingForTests();
  adConsent.resetForTests();
  calls = [];
  const win: Record<string, unknown> = { location: { origin: 'https://stabileo.com', pathname: '/en/register/', search: '', hash: '' } };
  win.top = win;
  win.self = win;
  win.fbq = Object.assign((...args: unknown[]) => { calls.push(args); }, { queue: [] });
  vi.stubGlobal('window', win);
  vi.stubGlobal('location', win.location);
  vi.stubGlobal('document', { cookie: '', referrer: '', createElement: () => ({}), head: { appendChild: vi.fn() } });
  vi.stubGlobal('navigator', { webdriver: false });
  vi.stubGlobal('crypto', { subtle: { digest: () => new Promise<ArrayBuffer>(resolve => { finishHash = resolve; }) } });
  finishHash = () => {};
  await startTracking(async () => ({ meta_pixel_id: '123456789', gtm_container_id: null }));
});

afterEach(() => { vi.unstubAllGlobals(); });

it.each(['completeRegistration', 'firstSave'] as const)(
  'known wrong result: #2099 %s cannot enter a later tracking session while its hash is pending',
  async method => {
    const pending = tracking[method]('account-before-reset');
    resetTrackingForTests();
    adConsent.resetForTests();
    await startTracking(async () => ({ meta_pixel_id: '123456789', gtm_container_id: null }));
    adConsent.decide('granted');
    calls.length = 0;
    finishHash(new ArrayBuffer(32));
    await pending;
    await Promise.resolve();
    expect(calls).toEqual([]);
  },
);

it.each(['completeRegistration', 'firstSave'] as const)('%s sends exactly once when invoked with consent', async method => {
  adConsent.decide('granted');
  calls.length = 0;
  const pending = tracking[method]('account-with-consent');
  finishHash(new ArrayBuffer(32));
  await pending;
  await Promise.resolve();
  expect(calls).toHaveLength(1);
  expect(calls[0][1]).toBe(method === 'firstSave' ? 'FirstSave' : 'CompleteRegistration');
});


it.each(['completeRegistration', 'firstSave'] as const)('%s retains main consent timing within the same session', async method => {
  const pending = tracking[method]('account-before-consent');
  adConsent.decide('granted');
  calls.length = 0;
  finishHash(new ArrayBuffer(32));
  await pending;
  await Promise.resolve();
  expect(calls).toHaveLength(1);
  expect(calls[0][1]).toBe(method === 'firstSave' ? 'FirstSave' : 'CompleteRegistration');
});


it.each(['completeRegistration', 'firstSave'] as const)('%s retains main timing when tracking starts during hashing', async method => {
  resetTrackingForTests();
  adConsent.resetForTests();
  const pending = tracking[method]('account-before-start');
  await startTracking(async () => ({ meta_pixel_id: '123456789', gtm_container_id: null }));
  adConsent.decide('granted');
  calls.length = 0;
  finishHash(new ArrayBuffer(32));
  await pending;
  await Promise.resolve();
  expect(calls).toHaveLength(1);
  expect(calls[0][1]).toBe(method === 'firstSave' ? 'FirstSave' : 'CompleteRegistration');
});
