/**
 * Members of variable section, solved as chains of prismatic pieces and reported as themselves.
 *
 * ── Why pieces ────────────────────────────────────────────────────
 *
 * The engine's frame element is prismatic: one section, its stiffness in closed form. A member
 * whose section changes along it (`Element.variableSection`) is therefore cut, for the solve only,
 * into `segments` pieces, each with the section at its own mid-length (`section/variable.ts`,
 * geometry, not interpolated numbers). Frame programs have long done it this way; the error falls
 * with the square of the count, and twelve pieces put the tip of an 0,8 → 0,3 m tapered cantilever
 * within 0,5 % (`model/edit/taper.test.ts`, the same measurement). The interior nodes also give
 * P-Delta and buckling the member's own deflection, which one element of either kind would not.
 *
 * The model keeps one member. What a cut changes is what `model/edit/member-split.ts` says it
 * changes, the same functions: loads clipped to each piece, end releases, joints and semi-rigid
 * ends at their own end, offsets interpolated, groups and self-weight rules naming every piece.
 *
 * ── Back to one member ────────────────────────────────────────────
 *
 * After the solve, `collapseVariableResults` gives each member its forces again: the start from its
 * first piece, the end from its last, the pieces' loads along the member, and the pieces themselves
 * in `ElementForces3D.pieces`, so a diagram is read piece by piece (exact by statics, and keeping
 * the second-order moments at the interior nodes). The interior nodes leave the displacements and
 * stay on the pieces, for the deflected shape. Envelopes are collapsed the same way.
 *
 * ── Cut at a load ─────────────────────────────────────────────────
 *
 * A concentrated moment, or a force along the member, inside its span has no place among the
 * engine's member loads (`member-point-loads.ts`). Such a member is cut at the load, the same way,
 * and the load goes to the node of the cut: its jump in the moment or the axial force is then
 * exact. A member that is also of variable section is cut at both, each piece with the section at
 * its mid-length; one that is not keeps its section on every piece.
 *
 * ── A tendon at a joined end ──────────────────────────────────────
 *
 * A tendon's anchors act on its member's end (`prestress.ts`), on the member's side of whatever
 * joins that end to its node. Where nothing does, the node is that end. Where a hinge, a joint or a
 * semi-rigid connection does, the engine has no node there: a hinge is a release inside the
 * element, and a joint or a semi-rigid end gets its helper node at the solve, after the loads. Put
 * on the node, the anchor moment went into whatever met the member there, and a hinged beam's
 * column took it. So such an end gets a node of its own here, where the joint is, the member's end
 * is moved to it and the connection becomes a constraint between the two nodes (with the connector
 * of a semi-rigid end): the same connection, with the member's end a node the anchors go on. The
 * member is then solved as one piece, and the helper leaves the results as a cut's node does.
 *
 * The constraint releases global axes, so a released local axis must lie along one; a member with
 * offsets has its release where the offset puts it. Neither gets the helper (`anchorEndsUnplaced`
 * names them for the model's findings).
 *
 * Ids: interior nodes, pieces, their sections and loads take ids after the model's highest, in
 * member order, so the same model always expands the same way.
 *
 * Pure: no store.
 */
import type { ModelData } from './solver-service';
import type { AnalysisResults3D, ElementForces3D, Displacement3D, FullEnvelope3D, EnvelopeDiagramData3D, Constraint3D, ConnectorElement } from './types-3d';
import type { ElementBucklingData3D } from './result-types';
import type { Element, Section } from '../store/model.svelte';
import { segmentBounds, segmentFields, splitElementLoads, flexibleMemberLength } from '../model/edit/member-split';
import { variableSectionPlan, isVariableMember as solvedAsVariable } from '../section/variable';
import { eiOf, type ElementEI } from './member-deflection';
import { memberFrame3D, takesNoBending, type Vec3 } from './member-loads';
import { pointNeedsCut, POINT_END_TOL } from './member-point-loads';
import { hasMemberOffset } from './member-offsets';
import { globalAxis, CONNECTOR_ROT } from './expand-semi-rigid-3d';

/** Pieces a variable member is cut into when it states none. */
export const DEFAULT_VARIABLE_SEGMENTS = 12;

export interface VariablePiece {
  id: number;
  sectionId: number;
  /** Where the piece runs along the member, m from end I. */
  x0: number;
  x1: number;
  nodeI: number;
  nodeJ: number;
  /** E·I of the piece's section, for its deflected curve. */
  ei?: ElementEI;
}
export interface VariableMember { parentId: number; length: number; pieces: VariablePiece[]; innerNodes: number[] }
export interface VariableExpansion { members: Map<number, VariableMember>; innerNodes: Set<number> }

/** The piece of a member's results: its own forces, where it lies, and its end displacements. */
export interface ResultPiece {
  x0: number; x1: number;
  sectionId: number;
  ei?: ElementEI;
  forces: ElementForces3D;
  dI?: Displacement3D;
  dJ?: Displacement3D;
}

type El = Element & { variableSection?: { sectionJ: number; segments?: number } };

/**
 * The expansion of a model's variable members, as `expandVariableMembers` makes it from that model:
 * ids after the model's highest, in member order. Any reader of results can ask it of the model the
 * solve was made from and put the results back together. Not cached: the store edits its model in
 * place; the stations' sections are cached where they are made (`section/variable.ts`).
 */
export function variableExpansionFor(model: ModelData): VariableExpansion | undefined {
  const exp = planExpansion(model, model).exp;
  return exp.members.size > 0 ? exp : undefined;
}

/**
 * Whether a member is solved as pieces: a frame with a section at J that blends with its own. The
 * one predicate (`section/variable.ts`); a member that states a section at J and is not one is
 * solved prismatic and named by the model's findings (`variableRefusal`).
 */
export function isVariableMember(model: Pick<ModelData, 'sections'>, e: El): boolean {
  return solvedAsVariable(model.sections as ReadonlyMap<number, Section>, e as never);
}

interface Planned {
  exp: VariableExpansion;
  nodes: Array<{ id: number; x: number; y: number; z?: number }>;
  pieces: Array<{ parent: El; k: number; n: number; t0: number; t1: number; piece: VariablePiece; section: Section }>;
  bounds: Map<number, number[]>;
  /** The joined ends given a node of their own: the node, its helper, and how they are tied. */
  ends: Array<{ parentId: number; node: number; helper: number; tie: AnchorEnd }>;
}

/**
 * Where each member is cut for a load, as fractions of its length: the interior points of its
 * concentrated moments and axial forces, on a member that bends and takes part in the analysis.
 */
function loadCuts(model: ModelData): Map<number, number[]> {
  const out = new Map<number, number[]>();
  for (const l of model.loads) {
    if (l.type !== 'pointOnElement3d') continue;
    const d = l.data;
    const e = model.elements.get(d.elementId) as (El & { behaviour?: string }) | undefined;
    // A member that takes no bending carries its loads to its nodes (`member-loads.ts`); one out
    // of the analysis carries none.
    if (!e || takesNoBending(e) || e.behaviour === 'inactive') continue;
    const f = memberFrame3D(model, e);
    if (!f || !(f.ax.L > 1e-10)) continue;
    if (!pointNeedsCut(d, { ex: f.ax.ex, ey: f.ax.ey, ez: f.ax.ez, L: f.ax.L })) continue;
    const list = out.get(e.id) ?? [];
    const t = d.a / f.ax.L;
    if (!list.some((x) => Math.abs(x - t) * f.ax.L < POINT_END_TOL)) list.push(t);
    out.set(e.id, list);
  }
  for (const list of out.values()) list.sort((a, b) => a - b);
  return out;
}

/** How a joined end is tied to its node once the member's end is a node of its own. */
interface AnchorEnd {
  side: 'i' | 'j';
  /** Released global DOFs between the node and the member's end, ux … rz. */
  releases: boolean[];
  /** A semi-rigid end's stiffness about global X, Y and Z (`expand-semi-rigid-3d.ts`). */
  springs?: [number, number, number];
}

type Joined = El & { behaviour?: string; releaseI?: Element['releaseI']; releaseJ?: Element['releaseJ']; semiRigid?: { i?: { ky: number; kz: number }; j?: { ky: number; kz: number } } };

/**
 * A member's local axes released at an end, as global DOFs: null when they do not span global
 * axes, which a constraint between two nodes cannot release.
 */
function globalRotations(axes: Vec3[]): boolean[] | null {
  const mask = [false, false, false];
  for (let k = 0; k < 3; k++) {
    const p = axes.reduce((s, v) => s + v[k]! * v[k]!, 0);
    if (p > 1 - 1e-6) mask[k] = true;
    else if (p > 1e-6) return null;
  }
  return mask;
}

/**
 * The joined ends of the members a tendon is in (see the header): per member, how each such end
 * is tied to its node. `unplaced` collects the ones that cannot get a node of their own.
 */
function anchorEnds(model: ModelData, unplaced?: Set<number>): Map<number, AnchorEnd[]> {
  const out = new Map<number, AnchorEnd[]>();
  const tendons = new Set<number>();
  for (const l of model.loads) if (l.type === 'prestress3d' && l.data.force) tendons.add(l.data.elementId);
  for (const id of tendons) {
    const e = model.elements.get(id) as Joined | undefined;
    // A member that takes no bending takes the tendon as an axial force at its nodes, which its
    // ends pass on whatever joins them.
    if (!e || takesNoBending(e) || e.behaviour === 'inactive') continue;
    const ends: AnchorEnd[] = [];
    for (const side of ['i', 'j'] as const) {
      const rel = side === 'i' ? e.releaseI : e.releaseJ;
      const joint = side === 'i' ? e.jointI : e.jointJ;
      const sr = e.semiRigid?.[side];
      const jointed = !!joint?.dof.some(Boolean);
      if (!rel?.my && !rel?.mz && !rel?.t && !jointed && !sr) continue;
      const f = hasMemberOffset(e) ? null : memberFrame3D(model, e);
      const rot = f ? globalRotations([...(rel?.t ? [f.ax.ex] : []), ...(rel?.my ? [f.ax.ey] : []), ...(rel?.mz ? [f.ax.ez] : [])] as Vec3[]) : null;
      if (!f || !rot) { unplaced?.add(id); continue; }
      const releases = jointed ? [...joint!.dof] : [false, false, false, false, false, false];
      rot.forEach((r, k) => { if (r) releases[3 + k] = true; });
      const end: AnchorEnd = { side, releases };
      if (sr) {
        // As the solve's own expansion has it; an end it refuses is left to refuse.
        const ay = globalAxis(f.ax.ey), az = globalAxis(f.ax.ez);
        if (ay === null || az === null || ![sr.ky, sr.kz].every((k) => Number.isFinite(k) && k >= 0)) continue;
        releases[3 + ay] = true; releases[3 + az] = true;
        const springs: [number, number, number] = [0, 0, 0];
        // A released axis stays released: the hinge inside the member came before the spring.
        springs[ay] = rel?.my ? 0 : sr.ky;
        springs[az] = rel?.mz ? 0 : sr.kz;
        end.springs = springs;
      }
      ends.push(end);
    }
    if (ends.length) out.set(id, ends);
  }
  return out;
}

/**
 * Members with a tendon whose joined end cannot be given a node of its own (see the header): the
 * anchors at that end act on the node, as on a rigid end. For the model's findings.
 */
export function anchorEndsUnplaced(model: ModelData): number[] {
  const out = new Set<number>();
  anchorEnds(model, out);
  return [...out].sort((a, b) => a - b);
}

/** Which members, and every id: from `base`'s highest ids, so the same model always plans alike. */
function planExpansion(model: ModelData, base: ModelData): Planned {
  const out: Planned = { exp: { members: new Map(), innerNodes: new Set() }, nodes: [], pieces: [], bounds: new Map(), ends: [] };
  const cuts = loadCuts(model);
  const anchored = anchorEnds(model);
  const vars = [...model.elements.values()].filter((e) => isVariableMember(model, e as El) || cuts.has(e.id) || anchored.has(e.id)) as El[];
  if (vars.length === 0) return out;
  const maxOf = (keys: Iterable<number>) => Math.max(0, ...keys);
  let nextNode = Math.max(maxOf(base.nodes.keys()), maxOf(model.nodes.keys())) + 1;
  let nextElem = Math.max(maxOf(base.elements.keys()), maxOf(model.elements.keys())) + 1;
  let nextSec = Math.max(maxOf(base.sections.keys()), maxOf(model.sections.keys())) + 1;
  for (const e of vars) {
    const ni = model.nodes.get(e.nodeI), nj = model.nodes.get(e.nodeJ);
    if (!ni || !nj) continue;
    const variable = isVariableMember(model, e);
    const plan = variable ? variableSectionPlan(model.sections.get(e.sectionId), model.sections.get(e.variableSection!.sectionJ)) : null;
    if (plan && !plan.ok) continue;
    const segments = variable ? Math.max(2, Math.min(50, Math.round(e.variableSection!.segments ?? DEFAULT_VARIABLE_SEGMENTS))) : 1;
    const uniform = Array.from({ length: segments - 1 }, (_, k) => (k + 1) / segments);
    // The variable section's even cuts and the loads' own, one cut where two fall within a micron.
    const ts = [...uniform];
    const Lc = Math.hypot(nj.x - ni.x, nj.y - ni.y, (nj.z ?? 0) - (ni.z ?? 0)) || 1;
    for (const t of cuts.get(e.id) ?? []) if (!ts.some((x) => Math.abs(x - t) * Lc < POINT_END_TOL)) ts.push(t);
    ts.sort((a, b) => a - b);
    const n = ts.length + 1;
    const fractions = [0, ...ts, 1];
    const hasZ = ni.z !== undefined || nj.z !== undefined;
    const inner = ts.map((t) => {
      const id = nextNode++;
      out.nodes.push({ id, x: ni.x + t * (nj.x - ni.x), y: ni.y + t * (nj.y - ni.y), ...(hasZ ? { z: (ni.z ?? 0) + t * ((nj.z ?? 0) - (ni.z ?? 0)) } : {}) });
      out.exp.innerNodes.add(id);
      return id;
    });
    // A joined end with a tendon: the member's end becomes a node of its own, where its node is.
    const endNode = (side: 'i' | 'j', node: number, at: typeof ni) => {
      const tie = anchored.get(e.id)?.find((x) => x.side === side);
      if (!tie) return node;
      const id = nextNode++;
      out.nodes.push({ id, x: at.x, y: at.y, ...(at.z !== undefined ? { z: at.z } : {}) });
      out.exp.innerNodes.add(id);
      out.ends.push({ parentId: e.id, node, helper: id, tie });
      return id;
    };
    const chain = [endNode('i', e.nodeI, ni), ...inner, endNode('j', e.nodeJ, nj)];
    const L = e.offset
      ? flexibleMemberLength(e, ni, nj, model.sections.get(e.sectionId)?.rotation)
      : Math.hypot(nj.x - ni.x, nj.y - ni.y, (nj.z ?? 0) - (ni.z ?? 0));
    const bounds = segmentBounds(L, ts);
    const pieces: VariablePiece[] = [];
    for (let k = 0; k < n; k++) {
      // A piece of a variable member takes the section at its mid-length; one cut for a load only
      // keeps the member's own.
      const sid = plan?.ok ? nextSec++ : e.sectionId;
      const section = plan?.ok ? { ...plan.at((fractions[k]! + fractions[k + 1]!) / 2), id: sid } as Section : model.sections.get(e.sectionId)!;
      const ei = eiOf(model.materials.get(e.materialId), section);
      const piece: VariablePiece = { id: nextElem++, sectionId: sid, x0: bounds[k]!, x1: bounds[k + 1]!, nodeI: chain[k]!, nodeJ: chain[k + 1]!, ...(ei ? { ei } : {}) };
      pieces.push(piece);
      out.pieces.push({ parent: e, k, n, t0: fractions[k]!, t1: fractions[k + 1]!, piece, section });
    }
    out.bounds.set(e.id, bounds);
    out.exp.members.set(e.id, { parentId: e.id, length: L, pieces, innerNodes: inner });
  }
  return out;
}

/**
 * The model with its variable members as chains of pieces (see the header). `base` is the model
 * the ids are counted from: the one the caller was given, before anything was pruned from it.
 */
export function expandVariableMembers<M extends ModelData>(model: M, base: ModelData = model): M {
  const planned = planExpansion(model, base);
  const exp = planned.exp;
  if (exp.members.size === 0) return model;
  let nextLoad = Math.max(0, ...model.loads.map((l) => (l.data as { id: number }).id)) + 1;
  const nodes = new Map(model.nodes);
  const elements = new Map(model.elements);
  const sections = new Map(model.sections);
  let loads = model.loads;
  for (const nd of planned.nodes) nodes.set(nd.id, nd as never);
  for (const m of exp.members.values()) elements.delete(m.parentId);
  for (const { parent, k, n, t0, t1, piece, section } of planned.pieces) {
    if (section) sections.set(piece.sectionId, section);
    const fields = segmentFields(parent, k, n, t0, t1);
    elements.set(piece.id, { ...fields, id: piece.id, nodeI: piece.nodeI, nodeJ: piece.nodeJ, sectionId: piece.sectionId } as Element);
  }
  // A joined end with a tendon (see the header): the piece's end is rigid on its own node, and the
  // connection is between that node and the member's.
  let constraints = model.constraints;
  let connectors = model.connectors;
  let nextConn = Math.max(0, ...(model.connectors?.keys() ?? [])) + 1;
  for (const { parentId, node, helper, tie } of planned.ends) {
    const m = exp.members.get(parentId)!;
    const p = tie.side === 'i' ? m.pieces[0]! : m.pieces[m.pieces.length - 1]!;
    const el = { ...elements.get(p.id)! } as Element & { semiRigid?: { i?: unknown; j?: unknown } };
    if (tie.side === 'i') { el.releaseI = { ...el.releaseI, my: false, mz: false, t: false }; delete el.jointI; }
    else { el.releaseJ = { ...el.releaseJ, my: false, mz: false, t: false }; delete el.jointJ; }
    if (el.semiRigid) {
      const { [tie.side]: _gone, ...rest } = el.semiRigid;
      if (Object.keys(rest).length) el.semiRigid = rest; else delete el.semiRigid;
    }
    elements.set(p.id, el);
    constraints = [...(constraints ?? []), {
      type: 'eccentricConnection', masterNode: node, slaveNode: helper, offsetX: 0, offsetY: 0, offsetZ: 0, releases: tie.releases,
    } as Constraint3D];
    if (tie.springs) {
      const c: Record<string, number> = { kAxial: 0, kShear: 0, kShearZ: 0, kMoment: 0, kBendY: 0, kBendZ: 0 };
      tie.springs.forEach((k, axis) => { c[CONNECTOR_ROT[axis]!] = k; });
      const id = nextConn++;
      connectors = new Map(connectors ?? []).set(id, { id, nodeI: node, nodeJ: helper, ...c } as unknown as ConnectorElement);
    }
  }
  const renamed = new Map<number, number[]>();
  for (const m of exp.members.values()) {
    const ids = m.pieces.map((p) => p.id);
    const split = splitElementLoads(loads, m.parentId, planned.bounds.get(m.parentId)!, ids, () => nextLoad++);
    loads = [...split.kept, ...split.added];
    renamed.set(m.parentId, ids);
  }

  const rename = (ids: readonly number[]) => ids.flatMap((id) => renamed.get(id) ?? [id]);
  const groups = (model as { groups?: Map<number, { members: { elements?: number[] } }> }).groups;
  const analysis = (model as { analysis?: { selfWeight?: Array<{ elements?: number[] }> } }).analysis;
  const supports = new Map([...model.supports].map(([id, s]) => {
    const own = (s as { dofLocalElementId?: number }).dofLocalElementId;
    const m = own !== undefined ? exp.members.get(own) : undefined;
    if (!m) return [id, s] as const;
    const at = s.nodeId === m.pieces[m.pieces.length - 1]!.nodeJ ? m.pieces[m.pieces.length - 1]! : m.pieces[0]!;
    return [id, { ...s, dofLocalElementId: at.id }] as const;
  }));
  return {
    ...model, nodes, elements, sections, loads, supports,
    ...(constraints !== model.constraints ? { constraints } : {}),
    ...(connectors !== model.connectors ? { connectors } : {}),
    ...(groups ? { groups: new Map([...groups].map(([id, g]) => [id, g.members.elements ? { ...g, members: { ...g.members, elements: rename(g.members.elements) } } : g])) } : {}),
    ...(analysis?.selfWeight ? { analysis: { ...analysis, selfWeight: analysis.selfWeight.map((r) => (r.elements ? { ...r, elements: rename(r.elements) } : r)) } } : {}),
  } as M;
}

// ─── Back to one member ───────────────────────────────────────────

function parentForces(m: VariableMember, byId: Map<number, ElementForces3D>, disp: Map<number, Displacement3D>): ElementForces3D | null {
  const fs = m.pieces.map((p) => byId.get(p.id));
  if (fs.some((f) => !f)) return null;
  const first = fs[0]!, last = fs[fs.length - 1]!;
  const shift = <T extends { a: number }>(list: T[] | undefined, x0: number): T[] => (list ?? []).map((l) => ({ ...l, a: l.a + x0 }));
  const shiftD = (list: Array<{ qI: number; qJ: number; a: number; b: number }> | undefined, x0: number) =>
    (list ?? []).map((l) => ({ ...l, a: l.a + x0, b: l.b + x0 }));
  const pieces: ResultPiece[] = m.pieces.map((p, k) => ({
    x0: p.x0, x1: p.x1, sectionId: p.sectionId, forces: fs[k]!, ...(p.ei ? { ei: p.ei } : {}),
    ...(disp.get(p.nodeI) ? { dI: disp.get(p.nodeI) } : {}), ...(disp.get(p.nodeJ) ? { dJ: disp.get(p.nodeJ) } : {}),
  }));
  const along = (pick: (f: ElementForces3D) => Array<{ qI: number; qJ: number; a: number; b: number }> | undefined) =>
    m.pieces.flatMap((p, k) => shiftD(pick(fs[k]!), p.x0));
  const xLoads = m.pieces.some((_, k) => fs[k]!.distributedLoadsX) ? { distributedLoadsX: along((f) => f.distributedLoadsX) } : {};
  return {
    ...first,
    elementId: m.parentId, length: m.length,
    nStart: first.nStart, vyStart: first.vyStart, vzStart: first.vzStart, mxStart: first.mxStart, myStart: first.myStart, mzStart: first.mzStart,
    nEnd: last.nEnd, vyEnd: last.vyEnd, vzEnd: last.vzEnd, mxEnd: last.mxEnd, myEnd: last.myEnd, mzEnd: last.mzEnd,
    releaseMyEnd: last.releaseMyEnd, releaseMzEnd: last.releaseMzEnd, releaseTEnd: last.releaseTEnd,
    qYI: 0, qYJ: 0, qZI: 0, qZJ: 0,
    distributedLoadsY: along((f) => f.distributedLoadsY),
    distributedLoadsZ: along((f) => f.distributedLoadsZ),
    ...xLoads,
    pointLoadsY: m.pieces.flatMap((p, k) => shift(fs[k]!.pointLoadsY, p.x0)),
    pointLoadsZ: m.pieces.flatMap((p, k) => shift(fs[k]!.pointLoadsZ, p.x0)),
    pieces,
  } as ElementForces3D;
}

/** One result with its variable members back to one member each (see the header). */
export function collapseVariableResults(r: AnalysisResults3D, exp: VariableExpansion | undefined): AnalysisResults3D {
  if (!exp || exp.members.size === 0) return r;
  const pieceIds = new Set<number>();
  for (const m of exp.members.values()) for (const p of m.pieces) pieceIds.add(p.id);
  const byId = new Map(r.elementForces.map((f) => [f.elementId, f]));
  const disp = new Map(r.displacements.map((d) => [d.nodeId, d]));
  const parents: ElementForces3D[] = [];
  for (const m of exp.members.values()) { const f = parentForces(m, byId, disp); if (f) parents.push(f); }
  return {
    ...r,
    displacements: r.displacements.filter((d) => !exp.innerNodes.has(d.nodeId)),
    reactions: r.reactions.filter((x) => !exp.innerNodes.has(x.nodeId)),
    // A joined end's own node is tied by a constraint (see the header), whose forces are its.
    ...(r.constraintForces ? { constraintForces: r.constraintForces.filter((c) => !exp.innerNodes.has(c.nodeId)) } : {}),
    elementForces: [...r.elementForces.filter((f) => !pieceIds.has(f.elementId)), ...parents],
  };
}

/**
 * A result already back to one member each, as its pieces again, with the expansion that puts it
 * back together: read off the pieces it keeps (`ResultPiece`), each with its own forces and end
 * displacements. For what is computed again from collapsed results, an envelope over some of the
 * combinations: taken over the members, it lost the pieces and so their EI and interior nodes.
 * Undefined expansion when no member has pieces.
 */
export function reexpandVariableResults(r: AnalysisResults3D): { results: AnalysisResults3D; exp: VariableExpansion | undefined } {
  const exp: VariableExpansion = { members: new Map(), innerNodes: new Set() };
  const forces: ElementForces3D[] = [];
  const extra = new Map<number, Displacement3D>();
  const known = new Set(r.displacements.map((d) => d.nodeId));
  for (const f of r.elementForces) {
    const ps = f.pieces;
    if (!ps?.length || ps.some((p) => !p.dI || !p.dJ)) { forces.push(f); continue; }
    const pieces: VariablePiece[] = ps.map((p) => ({
      id: p.forces.elementId, sectionId: p.sectionId, x0: p.x0, x1: p.x1, nodeI: p.dI!.nodeId, nodeJ: p.dJ!.nodeId, ...(p.ei ? { ei: p.ei } : {}),
    }));
    const innerNodes = pieces.slice(1).map((p) => p.nodeI);
    exp.members.set(f.elementId, { parentId: f.elementId, length: f.length, pieces, innerNodes });
    for (const n of innerNodes) exp.innerNodes.add(n);
    for (const p of ps) { forces.push(p.forces); extra.set(p.dJ!.nodeId, p.dJ!); }
    // A joined end's own node (see the header) is no node of the model either.
    const first = ps[0]!.dI!, last = ps[ps.length - 1]!.dJ!;
    for (const d of [first, last]) if (!known.has(d.nodeId)) { exp.innerNodes.add(d.nodeId); extra.set(d.nodeId, d); }
  }
  if (exp.members.size === 0) return { results: r, exp: undefined };
  const displacements = [...r.displacements, ...[...exp.innerNodes].map((n) => extra.get(n)!)];
  return { results: { ...r, elementForces: forces, displacements }, exp };
}

function collapseDiagram(d: EnvelopeDiagramData3D, exp: VariableExpansion): EnvelopeDiagramData3D {
  const byId = new Map(d.elements.map((e) => [e.elementId, e]));
  const pieceIds = new Set<number>();
  const parents = [];
  for (const m of exp.members.values()) {
    const tPositions: number[] = [], posValues: number[] = [], negValues: number[] = [];
    let complete = true;
    for (const p of m.pieces) {
      pieceIds.add(p.id);
      const e = byId.get(p.id);
      if (!e) { complete = false; continue; }
      e.tPositions.forEach((t, i) => {
        tPositions.push((p.x0 + t * (p.x1 - p.x0)) / m.length);
        posValues.push(e.posValues[i]!); negValues.push(e.negValues[i]!);
      });
    }
    if (complete) parents.push({ elementId: m.parentId, tPositions, posValues, negValues });
  }
  return { ...d, elements: [...d.elements.filter((e) => !pieceIds.has(e.elementId)), ...parents] };
}

export function collapseVariableEnvelope(env: FullEnvelope3D, exp: VariableExpansion | undefined): FullEnvelope3D {
  if (!exp || exp.members.size === 0) return env;
  return {
    momentY: collapseDiagram(env.momentY, exp), momentZ: collapseDiagram(env.momentZ, exp),
    shearY: collapseDiagram(env.shearY, exp), shearZ: collapseDiagram(env.shearZ, exp),
    axial: collapseDiagram(env.axial, exp), torsion: collapseDiagram(env.torsion, exp),
    maxAbsResults3D: collapseVariableResults(env.maxAbsResults3D, exp),
  };
}

/**
 * A P-Delta result with its variable members back to one member each: its second-order results and
 * the linear ones beside them, and no interior node among its amplifications.
 */
export function collapseVariablePDelta<R extends { results: AnalysisResults3D; linearResults?: AnalysisResults3D; amplification?: Array<{ nodeId: number }> }>(
  r: R, exp: VariableExpansion | undefined,
): R {
  if (!exp || exp.members.size === 0) return r;
  return {
    ...r,
    results: collapseVariableResults(r.results, exp),
    ...(r.linearResults ? { linearResults: collapseVariableResults(r.linearResults, exp) } : {}),
    ...(r.amplification ? { amplification: r.amplification.filter((a) => !exp.innerNodes.has(a.nodeId)) } : {}),
  };
}

/**
 * A modal or buckling result as the model has it: the interior nodes leave the mode shapes, and a
 * buckling row per member. The piece where the member is most slender stands for it, with the
 * member's length and its effective length over that length; the pieces' own lengths mean nothing
 * to a reader, who has one member.
 */
export function collapseVariableModes<R extends { modes: Array<{ displacements: Array<{ nodeId: number }> }>; elementData?: ElementBucklingData3D[] }>(
  r: R, exp: VariableExpansion | undefined,
): R {
  if (!exp || exp.members.size === 0) return r;
  const modes = r.modes.map((m) => ({ ...m, displacements: m.displacements.filter((d) => !exp.innerNodes.has(d.nodeId)) }));
  if (!r.elementData) return { ...r, modes };
  const pieceOf = new Map<number, VariableMember>();
  for (const m of exp.members.values()) for (const p of m.pieces) pieceOf.set(p.id, m);
  const governing = new Map<number, ElementBucklingData3D>();
  const kept: ElementBucklingData3D[] = [];
  for (const row of r.elementData) {
    const m = pieceOf.get(row.elementId);
    if (!m) { kept.push(row); continue; }
    const g = governing.get(m.parentId);
    if (!g || Math.max(row.slendernessY, row.slendernessZ) > Math.max(g.slendernessY, g.slendernessZ)) governing.set(m.parentId, row);
  }
  const members = [...governing].map(([parentId, row]) => {
    const length = exp.members.get(parentId)!.length;
    return { ...row, elementId: parentId, length, kEffective: length > 0 ? row.effectiveLength / length : row.kEffective };
  });
  return { ...r, modes, elementData: [...kept, ...members] };
}
