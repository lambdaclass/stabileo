import { accountingCaseSources, copyAccountingLoad, scenarioSurfaceExpectations, scenarioSurfaceIntentOf, withScenarioSurfaceIntent, withAccountingOrigin, type AccountingCaseSources, type ScenarioSurfaceIntent } from './accounting-source';
import { loadCaseBatches } from './load-accounting';
/**
 * The loads each case carries when solved, from what the model states about the case:
 *
 *   reduction   a case's own loads times the reduction ratio stated for it (an imposed load
 *               typed by hand, reduced by its tributary area as the generator reduces its own),
 *               on a case the reduction applies to (`reductionApplies`): an L case retyped Lr
 *               keeps the ratio it was given, and its loads whole;
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
import { prepareSolverInput3D, notionalSourceLoads3D, type ModelData } from './solver-service';
import { nodeGravity, notionalLoads } from './direct-analysis';
import { isCompositeCase } from './loads/combination-cases';
import { variableExpansionFor } from './variable-members';
import { caseReductionRefusal } from './loads/case-reduction';
import { listed } from './combination-methods';
import { sumCombinationFactors } from './wasm-solver';

function scaleCaseLoad(load: Load, factor: number): Load {
  const scaled = scaledLoad(load, factor);
  if (load.type !== 'surface3d' || scaled.type !== 'surface3d') return scaled;
  const intent = scenarioSurfaceIntentOf(load);
  return intent ? withScenarioSurfaceIntent(scaled, {
    ...intent, caseFactors: [...(intent.caseFactors ?? []), factor],
  }) : scaled;
}

type CaseLike = Pick<LoadCase, 'id' | 'type' | 'includes' | 'notional' | 'reduction'>;

const DIRS: Record<'+X' | '-X' | '+Y' | '-Y', [number, number]> = { '+X': [1, 0], '-X': [-1, 0], '+Y': [0, 1], '-Y': [0, -1] };

/**
 * Whether a case's stated reduction is applied: by the rule the case details offer it by
 * (`caseReductionRefusal`), a floor imposed load (L). Retyping a case keeps what it states, so an
 * L case reduced at 0,6 and retyped Lr held its ratio, and its 50 kN were solved as 30.
 */
export function reductionApplies(c: Pick<LoadCase, 'type' | 'reduction'>): boolean {
  return !!c.reduction && c.reduction.ratio !== 1 && caseReductionRefusal(c.type, false) !== 'notImposed';
}

/** The ratio a case's own loads are solved with. */
const ratioOf = (c: Pick<LoadCase, 'type' | 'reduction'>) => (reductionApplies(c) ? c.reduction!.ratio : 1);

/** Whether any case says something that changes the loads it is solved with. */
export function hasCaseEffects(cases: readonly CaseLike[]): boolean {
  return cases.some((c) => (c.includes?.length ?? 0) > 0 || !!c.notional || reductionApplies(c));
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
  // The walk names the cases on the path it closes a loop along; a case that comes back to itself
  // only through one the walk had finished (A → B → C → A, then B → D → C) is in a loop too.
  const readsItself = (id: number) => {
    const seen = new Set<number>(), stack = deps(byId.get(id)!);
    while (stack.length) {
      const d = stack.pop()!;
      if (d === id) return true;
      if (seen.has(d)) continue;
      seen.add(d);
      stack.push(...deps(byId.get(d)!));
    }
    return false;
  };
  for (const c of cases) if (!looped.has(c.id) && readsItself(c.id)) looped.add(c.id);
  return { order, looped };
}

/**
 * Whether changing a case would put a case in a loop that was in none: what the store refuses.
 * A case in a loop already (a file can hold one) is still edited, its factors changed, a case
 * taken in that loops nothing, any link of its loop removed; only a loop it did not have, or one
 * reaching a case it did not, is refused.
 */
export function addsLoop(cases: readonly CaseLike[], id: number, patch: Partial<Pick<CaseLike, 'includes' | 'notional'>>): boolean {
  const before = caseOrder(cases).looped;
  const after = caseOrder(cases.map((c) => (c.id === id ? { ...c, ...patch } : c))).looped;
  return [...after].some((x) => !before.has(x));
}

/**
 * The model with every case's loads as solved. `includeSelfWeight` is the older switch, read only
 * when the model states no self-weight rows (`self-weight.ts`).
 */
export function withCaseEffects<M extends ModelData>(
  model: M, cases: readonly CaseLike[], opts: { includeSelfWeight: boolean; leftHand: boolean },
  caseIds?: ReadonlySet<number>,
): M {
  const scope = caseIds && cases.some(c => !caseIds.has(c.id)) ? caseIds : undefined;
  const hasEffects = hasCaseEffects(cases);
  if (!scope && !hasEffects) return model;
  const byId = new Map(cases.map(c => [c.id, c]));
  const inScope = (id: number) => !scope || scope.has(id) || !byId.has(id);
  const { order, looped } = caseOrder(cases);
  const own = loadCaseBatches(model.loads);
  const sources = caseSources(own, byId, looped, inScope, { generateNotionals: true });
  if (!hasEffects) {
    return { ...model, [accountingCaseSources]: sources, loads: model.loads.filter(l => inScope(l.data.caseId ?? 1)) };
  }
  // The self-weight rows, written out: the older switch puts gravity on every dead-load case,
  // not on a composite one typed D, which has it through the cases it takes in.
  const stated: SelfWeightLoad[] = model.analysis?.selfWeight
    ?? (opts.includeSelfWeight ? cases.filter((c) => c.type === 'D' && !isCompositeCase(c)).map((c) => ({ caseId: c.id, ...GRAVITY_SELF_WEIGHT })) : []);
  const rows = new Map<number, SelfWeightLoad[]>();
  for (const r of stated) (rows.get(r.caseId) ?? rows.set(r.caseId, []).get(r.caseId)!).push(r);

  const loads = new Map<number, Load[]>();
  const generated = new Map<number, Load[]>();
  let expectedPressures: ReturnType<typeof scenarioSurfaceExpectations> | undefined;
  let nextId = Math.max(0, ...model.loads.map((l) => l.data.id)) + 1;
  const fresh = (l: Load, caseId: number, k: number): Load => {
    const s = k === 1 ? l : scaleCaseLoad(l, k);
    return withAccountingOrigin({ ...s, data: { ...s.data, id: nextId++, caseId } } as Load, l);
  };

  for (const id of order) {
    const rule = sources.cases.get(id);
    if (!rule) continue;
    const c = byId.get(id)!;
    const { ratio: k, includes } = rule;
    const list = (own.get(id) ?? []).map((l) => (k === 1 ? l : fresh(l, id, k)));
    const swRows = [...(rows.get(id) ?? [])];
    if (c.notional && !looped.has(id)) {
      const src = c.notional.sourceCaseId;
      expectedPressures ??= scenarioSurfaceExpectations(sources);
      const gravity = sourceGravity(model, src, loads.get(src) ?? own.get(src) ?? [], rows.get(src) ?? [],
        opts.leftHand, expectedPressures(src), { ...sources, generated, targets: new Set([src]) });
      if (gravity) {
        const [ux, uy] = DIRS[c.notional.dir];
        const actions: Load[] = notionalLoads(gravity, c.notional.ratio, ux, uy).flatMap(n => n.type === 'nodal' ? [{
          type: 'nodal3d',
          data: { id: nextId++, nodeId: n.data.nodeId, fx: n.data.fx, fy: n.data.fy, fz: 0, mx: 0, my: 0, mz: 0, caseId: id },
        }] : []);
        generated.set(id, actions.map(copyAccountingLoad));
        for (const action of actions) list.push(action);
      }
    }
    for (const { caseId, factor } of includes) {
      for (const l of loads.get(caseId) ?? own.get(caseId) ?? []) list.push(fresh(l, id, factor));
      for (const r of rows.get(caseId) ?? []) swRows.push({ ...r, caseId: id, factor: r.factor * factor });
    }
    loads.set(id, list);
    rows.set(id, swRows);
  }

  // Loads of a case id the model has no case for are kept as they are.
  const orphan = model.loads.filter((l) => !byId.has(l.data.caseId ?? 1));
  return {
    ...model,
    [accountingCaseSources]: { ...sources, generated },
    loads: [...orphan, ...order.filter(inScope).flatMap(id => loads.get(id) ?? [])],
    analysis: { ...(model.analysis ?? {}), selfWeight: [...rows.entries()].filter(([id]) => inScope(id)).flatMap(([, own]) => own) },
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
function sourceGravity(
  model: ModelData, caseId: number, srcLoads: Load[], srcRows: SelfWeightLoad[], leftHand: boolean, expectedPressures: readonly ScenarioSurfaceIntent[],
  sources: AccountingCaseSources,
): Map<number, number> | null {
  const of = {
    ...model, loads: srcLoads, analysis: { ...(model.analysis ?? {}), selfWeight: srcRows },
    [accountingCaseSources]: sources,
  };
  const prepared = prepareSolverInput3D(of, leftHand);
  const { model: solvable } = prepared;
  const base = prepared.build([]);
  if (!base) return null;
  const { gravity } = nodeGravity(base, notionalSourceLoads3D(solvable, leftHand, caseId, expectedPressures, base), leftHand);
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

export function includedCases(
  c: CaseLike,
  cases: ReadonlySet<number> | ReadonlyMap<number, CaseLike>,
  accepts: (id: number) => boolean = () => true,
): NonNullable<LoadCase['includes']> {
  return sumCombinationFactors((c.includes ?? []).filter(({ caseId }) => cases.has(caseId) && accepts(caseId)))
    .filter(({ factor }) => factor !== 0);
}

function caseSources(
  authored: ReadonlyMap<number, readonly Load[]>,
  byId: ReadonlyMap<number, CaseLike>,
  looped: ReadonlySet<number>,
  inScope: (id: number) => boolean,
  opts: { include?: (id: number) => boolean; generateNotionals?: boolean },
): AccountingCaseSources {
  const targets = new Set([...byId.keys(), ...authored.keys()].filter(inScope));
  const required = new Set(targets);
  const cases = new Map<number, { ratio: number; includes: ReturnType<typeof includedCases> }>();
  for (const id of required) {
    const c = byId.get(id);
    if (!c) continue;
    const active = !looped.has(id);
    const includes = active ? includedCases(c, byId, opts.include) : [];
    cases.set(id, { ratio: ratioOf(c), includes });
    for (const inc of includes) required.add(inc.caseId);
    if (active && opts.generateNotionals && c.notional) required.add(c.notional.sourceCaseId);
  }
  return {
    authored: new Map([...authored].map(([id, loads]) => [id, loads.map(copyAccountingLoad)])),
    generated: new Map(),
    cases,
    targets,
  };
}

type SingleCase = CaseLike & Pick<LoadCase, 'reference' | 'solve' | 'spectral'>;

/**
 * The rule of a solve of every load at once, without combinations, case by case: what each case
 * listed among the results (`combination-methods.ts` `listed`) brings to it, as the cases whose
 * own loads and self-weight rows it brings, each times a factor.
 *
 *   each listed case     its own loads once, reduced where a reduction applies;
 *   a composite case     what it takes in from a listed case is there already, that case's own,
 *                        once; it brings its own loads and what it takes in from a case not
 *                        listed (a reference case, one not solved alone), times the factor, and
 *                        what that one takes in from others by the same rule;
 *   not listed           out, unless a composite case takes it in: it is only for the cases that
 *                        take it in, and the results list it nowhere else;
 *   notional loads       a fraction of other cases' gravity, which only a combination states: not
 *                        worked out. The notional case's own loads, if any, are in.
 *
 * Everything that reads the single solve (its statics check, the load at a joint for the active
 * result set, PRO's "All loads" after a solve with combinations) reads it through here.
 */
function singleSolveTerms(sources: AccountingCaseSources): Map<number, Array<{ caseId: number; factor: number }>> {
  const out = new Map<number, Array<{ caseId: number; factor: number }>>();
  for (const id of sources.targets) {
    if (!sources.cases.has(id)) continue;
    const terms: Array<{ caseId: number; factor: number }> = [];
    const take = (caseId: number, factor: number) => {
      terms.push({ caseId, factor });
      for (const inc of sources.cases.get(caseId)!.includes) take(inc.caseId, factor * inc.factor);
    };
    take(id, 1);
    out.set(id, terms);
  }
  return out;
}

/**
 * The model for the single solve (`singleSolveTerms`): its loads and stated self-weight rows
 * written out by the rule. The older self-weight switch is the solve's own, once, whatever the
 * cases (`self-weight.ts` `selfWeightFor` with no case). With every case listed and no reduction
 * applied, the model is returned as it is.
 */
export function singleSolveModel<M extends ModelData>(model: M, cases: readonly SingleCase[]): M {
  if (cases.every((c) => listed(c) && !reductionApplies(c))) return model;
  const byId = new Map(cases.map((c) => [c.id, c]));
  const own = loadCaseBatches(model.loads);
  const isListed = (id: number) => !byId.has(id) || listed(byId.get(id)!);
  const sources = caseSources(own, byId, caseOrder(cases).looped, isListed, { include: id => !isListed(id) });
  const stated = model.analysis?.selfWeight;
  let nextId = Math.max(0, ...model.loads.map((l) => l.data.id)) + 1;
  // Loads, and rows, of a case id the model has no case for are kept as they are.
  const loads: Load[] = model.loads.filter((l) => !byId.has(l.data.caseId ?? 1));
  const rows: SelfWeightLoad[] = (stated ?? []).filter((r) => !byId.has(r.caseId));
  for (const [as, terms] of singleSolveTerms(sources)) {
    for (const { caseId, factor } of terms) {
      const k = factor * sources.cases.get(caseId)!.ratio;
      for (const l of own.get(caseId) ?? []) {
        if (k === 1 && caseId === as) { loads.push(l); continue; }
        const s = scaleCaseLoad(l, k);
        loads.push(withAccountingOrigin({ ...s, data: { ...s.data, id: nextId++, caseId: as } } as Load, l));
      }
      for (const r of stated ?? []) if (r.caseId === caseId) rows.push({ ...r, caseId: as, factor: r.factor * factor });
    }
  }
  return { ...model, [accountingCaseSources]: { ...sources, single: true }, loads, ...(stated ? { analysis: { ...model.analysis, selfWeight: rows } } : {}) };
}

/**
 * The single solve as factors on the cases solved one by one (each listed case as solved,
 * `withCaseEffects`), for a linear model whose per-case results are on hand: PRO's "All loads"
 * after a solve with combinations, which summed every listed case at 1 and so counted a
 * composite case's parts twice. A listed case enters at 1, less what each listed composite case
 * takes in from it, directly or through cases not listed; what a composite case takes from a
 * case not listed stays in through the composite's own result.
 *
 * Null where no such factors give the single solve: a notional case (its loads are in its result,
 * and not in the single solve), or the older self-weight switch (`legacySelfWeight`) with the
 * weight on other than one case's worth (on every dead-load case of a combination solve, once in
 * the single solve). The caller then solves the single solve itself.
 */
export function singleSolveFactors(cases: readonly SingleCase[], opts: { legacySelfWeight: boolean }): Map<number, number> | null {
  const byId = new Map(cases.map((c) => [c.id, c]));
  const { looped } = caseOrder(cases);
  if (cases.some((c) => c.notional && !looped.has(c.id) && byId.has(c.notional.sourceCaseId))) return null;
  const terms = cases.filter(listed).map(({ id }) => ({ caseId: id, factor: 1 }));
  const includes = new Map<number, ReturnType<typeof includedCases>>();
  const includesOf = (id: number) => {
    const cached = includes.get(id);
    if (cached) return cached;
    const resolved = looped.has(id) ? [] : includedCases(byId.get(id)!, byId);
    includes.set(id, resolved);
    return resolved;
  };
  // What a case's result holds besides what it brings to the single solve, on listed results.
  const lessOf = (id: number, k: number) => {
    for (const inc of includesOf(id)) {
      const part = byId.get(inc.caseId)!;
      if (listed(part)) terms.push({ caseId: part.id, factor: -k * inc.factor });
      else lessOf(part.id, k * inc.factor);
    }
  };
  for (const c of cases) if (listed(c)) lessOf(c.id, 1);
  const factors = new Map(sumCombinationFactors(terms).map(({ caseId, factor }) => [caseId, factor]));
  if (opts.legacySelfWeight) {
    // The weight each result holds: a dead-load case's own, and what a composite takes in.
    const weight = new Map<number, number>();
    const weightOf = (id: number): number => {
      if (weight.has(id)) return weight.get(id)!;
      const c = byId.get(id)!;
      let w = c.type === 'D' && !isCompositeCase(c) ? 1 : 0;
      for (const inc of includesOf(id)) w += inc.factor * weightOf(inc.caseId);
      weight.set(id, w);
      return w;
    };
    const total = [...factors].reduce((s, [id, k]) => s + k * weightOf(id), 0);
    if (Math.abs(total - 1) > 1e-9) return null;
  }
  // A spectral case is no load of the single solve: its result is a response, signed by its
  // dominant mode, that only a combination takes (`spectral-case.ts`). At 1 it was in "All loads".
  for (const c of cases) if (c.spectral) factors.set(c.id, 0);
  return factors;
}
