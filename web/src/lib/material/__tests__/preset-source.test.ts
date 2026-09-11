import { describe, it, expect } from 'vitest';
import { materialPresetSource, createMaterialPresetSource } from '../preset-source';

describe('the seam matches the other two', () => {
  it('answers every category with rows', () => {
    for (const c of materialPresetSource.categories()) {
      expect(materialPresetSource.list({ category: c.id }).length, c.id).toBeGreaterThan(0);
    }
  });

  it('names the grade family behind each category, and null for the non-metals', () => {
    const byId = Object.fromEntries(materialPresetSource.categories().map((c) => [c.id, c.family]));
    expect(byId.acero).toBe('hot-rolled');
    expect(byId.aluminio).toBe('aluminium');
    // Concrete and timber have no family in the metal sense, and the seam says so rather than
    // inventing one — which is what decides which body the modal renders.
    expect(byId.hormigon).toBeNull();
    expect(byId.madera).toBeNull();
  });

  it('carries i18n keys, never prose', () => {
    for (const c of materialPresetSource.categories()) {
      expect(c.labelKey).toMatch(/^matCat\./);
    }
  });

  it('resolves by designation, normalising case and surrounding whitespace only', () => {
    expect(materialPresetSource.byName('F-24')?.name).toBe('F-24');
    expect(materialPresetSource.byName(' f-24 ')?.name).toBe('F-24');
    // A near miss resolves to nothing rather than to a neighbour.
    expect(materialPresetSource.byName('F-2')).toBeNull();
    expect(materialPresetSource.byName('')).toBeNull();
  });
});

describe('the region filter', () => {
  it('narrows, and never to nothing when rows of that origin exist', () => {
    const all = materialPresetSource.list({ category: 'acero' });
    const ar = materialPresetSource.list({ category: 'acero', regions: ['AR'] });
    expect(ar.length).toBeGreaterThan(0);
    expect(ar.length).toBeLessThan(all.length);
    expect(ar.every((p) => p.region === 'AR')).toBe(true);
  });

  it('an empty filter is no filter at all', () => {
    const all = materialPresetSource.list({ category: 'acero' });
    expect(materialPresetSource.list({ category: 'acero', regions: [] })).toHaveLength(all.length);
  });
});

describe('it is a seam, not a copy', () => {
  /*
   * The point of the factory: a caller with a different catalogue is not a special case. If this
   * stopped delegating and started holding rows, the substituted source below would be ignored.
   */
  it('a substituted catalogue is the one that answers', () => {
    const fake = createMaterialPresetSource(
      (() => [{ name: 'X-1', category: 'acero', e: 1, nu: 0.3, rho: 1 }]) as never,
      [{ id: 'acero', label: 'matCat.steel' }] as never,
    );
    expect(fake.list().map((p) => p.name)).toEqual(['X-1']);
    expect(fake.categories()).toHaveLength(1);
    expect(fake.byName('X-1')?.name).toBe('X-1');
  });
});
