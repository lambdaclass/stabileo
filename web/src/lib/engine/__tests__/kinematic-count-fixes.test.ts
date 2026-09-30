/**
 * The degree of static indeterminacy, against textbook counts and the static solve.
 *
 * Four defects in the counting, all on the JS side of the boundary:
 *
 *   2D D1   a node only truss bars reach was given 3 equations in a model with frames
 *           (a king-post beam read g = 0, a queen-post beam g = −1 "hypostatic").
 *   2D D13  a member hinged at a fixed support was read as a free-end hinge (c = 0),
 *           i.e. as clamped: g = 0 instead of −1.
 *   3D D4   a Basic 3D hinge (My + Mz) was counted as 3 releases, a truss bar as 3
 *           forces, a truss-only node with 6 equations.
 *   3D D5   the Kinematic panel analysed the plane projection of a space model.
 *
 * Every case is checked three ways: the hand count written next to it, an
 * independent count on degrees of freedom (2D, the same one the audit uses), and
 * whether the static solve accepts the model. The report's substitution string is
 * evaluated too, so the sum the student reads is the degree it shows.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { modelStore, historyStore, uiStore } from '../../store';
import { generateKinematicReport, generateKinematicReport3D, type KinematicReport } from '../kinematic-report';
import { analyzeKinematics, computeStaticDegree } from '../kinematic-2d';
import { analyzeKinematics3D, computeStaticDegree3D } from '../kinematic-3d';
import { analyzeKinematics3D as engineKinematics3D } from '../wasm-solver';
import type { SolverInput } from '../types';
import { buildRandom, resetModel3D, frame, truss, support, DOF } from './helpers/random-models-3d';

// ── Helpers ─────────────────────────────────────────────────────────

function build2D(fn: () => void) {
  historyStore.clear();
  uiStore.analysisMode = '2d';
  modelStore.clear();
  modelStore.batch(fn);
}
const N = (x: number, y: number) => modelStore.addNode(x, y);
const E = (a: number, b: number, t: 'frame' | 'truss' = 'frame') => modelStore.addElement(a, b, t);
const input2D = () => modelStore.buildSolverInput(false)!;
const solves2D = () => typeof modelStore.solve() === 'object';

const input3D = () => modelStore.buildSolverInput3D(false, false, { expandMemberOffsets: false })!;
const solves3D = () => {
  const r = modelStore.solve3D(false, false, false);
  return !!r && typeof r === 'object';
};

/** The report's substitution, evaluated: "g = 3×2 + 3 − 3×3 − 1 = −1" → [left side value, printed result]. */
function evalSubstitution(rep: KinematicReport): [number, number] {
  const m = /^g = (.*) = (−?-?\d+)$/.exec(rep.substitution);
  expect(m, rep.substitution).not.toBeNull();
  const expr = m![1].replaceAll('×', '*').replaceAll('−', '-');
  expect(expr).toMatch(/^[\d\s+*-]+$/);
  // eslint-disable-next-line no-new-func
  const value = Function(`return (${expr});`)() as number;
  return [value, Number(m![2].replace('−', '-'))];
}

/**
 * g on degrees of freedom (the audit's independent count): a node has two
 * translations, and a rotation if some frame end meets it without a hinge; a
 * hinged frame end has a rotation of its own; a rotational restraint counts
 * only where a rotation exists.
 */
function dofDegree2D(input: SolverInput): number {
  const rigid = new Set<number>();
  let dofs = 0, mF = 0, mT = 0;
  for (const e of input.elements.values()) {
    if (e.type === 'frame') {
      mF++;
      if (e.hingeStart) dofs++; else rigid.add(e.nodeI);
      if (e.hingeEnd) dofs++; else rigid.add(e.nodeJ);
    } else mT++;
  }
  for (const n of input.nodes.keys()) dofs += 2 + (rigid.has(n) ? 1 : 0);
  let r = 0;
  for (const s of input.supports.values()) {
    const rot = rigid.has(s.nodeId) ? 1 : 0;
    if (s.type === 'fixed') r += 2 + rot;
    else if (s.type === 'pinned') r += 2;
    else if (s.type === 'rollerX' || s.type === 'rollerZ' || s.type === 'inclinedRoller') r += 1;
    else if (s.type === 'spring') r += (s.kx ? 1 : 0) + (s.ky ? 1 : 0) + (s.kz && rot ? 1 : 0);
  }
  return 3 * mF + mT + r - dofs;
}

// ── 2D ──────────────────────────────────────────────────────────────

const cases2D: Array<{ name: string; g: number; solves: boolean; fn: () => void }> = [
  {
    // 2 beam members + post + 2 ties on 4 nodes; the post foot meets only truss bars.
    // g = 3·2 + 3 + 3 − 3·3 − 2·1 = 1
    name: 'king-post beam (D1)', g: 1, solves: true,
    fn: () => { const a = N(0, 0), m = N(4, 0), b = N(8, 0), d = N(4, -1); E(a, m); E(m, b); E(m, d, 'truss'); E(a, d, 'truss'); E(d, b, 'truss'); modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX'); },
  },
  {
    // 3 beam members + 2 posts + 3 lower-chord bars on 6 nodes, two truss-only nodes.
    // g = 3·3 + 5 + 3 − 3·4 − 2·2 = 1
    name: 'queen-post beam (D1)', g: 1, solves: true,
    fn: () => { const a = N(0, 0), m1 = N(3, 0), m2 = N(6, 0), b = N(9, 0), d1 = N(3, -1), d2 = N(6, -1); E(a, m1); E(m1, m2); E(m2, b); E(m1, d1, 'truss'); E(m2, d2, 'truss'); E(a, d1, 'truss'); E(d1, d2, 'truss'); E(d2, b, 'truss'); modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX'); modelStore.addDistributedLoad(1, -10); },
  },
  {
    // A cantilever propped by a tie to a fixed support only the tie reaches: the fixed
    // support's rotation holds nothing there. g = 3·1 + 1 + (3 + 2) − 3·2 − 2·1 = 1
    name: 'cantilever tied to a fixed support at a truss-only node (D1)', g: 1, solves: true,
    fn: () => { const a = N(0, 0), b = N(4, 0), c = N(4, 3); E(a, b); E(b, c, 'truss'); modelStore.addSupport(a, 'fixed'); modelStore.addSupport(c, 'fixed'); modelStore.addNodalLoad(b, 0, -10); },
  },
  {
    // Pure truss on a fixed support: the rotation does not count. g = 3 + (2 + 1) − 2·3 = 0
    name: 'triangle truss on a fixed support and a roller', g: 0, solves: true,
    fn: () => { const a = N(0, 0), b = N(4, 0), c = N(2, 2); E(a, b, 'truss'); E(b, c, 'truss'); E(c, a, 'truss'); modelStore.addSupport(a, 'fixed'); modelStore.addSupport(b, 'rollerX'); modelStore.addNodalLoad(c, 0, -10); },
  },
  {
    // A member hinged at its fixed support is pinned there. g = 3 + 3 − 3·2 − 1 = −1
    name: 'cantilever hinged at its fixed support (D13)', g: -1, solves: false,
    fn: () => { const a = N(0, 0), b = N(4, 0); const e = E(a, b); modelStore.addSupport(a, 'fixed'); modelStore.toggleHinge(e, 'start'); modelStore.addNodalLoad(b, 0, -10); },
  },
  {
    // Two members hinged into one fixed support, each on a roller at its far end:
    // two simply supported spans. g = 3·2 + (3 + 1 + 1) − 3·3 − 2 = 0
    name: 'two members hinged into a fixed support', g: 0, solves: true,
    fn: () => { const a = N(0, 0), b = N(4, 0), c = N(-4, 0); const e1 = E(a, b), e2 = E(a, c); modelStore.toggleHinge(e1, 'start'); modelStore.toggleHinge(e2, 'start'); modelStore.addSupport(a, 'fixed'); modelStore.addSupport(b, 'rollerX'); modelStore.addSupport(c, 'rollerX'); modelStore.addPointLoadOnElement(e1, 2, -10); },
  },
  {
    // Unchanged cases: no truss-only node, no hinge at a support.
    name: 'propped cantilever', g: 1, solves: true,
    fn: () => { const a = N(0, 0), b = N(6, 0); E(a, b); modelStore.addSupport(a, 'fixed'); modelStore.addSupport(b, 'rollerX'); },
  },
  {
    name: 'braced fixed portal (diagonal between frame nodes)', g: 4, solves: true,
    fn: () => { const n = [N(0, 0), N(0, 4), N(6, 4), N(6, 0)]; E(n[0], n[1]); E(n[1], n[2]); E(n[2], n[3]); E(n[0], n[2], 'truss'); modelStore.addSupport(n[0], 'fixed'); modelStore.addSupport(n[3], 'fixed'); },
  },
  {
    name: 'three-hinged gable', g: 0, solves: true,
    fn: () => { const n = [N(0, 0), N(0, 4), N(5, 6), N(10, 4), N(10, 0)]; E(n[0], n[1]); const r = E(n[1], n[2]); E(n[2], n[3]); E(n[3], n[4]); modelStore.toggleHinge(r, 'end'); modelStore.addSupport(n[0], 'pinned'); modelStore.addSupport(n[4], 'pinned'); },
  },
];

describe('2D degree of static indeterminacy', () => {
  beforeEach(() => { uiStore.analysisMode = '2d'; });

  it.each(cases2D)('$name: g = $g, and the solve agrees', ({ fn, g, solves }) => {
    build2D(fn);
    const input = input2D();
    expect(dofDegree2D(input)).toBe(g);
    expect(computeStaticDegree(input).degree).toBe(g);

    const rep = generateKinematicReport(input, [])!;
    expect(rep.degree).toBe(g);
    const [lhs, printed] = evalSubstitution(rep);
    expect(lhs).toBe(g);
    expect(printed).toBe(g);

    // The analysis the solve gate reads: the corrected degree, the engine's rank check.
    const kin = analyzeKinematics(input);
    expect(kin.rankAnalysis).toBe('available');
    expect(kin.degree).toBe(g);
    expect(kin.isSolvable).toBe(solves);
    expect(solves2D()).toBe(solves);
    expect(rep.classification === 'hypostatic').toBe(!solves);
    if (solves) expect(kin.classification).toBe(g === 0 ? 'isostatic' : 'hyperstatic');
  });

  it('the king-post report splits the nodes into 3-equation and 2-equation nodes', () => {
    build2D(cases2D[0].fn);
    const rep = generateKinematicReport(input2D(), [])!;
    expect(rep.nFrameNodes).toBe(3);
    expect(rep.nTrussNodes).toBe(1);
    expect(rep.formula).toBe('g = 3·m_p + m_r + r − 3·n_p − 2·n_r');
    expect(rep.substitution).toBe('g = 3×2 + 3 + 3 − 3×3 − 2×1 = 1');
  });

  it('a hinge at a fixed support is listed as a condition, not as a free end', () => {
    build2D(cases2D[4].fn);
    const rep = generateKinematicReport(input2D(), [])!;
    expect(rep.hingeDetails).toHaveLength(1);
    expect(rep.hingeDetails[0].ci).toBe(1);
    expect(rep.totalC).toBe(1);
    expect(rep.substitution).toBe('g = 3×1 + 3 − 3×2 − 1 = -1');
  });

  it('a fixed support where only truss bars arrive counts two reactions', () => {
    build2D(cases2D[2].fn);
    const rep = generateKinematicReport(input2D(), [])!;
    const atTie = rep.supportDetails.find((s) => s.nodeId === 3)!;
    expect(atTie.dofs).toBe(2);
    expect(rep.totalR).toBe(5);
  });
});

// ── 3D ──────────────────────────────────────────────────────────────

const release = (my: boolean, mz: boolean) => ({ my, mz, t: false });

const cases3D: Array<{ name: string; g: number; solves: boolean; fn: () => void }> = [
  {
    // Two-span beam fixed at both ends, My+Mz released at midspan on one side.
    // g = 6·2 + 12 − 6·3 − 2 = 4 (the engine counts 3 releases: 3)
    name: 'two-span fixed beam, My+Mz hinge at midspan (D4)', g: 4, solves: true,
    fn: () => {
      const a = modelStore.addNode(0, 0, 0), m = modelStore.addNode(4, 0, 0), b = modelStore.addNode(8, 0, 0);
      const e1 = frame(a, m, 1); frame(m, b, 1);
      modelStore.updateElement(e1, { releaseJ: release(true, true) });
      support(a, 'fixed3d'); support(b, 'fixed3d');
      modelStore.addNodalLoad3D(m, 0, 0, -10, 0, 0, 0);
    },
  },
  {
    // The same hinge made on both sides of the node: 4 releases, 2 of them the
    // node's own free rotations about y and z (the two torsions hold x). c = 2, g = 4.
    name: 'two-span fixed beam, hinged on both sides of midspan (D4)', g: 4, solves: true,
    fn: () => {
      const a = modelStore.addNode(0, 0, 0), m = modelStore.addNode(4, 0, 0), b = modelStore.addNode(8, 0, 0);
      const e1 = frame(a, m, 1), e2 = frame(m, b, 1);
      modelStore.updateElement(e1, { releaseJ: release(true, true) });
      modelStore.updateElement(e2, { releaseI: release(true, true) });
      support(a, 'fixed3d'); support(b, 'fixed3d');
      modelStore.addNodalLoad3D(m, 0, 0, -10, 0, 0, 0);
    },
  },
  {
    // A fixed column tied at its top to a pinned node only the tie reaches:
    // g = 6·1 + 1 + (6 + 3) − 6·2 − 3·1 = 1
    name: 'fixed column propped by a tie (truss bar, truss-only node)', g: 1, solves: true,
    fn: () => {
      const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3), c = modelStore.addNode(3, 0, 3);
      frame(a, b, 1); truss(b, c, 1);
      support(a, 'fixed3d'); support(c, 'custom3d', DOF('xyz'));
      modelStore.addNodalLoad3D(b, 5, 3, 0, 0, 0, 0);
    },
  },
  {
    // A cantilever hinged (My+Mz) at its fixed base: pinned about two axes.
    // g = 6 + 6 − 12 − (2 − 2 + (3 − 1)) = −2
    name: 'cantilever hinged at its fixed base', g: -2, solves: false,
    fn: () => {
      const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(4, 0, 0);
      const e = frame(a, b, 1);
      modelStore.updateElement(e, { releaseI: release(true, true) });
      support(a, 'fixed3d');
      modelStore.addNodalLoad3D(b, 0, 0, -10, 0, 0, 0);
    },
  },
  {
    // Four fixed columns and four edge beams: 6·8 + 24 − 6·8 = 24.
    name: 'fixed space frame box', g: 24, solves: true,
    fn: () => {
      const base = [[0, 0], [5, 0], [5, 4], [0, 4]].map(([x, y]) => modelStore.addNode(x, y, 0));
      const top = [[0, 0], [5, 0], [5, 4], [0, 4]].map(([x, y]) => modelStore.addNode(x, y, 3));
      for (let i = 0; i < 4; i++) { frame(base[i], top[i], 1); frame(top[i], top[(i + 1) % 4], 1); support(base[i], 'fixed3d'); }
      modelStore.addNodalLoad3D(top[1], 10, 0, -10, 0, 0, 0);
    },
  },
  {
    // Tetrahedron truss on a fixed support + two partial supports: rotations do not count.
    // g = 6 + (3 + 2 + 1) − 3·4 = 0
    name: 'space truss tetrahedron on a fixed support', g: 0, solves: true,
    fn: () => {
      const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(4, 0, 0), c = modelStore.addNode(2, 3, 0), d = modelStore.addNode(2, 1, 3);
      for (const [i, j] of [[a, b], [b, c], [c, a], [a, d], [b, d], [c, d]]) truss(i, j, 1);
      support(a, 'fixed3d'); support(b, 'custom3d', DOF('yz')); support(c, 'custom3d', DOF('z'));
      modelStore.addNodalLoad3D(d, 0, 0, -10, 0, 0, 0);
    },
  },
];

describe('3D degree of static indeterminacy', () => {
  it.each(cases3D)('$name: g = $g, and the solve agrees', ({ fn, g, solves }) => {
    resetModel3D();
    modelStore.bulkMutate(fn);
    const input = input3D();
    expect(computeStaticDegree3D(input).degree).toBe(g);

    const kin = analyzeKinematics3D(input);
    expect(kin.rankAnalysis).toBe('available');
    expect(kin.degree).toBe(g);
    expect(kin.isSolvable).toBe(solves);
    expect(solves3D()).toBe(solves);
    if (solves) expect(kin.classification).toBe(g === 0 ? 'isostatic' : 'hyperstatic');
    else expect(kin.classification).toBe('hypostatic');

    const rep = generateKinematicReport3D(input3D())!;
    expect(rep.dimension).toBe('3d');
    expect(rep.degree).toBe(g);
    const [lhs, printed] = evalSubstitution(rep);
    expect(lhs).toBe(g);
    expect(printed).toBe(g);
    expect(rep.classification === 'hypostatic').toBe(!solves);
  });

  it('D4: the engine still counts a My+Mz hinge as three releases (corrected in JS)', () => {
    resetModel3D();
    modelStore.bulkMutate(cases3D[0].fn);
    // engine/src/solver/kinematic.rs:434-445 — the value analyzeKinematics3D corrects.
    expect(engineKinematics3D(input3D()).degree).toBe(3);
    expect(analyzeKinematics3D(input3D()).degree).toBe(4);
  });

  it('D4: the hinge is shown with its two released components', () => {
    resetModel3D();
    modelStore.bulkMutate(cases3D[0].fn);
    const rep = generateKinematicReport3D(input3D())!;
    expect(rep.hingeDetails).toHaveLength(1);
    expect(rep.hingeDetails[0].ci).toBe(2);
    expect(rep.formula).toBe('g = 6·m + r − 6·n − c');
    expect(rep.substitution).toBe('g = 6×2 + 12 − 6×3 − 2 = 4');
  });

  it('the stabiliser\'s vanishing rotational springs are not counted as supports', () => {
    resetModel3D();
    modelStore.bulkMutate(cases3D[2].fn);
    const input = input3D();
    // The tie's far node carries a stabilised support with vanishing rotational springs.
    const tieEnd = [...input.supports.values()].find((s) => s.nodeId === 3)!;
    expect(tieEnd.stabilised).toBeTruthy();
    expect(computeStaticDegree3D(input).degree).toBe(1);
  });
});

// ── D5: the panel in 3D ─────────────────────────────────────────────

describe('D5: the Kinematic panel in 3D describes the space structure', () => {
  it('the 3D report counts the space model, not its plane projection', () => {
    for (const seed of [1, 2, 3]) {
      buildRandom('space-frame', seed);
      const input = input3D();
      const rep = generateKinematicReport3D(input)!;
      expect(rep.nNodes).toBe(input.nodes.size);
      expect(rep.degree).toBe(analyzeKinematics3D(input).degree);
      expect(rep.equationsPerNode).toEqual([6, 3]);
    }
  });

  it('the panel builds the 3D input and the 3D report in 3D mode', () => {
    const src = readFileSync(fileURLToPath(new URL('../../../components/KinematicPanel.svelte', import.meta.url)), 'utf8');
    const recompute3D = src.slice(src.indexOf('function recompute3D'), src.indexOf('function recompute()'));
    expect(recompute3D).toContain('modelStore.buildSolverInput3D(');
    expect(recompute3D).toContain('generateKinematicReport3D(');
    expect(src).toMatch(/if \(is3D\) \{ recompute3D\(\); return; \}/);
  });
});
