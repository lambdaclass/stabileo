import { afterEach, expect, it, vi } from 'vitest';
import { readRegistry } from '../../../../scripts/result-changes/registry.mjs';
import { FEATURE_IDS } from '../model-features';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

it('known wrong result: #2099 — main registry remains valid without research translations', async () => {
  const { validateRegistry } = await import('../registry');
  expect(validateRegistry(readRegistry(), new Set(FEATURE_IDS))).toEqual([]);
});

for (const research of ['0', '1']) {
  it(`known wrong result: #2099 — complete notice fallback with research=${research}`, async () => {
    vi.stubGlobal('__PUBLIC_FEATURES__', { ...__PUBLIC_FEATURES__, research: research === '1' });
    vi.resetModules();
    const { registryLocale } = await import('../registry');
    const base = { en: 'English', es: 'Español', pt: 'Português', de: 'Deutsch', fr: 'Français', tr: 'Türkçe', it: 'Italiano', zh: '中文', nl: 'Nederlands' };
    const translated = { ...base, hu: 'Magyar' };
    expect(registryLocale('hu', base, base)).toBe('en');
    expect(registryLocale('hu', translated, translated)).toBe(research === '1' ? 'hu' : 'en');
    for (const hu of [undefined, '', ' ']) {
      expect(registryLocale('hu', translated, { ...base, hu })).toBe('en');
      expect(registryLocale('hu', { ...base, hu }, translated)).toBe('en');
    }
    for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr', 'it', 'zh', 'nl'] as const) expect(registryLocale(locale, base, base)).toBe(locale);
    expect(registryLocale('unknown', translated, translated)).toBe('en');
  });
}
