/**
 * The one script every visitor to stabileo.com executes.
 *
 * It is inlined into `dist/index.html` by scripts/prerender.ts, it is the only
 * copy of the language rule that is not written in TypeScript, and until this
 * file existed nothing tested it. The failure it shipped was silent and
 * asymmetric: a dropped query string, on the root, for Spanish and Portuguese
 * browsers only — a reader whose language is the fallback is never redirected,
 * so nobody testing in English would ever have seen it.
 *
 * Run in a real VM against stub globals rather than asserted as a string,
 * because what matters is the behaviour, not the spelling.
 */
import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import { rootHandoffScript } from '../root-handoff';

const OFFERED = ['en', 'es', 'pt'] as const;
const FALLBACK = 'en';

/** Where the script sends a browser, or null if it leaves it alone. */
function handoff(
  languages: string[],
  { pathname = '/', search = '', hash = '' }: { pathname?: string; search?: string; hash?: string } = {},
): string | null {
  let replaced: string | null = null;
  const context = vm.createContext({
    URLSearchParams,
    location: { pathname, search, hash, replace: (url: string) => (replaced = url) },
    navigator: { languages, language: languages[0] },
  });
  vm.runInContext(rootHandoffScript(OFFERED, FALLBACK), context);
  return replaced;
}

describe('the root language handoff', () => {
  it('sends a browser to the first language it asks for that we offer', () => {
    expect(handoff(['es-AR'])).toBe('/es');
    expect(handoff(['pt-BR', 'en-US'])).toBe('/pt');
    // Not the first language, the first OFFERED one.
    expect(handoff(['de-DE', 'es-AR'])).toBe('/es');
  });

  it('leaves a browser alone when the fallback is what it wanted', () => {
    expect(handoff(['en-US'])).toBeNull();
    // German and Japanese get the fallback, which is already what `/` serves.
    expect(handoff(['de-DE', 'ja'])).toBeNull();
    // English ahead of Spanish means English, so there is nothing to do.
    expect(handoff(['en-GB', 'es-AR'])).toBeNull();
    expect(handoff([])).toBeNull();
  });

  it('carries the query string and the fragment across', () => {
    // The defect this file was written for. A campaign link arriving at the
    // root lost its attribution, and only for the languages the prefixes
    // exist to serve.
    expect(handoff(['pt-BR'], { search: '?utm_source=x&utm_campaign=y' })).toBe(
      '/pt?utm_source=x&utm_campaign=y',
    );
    expect(handoff(['es-AR'], { hash: '#top' })).toBe('/es#top');
    expect(handoff(['es-AR'], { search: '?a=1', hash: '#b' })).toBe('/es?a=1#b');
  });

  it('does not touch a route bounced through 404.html', () => {
    // A shared model link arrives as /?route=… . Redirecting it would throw
    // someone opening their own structure onto the marketing page.
    expect(handoff(['pt-BR'], { search: '?route=%2Fapp%2Fbasic' })).toBeNull();
    expect(handoff(['pt-BR'], { search: '?embed' })).toBeNull();
  });

  it('only ever fires on the bare root', () => {
    expect(handoff(['pt-BR'], { pathname: '/pt' })).toBeNull();
    expect(handoff(['pt-BR'], { pathname: '/es/blog' })).toBeNull();
    expect(handoff(['pt-BR'], { pathname: '/app/basic' })).toBeNull();
  });

  it('survives a browser with no navigator.languages', () => {
    let replaced: string | null = null;
    const context = vm.createContext({
      URLSearchParams,
      location: { pathname: '/', search: '', hash: '', replace: (url: string) => (replaced = url) },
      navigator: { language: 'es-ES' },
    });
    vm.runInContext(rootHandoffScript(OFFERED, FALLBACK), context);
    expect(replaced).toBe('/es');
  });

  it('is built from the list it is given, not from hardcoded languages', () => {
    // The list comes from LOCALES in prerender.ts, which
    // assertLocalesMatchTheApp() ties to the application's PUBLIC_LOCALES.
    // Adding a language must not require editing the script by hand.
    let replaced: string | null = null;
    const context = vm.createContext({
      URLSearchParams,
      location: { pathname: '/', search: '', hash: '', replace: (url: string) => (replaced = url) },
      navigator: { languages: ['fr-FR'], language: 'fr-FR' },
    });
    vm.runInContext(rootHandoffScript([...OFFERED, 'fr'], FALLBACK), context);
    expect(replaced).toBe('/fr');
  });
});
