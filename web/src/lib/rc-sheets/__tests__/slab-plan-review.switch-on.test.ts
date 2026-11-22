import { describe, it, expect } from 'vitest';
import { makeFmt } from '../format';
import type { SlabDemand } from '../slab-row';
import { slabPlan, type LevelGeometry, type PlanBeam } from '../slab-plan';
import { rulesFor } from '../codes';

const f = makeFmt('.');
const ctx = { mat: { fc: 25, fy: 420 }, cover: 0.02, diameters: [6, 8, 10, 12, 16] };
const plan = { ...ctx, bent: false };
const rules = rulesFor('cirsoc201-2025');

const demand = (key: string, x0: number, x1: number, y0: number, y1: number, m: [number, number, number, number], o: Partial<SlabDemand> = {}): SlabDemand => ({
  key, name: key, level: 'N1', lx: x1 - x0, ly: y1 - y0, h: 0.15, bounds: { x0, x1, y0, y1, z: 3 },
  m: { bottomX: { value: m[0] }, bottomY: { value: m[1] }, topX: { value: m[2] }, topY: { value: m[3] } }, ...o,
});
const beam = (x1: number, y1: number, x2: number, y2: number, b = 0.2): PlanBeam => ({ x1, y1, x2, y2, b, kind: 'beam' });
const box = (x0: number, x1: number, y0: number, y1: number, b = 0.2): PlanBeam[] => [beam(x0, y0, x1, y0, b), beam(x0, y1, x1, y1, b), beam(x0, y0, x0, y1, b), beam(x1, y0, x1, y1, b)];

describe('a level\'s slab plan', () => {
  it('fails where an edge package cannot develop its hook in the edge beam', () => {
    const rows = [demand('A', 0, 4, 0, 5, [8, 5, 12, 6])].map((d) => rules.slabRow(d, ctx, undefined, f));
    const wide = slabPlan('N1', rows, { level: 'N1', beams: box(0, 4, 0, 5, 0.3), columns: [] }, plan);
    expect(wide.packages.filter((p) => p.anchor).every((p) => p.anchor!.ok)).toBe(true);
    expect(wide.ok).toBe(true);
    const narrow = slabPlan('N1', rows, { level: 'N1', beams: box(0, 4, 0, 5, 0.1), columns: [] }, plan);
    expect(narrow.packages.some((p) => p.anchor && !p.anchor.ok)).toBe(true);
    expect(narrow.checks.every((c) => c.ok)).toBe(true);
    expect(narrow.ok).toBe(false);
  });

  it('splits an edge a beam covers only part of: the rest is free', () => {
    const rows = [demand('A', 0, 4, 0, 5, [8, 5, 12, 6])].map((d) => rules.slabRow(d, ctx, undefined, f));
    const geom: LevelGeometry = { level: 'N1', beams: [beam(0, 0, 2.5, 0), beam(0, 5, 4, 5), beam(0, 0, 0, 5), beam(4, 0, 4, 5)], columns: [] };
    const p = slabPlan('N1', rows, geom, plan);
    const edge = p.supports.filter((s) => s.dir === 'y' && Math.abs(s.at) < 1e-9).sort((a, b) => a.from - b.from);
    expect(edge.map((s) => [s.kind, s.from, s.to])).toEqual([['beam', 0, 2.5], ['free', 2.5, 4]]);
  });

  it('stops a bottom bar 150 mm past the face of a beam wide enough to hold it, not at its far face', () => {
    const rows = [demand('A', 0, 4, 0, 5, [8, 5, 12, 6])].map((d) => rules.slabRow(d, ctx, undefined, f));
    const p = slabPlan('N1', rows, { level: 'N1', beams: box(0, 4, 0, 5, 0.4), columns: [] }, plan);
    const bx = p.packages.find((pk) => pk.layer === 'bottom' && pk.dir === 'x')!;
    expect(bx.from).toBeCloseTo(0.2 - 0.15, 9);
    expect(bx.to).toBeCloseTo(4 - 0.2 + 0.15, 9);
  });

  it('carries top bars over a panel\'s middle where the moments ask for them there', () => {
    const field = [{ x: 2, y: 2.5, topX: 18, topY: 0 }, { x: 1, y: 1, topX: 5, topY: 0 }];
    const rows = [demand('A', 0, 4, 0, 5, [8, 5, 20, 6], { topField: field })].map((d) => rules.slabRow(d, ctx, undefined, f));
    const p = slabPlan('N1', rows, { level: 'N1', beams: box(0, 4, 0, 5), columns: [] }, plan);
    const over = p.packages.filter((pk) => pk.layer === 'top' && pk.dir === 'x' && pk.runs.some((r) => r.face === 'top' && r.from < 2 && r.to > 2) && pk.band.from < 2.5 && pk.band.to > 2.5);
    expect(over.length).toBeGreaterThan(0);
    const mid = p.checks.find((c) => c.layer === 'top' && c.dir === 'x' && c.where === 'A')!;
    expect(mid.ok).toBe(true);
    expect(mid.required).toBeCloseTo((18 / 20) * rows[0]!.faces.topX.asStrength, 6);
    expect(over.every((pk) => !pk.base)).toBe(true);
  });
});
