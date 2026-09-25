/**
 * Temperature, through every tool that reads it.
 *
 * A temperature change is the one load that is not a force: a bar that is
 * free to grow and bend carries nothing, and one that is not carries forces
 * that come only from the restraint. Each implementation turns ΔT into
 * equivalent loads its own way — per element type, per release, per end —
 * and a wrong sign or a skipped element type shows as a structure that is
 * internally consistent and simply describes a different load.
 *
 * So: the two step-by-step wizards against the analysis solver, the force
 * method's two ways of computing each δ and its agreement with the analysis
 * solver, and the advanced analyses (second order, buckling, plastic,
 * combinations) against closed forms. Uniform ΔT and gradients, on frames,
 * on members with every hinge and release, on truss bars, with every support.
 */
import { describe, it, expect } from 'vitest';
import { solve, solve3D, solvePDelta, solveBuckling, solveBuckling3D, solvePDelta3D, solvePlastic } from '../wasm-solver';
import { solveDetailed } from '../solver-detailed';
import { solveDetailed3D } from '../solver-detailed-3d';
import { solveForceMethod } from '../force-method/solve';
import { solveForceMethod3D } from '../force-method/solve-3d';
import type { SolverInput, SolverLoad } from '../types';
import type { SolverInput3D, SolverLoad3D, SolverSupport3D } from '../types-3d';
import { historyStore, modelStore, uiStore } from '../../store';

const E = 200_000, A = 0.01, IZ = 1e-4, ALPHA = 12e-6;
const EA = E * 1000 * A, EI = E * 1000 * IZ;

/* ─────────────────────────────── plane ─────────────────────────────── */

type Sup = [number, string, Record<string, number>?];
type El = [number, number, number, 'frame' | 'truss', boolean?, boolean?];

function m2(nodes: Array<[number, number, number]>, elements: El[], supports: Sup[], loads: SolverLoad[]): SolverInput {
  return {
    nodes: new Map(nodes.map(([id, x, z]) => [id, { id, x, z }])),
    materials: new Map([[1, { id: 1, e: E, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: A, iz: IZ }]]),
    elements: new Map(elements.map(([id, nodeI, nodeJ, type, hs, he]) => [id, {
      id, type, nodeI, nodeJ, materialId: 1, sectionId: 1, hingeStart: !!hs, hingeEnd: !!he,
    }])),
    supports: new Map(supports.map(([nodeId, type, extra], k) => [k + 1, { id: k + 1, nodeId, type: type as never, ...extra }])),
    loads,
  } as unknown as SolverInput;
}
const th = (elementId: number, dtUniform: number, dtGradient = 0): SolverLoad =>
  ({ type: 'thermal', data: { elementId, dtUniform, dtGradient } });
const PORTAL: Array<[number, number, number]> = [[1, 0, 0], [2, 0, 4], [3, 6, 4], [4, 6, 0]];

const PLANE: Record<string, SolverInput> = {
  'portal, fixed feet, beam heated and bent': m2(PORTAL, [[1, 1, 2, 'frame'], [2, 2, 3, 'frame'], [3, 3, 4, 'frame']],
    [[1, 'fixed'], [4, 'fixed']], [th(2, 30, 15)]),
  'portal, hinge at the start of the heated beam': m2(PORTAL, [[1, 1, 2, 'frame'], [2, 2, 3, 'frame', true], [3, 3, 4, 'frame']],
    [[1, 'fixed'], [4, 'fixed']], [th(2, 30, 15)]),
  'portal, hinge at the end of a heated column': m2(PORTAL, [[1, 1, 2, 'frame', false, true], [2, 2, 3, 'frame'], [3, 3, 4, 'frame']],
    [[1, 'fixed'], [4, 'fixed']], [th(1, -20, 12)]),
  'portal, pin-ended beam heated and bent': m2(PORTAL, [[1, 1, 2, 'frame'], [2, 2, 3, 'frame', true, true], [3, 3, 4, 'frame']],
    [[1, 'fixed'], [4, 'fixed']], [th(2, 25, 18)]),
  'braced portal, heated diagonal': m2(PORTAL, [[1, 1, 2, 'frame'], [2, 2, 3, 'frame'], [3, 3, 4, 'frame'], [4, 1, 3, 'truss']],
    [[1, 'pinned'], [4, 'pinned']], [th(4, 40)]),
  'truss bar given a gradient too (a truss cannot bend)': m2(PORTAL, [[1, 1, 2, 'frame'], [2, 2, 3, 'frame'], [3, 3, 4, 'frame'], [4, 1, 3, 'truss']],
    [[1, 'pinned'], [4, 'pinned']], [th(4, 40, 25)]),
  'hyperstatic truss, one bar heated': m2([[1, 0, 0], [2, 4, 0], [3, 8, 0], [4, 4, 3]],
    [[1, 1, 2, 'truss'], [2, 2, 3, 'truss'], [3, 1, 4, 'truss'], [4, 4, 3, 'truss'], [5, 2, 4, 'truss']],
    [[1, 'pinned'], [3, 'pinned']], [th(5, 35), th(1, -10)]),
  'inclined member, rotated roller, spring': m2([[1, 0, 0], [2, 3, 4], [3, 8, 4]], [[1, 1, 2, 'frame'], [2, 2, 3, 'frame']],
    [[1, 'fixed'], [3, 'spring', { kx: 2000, ky: 5000, kz: 900, angle: 0.3 }]], [th(1, 20, -10), th(2, -15, 8)]),
  'inclined roller at a heated beam': m2([[1, 0, 0], [2, 6, 0]], [[1, 1, 2, 'frame']],
    [[1, 'fixed'], [2, 'inclinedRoller', { angle: 0.5 } as never]], [th(1, 30, 12)]),
  'heat together with a settlement': m2(PORTAL, [[1, 1, 2, 'frame'], [2, 2, 3, 'frame'], [3, 3, 4, 'frame']],
    [[1, 'fixed', { dz: -0.004 }], [4, 'pinned']], [th(2, 20, 10), th(3, 0, 6)]),
  'simple beam: free to grow and bend, so no force': m2([[1, 0, 0], [2, 6, 0]], [[1, 1, 2, 'frame']],
    [[1, 'pinned'], [2, 'rollerX']], [th(1, 30, 15)]),
  'three-hinge arch: isostatic, so no force': m2([[1, 0, 0], [2, 3, 4], [3, 6, 0]], [[1, 1, 2, 'frame', false, true], [2, 2, 3, 'frame']],
    [[1, 'pinned'], [3, 'pinned']], [th(1, 30, 10), th(2, 30, 10)]),
  'gerber beam, the hinged span heated': m2([[1, 0, 0], [2, 5, 0], [3, 7, 0], [4, 12, 0]],
    [[1, 1, 2, 'frame'], [2, 2, 3, 'frame', false, true], [3, 3, 4, 'frame']],
    [[1, 'fixed'], [2, 'rollerX'], [4, 'rollerX']], [th(2, 25, 14), th(3, 0, 10)]),
};

function compare2D(input: SolverInput) {
  const ref = solve(input);
  const det = solveDetailed(input);
  const dof = (nodeId: number, ld: number) => det.dofNumbering.dofs.find((d) => d.nodeId === nodeId && d.localDof === ld);
  const frame = (nodeId: number) => det.nodeFrames.find((f) => f.nodeId === nodeId);
  const toGlobal = (nodeId: number, a: number, b: number): [number, number] => {
    const f = frame(nodeId);
    if (!f) return [a, b];
    const c = Math.cos(f.angle), s = Math.sin(f.angle);
    return [c * a - s * b, s * a + c * b];
  };
  const scaleU = Math.max(1e-9, ...ref.displacements.flatMap((d) => [Math.abs(d.ux), Math.abs(d.uz)]));
  for (const d of ref.displacements) {
    const [ux, uz] = toGlobal(d.nodeId, det.uAll[dof(d.nodeId, 0)!.globalIndex], det.uAll[dof(d.nodeId, 1)!.globalIndex]);
    expect(Math.abs(ux - d.ux) / scaleU, `ux@${d.nodeId}: ${ux} vs ${d.ux}`).toBeLessThan(1e-6);
    expect(Math.abs(uz - d.uz) / scaleU, `uz@${d.nodeId}: ${uz} vs ${d.uz}`).toBeLessThan(1e-6);
  }
  const scaleF = Math.max(1e-6, ...ref.elementForces.flatMap((e) => [e.nStart, e.nEnd, e.vStart, e.vEnd, e.mStart, e.mEnd].map(Math.abs)));
  for (const e of ref.elementForces) {
    const f = det.elementForces.find((x) => x.elementId === e.elementId)!.fLocalFinal;
    const pairs: Array<[string, number, number]> = f.length === 6
      ? [['N0', -f[0], e.nStart], ['V0', f[1], e.vStart], ['M0', f[2], e.mStart], ['N1', f[3], e.nEnd], ['V1', -f[4], e.vEnd], ['M1', -f[5], e.mEnd]]
      : [['N0', -f[0], e.nStart], ['N1', f[2], e.nEnd]];
    for (const [k, got, want] of pairs) {
      expect(Math.abs(got - want) / scaleF, `elem ${e.elementId} ${k}: ${got} vs ${want}`).toBeLessThan(1e-6);
    }
  }
  return ref;
}

function expectFmCoherent(name: string, r: { redundants: unknown[]; count: { gh: number }; delta: number[][]; deltaCheck: number[][]; delta0: number[]; delta0Check: number[]; verification: { maxForceDiff: number; maxReactionDiff: number; scale: number; ok: boolean } }) {
  expect(r.redundants.length).toBe(r.count.gh);
  const sd = Math.max(...r.delta.flat().map(Math.abs), 1e-30);
  /* A δᵢ₀ that is zero in exact arithmetic comes out as round-off, ~1e-19 m: below a nanometre, it is zero. */
  const s0 = Math.max(...r.delta0.map(Math.abs), 1e-9);
  r.delta.forEach((row, i) => {
    row.forEach((v, j) => expect(Math.abs(v - r.deltaCheck[i][j]) / sd, `${name} δ${i + 1}${j + 1}`).toBeLessThan(1e-9));
    expect(Math.abs(r.delta0[i] - r.delta0Check[i]) / s0, `${name} δ${i + 1}0: ${r.delta0[i]} vs ${r.delta0Check[i]}`).toBeLessThan(1e-9);
  });
  expect(r.verification.ok, `${name}: the wizard's own check`).toBe(true);
  expect(r.verification.maxForceDiff / r.verification.scale, `${name} forces`).toBeLessThan(1e-7);
  expect(r.verification.maxReactionDiff / r.verification.scale, `${name} reactions`).toBeLessThan(1e-7);
}

describe('temperature in the plane: the stiffness wizard against the analysis solver', () => {
  for (const [name, input] of Object.entries(PLANE)) it(name, () => { compare2D(input); });

  it('a free bar carries nothing; a restrained truss bar carries −EAαΔT', () => {
    for (const k of ['simple beam: free to grow and bend, so no force', 'three-hinge arch: isostatic, so no force']) {
      const r = solve(PLANE[k]);
      const peak = Math.max(...r.elementForces.flatMap((e) => [e.nStart, e.vStart, e.mStart, e.mEnd].map(Math.abs)));
      expect(peak, k).toBeLessThan(1e-6);
    }
    const bar = solve(m2([[1, 0, 0], [2, 4, 0]], [[1, 1, 2, 'truss']], [[1, 'pinned'], [2, 'pinned']], [th(1, 30)]));
    expect(bar.elementForces[0].nStart).toBeCloseTo(-EA * ALPHA * 30, 6);
  });

  it('a fixed-fixed beam under a gradient: M = EIαΔT/h everywhere, no shear, no deflection', () => {
    const h = Math.sqrt(12 * IZ / A);
    const r = compare2D(m2([[1, 0, 0], [2, 5, 0]], [[1, 1, 2, 'frame']], [[1, 'fixed'], [2, 'fixed']], [th(1, 0, 20)]));
    const f = r.elementForces[0];
    expect(Math.abs(f.mStart)).toBeCloseTo(EI * ALPHA * 20 / h, 6);
    expect(f.mEnd).toBeCloseTo(f.mStart, 6);
    expect(Math.abs(f.vStart)).toBeLessThan(1e-9);
  });

  it('a propped cantilever under a gradient: the wall takes 3/2 · EIαΔT/h', () => {
    const h = Math.sqrt(12 * IZ / A);
    const r = compare2D(m2([[1, 0, 0], [2, 5, 0]], [[1, 1, 2, 'frame']], [[1, 'fixed'], [2, 'rollerX']], [th(1, 0, 20)]));
    expect(Math.abs(r.reactions.find((x) => x.nodeId === 1)!.my)).toBeCloseTo(1.5 * EI * ALPHA * 20 / h, 6);
  });
});

describe('temperature in the plane: the force method', () => {
  for (const [name, input] of Object.entries(PLANE)) {
    it(name, () => {
      const r = solveForceMethod(input);
      if (r.count.gh > 0) expectFmCoherent(name, r as never);
      /* And against the analysis solver, not only against the wizard. */
      const ref = solve(input);
      const scale = Math.max(1e-6, ...ref.elementForces.flatMap((e) => [e.nStart, e.vStart, e.mStart, e.mEnd].map(Math.abs)));
      for (const e of ref.elementForces) {
        const b = r.stiffness.bars.find((x) => x.elementId === e.elementId) as never as Record<string, number> | undefined;
        if (!b) continue;
        for (const k of ['mStart', 'mEnd'] as const) {
          if (typeof b[k] !== 'number') continue;
          expect(Math.abs(Math.abs(b[k]) - Math.abs(e[k])) / scale, `${name} ${k}@${e.elementId}: ${b[k]} vs ${e[k]}`).toBeLessThan(1e-6);
        }
      }
    });
  }

  it('a heated truss bar shows in δᵢ₀ as its own thermal term', () => {
    const r = solveForceMethod(PLANE['braced portal, heated diagonal']);
    expect(r.count.gh).toBe(2);
    const rows = r.delta0Terms.flat().filter((t) => t.source === 'thermal' && t.elementId === 4);
    expect(rows.length).toBeGreaterThan(0);
    expect(Math.max(...rows.map((t) => Math.abs(t.value)))).toBeGreaterThan(0);
  });
});

/* ─────────────────────────────── space ─────────────────────────────── */

type Rel = Partial<Record<'releaseMyStart' | 'releaseMyEnd' | 'releaseMzStart' | 'releaseMzEnd' | 'releaseTStart' | 'releaseTEnd', boolean>>;
const el3 = (id: number, i: number, j: number, type: 'frame' | 'truss' = 'frame', rel: Rel = {}) => ({
  id, type, nodeI: i, nodeJ: j, materialId: 1, sectionId: 1,
  releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false, ...rel,
});
const sup3 = (nodeId: number, flags: string, extra: Partial<SolverSupport3D> = {}): SolverSupport3D => ({
  nodeId, rx: flags[0] === '1', ry: flags[1] === '1', rz: flags[2] === '1',
  rrx: flags[3] === '1', rry: flags[4] === '1', rrz: flags[5] === '1', ...extra,
});
function m3(nodes: Array<[number, number, number, number]>, elements: ReturnType<typeof el3>[], supports: SolverSupport3D[], loads: SolverLoad3D[]): SolverInput3D {
  return {
    nodes: new Map(nodes.map(([id, x, y, z]) => [id, { id, x, y, z }])),
    materials: new Map([[1, { id: 1, e: E, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: A, iy: 1e-4, iz: 2e-4, j: 1.5e-4 }]]),
    elements: new Map(elements.map((e) => [e.id, e])),
    supports: new Map(supports.map((s, i) => [i, s])),
    loads,
  } as unknown as SolverInput3D;
}
const th3 = (elementId: number, dtUniform: number, dtGradientY = 0, dtGradientZ = 0): SolverLoad3D =>
  ({ type: 'thermal', data: { elementId, dtUniform, dtGradientY, dtGradientZ } });
const P3: Array<[number, number, number, number]> = [[1, 0, 0, 0], [2, 0, 0, 3], [3, 4, 0, 3], [4, 4, 2, 3], [5, 4, 2, 0]];
const P3_EL = () => [el3(1, 1, 2), el3(2, 2, 3), el3(3, 3, 4), el3(4, 4, 5)];
const FIX = () => [sup3(1, '111111'), sup3(5, '111111')];

const SPACE: Record<string, SolverInput3D> = {
  'space portal, uniform and both gradients on every member': m3(P3, P3_EL(), FIX(), [th3(1, 10, 4, -6), th3(2, 20, 8, 5), th3(3, -15, -3, 7), th3(4, 5, 6, 2)]),
  'releases about each axis at the heated members': m3(P3,
    [el3(1, 1, 2, 'frame', { releaseMyEnd: true }), el3(2, 2, 3, 'frame', { releaseMzStart: true }), el3(3, 3, 4, 'frame', { releaseTStart: true, releaseMyEnd: true }), el3(4, 4, 5)],
    FIX(), [th3(1, 12, 6, 9), th3(2, 20, 8, 5), th3(3, -15, -3, 7)]),
  'a pin-ended member, heated and bent both ways': m3(P3,
    [el3(1, 1, 2), el3(2, 2, 3, 'frame', { releaseMyStart: true, releaseMzStart: true, releaseMyEnd: true, releaseMzEnd: true }), el3(3, 3, 4), el3(4, 4, 5)],
    FIX(), [th3(2, 25, 10, 12)]),
  'heated truss bracing on a space frame': m3([...P3, [6, 0, 2, 0]], [...P3_EL(), el3(5, 6, 2, 'truss'), el3(6, 6, 4, 'truss')],
    [...FIX(), sup3(6, '111111')], [th3(5, 40), th3(6, -25)]),
  'truss bar given gradients too (a truss cannot bend)': m3([...P3, [6, 0, 2, 0]], [...P3_EL(), el3(5, 6, 2, 'truss'), el3(6, 6, 4, 'truss')],
    [...FIX(), sup3(6, '111111')], [th3(5, 40, 20, 15)]),
  'springs, a settlement and heat': m3(P3, P3_EL(),
    [sup3(1, '111111', { dz: -0.003 } as never), sup3(5, '000000', { kx: 2e3, ky: 3e3, kz: 5e3, krx: 400, kry: 600, krz: 800 })],
    [th3(2, 20, 8, 5), th3(4, 0, 0, 10)]),
  'inclined support under a heated frame': m3(P3, P3_EL(),
    [sup3(1, '111111'), sup3(5, '000111', { isInclined: true, normalX: 0.3, normalY: 0.2, normalZ: 1 })], [th3(2, 30, 10, -5)]),
  'space cantilever: free to grow and bend, so no force': m3([[1, 0, 0, 0], [2, 3, 1, 2]], [el3(1, 1, 2)], [sup3(1, '111111')], [th3(1, 30, 10, 12)]),
};

function compare3D(input: SolverInput3D) {
  const r = solve3D(input) as never as { displacements: Array<Record<string, number>>; elementForces: Array<Record<string, number>> };
  const d = solveDetailed3D(input);
  const keys = ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'];
  /* An inclined support's node is solved in its own axes: turned back to global before comparing. */
  const frames = new Map((d.nodeFrames3D ?? []).map((f) => [f.nodeId, f.R]));
  const uAt = (nodeId: number, ld: number) => {
    const info = d.dofNumbering.dofs.find((q) => q.nodeId === nodeId && q.localDof === ld);
    return info ? d.uAll[info.globalIndex] : 0;
  };
  const scale = (from: number) => Math.max(1e-12, ...r.displacements.flatMap((x) => keys.slice(from, from + 3).map((k) => Math.abs(x[k]))));
  for (const x of r.displacements) {
    keys.forEach((k, ld) => {
      if (!d.dofNumbering.dofs.some((q) => q.nodeId === x.nodeId && q.localDof === ld)) return;
      const R = frames.get(x.nodeId);
      const got = R && ld < 3 ? R[0][ld] * uAt(x.nodeId, 0) + R[1][ld] * uAt(x.nodeId, 1) + R[2][ld] * uAt(x.nodeId, 2) : uAt(x.nodeId, ld);
      expect(Math.abs(got - x[k]) / scale(ld < 3 ? 0 : 3), `${k}@${x.nodeId}: ${got} vs ${x[k]}`).toBeLessThan(1e-9);
    });
  }
  /* Axial forces too: the one end force a truss bar has. */
  const sN = Math.max(1e-6, ...r.elementForces.map((e) => Math.abs(e.nStart)));
  for (const e of r.elementForces) {
    const f = d.elementForces.find((x) => x.elementId === e.elementId)!.fLocalFinal;
    expect(Math.abs(-f[0] - e.nStart) / sN, `N@${e.elementId}: ${-f[0]} vs ${e.nStart}`).toBeLessThan(1e-6);
  }
  return r;
}

describe('temperature in space: the stiffness wizard against the analysis solver', () => {
  for (const [name, input] of Object.entries(SPACE)) it(name, () => { compare3D(input); });

  it('a space bar between two fixed ends carries −EAαΔT', () => {
    const r = compare3D(m3([[1, 0, 0, 0], [2, 3, 2, 1], [3, 0, 3, 0]], [el3(1, 1, 2, 'truss'), el3(2, 2, 3, 'truss'), el3(3, 1, 3, 'truss')],
      [sup3(1, '111000'), sup3(2, '111000'), sup3(3, '111000')], [th3(1, 30)]));
    expect(r.elementForces.find((e) => e.elementId === 1)!.nStart).toBeCloseTo(-EA * ALPHA * 30, 6);
  });
});

describe('temperature in space: the force method', () => {
  for (const [name, input] of Object.entries(SPACE)) {
    if (name.startsWith('space cantilever')) continue;
    it(name, () => expectFmCoherent(name, solveForceMethod3D(input) as never));
  }
});

/* ─────────────────────────── advanced analyses ─────────────────────────── */

describe('temperature in the advanced analyses', () => {
  /*
   * A strut fixed at both ends and heated: N = −EAαΔT, and nothing else. Split
   * in eight so the buckled shape is resolved. ΔT is large on purpose, to put
   * the strut at λ ≈ 3.3 of its buckling load, where second order is visible.
   */
  const SEG = 8, L = 5, DT = 400, MID = SEG / 2 + 1;
  const LAMBDA = (4 * Math.PI ** 2 * EI / L ** 2) / (EA * ALPHA * DT);
  const strut2D = (extra: SolverLoad[] = []) => m2(
    Array.from({ length: SEG + 1 }, (_, k) => [k + 1, (L * k) / SEG, 0] as [number, number, number]),
    Array.from({ length: SEG }, (_, k) => [k + 1, k + 1, k + 2, 'frame'] as El),
    [[1, 'fixed'], [SEG + 1, 'fixed']],
    [...Array.from({ length: SEG }, (_, k) => th(k + 1, DT)), ...extra],
  );
  const strut3D = (extra: SolverLoad3D[] = []) => m3(
    Array.from({ length: SEG + 1 }, (_, k) => [k + 1, (L * k) / SEG, 0, 0] as [number, number, number, number]),
    Array.from({ length: SEG }, (_, k) => el3(k + 1, k + 1, k + 2)),
    [sup3(1, '111111'), sup3(SEG + 1, '111111')],
    [...Array.from({ length: SEG }, (_, k) => th3(k + 1, DT)), ...extra],
  );
  const midUz = (res: { displacements: Array<{ nodeId: number; uz: number }> }) => res.displacements.find((d) => d.nodeId === MID)!.uz;

  it('buckling, plane: a heated fixed-fixed strut buckles at λ = 4π²EI / (L² · EAαΔT)', () => {
    const r = solveBuckling(strut2D());
    expect(Math.abs(r.modes[0].loadFactor - LAMBDA) / LAMBDA).toBeLessThan(2e-3);
  });

  it('buckling, space: the same strut, about its weaker axis', () => {
    const r = solveBuckling3D(strut3D());
    expect(Math.abs(r.modes[0].loadFactor - LAMBDA) / LAMBDA).toBeLessThan(2e-3);
  });

  it('P-Delta, plane: the linear pass is the linear solution', () => {
    const input = strut2D([{ type: 'nodal', data: { nodeId: MID, fx: 0, fz: -1, my: 0 } }]);
    const r = solvePDelta(input);
    expect(Math.abs(midUz(r.linearResults) - midUz(solve(input))) / Math.abs(midUz(solve(input)))).toBeLessThan(1e-9);
  });

  /*
   * ── Second order ignores the compression a temperature causes ──
   *
   * The P-Delta iteration builds its geometric stiffness from an axial force
   * it recomputes as EA·Δu/L (engine/src/solver/geometric_stiffness.rs). A
   * restrained bar that is heated does not lengthen, so Δu = 0 and its
   * −EAαΔT never reaches the geometric stiffness: a strut at a third of its
   * buckling load comes out with no amplification at all. Buckling reads the
   * axial force from the element results instead, and is right (above).
   *
   * The solver is not touched from here; the fix is its own PR. These
   * `it.fails` start failing — asking to become `it` — once it is merged.
   */
  it.fails('P-Delta, plane: thermal compression amplifies a transverse load by 1/(1 − 1/λ)', () => {
    const input = strut2D([{ type: 'nodal', data: { nodeId: MID, fx: 0, fz: -1, my: 0 } }]);
    const amp = midUz(solvePDelta(input).results) / midUz(solve(input));
    expect(Math.abs(amp - 1 / (1 - 1 / LAMBDA)) / amp).toBeLessThan(0.03);
  });

  it.fails('P-Delta, space: the same, in a space model', () => {
    const input = strut3D([{ type: 'nodal', data: { nodeId: MID, fx: 0, fy: 0, fz: -1, mx: 0, my: 0, mz: 0 } } as SolverLoad3D]);
    const amp = midUz(solvePDelta3D(input).results) / midUz(solve3D(input) as never);
    expect(Math.abs(amp - 1 / (1 - 1 / LAMBDA)) / amp).toBeLessThan(0.03);
  });

  /*
   * ── Plastic collapse: a temperature cannot change the collapse load ──
   *
   * A temperature change puts no load on a structure, so by the uniqueness
   * theorem the collapse factor of a fixed-fixed beam under a central load is
   * 8Mp/(PL) = 20 with or without it. With a gradient on both halves the
   * solver gets 20. With it on one half, the third hinge forms at λ = 20 and
   * completes the mechanism — but the solver's own linear solve does not
   * report that mechanism (the app's front end does), so the loop goes on,
   * reads a moment out of a singular solve and adds a fourth hinge at 23,02:
   * above the upper bound, which equilibrium alone forbids.
   */
  const beam = (extra: SolverLoad[]) => solvePlastic({
    solver: m2([[1, 0, 0], [2, 3, 0], [3, 6, 0]], [[1, 1, 2, 'frame'], [2, 2, 3, 'frame']],
      [[1, 'fixed'], [3, 'fixed']], [{ type: 'nodal', data: { nodeId: 2, fx: 0, fz: -50, my: 0 } }, ...extra]),
    sections: new Map([[1, { a: A, iz: IZ, materialId: 1, b: 0.1, h: 0.3464 }]]),
    materials: new Map([[1, { fy: 250 }]]),
  });
  const MP = 250e3 * 0.1 * 0.3464 ** 2 / 4;

  it('plastic, plane: collapse at 8Mp/(PL), with a uniform ΔT or a gradient on both halves', () => {
    for (const extra of [[], [th(1, 30)], [th(1, 0, 10), th(2, 0, 10)]]) {
      expect(beam(extra).collapseFactor).toBeCloseTo(8 * MP / (50 * 6), 2);
    }
  });

  it.fails('plastic, plane: collapse at 8Mp/(PL), with a gradient on one half', () => {
    expect(beam([th(1, 0, 30)]).collapseFactor).toBeCloseTo(8 * MP / (50 * 6), 2);
  });
});

describe('temperature in load combinations', () => {
  it('plane: a combination is the factored sum of its cases, the thermal one included', () => {
    historyStore.clear(); uiStore.analysisMode = '2d'; modelStore.clear();
    const n = [modelStore.addNode(0, 0), modelStore.addNode(0, 4), modelStore.addNode(6, 4), modelStore.addNode(6, 0)];
    const e = [modelStore.addElement(n[0], n[1]), modelStore.addElement(n[1], n[2]), modelStore.addElement(n[2], n[3])];
    modelStore.addSupport(n[0], 'fixed' as never); modelStore.addSupport(n[3], 'fixed' as never);
    const D = modelStore.addLoadCase('D', 'D'), T = modelStore.addLoadCase('T', 'T' as never);
    modelStore.addNodalLoad(n[1], 10, -20, 0, D);
    modelStore.addThermalLoad(e[1], 30, 15, T);
    const C = modelStore.addCombination('1.2D + 1.0T', [{ caseId: D, factor: 1.2 }, { caseId: T, factor: 1.0 }]);
    const r = modelStore.solveCombinations(false);
    expect(typeof r, String(r)).toBe('object');
    const { perCase, perCombo } = r as Exclude<typeof r, string | null>;
    const combo = perCombo.get(C)!;
    const mT = perCase.get(T)!.elementForces.find((x) => x.elementId === e[1])!.mStart;
    expect(Math.abs(mT)).toBeGreaterThan(1);
    for (const f of combo.elementForces) {
      const want = 1.2 * perCase.get(D)!.elementForces.find((x) => x.elementId === f.elementId)!.mStart
        + perCase.get(T)!.elementForces.find((x) => x.elementId === f.elementId)!.mStart;
      expect(f.mStart).toBeCloseTo(want, 6);
    }
  });

  it('space: the same, in a space model', () => {
    historyStore.clear(); uiStore.analysisMode = '3d'; modelStore.clear();
    const n = [modelStore.addNode(0, 0, 0), modelStore.addNode(0, 0, 3), modelStore.addNode(4, 0, 3), modelStore.addNode(4, 2, 3), modelStore.addNode(4, 2, 0)];
    const e = [modelStore.addElement(n[0], n[1]), modelStore.addElement(n[1], n[2]), modelStore.addElement(n[2], n[3]), modelStore.addElement(n[3], n[4])];
    modelStore.addSupport(n[0], 'fixed3d' as never); modelStore.addSupport(n[4], 'fixed3d' as never);
    const D = modelStore.addLoadCase('D', 'D'), T = modelStore.addLoadCase('T', 'T' as never);
    modelStore.addNodalLoad3D(n[2], 5, 5, -10, 0, 0, 0, D);
    modelStore.addThermalLoad(e[1], 30, 15, T);
    const C = modelStore.addCombination('1.2D + 1.0T', [{ caseId: D, factor: 1.2 }, { caseId: T, factor: 1.0 }]);
    const r = modelStore.solveCombinations3D(false);
    expect(typeof r, String(r)).toBe('object');
    const { perCase, perCombo } = r as Exclude<typeof r, string | null>;
    const combo = perCombo.get(C)!;
    const heated = perCase.get(T)!.elementForces.find((x) => x.elementId === e[1])!;
    expect(Math.abs(heated.nStart) + Math.abs(heated.mzStart) + Math.abs(heated.myStart)).toBeGreaterThan(0.1);
    for (const f of combo.elementForces) {
      for (const k of ['nStart', 'mzStart', 'myStart'] as const) {
        const want = 1.2 * perCase.get(D)!.elementForces.find((x) => x.elementId === f.elementId)![k]
          + perCase.get(T)!.elementForces.find((x) => x.elementId === f.elementId)![k];
        expect(f[k], `${k}@${f.elementId}`).toBeCloseTo(want, 6);
      }
    }
  });
});

/* ─────────────────────────── every example, heated ─────────────────────────── */

/*
 * The examples a student opens, each with a temperature added to every
 * member — uniform and gradient, different on each, so no two cancel. Both
 * wizards on each, as far as each can go: the stiffness wizard to 360 DOFs,
 * the flexibility wizard where it solves (not a mechanism, GH ≤ 30).
 */
const EXAMPLES_2D = [
  'simply-supported', 'cantilever', 'cantilever-point', 'continuous-beam', 'portal-frame',
  'two-story-frame', 'multi-section-frame', 'color-map-demo', 'truss', 'warren-truss', 'howe-truss',
  'point-loads', 'spring-support', 'thermal', 'settlement', 'three-hinge-arch', 'gerber-beam',
  'frame-cirsoc-dl', 'building-3story-dlw', 'frame-seismic',
];
const EXAMPLES_3D_SOLVED = ['3d-portal-frame', '3d-cantilever-load', '3d-torsion-beam', 'torsion-tube', 'rc-beam-flexure', 'rc-design-qa-8', 'rc-design-qa-row2'];

function heatEverything() {
  let k = 0;
  for (const id of modelStore.elements.keys()) { modelStore.addThermalLoad(id, 15 + 5 * (k % 4), 12 - 3 * (k % 5)); k++; }
}

describe('every example, with every member heated', () => {
  for (const name of EXAMPLES_2D) {
    it(`2D ${name}`, async () => {
      historyStore.clear(); uiStore.analysisMode = '2d'; modelStore.clear();
      await modelStore.loadExample(name);
      heatEverything();
      const input = modelStore.buildSolverInput(false)!;
      compare2D(input);
      const r = solveForceMethod(input);
      if (r.count.gh > 0) expectFmCoherent(name, r as never);
    });
  }
  for (const name of EXAMPLES_3D_SOLVED) {
    it(`3D ${name}`, async () => {
      historyStore.clear(); uiStore.analysisMode = '3d'; modelStore.clear();
      await modelStore.loadExample(name);
      heatEverything();
      const input = modelStore.buildSolverInput3D(false, false, { expandMemberOffsets: false })!;
      compare3D(input);
      expectFmCoherent(name, solveForceMethod3D(input) as never);
    });
  }
});
