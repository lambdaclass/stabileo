/**
 * The force (flexibility) method, step by step, for 2D frames and trusses.
 *
 * ── What it computes, in the order a student writes it ─────────────
 *
 *   1. GH, by counting unknowns against equations
 *   2. GH redundants X₁…Xₙ, and the primary structure they leave
 *   3. state 0: the primary under the real loads → M₀, N₀, reactions
 *   4. state i: the primary under Xᵢ = 1 alone → mᵢ, nᵢ, reactions
 *   5. δᵢⱼ = Σ ∫ mᵢ·mⱼ/EI + nᵢ·nⱼ/EA dx (+ springs, + a removed bar's own L/EA)
 *   6. δᵢ₀ = Σ ∫ mᵢ·M₀/EI + nᵢ·N₀/EA dx (+ temperature, + settlements)
 *   7. compatibility [δ]{X} = {Δ} − {δ₀}, solved for X
 *   8. superposition: M = M₀ + Σ Xᵢ·mᵢ, and the same for N and reactions
 *   9. the answer against the stiffness method's
 *
 * ── Two independent routes to every flexibility coefficient ────────
 *
 * Steps 5 and 6 are done the textbook way, by Mohr's integrals over the
 * diagrams. The primary structure is ALSO solved for its displacements, and
 * δᵢⱼ is by definition the displacement at redundant i under Xⱼ = 1 — so each
 * coefficient is computed twice, by different arithmetic, and the two must
 * agree. `deltaCheck` carries the second route, and the tests hold them
 * together. Step 9 then checks the whole answer against the stiffness method
 * on the original structure.
 *
 * Each state is solved with `solveDetailed`, the wizard's own stiffness solver,
 * which is pinned against the analysis solver by differential tests. Nothing
 * here touches the analysis solver.
 */
import type { SolverInput, SolverLoad } from '../types';
import { solveDetailed, type DSMStepData } from '../solver-detailed';
import {
  countIndeterminacy, candidates, buildPrimary, restrainedComponents,
  type Redundant, type IndeterminacyCount, type Candidate,
} from './primary';
import {
  barLoadsOf, internalAt, breakpoints, integrate, sampleDiagram, NO_LOADS, type BarLoads,
} from './internal';

export type { Redundant, IndeterminacyCount } from './primary';

const ALPHA = 1.2e-5;

export interface BarState {
  elementId: number;
  L: number;
  /**
   * The app's convention: N positive in tension, the J end read from the
   * other side. In 3D, v and m are the local xy plane's (Vy, Mz); the other
   * plane and torsion ride alongside.
   */
  ends: {
    nStart: number; vStart: number; mStart: number; nEnd: number; vEnd: number; mEnd: number;
    myStart?: number; myEnd?: number; tStart?: number;
  };
  /** m is Mz in 3D (M in 2D); my and t only in 3D. */
  samples: Array<{ x: number; m: number; n: number; my?: number; t?: number }>;
}

export interface StateResult {
  bars: BarState[];
  /** Reactions of the primary in this state, per restrained component, node frame. */
  reactions: Array<{ nodeId: number; component: number; value: number }>;
}

export interface TermRow {
  elementId: number | null;
  source: 'bending' | 'axial' | 'torsion' | 'thermal' | 'spring' | 'bar' | 'settlement';
  value: number;
}

export interface Geometry {
  /** True for a space structure: nodes carry y, bars their local axes. */
  is3D?: boolean;
  nodes: Array<{ id: number; x: number; z: number; y?: number }>;
  elements: Array<{
    id: number; nodeI: number; nodeJ: number; type: 'frame' | 'truss'; hingeStart: boolean; hingeEnd: boolean;
    /** 3D: local y and z, for drawing Mz and My off the bar. */
    ey?: [number, number, number]; ez?: [number, number, number];
  }>;
  /** `restrained` has 3 entries in 2D and 6 in 3D. */
  supports: Array<{ nodeId: number; restrained: boolean[]; spring: boolean; angle?: number }>;
}

export interface ForceMethodResult {
  is3D?: boolean;
  count: IndeterminacyCount;
  isostatic: boolean;
  redundants: Redundant[];
  original: Geometry;
  primary: Geometry;
  /** states[0] is state 0; states[i] is Xᵢ = 1. */
  states: StateResult[];
  delta: number[][];
  delta0: number[];
  /** Prescribed displacement at each redundant — 0 unless a released support settles. */
  prescribed: number[];
  deltaTerms: TermRow[][][];
  delta0Terms: TermRow[][];
  /** The same coefficients, as displacements of the primary structure. */
  deltaCheck: number[][];
  delta0Check: number[];
  X: number[];
  final: StateResult;
  verification: { maxForceDiff: number; maxReactionDiff: number; scale: number; ok: boolean };
  /** The stiffness method's answer on the original structure, for Step 9's table. */
  stiffness: StateResult;
}

// ─── Small helpers ──────────────────────────────────────────────

export function solveSystem(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > Math.abs(M[p][k])) p = i;
    [M[k], M[p]] = [M[p], M[k]];
    if (Math.abs(M[k][k]) < 1e-300) throw new Error('singular flexibility matrix');
    for (let i = k + 1; i < n; i++) {
      const f = M[i][k] / M[k][k];
      for (let j = k; j <= n; j++) M[i][j] -= f * M[k][j];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  return x;
}

function geometryOf(input: SolverInput): Geometry {
  return {
    nodes: [...input.nodes.values()].map((n) => ({ id: n.id, x: n.x, z: n.z })),
    elements: [...input.elements.values()].map((e) => ({
      id: e.id, nodeI: e.nodeI, nodeJ: e.nodeJ, type: e.type, hingeStart: !!e.hingeStart, hingeEnd: !!e.hingeEnd,
    })),
    supports: [...input.supports.values()].map((s) => ({
      nodeId: s.nodeId, restrained: restrainedComponents(s), spring: s.type === 'spring',
      angle: s.type === 'inclinedRoller' ? s.angle ?? 0 : undefined,
    })),
  };
}

const lenOf = (input: SolverInput, nodeI: number, nodeJ: number) => {
  const a = input.nodes.get(nodeI)!;
  const b = input.nodes.get(nodeJ)!;
  return Math.hypot(b.x - a.x, b.z - a.z);
};
const dirOf = (input: SolverInput, nodeI: number, nodeJ: number) => {
  const a = input.nodes.get(nodeI)!;
  const b = input.nodes.get(nodeJ)!;
  const L = Math.hypot(b.x - a.x, b.z - a.z);
  return { c: (b.x - a.x) / L, s: (b.z - a.z) / L };
};

/** A solved state of the primary, with what the method needs from it. */
interface Solved {
  data: DSMStepData;
  input: SolverInput;
  /** Global displacement (ux, uz, θ) of a node. */
  disp: (nodeId: number) => [number, number, number];
  /** Local end forces [Ni, Vi, Mi, Nj, Vj, Mj] of a bar (trusses padded). */
  forces: (elementId: number) => number[] | null;
  reactions: Array<{ nodeId: number; component: number; value: number }>;
}

function solveState(input: SolverInput): Solved {
  const data = solveDetailed(input);
  /*
   * The force method needs a structure that stands on its own: a mechanism
   * the loads happen not to excite is still a mechanism, and a primary
   * structure with one is not a primary structure.
   */
  if (data.nullModes.length > 0) throw new ForceMethodError('unstable', data.nullModes);
  const frames = new Map(data.nodeFrames.map((f) => [f.nodeId, f.angle]));
  const dof = new Map<string, number>();
  for (const d of data.dofNumbering.dofs) dof.set(`${d.nodeId}:${d.localDof}`, d.globalIndex);
  const val = (nodeId: number, ld: number) => {
    const g = dof.get(`${nodeId}:${ld}`);
    return g === undefined ? 0 : data.uAll[g];
  };
  const disp = (nodeId: number): [number, number, number] => {
    const a = val(nodeId, 0);
    const b = val(nodeId, 1);
    const ang = frames.get(nodeId);
    if (ang === undefined) return [a, b, val(nodeId, 2)];
    const c = Math.cos(ang), s = Math.sin(ang);
    return [c * a - s * b, s * a + c * b, val(nodeId, 2)];
  };
  const byElem = new Map(data.elementForces.map((f) => [f.elementId, f.fLocalFinal]));
  const forces = (elementId: number) => {
    const f = byElem.get(elementId);
    if (!f) return null;
    return f.length === 6 ? f : [f[0], 0, 0, f[2], 0, 0];
  };
  const reactions = data.dofNumbering.dofs
    .filter((d) => !d.isFree)
    .map((d) => ({ nodeId: d.nodeId, component: d.localDof, value: data.reactionsRaw[d.globalIndex - data.dofNumbering.nFree] }));
  return { data, input, disp, forces, reactions };
}

// ─── Unit loads and the displacement each redundant "sees" ──────

/** The load pattern of Xᵢ = 1, and the direction it measures displacement in. */
function unitPattern(
  original: SolverInput, primary: SolverInput, r: Redundant, cutNode: Map<number, number>,
): Array<{ nodeId: number; fx: number; fz: number; my: number }> {
  if (r.kind === 'reaction') {
    const sup = [...original.supports.values()].find((s) => s.nodeId === r.nodeId)!;
    if (sup.type === 'inclinedRoller' && r.component === 1) {
      /* The analysis solver's normal: (sin α, cos α). */
      const a = sup.angle ?? 0;
      return [{ nodeId: r.nodeId, fx: Math.sin(a), fz: Math.cos(a), my: 0 }];
    }
    return [{
      nodeId: r.nodeId, fx: r.component === 0 ? 1 : 0, fz: r.component === 1 ? 1 : 0, my: r.component === 2 ? 1 : 0,
    }];
  }
  if (r.kind === 'barForce') {
    const e = original.elements.get(r.elementId!)!;
    const { c, s } = dirOf(original, e.nodeI, e.nodeJ);
    /* Tension pulls each end toward the other. */
    return [
      { nodeId: e.nodeI, fx: c, fz: s, my: 0 },
      { nodeId: e.nodeJ, fx: -c, fz: -s, my: 0 },
    ];
  }
  /*
   * A cut: equal and opposite on the two faces. On the member's face the pair
   * is the internal force it stands for, in the app's convention —
   * at end J the member feels (N, −V, −M), at end I (−N, V, M).
   */
  const e = original.elements.get(r.elementId!)!;
  const { c, s } = dirOf(original, e.nodeI, e.nodeJ);
  const sign = r.end === 'J' ? 1 : -1;
  const px = r.kind === 'cutN' ? sign : 0;
  const py = r.kind === 'cutV' ? -sign : 0;
  const pm = r.kind === 'cutM' ? -sign : 0;
  const fx = px * c - py * s;
  const fz = px * s + py * c;
  const member = cutNode.get(e.id)!;
  void primary;
  return [
    { nodeId: member, fx, fz, my: pm },
    { nodeId: r.nodeId, fx: -fx, fz: -fz, my: -pm },
  ];
}

/** Work-conjugate displacement of a load pattern: Σ P·u. */
function generalised(state: Solved, pattern: Array<{ nodeId: number; fx: number; fz: number; my: number }>): number {
  let s = 0;
  for (const p of pattern) {
    const [u, w, th] = state.disp(p.nodeId);
    s += p.fx * u + p.fz * w + p.my * th;
  }
  return s;
}

// ─── Choosing the redundants ────────────────────────────────────

/*
 * ── Released one at a time, as it is done by hand ─────────────────
 *
 * Each candidate, in order of preference, is released only if the structure
 * is still stable without it — so the structure stays solvable at every
 * step, and the choice ends when GH forces are out. That is the procedure a
 * student follows, and it is linear in the number of candidates.
 *
 * Checking only complete sets instead, as the first version did, explored
 * combinations of supports that had already let the structure float: on the
 * three-bay, two-storey example (GH = 18) it ran out of attempts without an
 * answer. An exhaustive search remains as the fallback for the rare case the
 * greedy order paints itself into a corner (a count it cannot land on
 * exactly).
 */
function isStable(input: SolverInput, rs: Redundant[]): boolean {
  try {
    const { input: p } = buildPrimary(input, rs, input.loads, { keepPrescribed: true, keepThermal: true });
    const d = solveDetailed(p);
    return d.nullModes.length === 0 && d.uAll.every(Number.isFinite);
  } catch { return false; }
}

export const numbered = (items: Array<Omit<Redundant, 'index'>>): Redundant[] =>
  items.map((c, i) => ({ ...c, index: i + 1 }));

function clashes(chosen: Array<Omit<Redundant, 'index'>>, items: Array<Omit<Redundant, 'index'>>): boolean {
  return items.some((it) => chosen.some((c) =>
    (it.elementId !== undefined && c.elementId === it.elementId && it.kind !== 'reaction' && c.kind !== 'reaction')
    || (it.kind === 'reaction' && c.kind === 'reaction' && c.nodeId === it.nodeId && c.component === it.component)));
}

/**
 * Released one at a time with a stability check at each, then — if that
 * greedy order cannot land on exactly GH — every combination. Shared by the
 * plane and the space method; only the candidates and the check differ.
 */
export function chooseRedundants(
  cands: Candidate[], gh: number, stable: (rs: Redundant[]) => boolean,
): Redundant[] | null {
  const chosen: Array<Omit<Redundant, 'index'>> = [];
  for (const c of cands) {
    if (chosen.length === gh) break;
    if (chosen.length + c.items.length > gh || clashes(chosen, c.items)) continue;
    if (stable(numbered([...chosen, ...c.items]))) chosen.push(...c.items);
  }
  if (chosen.length === gh) return numbered(chosen);

  let tries = 0;
  const pick: Array<Omit<Redundant, 'index'>> = [];
  const dfs = (start: number): Redundant[] | null => {
    if (pick.length === gh) {
      tries++;
      const rs = numbered(pick);
      return stable(rs) ? rs : null;
    }
    for (let k = start; k < cands.length && tries < 4000; k++) {
      const items = cands[k].items;
      if (pick.length + items.length > gh || clashes(pick, items)) continue;
      pick.push(...items);
      const got = dfs(k + 1);
      if (got) return got;
      pick.splice(pick.length - items.length, items.length);
    }
    return null;
  };
  return dfs(0);
}

/**
 * Which restrained DOFs some member actually loads: a zero diagonal in K
 * means none does, and a redundant there would be a zero row of [δ].
 */
export function restraintCarries(data: DSMStepData): (nodeId: number, c: number) => boolean {
  let maxD = 0;
  for (let i = 0; i < data.K.length; i++) maxD = Math.max(maxD, Math.abs(data.K[i][i]));
  const byKey = new Map(data.dofNumbering.dofs.map((d) => [`${d.nodeId}:${d.localDof}`, d.globalIndex]));
  return (nodeId, c) => {
    const g = byKey.get(`${nodeId}:${c}`);
    return g !== undefined && Math.abs(data.K[g][g]) > maxD * 1e-8;
  };
}

/**
 * Beyond this many redundants the method stops being something to follow:
 * a 30 × 30 [δ] is already a wall of numbers, and choosing the redundants
 * takes seconds. The stiffness wizard still shows such a structure.
 */
export const FM_MAX_GH = 30;

function choose(input: SolverInput, gh: number): Redundant[] | null {
  let carries: (nodeId: number, c: number) => boolean = () => true;
  try { carries = restraintCarries(solveDetailed(input)); } catch { /* the stability checks will say */ }
  return chooseRedundants(candidates(input, carries), gh, (rs) => isStable(input, rs));
}

// ─── The method ─────────────────────────────────────────────────

export class ForceMethodError extends Error {
  /** `dofs`: for an unstable structure, the DOFs its mechanism moves; `gh` when it is too hyperstatic. */
  constructor(
    public key: 'hypostatic' | 'noRedundants' | 'unstable' | 'tooHyperstatic',
    public dofs: string[] = [], public gh = 0,
  ) { super(key); }
}

export function solveForceMethod(input: SolverInput): ForceMethodResult {
  const count = countIndeterminacy(input);
  if (count.gh < 0) throw new ForceMethodError('hypostatic');
  if (count.gh > FM_MAX_GH) throw new ForceMethodError('tooHyperstatic', [], count.gh);

  const original = geometryOf(input);
  if (count.gh === 0) {
    /* Isostatic: there is nothing to release, and equilibrium alone answers. */
    let s0: Solved;
    try { s0 = solveState(input); } catch (e) {
      throw e instanceof ForceMethodError ? e : new ForceMethodError('unstable');
    }
    const st = stateOf(s0, input.loads);
    return {
      count, isostatic: true, redundants: [], original, primary: original,
      states: [st], delta: [], delta0: [], prescribed: [], deltaTerms: [], delta0Terms: [],
      deltaCheck: [], delta0Check: [], X: [], final: st,
      verification: { maxForceDiff: 0, maxReactionDiff: 0, scale: 1, ok: true },
      stiffness: st,
    };
  }

  const redundants = choose(input, count.gh);
  if (!redundants) throw new ForceMethodError('noRedundants');
  const n = redundants.length;

  /* State 0: the real loads, settlements of the supports still there, temperature. */
  const p0 = buildPrimary(input, redundants, input.loads, { keepPrescribed: true, keepThermal: true });
  const s0 = solveState(p0.input);

  /* States 1…n: Xᵢ = 1 alone. */
  const patterns = redundants.map((r) => unitPattern(input, p0.input, r, p0.cutNode));
  const unit = patterns.map((pat) => {
    const loads: SolverLoad[] = pat.map((p) => ({ type: 'nodal', data: { nodeId: p.nodeId, fx: p.fx, fz: p.fz, my: p.my } }));
    return solveState(buildPrimary(input, redundants, loads, { keepPrescribed: false, keepThermal: false }).input);
  });

  /* The bars that exist in the primary, with their stiffnesses and loads. */
  const bars = [...p0.input.elements.values()].map((e) => {
    const mat = input.materials.get(e.materialId)!;
    const sec = input.sections.get(e.sectionId)!;
    const L = lenOf(p0.input, e.nodeI, e.nodeJ);
    return {
      e, L, EI: mat.e * 1000 * sec.iz, EA: mat.e * 1000 * sec.a, sec, mat,
      loads: e.type === 'frame' ? barLoadsOf(p0.input, e.id, L) : NO_LOADS,
    };
  });
  const endAt = (f: number[]) => ({ N: f[0], V: f[1], M: f[2] });

  /** Σ ∫ over the bars of the product of two states' diagrams. */
  const mohr = (a: Solved, la: (id: number) => BarLoads, b: Solved, lb: (id: number) => BarLoads): TermRow[] => {
    const rows: TermRow[] = [];
    for (const bar of bars) {
      const fa = a.forces(bar.e.id);
      const fb = b.forces(bar.e.id);
      if (!fa || !fb) continue;
      if (bar.e.type === 'truss') {
        rows.push({ elementId: bar.e.id, source: 'axial', value: ((-fa[0]) * (-fb[0]) * bar.L) / bar.EA });
        continue;
      }
      const A = la(bar.e.id);
      const B = lb(bar.e.id);
      const pts = breakpoints(bar.L, A, B);
      const ia = (x: number) => internalAt(endAt(fa), A, x);
      const ib = (x: number) => internalAt(endAt(fb), B, x);
      rows.push({ elementId: bar.e.id, source: 'bending', value: integrate(pts, (x) => ia(x).m * ib(x).m) / bar.EI });
      rows.push({ elementId: bar.e.id, source: 'axial', value: integrate(pts, (x) => ia(x).n * ib(x).n) / bar.EA });
    }
    /* Springs store energy too: uᵢᵀ·K·uⱼ at each spring. */
    for (const sup of p0.input.supports.values()) {
      if (sup.type !== 'spring') continue;
      const [ua, wa, ta] = a.disp(sup.nodeId);
      const [ub, wb, tb] = b.disp(sup.nodeId);
      const ang = sup.angle ?? 0;
      const c = Math.cos(ang), s = Math.sin(ang);
      const kx = sup.kx ?? 0, ky = sup.ky ?? 0;
      const kxx = kx * c * c + ky * s * s;
      const kzz = kx * s * s + ky * c * c;
      const kxz = (kx - ky) * c * s;
      const v = ua * (kxx * ub + kxz * wb) + wa * (kxz * ub + kzz * wb) + (sup.kz ?? 0) * ta * tb;
      rows.push({ elementId: null, source: 'spring', value: v });
    }
    return rows;
  };
  const none = () => NO_LOADS;
  const realLoads = (id: number) => bars.find((b) => b.e.id === id)?.loads ?? NO_LOADS;
  const sum = (rows: TermRow[]) => rows.reduce((s, r) => s + r.value, 0);

  const deltaTerms: TermRow[][][] = [];
  const delta: number[][] = [];
  for (let i = 0; i < n; i++) {
    deltaTerms.push([]);
    delta.push([]);
    for (let j = 0; j < n; j++) {
      const rows = mohr(unit[i], none, unit[j], none);
      const ri = redundants[i];
      if (i === j && ri.kind === 'barForce') {
        /* The removed bar stretches under its own unit force: L/EA. */
        const e = input.elements.get(ri.elementId!)!;
        const sec = input.sections.get(e.sectionId)!;
        const mat = input.materials.get(e.materialId)!;
        rows.push({ elementId: e.id, source: 'bar', value: lenOf(input, e.nodeI, e.nodeJ) / (mat.e * 1000 * sec.a) });
      }
      deltaTerms[i].push(rows);
      delta[i].push(sum(rows));
    }
  }

  const thermalOf = (elementId: number) => {
    let dtU = 0, dtG = 0;
    for (const l of input.loads) {
      if (l.type === 'thermal' && l.data.elementId === elementId) { dtU += l.data.dtUniform; dtG += l.data.dtGradient; }
    }
    return { dtU, dtG };
  };

  const delta0Terms: TermRow[][] = [];
  const delta0: number[] = [];
  for (let i = 0; i < n; i++) {
    const rows = mohr(unit[i], none, s0, realLoads);
    /* Temperature: the unit state's forces working through the free thermal strains. */
    for (const bar of bars) {
      const { dtU, dtG } = thermalOf(bar.e.id);
      if (!dtU && !dtG) continue;
      const f = unit[i].forces(bar.e.id)!;
      let v = 0;
      if (dtU) v += (-f[0]) * ALPHA * dtU * bar.L;
      if (dtG && bar.e.type === 'frame') {
        const h = Math.sqrt((12 * bar.sec.iz) / bar.sec.a);
        /* A hotter top face curves the bar so that, in the diagrams' sign, it
           works against a positive m — hence the minus. Pinned by the test
           that reads δᵢ₀ both ways on a heated fixed-fixed beam. */
        const kappa = -(ALPHA * dtG) / h;
        v += integrate([0, bar.L], (x) => internalAt(endAt(f), NO_LOADS, x).m) * kappa;
      }
      rows.push({ elementId: bar.e.id, source: 'thermal', value: v });
    }
    const ri = redundants[i];
    if (ri.kind === 'barForce') {
      const { dtU } = thermalOf(ri.elementId!);
      if (dtU) {
        const e = input.elements.get(ri.elementId!)!;
        rows.push({ elementId: e.id, source: 'thermal', value: ALPHA * dtU * lenOf(input, e.nodeI, e.nodeJ) });
      }
    }
    /* Settlements of the supports that stayed: −Σ Rₖ⁽ⁱ⁾·Δₖ. */
    let settle = 0;
    for (const sup of p0.input.supports.values()) {
      if (sup.type === 'spring') continue;
      const presc = [sup.dx, sup.dz, sup.dry];
      presc.forEach((d, c) => {
        if (!d) return;
        const R = unit[i].reactions.find((r) => r.nodeId === sup.nodeId && r.component === c);
        if (R) settle -= R.value * d;
      });
    }
    if (settle) rows.push({ elementId: null, source: 'settlement', value: settle });
    delta0Terms.push(rows);
    delta0.push(sum(rows));
  }

  /* The second route: displacements of the primary. */
  const deltaCheck = redundants.map((ri, i) => redundants.map((_, j) => {
    let v = generalised(unit[j], patterns[i]);
    if (i === j && ri.kind === 'barForce') v += delta[i][j] - sum(deltaTerms[i][j].filter((r) => r.source !== 'bar'));
    return v;
  }));
  const delta0Check = redundants.map((ri, i) => {
    let v = generalised(s0, patterns[i]);
    if (ri.kind === 'barForce') v += sum(delta0Terms[i].filter((r) => r.source === 'thermal' && r.elementId === ri.elementId));
    return v;
  });

  const prescribed = redundants.map((r) => r.prescribed ?? 0);
  const X = solveSystem(delta, prescribed.map((d, i) => d - delta0[i]));

  // ─── Superposition ─────────────────────────────────────────────
  const finalBars: BarState[] = [];
  for (const bar of bars) {
    const f = [...s0.forces(bar.e.id)!];
    unit.forEach((u, j) => { const fj = u.forces(bar.e.id)!; for (let k = 0; k < 6; k++) f[k] += X[j] * fj[k]; });
    finalBars.push(barState(bar.e.id, bar.L, f, bar.e.type === 'frame' ? bar.loads : NO_LOADS));
  }
  redundants.forEach((r, i) => {
    if (r.kind !== 'barForce') return;
    const e = input.elements.get(r.elementId!)!;
    finalBars.push(barState(e.id, lenOf(input, e.nodeI, e.nodeJ), [-X[i], 0, 0, X[i], 0, 0], NO_LOADS));
  });
  const finalReactions = s0.reactions.map((r) => {
    let v = r.value;
    unit.forEach((u, j) => {
      const m = u.reactions.find((q) => q.nodeId === r.nodeId && q.component === r.component);
      if (m) v += X[j] * m.value;
    });
    return { ...r, value: v };
  });
  redundants.forEach((r, i) => {
    if (r.kind === 'reaction') finalReactions.push({ nodeId: r.nodeId, component: r.component!, value: X[i] });
  });
  const byNode = (a: { nodeId: number; component: number }, b: { nodeId: number; component: number }) =>
    a.nodeId - b.nodeId || a.component - b.component;
  finalReactions.sort(byNode);
  finalBars.sort((a, b) => a.elementId - b.elementId);
  const final: StateResult = { bars: finalBars, reactions: finalReactions };

  // ─── Against the stiffness method ─────────────────────────────
  const dsm = solveState(input);
  const dsmState = stateOf(dsm, input.loads);
  let scale = 1e-9;
  for (const b of dsmState.bars) for (const v of Object.values(b.ends)) scale = Math.max(scale, Math.abs(v ?? 0));
  for (const r of dsmState.reactions) scale = Math.max(scale, Math.abs(r.value));
  let maxForceDiff = 0;
  for (const b of dsmState.bars) {
    const mine = final.bars.find((q) => q.elementId === b.elementId);
    if (!mine) continue;
    const isTruss = input.elements.get(b.elementId)!.type === 'truss';
    for (const k of Object.keys(b.ends) as Array<keyof BarState['ends']>) {
      if (isTruss && k !== 'nStart' && k !== 'nEnd') continue;
      maxForceDiff = Math.max(maxForceDiff, Math.abs((mine.ends[k] ?? 0) - (b.ends[k] ?? 0)));
    }
  }
  let maxReactionDiff = 0;
  for (const r of dsmState.reactions) {
    const mine = final.reactions.find((q) => q.nodeId === r.nodeId && q.component === r.component);
    maxReactionDiff = Math.max(maxReactionDiff, Math.abs((mine?.value ?? 0) - r.value));
  }

  return {
    count, isostatic: false, redundants, original, primary: geometryOf(p0.input),
    states: [stateOf(s0, p0.input.loads), ...unit.map((u) => stateOf(u, []))],
    delta, delta0, prescribed, deltaTerms, delta0Terms, deltaCheck, delta0Check, X, final,
    verification: {
      maxForceDiff, maxReactionDiff, scale,
      ok: Math.max(maxForceDiff, maxReactionDiff) / scale < 1e-6,
    },
    stiffness: dsmState,
  };
}

function barState(elementId: number, L: number, f: number[], loads: BarLoads): BarState {
  return {
    elementId, L,
    ends: { nStart: -f[0], vStart: f[1], mStart: f[2], nEnd: f[3], vEnd: -f[4], mEnd: -f[5] },
    samples: sampleDiagram({ N: f[0], V: f[1], M: f[2] }, loads, L),
  };
}

function stateOf(s: Solved, loads: SolverLoad[]): StateResult {
  const withLoads = { ...s.input, loads };
  return {
    bars: [...s.input.elements.values()].map((e) => {
      const L = lenOf(s.input, e.nodeI, e.nodeJ);
      return barState(e.id, L, s.forces(e.id)!, e.type === 'frame' ? barLoadsOf(withLoads, e.id, L) : NO_LOADS);
    }),
    reactions: s.reactions,
  };
}
