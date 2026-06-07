import { describe, it, expect } from 'vitest';
import { FAMILY_LIST } from '../steel-profiles';
import { FAMILY_CLASSIFICATION, classifyFamily, familiesByMaterial } from '../section-catalog';

describe('section-catalog classification', () => {
  it('classifies every shipped steel family', () => {
    for (const fam of FAMILY_LIST) {
      expect(classifyFamily(fam), `missing classification for ${fam}`).toBeDefined();
    }
  });

  it('groups families by material (RHS/CHS cold-formed for now, rest hot-rolled)', () => {
    expect(familiesByMaterial('cold-formed-steel').sort()).toEqual(['CHS', 'RHS']);
    expect(familiesByMaterial('hot-rolled-steel')).toContain('IPE');
    expect(familiesByMaterial('hot-rolled-steel')).toContain('UPN');
  });

  it('every classification carries standard/country/material/series', () => {
    for (const c of Object.values(FAMILY_CLASSIFICATION)) {
      expect(c.standard).toBeTruthy();
      expect(c.country).toBeTruthy();
      expect(c.material).toMatch(/steel/);
      expect(['i-beam', 'channel', 'angle', 'hollow']).toContain(c.series);
    }
  });
});
