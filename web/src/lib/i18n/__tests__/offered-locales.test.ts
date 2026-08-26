/**
 * Three languages, offered honestly — and the rules that keep the offer true.
 *
 * The picker listed fourteen. Eleven of those dictionaries are largely English underneath, so a
 * German browser auto-detected into a German label over an English UI, which reads as broken
 * rather than as untranslated. PR20 narrowed the offer to English, Español and Português and made
 * detection, persistence and the picker agree about that list.
 *
 * Every case below is one the app can actually be in, and each is asserted through the module's
 * own entry points rather than by inspecting a variable:
 *
 *   - the list itself, because the picker renders it and the tests below all depend on it;
 *   - detection for each offered language, including regional variants (`es-AR`, `pt-BR`);
 *   - detection for a language that is NOT offered, which must land on English;
 *   - a manual choice, persisted and honoured across a reload;
 *   - a stored choice that is no longer offered, which must NOT be honoured;
 *   - a hot switch, which must not need a reload.
 *
 * ── Why every case re-imports the module ───────────────────────────
 *
 * `_locale` is initialised at module scope, from `navigator` and `localStorage`, exactly once —
 * which is the behaviour under test. A test that imported once and then changed `navigator` would
 * be asserting about a decision the module had already made. `vi.resetModules()` plus a dynamic
 * import is what makes "open the app in a Portuguese browser" a thing this file can say.
 */
import { allShippedLocales } from '../locales/all';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

type Store = typeof import('../store.svelte');

/** A localStorage that behaves like one, per test. */
function memoryStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, String(v)); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => { map.clear(); },
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
    /** Test-only: what the app has persisted so far. */
    _dump: () => Object.fromEntries(map),
  };
}

/**
 * Boot the i18n store as a browser with these languages and this storage would.
 *
 * Returns the store AND the storage, because "did it persist the right thing" is half of what
 * these tests are about.
 */
async function boot(languages: string[], seed: Record<string, string> = {}) {
  const storage = memoryStorage(seed);
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('navigator', { languages, language: languages[0] });
  vi.resetModules();
  const store: Store = await import('../store.svelte');
  return { store, storage };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('the languages the app offers', () => {
  beforeEach(() => { vi.resetModules(); });

  it('is exactly English, Español and Português', async () => {
    const { store } = await boot(['en']);
    expect([...store.OFFERED_LOCALES].sort()).toEqual(['en', 'es', 'pt']);
  });

  it('names each of them in its own language, so the picker is readable to its speaker',
    async () => {
      const { store } = await boot(['en']);
      expect(store.tAt('lang.en', 'en')).toBe('English');
      expect(store.tAt('lang.es', 'en')).toBe('Español');
      expect(store.tAt('lang.pt', 'en')).toBe('Português');
    });

  it('bundles exactly the dictionaries it offers, and keeps the rest on disk', async () => {
    /*
     * This used to assert the opposite — that the store ships MORE than it
     * offers — because holding all fourteen made re-enabling one a single
     * edit. Measured, the eleven unoffered ones were 2.0 MB of the bundle,
     * the largest single item in it, downloaded by every reader of a blog
     * page. They are unreachable at runtime, so nobody could ever see them.
     *
     * They are not deleted: ./locales/all.ts still holds all fourteen and the
     * parity gates still read every one, so the translation work is kept and
     * kept correct. What must not come back is loading them in a browser.
     */
    const { store } = await boot(['en']);
    expect(store.shippedLocales().sort()).toEqual([...store.OFFERED_LOCALES].sort());
    expect(allShippedLocales().length).toBeGreaterThan(store.OFFERED_LOCALES.length);
    for (const code of store.OFFERED_LOCALES) expect(allShippedLocales()).toContain(code);
  });
});

describe('detecting the browser language', () => {
  for (const [lang, expected] of [
    ['en', 'en'], ['es', 'es'], ['pt', 'pt'],
    ['en-US', 'en'], ['en-GB', 'en'], ['es-AR', 'es'], ['es-419', 'es'], ['pt-BR', 'pt'],
    ['pt-PT', 'pt'],
  ] as const) {
    it(`a browser set to ${lang} opens in ${expected}`, async () => {
      const { store } = await boot([lang]);
      expect(store.i18n.locale).toBe(expected);
    });
  }

  for (const lang of ['fr', 'de', 'it', 'ja', 'zh-CN', 'ru', 'ar', 'ko', 'hi', 'tr', 'id']) {
    it(`a browser set to ${lang} opens in English rather than a half-translated ${lang}`,
      async () => {
        // The dictionary exists — this is not "we have no French" — but it is mostly English
        // underneath, and a French label over English text is worse than English.
        const { store } = await boot([lang]);
        expect(store.i18n.locale).toBe('en');
      });
  }

  it('takes the first OFFERED language from the preference list, not the first language',
    async () => {
      // A browser configured "German, then Portuguese" prefers German, which the app does not
      // offer. Portuguese is the best honest match, and it is in the list.
      const { store } = await boot(['de', 'pt-BR', 'en']);
      expect(store.i18n.locale).toBe('pt');
    });

  it('falls back to English when the browser states nothing usable', async () => {
    const { store } = await boot([]);
    expect(store.i18n.locale).toBe('en');
  });

  it('persists what it detected, so the rest of the app reads one answer', async () => {
    const { store, storage } = await boot(['pt-BR']);
    expect(store.i18n.locale).toBe('pt');
    expect(storage._dump()['stabileo-lang']).toBe('pt');
    // Detection is not a manual choice, and must not claim to be one.
    expect(storage._dump()['stabileo-lang-manual']).toBeUndefined();
  });
});

describe('the choice a user makes', () => {
  it('switches the language immediately, without a reload', async () => {
    const { store } = await boot(['en']);
    expect(store.t('lang.es')).toBe('Español');
    const before = store.tAt('detailing.scene.showBars', 'en');
    store.setLocale('pt');
    expect(store.i18n.locale).toBe('pt');
    // A real string from the PRO flow, to prove `t()` follows the switch rather than the
    // picker merely changing its own value.
    expect(store.t('detailing.scene.showBars')).not.toBe(before);
    expect(store.t('detailing.scene.showBars'))
      .toBe(store.tAt('detailing.scene.showBars', 'pt'));
  });

  it('is persisted, and marked as the user\'s own', async () => {
    const { store, storage } = await boot(['en']);
    store.setLocale('es');
    expect(storage._dump()['stabileo-lang']).toBe('es');
    expect(storage._dump()['stabileo-lang-manual']).toBe('1');
  });

  it('survives a reload, even against a browser that says otherwise', async () => {
    const { storage } = await boot(['en']);
    // Reload: same storage, and a browser still set to English.
    const again = await boot(['en'], storage._dump());
    expect(again.store.i18n.locale).toBe('en');

    const chosen = await boot(['en']);
    chosen.store.setLocale('pt');
    const reloaded = await boot(['en'], chosen.storage._dump());
    expect(reloaded.store.i18n.locale, 'the choice outranks the browser').toBe('pt');
  });

  it('is refused when the code is not offered, rather than blanking the picker', async () => {
    // The picker's value is bound to `i18n.locale`; a `<select>` whose value matches none of its
    // options renders empty. Accepting 'de' here would show nothing, in a language nobody chose.
    const { store, storage } = await boot(['en']);
    store.setLocale('de');
    expect(store.i18n.locale).toBe('en');
    // Storage still holds what DETECTION wrote at boot, and the refused call left no trace:
    // no 'de', and no manual flag claiming a choice the user was not allowed to make.
    expect(storage._dump()['stabileo-lang']).toBe('en');
    expect(storage._dump()['stabileo-lang-manual']).toBeUndefined();
  });

  it('a stored language that is no longer offered falls through to detection', async () => {
    // Someone who picked German before the picker narrowed. Honouring it would resurrect the
    // half-translated UI, and the picker would have no option to show for it.
    const { store } = await boot(['pt-BR'], {
      'stabileo-lang': 'de', 'stabileo-lang-manual': '1',
    });
    expect(store.i18n.locale).toBe('pt');
  });

  it('a stored language that is still offered is honoured', async () => {
    const { store } = await boot(['en'], {
      'stabileo-lang': 'es', 'stabileo-lang-manual': '1',
    });
    expect(store.i18n.locale).toBe('es');
  });

  it('a stored language with no manual flag is ignored — it was only ever a detection cache',
    async () => {
      const { store } = await boot(['pt'], { 'stabileo-lang': 'es' });
      expect(store.i18n.locale).toBe('pt');
    });
});
