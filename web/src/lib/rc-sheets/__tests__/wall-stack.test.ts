/**
 * A wall's storeys, which recognition makes walls of their own: the one above found by its base on
 * this one's top along the same line, its verticals lapped into it in the schedule and the
 * elevation, the lap reading the larger bar above, and special boundary elements carried up while
 * the stress stays at 0.15·f'c (§18.10.6.3).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { initSolver } from '../../engine/wasm-solver';
import { wallRow, type WallDemand, type WallRow } from '../wall-row';
import { wallSeismic } from '../wall-seismic';
import { wallStacks } from '../wall-stack';
import { scheduleElements } from '../schedule/pieces';
import { developedLength } from '../shape';
import { wallElevationPrimitives } from '../plans/wall-detail';
import { makeFmt } from '../format';

const f = makeFmt('.');
const ctx = { mat: { fc: 30, fy: 420 }, cover: 0.025, barDia: 10, diameters: [10, 12, 16, 20, 25] };
const plan = { x1: 0, y1: 0, x2: 3, y2: 0 };
const storey = (key: string, z: number, o: Partial<WallDemand> = {}): WallDemand => ({
  key, name: key, length: 3, height: 3, thickness: 0.2, plan, z,
  combos: [{ combo: 'U', pu: 600, mu: 300, vu: 80, muV: 2, muH: 1 }], ...o,
});

beforeAll(async () => { await initSolver(); });

describe('the storeys of a wall', () => {
  it('finds the storey above by its base on this one\'s top along the same line, either way round', () => {
    const walls = [storey('a', 0), storey('b', 3, { plan: { x1: 3, y1: 0, x2: 0, y2: 0 } }), storey('c', 6), storey('d', 3, { plan: { x1: 0, y1: 2, x2: 3, y2: 2 } })];
    const s = wallStacks(walls);
    expect(s.get('a')).toEqual({ above: 'b' });
    expect(s.get('b')).toEqual({ below: 'a', above: 'c' });
    expect(s.get('c')).toEqual({ below: 'b' });
    expect(s.has('d')).toBe(false);
  });

  it('laps its verticals into the storey above in the schedule and the elevation, the top storey\'s stopping under its top', () => {
    const lo = wallRow(storey('wall:1:0', 0), ctx, undefined, f), hi = wallRow(storey('wall:2:0', 3), ctx, undefined, f);
    const rows: WallRow[] = [{ ...lo, stack: { above: hi.key } }, { ...hi, stack: { below: lo.key } }];
    const els = scheduleElements({ line: [], column: [], slab: [], wall: rows }, { code: 'cirsoc201-2025', slabCover: 0.02, endZones: false });
    const vertical = (key: string) => els.find((e) => e.key === key)!.pieces.find((p) => p.kind === 'vertical')!;
    const lap = lo.vLaps!.find((x) => x.dia === lo.adopted.vertical.diameter)!.lap;
    expect(developedLength(vertical(lo.key).shape)).toBeGreaterThanOrEqual(3 + lap - 1e-9);
    expect(developedLength(vertical(hi.key).shape)).toBeLessThan(developedLength(vertical(lo.key).shape) - lap + 0.2);
    const tops = (r: WallRow) => Math.max(...wallElevationPrimitives(r, { scale: 25, fmt: f, tr: (k: string) => k, code: 'cirsoc201-2025', group: 'g' } as never)
      .filter((p) => p.kind === 'line' && p.layer.startsWith('ST-ARM-VERT')).map((p) => Math.max((p as { a: { y: number } }).a.y, (p as { b: { y: number } }).b.y)));
    expect(tops(rows[0]!)).toBeCloseTo((3 + lap) * 1000, 6);
    expect(tops(rows[1]!)).toBeCloseTo(3000, 6);
  });

  it('laps a vertical with the larger bar of the storey above by that bar\'s lap', () => {
    const lo = wallRow(storey('wall:1:0', 0), ctx, undefined, f);
    const hi = wallRow(storey('wall:2:0', 3), ctx, { ...lo.adopted, vertical: { diameter: 16, spacing: 0.2 } }, f);
    const rows: WallRow[] = [{ ...lo, stack: { above: hi.key } }, { ...hi, stack: { below: lo.key } }];
    const els = scheduleElements({ line: [], column: [], slab: [], wall: rows }, { code: 'cirsoc201-2025', slabCover: 0.02, endZones: false });
    const v = els.find((e) => e.key === lo.key)!.pieces.find((p) => p.kind === 'vertical')!;
    expect(lo.adopted.vertical.diameter).toBeLessThan(16);
    expect(developedLength(v.shape)).toBeGreaterThanOrEqual(3 + hi.vLaps!.find((x) => x.dia === 16)!.lap - 1e-9);
  });
});

describe('special boundary elements up a wall (§18.10.6.3)', () => {
  const combos = (pu: number, mu: number) => [{ combo: 'U', pu, mu, vu: 100, muV: 0, muH: 0 }];
  const web = { vertical: { diameter: 12, spacing: 0.2 }, horizontal: { diameter: 10, spacing: 0.2 }, curtains: 2 as const };
  const d = { length: 3, height: 3, thickness: 0.25, combos: combos(1500, 1100) };

  it('go on up from a storey that has them while the stress stays at 0.15·f\'c or more', () => {
    const plain = wallSeismic(d, ctx, web, [0.6], f);
    const sigma = plain.sigma;
    expect(sigma).toBeGreaterThanOrEqual(0.15 * 30);
    expect(sigma).toBeLessThan(0.2 * 30);
    expect(plain.special).toBe(false);
    const carried = wallSeismic(d, { ...ctx, belowSpecial: true }, web, [0.6], f);
    expect(carried.special).toBe(true);
    expect(carried.hoops).not.toBeNull();
    expect(carried.steps.some((s) => s.label === 'rcSheets.s.wallSigmaCarried')).toBe(true);
    expect(carried.checks.find((c) => c.label === 'rcSheets.v.wallSpecialBoundary')!.demand).toContain('0.15');
  });

  it('stop where it falls under 0.15·f\'c', () => {
    const low = { ...d, combos: combos(800, 900) };
    expect(wallSeismic(low, ctx, web, [0.4], f).sigma).toBeLessThan(0.15 * 30);
    expect(wallSeismic(low, { ...ctx, belowSpecial: true }, web, [0.4], f).special).toBe(false);
  });
});
