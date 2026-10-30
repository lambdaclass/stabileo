/**
 * The primary structure chosen by the reader: every valid choice gives the
 * same answer as the method's own choice and as the stiffness method, each
 * coefficient agrees with the displacement of its primary, and a wrong choice
 * is refused with the reason a student needs.
 */
import { describe, it, expect } from 'vitest';
import { solveForceMethod, ForceMethodError, type ForceMethodResult } from '../solve';
import { releaseOptions } from '../releases';
import type { SolverInput, SolverLoad } from '../../types';

type Sup = [number, string, Record<string, number>?];
type El = [number, number, number, 'frame' | 'truss', boolean?, boolean?];

function model(opts: { nodes: Array<[number, number, number]>; elements: El[]; supports: Sup[]; loads: SolverLoad[] }): SolverInput {
  return {
    nodes: new Map(opts.nodes.map(([id, x, z]) => [id, { id, x, z }])),
    materials: new Map([[1, { id: 1, e: 200_000, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 }]]),
    elements: new Map(opts.elements.map(([id, nodeI, nodeJ, type, hs, he]) => [id, {
      id, type, nodeI, nodeJ, materialId: 1, sectionId: 1, hingeStart: !!hs, hingeEnd: !!he,
    }])),
    supports: new Map(opts.supports.map(([nodeId, type, extra], k) => [k + 1, { id: k + 1, nodeId, type: type as never, ...extra }])),
    loads: opts.loads,
  } as unknown as SolverInput;
}
const nodal = (nodeId: number, fx: number, fz: number, my = 0): SolverLoad => ({ type: 'nodal', data: { nodeId, fx, fz, my } });
const q = (elementId: number, qI: number): SolverLoad => ({ type: 'distributed', data: { elementId, qI, qJ: qI } });

const propped = () => model({ nodes: [[1, 0, 0], [2, 6, 0]], elements: [[1, 1, 2, 'frame']], supports: [[1, 'fixed'], [2, 'rollerX']], loads: [q(1, -10)] });
const twoSpan = () => model({
  nodes: [[1, 0, 0], [2, 5, 0], [3, 10, 0]], elements: [[1, 1, 2, 'frame'], [2, 2, 3, 'frame']],
  supports: [[1, 'pinned'], [2, 'rollerX'], [3, 'rollerX']], loads: [q(1, -12), q(2, -12)],
});
const portal = () => model({
  nodes: [[1, 0, 0], [2, 0, 4], [3, 6, 4], [4, 6, 0]], elements: [[1, 1, 2, 'frame'], [2, 2, 3, 'frame'], [3, 3, 4, 'frame']],
  supports: [[1, 'fixed'], [4, 'fixed']], loads: [nodal(2, 15, 0), q(2, -20)],
});
const hingedPortal = () => model({
  nodes: [[1, 0, 0], [2, 0, 4], [3, 6, 4], [4, 6, 0]], elements: [[1, 1, 2, 'frame'], [2, 2, 3, 'frame', false, true], [3, 3, 4, 'frame']],
  supports: [[1, 'fixed'], [4, 'fixed']], loads: [nodal(2, 15, 0), q(2, -20)],
});
const truss = () => model({
  nodes: [[1, 0, 0], [2, 4, 0], [3, 4, 3], [4, 0, 3]],
  elements: [[1, 1, 2, 'truss'], [2, 2, 3, 'truss'], [3, 3, 4, 'truss'], [4, 4, 1, 'truss'], [5, 1, 3, 'truss'], [6, 2, 4, 'truss']],
  supports: [[1, 'pinned'], [2, 'rollerX']], loads: [nodal(3, 10, -20)],
});
const onSpring = () => model({ nodes: [[1, 0, 0], [2, 6, 0]], elements: [[1, 1, 2, 'frame']], supports: [[1, 'fixed'], [2, 'spring', { ky: 3000 }]], loads: [q(1, -10)] });

const reaction = (r: ForceMethodResult, node: number, c: number) =>
  r.final.reactions.find((x) => x.nodeId === node && x.component === c)?.value ?? 0;

/** Same answer as the method's own choice, the stiffness method agreeing, and Mohr = displacements. */
function agrees(input: SolverInput, keys: string[]): ForceMethodResult {
  const r = solveForceMethod(input, { releases: keys });
  const auto = solveForceMethod(input);
  expect(r.choice).toBe('manual');
  expect(r.verification.ok, `${keys.join(',')}: off by ${r.verification.maxForceDiff}`).toBe(true);
  for (const x of auto.final.reactions) expect(reaction(r, x.nodeId, x.component)).toBeCloseTo(x.value, 6);
  const big = Math.max(...r.delta.flat().map(Math.abs));
  r.delta.forEach((row, i) => row.forEach((v, j) => {
    expect(Math.abs(v - r.deltaCheck[i][j]) / big, `δ${i + 1}${j + 1}`).toBeLessThan(1e-7);
    expect(Math.abs(v - r.delta[j][i]) / big).toBeLessThan(1e-9);
  }));
  const big0 = Math.max(1e-12, ...r.delta0.map(Math.abs));
  r.delta0.forEach((v, i) => expect(Math.abs(v - r.delta0Check[i]) / big0, `δ${i + 1}0`).toBeLessThan(1e-7));
  return r;
}

function refused(input: SolverInput, keys: string[], opts: { axial?: boolean } = {}): ForceMethodError {
  try { solveForceMethod(input, { releases: keys, ...opts }); } catch (e) {
    expect(e).toBeInstanceOf(ForceMethodError);
    return e as ForceMethodError;
  }
  throw new Error(`${keys.join(',')} was solved`);
}

describe('a fundamental of the reader\'s choosing', () => {
  it('propped cantilever: the prop, the fixed-end moment or a hinge at the wall give 3qL/8 and qL²/8', () => {
    for (const keys of [['r:2:1'], ['r:1:2'], ['h:1:I']]) {
      const r = agrees(propped(), keys);
      expect(reaction(r, 2, 1)).toBeCloseTo(22.5, 6);
      expect(Math.abs(reaction(r, 1, 2))).toBeCloseTo(45, 6);
    }
  });

  it('two equal spans: the middle support or a hinge over it (the support moment, −qL²/8)', () => {
    const bySupport = agrees(twoSpan(), ['r:2:1']);
    expect(bySupport.X[0]).toBeCloseTo(75, 6);
    const byHinge = agrees(twoSpan(), ['h:1:J']);
    expect(Math.abs(byHinge.X[0])).toBeCloseTo((12 * 25) / 8, 6);
    expect(byHinge.primary.elements.find((e) => e.id === 1)!.hingeEnd).toBe(true);
    expect(byHinge.final.bars.find((b) => b.elementId === 1)!.ends.mEnd).toBeCloseTo(bySupport.final.bars.find((b) => b.elementId === 1)!.ends.mEnd, 6);
  });

  it('portal frame, GH = 3: four different fundamentals, one answer', () => {
    agrees(portal(), ['r:4:0', 'r:4:1', 'r:4:2']);
    agrees(portal(), ['h:1:I', 'h:3:J', 'r:4:0']);
    agrees(portal(), ['c:2:J']);
    agrees(portal(), ['h:2:I', 'h:2:J', 'h:1:I']);
  });

  it('a frame with an internal hinge: GH = 2, released at a foot or as a three-hinged portal', () => {
    expect(solveForceMethod(hingedPortal()).count.gh).toBe(2);
    agrees(hingedPortal(), ['r:4:0', 'r:4:1']);
    agrees(hingedPortal(), ['r:1:2', 'r:4:2']);
  });

  it('truss with both diagonals: any one bar is the redundant, with its own L/EA in δ₁₁', () => {
    for (const b of [5, 6, 1]) {
      const r = agrees(truss(), [`b:${b}`]);
      const own = r.deltaTerms[0][0].find((t) => t.source === 'bar')!;
      expect(own.detail).toMatchObject({ biela: true, a: 1, b: 1, L: b === 1 ? 4 : 5 });
      expect(own.value).toBeCloseTo((b === 1 ? 4 : 5) / (200e6 * 0.01), 15);
      const rows = r.deltaTerms[0][0].filter((t) => t.source === 'axial');
      expect(rows.every((t) => t.detail?.biela)).toBe(true);
      for (const t of rows) expect(t.value).toBeCloseTo((t.detail!.a! * t.detail!.b! * t.detail!.L!) / t.detail!.EA!, 15);
    }
  });

  it('beam on a spring: releasing the spring adds 1/k to δ₁₁; keeping it adds R̄·R̄/k', () => {
    const EI = 200e6 * 1e-4, L = 6, k = 3000;
    const R = (3 * 10 * L / 8) / (1 + (3 * EI) / (k * L ** 3));
    const bySpring = agrees(onSpring(), ['s:2:1']);
    const own = bySpring.deltaTerms[0][0].find((t) => t.detail?.released)!;
    expect(own.value).toBeCloseTo(1 / k, 15);
    expect(Math.abs(bySpring.X[0])).toBeCloseTo(R, 6);
    const byMoment = agrees(onSpring(), ['r:1:2']);
    const spring = byMoment.deltaTerms[0][0].find((t) => t.source === 'spring')!;
    expect(spring.detail).toMatchObject({ nodeId: 2, component: 1, k });
    expect(spring.value).toBeCloseTo((spring.detail!.a! * spring.detail!.b!) / k, 15);
  });

  it('settlements and temperature reach δᵢ₀ with a chosen fundamental too', () => {
    const settled = model({
      nodes: [[1, 0, 0], [2, 5, 0], [3, 10, 0]], elements: [[1, 1, 2, 'frame'], [2, 2, 3, 'frame']],
      supports: [[1, 'fixed'], [2, 'rollerX', { dz: -0.01 }], [3, 'pinned']], loads: [q(1, -8)],
    });
    const r = agrees(settled, ['h:1:I', 'h:1:J', 'r:3:0']);
    expect(r.delta0Terms.flat().some((t) => t.source === 'settlement')).toBe(true);
    const hot = model({
      nodes: [[1, 0, 0], [2, 5, 0]], elements: [[1, 1, 2, 'frame']], supports: [[1, 'fixed'], [2, 'fixed']],
      loads: [{ type: 'thermal', data: { elementId: 1, dtUniform: 20, dtGradient: 15 } }],
    });
    const t = agrees(hot, ['r:2:0', 'r:2:1', 'r:2:2']);
    expect(t.delta0Terms.flat().some((x) => x.source === 'thermal')).toBe(true);
  });

  it('lists the releases the structure offers, grouped', () => {
    const keys = releaseOptions(portal()).map((o) => o.key);
    expect(keys).toEqual(expect.arrayContaining(['r:1:0', 'r:1:1', 'r:1:2', 'r:4:2', 'h:1:I', 'h:2:I', 'c:2:J', 'c:2:I']));
    expect(keys).not.toContain('c:1:I');
    expect(releaseOptions(onSpring()).map((o) => o.key)).toContain('s:2:1');
    expect(releaseOptions(truss()).filter((o) => o.group === 'biela')).toHaveLength(6);
  });
});

describe('a wrong fundamental is refused, with its reason', () => {
  it('too few or too many releases: says how many and GH', () => {
    const e = refused(portal(), ['r:4:0', 'r:4:1']);
    expect(e.key).toBe('count');
    expect(e.detail.chosen).toBe(2);
    expect(e.gh).toBe(3);
  });

  it('a primary that moves: says which nodes', () => {
    const e = refused(propped(), ['r:1:0']);
    expect(e.key).toBe('unstable');
    expect(e.detail.nodes).toEqual([1, 2]);
    expect(refused(truss(), ['r:2:1']).key).toBe('unstable');
  });

  it('a hinge where every other bar already arrives hinged releases nothing (k − 1 rule)', () => {
    const fixedTwoSpan = model({
      nodes: [[1, 0, 0], [2, 5, 0], [3, 10, 0]], elements: [[1, 1, 2, 'frame'], [2, 2, 3, 'frame']],
      supports: [[1, 'fixed'], [2, 'rollerX'], [3, 'fixed']], loads: [q(1, -12)],
    });
    expect(solveForceMethod(fixedTwoSpan).count.gh).toBe(4);
    const e = refused(fixedTwoSpan, ['h:1:J', 'h:2:I', 'r:1:2', 'r:3:2']);
    expect(e.key).toBe('hingeAll');
    expect(e.detail.nodes).toEqual([2]);
    expect(e.detail.k).toBe(2);
  });

  it('a release that does no work leaves [δ] singular, and is not solved', () => {
    const t = truss();
    t.supports.set(1, { id: 1, nodeId: 1, type: 'fixed' } as never);
    const e = refused(t, ['r:1:2']);
    expect(e.key).toBe('singular');
    expect(e.detail.which).toEqual([1]);
  });

  it('the same end cut and hinged at once is a clash', () => {
    expect(refused(portal(), ['c:2:J', 'h:2:J']).key).toBe('clash');
  });
});

describe('the axial term, on and off', () => {
  it('off: frame members lose it, bielas keep it', () => {
    const r = solveForceMethod(portal(), { axial: false });
    expect(r.axial).toBe(false);
    expect(r.deltaTerms.flat(2).some((t) => t.source === 'axial')).toBe(false);
    expect(r.verification.axialOff).toBe(true);
    r.delta.forEach((row, i) => row.forEach((v, j) => expect(v).toBeCloseTo(r.deltaCheck[i][j], 12)));
    const tOn = solveForceMethod(truss()), tOff = solveForceMethod(truss(), { axial: false });
    expect(tOff.X[0]).toBeCloseTo(tOn.X[0], 9);
    expect(tOff.verification.ok).toBe(true);
  });

  it('off, a redundant that works only axially keeps its axial row (a fixed-fixed beam\'s horizontal reaction)', () => {
    const beam = model({ nodes: [[1, 0, 0], [2, 6, 0]], elements: [[1, 1, 2, 'frame']], supports: [[1, 'fixed'], [2, 'fixed']], loads: [q(1, -10)] });
    const r = solveForceMethod(beam, { axial: false, releases: ['r:2:0', 'r:2:1', 'r:2:2'] });
    expect(r.axialKept).toEqual([0]);
    expect(Math.abs(reaction(r, 1, 2))).toBeCloseTo(30, 6);
  });

  it('off, the portal\'s redundants are the classical ones, close to the stiffness method', () => {
    const on = solveForceMethod(portal(), { releases: ['r:4:0', 'r:4:1', 'r:4:2'] });
    const off = solveForceMethod(portal(), { releases: ['r:4:0', 'r:4:1', 'r:4:2'], axial: false });
    off.X.forEach((x, i) => expect(Math.abs(x - on.X[i]) / Math.max(...on.X.map(Math.abs))).toBeLessThan(0.02));
    expect(off.X.some((x, i) => Math.abs(x - on.X[i]) > 1e-6)).toBe(true);
  });
});
