import { afterEach, expect, it, vi } from 'vitest';
import { shapeStrings } from '../feher2026/strings';
import { setPublicLocale } from '../../../lib/i18n/store.svelte';

afterEach(() => { setPublicLocale('en'); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

(process.env.IGNORED ? it : it.skip)('known wrong result: #2099 — Hungarian baseline copy explains the open checks without a hidden next section', () => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
  vi.stubEnv('DEV', false);
  vi.stubEnv('VITE_RESEARCH', '0');
  setPublicLocale('hu');
  const baseline = shapeStrings();
  expect(baseline.openNote).toContain('14,1');
  expect(baseline.openNote).toContain('7,6');
  expect(baseline.openNote).toContain('szerzők');
  expect(baseline.runNote).toContain('Mozgassa');
  vi.stubEnv('VITE_RESEARCH', '1');
  expect(shapeStrings().openNote).toContain('következő rész');
});
