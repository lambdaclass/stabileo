/**
 * The force method's count and choice of redundants, in space.
 *
 * ── Counting in 3D ─────────────────────────────────────────────────
 *
 * The plane count — unknowns per bar against equations per node — does not
 * carry over cleanly: which rotations a node has to balance depends on the
 * directions its members' releases point in, and a release about one local
 * axis of a skew member is not a release about any global axis. So the count
 * is made with the quantities that do carry over:
 *
 *   unknowns   reactions + springs + Σ (independent forces of each bar)
 *              a frame member has 6 — N, Vy, Vz, T, My, Mz; each released
 *              bending moment at an end removes one, a torsion release removes
 *              the torsion once, and never fewer than 1; a truss bar has 1
 *   equations  6 per node, less the rotations no member resists — at such a
 *              node there is no moment to balance about that direction. Those
 *              are read from the stiffness itself: the directions in which the
 *              node's rotation block has no stiffness from any member.
 *
 * GH = unknowns − equations, exactly as in the plane.
 */
import type { SolverInput3D, SolverSupport3D, SolverLoad3D } from '../types-3d';
import type { DSMStepData } from '../solver-detailed';
import type { Candidate, Redundant, RedundantKind, IndeterminacyCount } from './primary';

export const restrained3D = (s: SolverSupport3D): boolean[] => {
  if (s.isInclined) return [true, false, false, s.rrx, s.rry, s.rrz];
  const springs = [s.kx, s.ky, s.kz, s.krx, s.kry, s.krz];
  return [s.rx, s.ry, s.rz, s.rrx, s.rry, s.rrz].map((r, k) => !!r && !(springs[k] && springs[k]! > 0));
};

/**
 * The springs a support really has: the vanishing rotational ones the input
 * builder adds to orphan rotations (`stabilised`) are not part of the
 * structure, and counting them would add unknowns that are not there.
 */
export const realSprings3D = (s: SolverSupport3D): number[] =>
  [s.kx, s.ky, s.kz, s.krx, s.kry, s.krz].map((k, c) => (s.stabilised && c >= 3 ? 0 : k ?? 0));

const prescribed3D = (s: SolverSupport3D, c: number) => [s.dx, s.dy, s.dz, s.drx, s.dry, s.drz][c] ?? 0;

export function countIndeterminacy3D(input: SolverInput3D, data: DSMStepData): IndeterminacyCount {
  let reactions = 0;
  let springs = 0;
  for (const s of input.supports.values()) {
    reactions += restrained3D(s).filter(Boolean).length;
    for (const k of realSprings3D(s)) if (k > 0) springs++;
  }
  const bars: IndeterminacyCount['bars'] = [];
  let barUnknowns = 0;
  for (const e of input.elements.values()) {
    let u = 1;
    if (e.type === 'frame') {
      u = 1 + (e.releaseTStart || e.releaseTEnd ? 0 : 1)
        + (2 - (e.releaseMyStart ? 1 : 0) - (e.releaseMyEnd ? 1 : 0))
        + (2 - (e.releaseMzStart ? 1 : 0) - (e.releaseMzEnd ? 1 : 0));
      u = Math.max(u, 1);
    }
    barUnknowns += u;
    bars.push({ elementId: e.id, type: e.type, unknowns: u });
  }

  /*
   * Rotations no member resists, per node, from the assembled K: its largest
   * diagonal sets the scale, and the vanishing springs the wizard adds (1e-10
   * of it) fall below the 1e-8 threshold, so they count as the nothing they
   * stand for.
   */
  const K = data.K;
  const n = K.length;
  let maxD = 0;
  for (let i = 0; i < n; i++) maxD = Math.max(maxD, Math.abs(K[i][i]));
  const tol = maxD * 1e-8;
  const perNode = data.dofNumbering.dofsPerNode;
  const nodes: IndeterminacyCount['nodes'] = [];
  let equations = 0;
  for (const id of data.dofNumbering.nodeOrder) {
    let orphan = 0;
    if (perNode === 6) {
      const dofs = [3, 4, 5]
        .map((ld) => data.dofNumbering.dofs.find((d) => d.nodeId === id && d.localDof === ld && d.isFree))
        .filter(Boolean).map((d) => d!.globalIndex);
      const m = dofs.map((a) => dofs.map((b) => K[a][b]));
      for (let k = 0; k < m.length; k++) {
        let p = k;
        for (let i = k + 1; i < m.length; i++) if (Math.abs(m[i][k]) > Math.abs(m[p][k])) p = i;
        [m[k], m[p]] = [m[p], m[k]];
        if (Math.abs(m[k][k]) < tol) { orphan++; continue; }
        for (let i = k + 1; i < m.length; i++) {
          const f = m[i][k] / m[k][k];
          for (let j = k; j < m.length; j++) m[i][j] -= f * m[k][j];
        }
      }
    }
    const eq = perNode - orphan;
    equations += eq;
    nodes.push({ nodeId: id, equations: eq });
  }
  return { reactions, springs, barUnknowns, equations, gh: reactions + springs + barUnknowns - equations, bars, nodes };
}

const degree = (input: SolverInput3D, id: number) =>
  [...input.elements.values()].filter((e) => e.nodeI === id || e.nodeJ === id).length;

/**
 * In order of preference: support moments, vertical reactions (interior
 * first), the rest, bars, cuts.
 *
 * `transmits` screens out a reaction no member can carry — the moment of a
 * support under a node reached only by truss bars is zero by construction,
 * so as a redundant it has an all-zero diagram and a zero row in [δ].
 */
export function candidates3D(input: SolverInput3D, transmits: (nodeId: number, c: number) => boolean = () => true): Candidate[] {
  const sups = [...input.supports.values()];
  const byCentrality = [...sups].sort((a, b) => degree(input, b.nodeId) - degree(input, a.nodeId) || a.nodeId - b.nodeId);
  const out: Candidate[] = [];
  const add = (s: SolverSupport3D, c: number) => {
    if (restrained3D(s)[c] && transmits(s.nodeId, c)) out.push({ items: [{ kind: 'reaction', nodeId: s.nodeId, component: c, prescribed: prescribed3D(s, c) }] });
  };
  for (const s of sups) for (const c of [3, 4, 5]) add(s, c);
  for (const s of byCentrality) add(s, s.isInclined ? 0 : 2);
  for (const s of byCentrality) if (!s.isInclined) { add(s, 0); add(s, 1); }
  for (const e of input.elements.values()) {
    if (e.type === 'truss') out.push({ items: [{ kind: 'barForce', nodeId: e.nodeI, elementId: e.id }] });
  }
  for (const e of input.elements.values()) {
    if (e.type !== 'frame') continue;
    for (const end of ['J', 'I'] as const) {
      const nodeId = end === 'J' ? e.nodeJ : e.nodeI;
      if (degree(input, nodeId) < 2) continue;
      const rel = end === 'J'
        ? { t: e.releaseTEnd, my: e.releaseMyEnd, mz: e.releaseMzEnd }
        : { t: e.releaseTStart, my: e.releaseMyStart, mz: e.releaseMzStart };
      const kinds: RedundantKind[] = ['cutN', 'cutVy', 'cutVz'];
      if (!rel.t) kinds.push('cutT');
      if (!rel.my) kinds.push('cutMy');
      if (!rel.mz) kinds.push('cutMz');
      out.push({ items: kinds.map((kind) => ({ kind, nodeId, elementId: e.id, end })) });
    }
  }
  return out;
}

export function buildPrimary3D(
  input: SolverInput3D, redundants: Redundant[], loads: SolverLoad3D[],
  opts: { keepPrescribed: boolean; keepThermal: boolean },
): { input: SolverInput3D; cutNode: Map<number, number> } {
  const nodes = new Map(input.nodes);
  const elements = new Map(input.elements);
  const supports = new Map<number, SolverSupport3D>();
  const cutNode = new Map<number, number>();
  let next = Math.max(0, ...input.nodes.keys()) + 1;
  const keys = ['rx', 'ry', 'rz', 'rrx', 'rry', 'rrz'] as const;
  const presc = ['dx', 'dy', 'dz', 'drx', 'dry', 'drz'] as const;

  for (const [id, s] of input.supports) {
    const sup: SolverSupport3D = { ...s };
    if (!opts.keepPrescribed) for (const p of presc) sup[p] = undefined;
    for (const r of redundants) {
      if (r.kind !== 'reaction' || r.nodeId !== s.nodeId) continue;
      const c = r.component!;
      if (s.isInclined && c === 0) { sup.isInclined = false; sup.rx = false; sup.ry = false; sup.rz = false; }
      else sup[keys[c]] = false;
      /* A released component's settlement is its Δᵢ now, not a load on the primary. */
      sup[presc[c]] = undefined;
    }
    const anything = restrained3D(sup).some(Boolean) || [sup.kx, sup.ky, sup.kz, sup.krx, sup.kry, sup.krz].some((k) => k && k > 0);
    if (anything) supports.set(id, sup);
  }
  for (const r of redundants) if (r.kind === 'barForce') elements.delete(r.elementId!);
  const cuts = new Map<number, 'I' | 'J'>();
  for (const r of redundants) if (r.kind.startsWith('cut')) cuts.set(r.elementId!, r.end!);
  for (const [eid, end] of cuts) {
    const e = elements.get(eid)!;
    const at = end === 'J' ? e.nodeJ : e.nodeI;
    const n = nodes.get(at)!;
    const id = next++;
    nodes.set(id, { ...n, id });
    cutNode.set(eid, id);
    elements.set(eid, end === 'J' ? { ...e, nodeJ: id } : { ...e, nodeI: id });
  }
  const kept = loads.filter((l) => {
    if (!opts.keepThermal && l.type === 'thermal') return false;
    if ('elementId' in l.data && !elements.has((l.data as { elementId: number }).elementId)) return false;
    return true;
  });
  return { input: { ...input, nodes, elements, supports, loads: kept }, cutNode };
}
