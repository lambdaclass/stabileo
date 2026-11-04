/**
 * The force method's first two decisions: how indeterminate the structure
 * is, and which forces to release to make it determinate.
 *
 * ── Degree of indeterminacy, by counting ───────────────────────────
 *
 * GH = (unknown forces) − (independent equilibrium equations), the count a
 * student does by hand:
 *
 *   unknowns   every reaction component (a spring is one unknown force too)
 *              + per bar: 3 for a frame member, one fewer for each hinged
 *                end (never fewer than 1), 1 for a truss bar
 *   equations  per node: ΣFx = 0 and ΣFz = 0, plus ΣM = 0 wherever a moment
 *              can exist — a frame end joined rigidly, or a support or
 *              spring that restrains rotation
 *
 * The count says nothing about stability — a structure can have GH ≥ 0 and
 * still be a mechanism — so every primary structure proposed below is also
 * SOLVED, and one that cannot be is discarded.
 *
 * ── The redundants, in the order a textbook picks them ─────────────
 *
 *   1. support reactions: a fixed end's moment first, then the vertical
 *      reactions of interior supports (the continuous-beam choice), then
 *      horizontal ones
 *   2. the force in a truss bar, by removing the bar
 *   3. a cut through a frame member at one end, which releases N, V and M
 *      at once — the only way to open a closed loop. At an end that is
 *      already hinged the cut releases N and V only.
 *
 * The first combination of exactly GH releases that leaves a stable
 * structure wins.
 */
import type { SolverInput, SolverSupport, SolverLoad } from '../types';
import type { DetailedSupport } from '../solver-detailed';
import { axialEquivalentLoads, axialSpanToNodal2D } from '../axial-span-2d';
import { countStaticDegree2D } from '../kinematic-2d';

/*
 * Cut components: 2D uses N, V, M; 3D uses N, Vy, Vz, T, My, Mz. One union,
 * so the steps that list and draw redundants serve both.
 */
export type RedundantKind = 'reaction' | 'spring' | 'barForce' | 'cutN' | 'cutV' | 'cutM'
  | 'cutVy' | 'cutVz' | 'cutT' | 'cutMy' | 'cutMz';

export interface Redundant {
  /** 1-based, the i of Xᵢ. */
  index: number;
  kind: RedundantKind;
  nodeId: number;
  /**
   * Reaction direction in the node's frame. 2D: 0 horizontal / along, 1
   * vertical / normal, 2 moment. 3D: 0–2 forces along x, y, z (0 the normal of
   * an inclined support), 3–5 moments about x, y, z.
   */
  component?: number;
  elementId?: number;
  end?: 'I' | 'J';
  /** Prescribed displacement at a released support, the right-hand side Δᵢ. */
  prescribed?: number;
  /** A `cutM` released alone: a hinge put at that end, the member still attached there. */
  hinge?: boolean;
}

/** A group of releases that go together — one reaction, one bar, or one cut. */
export interface Candidate { items: Omit<Redundant, 'index'>[] }

const nodeDegree = (input: SolverInput, nodeId: number) => {
  let d = 0;
  for (const e of input.elements.values()) if (e.nodeI === nodeId || e.nodeJ === nodeId) d++;
  return d;
};

/** Which of a support's three components it restrains, in its own frame. */
export function restrainedComponents(sup: SolverSupport): [boolean, boolean, boolean] {
  const explicit = (sup as DetailedSupport).restrainedDofs;
  if (explicit) return [...explicit] as [boolean, boolean, boolean];
  switch (sup.type) {
    case 'fixed': return [true, true, true];
    case 'pinned': return [true, true, false];
    case 'rollerX': return [false, true, false];
    case 'rollerZ': return [true, false, false];
    case 'inclinedRoller': return [false, true, false];
    default: return [false, false, false];
  }
}

const prescribedOf = (sup: SolverSupport, c: number) =>
  (c === 0 ? sup.dx : c === 1 ? sup.dz : sup.dry) ?? 0;

export interface IndeterminacyCount {
  reactions: number;
  springs: number;
  barUnknowns: number;
  equations: number;
  gh: number;
  /** Per-bar unknowns, for the step that explains the count. */
  bars: Array<{ elementId: number; type: 'frame' | 'truss'; unknowns: number }>;
  nodes: Array<{ nodeId: number; equations: number }>;
}

export function countIndeterminacy(input: SolverInput): IndeterminacyCount {
  let reactions = 0;
  let springs = 0;
  const rotRestrained = new Set<number>();
  for (const sup of input.supports.values()) {
    if (sup.type === 'spring') {
      for (const k of [sup.kx, sup.ky, sup.kz]) if (k && k > 0) springs++;
      if (sup.kz && sup.kz > 0) rotRestrained.add(sup.nodeId);
      continue;
    }
    const r = restrainedComponents(sup);
    reactions += r.filter(Boolean).length;
    if (r[2]) rotRestrained.add(sup.nodeId);
  }
  const rigidFrameEnd = new Set<number>();
  const bars: IndeterminacyCount['bars'] = [];
  let barUnknowns = 0;
  for (const e of input.elements.values()) {
    let u = 1;
    if (e.type === 'frame') {
      u = Math.max(1, 3 - (e.hingeStart ? 1 : 0) - (e.hingeEnd ? 1 : 0));
      if (!e.hingeStart) rigidFrameEnd.add(e.nodeI);
      if (!e.hingeEnd) rigidFrameEnd.add(e.nodeJ);
    }
    barUnknowns += u;
    bars.push({ elementId: e.id, type: e.type, unknowns: u });
  }
  const nodes: IndeterminacyCount['nodes'] = [];
  let equations = 0;
  for (const id of [...input.nodes.keys()].sort((a, b) => a - b)) {
    const eq = 2 + (rigidFrameEnd.has(id) || rotRestrained.has(id) ? 1 : 0);
    equations += eq;
    nodes.push({ nodeId: id, equations: eq });
  }
  return {
    reactions, springs, barUnknowns, equations,
    gh: countStaticDegree2D(input).degree, bars, nodes,
  };
}

/**
 * Every release that could be made, in the order they are preferred.
 * `transmits` drops reactions no member can carry (see `candidates3D`).
 */
export function candidates(input: SolverInput, transmits: (nodeId: number, c: number) => boolean = () => true): Candidate[] {
  const supports = [...input.supports.values()].filter((s) => s.type !== 'spring');
  const out: Candidate[] = [];
  /* 1a. Moments at fixed ends. */
  for (const s of supports) {
    if (restrainedComponents(s)[2] && transmits(s.nodeId, 2)) {
      out.push({ items: [{ kind: 'reaction', nodeId: s.nodeId, component: 2, prescribed: prescribedOf(s, 2) }] });
    }
  }
  /* 1b. Vertical (or normal) reactions, interior supports first. */
  const byCentrality = [...supports].sort((a, b) =>
    nodeDegree(input, b.nodeId) - nodeDegree(input, a.nodeId) || a.nodeId - b.nodeId);
  for (const s of byCentrality) {
    if (restrainedComponents(s)[1] && transmits(s.nodeId, 1)) {
      out.push({ items: [{ kind: 'reaction', nodeId: s.nodeId, component: 1, prescribed: prescribedOf(s, 1) }] });
    }
  }
  /* 1c. Horizontal reactions. */
  for (const s of byCentrality) {
    if (restrainedComponents(s)[0] && transmits(s.nodeId, 0)) {
      out.push({ items: [{ kind: 'reaction', nodeId: s.nodeId, component: 0, prescribed: prescribedOf(s, 0) }] });
    }
  }
  /* 2. Truss bars. */
  for (const e of input.elements.values()) {
    if (e.type === 'truss') out.push({ items: [{ kind: 'barForce', nodeId: e.nodeI, elementId: e.id }] });
  }
  /* 3. Cuts through frame members, at an end shared with the rest of the structure. */
  for (const e of input.elements.values()) {
    if (e.type !== 'frame') continue;
    for (const end of ['J', 'I'] as const) {
      const nodeId = end === 'J' ? e.nodeJ : e.nodeI;
      const hinged = end === 'J' ? e.hingeEnd : e.hingeStart;
      const otherHinged = end === 'J' ? e.hingeStart : e.hingeEnd;
      if (otherHinged || nodeDegree(input, nodeId) < 2) continue;
      const kinds: RedundantKind[] = hinged ? ['cutN', 'cutV'] : ['cutN', 'cutV', 'cutM'];
      out.push({ items: kinds.map((kind) => ({ kind, nodeId, elementId: e.id, end })) });
    }
  }
  return out;
}

/**
 * The primary (released) structure for a set of redundants, with the loads
 * given — the original ones for state 0, or a unit case.
 *
 * Returns the input and, for cuts, the id of the new node the member's end
 * now hangs from.
 */
export function buildPrimary(
  input: SolverInput, redundants: Redundant[], loads: SolverLoad[],
  opts: { keepPrescribed: boolean; keepThermal: boolean },
): { input: SolverInput; cutNode: Map<string, number> } {
  const nodes = new Map(input.nodes);
  const elements = new Map(input.elements);
  const supports = new Map<number, SolverSupport>();
  let nextNode = Math.max(0, ...input.nodes.keys()) + 1;
  const cutNode = new Map<string, number>();

  for (const [id, s] of input.supports) {
    const base: SolverSupport = opts.keepPrescribed ? { ...s } : { ...s, dx: undefined, dz: undefined, dry: undefined };
    if (s.type === 'spring') {
      const freed = redundants.filter((r) => r.kind === 'spring' && r.nodeId === s.nodeId).map((r) => r.component);
      if (freed.length === 0) { supports.set(id, base); continue; }
      const sp: SolverSupport = { ...base, kx: freed.includes(0) ? 0 : s.kx, ky: freed.includes(1) ? 0 : s.ky, kz: freed.includes(2) ? 0 : s.kz };
      if ((sp.kx ?? 0) > 0 || (sp.ky ?? 0) > 0 || (sp.kz ?? 0) > 0) supports.set(id, sp);
      continue;
    }
    const released = redundants.filter((r) => r.kind === 'reaction' && r.nodeId === s.nodeId);
    if (released.length === 0) { supports.set(id, base); continue; }
    const r = restrainedComponents(s);
    for (const rel of released) r[rel.component!] = false;
    if (!r.some(Boolean)) continue;
    /* A released component carries no prescribed displacement: it is Δᵢ now. */
    const sup: DetailedSupport = { ...base, restrainedDofs: r };
    for (const rel of released) {
      if (rel.component === 0) sup.dx = undefined;
      if (rel.component === 1) sup.dz = undefined;
      if (rel.component === 2) sup.dry = undefined;
    }
    supports.set(id, sup);
  }

  for (const r of redundants) {
    if (r.kind === 'barForce') elements.delete(r.elementId!);
  }
  for (const r of redundants) {
    if (!r.hinge) continue;
    const e = elements.get(r.elementId!)!;
    elements.set(e.id, r.end === 'J' ? { ...e, hingeEnd: true } : { ...e, hingeStart: true });
  }
  const cutEnds = new Set<string>();
  for (const r of redundants) {
    if (r.kind.startsWith('cut') && !r.hinge) cutEnds.add(`${r.elementId}:${r.end}`);
  }
  for (const k of [...cutEnds].sort()) {
    const [eid, end] = k.split(':');
    const e = elements.get(+eid)!;
    const at = end === 'J' ? e.nodeJ : e.nodeI;
    const n = nodes.get(at)!;
    const id = nextNode++;
    nodes.set(id, { id, x: n.x, z: n.z });
    cutNode.set(k, id);
    elements.set(e.id, end === 'J' ? { ...e, nodeJ: id } : { ...e, nodeI: id });
  }

  /*
   * A removed bar's temperature is handled apart. Its loads stay on the structure, at its two
   * nodes: a truss bar takes nothing across it (the lever rule is exact), and along it the
   * consistent end loads leave the redundant X as the bar's mean force (`removedBarEnds`).
   */
  const kept = loads.flatMap((l): SolverLoad[] => {
    if (!opts.keepThermal && l.type === 'thermal') return [];
    if ('elementId' in l.data && !elements.has((l.data as { elementId: number }).elementId)) {
      return l.type === 'thermal' ? [] : removedBarLoadToNodes(input, l);
    }
    return [l];
  });

  return {
    input: { ...input, nodes, elements, supports, loads: kept },
    cutNode,
  };
}

/** A member load on a truss bar, as loads at its two nodes (global axes). */
function removedBarLoadToNodes(input: SolverInput, l: SolverLoad): SolverLoad[] {
  if (l.type === 'axialDistributed') return axialSpanToNodal2D(input, l.data);
  if (l.type !== 'distributed' && l.type !== 'pointOnElement') return [];
  const e = input.elements.get(l.data.elementId);
  const ni = e && input.nodes.get(e.nodeI), nj = e && input.nodes.get(e.nodeJ);
  if (!e || !ni || !nj) return [];
  const L = Math.hypot(nj.x - ni.x, nj.z - ni.z);
  if (!(L > 1e-12)) return [];
  const c = (nj.x - ni.x) / L, s = (nj.z - ni.z) / L;
  /* Across (local y = (−s, c)) by the lever rule, along by the axial shape functions. */
  let yI = 0, yJ = 0, xI = 0, xJ = 0;
  if (l.type === 'pointOnElement') {
    const t = l.data.a / L;
    yI = l.data.p * (1 - t); yJ = l.data.p * t;
    xI = (l.data.px ?? 0) * (1 - t); xJ = (l.data.px ?? 0) * t;
  } else {
    const a = l.data.a ?? 0, b = l.data.b ?? L, span = b - a;
    if (!(span > 0)) return [];
    const W = (l.data.qI + l.data.qJ) * span / 2;
    const yjByMoment = (l.data.qI * span * (a + span / 2) + (l.data.qJ - l.data.qI) * span / 2 * (a + 2 * span / 3)) / L;
    yI = W - yjByMoment; yJ = yjByMoment;
  }
  return [
    { type: 'nodal', data: { nodeId: e.nodeI, fx: xI * c - yI * s, fz: xI * s + yI * c, my: 0 } },
    { type: 'nodal', data: { nodeId: e.nodeJ, fx: xJ * c - yJ * s, fz: xJ * s + yJ * c, my: 0 } },
  ];
}

/**
 * The end forces of a removed bar whose redundant is X, with the loads along it: its consistent
 * end loads (fI, fJ) went to its nodes, so N = X + fI at I and X − fJ at J.
 */
export function removedBarEnds(input: SolverInput, elementId: number, X: number): number[] {
  const e = input.elements.get(elementId);
  const ni = e && input.nodes.get(e.nodeI), nj = e && input.nodes.get(e.nodeJ);
  if (!e || !ni || !nj) return [-X, 0, 0, X, 0, 0];
  const L = Math.hypot(nj.x - ni.x, nj.z - ni.z);
  let fI = 0, fJ = 0;
  for (const l of input.loads) {
    if (l.type === 'axialDistributed' && l.data.elementId === elementId) {
      const [i, j] = axialEquivalentLoads(l.data.qI, l.data.qJ, l.data.a ?? 0, l.data.b ?? L, L);
      fI += i; fJ += j;
    } else if (l.type === 'pointOnElement' && l.data.elementId === elementId && l.data.px) {
      fI += l.data.px * (1 - l.data.a / L); fJ += l.data.px * (l.data.a / L);
    }
  }
  return [-(X + fI), 0, 0, X - fJ, 0, 0];
}
