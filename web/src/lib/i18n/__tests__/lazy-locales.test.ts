import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

type Store = typeof import('../store.svelte');

async function freshStore(complete: boolean): Promise<Store> {
  vi.resetModules();
  for (const code of ['de', 'fr']) vi.doMock(`../locales/complete/${code}`, () => ({ COMPLETE: complete }));
  const store = await import('../store.svelte');
  store.registerDictionaries({ es: {}, en: { 'lazy.probe': 'English text' }, pt: {} });
  return store;
}

describe('a lazily loaded language', () => {
  beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => {}));
  afterEach(() => {
    vi.doUnmock('../locales/browser/fr');
    for (const code of ['de', 'fr']) vi.doUnmock(`../locales/complete/${code}`);
    vi.restoreAllMocks();
  });

  it('is registered once ensureLocale resolves, and loaded only once', async () => {
    const store = await freshStore(true);
    const { default: full } = await import('../locales/browser/de');
    const [key, value] = Object.entries(full).find(([k]) => !k.startsWith('landing.'))!;
    const first = store.ensureLocale('de');
    expect(store.ensureLocale('de')).toBe(first);
    await first;
    expect(store.tAt(key, 'de')).toBe(value);
  });

  it('that fails to load leaves English, does not reject, and is tried again', async () => {
    vi.doMock('../locales/browser/fr', () => {
      throw new Error('offline');
    });
    const store = await freshStore(true);
    await expect(store.ensureLocale('fr')).resolves.toBeUndefined();
    expect(store.tAt('lazy.probe', 'fr')).toBe('English text');
    expect(console.warn).toHaveBeenCalledOnce();

    vi.doUnmock('../locales/browser/fr');
    const { default: full } = await import('../locales/browser/fr');
    const [key, value] = Object.entries(full)[0];
    await store.ensureLocale('fr');
    expect(store.tAt(key, 'fr')).toBe(value);
  });

  it('is neither loaded nor shown while it is not complete', async () => {
    const store = await freshStore(false);
    const { default: full } = await import('../locales/browser/de');
    const [key, value] = Object.entries(full).find(([k, v]) => !k.startsWith('landing.') && v !== 'English text')!;
    await store.ensureLocale('de');
    expect(store.tAt(key, 'de')).not.toBe(value);
    expect(store.OFFERED_LOCALES).not.toContain('de');
  });

  it('resolves at once for a bundled language', async () => {
    const store = await freshStore(true);
    await expect(store.ensureLocale('es')).resolves.toBeUndefined();
    await expect(store.ensureLocale('xx')).resolves.toBeUndefined();
  });

  it.each(['de', 'fr', 'tr'] as const)('in a build, where the public %s entries are a lazy chunk, shows both its public and its app strings', async (loc) => {
    vi.resetModules();
    vi.doMock('virtual:public-i18n', () => ({
      en: {}, es: {}, pt: {}, de: {}, fr: {}, tr: {},
      loaders: { [loc]: async () => ({ default: { 'landing.probe': `public ${loc}` } }) },
    }));
    vi.doMock(`../locales/browser/${loc}`, () => ({ default: { 'app.probe': `app ${loc}` } }));
    try {
      const store = await import('../store.svelte');
      store.registerDictionaries({ es: {}, en: { 'landing.probe': 'public en', 'app.probe': 'app en' }, pt: {} });
      await store.ensureLocale(loc);
      expect(store.tAt('landing.probe', loc)).toBe(`public ${loc}`);
      expect(store.tAt('app.probe', loc)).toBe(`app ${loc}`);
    } finally {
      vi.doUnmock('virtual:public-i18n');
      vi.doUnmock(`../locales/browser/${loc}`);
    }
  });
});
