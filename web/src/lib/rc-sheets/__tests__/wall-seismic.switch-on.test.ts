import { describe, it, expect, beforeAll } from 'vitest';
import { initSolver } from '../../engine/wasm-solver';
import { wallRow, type WallDemand } from '../wall-row';
import { wallSeismic } from '../wall-seismic';
import { makeFmt } from '../format';

const f = makeFmt(',');
const ctx = { mat: { fc: 30, fy: 420 }, cover: 0.025, barDia: 10, diameters: [10, 12, 16, 20, 25] };
const seismic = { overstrength: 1.25 };
const wall = (o: Partial<WallDemand> & { pu: number; mu: number; vu: number }): WallDemand => ({
  key: 'wall:1:0', name: 'M1', length: o.length ?? 3, height: o.height ?? 3, thickness: o.thickness ?? 0.25,
  combos: [{ combo: 'U', pu: o.pu, mu: o.mu, vu: o.vu, muV: 0, muH: 0 }],
});

beforeAll(async () => { await initSolver(); });

describe('walls under chapter 18', () => {
  it('a wall whose extreme fibre passes 0.2·f\'c gets special boundary elements of max(c − 0.1·lw; c/2), hoops at min(t/3; 6·db; so) carrying Ash', () => {
    const d = wall({ pu: 2500, mu: 4200, vu: 300 });
    const r = wallRow(d, { ...ctx, seismic }, undefined, f);
    const s = r.seismic!;
    expect(s.sigma).toBeCloseTo((2500 / 0.75 + 4200 * 1.5 / (0.25 * 27 / 12)) / 1000, 6);
    expect(s.special).toBe(true);
    expect(s.c).toBeGreaterThan(0);
    expect(s.boundaryLength).toBeCloseTo(Math.max(s.c - 0.3, s.c / 2), 9);
    const db = Math.min(r.adopted.vertical.diameter, r.adopted.boundary?.diameter ?? 99);
    expect(s.hoops!.spacing).toBeLessThanOrEqual(Math.min(0.25 / 3, 6 * db / 1000, 0.15) + 1e-9);
    expect(r.verifications.find((v) => v.label === 'rcSheets.v.wallBoundaryAsh')!.ok).toBe(true);
    expect(r.verifications.find((v) => v.label === 'rcSheets.v.wallSpecialBoundary')!.clause).toBe('§18.10.6.3, §18.10.6.4(a)');
  });

  it('below 0.2·f\'c no special element; the horizontals anchor at the edges once Vu reaches 0.083·√f\'c·Acv', () => {
    const quiet = wallSeismic({ length: 3, height: 3, thickness: 0.25, combos: [{ combo: 'U', pu: 300, mu: 200, vu: 50, muV: 0, muH: 0 }] }, ctx, { vertical: { diameter: 10, spacing: 0.2 }, horizontal: { diameter: 10, spacing: 0.2 }, curtains: 2 }, [0.2], f);
    expect(quiet.special).toBe(false);
    expect(quiet.hoops).toBeNull();
    expect(quiet.anchorEnds).toBe(false);
    const sheared = wallSeismic({ length: 3, height: 3, thickness: 0.25, combos: [{ combo: 'U', pu: 300, mu: 200, vu: 400, muV: 0, muH: 0 }] }, ctx, { vertical: { diameter: 10, spacing: 0.2 }, horizontal: { diameter: 10, spacing: 0.2 }, curtains: 2 }, [0.2], f);
    expect(sheared.anchorEnds).toBe(true);
  });

  it('ties the edge bars where their ratio passes 2.8/fy without a special element (§18.10.6.5(a)), at min(8·db; 200 mm)', () => {
    const s = wallSeismic({ length: 3, height: 3, thickness: 0.2, combos: [{ combo: 'U', pu: 300, mu: 200, vu: 50, muV: 0, muH: 0 }] }, ctx,
      { vertical: { diameter: 10, spacing: 0.2 }, horizontal: { diameter: 10, spacing: 0.2 }, curtains: 2, boundary: { count: 4, diameter: 16 } }, [0.2], f);
    expect(s.special).toBe(false);
    expect(s.hoops!.clause).toBe('§18.10.6.5(a)');
    expect(s.hoops!.spacing).toBeLessThanOrEqual(0.08 + 1e-9);
  });

  it('asks two curtains of a slender wall (hw/lw ≥ 2) and proposes them; chapter 11 alone would take one', () => {
    const d = wall({ length: 1.5, height: 3.2, thickness: 0.2, pu: 200, mu: 100, vu: 40 });
    expect(wallRow(d, ctx, undefined, f).adopted.curtains).toBe(1);
    const r = wallRow(d, { ...ctx, seismic }, undefined, f);
    expect(r.adopted.curtains).toBe(2);
    expect(r.verifications.find((v) => v.label === 'rcSheets.v.wallSeisCurtains')!.ok).toBe(true);
    expect(wallRow(d, { ...ctx, seismic }, { ...r.adopted, curtains: 1 }, f).verifications.find((v) => v.label === 'rcSheets.v.wallSeisCurtains')!.ok).toBe(false);
  });
});
