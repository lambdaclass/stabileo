import { describe, it, expect, beforeAll } from 'vitest';
import { initSolver } from '../../engine/wasm-solver';
import { wallSeismic } from '../wall-seismic';
import { wallDetail } from '../wall-detail';
import { columnSeismic } from '../seismic';
import { columnBars } from '../column-row';
import { makeFmt } from '../format';
import type { WallRow } from '../wall-row';
import type { ColumnAdopted } from '../types';

const f = makeFmt('.');
const ctx = { mat: { fc: 30, fy: 420 }, cover: 0.025 };

beforeAll(async () => { await initSolver(); });

describe('walls under chapter 18', () => {
  it('reads the compression at either edge, whichever way the moment bends the wall', () => {
    const at = (mu: number) => wallSeismic({ length: 3, height: 3, thickness: 0.25, combos: [{ combo: 'U', pu: 2500, mu, vu: 300, muV: 0, muH: 0 }] }, ctx, { vertical: { diameter: 12, spacing: 0.15 }, horizontal: { diameter: 10, spacing: 0.15 }, curtains: 2 }, [1.2], f);
    expect(at(-4200).sigma).toBeCloseTo(at(4200).sigma, 9);
    expect(at(-4200).special).toBe(true);
  });

  it('ties the edges of a wall with no extra boundary bars when its distributed bars pass 2.8/fy there', () => {
    const s = wallSeismic({ length: 3, height: 3, thickness: 0.2, combos: [{ combo: 'U', pu: 300, mu: 200, vu: 50, muV: 0, muH: 0 }] }, ctx, { vertical: { diameter: 16, spacing: 0.1 }, horizontal: { diameter: 10, spacing: 0.2 }, curtains: 2 }, [0.2], f);
    expect(s.special).toBe(false);
    expect(s.hoops?.clause).toBe('§18.10.6.5(a)');
    expect(s.boundaryLength).toBeGreaterThan(0);
    expect(s.checks.find((c) => c.label === 'rcSheets.v.wallEdgeTies')).toBeDefined();
  });

  it('spaces the cross ties between curtains no farther apart than their limit, whatever the horizontals\' spacing', () => {
    const row = { family: 'wall', key: 'wall:1:0', name: 'M1', length: 3, height: 3, thickness: 0.2, cover: 0.025, hLap: 0.48,
      adopted: { vertical: { diameter: 16, spacing: 0.1 }, horizontal: { diameter: 8, spacing: 0.4 }, curtains: 2 } } as unknown as WallRow;
    const d = wallDetail(row, 'aci318-19');
    expect(d.crossTies).not.toBeNull();
    expect(d.crossTies!.up).toBeLessThanOrEqual(0.2 + 1e-9);
  });
});

describe('a column under chapter 18', () => {
  it('reads its shear strength with the ties it holds, not with the closer spacing so asks', () => {
    const d = { b: 0.4, h: 0.4, lu: 2.6, cases: [{ pu: 800, vx: 150, vy: 150 }] };
    const a = (s: number): ColumnAdopted => ({ corner: 20, nx: 1, dx: 20, ny: 1, dy: 20, tieDia: 10, tieSpacing: s });
    const ct = { x: 1, y: 1, hx: 0.17, held: 8, perimeter: 8 };
    const read = (s: number) => columnSeismic(d, { ...ctx, overstrength: 1.25 }, a(s), columnBars(d, a(s), { ...ctx, tieDia: 10, diameters: [] }), ct, f);
    const tight = read(0.1), loose = read(0.25);
    expect(loose.so).toBeLessThan(0.25);
    const cap = (r: ReturnType<typeof read>) => parseFloat(r.checks.find((c) => c.label === 'rcSheets.v.seisColVe')!.capacity!);
    expect(cap(loose)).toBeLessThan(cap(tight) - 1);
  });
});

describe('a wall\'s hoops and the design data\'s least spacing', () => {
  const demand = { key: 'wall:1:0', name: 'M1', length: 3, height: 3, thickness: 0.3, combos: [{ combo: 'U', pu: 3000, mu: 5000, vu: 300, muV: 0, muH: 0 }] };
  const wctx = { mat: { fc: 30, fy: 420 }, cover: 0.025, barDia: 8, diameters: [8, 10, 12, 16, 20], minTieSpacing: 0.075, seismic: { overstrength: 1.25 } };
  const thin = { vertical: { diameter: 8, spacing: 0.15 }, horizontal: { diameter: 10, spacing: 0.15 }, curtains: 2 as const, boundary: { count: 8, diameter: 8 } };

  it('fail where 6·db of the bars held spaces them under the floor, saying thicker bars lift it', async () => {
    const { wallRow } = await import('../wall-row');
    const r = wallRow(demand, wctx, thin, f);
    expect(r.seismic!.special).toBe(true);
    const v = r.verifications.find((x) => x.label === 'rcSheets.v.wallTieFloorBars')!;
    expect(v.ok).toBe(false);
    expect(v.capacity).toBe('≥ 7.5 cm');
    expect(r.status).toBe('fail');
    expect(r.minTieSpacing).toBe(0.075);
  });

  it('propose bars thick enough that the hoops stand at the floor or wider', async () => {
    const { wallRow } = await import('../wall-row');
    const r = wallRow(demand, wctx, undefined, f);
    expect(r.seismic!.special).toBe(true);
    expect(r.seismic!.hoops!.spacing).toBeGreaterThanOrEqual(0.075 - 1e-9);
    expect(r.verifications.some((x) => x.label.startsWith('rcSheets.v.wallTieFloor'))).toBe(false);
  });
});
