/**
 * The degree of static indeterminacy GH of a plane structure, as it is taught:
 * the classic formula, the numbers put in, the classification, and the split
 * into external and internal indeterminacy. Every place that shows GH (the
 * force-method and stiffness wizards, the kinematic panel, the explained
 * methods) reads it from here, so they cannot disagree.
 *
 * The count itself is `countStaticDegree2D`: frames GH = 3m + r − 3n − c,
 * trusses GH = m + r − 2n, and in a mixed structure a node only bielas reach
 * takes two equations.
 */
import type { SolverInput } from './types';
import { countStaticDegree2D, type StaticDegreeCount2D } from './kinematic-2d';
import { solveDetailed } from './solver-detailed';
import { solveAllowingNullModes } from './dense-solve';

export type GhKind = 'frame' | 'truss' | 'mixed';

export interface GhHinge {
  nodeId: number;
  /** Frame members meeting at the node. */
  k: number;
  /** Of them, hinged there. */
  j: number;
  /** Conditions the hinge releases: k − 1 when every end is hinged, j otherwise, j at a support that holds rotation. */
  c: number;
  restrained: boolean;
}

export interface GhSplit {
  /** Reactions beyond what equilibrium of the whole gives: r − 3·bodies − internal mechanisms. */
  external: number;
  /** Closed loops and redundant bars: what the free structure has beyond a rigid body. */
  internal: number;
  /** Internal mechanisms of the structure without its supports (a Gerber hinge, an arch's crown). */
  mechanisms: number;
  bodies: number;
}

export interface GhReport {
  count: StaticDegreeCount2D;
  gh: number;
  kind: GhKind;
  classification: 'hypostatic' | 'isostatic' | 'hyperstatic';
  formula: { tex: string; text: string };
  subst: { tex: string; text: string };
  /** Spring components counted in r. */
  springs: number;
  hinges: GhHinge[];
  split: GhSplit | null;
}

function hingesOf(input: SolverInput, count: StaticDegreeCount2D): GhHinge[] {
  const k = new Map<number, number>(), j = new Map<number, number>();
  for (const e of input.elements.values()) {
    if (e.type !== 'frame') continue;
    k.set(e.nodeI, (k.get(e.nodeI) ?? 0) + 1);
    k.set(e.nodeJ, (k.get(e.nodeJ) ?? 0) + 1);
    if (e.hingeStart) j.set(e.nodeI, (j.get(e.nodeI) ?? 0) + 1);
    if (e.hingeEnd) j.set(e.nodeJ, (j.get(e.nodeJ) ?? 0) + 1);
  }
  const held = new Set<number>();
  for (const s of input.supports.values()) {
    if (count.rotationNotCounted.has(s.nodeId)) continue;
    if (s.type === 'fixed' || (s.type === 'spring' && (s.kz ?? 0) > 0)) held.add(s.nodeId);
  }
  return [...j.entries()].sort((a, b) => a[0] - b[0]).map(([nodeId, jj]) => ({
    nodeId, k: k.get(nodeId) ?? 0, j: jj, c: count.nodeConditions.get(nodeId) ?? 0, restrained: held.has(nodeId),
  }));
}

function springsOf(input: SolverInput, count: StaticDegreeCount2D): number {
  let n = 0;
  for (const s of input.supports.values()) {
    if (s.type !== 'spring') continue;
    if ((s.kx ?? 0) > 0) n++;
    if ((s.ky ?? 0) > 0) n++;
    if ((s.kz ?? 0) > 0 && !count.rotationNotCounted.has(s.nodeId)) n++;
  }
  return n;
}

function bodiesOf(input: SolverInput): number {
  const parent = new Map<number, number>();
  const find = (a: number): number => {
    let r = a;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(a, r);
    return r;
  };
  for (const e of input.elements.values()) {
    for (const n of [e.nodeI, e.nodeJ]) if (!parent.has(n)) parent.set(n, n);
    parent.set(find(e.nodeI), find(e.nodeJ));
  }
  return new Set([...parent.keys()].map(find)).size;
}

/**
 * How many independent ways the structure without supports can move: the
 * nullity of its stiffness matrix. Three per body are rigid motions; the rest
 * are internal mechanisms. Null when it cannot be measured.
 */
function freeMobility(input: SolverInput): number | null {
  try {
    const free: SolverInput = { ...input, supports: new Map(), loads: [] };
    const d = solveDetailed(free);
    const n = d.dofNumbering.nFree;
    if (n === 0) return 0;
    const A = new Float64Array(n * n);
    for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) A[i * n + k] = d.K[i][k];
    return solveAllowingNullModes(A, new Float64Array(n), n, 'free').modes.length;
  } catch {
    return null;
  }
}

const minus = (v: number) => (v < 0 ? `(${v})` : String(v));

export function ghReport(input: SolverInput, slidingConditions = 0, opts: { split?: boolean } = {}): GhReport {
  const count = countStaticDegree2D(input, slidingConditions);
  const gh = count.degree;
  const kind: GhKind = count.isPureTruss ? 'truss' : count.mTruss > 0 ? 'mixed' : 'frame';
  const { mFrame: m, mTruss: mb, r, c, nFrameNodes: n, nTrussNodes: nb } = count;
  let formula: GhReport['formula'];
  let subst: GhReport['subst'];
  if (kind === 'truss') {
    formula = { tex: 'GH = m + r - 2n', text: 'GH = m + r − 2·n' };
    subst = { tex: `GH = ${mb} + ${r} - 2 \\cdot ${nb}`, text: `GH = ${mb} + ${r} − 2×${nb}` };
  } else {
    const withB = mb > 0;
    const withNb = nb > 0;
    formula = {
      tex: `GH = 3m${withB ? ' + m_b' : ''} + r - 3n${withNb ? ' - 2n_b' : ''} - c`,
      text: `GH = 3·m${withB ? ' + m_b' : ''} + r − 3·n${withNb ? ' − 2·n_b' : ''} − c`,
    };
    subst = {
      tex: `GH = 3 \\cdot ${m}${withB ? ` + ${mb}` : ''} + ${r} - 3 \\cdot ${n}${withNb ? ` - 2 \\cdot ${nb}` : ''} - ${minus(c)}`,
      text: `GH = 3×${m}${withB ? ` + ${mb}` : ''} + ${r} − 3×${n}${withNb ? ` − 2×${nb}` : ''} − ${minus(c)}`,
    };
  }
  let split: GhSplit | null = null;
  if (opts.split && slidingConditions === 0) {
    const mob = freeMobility(input);
    const bodies = bodiesOf(input);
    if (mob !== null && mob >= 3 * bodies) {
      const mechanisms = mob - 3 * bodies;
      const external = r - 3 * bodies - mechanisms;
      split = { external, internal: gh - external, mechanisms, bodies };
    }
  }
  return {
    count, gh, kind,
    classification: gh > 0 ? 'hyperstatic' : gh === 0 ? 'isostatic' : 'hypostatic',
    formula, subst, springs: springsOf(input, count), hinges: hingesOf(input, count), split,
  };
}
