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
 * Ids: interior nodes, pieces, their sections and loads take ids after the model's highest, in
 * member order, so the same model always expands the same way.
 *
 * Pure: no store.
 */
import type { ModelData } from './solver-service';
import type { AnalysisResults3D, ElementForces3D, Displacement3D, FullEnvelope3D, EnvelopeDiagramData3D } from './types-3d';
import type { ElementBucklingData3D } from './result-types';
import type { Element, Section } from '../store/model.svelte';
import { segmentBounds, segmentFields, splitElementLoads, flexibleMemberLength } from '../model/edit/member-split';
import { variableSectionPlan, isVariableMember as solvedAsVariable } from '../section/variable';
import { eiOf, type ElementEI } from './member-deflection';

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
}

/** Which members, and every id: from `base`'s highest ids, so the same model always plans alike. */
function planExpansion(model: ModelData, base: ModelData): Planned {
  const out: Planned = { exp: { members: new Map(), innerNodes: new Set() }, nodes: [], pieces: [], bounds: new Map() };
  const vars = [...model.elements.values()].filter((e) => isVariableMember(model, e as El)) as El[];
  if (vars.length === 0) return out;
  const maxOf = (keys: Iterable<number>) => Math.max(0, ...keys);
  let nextNode = Math.max(maxOf(base.nodes.keys()), maxOf(model.nodes.keys())) + 1;
  let nextElem = Math.max(maxOf(base.elements.keys()), maxOf(model.elements.keys())) + 1;
  let nextSec = Math.max(maxOf(base.sections.keys()), maxOf(model.sections.keys())) + 1;
  for (const e of vars) {
    const ni = model.nodes.get(e.nodeI), nj = model.nodes.get(e.nodeJ);
    if (!ni || !nj) continue;
    const plan = variableSectionPlan(model.sections.get(e.sectionId), model.sections.get(e.variableSection!.sectionJ));
    if (!plan.ok) continue;
    const n = Math.max(2, Math.min(50, Math.round(e.variableSection!.segments ?? DEFAULT_VARIABLE_SEGMENTS)));
    const ts = Array.from({ length: n - 1 }, (_, k) => (k + 1) / n);
    const fractions = [0, ...ts, 1];
    const hasZ = ni.z !== undefined || nj.z !== undefined;
    const inner = ts.map((t) => {
      const id = nextNode++;
      out.nodes.push({ id, x: ni.x + t * (nj.x - ni.x), y: ni.y + t * (nj.y - ni.y), ...(hasZ ? { z: (ni.z ?? 0) + t * ((nj.z ?? 0) - (ni.z ?? 0)) } : {}) });
      out.exp.innerNodes.add(id);
      return id;
    });
    const chain = [e.nodeI, ...inner, e.nodeJ];
    const L = e.offset
      ? flexibleMemberLength(e, ni, nj, model.sections.get(e.sectionId)?.rotation)
      : Math.hypot(nj.x - ni.x, nj.y - ni.y, (nj.z ?? 0) - (ni.z ?? 0));
    const bounds = segmentBounds(L, ts);
    const pieces: VariablePiece[] = [];
    for (let k = 0; k < n; k++) {
      const sid = nextSec++;
      const section = { ...plan.at((fractions[k]! + fractions[k + 1]!) / 2), id: sid } as Section;
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
    sections.set(piece.sectionId, section);
    const fields = segmentFields(parent, k, n, t0, t1);
    elements.set(piece.id, { ...fields, id: piece.id, nodeI: piece.nodeI, nodeJ: piece.nodeJ, sectionId: piece.sectionId } as Element);
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
    elementForces: [...r.elementForces.filter((f) => !pieceIds.has(f.elementId)), ...parents],
  };
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
