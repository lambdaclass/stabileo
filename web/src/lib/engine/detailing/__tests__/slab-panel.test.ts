/**
 * A slab panel by strips, by hand. 6 × 4 m, 0,15 m thick, cover 0,02 m, ADN 420, 1 m elements.
 * d = 0,15 − 0,02 − 0,006 = 0,124 m; As = M/(0,9·0,9·d·fy) = M/42 184,8 m²/m (M in kN·m/m).
 * Minimum 0,0018·0,15 = 2,70 cm²/m: Ø8 at the largest 25 mm step, c/17,5 → 2,872 cm²/m.
 *   mx = 10: 2,371 cm²/m, under the base, no band.
 *   mx = 20: 4,741 cm²/m, a band of 1,869 cm²/m over each strip: Ø8 c/25 → 2,011; 4,883 given,
 *   0,971 used.
 */
import { describe, it, expect } from 'vitest';
import { checkPanel, elementNeeds, equalizeBands, panelStrips, proposePanel, providedAt, panelMaxSpacing, SLAB_SPACING_CAP, type PanelInput } from '../slab-panel';

function panel(mx: number): PanelInput {
  const elements = [];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
    elements.push({ id: i * 4 + j + 1, cx: i + 0.5, cy: j + 0.5, sx: 1, sy: 1, thickness: 0.15, sets: [{ mx, my: 0, mxy: 0 }] });
  }
  return { panelId: 'L1', x0: 0, x1: 6, y0: 0, y1: 4, thickness: 0.15, cover: 0.02, fy: 420, elements };
}

describe('a slab panel by strips', () => {
  it('each element needs what Wood-Armer and As = M/(φ·0,9·d·fy) say', () => {
    expect(elementNeeds(panel(10).elements[0]!, 0.02, 420).bottomX * 1e4).toBeCloseTo(2.3705, 3);
  });

  it('cuts the panel into edge and middle strips a quarter of the short span wide', () => {
    const s = panelStrips(panel(10), 'x');
    expect(s.map((x) => [x.kind, x.lo, x.hi])).toEqual([['edge', 0, 1], ['middle', 1, 3], ['edge', 3, 4]]);
    expect(s[1]!.elements).toHaveLength(12);
  });

  it('the base carries a light field; a heavier one gets a band over each strip', () => {
    const light = proposePanel(panel(10), { sMax: 0.3 });
    expect(light.base.bottomX).toEqual({ diameter: 8, spacing: 0.175 });
    expect(light.bands).toEqual([]);
    expect(checkPanel(panel(10), light).worst).toBeLessThan(1);

    const heavy = proposePanel(panel(20), { sMax: 0.3 });
    const bx = heavy.bands.filter((b) => b.face === 'bottom' && b.dir === 'x');
    expect(bx).toHaveLength(3);
    for (const b of bx) expect(b).toMatchObject({ diameter: 8, spacing: 0.25, x0: 0, x1: 6 });
    expect(providedAt(heavy, 'bottomX', 3, 2) * 1e4).toBeCloseTo(2.872 + 2.011, 2);
    const c = checkPanel(panel(20), heavy);
    expect(c.worst).toBeCloseTo(4.741 / 4.883, 2);
    expect(c.minimumOk).toBe(true);
  });

  it('equalizes the bands of a region to the heaviest', () => {
    const r = proposePanel(panel(20), { sMax: 0.3 });
    const tweaked = { ...r, bands: r.bands.map((b, i) => (i === 0 ? { ...b, diameter: 12 } : b)) };
    const eq = equalizeBands(tweaked, { x0: 0, x1: 6, y0: 0, y1: 4 });
    expect(eq.bands.filter((b) => b.face === 'bottom' && b.dir === 'x').every((b) => b.diameter === 12)).toBe(true);
  });
});

describe('required steel as a shell contour', () => {
  it('reads the same As as the slab design', async () => {
    const { shellComponentValue } = await import('../../shell-stress');
    const s = { sigmaXx: 0, sigmaYy: 0, tauXy: 0, mx: 20, my: 0, mxy: 0, vonMises: 0, steelBasis: { d: 0.124, fy: 420 } };
    // 20/(0,81·0,124·420 000)·1e4 = 4,741 cm²/m at the bottom in x; nothing at the top.
    expect(shellComponentValue(s, 'asBotX')).toBeCloseTo(4.741, 3);
    expect(shellComponentValue(s, 'asTopX')).toBe(0);
    expect(shellComponentValue({ ...s, steelBasis: undefined }, 'asBotX')).toBe(0);
  });
});

/**
 * CIRSOC 201-2025 §8.7.2.2: in a solid non-prestressed slab the deformed longitudinal bars are at
 * most min(2h, 300 mm) apart at the critical sections (min(3h, 300 mm) elsewhere). The proposal
 * capped them at min(2h, 450 mm) and the check did not read spacing at all.
 *
 * 6 × 4 m, h = 0,25 m: d = 0,224 m, As = M/(0,81·0,224·420 000) = M/76 205,8. The base (minimum
 * 0,0018·0,25 = 4,50 cm²/m) is Ø8 c/10 = 5,027 cm²/m; mx = 40 needs 5,249, a band of
 * 0,222 cm²/m: Ø8 at 0,503/0,222 = 2,26 m, so the spacing is the cap: 0,45 m before, 0,30 m now.
 */
function thick(mx: number): PanelInput {
  const p = panel(mx);
  return { ...p, thickness: 0.25, elements: p.elements.map((e) => ({ ...e, thickness: 0.25 })) };
}

describe('§8.7.2.2 bar spacing in a slab panel', () => {
  it('the limit is min(2h, 300 mm)', () => {
    expect(SLAB_SPACING_CAP).toBe(0.3);
    expect(panelMaxSpacing(0.12)).toBeCloseTo(0.24, 9);
    expect(panelMaxSpacing(0.15)).toBeCloseTo(0.3, 9);
    expect(panelMaxSpacing(0.25)).toBe(0.3);
  });

  it('a band the minimum barely misses is laid at 300 mm, not 450', () => {
    const p = thick(40);
    const r = proposePanel(p, { sMax: panelMaxSpacing(p.thickness) });
    expect(r.base.bottomX).toEqual({ diameter: 8, spacing: 0.1 });
    const bx = r.bands.filter((b) => b.face === 'bottom' && b.dir === 'x');
    expect(bx.length).toBeGreaterThan(0);
    for (const b of bx) expect(b).toMatchObject({ diameter: 8, spacing: 0.3 });
    // What the old cap produced, for the record: the same band at 450 mm.
    expect(proposePanel(p, { sMax: Math.min(2 * p.thickness, 0.45) }).bands[0]).toMatchObject({ spacing: 0.45 });
    const c = checkPanel(p, r);
    expect(c.spacingOk).toBe(true);
    expect(c.spacing.filter((s) => s.source === 'base').map((s) => [s.face, s.dir, s.spacing])).toEqual([['bottom', 'x', 0.1], ['bottom', 'y', 0.1]]);
  });

  it('flags a saved base and a band on a face without a base when they exceed the limit', () => {
    const p = thick(10);
    const c = checkPanel(p, {
      base: { bottomX: { diameter: 12, spacing: 0.35 }, bottomY: { diameter: 12, spacing: 0.2 } },
      bands: [
        { id: 'T1', face: 'top', dir: 'x', x0: 0, x1: 1, y0: 0, y1: 4, diameter: 10, spacing: 0.4 },
        // Over a base of the same face and direction a band only adds bars: the base's spacing holds.
        { id: 'B1', face: 'bottom', dir: 'y', x0: 0, x1: 6, y0: 0, y1: 1, diameter: 10, spacing: 0.4 },
      ],
    });
    expect(c.spacingOk).toBe(false);
    const bad = c.spacing.filter((s) => !s.ok).map((s) => [s.source, s.id ?? '', s.face, s.dir, s.spacing, s.limit]);
    expect(bad).toEqual([['base', '', 'bottom', 'x', 0.35, 0.3], ['band', 'T1', 'top', 'x', 0.4, 0.3]]);
    expect(c.spacing.some((s) => s.id === 'B1')).toBe(false);
  });
});

describe('§8.7.2.2 in the slab check rows', () => {
  it('each spacing is a row citing 8.7.2.2, failing over the limit', async () => {
    const { slabCheckRows } = await import('../../design/check-rows-families');
    const p = thick(10);
    const check = checkPanel(p, { base: { bottomX: { diameter: 12, spacing: 0.35 }, bottomY: { diameter: 12, spacing: 0.2 } }, bands: [] });
    const rows = slabCheckRows({ layers: [], shear: { vu: 1, phiVc: 10, utilization: 0.1, ok: true, refs: [], memo: '' }, panel: { check } } as never);
    const sp = rows.filter((r) => r.titleKey === 'check.slab.spacing');
    expect(sp.map((r) => [r.clause, r.status])).toEqual([['8.7.2.2', 'fail'], ['8.7.2.2', 'ok']]);
  });
});
