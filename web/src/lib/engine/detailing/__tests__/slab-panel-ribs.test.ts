/**
 * A waffle panel and an unstructured mesh, by strips, by hand.
 *
 * Ribs: h = 0,35, topping 0,05, 0,82 both ways, 0,12 wide; H-25, ADN 420, cover 0,02.
 * d = 0,35 − 0,02 − 0,006 = 0,324 m.
 *   Rib minimum (9.6.1.2): max(0,25·√25/420; 1,4/420)·0,12·0,324 = 1,296 cm² per rib → 2Ø10
 *   (1,571), the least steel of one or two bars; 1,916 cm²/m.
 *   Sagging 50 kN·m/m: Mu = 41 kN·m per rib on a T 0,82 wide, As = 3,390 cm² → 1,819 over the
 *   base → 1Ø16 (2,011).
 *   Hogging 30 kN·m/m: Mu = 24,6 kN·m per rib on its 0,12 web, As = 2,123 cm² → 2Ø12 (2,262).
 *   A drop 0,35 thick: 0,0018·0,35 = 6,30 cm²/m at the bottom, 4,385 over the base, 3,595 per rib
 *   → 2Ø16 (4,021).
 */
import { describe, it, expect } from 'vitest';
import { checkPanel, elementNeeds, proposePanel, ribBars, type PanelInput } from '../slab-panel';
import { bandBars } from '../slab-bands';
import type { RibbedGeometry } from '../../design/slabs/ribbed';

const RIBS: RibbedGeometry = { h: 0.35, c: 0.05, spacingX: 0.82, spacingY: 0.82, ribBottom: 0.12, filler: 'permanent' };
const S = 0.82;

/** 6 × 4 ribs' worth of 0,82 m elements at the equivalent thickness; column i = 0 solid when `drop`. */
function waffle(mx: number, opts: { drop?: boolean } = {}): PanelInput {
  const elements = [];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
    elements.push({ id: i * 4 + j + 1, cx: (i + 0.5) * S, cy: (j + 0.5) * S, sx: S, sy: S, thickness: opts.drop && i === 0 ? 0.35 : 0.2, sets: [{ mx, my: 0, mxy: 0 }] });
  }
  return { panelId: 'L1', x0: 0, x1: 6 * S, y0: 0, y1: 4 * S, thickness: 0.2, cover: 0.02, fy: 420, elements, ribs: { geometry: RIBS, fc: 25 } };
}

describe('a waffle panel, bars per rib', () => {
  it('needs what one rib needs, spread over its spacing', () => {
    const e = waffle(50).elements[1]!;
    expect(elementNeeds(e, 0.02, 420, waffle(50).ribs).bottomX * S * 1e4).toBeCloseTo(3.390, 2);
    const hog = { ...e, sets: [{ mx: -30, my: 0, mxy: 0 }] };
    expect(elementNeeds(hog, 0.02, 420, waffle(50).ribs).topX * S * 1e4).toBeCloseTo(2.123, 2);
  });

  it('takes the least steel of one or two bars per rib', () => {
    expect(ribBars(1.296e-4 / S, S)).toEqual({ diameter: 10, spacing: 0.41, perRib: 2 });
    expect(ribBars(1.819e-4 / S, S)).toEqual({ diameter: 16, spacing: 0.82, perRib: 1 });
    expect(ribBars(2.123e-4 / S, S)).toEqual({ diameter: 12, spacing: 0.41, perRib: 2 });
  });

  it('lays the rib minimum as the base and adds whole bars per rib where the strips need them', () => {
    const r = proposePanel(waffle(50), { sMax: 0.3 });
    expect(r.base.bottomX).toEqual({ diameter: 10, spacing: 0.41, perRib: 2 });
    expect(r.base.bottomY).toEqual({ diameter: 10, spacing: 0.41, perRib: 2 });
    // And at the top, so a band over a support is only what the hogging needs past it.
    expect(r.base.topX).toEqual({ diameter: 10, spacing: 0.41, perRib: 2 });
    // One strip per rib line: five lines across four cells, the edge ribs included.
    const bx = r.bands.filter((b) => b.face === 'bottom' && b.dir === 'x');
    expect(bx.map((b) => [+b.y0.toFixed(2), +b.y1.toFixed(2)])).toEqual([[0, 0.41], [0.41, 1.23], [1.23, 2.05], [2.05, 2.87], [2.87, 3.28]]);
    for (const b of bx) expect(b).toMatchObject({ diameter: 16, spacing: 0.82, perRib: 1 });
    const c = checkPanel(waffle(50), r);
    expect(c.worst).toBeLessThanOrEqual(1);
    expect(c.minimumOk).toBe(true);
    // Bars set per rib sit at the ribs: the solid slab's spacing limit does not read them.
    expect(c.spacing).toEqual([]);
  });

  it('gives a drop the solid minimum at its bottom, over the rib base', () => {
    const r = proposePanel(waffle(0, { drop: true }), { sMax: 0.3 });
    const drop = r.bands.filter((b) => b.id.includes('-D'));
    expect(drop.map((b) => [b.dir, b.x0, b.x1, b.y0, b.y1])).toEqual([['x', 0, S, 0, 4 * S], ['y', 0, S, 0, 4 * S]]);
    for (const b of drop) expect(b).toMatchObject({ face: 'bottom', diameter: 16, perRib: 2 });
  });
});

describe('an unstructured mesh', () => {
  /** The 6 × 4 m, 0,15 m solid panel of `slab-panel.test.ts`, each square cut into two triangles. */
  function triangles(mx: number): PanelInput {
    const elements = [];
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
      for (const [k, c] of [[0, 1 / 3], [1, 2 / 3]] as const) {
        elements.push({ id: (i * 4 + j) * 2 + k + 1, cx: i + c, cy: j + (k === 0 ? 2 / 3 : 1 / 3), sx: 1, sy: 1, thickness: 0.15, area: 0.5, sets: [{ mx, my: 0, mxy: 0 }] });
      }
    }
    return { panelId: 'L1', x0: 0, x1: 6, y0: 0, y1: 4, thickness: 0.15, cover: 0.02, fy: 420, elements, rowStep: Math.SQRT1_2 };
  }
  function squares(mx: number): PanelInput {
    const elements = [];
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
      elements.push({ id: i * 4 + j + 1, cx: i + 0.5, cy: j + 0.5, sx: 1, sy: 1, thickness: 0.15, sets: [{ mx, my: 0, mxy: 0 }] });
    }
    return { panelId: 'L1', x0: 0, x1: 6, y0: 0, y1: 4, thickness: 0.15, cover: 0.02, fy: 420, elements };
  }

  it('reads a uniform field the way the structured mesh does', () => {
    const tri = proposePanel(triangles(20), { sMax: 0.3 });
    const sq = proposePanel(squares(20), { sMax: 0.3 });
    expect(tri.base).toEqual(sq.base);
    expect(tri.bands.map(({ id: _id, ...b }) => b)).toEqual(sq.bands.map(({ id: _id, ...b }) => b));
    expect(checkPanel(triangles(20), tri).worst).toBeCloseTo(checkPanel(squares(20), sq).worst, 6);
  });
});

describe('a band set per rib', () => {
  it('counts its bars by the ribs it covers, a half-width edge strip holding one rib', () => {
    const band = { id: 'B', face: 'bottom' as const, dir: 'x' as const, x0: 0, x1: 4, y0: 0, y1: 0.41, diameter: 16, spacing: 0.82, perRib: 1 };
    expect(bandBars(band).count).toBe(1);
    expect(bandBars({ ...band, y1: 2.46, spacing: 0.41, perRib: 2 }).count).toBe(6);
  });
});
