import { describe, it, expect } from 'vitest';
import { materialFor } from '../ifc-mapper';
import { materialFamilyOf } from '../../model/material-family';

describe('a concrete named by its grade', () => {
  it('reads H-25 and the reinforced, plain and prestressed designations, with f\'c, as concrete', () => {
    for (const name of ['H-25', 'HA-25, Yc=1.5', 'HM-25', 'HP-25', 'Hormigón H-25']) {
      const m = materialFor(name)!;
      expect(m, name).toMatchObject({ fc: 25, e: 23500 });
      expect(materialFamilyOf(m as never).family, name).toBe('concrete');
    }
  });
});
