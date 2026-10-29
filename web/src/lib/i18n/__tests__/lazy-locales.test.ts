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
    vi.doUnmock('../locales/full/fr');
    for (const code of ['de', 'fr']) vi.doUnmock(`../locales/complete/${code}`);
    vi.restoreAllMocks();
  });

  it('is registered once ensureLocale resolves, and loaded only once', async () => {
    const store = await freshStore(true);
    const { default: full } = await import('../locales/full/de');
    const [key, value] = Object.entries(full).find(([k]) => !k.startsWith('landing.'))!;
    const first = store.ensureLocale('de');
    expect(store.ensureLocale('de')).toBe(first);
    await first;
    expect(store.tAt(key, 'de')).toBe(value);
  });

  it('that fails to load leaves English, does not reject, and is tried again', async () => {
    vi.doMock('../locales/full/fr', () => {
      throw new Error('offline');
    });
    const store = await freshStore(true);
    await expect(store.ensureLocale('fr')).resolves.toBeUndefined();
    expect(store.tAt('lazy.probe', 'fr')).toBe('English text');
    expect(console.warn).toHaveBeenCalledOnce();

    vi.doUnmock('../locales/full/fr');
    const { default: full } = await import('../locales/full/fr');
    const [key, value] = Object.entries(full)[0];
    await store.ensureLocale('fr');
    expect(store.tAt(key, 'fr')).toBe(value);
  });

  it('is neither loaded nor shown while it is not complete', async () => {
    const store = await freshStore(false);
    const { default: full } = await import('../locales/full/de');
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
});
