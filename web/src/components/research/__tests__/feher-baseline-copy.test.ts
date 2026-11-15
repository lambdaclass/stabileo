import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

async function boot(research: '0' | '1') {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
  vi.stubEnv('DEV', false);
  vi.stubEnv('VITE_RESEARCH', research);
  vi.resetModules();
  const store = await import('../../../lib/i18n/store.svelte');
  const { shapeStrings } = await import('../feher2026/strings');
  store.setPublicLocale('hu');
  return { ...store, shapeStrings };
}

it('known wrong result: #2099 — Hungarian baseline copy explains the open checks without a hidden next section', async () => {
  const { shapeStrings, publicI18n } = await boot('1');
  expect(publicI18n.locale).toBe('hu');
  vi.stubEnv('VITE_RESEARCH', '0');
  const baseline = shapeStrings();
  expect(baseline.openNote).toContain('14,1');
  expect(baseline.openNote).toContain('7,6');
  expect(baseline.openNote).toContain('szerzők');
  expect(baseline.runNote).toContain('Mozgassa');
  vi.stubEnv('VITE_RESEARCH', '1');
  expect(shapeStrings().openNote).toContain('következő rész');
});

it('a research-off build refuses Hungarian and keeps the English baseline explanation', async () => {
  const { shapeStrings, publicI18n, OFFERED_LOCALES } = await boot('0');
  expect(OFFERED_LOCALES).not.toContain('hu');
  expect(publicI18n.locale).toBe('en');
  const baseline = shapeStrings();
  expect(baseline.openNote).toContain('14.1');
  expect(baseline.openNote).toContain('7.6');
  expect(baseline.openNote).toContain('authors');
  expect(baseline.openNote).not.toContain('next section');
});
