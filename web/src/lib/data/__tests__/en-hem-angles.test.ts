/**
 * HE M and unequal-leg angles: each outline, built from the transcribed dimensions, reproduces
 * the producer's area and second moments, so the drawing, the stress and the numbers agree.
 */
import { describe, it, expect } from 'vitest';
import { EN_HEM } from '../en-hem';
import { EN_L_UNEQUAL } from '../en-unequal-angles';
import { resolveCanonicalSection } from '../../section/canonical';
import { hasCanonicalGeometryExport } from '../../engine/wasm-solver';
import { ALL_PROFILES } from '../steel-profiles';
import type { Section } from '../../store/model.svelte';

const d = hasCanonicalGeometryExport() ? describe : describe.skip;
const rel = (a: number, b: number) => Math.abs(a - b) / b;

d('sourced HE M and unequal angles', () => {
  for (const p of [...EN_HEM, ...EN_L_UNEQUAL]) {
    it(`${p.name}: the outline gives the published A, Iy and Iz`, () => {
      const r = resolveCanonicalSection({ id: 1, name: p.name, a: p.a * 1e-4, iz: p.iz * 1e-8 } as Section);
      expect(r.state).toBe('geometry-backed');
      if (r.state !== 'geometry-backed') return;
      // Three significant figures in the table; the fillets are exact circles in the outline.
      expect(rel(r.properties.a * 1e4, p.a)).toBeLessThan(0.01);
      expect(rel(r.properties.iy * 1e8, p.iy)).toBeLessThan(0.012);
      expect(rel(r.properties.iz * 1e8, p.iz)).toBeLessThan(0.012);
    });
  }

  it('mass and area agree at 7850 kg/m³, so no row carries a typo', () => {
    for (const p of [...EN_HEM, ...EN_L_UNEQUAL]) expect(rel(p.a * 0.785, p.weight), p.name).toBeLessThan(0.01);
  });

  it('every name is unique in the catalogue', () => {
    const names = ALL_PROFILES.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
