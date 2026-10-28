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

  it('in the desktop app, also the bare key a name saved too early carries', () => {
    vi.stubEnv('VITE_DESKTOP', '1');
    expect(isDefaultName('tabBar.newStructure')).toBe(true);
  });

  it('on the web, behaves as before (the bare key is not a default name there)', () => {
    vi.stubEnv('VITE_DESKTOP', '');
    expect(isDefaultName('tabBar.newStructure')).toBe(false);
  });
});
