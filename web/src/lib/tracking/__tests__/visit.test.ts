import { describe, it, expect, vi } from 'vitest';
import { captureVisit, clearAdCookies, externalHost, noteArrival, readVisit, signupSource, visitFrom } from '../visit';
import { adAttribution, pixelCookies } from '../attribution';
import { adConsent } from '../ad-consent.svelte';

const loc = (search: string, pathname = '/es/register/') => ({ search, pathname, hostname: 'stabileo.com', protocol: 'https:' });

function fakeWindow(search: string, referrer = '', cookie = '') {
  const doc = { cookie, referrer };
  const jar: string[] = cookie ? [cookie] : [];
  Object.defineProperty(doc, 'cookie', {
    get: () => jar.join('; '),
    set: (v: string) => {
      const name = v.split('=')[0];
      const i = jar.findIndex((c) => c.startsWith(`${name}=`));
      const value = v.split(';')[0];
      if (i >= 0) jar[i] = value;
      else jar.push(value);
    },
  });
  return { location: loc(search) as unknown as Location, document: doc as unknown as Document };
}

describe('the visit cookie', () => {
  it('keeps the tags and click ids of an ad arrival, the site it came from and the page', () => {
    const visit = visitFrom('?utm_source=ig&utm_medium=paid&utm_campaign=120&utm_content=a1&fbclid=IwAR&other=x', 'https://l.instagram.com/', loc(''), new Date('2026-11-02T12:00:00Z'));
    expect(visit).toEqual({ utm_source: 'ig', utm_medium: 'paid', utm_campaign: '120', utm_content: 'a1', fbclid: 'IwAR', referrer: 'l.instagram.com', landing: '/es/register/', first_seen: '2026-11-02T12:00:00.000Z' });
  });

  it('a direct visit says nothing, and our own site is not a referrer', () => {
    expect(visitFrom('', '', loc(''))).toEqual({});
    expect(externalHost('https://www.stabileo.com/blog/', 'stabileo.com')).toBeUndefined();
  });

  it('the last visit that brought anything wins; a direct one leaves it', () => {
    const w = fakeWindow('?gclid=G1&network=g', 'https://www.google.com/');
    captureVisit(w);
    expect(readVisit(w.document)).toMatchObject({ gclid: 'G1', network: 'g', referrer: 'google.com' });

    const later = fakeWindow('', '', w.document.cookie);
    captureVisit(later);
    expect(readVisit(later.document).gclid).toBe('G1');

    const another = fakeWindow('?utm_source=newsletter&utm_medium=email', '', w.document.cookie);
    captureVisit(another);
    expect(readVisit(another.document)).toMatchObject({ utm_source: 'newsletter', utm_medium: 'email' });
    expect(readVisit(another.document).gclid).toBeUndefined();
  });

  it('the sign-up source adds what asked for the account and the page', () => {
    const w = fakeWindow('?utm_source=fb');
    captureVisit(w);
    expect(signupSource('gate.save', true, w.document, '/app/basic')).toMatchObject({ utm_source: 'fb', trigger: 'gate.save', page: '/app/basic' });
  });

  it('without consent the source is this arrival, kept in memory, and the cookie is never read', () => {
    const w = fakeWindow('?utm_source=ig&utm_campaign=c9', '', 'stb_visit=' + encodeURIComponent(JSON.stringify({ utm_source: 'old' })));
    noteArrival(w);
    expect(signupSource('register.hero', false, w.document, '/es/register/')).toEqual({ utm_source: 'ig', utm_campaign: 'c9', landing: '/es/register/', first_seen: expect.any(String), trigger: 'register.hero', page: '/es/register/' });
    expect(w.document.cookie).toBe('stb_visit=' + encodeURIComponent(JSON.stringify({ utm_source: 'old' })));
  });

  it('declining clears the advertising cookies and keeps the rest', () => {
    const written: string[] = [];
    const doc = { get cookie() { return 'stb_visit=x; _fbp=fb.1; _ga_ABC=1; _gcl_au=1; theme=dark'; }, set cookie(v: string) { written.push(v); } };
    clearAdCookies(doc as unknown as Document, 'stabileo.com', false);
    expect(new Set(written.map((w) => w.split('=')[0]))).toEqual(new Set(['stb_visit', '_fbp', '_ga_ABC', '_gcl_au']));
  });

  it('on https the clearing also matches cookies written Secure, which a plain expiry leaves alive', () => {
    const written: string[] = [];
    const doc = { get cookie() { return '_fbp=fb.1'; }, set cookie(v: string) { written.push(v); } };
    clearAdCookies(doc as unknown as Document, 'stabileo.com', true);
    expect(written).toContain('_fbp=; path=/; max-age=0; domain=.stabileo.com; SameSite=None; Secure');
    expect(written).toContain('_fbp=; path=/; max-age=0');
  });

  it('a broken cookie reads as nothing', () => {
    expect(readVisit({ cookie: 'stb_visit=%7Bnot-json' } as Document)).toEqual({});
  });
});

describe('the pixel cookies', () => {
  it('go to the backend only with advertising consent, marked as consented', () => {
    adConsent.resetForTests();
    expect(adAttribution()).toEqual({});
    adConsent.decide('granted');
    vi.stubGlobal('document', { cookie: '_fbp=fb.1.1.2' });
    vi.stubGlobal('location', { search: '' });
    expect(adAttribution()).toEqual({ consent: true, fbp: 'fb.1.1.2' });
    vi.unstubAllGlobals();
    adConsent.resetForTests();
  });

  it('sends _fbp and _fbc, or builds _fbc from a fbclid in the address', () => {
    expect(pixelCookies({ cookie: '_fbp=fb.1.1.2; _fbc=fb.1.1.IwAR' } as Document, '')).toEqual({ fbp: 'fb.1.1.2', fbc: 'fb.1.1.IwAR' });
    expect(pixelCookies({ cookie: '' } as Document, '?fbclid=XYZ', 1700000000000)).toEqual({ fbc: 'fb.1.1700000000000.XYZ' });
    expect(pixelCookies({ cookie: '' } as Document, '')).toEqual({});
  });
});
