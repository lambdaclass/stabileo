import { describe, it, expect } from 'vitest';
import { wallDetail } from '../wall-detail';
import type { WallRow } from '../wall-row';
import type { WallAdopted } from '../types';

const wall = (o: { t: number; adopted: WallAdopted; L?: number }) => ({ family: 'wall', key: 'wall:1:0', name: 'M1', length: o.L ?? 3, height: 3, thickness: o.t, cover: 0.025, hLap: 0.48, adopted: o.adopted } as unknown as WallRow);
const two = (v: number, h: number, boundary?: { count: number; diameter: number }): WallAdopted => ({ vertical: { diameter: 10, spacing: v }, horizontal: { diameter: 8, spacing: h }, curtains: 2, ...(boundary ? { boundary } : {}) });

describe('wall detailing', () => {
  it('closes both edges of two curtains with U-bars of the horizontals, lapped over them', () => {
    for (const code of ['aci318-19', 'cirsoc201-2025', 'en1992-1-1', 'ts500-2000'] as const) {
      const d = wallDetail(wall({ t: 0.3, adopted: two(0.2, 0.2) }), code);
      expect(d.ends).toMatchObject({ kind: 'ubar', dia: 8, spacing: 0.2, lap: 0.48 });
      expect(d.horizontals.y).toEqual([0.025 + 0.004, 0.3 - 0.025 - 0.004]);
    }
    const seis = { ...wall({ t: 0.3, adopted: two(0.2, 0.2) }), seismic: { anchorEnds: true, hoops: null, special: false, sigma: 2, boundaryLength: 0 } } as unknown as WallRow;
    expect(wallDetail(seis, 'aci318-19').ends.clause).toBe('§25.5.2, §18.10.6.5(b)');
  });

  it('hooks the horizontals of one curtain round the end bar', () => {
    const d = wallDetail(wall({ t: 0.15, adopted: { ...two(0.2, 0.2), curtains: 1 } }), 'aci318-19');
    expect(d.ends.kind).toBe('hook');
    expect(new Set(d.verticals.map((v) => v.y))).toEqual(new Set([0.075]));
  });

  it('places the vertical bars of both curtains inside the horizontals, the boundary bars at the ends, and ties a boundary zone over 1 % (ACI)', () => {
    const d = wallDetail(wall({ t: 0.2, adopted: two(0.2, 0.2, { count: 8, diameter: 16 }) }), 'aci318-19');
    const dist = d.verticals.filter((v) => !v.boundary), ext = d.verticals.filter((v) => v.boundary);
    expect(dist).toHaveLength(2 * 16);
    expect(ext).toHaveLength(16);
    expect(Math.min(...d.verticals.map((v) => v.y))).toBeCloseTo(0.025 + 0.008 + 0.005, 9);
    expect(Math.min(...dist.map((v) => v.x))).toBeCloseTo(0.025 + 0.008 + 0.005, 9);
    expect(d.boundary!.rho).toBeGreaterThan(0.01);
    expect(d.boundary!.ties).toMatchObject({ dia: 6, clause: '§11.7.4.1, §25.7.2.1' });
    expect(d.boundary!.ties!.spacing).toBeLessThanOrEqual(Math.min(16 * 0.01, 48 * 0.006, 0.2) + 1e-9);
  });

  it('EN 1992-1-1: at least four links per m² between the curtains, and links round a zone over 2 %', () => {
    const d = wallDetail(wall({ t: 0.2, adopted: two(0.15, 0.2, { count: 8, diameter: 20 }) }), 'en1992-1-1');
    expect(1 / (d.crossTies!.along * d.crossTies!.up)).toBeGreaterThanOrEqual(4 - 1e-9);
    expect(d.crossTies!.along / 0.15).toBeCloseTo(Math.round(d.crossTies!.along / 0.15), 9);
    expect(d.boundary!.rho).toBeGreaterThan(0.02);
    expect(d.boundary!.ties!.clause).toBe('9.6.4(1), 9.5.3(3)');
    expect(d.boundary!.ties!.spacing).toBeLessThanOrEqual(0.2 + 1e-9);
  });

  it('ACI: no cross ties while the vertical ratio stays at 1 % or less, and says so', () => {
    const d = wallDetail(wall({ t: 0.3, adopted: two(0.2, 0.2) }), 'aci318-19');
    expect(d.crossTies).toBeNull();
    expect(d.notes.map((n) => n.key)).toContain('rcSheets.wallFig.n.noTies');
  });
});
