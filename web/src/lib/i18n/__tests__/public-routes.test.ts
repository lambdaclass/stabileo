/**
 * The public URL grammar, pinned.
 *
 * These strings are the ones people share and search engines store, so the
 * cost of getting them wrong is paid long after the mistake: a link that used
 * to work, an indexed address that now 404s. Cheap to assert, expensive to
 * discover.
 */
import { describe, it, expect } from 'vitest';
import {
  parsePublicPath,
  publicHref,
  publicUrl,
  alternateUrls,
  preferredPublicLocale,
  SITE_ORIGIN,
} from '../public-routes';

describe('parsePublicPath', () => {
  it('reads the language out of the prefix', () => {
    expect(parsePublicPath('/es/blog/x')).toEqual({ locale: 'es', path: '/blog/x' });
    expect(parsePublicPath('/pt')).toEqual({ locale: 'pt', path: '/' });
    expect(parsePublicPath('/en/')).toEqual({ locale: 'en', path: '/' });
  });

  it('leaves an unprefixed path alone, so old links keep working', () => {
    // Every link shared before this change looks like this, including the one
    // in the paper. They must not become 404s.
    expect(parsePublicPath('/blog/x')).toEqual({ locale: null, path: '/blog/x' });
    expect(parsePublicPath('/')).toEqual({ locale: null, path: '/' });
  });

  it('does not mistake a route for a language', () => {
    // `/blog` starts with a segment that is not a locale; if the parser were
    // sloppy about it, the blog index would become the "blog" language.
    expect(parsePublicPath('/blog').locale).toBeNull();
    expect(parsePublicPath('/app/basic').locale).toBeNull();
    expect(parsePublicPath('/demo').locale).toBeNull();
  });
});

describe('publicHref / publicUrl', () => {
  it('builds the prefixed form', () => {
    expect(publicHref('/blog/x', 'pt')).toBe('/pt/blog/x');
    expect(publicHref('/', 'es')).toBe('/es');
    expect(publicUrl('/blog', 'en')).toBe(`${SITE_ORIGIN}/en/blog`);
  });

  it('round-trips with the parser', () => {
    for (const path of ['/', '/blog', '/blog/the-determinism-boundary']) {
      for (const locale of ['en', 'es', 'pt'] as const) {
        expect(parsePublicPath(publicHref(path, locale))).toEqual({ locale, path });
      }
    }
  });
});

describe('alternateUrls', () => {
  it('names every language plus x-default, absolutely', () => {
    const alts = alternateUrls('/blog/x');
    expect(alts.map((a) => a.hreflang).sort()).toEqual(['en', 'es', 'pt', 'x-default']);
    // Relative hreflang is ignored by crawlers, silently.
    for (const a of alts) expect(a.href.startsWith('https://')).toBe(true);
    // x-default names the English page, not the bare root: `/` declares `/en`
    // as its canonical, so pointing the default at `/` would name a URL that
    // is not canonical for itself.
    expect(alts.find((a) => a.hreflang === 'x-default')!.href).toBe(`${SITE_ORIGIN}/en`);
  });
});

describe('preferredPublicLocale', () => {
  it('takes the first language it speaks', () => {
    expect(preferredPublicLocale(['pt-BR', 'en-US'])).toBe('pt');
    expect(preferredPublicLocale(['es-AR'])).toBe('es');
  });

  it('falls back to English for a browser it does not speak', () => {
    // The x-default rule: German and Japanese browsers get English, not a
    // half-translated page and not a 404.
    expect(preferredPublicLocale(['de-DE', 'ja'])).toBe('en');
    expect(preferredPublicLocale([])).toBe('en');
  });
});
