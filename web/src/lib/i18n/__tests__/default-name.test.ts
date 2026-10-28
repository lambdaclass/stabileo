import { describe, expect, it } from 'vitest';
import '../full-dictionaries';
import { isDefaultName, t } from '../store.svelte';

describe('default structure name', () => {
  it('recognises every locale default and the bare key a name saved too early carries', () => {
    expect(isDefaultName(t('tabBar.newStructure'))).toBe(true);
    expect(isDefaultName('Nueva estructura')).toBe(true);
    expect(isDefaultName('tabBar.newStructure')).toBe(true);
    expect(isDefaultName('Pórtico nave')).toBe(false);
  });
});
