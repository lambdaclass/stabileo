import { describe, it, expect } from 'vitest';
import { columnCorners, recognizePiers, type PierColumn, type PierWall } from '../piers';
import { checkPier, legDemand, pierBars, pierCombos } from '../pier-design';
import { wallDetail } from '../wall-detail';
import type { ColumnDemand } from '../column-row';
import type { WallDemand, WallRow } from '../wall-row';
import type { ColumnAdopted, WallAdopted } from '../types';

const wall = (key: string, x1: number, y1: number, x2: number, y2: number, z = 0): PierWall => ({ key, name: key.toUpperCase(), plan: { x1, y1, x2, y2 }, thickness: 0.2, z, height: 3 });
const col = (x: number, y: number, b = 0.4, h = 0.4, z = 0): PierColumn => ({ key: 'c', name: 'C1', x, y, z, height: 3, b, h, ey: [0, -1], ez: [1, 0] });
const W = wall('w1', 0, 0, 3, 0);

describe('pier recognition', () => {
  it('takes in a column at a wall end, in the middle and wider than the wall', () => {
    for (const c of [col(0, 0), col(1.5, 0), col(1.5, 0, 0.3, 0.6), col(3, 0)]) {
      const [p] = recognizePiers([W], [c]);
      expect(p!.columns.map((x) => x.key)).toEqual(['c']);
      expect(p!.columns[0]!.legs).toEqual(['w1']);
      expect(p!.name).toBe('W1 + C1');
    }
  });

  it('takes in a column that overlaps the wall only in part, and reads what they share', () => {
    const [p] = recognizePiers([W], [col(1.5, 0.25)]);
    expect(p!.columns).toHaveLength(1);
    expect(p!.columns[0]!.overlap).toBeCloseTo(0.4 * 0.05, 9);
    expect(p!.area).toBeCloseTo(3 * 0.2 + 0.16 - 0.02, 9);
  });

  it('leaves out a column that only touches the wall face or stands apart, and one of another storey', () => {
    for (const c of [col(1.5, 0.3), col(1.5, 1), col(1.5, 0, 0.4, 0.4, 3)]) expect(recognizePiers([W], [c])[0]!.columns).toEqual([]);
  });

  it('joins walls meeting at a corner with the column there: the corner filled, one section', () => {
    const [p, ...rest] = recognizePiers([W, wall('w2', 0, 0, 0, 3)], [col(0, 0)]);
    expect(rest).toEqual([]);
    expect(p!.walls.map((w) => w.key)).toEqual(['w1', 'w2']);
    expect(p!.columns[0]!.legs.sort()).toEqual(['w1', 'w2']);
    expect(p!.outline.holes).toEqual([]);
    expect(p!.area).toBeCloseTo(2 * 3.1 * 0.2 - 0.04 + (0.16 - 0.08), 9);
    expect(p!.columns[0]!.overlap).toBeCloseTo(0.08, 9);
  });

  it('reads a closed core as an outline with its hole, and keeps groups of walls with no column', () => {
    const box = [wall('a', 0, 0, 3, 0), wall('b', 3, 0, 3, 3), wall('c2', 3, 3, 0, 3), wall('d', 0, 3, 0, 0)];
    const [p] = recognizePiers(box, []);
    expect(p!.columns).toEqual([]);
    expect(p!.outline.holes).toHaveLength(1);
    expect(p!.area).toBeCloseTo(3.2 * 3.2 - 2.8 * 2.8, 9);
    expect(p!.centroid.x).toBeCloseTo(1.5, 9);
  });

  it('keeps walls apart that do not meet', () => {
    expect(recognizePiers([W, wall('w2', 0, 2, 3, 2)], [])).toHaveLength(2);
  });
});

const g = (n: number, mx: number, my: number, vx = 0, vy = 0) => ({ n, mx, my, vx, vy });
const wd = (key: string, plan: WallDemand['plan'], global: ReturnType<typeof g>): WallDemand =>
  ({ key, name: key, length: 3, height: 3, thickness: 0.2, plan, z: 0, combos: [{ combo: 'U', pu: global.n, mu: 0, vu: Math.abs(global.vx), muV: 0, muH: 0, global }] });
const cd = (base: ReturnType<typeof g>): ColumnDemand => ({
  key: 'c', name: 'C1', b: 0.4, h: 0.4, length: 3, lu: 3, psiTop: 1, psiBot: 1, plan: { x: 0, y: 0, z: 0, ey: [0, -1], ez: [1, 0] },
  cases: [{ combo: 'U', pu: base.n, mxTop: 0, mxBot: 0, myTop: 0, myBot: 0, base }],
});

describe('pier forces and section', () => {
  it('sums the walls and the column at the cut: N the sum of the parts, the moments carried to the centroid', () => {
    const [p] = recognizePiers([W], [col(0, 0)]);
    const w = wd('w1', W.plan, g(600, 0, -600 * 1.5));
    const c = cd(g(400, 10, 20, 5, 0));
    const { combos, missing } = pierCombos(p!, [w], [c]);
    expect(missing).toEqual([]);
    const k = combos[0]!;
    expect(k.n).toBeCloseTo(600 + 400, 9);
    expect(k.vx).toBeCloseTo(5, 9);
    expect(k.mx).toBeCloseTo(10 - p!.centroid.y * 1000, 6);
    expect(k.my).toBeCloseTo(-600 * 1.5 + 20 + p!.centroid.x * 1000, 6);
  });

  it('adds the column\'s shear to the wall it runs along', () => {
    const [p] = recognizePiers([W], [col(0, 0)]);
    const leg = legDemand(wd('w1', W.plan, g(0, 0, 0, 30, 0)), p!, [cd(g(0, 0, 0, 12, 7))], new Map([['w1', W]]));
    expect(leg.combos[0]!.vu).toBeCloseTo(42, 9);
  });

  it('carries more with the column\'s bars as the wall\'s boundary', () => {
    const [p] = recognizePiers([W], [col(0, 0)]);
    const legA: WallAdopted = { vertical: { diameter: 10, spacing: 0.25 }, horizontal: { diameter: 8, spacing: 0.2 }, curtains: 1 };
    const zone: ColumnAdopted = { corner: 20, nx: 1, dx: 20, ny: 1, dy: 20, tieDia: 8, tieSpacing: 0.2 };
    const legs = [{ wall: W, cover: 0.025, adopted: legA }];
    const zones = [{ column: cd(g(0, 0, 0)), corners: columnCorners(col(0, 0)), adopted: zone, cover: 0.025 }];
    const k = [{ combo: 'U', n: 800, mx: 0, my: 900, vx: 0, vy: 0 }];
    const mat = { fc: 25, fy: 420 };
    const with_ = checkPier(p!, pierBars(p!, legs, zones), mat, k), without = checkPier(p!, pierBars(p!, legs, []), mat, k);
    expect(with_.ratio).toBeLessThan(without.ratio);
    expect(pierBars(p!, legs, zones).length).toBeLessThan(pierBars(p!, legs, []).length + 8);
  });

  it('drops the wall\'s bars inside its pier\'s column from the drawing', () => {
    const adopted: WallAdopted = { vertical: { diameter: 10, spacing: 0.2 }, horizontal: { diameter: 8, spacing: 0.2 }, curtains: 1 };
    const row = { family: 'wall', key: 'w1', name: 'W1', length: 3, height: 3, thickness: 0.2, cover: 0.025, hLap: 0.4, adopted } as unknown as WallRow;
    const plain = wallDetail(row, 'aci318-19');
    const outline = [{ x: -0.2, y: -0.1 }, { x: 0.2, y: -0.1 }, { x: 0.2, y: 0.3 }, { x: -0.2, y: 0.3 }];
    const inPier = wallDetail({ ...row, pier: { key: 'p', name: 'W1 + C1', ratio: 0.5, ok: true, combo: 'U', columns: [{ key: 'c', name: 'C1', host: true, outline, bars: [], tieDia: 8, tieSpacing: 0.2, label: '' }] } }, 'aci318-19');
    expect(inPier.verticals.length).toBe(plain.verticals.filter((v) => v.x > 0.2).length);
    expect(inPier.columns).toHaveLength(1);
  });
});
