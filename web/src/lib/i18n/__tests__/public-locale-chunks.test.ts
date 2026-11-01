import { describe, it, expect, afterEach, vi } from 'vitest';

type Store = typeof import('../store.svelte');

async function storeWith(load: () => Promise<{ default: Record<string, string> }>): Promise<Store> {
  vi.resetModules();
  vi.doMock('virtual:public-i18n', () => ({
    en: { 'landing.probe': 'English' }, es: {}, pt: {}, de: {}, fr: {}, tr: {},
    loaders: { es: load },
  }));
  return import('../store.svelte');
}

describe('a public language in its own chunk', () => {
  afterEach(() => {
    vi.doUnmock('virtual:public-i18n');
    vi.restoreAllMocks();
  });

  it('shows English until ensurePublicLocale resolves, then its own text, loading once', async () => {
    const load = vi.fn(async () => ({ default: { 'landing.probe': 'Español' } }));
    const store = await storeWith(load);
    store.setLocale('es');
    expect(store.tPublic('landing.probe')).toBe('English');
    const first = store.ensurePublicLocale('es');
    expect(store.ensurePublicLocale('es')).toBe(first);
    await first;
    expect(store.tPublic('landing.probe')).toBe('Español');
    expect(load).toHaveBeenCalledOnce();
  });

  it('that fails leaves English, does not reject, and is tried again', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ default: { 'landing.probe': 'Español' } });
    const store = await storeWith(load);
    store.setLocale('es');
    await expect(store.ensurePublicLocale('es')).resolves.toBeUndefined();
    expect(store.tPublic('landing.probe')).toBe('English');
    expect(console.warn).toHaveBeenCalledOnce();
    await store.ensurePublicLocale('es');
    expect(store.tPublic('landing.probe')).toBe('Español');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('resolves at once for a bundled or unknown language', async () => {
    const load = vi.fn(async () => ({ default: {} }));
    const store = await storeWith(load);
    await expect(store.ensurePublicLocale('en')).resolves.toBeUndefined();
    await expect(store.ensurePublicLocale('xx')).resolves.toBeUndefined();
    expect(load).not.toHaveBeenCalled();
  });

  it('a language switch moves only once its text has arrived', async () => {
    let arrive!: (m: { default: Record<string, string> }) => void;
    const store = await storeWith(() => new Promise(resolve => { arrive = resolve; }));
    const { switchPublicLocale } = await import('../../../components/landing/landing-utils');
    const moves: string[] = [];
    vi.stubGlobal('window', Object.assign(new EventTarget(), { location: { pathname: '/en/tools/', search: '', hash: '' } }));
    window.addEventListener('stabileo-navigate', (e: Event) => moves.push((e as CustomEvent<string>).detail));
    try {
      const switching = switchPublicLocale('es');
      await Promise.resolve();
      expect(store.publicI18n.locale).toBe('en');
      expect(moves).toEqual([]);
      arrive({ default: { 'landing.probe': 'Español' } });
      await switching;
      expect(store.publicI18n.locale).toBe('es');
      expect(store.tPublic('landing.probe')).toBe('Español');
      expect(moves).toEqual(['/tools']);
    } finally {
      vi.unstubAllGlobals();
    }
  });

});
