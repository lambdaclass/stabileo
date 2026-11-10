/**
 * Plastic collapse of a plane frame, step by step.
 *
 * ── What it simulates ───────────────────────────────────────────────
 *
 * The loads, in the proportions the model gives them, grow from zero by a
 * common factor λ. The material is elastic–perfectly plastic: a section of a
 * frame member stays elastic until its bending moment reaches the section's
 * plastic moment Mp; there it becomes a plastic hinge — it keeps carrying Mp
 * and turns freely — and the structure carries further load as if a hinge
 * had been put in at that point. A bar whose axial force reaches Np = fy·A
 * yields and keeps that force: a truss bar, and a frame member too — a
 * funicular arch carries no moment, and it is by crushing that it fails. With
 * no interaction assumed, a frame member at Np has nothing left to resist
 * bending either, so it drops out of the structure for what follows; if it
 * still carries a transverse load, it is itself the mechanism. Each hinge takes one degree of indeterminacy away; the
 * structure collapses when it has become a mechanism, and the λ at that
 * moment is the collapse factor λc. An isostatic structure collapses at its
 * first hinge; a simply supported beam, at midspan (or under its load).
 *
 * ── How: the step-by-step (event-to-event) method ─────────────────
 *
 *   1. Solve the current structure — the original with the hinges formed so
 *      far — under the reference loads (λ = 1).
 *   2. Every section not yet a hinge accumulates m(x) per unit of λ. The
 *      increment that brings it to its plastic moment, of the sign it is
 *      moving in, is Δλ = (±Mp − M_acc) / m. The smallest over all sections is
 *      the next event, and the sections that reach it together form together.
 *   3. λ += Δλ; every accumulated quantity grows by Δλ times this solution.
 *   4. A hinge at a member end releases that end; a hinge inside a span
 *      splits the member there and releases one side. Then back to 1, until
 *      the rank check of the stiffness says the structure is a mechanism.
 *
 * Member ends and point loads are sections of their own; inside a stretch under a span load the
 * critical section is where the moment function peaks, found from it, not on a mesh. A stretch
 * takes one span hinge. As the load grows the peak of the moment moves, and the hinge moves with
 * it: each increment puts it where the moment peaks at the increment's end, so the moment there
 * is Mp with zero shear, and the section it leaves keeps the plastic rotation it took.
 *
 * What is not modelled: interaction of M with N or V (a section yields in
 * bending at Mp or axially at Np, each on its own), hinge unloading, and
 * buckling of compressed members.
 *
 * The collapse factor reported is the limit analysis's (engine `plastic_limit_2d`): the largest
 * statically admissible load, which equals the smallest kinematic one. The engine releases it only
 * where the exact plastic certificate's static and kinematic bounds meet at it (#758); anywhere
 * else the result is `withheld`. Where the history ends elsewhere it is shown as approximate
 * (`limit`), never as the collapse load.
 */
import type { SolverInput, SolverLoad, SolverElement, AnalysisResults, ElementForces } from './types';
import type { PlasticHinge, PlasticResult, PlasticStep } from './result-types';
import { solve, plasticLimit2D, type PlasticLimitResult } from './wasm-solver';
// The normalized reading: the diagnosis in the active language and the app's axis names.
import { analyzeKinematics } from './kinematic-2d';
import { computeDiagramValueAt } from './diagrams';
import { axialSpanToNodal2D, axialEquivalentLoads } from './axial-span-2d';
import { memberEndRotations } from './plastic/rotations';
import { buildKinematics } from './plastic/kinematics';
import { nullspace } from './steps/sway-modes';
import { solveLp } from './plastic/lp';
import { bendingStretches, interiorMinimum, type BendingStretch } from './plastic/span-peaks';
import type { HingeTrack } from './plastic/hinge-place';

export interface PlasticCollapseOptions {
  /** Plastic moment of an original frame member, kN·m. */
  mp: (elementId: number) => number;
  /** Axial yield force of an original member, kN. Infinity: never yields. */
  np: (elementId: number) => number;
  /** Interior samples per member. */
  samples?: number;
  /** Stop after this many events if no mechanism has formed. */
  maxEvents?: number;
}

export interface PlasticCollapseHinge extends PlasticHinge {
  /** 'bending' for a plastic hinge, 'axial' for a bar yielded in tension or compression. */
  kind: 'bending' | 'axial';
  /** Distance from the member's start node, m. */
  x: number;
  /** A span hinge that moved with the peak of the moment: where it sat from each step on, the first entry where it formed. `x` and `position` are its last place. */
  track?: HingeTrack;
}

/** What one event of the step-by-step analysis did, for explaining it. */
export interface PlasticStepTrace {
  /** λ before the event and the increment that reaches it. */
  lambdaBefore: number;
  dLambda: number;
  /** Per hinge formed (index into `hinges`): its moment (or axial force) per unit λ in the structure of this step, and what it had before. */
  events: Array<{ hinge: number; perUnit: number; before: number; limit: number }>;
  /** Span hinges this increment moved with the peak of the moment, from and to (m from the member start). */
  moved?: Array<{ hinge: number; from: number; to: number }>;
}

export interface PlasticCollapseResult extends PlasticResult {
  hinges: PlasticCollapseHinge[];
  /**
   * `rotations[h]`: plastic rotation of hinge h accumulated up to this step, rad, positive when
   * the member turns the way a sagging moment bends it (right side minus left side along the
   * member); 0 for an axial yield and for a hinge formed at this step.
   */
  steps: Array<PlasticStep & { hingesFormed: PlasticCollapseHinge[]; trace: PlasticStepTrace; rotations: number[] }>;
  /** Degree of static indeterminacy of the structure as given. */
  degree: number;
  /**
   * Nothing stresses the structure: no loads, or only loads that go straight
   * into the supports. There is then nothing to grow, λc = 0 means nothing, and
   * the caller says so instead of "does not collapse".
   */
  unloaded: boolean;
  /**
   * The analysis stopped at a mechanism it could not tell from a false one (hinges that would
   * unload, past the closings it allows, or a linear program that did not finish): collapseFactor
   * is then where it stopped, not a verified collapse load.
   */
  unresolved?: boolean;
  /**
   * The step-by-step history does not end at the certified collapse load: `collapseFactor` is the
   * limit analysis's (`lambda`), and `historyLambda` is where the history ended. Its hinges are
   * then approximate.
   */
  limit?: { lambda: number; historyLambda: number };
  /**
   * The limit analysis's factor was not certified (the engine's PL-2D-INVARIANCE refusal, #758):
   * the collapse factor is withheld, and `collapseFactor` is only where the history stopped.
   */
  withheld?: boolean;
  /** The limit analysis's collapse mechanism, where its factor is certified. */
  limitHinges?: PlasticLimitResult['hinges'];
}

interface Piece { id: number; t0: number; t1: number }

const EPS_EVENT = 1e-6;
const MAX_MOVES = 60;
const MOVE_TOL = 1e-11;
/** Relative distance within which the history's end confirms the certified collapse load. */
const HISTORY_TOL = 1e-3;

function cloneInput(input: SolverInput): SolverInput {
  const copy = <T>(m: Map<number, T>) => new Map([...m].map(([k, v]) => [k, { ...(v as object) } as T]));
  return {
    ...input,
    nodes: copy(input.nodes),
    materials: copy(input.materials),
    sections: copy(input.sections),
    elements: copy(input.elements),
    supports: copy(input.supports),
    loads: input.loads.map((l) => ({ type: l.type, data: { ...l.data } }) as SolverLoad),
  };
}

const len = (input: SolverInput, e: SolverElement) => {
  const a = input.nodes.get(e.nodeI)!, b = input.nodes.get(e.nodeJ)!;
  return Math.hypot(b.x - a.x, b.z - a.z);
};

/**
 * Split element `id` at distance `s` from its start: a new node, the element
 * shortened to it, a new element from it to the old end. Loads follow the
 * part they act on. Returns the new node and element ids.
 */
function splitAt(input: SolverInput, id: number, s: number, ids: { node: number; elem: number }): { node: number; right: number } {
  const e = input.elements.get(id)!;
  const L = len(input, e);
  const a = input.nodes.get(e.nodeI)!, b = input.nodes.get(e.nodeJ)!;
  const f = s / L;
  const nodeId = ids.node++;
  input.nodes.set(nodeId, { id: nodeId, x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f });
  const rightId = ids.elem++;
  input.elements.set(rightId, { ...e, id: rightId, nodeI: nodeId, nodeJ: e.nodeJ, hingeStart: false, hingeEnd: e.hingeEnd });
  input.elements.set(id, { ...e, nodeJ: nodeId, hingeEnd: false });

  const out: SolverLoad[] = [];
  for (const l of input.loads) {
    if ((l.type === 'distributed' || l.type === 'axialDistributed') && l.data.elementId === id) {
      // Across the member or along it, a span load is cut the same way.
      const d = l.data, type = l.type;
      const la = d.a ?? 0, lb = d.b ?? L;
      const qAt = (x: number) => (lb - la < 1e-12 ? d.qI : d.qI + ((d.qJ - d.qI) * (x - la)) / (lb - la));
      if (la < s - 1e-12) {
        const e1 = Math.min(lb, s);
        out.push({ type, data: { elementId: id, qI: d.qI, qJ: qAt(e1), a: la, b: e1 } });
      }
      if (lb > s + 1e-12) {
        const s1 = Math.max(la, s);
        out.push({ type, data: { elementId: rightId, qI: qAt(s1), qJ: d.qJ, a: s1 - s, b: lb - s } });
      }
    } else if (l.type === 'pointOnElement' && l.data.elementId === id) {
      out.push(l.data.a <= s + 1e-12
        ? { type: 'pointOnElement', data: { ...l.data, a: Math.min(l.data.a, s) } }
        : { type: 'pointOnElement', data: { ...l.data, elementId: rightId, a: l.data.a - s } });
    } else if (l.type === 'thermal' && l.data.elementId === id) {
      out.push(l, { type: 'thermal', data: { ...l.data, elementId: rightId } });
    } else {
      out.push(l);
    }
  }
  input.loads = out;
  return { node: nodeId, right: rightId };
}

function memberLoadsOn(loads: readonly SolverLoad[], id: number, L: number, from: number, to: number, pieceId: number): SolverLoad[] {
  const out: SolverLoad[] = [];
  for (const l of loads) {
    if (!('elementId' in l.data) || (l.data as { elementId: number }).elementId !== id) continue;
    if (l.type === 'distributed' || l.type === 'axialDistributed') {
      const d = l.data, type = l.type;
      const la = d.a ?? 0, lb = d.b ?? L;
      const qAt = (x: number) => (lb - la < 1e-12 ? d.qI : d.qI + ((d.qJ - d.qI) * (x - la)) / (lb - la));
      const s0 = Math.max(la, from), s1 = Math.min(lb, to);
      if (s1 - s0 > 1e-12) out.push({ type, data: { elementId: pieceId, qI: qAt(s0), qJ: qAt(s1), a: s0 - from, b: s1 - from } });
    } else if (l.type === 'pointOnElement') {
      if ((l.data.a > from + 1e-12 || from <= 1e-12) && l.data.a <= to + 1e-12) {
        out.push({ type: 'pointOnElement', data: { ...l.data, elementId: pieceId, a: Math.min(l.data.a, to) - from } });
      }
    } else if (l.type === 'thermal') {
      out.push({ type: 'thermal', data: { ...l.data, elementId: pieceId } });
    }
  }
  return out;
}

/** Whether a member load bends the member: a transverse force or a couple on it. */
function carriesTransverse(l: SolverLoad): boolean {
  if (l.type === 'distributed') return Math.abs(l.data.qI) > 1e-12 || Math.abs(l.data.qJ) > 1e-12;
  if (l.type === 'pointOnElement') return Math.abs(l.data.p) > 1e-12 || Math.abs(l.data.my ?? 0) > 1e-12;
  return false;
}

/** Unit vectors along and across member `id` of `input` as drawn, and its length. */
function axesOf(input: Pick<SolverInput, 'nodes' | 'elements'>, id: number) {
  const e = input.elements.get(id)!;
  const ni = input.nodes.get(e.nodeI)!, nj = input.nodes.get(e.nodeJ)!;
  const L = Math.hypot(nj.x - ni.x, nj.z - ni.z);
  const c = (nj.x - ni.x) / L, s = (nj.z - ni.z) / L;
  return { e, L, c, s };
}

/** A point load at `a` on member `id` (px along it, p across it, a couple my), as nodal loads at its ends by the lever rule. */
function pointToEnds2D(input: Pick<SolverInput, 'nodes' | 'elements'>, id: number, a: number, px: number, p: number, my = 0): SolverLoad[] {
  const { e, L, c, s } = axesOf(input, id);
  const fx = px * c - p * s, fz = px * s + p * c;
  const mx = (-s * my) / L, mz = (c * my) / L;
  if (Math.abs(fx) < 1e-15 && Math.abs(fz) < 1e-15 && Math.abs(my) < 1e-15) return [];
  const t = Math.min(1, Math.max(0, a / L));
  return [
    { type: 'nodal', data: { nodeId: e.nodeI, fx: fx * (1 - t) - mx, fz: fz * (1 - t) - mz, my: 0 } },
    { type: 'nodal', data: { nodeId: e.nodeJ, fx: fx * t + mx, fz: fz * t + mz, my: 0 } },
  ];
}

/** A transverse span load on member `id`, as nodal loads at its ends by the lever rule (simple-span shares). */
function transverseSpanToEnds2D(input: Pick<SolverInput, 'nodes' | 'elements'>, id: number, qI: number, qJ: number, a: number, b: number): SolverLoad[] {
  const { e, L, c, s } = axesOf(input, id);
  const [fI, fJ] = axialEquivalentLoads(qI, qJ, a, b, L);
  return [
    { type: 'nodal', data: { nodeId: e.nodeI, fx: -fI * s, fz: fI * c, my: 0 } },
    { type: 'nodal', data: { nodeId: e.nodeJ, fx: -fJ * s, fz: fJ * c, my: 0 } },
  ];
}

/** The loads, with those on the `removed` members moved to their end nodes by the lever rule. */
export function loadsOffRemoved(input: SolverInput, removed: ReadonlySet<number>): SolverLoad[] {
  return input.loads.flatMap((l): SolverLoad[] => {
    const id = 'elementId' in l.data ? (l.data as { elementId: number }).elementId : undefined;
    if (id === undefined || !removed.has(id)) return [l];
    const { L } = axesOf(input, id);
    if (l.type === 'axialDistributed') return axialSpanToNodal2D(input, { ...l.data, a: l.data.a ?? 0, b: l.data.b ?? L });
    if (l.type === 'pointOnElement') return pointToEnds2D(input, id, l.data.a, l.data.px ?? 0, l.data.p, l.data.my ?? 0);
    if (l.type === 'distributed') return transverseSpanToEnds2D(input, id, l.data.qI, l.data.qJ, l.data.a ?? 0, l.data.b ?? L);
    return [];
  });
}

/**
 * Positions along member `id` (from its start, m) where |N| can peak under its own loads: the
 * ends, either side of each axial point load, the ends of each axial span load, and where the
 * total q_x, linear between those, changes sign.
 */
function axialPeakStations(loads: readonly SolverLoad[], id: number, L: number): number[] {
  const spans = loads.flatMap((l) => (l.type === 'axialDistributed' && l.data.elementId === id
    ? [{ qI: l.data.qI, qJ: l.data.qJ, a: l.data.a ?? 0, b: l.data.b ?? L }] : []));
  const points = loads.flatMap((l) => (l.type === 'pointOnElement' && l.data.elementId === id && Math.abs(l.data.px ?? 0) > 1e-12 ? [l.data.a] : []));
  const eps = 1e-9 * Math.max(1, L);
  const out = new Set<number>([0, L]);
  for (const a of points) { out.add(Math.max(0, a - eps)); out.add(Math.min(L, a + eps)); }
  const breaks = new Set<number>([0, L]);
  for (const d of spans) { breaks.add(Math.max(0, Math.min(L, d.a))); breaks.add(Math.max(0, Math.min(L, d.b))); }
  const xs = [...breaks].sort((x, y) => x - y);
  const qAt = (x: number) => spans.reduce((sum, d) => (x >= d.a && x <= d.b && d.b > d.a ? sum + d.qI + (d.qJ - d.qI) * (x - d.a) / (d.b - d.a) : sum), 0);
  for (let i = 0; i + 1 < xs.length; i++) {
    const x0 = xs[i], x1 = xs[i + 1];
    out.add(x0); out.add(x1);
    if (x1 - x0 < 1e-12) continue;
    // Just inside the interval, so a load that starts or ends at x0/x1 is read on the right side.
    const h = (x1 - x0) * 1e-9, q0 = qAt(x0 + h), q1 = qAt(x1 - h);
    if (q0 * q1 < 0) out.add(x0 + (x1 - x0) * q0 / (q0 - q1));
  }
  return [...out].filter((x) => x >= 0 && x <= L);
}

interface Stretch extends BendingStretch { hinge: number | null }

interface Member {
  id: number; L: number; truss: boolean; mp: number; np: number;
  pieces: Piece[]; t: number[]; bend: boolean[]; acc: number[]; hinged: boolean[];
  accN: number[]; yielded: boolean;
  stretches: Stretch[];
  /** Nodes this member's own splits created: they go with it if it yields. */
  splitNodes: number[];
}

interface HingeRef { mb: Member; t: number; run: number[]; stretch?: Stretch; locked?: boolean }

interface Stage { d: number; efOf: Map<number, ElementForces>; pieces: Map<number, Piece[]> }

function valueAt(kind: 'moment' | 'shear', pieces: readonly Piece[], efOf: Map<number, ElementForces>, t: number): number {
  const p = pieces.find((pc) => t >= pc.t0 - 1e-12 && t <= pc.t1 + 1e-12);
  const ef = p && efOf.get(p.id);
  if (!p || !ef) return 0;
  const tl = p.t1 - p.t0 < 1e-12 ? 0 : Math.min(1, Math.max(0, (t - p.t0) / (p.t1 - p.t0)));
  return computeDiagramValueAt(kind, tl, ef);
}

/** The step-by-step history. */
export function plasticHistory2D(original: SolverInput, opts: PlasticCollapseOptions): PlasticCollapseResult {
  const S = opts.samples ?? 64;
  const maxEvents = opts.maxEvents ?? 200;
  const MAX_CLOSINGS = maxEvents;
  const work = cloneInput(original);

  const kin0 = analyzeKinematics(original);
  if (!kin0.isSolvable) throw new Error(kin0.diagnosis || 'mechanism');
  const template = solve(original);

  const ids = {
    node: Math.max(0, ...original.nodes.keys()) + 1,
    elem: Math.max(0, ...original.elements.keys()) + 1,
  };

  const members: Member[] = [];
  for (const e of original.elements.values()) {
    const L = len(original, e);
    const truss = e.type === 'truss';
    const stretches: Stretch[] = truss ? [] : bendingStretches(original.loads, e.id, L).map((s) => ({ ...s, hinge: null }));
    const bendTs = truss ? [] : [0, 1, ...stretches.flatMap((s) => [s.t0, s.t1])];
    if (!truss) {
      // A couple jumps the moment: its right side is a section of its own.
      for (const l of original.loads) {
        if (l.type === 'pointOnElement' && l.data.elementId === e.id && Math.abs(l.data.my ?? 0) > 1e-12) {
          bendTs.push(Math.min(1, Math.max(0, l.data.a / L + 1e-9)));
        }
      }
    }
    const ts = new Set<number>([0, 1, ...bendTs]);
    for (const x of axialPeakStations(original.loads, e.id, L)) ts.add(x / L);
    const t = [...ts].sort((a, b) => a - b);
    members.push({
      id: e.id, L, truss,
      mp: truss ? Infinity : opts.mp(e.id),
      np: opts.np(e.id),
      pieces: [{ id: e.id, t0: 0, t1: 1 }],
      t, bend: t.map((ti) => bendTs.some((b) => Math.abs(b - ti) < 1e-12)), acc: t.map(() => 0),
      /* An end the model already releases carries no moment: never a plastic hinge. */
      hinged: t.map((ti) => (ti === 0 && e.hingeStart) || (ti === 1 && e.hingeEnd)),
      accN: t.map(() => 0), yielded: false, stretches, splitNodes: [],
    });
  }

  const stages: Stage[] = [];
  const accAt = (kind: 'moment' | 'shear', mb: Member, t: number) =>
    stages.reduce((sum, s) => sum + s.d * valueAt(kind, s.pieces.get(mb.id) ?? [], s.efOf, t), 0);

  /* The cumulative state, on the original model, for the step diagrams. */
  const cumDisp = new Map<number, { ux: number; uz: number; ry: number }>();
  const cumReac = new Map<number, { rx: number; rz: number; my: number }>();
  const cumEnd = new Map<number, { nStart: number; nEnd: number; vStart: number; vEnd: number; mStart: number; mEnd: number }>();
  for (const m of members) cumEnd.set(m.id, { nStart: 0, nEnd: 0, vStart: 0, vEnd: 0, mStart: 0, mEnd: 0 });

  const snapshot = (lambda: number): AnalysisResults => ({
    ...template,
    displacements: template.displacements.map((d) => ({ ...d, ...(cumDisp.get(d.nodeId) ?? { ux: 0, uz: 0, ry: 0 }) })),
    reactions: template.reactions.map((r) => ({ ...r, ...(cumReac.get(r.nodeId) ?? { rx: 0, rz: 0, my: 0 }) })),
    elementForces: template.elementForces.map((ef): ElementForces => ({
      ...ef,
      ...cumEnd.get(ef.elementId)!,
      qI: ef.qI * lambda, qJ: ef.qJ * lambda,
      pointLoads: ef.pointLoads.map((p) => ({ ...p, p: p.p * lambda, px: (p.px ?? 0) * lambda, my: (p.my ?? 0) * lambda })),
      distributedLoads: ef.distributedLoads.map((d) => ({ ...d, qI: d.qI * lambda, qJ: d.qJ * lambda })),
      ...(ef.distributedLoadsX ? { distributedLoadsX: ef.distributedLoadsX.map((d) => ({ ...d, qI: d.qI * lambda, qJ: d.qJ * lambda })) } : {}),
    })),
  });

  const endLoadsOfYielded = (mb: Member, l: SolverLoad, off: number, len: number): SolverLoad[] => {
    if (l.type === 'axialDistributed') {
      return axialSpanToNodal2D(original, { ...l.data, elementId: mb.id, a: off + (l.data.a ?? 0), b: off + (l.data.b ?? len) });
    }
    if (l.type === 'pointOnElement') {
      return pointToEnds2D(original, mb.id, off + l.data.a, l.data.px ?? 0, mb.truss ? l.data.p : 0, mb.truss ? l.data.my ?? 0 : 0);
    }
    if (l.type === 'distributed' && mb.truss) {
      return transverseSpanToEnds2D(original, mb.id, l.data.qI, l.data.qJ, off + (l.data.a ?? 0), off + (l.data.b ?? len));
    }
    return [];
  };

  const release = (mb: Member, t: number) => {
    if (t <= 1e-12) { work.elements.get(mb.pieces[0].id)!.hingeStart = true; return; }
    if (t >= 1 - 1e-12) { work.elements.get(mb.pieces[mb.pieces.length - 1].id)!.hingeEnd = true; return; }
    const pi = mb.pieces.findIndex((p) => t >= p.t0 - 1e-12 && t <= p.t1 + 1e-12);
    const p = mb.pieces[pi];
    if (Math.abs(t - p.t1) < 1e-9) {
      work.elements.get(p.id)!.hingeEnd = true;
    } else if (Math.abs(t - p.t0) < 1e-9) {
      work.elements.get(mb.pieces[pi - 1].id)!.hingeEnd = true;
    } else {
      const { right, node } = splitAt(work, p.id, (t - p.t0) * mb.L, ids);
      mb.splitNodes.push(node);
      work.elements.get(p.id)!.hingeEnd = true;
      mb.pieces.splice(pi, 1, { id: p.id, t0: p.t0, t1: t }, { id: right, t0: t, t1: p.t1 });
    }
  };

  const unrelease = (mb: Member, t: number) => {
    if (t <= 1e-12) work.elements.get(mb.pieces[0].id)!.hingeStart = false;
    else if (t >= 1 - 1e-12) work.elements.get(mb.pieces[mb.pieces.length - 1].id)!.hingeEnd = false;
    else { const left = mb.pieces.find((p) => Math.abs(p.t1 - t) < 1e-9); if (left) work.elements.get(left.id)!.hingeEnd = false; }
  };

  let lambda = 0;
  let isMechanism = false;
  let unloaded = false;
  const hinges: PlasticCollapseHinge[] = [];
  const steps: PlasticCollapseResult['steps'] = [];
  const hingeAt: Array<HingeRef | null> = [];
  /**
   * The structure has become a mechanism; but a hinge that the mechanism turns against its moment
   * would unload, close and stiffen the structure again. Closes those hinges and says whether any was.
   */
  let closings = 0;
  let unresolved = false;
  const dotRow = (row: number[], d: number[]) => row.reduce((acc, w, i) => acc + w * d[i], 0);
  const openMotions = () => {
    const open = hingeAt.map((ref, h) => ({ ref, h })).filter((x) => x.ref && !x.ref.locked && hinges[x.h].unloadedAt === undefined && !x.ref.mb.yielded);
    const yielded = new Map(members.filter((mb) => mb.yielded).map((mb) => [mb.id, mb]));
    const loads = original.loads.flatMap((l) => {
      const mb = 'elementId' in l.data ? yielded.get((l.data as { elementId: number }).elementId) : undefined;
      return mb ? endLoadsOfYielded(mb, l, 0, mb.L) : [l];
    });
    const km = buildKinematics({ ...original, loads }, open.map((x) => ({ member: x.ref!.mb.id, t: x.ref!.t })), new Set(yielded.keys()), 'rigid');
    return { open, km, space: nullspace(km.rows, km.n) };
  };
  /** Every motion the released hinges allow does no work under the loads: they can still grow. */
  const workless = (): boolean => {
    const { km, space } = openMotions();
    if (!space.length) return false;
    const size = Math.hypot(...km.work);
    return space.every((d) => Math.abs(dotRow(km.work, d)) <= 1e-9 * size * Math.hypot(...d));
  };
  const closeUnloading = (): boolean => {
    const { open, km, space } = openMotions();
    if (!open.length) return false;
    if (!space.length) { unresolved = true; return false; }
    const th = space.map((d) => open.map((_, k) => dotRow(km.rotation[k], d)));
    const sag = open.map((x) => -Math.sign(hinges[x.h].moment));
    const loadWork = space.map((d) => dotRow(km.work, d));
    const consistent = solveLp({
      c: space.map(() => 0),
      rows: [
        ...open.map((_, k) => ({ a: space.map((__, j) => sag[k] * th[j][k]), op: '>=' as const, b: 0 })),
        { a: loadWork, op: '=' as const, b: 1 },
      ],
      free: space.map(() => true),
    });
    if (consistent.status === 'optimal') return false;
    if (consistent.status === 'iterationLimit' || consistent.status === 'inaccurate') { unresolved = true; return false; }
    const norm = Math.hypot(...loadWork) || 1;
    const theta = open.map((_, k) => space.reduce((acc, _d, j) => acc + (loadWork[j] / norm) * th[j][k], 0));
    const big = Math.max(...theta.map(Math.abs));
    const closing = open.filter((_, k) => theta[k] * sag[k] < -1e-6 * big);
    if (!closing.length || closings >= MAX_CLOSINGS) { unresolved = true; return false; }
    closings++;
    for (const { ref, h } of closing) {
      const { mb, t, run, stretch } = ref!;
      unrelease(mb, t);
      for (const k of run) mb.hinged[k] = false;
      if (stretch) stretch.hinge = null;
      hinges[h].unloadedAt = lambda;
      hingeAt[h] = null;
    }
    return true;
  };
  const rotations: number[] = [];
  /** The rotation jump at a hinge in the solve of this step, right side minus left side along the member. */
  const jumpAt = (ref: HingeRef, r: AnalysisResults, efOf: Map<number, ElementForces>): number => {
    const { mb, t } = ref;
    if (mb.yielded) return 0;
    const nodeRot = (id: number) => r.displacements.find((d) => d.nodeId === id)?.ry ?? 0;
    const ends = (pieceId: number) => { const ef = efOf.get(pieceId); return ef ? memberEndRotations(work, r, ef) : null; };
    if (t <= 1e-12) {
      const p = mb.pieces[0], e = work.elements.get(p.id)!, rot = ends(p.id);
      return rot ? rot.ti - nodeRot(e.nodeI) : 0;
    }
    if (t >= 1 - 1e-12) {
      const p = mb.pieces[mb.pieces.length - 1], e = work.elements.get(p.id)!, rot = ends(p.id);
      return rot ? nodeRot(e.nodeJ) - rot.tj : 0;
    }
    const left = mb.pieces.find((p) => Math.abs(p.t1 - t) < 1e-9);
    if (!left) return 0;
    const e = work.elements.get(left.id)!, rot = ends(left.id);
    return rot ? nodeRot(e.nodeJ) - rot.tj : 0;
  };

  type Candidate =
    | { kind: 'station'; m: Member; k: number; d: number; axial: boolean }
    | { kind: 'span'; m: Member; stretch: Stretch; t: number; d: number; perUnit: number; before: number };

  const stationValues = (efOf: Map<number, ElementForces>) => members.map((mb) => {
    const u = mb.t.map(() => 0), un = mb.t.map(() => 0);
    if (mb.yielded) return { u, un };
    if (mb.truss) {
      const ef = efOf.get(mb.pieces[0].id);
      if (ef) for (let k = 0; k < mb.t.length; k++) un[k] = computeDiagramValueAt('axial', mb.t[k], ef);
      return { u, un };
    }
    for (let k = 0; k < mb.t.length; k++) {
      const t = mb.t[k];
      const piece = mb.pieces.find((p) => t >= p.t0 - 1e-12 && t <= p.t1 + 1e-12)!;
      const ef = efOf.get(piece.id);
      if (!ef) continue;
      const tl = Math.min(1, Math.max(0, piece.t1 - piece.t0 < 1e-12 ? 0 : (t - piece.t0) / (piece.t1 - piece.t0)));
      u[k] = computeDiagramValueAt('moment', tl, ef);
      un[k] = computeDiagramValueAt('axial', tl, ef);
    }
    return { u, un };
  });

  const addIncrement = (coef: number, r: AnalysisResults, efOf: Map<number, ElementForces>) => {
    hingeAt.forEach((ref, h) => { if (ref) rotations[h] += coef * jumpAt(ref, r, efOf); });
    stationValues(efOf).forEach(({ u, un }, i) => {
      const mb = members[i];
      for (let k = 0; k < mb.t.length; k++) { mb.acc[k] += coef * u[k]; mb.accN[k] += coef * un[k]; }
    });
    stages.push({ d: coef, efOf, pieces: new Map(members.map((mb) => [mb.id, mb.pieces.slice()])) });
    for (const d of r.displacements) {
      if (!original.nodes.has(d.nodeId)) continue;
      const c = cumDisp.get(d.nodeId) ?? { ux: 0, uz: 0, ry: 0 };
      cumDisp.set(d.nodeId, { ux: c.ux + coef * d.ux, uz: c.uz + coef * d.uz, ry: c.ry + coef * d.ry });
    }
    for (const x of r.reactions) {
      const c = cumReac.get(x.nodeId) ?? { rx: 0, rz: 0, my: 0 };
      cumReac.set(x.nodeId, { rx: c.rx + coef * x.rx, rz: c.rz + coef * x.rz, my: c.my + coef * x.my });
    }
    for (const mb of members) {
      const first = efOf.get(mb.pieces[0].id), last = efOf.get(mb.pieces[mb.pieces.length - 1].id);
      const c = cumEnd.get(mb.id)!;
      if (first) { c.nStart += coef * first.nStart; c.vStart += coef * first.vStart; c.mStart += coef * first.mStart; }
      if (last) { c.nEnd += coef * last.nEnd; c.vEnd += coef * last.vEnd; c.mEnd += coef * last.mEnd; }
    }
  };

  const saveState = () => ({
    stages: stages.length,
    acc: members.map((mb) => mb.acc.slice()), accN: members.map((mb) => mb.accN.slice()),
    disp: new Map([...cumDisp].map(([k, v]) => [k, { ...v }])), reac: new Map([...cumReac].map(([k, v]) => [k, { ...v }])),
    end: new Map([...cumEnd].map(([k, v]) => [k, { ...v }])), rotations: rotations.slice(),
  });
  const restoreState = (s: ReturnType<typeof saveState>) => {
    stages.length = s.stages;
    members.forEach((mb, i) => { mb.acc = s.acc[i].slice(); mb.accN = s.accN[i].slice(); });
    cumDisp.clear(); for (const [k, v] of s.disp) cumDisp.set(k, { ...v });
    cumReac.clear(); for (const [k, v] of s.reac) cumReac.set(k, { ...v });
    cumEnd.clear(); for (const [k, v] of s.end) cumEnd.set(k, { ...v });
    rotations.length = 0; rotations.push(...s.rotations);
  };

  const movingHinges = () => hingeAt.flatMap((ref, h) => (ref?.stretch && !ref.locked && !ref.mb.yielded ? [{ ref, h }] : []));

  /**
   * A span hinge put at a section below Mp: the self-stress that takes that section to Mp, as
   * `coef` times (the solve with that section rigid − the solve with it released). It leaves the
   * moment at every other released hinge unchanged.
   */
  const toMp = (r: AnalysisResults, efOf: Map<number, ElementForces>, arrived: ReadonlySet<number>) => {
    const parts: Array<{ coef: number; r: AnalysisResults; efOf: Map<number, ElementForces> }> = [];
    const open = [...movingHinges(), ...[...arrived].flatMap((h) => (hingeAt[h] ? [{ ref: hingeAt[h]!, h }] : []))];
    for (const { ref, h } of open) {
      const { mb, t } = ref;
      const gap = Math.sign(hinges[h].moment) * mb.mp - accAt('moment', mb, t);
      if (Math.abs(gap) <= 1e-13 * mb.mp) continue;
      unrelease(mb, t);
      let rigid: AnalysisResults;
      try { rigid = solve(work); } finally { release(mb, t); }
      const efRigid = new Map(rigid.elementForces.map((ef) => [ef.elementId, ef]));
      const m = valueAt('moment', mb.pieces, efRigid, t);
      if (Math.abs(m) < 1e-12 * mb.mp) continue;
      parts.push({ coef: gap / m, r: rigid, efOf: efRigid }, { coef: -gap / m, r, efOf });
    }
    return parts;
  };

  const peakAfter = (ref: HingeRef, h: number, d: number, efOf: Map<number, ElementForces>) => {
    const { mb, stretch } = ref;
    const sg = Math.sign(hinges[h].moment);
    return interiorMinimum(
      (t) => -sg * (accAt('moment', mb, t) + d * valueAt('moment', mb.pieces, efOf, t)),
      (t) => accAt('shear', mb, t) + d * valueAt('shear', mb.pieces, efOf, t),
      stretch!.t0, stretch!.t1, S);
  };

  const startTrack = (ref: HingeRef, h: number) => {
    const hinge = hinges[h];
    if (!hinge.track) hinge.track = [{ step: hinge.step, position: ref.t, x: ref.t * ref.mb.L }];
  };
  const placeHinge = (ref: HingeRef, h: number, t: number) => {
    ref.t = t;
    Object.assign(hinges[h], { position: t, x: t * ref.mb.L, end: t < 0.5 ? 'start' : 'end' });
  };

  /** Span hinge h reaches the end of its stretch, station k: the member is whole there again and the hinge is that station's. */
  const arrive = (ref: HingeRef, h: number, k: number) => {
    const { mb } = ref;
    startTrack(ref, h);
    const li = mb.pieces.findIndex((p) => Math.abs(p.t1 - ref.t) < 1e-9);
    const left = mb.pieces[li], right = mb.pieces[li + 1];
    const eLeft = work.elements.get(left.id)!, eRight = work.elements.get(right.id)!;
    const node = eLeft.nodeJ;
    work.elements.set(left.id, { ...eLeft, nodeJ: eRight.nodeJ, hingeEnd: eRight.hingeEnd });
    work.elements.delete(right.id);
    work.nodes.delete(node);
    mb.splitNodes = mb.splitNodes.filter((n) => n !== node);
    const onPieces = (l: SolverLoad) => 'elementId' in l.data && [left.id, right.id].includes((l.data as { elementId: number }).elementId);
    work.loads = [...work.loads.filter((l) => !onPieces(l)), ...memberLoadsOn(original.loads, mb.id, mb.L, left.t0 * mb.L, right.t1 * mb.L, left.id)];
    mb.pieces.splice(li, 2, { id: left.id, t0: left.t0, t1: right.t1 });
    ref.stretch!.hinge = null;
    ref.stretch = undefined;
    ref.run = [k];
    mb.hinged[k] = true;
    release(mb, mb.t[k]);
    placeHinge(ref, h, mb.t[k]);
  };

  /** Moves the split of span hinge h to `t`; the loads of the two pieces are cut from the member's own again. */
  const moveHinge = (ref: HingeRef, h: number, t: number) => {
    const { mb } = ref;
    const li = mb.pieces.findIndex((p) => Math.abs(p.t1 - ref.t) < 1e-9);
    const left = mb.pieces[li], right = mb.pieces[li + 1];
    const e = original.elements.get(mb.id)!;
    const a = original.nodes.get(e.nodeI)!, b = original.nodes.get(e.nodeJ)!;
    const node = work.elements.get(left.id)!.nodeJ;
    work.nodes.set(node, { id: node, x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    const onPieces = (l: SolverLoad) => 'elementId' in l.data && [left.id, right.id].includes((l.data as { elementId: number }).elementId);
    work.loads = [
      ...work.loads.filter((l) => !onPieces(l)),
      ...memberLoadsOn(original.loads, mb.id, mb.L, left.t0 * mb.L, t * mb.L, left.id),
      ...memberLoadsOn(original.loads, mb.id, mb.L, t * mb.L, right.t1 * mb.L, right.id),
    ];
    mb.pieces.splice(li, 2, { id: left.id, t0: left.t0, t1: t }, { id: right.id, t0: t, t1: right.t1 });
    startTrack(ref, h);
    ref.stretch!.hinge = t;
    placeHinge(ref, h, t);
  };

  const evaluate = (efOf: Map<number, ElementForces>) => {
    const values = stationValues(efOf);
    const unit = values.map((v) => v.u), unitN = values.map((v) => v.un);
    let dMin = Infinity;
    let stressed = false;
    const cand: Candidate[] = [];
    const axialCandidate = (mb: Member, k: number, n: number) => {
      if (Math.abs(n) < 1e-10 * Math.max(1, mb.np) || !Number.isFinite(mb.np)) return;
      const d = (Math.sign(n) * mb.np - mb.accN[k]) / n;
      if (d > 1e-12) { cand.push({ kind: 'station', m: mb, k, d, axial: true }); dMin = Math.min(dMin, d); }
    };
    members.forEach((mb, i) => {
      if (mb.yielded) return;
      for (let k = 0; k < mb.t.length; k++) axialCandidate(mb, k, unitN[i][k]);
      if (mb.truss) return;
      for (let k = 0; k < mb.t.length; k++) {
        const m = unit[i][k];
        if (!mb.bend[k] || mb.hinged[k] || Math.abs(m) < 1e-10 * Math.max(1, mb.mp)) continue;
        const d = (Math.sign(m) * mb.mp - mb.acc[k]) / m;
        if (d > 1e-12) { cand.push({ kind: 'station', m: mb, k, d, axial: false }); dMin = Math.min(dMin, d); }
      }
      const unitAt = (t: number) => valueAt('moment', mb.pieces, efOf, t);
      const tiny = 1e-10 * Math.max(1, Number.isFinite(mb.mp) ? mb.mp : 1);
      const increment = (t: number) => {
        const m = unitAt(t);
        if (Math.abs(m) < tiny) return Infinity;
        const d = (Math.sign(m) * mb.mp - accAt('moment', mb, t)) / m;
        return d > 1e-12 ? d : Infinity;
      };
      for (const st of mb.stretches) {
        if (!st.loaded) continue;
        if (Math.abs(unitAt((st.t0 + st.t1) / 2)) > 1e-12) stressed = true;
        if (st.hinge !== null || !Number.isFinite(mb.mp)) continue;
        const peak = interiorMinimum(increment, (t, d) => accAt('shear', mb, t) + d * valueAt('shear', mb.pieces, efOf, t), st.t0, st.t1, S);
        if (!peak || !Number.isFinite(peak.value)) continue;
        cand.push({ kind: 'span', m: mb, stretch: st, t: peak.t, d: peak.value, perUnit: unitAt(peak.t), before: accAt('moment', mb, peak.t) });
        dMin = Math.min(dMin, peak.value);
      }
    });
    return { unit, unitN, cand, dMin, stressed };
  };

  let event = 0;
  for (; event < maxEvents; event++) {
    /*
     * A mechanism is what the kinematic check says it is. An exception from that check or from
     * the solve after it said "solvable" is an error, and it is reported as one.
     */
    const kin = analyzeKinematics(work);
    if (!kin.isSolvable) { if (closeUnloading()) continue; isMechanism = true; break; }
    let r: AnalysisResults;
    try { r = solve(work); } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      // The engine has its own mechanism detection (a hinged node free to rotate, a singular
      // stiffness), finer than the kinematic count: its verdict is a mechanism.
      if (/mechanism|singular|instab/i.test(msg)) { if (closeUnloading()) continue; isMechanism = true; break; }
      throw new Error(`Plastic collapse: the solve after ${hinges.length} hinge(s) failed although the `
        + `structure is not a mechanism — ${msg}`);
    }
    let efOf = new Map(r.elementForces.map((ef) => [ef.elementId, ef]));

    const saved = saveState();
    const from = new Map(movingHinges().map(({ ref, h }) => [h, ref.t]));
    const arrived = new Set<number>();
    let ev = evaluate(efOf);
    for (let it = 0; it < MAX_MOVES; it++) {
      for (const p of toMp(r, efOf, arrived)) addIncrement(p.coef, p.r, p.efOf);
      ev = evaluate(efOf);
      if (!Number.isFinite(ev.dMin)) break;
      const dMin = ev.dMin;
      const atMpNow = new Set(ev.cand.flatMap((c) => (c.kind === 'station' && !c.axial && c.d <= dMin * (1 + EPS_EVENT) + 1e-12 ? [`${c.m.id}:${c.k}`] : [])));
      const moves = movingHinges().flatMap(({ ref, h }) => {
        const { mb, stretch } = ref;
        const i = members.indexOf(mb);
        const peak = peakAfter(ref, h, dMin, efOf);
        /* The peak runs into the end of the stretch just as that section reaches Mp of the hinge's sign: the hinge gets there. */
        for (const end of [stretch!.t0, stretch!.t1]) {
          const k = mb.t.findIndex((tk) => Math.abs(tk - end) < 1e-12);
          const sameSign = k >= 0 && Math.sign(mb.acc[k] + dMin * ev.unit[i][k]) === Math.sign(hinges[h].moment);
          if (sameSign && atMpNow.has(`${mb.id}:${k}`) && (!peak || Math.abs(peak.t - end) < Math.abs(ref.t - end))) return [{ ref, h, t: end, k }];
        }
        return peak && Math.abs(peak.t - ref.t) > MOVE_TOL ? [{ ref, h, t: peak.t, k: -1 }] : [];
      });
      if (!moves.length) break;
      restoreState(saved);
      for (const m of moves) {
        if (m.k >= 0) { arrive(m.ref, m.h, m.k); arrived.add(m.h); } else moveHinge(m.ref, m.h, m.t);
      }
      r = solve(work);
      efOf = new Map(r.elementForces.map((ef) => [ef.elementId, ef]));
    }
    const { unit, unitN, cand, dMin, stressed } = ev;
    /*
     * A locked hinge is at Mp with the section kept rigid: released when this increment would
     * take it past Mp, open again when it turns away from it.
     */
    const scale = Math.max(1e-300, ...unit.flat().map(Math.abs));
    let unlocked = false;
    hingeAt.forEach((ref, h) => {
      if (!ref?.locked || ref.mb.yielded) return;
      const m = valueAt('moment', ref.mb.pieces, efOf, ref.t) * Math.sign(hinges[h].moment);
      if (m > 1e-6 * scale) { ref.locked = false; release(ref.mb, ref.t); unlocked = true; }
      else if (m < -1e-6 * scale) {
        for (const k of ref.run) ref.mb.hinged[k] = false;
        if (ref.stretch) ref.stretch.hinge = null;
        hinges[h].unloadedAt = lambda;
        hingeAt[h] = null;
      }
    });
    if (unlocked) { restoreState(saved); continue; }
    if (!Number.isFinite(dMin)) { // nothing left that can yield
      restoreState(saved);
      if (steps.length === 0 && !stressed && ![...unit, ...unitN].some((row) => row.some((v) => Math.abs(v) > 1e-12))) unloaded = true;
      break;
    }

    const lambdaBefore = lambda;
    addIncrement(dMin, r, efOf);
    lambda += dMin;
    const moved = [...from].flatMap(([h, t0]) => {
      const ref = hingeAt[h];
      if (!ref || Math.abs(ref.t - t0) <= MOVE_TOL) return [];
      hinges[h].track!.push({ step: steps.length, position: ref.t, x: ref.t * ref.mb.L });
      return [{ hinge: h, from: t0 * ref.mb.L, to: ref.t * ref.mb.L }];
    });

    const events = cand.filter((c) => c.d <= dMin * (1 + EPS_EVENT) + 1e-12);
    const formed: PlasticCollapseHinge[] = [];
    const traced: PlasticStepTrace['events'] = [];
    const record = (ref: HingeRef | null, perUnit: number, before: number, limit: number) => {
      traced.push({ hinge: hinges.length + formed.length, perUnit, before, limit });
      hingeAt.push(ref);
      rotations.push(0);
    };
    const byMember = new Map<Member, number[]>();
    const spans: Array<Extract<Candidate, { kind: 'span' }>> = [];
    let crushed = false;
    for (const ev of events) {
      if (ev.kind === 'span') { spans.push(ev); continue; }
      if (ev.axial) {
        if (ev.m.yielded) continue;
        ev.m.yielded = true;
        const pieceIds = new Set(ev.m.pieces.map((p) => p.id));
        const onIt = (l: SolverLoad) => 'elementId' in l.data && pieceIds.has((l.data as { elementId: number }).elementId);
        /*
         * A yielded frame member that still carries a transverse load (or a couple) cannot hold
         * it. A load along it is not transverse: an angled or global point load reaches the solve
         * as its `px`, and a purely axial one is no reason to collapse.
         */
        if (!ev.m.truss && work.loads.some((l) => onIt(l) && carriesTransverse(l))) crushed = true;
        /*
         * What stays on the structure goes to the ends of the member as drawn (its pieces' own
         * nodes go with it), as the end loads it would have reached the solve as.
         */
        const alongIt = work.loads.flatMap((l) => {
          if (!onIt(l)) return [];
          const piece = ev.m.pieces.find((pc) => pc.id === (l.data as { elementId: number }).elementId)!;
          return endLoadsOfYielded(ev.m, l, piece.t0 * ev.m.L, (piece.t1 - piece.t0) * ev.m.L);
        });
        for (const id of pieceIds) work.elements.delete(id);
        for (const n of ev.m.splitNodes) work.nodes.delete(n);
        work.loads = [...work.loads.filter((l) => !onIt(l)), ...alongIt];
        // A truss with no load along it carries one N: it yields as a whole, shown at mid-length.
        const pos = ev.m.truss && ev.m.t.length === 2 ? 0.5 : ev.m.t[ev.k];
        const i = members.indexOf(ev.m);
        record(null, unitN[i][ev.k], ev.m.accN[ev.k] - dMin * unitN[i][ev.k], ev.m.np);
        formed.push({
          elementId: ev.m.id, end: pos < 0.5 ? 'start' : 'end', position: pos, x: pos * ev.m.L, kind: 'axial',
          moment: Math.sign(ev.m.accN[ev.k]) * ev.m.np, loadFactor: lambda, step: steps.length,
        });
        continue;
      }
      byMember.set(ev.m, [...(byMember.get(ev.m) ?? []), ev.k]);
    }
    /* A member that yielded axially this step takes no hinge as well. */
    for (const mb of [...byMember.keys()]) if (mb.yielded) byMember.delete(mb);
    /*
     * Two members meeting at a joint with nothing else there carry the same
     * moment at their ends, so both reach Mp together — and one hinge, on one
     * side, already frees the joint. The other end is marked, not hinged.
     */
    const endNode = (mb: Member, k: number): number | null => {
      const e = original.elements.get(mb.id)!;
      return mb.t[k] <= 1e-12 ? e.nodeI : mb.t[k] >= 1 - 1e-12 ? e.nodeJ : null;
    };
    const frameEndsAt = (nodeId: number) => [...work.elements.values()]
      .filter((e) => e.type !== 'truss' && (e.nodeI === nodeId || e.nodeJ === nodeId)).length;
    /* A fixed support or a rotational spring holds the joint: each member end there is its own hinge. */
    const rotationHeld = (nodeId: number) => [...work.supports.values()]
      .some((s) => s.nodeId === nodeId && (s.type === 'fixed' || (s.type === 'spring' && (s.kz ?? 0) > 0)));
    const claimed = new Set<number>([...arrived].flatMap((h) => {
      const ref = hingeAt[h];
      const k = ref?.run[0];
      const node = ref && k !== undefined ? endNode(ref.mb, k) : null;
      return node !== null ? [node] : [];
    }));
    for (const [mb, ks] of byMember) {
      const keep: number[] = [];
      for (const k of ks) {
        const node = endNode(mb, k);
        const hasNodalMoment = node !== null && work.loads.some((l) => l.type === 'nodal' && l.data.nodeId === node && Math.abs(l.data.my) > 1e-12);
        if (node !== null && frameEndsAt(node) === 2 && !hasNodalMoment && !rotationHeld(node)) {
          if (claimed.has(node)) { mb.hinged[k] = true; continue; }
          claimed.add(node);
        }
        keep.push(k);
      }
      byMember.set(mb, keep);
    }
    for (const [mb, ks] of byMember) {
      ks.sort((a, b) => a - b);
      const order = mb.t.map((_, k) => k).filter((k) => mb.bend[k]);
      /* Two sections are one hinge when the moment between them is at Mp too: a constant moment. */
      const atMp = (k0: number, k1: number) => {
        const m = accAt('moment', mb, (mb.t[k0] + mb.t[k1]) / 2);
        return Math.sign(m) === Math.sign(mb.acc[k0]) && Math.abs(m) >= mb.mp * (1 - 1e-6);
      };
      const runs: number[][] = [];
      for (const k of ks) {
        const last = runs[runs.length - 1];
        const prev = last?.[last.length - 1];
        if (last && order.indexOf(k) === order.indexOf(prev!) + 1 && atMp(prev!, k)) last.push(k); else runs.push([k]);
      }
      const n = mb.t.length;
      for (const run of runs) {
        /* The end of the run if it touches a member end; otherwise its middle. */
        const k = run.includes(0) ? 0 : run.includes(n - 1) ? n - 1 : run[Math.floor(run.length / 2)];
        const t = mb.t[k];
        for (const kk of run) mb.hinged[kk] = true;
        release(mb, t);
        const i = members.indexOf(mb);
        record({ mb, t, run }, unit[i][k], mb.acc[k] - dMin * unit[i][k], mb.mp);
        formed.push({
          elementId: mb.id, end: t < 0.5 ? 'start' : 'end', position: t, x: t * mb.L, kind: 'bending',
          moment: Math.sign(mb.acc[k]) * mb.mp, loadFactor: lambda, step: steps.length,
        });
      }
    }
    for (const sp of spans) {
      if (sp.m.yielded || sp.stretch.hinge !== null) continue;
      release(sp.m, sp.t);
      sp.stretch.hinge = sp.t;
      record({ mb: sp.m, t: sp.t, run: [], stretch: sp.stretch }, sp.perUnit, sp.before, sp.m.mp);
      formed.push({
        elementId: sp.m.id, end: sp.t < 0.5 ? 'start' : 'end', position: sp.t, x: sp.t * sp.m.L, kind: 'bending',
        moment: Math.sign(sp.before + dMin * sp.perUnit) * sp.m.mp, loadFactor: lambda, step: steps.length,
      });
    }
    hinges.push(...formed);
    /*
     * Hinges that form together (by symmetry) can leave only a motion that does no work: the
     * load can still grow. The last of them stay at Mp with their sections kept rigid.
     */
    if (formed.length > 1 && !analyzeKinematics(work).isSolvable && workless()) {
      for (let h = hinges.length - 1; h >= hinges.length - formed.length; h--) {
        const ref = hingeAt[h];
        if (!ref || ref.mb.yielded) continue;
        unrelease(ref.mb, ref.t);
        ref.locked = true;
        if (analyzeKinematics(work).isSolvable && !workless()) break;
      }
    }
    steps.push({
      loadFactor: lambda, hingesFormed: formed, results: snapshot(lambda),
      trace: { lambdaBefore, dLambda: dMin, events: traced, ...(moved.length ? { moved } : {}) }, rotations: rotations.slice(),
    });
    if (crushed) { isMechanism = true; break; }
  }

  if (!isMechanism && !analyzeKinematics(work).isSolvable) {
    if (closeUnloading()) unresolved = true;
    else isMechanism = true;
  }
  if (event === maxEvents && !isMechanism) unresolved = true;

  return {
    collapseFactor: lambda,
    steps,
    hinges,
    isMechanism: isMechanism && !unresolved,
    redundancy: Math.max(0, kin0.degree),
    degree: kin0.degree,
    unloaded,
    ...(unresolved ? { unresolved: true } : {}),
  };
}

export function plasticCollapse2D(original: SolverInput, opts: PlasticCollapseOptions): PlasticCollapseResult {
  const { unresolved: historyUnresolved, ...history } = plasticHistory2D(original, opts);
  const lambda = history.collapseFactor;
  const settled = history.isMechanism;
  let collapseFactor = lambda;
  let limit: PlasticCollapseResult['limit'];
  let withheld = false;
  let lp: PlasticLimitResult | null = null;
  let isMechanism = history.isMechanism;
  let unresolved = !!historyUnresolved;
  if (!history.unloaded) {
    const elements = [...original.elements.values()];
    const mpOf = new Map(elements.map((e) => [e.id, e.type === 'truss' ? Infinity : opts.mp(e.id)]));
    const npOf = new Map(elements.map((e) => [e.id, opts.np(e.id)]));
    try { lp = plasticLimit2D(original, mpOf, npOf); } catch { lp = null; }
    if (!lp || lp.confirmation.kind !== 'exact' || !(Number.isFinite(lp.lambda) && lp.lambda > 0)) {
      lp = null;
      withheld = true;
      unresolved = true;
    } else {
      collapseFactor = lp.lambda;
      if (!(settled && Math.abs(lambda - lp.lambda) <= HISTORY_TOL * lp.lambda)) limit = { lambda: lp.lambda, historyLambda: lambda };
      isMechanism = true;
      unresolved = false;
    }
  }
  return {
    ...history,
    collapseFactor,
    isMechanism: isMechanism && !unresolved,
    ...(unresolved ? { unresolved: true } : {}),
    ...(limit ? { limit } : {}),
    ...(withheld ? { withheld: true } : {}),
    ...(lp ? { limitHinges: lp.hinges } : {}),
  };
}
