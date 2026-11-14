import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let accountsOn = true;
vi.mock('../../features', () => ({ accounts: () => accountsOn }));

const { startTracking, tracking, resetTrackingForTests, hashedId } = await import('../tracking');
const { adConsent } = await import('../ad-consent.svelte');

type Win = Record<string, unknown> & { fbq?: { queue: unknown[] }; dataLayer?: Record<string, unknown>[] };

function stubBrowser({ webdriver = false, framed = false, hash = '' } = {}) {
  const scripts: string[] = [];
  const win: Win = {};
  win.top = framed ? {} : win;
  win.self = win;
  win.location = { search: '?utm_campaign=c1', pathname: '/es/register/', hostname: 'stabileo.com', protocol: 'https:', origin: 'https://stabileo.com', hash };
  const document = {
    cookie: '',
    referrer: '',
    createElement: () => ({ set src(v: string) { scripts.push(v); } }),
    head: { appendChild: () => undefined },
  };
  win.document = document;
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', document);
  vi.stubGlobal('location', win.location);
  vi.stubGlobal('navigator', { webdriver });
  return { win, scripts };
}

const ids = { meta_pixel_id: '123456789', gtm_container_id: 'GTM-ABC123' };

beforeEach(() => {
  accountsOn = true;
  resetTrackingForTests();
  adConsent.resetForTests();
});

async function startConsented(win?: Win) {
  void win;
  await startTracking(async () => ids);
  adConsent.decide('granted');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('tracking', () => {
  it('loads nothing and writes no cookie until the person accepts advertising cookies', async () => {
    const { win, scripts } = stubBrowser();
    await startTracking(async () => ids);

    expect(adConsent.asking).toBe(true);
    expect(scripts).toEqual([]);
    expect(win.fbq).toBeUndefined();
    expect(document.cookie).toBe('');
    await tracking.completeRegistration('acc-0');

    adConsent.decide('granted');
    expect(scripts).toHaveLength(2);
    expect(document.cookie).toContain('stb_visit=');
  });

  it('a person who declines gets no tracker, no cookie and no events', async () => {
    const { win, scripts } = stubBrowser();
    await startTracking(async () => ids);
    adConsent.decide('denied');
    await tracking.completeRegistration('acc-0');
    await new Promise((r) => setTimeout(r, 0));

    expect(adConsent.asking).toBe(false);
    expect(scripts).toEqual([]);
    expect(win.fbq).toBeUndefined();
    expect(document.cookie).toBe('');
  });

  it('never sends the fragment, where a shared model lives', async () => {
    const { win } = stubBrowser({ hash: '#data=MODEL' });
    await startConsented();

    expect(win.fbq!.queue).toEqual([['set', 'autoConfig', false, '123456789'], ['init', '123456789']]);
    expect(win.dataLayer!.at(-1)).toMatchObject({ event: 'page_view', page_location: 'https://stabileo.com/es/register/?utm_campaign=c1' });
    expect(JSON.stringify(win.dataLayer)).not.toContain('MODEL');
  });

  it('loads the pixel with its automatic events off, GTM, and a page view in each', async () => {
    const { win, scripts } = stubBrowser();
    await startConsented();

    expect(scripts).toEqual(['https://connect.facebook.net/en_US/fbevents.js', 'https://www.googletagmanager.com/gtm.js?id=GTM-ABC123']);
    expect(win.fbq!.queue).toEqual([['set', 'autoConfig', false, '123456789'], ['init', '123456789'], ['track', 'PageView']]);
    expect((win.fbq as unknown as { disablePushState: boolean }).disablePushState).toBe(true);
    expect(win.dataLayer!.at(-1)).toMatchObject({ event: 'page_view', page_path: '/es/register/' });
  });

  it('names the click apart from the conversion, and sends the SHA-256 of the account id as the event id', async () => {
    const { win } = stubBrowser();
    document.cookie = 'stb_visit=' + encodeURIComponent(JSON.stringify({ utm_campaign: 'c1' }));
    await startConsented();
    win.fbq!.queue.length = 0;

    tracking.signUpClick('register.hero');
    await tracking.completeRegistration('acc-1');
    await tracking.firstSave('acc-1');
    await new Promise((r) => setTimeout(r, 0));
    const h = await hashedId('acc-1');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify([win.fbq!.queue, win.dataLayer])).not.toContain('acc-1');

    expect(win.fbq!.queue).toEqual([
      ['trackCustom', 'SignUpClick', { placement: 'register.hero' }],
      ['track', 'CompleteRegistration', {}, { eventID: h }],
      ['trackCustom', 'FirstSave', {}, { eventID: `first_save-${h}` }],
    ]);
    expect(win.dataLayer!.slice(-3)).toEqual([
      { event: 'sign_up_click', placement: 'register.hero', utm_campaign: 'c1' },
      { event: 'sign_up', event_id: h, utm_campaign: 'c1' },
      { event: 'first_save', event_id: `first_save-${h}`, utm_campaign: 'c1' },
    ]);
  });

  it('loads nothing for an automated browser, with the accounts feature off, inside a frame, or without ids', async () => {
    for (const [setup, on] of [[{ webdriver: true }, true], [{}, false], [{ framed: true }, true]] as const) {
      resetTrackingForTests();
      accountsOn = on;
      const { win, scripts } = stubBrowser(setup);
      const fetchIds = vi.fn(async () => ids);
      expect(await startTracking(fetchIds)).toBeNull();
      expect(fetchIds).not.toHaveBeenCalled();
      expect(scripts).toEqual([]);
      expect(win.fbq).toBeUndefined();
    }

    resetTrackingForTests();
    accountsOn = true;
    const { win, scripts } = stubBrowser();
    await startTracking(async () => ({ meta_pixel_id: null, gtm_container_id: null }));
    tracking.signUpClick('header');
    expect(scripts).toEqual([]);
    expect(win.fbq).toBeUndefined();
    expect(adConsent.available).toBe(false);
    expect(adConsent.asking).toBe(false);
  });

  it('inside the register page frame, events go to the page above', async () => {
    const relay = vi.fn();
    const { win } = stubBrowser({ framed: true });
    (win.top as Record<string, unknown>).stbTrackingRelay = relay;
    await startTracking(async () => ids);
    await tracking.completeRegistration('acc-2');
    const h = await hashedId('acc-2');
    expect(relay).toHaveBeenCalledWith({ pixel: ['track', 'CompleteRegistration', {}, { eventID: h }], gtm: { event: 'sign_up', event_id: h } });
  });

  it('without Web Crypto (a page served over plain http) the conversion is skipped, never thrown', async () => {
    const { win } = stubBrowser();
    await startConsented();
    const before = win.fbq!.queue.length;
    vi.stubGlobal('crypto', {});
    await expect(tracking.completeRegistration('acc-7')).resolves.toBeUndefined();
    await expect(tracking.firstSave('acc-7')).resolves.toBeUndefined();
    expect(win.fbq!.queue).toHaveLength(before);
  });

  it('an in-page anchor is not a shared model: the page view still goes out', async () => {
    const { win } = stubBrowser({ hash: '#pricing' });
    await startConsented();
    expect(win.fbq!.queue.at(-1)).toEqual(['track', 'PageView']);
  });

  it('reopening the choice after accepting keeps the trackers until the person declines, which clears and reloads', async () => {
    const { win } = stubBrowser();
    const reload = vi.fn();
    (win.location as Record<string, unknown>).reload = reload;
    await startConsented();

    adConsent.reopen();
    expect(adConsent.asking).toBe(true);
    expect(adConsent.granted).toBe(true);
    await tracking.completeRegistration('acc-4');
    expect((win.fbq!.queue.at(-1) as unknown[]).slice(0, 2)).toEqual(['track', 'CompleteRegistration']);

    adConsent.decide('denied');
    expect(adConsent.asking).toBe(false);
    expect(reload).toHaveBeenCalledOnce();
    const before = win.fbq!.queue.length;
    await tracking.completeRegistration('acc-4');
    expect(win.fbq!.queue).toHaveLength(before);
  });

  it('a pixel that throws never reaches the caller', async () => {
    const { win } = stubBrowser();
    await startConsented();
    win.fbq = (() => { throw new Error('blocked'); }) as never;
    await expect(tracking.completeRegistration('acc-3')).resolves.toBeUndefined();
    await new Promise((r) => setTimeout(r, 0));
  });
});
