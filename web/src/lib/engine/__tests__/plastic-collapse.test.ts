/**
 * Plastic collapse, step by step, against the collapse loads of the classic
 * cases — which the kinematic theorem gives exactly: the lowest load among
 * all mechanisms, equal (uniqueness) to the highest statically admissible
 * one. Each also has to form its hinges where the theory puts them.
 */
import { describe, it, expect } from 'vitest';
import { plasticCollapse2D } from '../plastic-collapse';
import type { SolverInput, SolverLoad } from '../types';

const MP = 100;
type El = [number, number, number, ('frame' | 'truss')?];
function model(nodes: Array<[number, number, number]>, elements: El[], supports: Array<[number, string]>, loads: SolverLoad[]): SolverInput {
  return {
    nodes: new Map(nodes.map(([id, x, z]) => [id, { id, x, z }])),
    materials: new Map([[1, { id: 1, e: 200_000, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 }]]),
    elements: new Map(elements.map(([id, i, j, type]) => [id, { id, type: type ?? 'frame', nodeI: i, nodeJ: j, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }])),
    supports: new Map(supports.map(([nodeId, type], k) => [k + 1, { id: k + 1, nodeId, type: type as never }])),
    loads,
  } as unknown as SolverInput;
}
const run = (m: SolverInput, np = Infinity) => plasticCollapse2D(m, { mp: () => MP, np: () => np });
const P = (nodeId: number, fx: number, fz: number): SolverLoad => ({ type: 'nodal', data: { nodeId, fx, fz, my: 0 } });
const q = (elementId: number, v: number): SolverLoad => ({ type: 'distributed', data: { elementId, qI: v, qJ: v } });
const pOn = (elementId: number, a: number, p: number): SolverLoad => ({ type: 'pointOnElement', data: { elementId, a, p } });

describe('plastic collapse, step by step', () => {
  it('simply supported beam, central point load: one hinge at midspan, λc = 4Mp/(PL)', () => {
    const r = run(model([[1, 0, 0], [2, 6, 0]], [[1, 1, 2]], [[1, 'pinned'], [2, 'rollerX']], [pOn(1, 3, -10)]));
    expect(r.isMechanism).toBe(true);
    expect(r.hinges).toHaveLength(1);
    expect(r.hinges[0].x).toBeCloseTo(3, 6);
    expect(r.collapseFactor).toBeCloseTo((4 * MP) / (10 * 6), 6);
  });

  it('simply supported beam, uniform load: one hinge at midspan, λc = 8Mp/(qL²)', () => {
    const r = run(model([[1, 0, 0], [2, 6, 0]], [[1, 1, 2]], [[1, 'pinned'], [2, 'rollerX']], [q(1, -10)]));
    expect(r.hinges).toHaveLength(1);
    expect(r.hinges[0].x).toBeCloseTo(3, 1);
    expect(r.collapseFactor).toBeCloseTo((8 * MP) / (10 * 36), 3);
    expect(r.isMechanism).toBe(true);
  });

  it('cantilever, tip load: one hinge at the wall, λc = Mp/(PL)', () => {
    const r = run(model([[1, 0, 0], [2, 3, 0]], [[1, 1, 2]], [[1, 'fixed']], [P(2, 0, -15)]));
    expect(r.hinges).toHaveLength(1);
    expect(r.hinges[0].x).toBeCloseTo(0, 6);
    expect(r.collapseFactor).toBeCloseTo(MP / 45, 6);
  });

  it('fixed-fixed beam, central load: ends and midspan together (all at PL/8), λc = 8Mp/(PL)', () => {
    const r = run(model([[1, 0, 0], [2, 6, 0]], [[1, 1, 2]], [[1, 'fixed'], [2, 'fixed']], [pOn(1, 3, -10)]));
    expect(r.hinges).toHaveLength(3);
    expect(r.steps).toHaveLength(1);
    expect(r.collapseFactor).toBeCloseTo((8 * MP) / 60, 5);
  });

  it('fixed-fixed beam, off-centre load: the near wall first, then the far wall and the load point', () => {
    const r = run(model([[1, 0, 0], [2, 6, 0]], [[1, 1, 2]], [[1, 'fixed'], [2, 'fixed']], [pOn(1, 2, -10)]));
    // Mechanism: λP·δ = Mp(θ1 + θ1 + θ3 + θ3) with δ = 2θ1 = 4θ3 → λP = 2Mp(1/2 + 1/4).
    expect(r.collapseFactor).toBeCloseTo((2 * MP * (1 / 2 + 1 / 4)) / 10, 5);
    expect(r.hinges[0].x).toBeCloseTo(0, 6);
    expect(r.hinges.map((h) => +h.x.toFixed(6)).sort((a, b) => a - b)).toEqual([0, 2, 6]);
  });

  it('propped cantilever, uniform load: wall first, then the span at 0.414 L from the prop; λc = 11.657 Mp/(qL²)', () => {
    const L = 6;
    const r = run(model([[1, 0, 0], [2, L, 0]], [[1, 1, 2]], [[1, 'fixed'], [2, 'rollerX']], [q(1, -10)]));
    expect(r.hinges).toHaveLength(2);
    expect(r.hinges[0].x).toBeCloseTo(0, 6);
    expect(L - r.hinges[1].x).toBeCloseTo((Math.SQRT2 - 1) * L, 1);
    expect(r.collapseFactor / ((2 * (3 + 2 * Math.SQRT2) * MP) / (10 * L * L))).toBeCloseTo(1, 3);
  });

  it('two-span continuous beam, uniform load: each span collapses as a propped cantilever', () => {
    const L = 5;
    const r = run(model([[1, 0, 0], [2, L, 0], [3, 2 * L, 0]], [[1, 1, 2], [2, 2, 3]],
      [[1, 'pinned'], [2, 'rollerX'], [3, 'rollerX']], [q(1, -10), q(2, -10)]));
    expect(r.isMechanism).toBe(true);
    expect(r.collapseFactor / ((2 * (3 + 2 * Math.SQRT2) * MP) / (10 * L * L))).toBeCloseTo(1, 3);
  });

  it('portal frame, sway plus beam load: the combined mechanism governs, λc = 6Mp/(P·(h + L/2))', () => {
    const h = 4, L = 6;
    const r = run(model([[1, 0, 0], [2, 0, h], [3, L, h], [4, L, 0]], [[1, 1, 2], [2, 2, 3], [3, 3, 4]],
      [[1, 'fixed'], [4, 'fixed']], [P(2, 1, 0), pOn(2, L / 2, -1)]));
    expect(r.isMechanism).toBe(true);
    expect(r.hinges).toHaveLength(4);
    expect(r.collapseFactor).toBeCloseTo((6 * MP) / (h + L / 2), 4);
  });

  it('a temperature does not move the collapse load (uniqueness)', () => {
    const base = model([[1, 0, 0], [2, 6, 0]], [[1, 1, 2]], [[1, 'fixed'], [2, 'fixed']], [pOn(1, 3, -10)]);
    const heated = { ...base, loads: [...base.loads, { type: 'thermal', data: { elementId: 1, dtUniform: 0, dtGradient: 30 } } as SolverLoad] };
    expect(run(heated).collapseFactor).toBeCloseTo(run(base).collapseFactor, 4);
  });

  it('a truss yields bar by bar: the isostatic two-bar truss collapses at the first, at Np/N', () => {
    // Symmetric two-bar truss, apex load 10: each bar carries 10/(2 sin 45°).
    const r = run(model([[1, 0, 0], [2, 4, 0], [3, 2, 2]], [[1, 1, 3, 'truss'], [2, 2, 3, 'truss']],
      [[1, 'pinned'], [2, 'pinned']], [P(3, 0, -10)]), 70);
    const N = 10 / (2 * Math.SQRT1_2);
    expect(r.isMechanism).toBe(true);
    expect(r.collapseFactor).toBeCloseTo(70 / N, 6);
    expect(r.hinges.every((x) => x.kind === 'axial')).toBe(true);
  });

  it('a funicular three-hinged arch carries no moment: it fails by crushing, at Np/N of its most compressed members', () => {
    // Parabolic arch, span 10, rise 4, crown hinge drawn on both members that meet there.
    const xs = [0, 1.25, 2.5, 3.75, 5, 6.25, 7.5, 8.75, 10];
    const m = model(xs.map((x, i) => [i + 1, x, (16 * x * (10 - x)) / 100] as [number, number, number]),
      xs.slice(1).map((_, i) => [i + 1, i + 1, i + 2] as El), [[1, 'pinned'], [9, 'pinned']],
      xs.slice(1, -1).map((_, i) => P(i + 2, 0, -10)));
    m.elements.get(4)!.hingeEnd = true;
    m.elements.get(5)!.hingeStart = true;
    // H = M0(crown)/f = 100/4 = 25; at the springings V = 35.
    const N = Math.hypot(25, 35);
    const r = run(m, 1000);
    expect(r.isMechanism).toBe(true);
    expect(r.collapseFactor).toBeCloseTo(1000 / N, 4);
    expect(r.hinges.every((h) => h.kind === 'axial')).toBe(true);
    expect(new Set(r.hinges.map((h) => h.elementId))).toEqual(new Set([1, 8]));
  });

  it('a frame member that yields axially under a transverse load is itself the mechanism', () => {
    // Propped cantilever pulled hard along its axis, lightly loaded across it.
    const m = model([[1, 0, 0], [2, 6, 0], [3, 12, 0]], [[1, 1, 2], [2, 2, 3]], [[1, 'fixed'], [3, 'rollerX']],
      [P(3, 100, 0), q(2, -0.1)]);
    const r = run(m, 500);
    expect(r.isMechanism).toBe(true);
    expect(r.hinges[0].kind).toBe('axial');
    expect(r.collapseFactor).toBeCloseTo(5, 4);
  });
});
