import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let accountsOn = true;
vi.mock('../../features', () => ({ accounts: () => accountsOn }));

const { startTracking, tracking, resetTrackingForTests } = await import('../tracking');

type Win = Record<string, unknown> & { fbq?: { queue: unknown[] }; dataLayer?: Record<string, unknown>[] };

function stubBrowser({ webdriver = false, framed = false } = {}) {
  const scripts: string[] = [];
  const win: Win = {};
  win.top = framed ? {} : win;
  win.self = win;
  win.location = { search: '?utm_campaign=c1', pathname: '/es/register/', hostname: 'stabileo.com', protocol: 'https:' };
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
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('tracking', () => {
  it('loads the pixel with its automatic events off, GTM, and a page view in each', async () => {
    const { win, scripts } = stubBrowser();
    await startTracking(async () => ids);

    expect(scripts).toEqual(['https://connect.facebook.net/en_US/fbevents.js', 'https://www.googletagmanager.com/gtm.js?id=GTM-ABC123']);
    expect(win.fbq!.queue).toEqual([['set', 'autoConfig', false, '123456789'], ['init', '123456789'], ['track', 'PageView']]);
    expect((win.fbq as unknown as { disablePushState: boolean }).disablePushState).toBe(true);
    expect(win.dataLayer!.at(-1)).toMatchObject({ event: 'page_view', page_path: '/es/register/' });
  });

  it('names the click apart from the conversion, and sends the account id as the event id', async () => {
    const { win } = stubBrowser();
    document.cookie = 'stb_visit=' + encodeURIComponent(JSON.stringify({ utm_campaign: 'c1' }));
    await startTracking(async () => ids);
    win.fbq!.queue.length = 0;

    tracking.signUpClick('register.hero');
    tracking.completeRegistration('acc-1');
    tracking.firstSave('acc-1');
    await new Promise((r) => setTimeout(r, 0));

    expect(win.fbq!.queue).toEqual([
      ['trackCustom', 'SignUpClick', { placement: 'register.hero' }],
      ['track', 'CompleteRegistration', {}, { eventID: 'acc-1' }],
      ['trackCustom', 'FirstSave', {}, { eventID: 'first_save-acc-1' }],
    ]);
    expect(win.dataLayer!.slice(-3)).toEqual([
      { event: 'sign_up_click', placement: 'register.hero', utm_campaign: 'c1' },
      { event: 'sign_up', event_id: 'acc-1', utm_campaign: 'c1' },
      { event: 'first_save', event_id: 'first_save-acc-1', utm_campaign: 'c1' },
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
  });

  it('inside the register page frame, events go to the page above', async () => {
    const relay = vi.fn();
    const { win } = stubBrowser({ framed: true });
    (win.top as Record<string, unknown>).__stabileoTracking = relay;
    await startTracking(async () => ids);
    tracking.completeRegistration('acc-2');
    expect(relay).toHaveBeenCalledWith({ pixel: ['track', 'CompleteRegistration', {}, { eventID: 'acc-2' }], gtm: { event: 'sign_up', event_id: 'acc-2' } });
  });

  it('a pixel that throws never reaches the caller', async () => {
    const { win } = stubBrowser();
    await startTracking(async () => ids);
    win.fbq = (() => { throw new Error('blocked'); }) as never;
    expect(() => tracking.completeRegistration('acc-3')).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
  });
});
