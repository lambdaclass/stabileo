/**
 * The loads each case carries when solved, from what the model states about the case:
 *
 *   reduction   a case's own loads times the reduction ratio stated for it (an imposed load
 *               typed by hand, reduced by its tributary area as the generator reduces its own);
 *   notional    horizontal loads at each node, a fraction of the gravity load another case puts
 *               there (`direct-analysis.ts` `nodeGravity`, `notionalLoads`), along a direction;
 *   includes    other cases taken in, each times a factor, with their self-weight: a composite
 *               case, solved as one case.
 *
 * The result is a model whose loads and self-weight rows are written out case by case, so every
 * per-case path (the linear combinations, P-Delta per combination, the nonlinear solve, the direct
 * analysis, the mass source, the statics check) reads a composite case as the sum it is, without
 * knowing about it. A case that takes itself in, directly or through others, takes in nothing.
 *
 * Pure.
 */
import type { Load, LoadCase } from '../store/model.svelte';
import type { SelfWeightLoad } from './analysis-settings';
import { GRAVITY_SELF_WEIGHT } from './analysis-settings';
import { scaledLoad } from '../model/loads/load-magnitudes';
import { buildSolverInput3D, buildSolverLoads3D, type ModelData } from './solver-service';
import { nodeGravity, notionalLoads } from './direct-analysis';
import { solvableModel } from './member-behaviour';
import { isCompositeCase } from './loads/combination-cases';
import { variableExpansionFor } from './variable-members';

type CaseLike = Pick<LoadCase, 'id' | 'type' | 'includes' | 'notional' | 'reduction'>;

const DIRS: Record<'+X' | '-X' | '+Y' | '-Y', [number, number]> = { '+X': [1, 0], '-X': [-1, 0], '+Y': [0, 1], '-Y': [0, -1] };

/** Whether any case says something that changes the loads it is solved with. */
export function hasCaseEffects(cases: readonly CaseLike[]): boolean {
  return cases.some((c) => (c.includes?.length ?? 0) > 0 || !!c.notional || (c.reduction && c.reduction.ratio !== 1));
}

/** The cases in an order where each comes after those it reads; those in a loop are named. */
export function caseOrder(cases: readonly CaseLike[]): { order: number[]; looped: Set<number> } {
  const byId = new Map(cases.map((c) => [c.id, c]));
  const deps = (c: CaseLike) => [...(c.includes ?? []).map((x) => x.caseId), ...(c.notional ? [c.notional.sourceCaseId] : [])].filter((id) => byId.has(id));
  const state = new Map<number, 0 | 1 | 2>();
  const order: number[] = [];
  const looped = new Set<number>();
  const visit = (id: number, path: number[]) => {
    const s = state.get(id) ?? 0;
    if (s === 2) return;
    if (s === 1) { for (const p of path.slice(path.indexOf(id))) looped.add(p); return; }
    state.set(id, 1);
    for (const d of deps(byId.get(id)!)) visit(d, [...path, id]);
    state.set(id, 2);
    order.push(id);
  };
  for (const c of cases) visit(c.id, []);
  return { order, looped };
}

/**
 * The model with every case's loads as solved. `includeSelfWeight` is the older switch, read only
 * when the model states no self-weight rows (`self-weight.ts`).
 */
export function withCaseEffects<M extends ModelData>(model: M, cases: readonly CaseLike[], opts: { includeSelfWeight: boolean; leftHand: boolean }): M {
  if (!hasCaseEffects(cases)) return model;
  const { order, looped } = caseOrder(cases);
  const byId = new Map(cases.map((c) => [c.id, c]));

  // The self-weight rows, written out: the older switch puts gravity on every dead-load case,
  // not on a composite one typed D, which has it through the cases it takes in.
  const stated: SelfWeightLoad[] = model.analysis?.selfWeight
    ?? (opts.includeSelfWeight ? cases.filter((c) => c.type === 'D' && !isCompositeCase(c)).map((c) => ({ caseId: c.id, ...GRAVITY_SELF_WEIGHT })) : []);
  const rows = new Map<number, SelfWeightLoad[]>();
  for (const r of stated) (rows.get(r.caseId) ?? rows.set(r.caseId, []).get(r.caseId)!).push(r);

  const own = new Map<number, Load[]>();
  for (const l of model.loads) { const c = l.data.caseId ?? 1; (own.get(c) ?? own.set(c, []).get(c)!).push(l); }
  const loads = new Map<number, Load[]>();
  let nextId = Math.max(0, ...model.loads.map((l) => l.data.id)) + 1;
  const fresh = (l: Load, caseId: number, k: number): Load => {
    const s = k === 1 ? l : scaledLoad(l, k);
    return { ...s, data: { ...s.data, id: nextId++, caseId } } as Load;
  };

  for (const id of order) {
    const c = byId.get(id)!;
    const k = c.reduction?.ratio ?? 1;
    const list = (own.get(id) ?? []).map((l) => (k === 1 ? l : fresh(l, id, k)));
    const swRows = [...(rows.get(id) ?? [])];
    if (c.notional && !looped.has(id)) {
      const src = c.notional.sourceCaseId;
      const gravity = sourceGravity(model, loads.get(src) ?? own.get(src) ?? [], rows.get(src) ?? [], opts.leftHand);
      if (gravity) {
        const [ux, uy] = DIRS[c.notional.dir];
        for (const n of notionalLoads(gravity, c.notional.ratio, ux, uy)) {
          if (n.type !== 'nodal') continue;
          list.push({ type: 'nodal3d', data: { id: nextId++, nodeId: n.data.nodeId, fx: n.data.fx, fy: n.data.fy, fz: 0, mx: 0, my: 0, mz: 0, caseId: id } });
        }
      }
    }
    if (!looped.has(id)) {
      for (const inc of c.includes ?? []) {
        if (!byId.has(inc.caseId) || inc.factor === 0) continue;
        for (const l of loads.get(inc.caseId) ?? own.get(inc.caseId) ?? []) list.push(fresh(l, id, inc.factor));
        for (const r of rows.get(inc.caseId) ?? []) swRows.push({ ...r, caseId: id, factor: r.factor * inc.factor });
      }
    }
    loads.set(id, list);
    rows.set(id, swRows);
  }

  // Loads of a case id the model has no case for are kept as they are.
  const orphan = model.loads.filter((l) => !byId.has(l.data.caseId ?? 1));
  return {
    ...model,
    loads: [...orphan, ...order.flatMap((id) => loads.get(id) ?? [])],
    analysis: { ...(model.analysis ?? {}), selfWeight: [...rows.values()].flat() },
  };
}

/**
 * The gravity a source case puts at each of the model's nodes, kN, or null for a model with
 * nothing to solve. Read off the structure the solve solves (`solvableModel`): the base and the
 * source's loads from the same expanded model, as `runDirectAnalysis` builds them. Built from the
 * model as given, a member solved as pieces had its loads on an id the base no longer has, and
 * they and its self-weight were lost. The share at a piece's interior node goes to its member's
 * own ends by the lever rule, as `nodeGravity` shares out a member load, so every notional load is
 * on a node the model has.
 */
function sourceGravity(model: ModelData, srcLoads: Load[], srcRows: SelfWeightLoad[], leftHand: boolean): Map<number, number> | null {
  const of = { ...model, loads: srcLoads, analysis: { ...(model.analysis ?? {}), selfWeight: srcRows } } as ModelData;
  const solvable = solvableModel(of);
  const base = buildSolverInput3D({ ...solvable, loads: [] }, false, leftHand);
  if (!base) return null;
  const { gravity } = nodeGravity(base, buildSolverLoads3D(solvable, solvable.loads, solvable.analysis?.selfWeight ?? [], leftHand), leftHand);
  const exp = variableExpansionFor(of);
  if (!exp) return gravity;
  const at = new Map<number, { parent: number; t: number }>();
  for (const m of exp.members.values()) {
    for (const p of m.pieces) {
      at.set(p.nodeI, { parent: m.parentId, t: p.x0 / m.length });
      at.set(p.nodeJ, { parent: m.parentId, t: p.x1 / m.length });
    }
  }
  const out = new Map<number, number>();
  const add = (n: number, g: number) => out.set(n, (out.get(n) ?? 0) + g);
  for (const [n, g] of gravity) {
    const where = model.nodes.has(n) ? undefined : at.get(n);
    const parent = where && model.elements.get(where.parent);
    if (!where || !parent) { add(n, g); continue; }
    add(parent.nodeI, g * (1 - where.t));
    add(parent.nodeJ, g * where.t);
  }
  return out;
}

/**
 * The model for a solve of every load at once, without combinations: each case's own loads once,
 * a reduced case's times its ratio, and a reference case's left out, with its self-weight rows:
 * it is only for the cases that take it in, and the results listed it nowhere else. A composite
 * case adds its own loads only, since what it takes in is there already, each case once; notional
 * loads are a fraction of other cases' gravity, which only a combination states, and are not
 * worked out. With no case saying any of it, the model is returned as it is.
 */
export function singleSolveModel<M extends ModelData>(model: M, cases: readonly Pick<LoadCase, 'id' | 'reference' | 'reduction'>[]): M {
  const reference = new Set(cases.filter((c) => c.reference).map((c) => c.id));
  const ratio = new Map(cases.filter((c) => c.reduction && c.reduction.ratio !== 1).map((c) => [c.id, c.reduction!.ratio]));
  if (reference.size === 0 && ratio.size === 0) return model;
  const loads = model.loads.flatMap((l) => {
    const c = l.data.caseId ?? 1;
    if (reference.has(c)) return [];
    const k = ratio.get(c);
    return [k === undefined ? l : scaledLoad(l, k)];
  });
  const rows = model.analysis?.selfWeight;
  return {
    ...model, loads,
    ...(rows && reference.size ? { analysis: { ...model.analysis, selfWeight: rows.filter((r) => !reference.has(r.caseId)) } } : {}),
  };
}
