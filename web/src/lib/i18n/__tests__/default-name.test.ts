import { afterEach, describe, expect, it, vi } from 'vitest';
import '../full-dictionaries';
import { isDefaultName, t } from '../store.svelte';

describe('default structure name', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('recognises every locale default', () => {
    expect(isDefaultName(t('tabBar.newStructure'))).toBe(true);
    expect(isDefaultName('Nueva estructura')).toBe(true);
    expect(isDefaultName('Pórtico nave')).toBe(false);
  });

  it('also the bare key a name saved too early carries, on the web and in the desktop app', () => {
    for (const desktop of ['1', '']) {
      vi.stubEnv('VITE_DESKTOP', desktop);
      expect(isDefaultName('tabBar.newStructure')).toBe(true);
    }
  });
});
