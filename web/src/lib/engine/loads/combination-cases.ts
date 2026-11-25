/**
 * Combinations written in load symbols (1,2 D + 1,0 W + L), onto the model's load cases.
 *
 * ── What was wrong ────────────────────────────────────────────────
 *
 * Two generators did this, and both mishandled a symbol with several cases. The regulation
 * dialog gave every case of a symbol the term's factor, so "1,2 D + 1,0 W + L" came out with
 * the X and Y wind cases in the same combination — wind blowing both ways at once. The Loads
 * tab had its own table instead, labelled ASCE 7-22 and carrying 1,6 W, which is the 2005 factor
 * for wind from service-level speeds. CIRSOC 102-2025 computes W from the basic speed of the
 * risk category and combines it at 1,0 W and 0,5 W for strength (Apéndice B.3.2); the service
 * combinations are other ones (B.4.2). W is one action, and the combination decides the state.
 *
 * ── The rule ─────────────────────────────────────────────────────
 *
 * Permanent and gravity symbols (D, L, Lr, S, R, F, H, T) sum all their cases: two dead-load
 * cases are both always there — except cases that share an `alternatives` group, which are
 * patterns of one action (the balanced and unbalanced snow of one roof) and enter one at a
 * time. Directional symbols (W, E) are alternatives: each case of the symbol gets a
 * combination of its own, never alongside another case of the same symbol.
 *
 * ── Patterns of partial loading ──────────────────────────────────
 *
 * A case marked `pattern` (a checkerboard or the spans each side of a grid line of CIRSOC 101
 * §4.3.3, a partial snow load of CIRSOC 104 Cap. 5) is an arrangement of its group's action over
 * part of the structure. It enters the combinations where that action is the principal one,
 * the term with the largest factor among the variable actions; as a companion the action enters
 * whole. That is the usual reading, and what keeps two patterned actions in one rule from
 * multiplying their arrangements: 1,2 D + 1,6 L + 0,5 Lr arranges L, 1,2 D + 1,6 Lr + L
 * arranges Lr. `patternsInCompanions` arranges every term instead.
 *
 * A rule can tie: the service D + L + Lr, or 1,2 D + 1,0 W + f1 L + 0,5 Lr with f1 = 1,0. Its
 * principal is then any of the tied actions, and the rule is expanded once for each tied action
 * that has arrangements, that one varying and the others whole, as if each were the principal in
 * turn; the combinations two choices share (every action whole) are kept once. Varying every tied
 * action together multiplied their arrangements, which no reading of the rule asks for, and
 * picking one of them would leave out the arrangements of the other.
 *
 * ── Both senses ──────────────────────────────────────────────────
 *
 * Wind and earthquake act either way along a direction, and a case holds one of the two. With
 * `bothSenses`, each case of W or E also enters with the opposite sign (−1,0 E beside +1,0 E),
 * which for a linear analysis is the case reversed, without a second solve. It is exact for the
 * cases the regulation generator makes (the same forces on every node of a level, mirrored),
 * and a statement about any case loaded by hand, which the option says where it is offered.
 */
import { isCombinationGroup } from './combination-rules';
import type { AnalysisSettings } from '../analysis-settings';
import { EngineMessageError, msg } from '../../codes/message';
import type { LoadCombinationSpec, LoadSymbol, CombinationInputs } from '../../codes/cirsoc101/combinations';

/** Symbols whose cases are alternatives (one direction at a time), not summands. */
type DirectionalSymbol = 'W' | 'Wa' | 'E';

function isDirectional(symbol: LoadSymbol): symbol is DirectionalSymbol {
  return symbol === 'W' || symbol === 'Wa' || symbol === 'E';
}

const SYMBOLS: readonly LoadSymbol[] = ['D', 'L', 'Lr', 'S', 'R', 'W', 'Wa', 'E', 'F', 'H', 'T', 'M', 'A', 'I'];

/**
 * Types that combine as another symbol: a crane's and a vehicle's loads are imposed loads (L) in
 * the combinations, with their own category for design. Mass (M), accidental (A) and ice (I)
 * cases are symbols of their own that no code rule names, so the automatic combinations leave
 * them out and a project's rules take them in. Notional (N) cases have no symbol: they are added
 * on request, with their source's factor (`notional-combinations.ts`).
 */
const COMBINES_AS: Readonly<Record<string, LoadSymbol>> = { CR: 'L', TR: 'L' };

/** The symbol a load case type stands for, case-insensitively ('LR' is Lr). */
export function symbolOfType(type: string | undefined): LoadSymbol | null {
  const u = (type ?? '').toUpperCase();
  return SYMBOLS.find((s) => s.toUpperCase() === u) ?? COMBINES_AS[u] ?? null;
}

/**
 * A case made of others (`LoadCase.includes`, `engine/case-effects.ts`): the sum it stands for,
 * not an action of its type. Typed D, a composite of 1,2 D + 1,6 L was taken again as a dead
 * load wherever cases are picked by type: in "1,4 D" beside the D it already holds, in a mass
 * rule's D, in the older self-weight switch's dead-load cases.
 */
export function isCompositeCase(c: { includes?: ReadonlyArray<unknown> }): boolean {
  return (c.includes?.length ?? 0) > 0;
}

/** The symbol a case combines as: its type's, and none for a composite case. */
export function symbolOfCase(c: { type?: string; includes?: ReadonlyArray<unknown> }): LoadSymbol | null {
  return isCompositeCase(c) ? null : symbolOfType(c.type);
}

export interface CaseCombination {
  /** The spec's label, with the alternative case named when there is more than one. */
  name: string;
  factors: Array<{ caseId: number; factor: number }>;
  purpose: 'strength' | 'service';
  /** The spec it came from. */
  specId: string;
  /** The code that wrote the spec, when it was a code's (`codes/families/origin.ts`). */
  origin?: import('../../codes/families/origin').CombinationOrigin;
}

/** Which load symbols the model has cases for. */
export function presentSymbols(cases: readonly CombinationSymbolCase[]): CombinationInputs['present'] {
  const has = (s: LoadSymbol) => cases.some((c) => combinationSymbol(c) === s);
  return { L: has('L'), Lr: has('Lr'), S: has('S'), R: has('R'), W: has('W'), E: has('E'), F: has('F'), H: has('H'), Wa: has('Wa'), T: has('T') };
}

/**
 * Expand `specs` over `cases`. A spec that names a symbol with no case is dropped, since a
 * combination missing one of its actions is not the combination the spec prints.
 */
export interface ExpandOptions {
  /** Symbols whose cases also enter with the opposite sign. */
  bothSenses?: Partial<Record<'W' | 'E', boolean>>;
  /**
   * Which wind cases the reversed sign is exact for (`store/wind-reversal.ts`). A wind case is
   * a pressure pattern: horizontal forces reverse with the wind, roof suction does not — times
   * −1 it becomes pressure the code never prescribes. Absent: every case of a reversed symbol.
   */
  reversible?: (caseId: number) => boolean;
  /** Patterns also in the terms where their action is a companion (see the header). */
  patternsInCompanions?: boolean;
  retainedCases?: readonly CombinationCase[];
}

/** Actions that vary: the ones a rule has a principal among. D, F and H are permanent. */
const VARIABLE: ReadonlySet<LoadSymbol> = new Set(['L', 'Lr', 'S', 'R', 'W', 'Wa', 'E', 'T', 'A', 'I']);

function hasSeismicProvenance(spec: LoadCombinationSpec): boolean {
  return spec.basic === 5 || spec.terms.some(t => t.symbol === 'E') || !!spec.notes?.some(n =>
    n.key === 'loads.cirsoc101.note.seismicCompanions'
    || (n.key === 'loads.cirsoc101.note.notActing' && typeof n.params?.loads === 'string'
      && n.params.loads.split(',').some(s => s.trim() === 'E')));
}

export interface CombinationCase {
  id: number;
  type?: string;
  name: string;
  group?: string;
  alternatives?: string;
  pattern?: boolean;
  includes?: ReadonlyArray<unknown>;
  snowBasis?: 'flatRoof';
  autoLoadsRetired?: true;
}

type CombinationSymbolCase = Pick<CombinationCase, 'type' | 'includes' | 'autoLoadsRetired'>;

type DirectEffectsModel<C> = {
  loadCases: readonly C[];
  loads: ReadonlyArray<{ data: { caseId?: unknown } & Record<string, unknown> }>;
  analysis?: Pick<AnalysisSettings, 'selfWeight'>;
};

export function loadCasesWithDirectEffects({
  loadCases, loads, analysis,
}: DirectEffectsModel<{ id: number; spectral?: unknown; notional?: unknown }>): Set<number> {
  const ids = new Set([
    ...(analysis?.selfWeight ?? []).map(row => row.caseId),
    ...loadCases.filter(c => c.spectral !== undefined || c.notional !== undefined).map(c => c.id),
  ]);
  for (const { data } of loads) {
    if (data.caseId == null) ids.add(1);
    else if (typeof data.caseId === 'number') ids.add(data.caseId);
  }
  return ids;
}

export function eligibleCombinationCase<C extends { autoLoadsRetired?: true }>(c: C, hasDirectEffects = false): Omit<C, 'autoLoadsRetired'> | undefined {
  if (c.autoLoadsRetired !== true) return c;
  if (hasDirectEffects) return { ...c, autoLoadsRetired: undefined };
  return undefined;
}

export function modelCombinationCases<C extends CombinationCase & { spectral?: unknown; notional?: unknown }>(
  model: DirectEffectsModel<C>,
): readonly Omit<C, 'autoLoadsRetired'>[] {
  if (!model.loadCases.some(c => c.autoLoadsRetired === true)) return model.loadCases;
  const occupied = loadCasesWithDirectEffects(model);
  return model.loadCases.flatMap(c => {
    const eligible = eligibleCombinationCase(c, occupied.has(c.id));
    return eligible ? [eligible] : [];
  });
}

function combinationSymbol(c: CombinationSymbolCase): LoadSymbol | null {
  const eligible = eligibleCombinationCase(c);
  return eligible ? symbolOfCase(eligible) : null;
}

function casesBySymbol(cases: readonly CombinationCase[]): Map<LoadSymbol, CombinationCase[]> {
  const bySymbol = new Map<LoadSymbol, CombinationCase[]>();
  for (const c of cases) {
    const symbol = combinationSymbol(c);
    if (!symbol) continue;
    const matching = bySymbol.get(symbol);
    if (matching) matching.push(c);
    else bySymbol.set(symbol, [c]);
  }
  return bySymbol;
}

export function symbolsByAlternativeSet(
  cases: readonly Pick<CombinationCase, 'type' | 'includes' | 'alternatives'>[],
): Map<string, Set<LoadSymbol>> {
  const sets = new Map<string, Set<LoadSymbol>>();
  for (const c of cases) {
    const symbol = symbolOfCase(c);
    if (!c.alternatives || !symbol) continue;
    const symbols = sets.get(c.alternatives) ?? new Set<LoadSymbol>();
    symbols.add(symbol);
    sets.set(c.alternatives, symbols);
  }
  return sets;
}

type CasePick = { factors: CaseCombination['factors']; label: string; direction?: DirectionalSymbol };
type CaseChoice = { loadCase: CombinationCase; symbol: LoadSymbol; factors: number[]; allowPattern: boolean };
type ChoiceKind = { kind: 'direction'; direction: DirectionalSymbol } | { kind: 'alternatives'; set: string };
type ChoiceSlot = ChoiceKind & { choices: Map<number, CaseChoice> };
type PickSlot = (ChoiceKind | { kind: 'plain' }) & { picks: CasePick[] };

function choicePicks({ choices, kind }: ChoiceSlot, opts: ExpandOptions): CasePick[] {
  const candidates = [...choices.values()];
  const wholeSymbols = new Set(candidates.filter(({ loadCase }) => !loadCase.pattern).map(({ symbol }) => symbol));
  const eligible = candidates.filter(({ loadCase, symbol, allowPattern }) =>
    !loadCase.pattern || allowPattern || isDirectional(symbol) || !wholeSymbols.has(symbol));
  const picks = eligible.flatMap(({ loadCase, symbol, factors }) => {
    const direction = isDirectional(symbol) ? symbol : undefined;
    const reverse = (direction === 'W' || direction === 'E') && opts.bothSenses?.[direction];
    const reversible = reverse && (direction !== 'W' || !opts.reversible || opts.reversible(loadCase.id));
    const senses = reversible ? [1, -1] : [1];
    return senses.map(sense => ({
      factors: factors.map(factor => ({ caseId: loadCase.id, factor: sense * factor })),
      label: `${reversible ? (sense > 0 ? '+' : '−') : ''}${loadCase.name}`,
      direction,
    }));
  });
  return picks.length === 1 && (kind === 'direction' || eligible[0]?.loadCase.snowBasis !== 'flatRoof')
    ? [{ ...picks[0]!, label: '' }]
    : picks;
}

function combineChoiceSlots(slots: readonly PickSlot[], rule: string): CasePick[][] {
  const directionSlots = new Map<DirectionalSymbol, number>();
  for (const slot of slots) {
    for (const direction of new Set(slot.picks.map(pick => pick.direction))) {
      if (direction) directionSlots.set(direction, (directionSlots.get(direction) ?? 0) + 1);
    }
  }
  let selections: { picks: CasePick[]; omitted: DirectionalSymbol[] }[] = [{ picks: [], omitted: [] }];
  for (const slot of slots) {
    const substitute = slot.kind === 'direction' && (directionSlots.get(slot.direction) ?? 0) > 1
      ? slot.direction : undefined;
    selections = selections.flatMap(({ picks, omitted }) => {
      const choices = slot.picks.filter(pick => !pick.direction || !picks.some(p => p.direction === pick.direction))
        .map(pick => ({ picks: [...picks, pick], omitted }));
      return substitute ? [...choices, { picks, omitted: [...omitted, substitute] }] : choices;
    });
  }
  const complete = selections.filter(({ picks, omitted }) => omitted.every(direction => picks.some(pick => pick.direction === direction)))
    .map(({ picks }) => picks);
  const required = slots.filter(slot => slot.kind === 'alternatives');
  if (required.length === 0) return complete;
  const covered = new Set<CasePick>();
  for (const picks of complete) for (const pick of picks) covered.add(pick);
  for (const slot of required) {
    if (complete.length === 0 || slot.picks.some(pick => !covered.has(pick))) {
      throw new EngineMessageError(msg('combos.refused.alternativeSet', { rule, set: slot.set }));
    }
  }
  return complete;
}

export function expandCombinations(
  specs: readonly LoadCombinationSpec[],
  cases: readonly CombinationCase[],
  opts: ExpandOptions = {},
): CaseCombination[] {
  const bySymbol = casesBySymbol(cases);
  const retainedBySymbol = casesBySymbol(opts.retainedCases ?? []);
  const out: CaseCombination[] = [];
  for (const spec of specs) {
    const unresolvedGroup = (symbol: LoadSymbol, group: unknown) =>
      new EngineMessageError(msg('combos.refused.unresolvedGroup', { symbol, group: typeof group === 'string' ? group : '—' }));
    const namedGroups = new Map<LoadSymbol, Set<string>>();
    for (const t of spec.terms) {
      if (t.group === undefined) continue;
      if (!isCombinationGroup(t.group)) throw unresolvedGroup(t.symbol, t.group);
      const groups = namedGroups.get(t.symbol) ?? new Set<string>();
      groups.add(t.group);
      namedGroups.set(t.symbol, groups);
    }
    const availableBySymbol = new Map(bySymbol);
    for (const symbol of namedGroups.keys()) {
      const retained = retainedBySymbol.get(symbol);
      if (retained) availableBySymbol.set(symbol, [...(bySymbol.get(symbol) ?? []), ...retained]);
    }
    const activeTerms = spec.terms.filter((t) => t.factor !== 0);
    const legacyFlatRoof = spec.notes?.some(n => n.key === 'loads.cirsoc101.note.snowAsFlatRoof');
    const seismic = hasSeismicProvenance(spec);
    const selected = new Map(activeTerms.map(t => {
      if (t.snowBasis && t.symbol !== 'S') throw new EngineMessageError(msg('snow.refused.flatRoofCase'));
      if (t.symbol === 'S' && !t.snowBasis && legacyFlatRoof && seismic) throw new EngineMessageError(msg('snow.refused.legacyCombination'));
      const available = availableBySymbol.get(t.symbol) ?? [];
      const named = namedGroups.get(t.symbol);
      const all = t.group === undefined
        ? available.filter(c => c.group === undefined || !named?.has(c.group))
        : available.filter(c => c.group === t.group);
      if (t.group !== undefined && all.length === 0) throw unresolvedGroup(t.symbol, t.group);
      const basis = t.snowBasis ?? (t.symbol === 'S' && legacyFlatRoof ? 'flatRoof' : undefined);
      const matching = all.filter(c => t.symbol !== 'S' || c.snowBasis === basis);
      const missingSnowCase = basis === 'flatRoof' ? msg('snow.refused.flatRoofCase') : msg('snow.refused.physicalCase');
      if (t.symbol === 'S') {
        const counterparts = all.filter(c => c.snowBasis !== basis);
        const ungroupedPair = counterparts.filter(c => !c.alternatives).length === 1
          && matching.filter(c => !c.alternatives).length === 1;
        const covered = (c: CombinationCase) => c.alternatives
          ? matching.some(m => m.alternatives === c.alternatives)
          : ungroupedPair;
        if (counterparts.some(c => !covered(c))) throw new EngineMessageError(missingSnowCase);
      }
      if ((basis === 'flatRoof' || all.length > 0) && !matching.length) throw new EngineMessageError(missingSnowCase);
      return [t, matching] as const;
    }));
    const casesFor = (t: (typeof activeTerms)[number]) => selected.get(t)!;
    const terms = activeTerms.filter(t => casesFor(t).length > 0);
    if (activeTerms.some(t => !availableBySymbol.has(t.symbol))) continue;
    const principal = Math.max(0, ...terms.filter((t) => VARIABLE.has(t.symbol)).map((t) => Math.abs(t.factor)));
    const arranged = (t: (typeof terms)[number]) => !isDirectional(t.symbol) && casesFor(t).some((c) => c.pattern);
    const tied = terms.flatMap((t, i) => (VARIABLE.has(t.symbol) && Math.abs(t.factor) >= principal - 1e-9 && arranged(t) ? [i] : []));
    const alternativeSymbols = symbolsByAlternativeSet(terms.flatMap(casesFor));
    const slotsFor = (varying: number | null): PickSlot[] => {
      const slots: Array<PickSlot | ChoiceSlot> = [];
      const slotsByAction = new Map<string, ChoiceSlot>();
      terms.forEach((t, i) => {
        const direction = isDirectional(t.symbol) ? t.symbol : undefined;
        const all = casesFor(t);
        const plain = direction ? [] : all.filter(c => !c.alternatives);
        if (plain.length > 0) {
          slots.push({ kind: 'plain', picks: [{ factors: plain.map(c => ({ caseId: c.id, factor: t.factor })), label: '' }] });
        }
        for (const c of all) {
          const set = c.alternatives || undefined;
          const kind: ChoiceKind | undefined = direction && (!set || alternativeSymbols.get(set)?.size === 1)
            ? { kind: 'direction', direction }
            : set ? { kind: 'alternatives', set } : undefined;
          if (!kind) continue;
          const key = kind.kind === 'direction' ? `direction:${kind.direction}` : `alternatives:${kind.set}`;
          let slot = slotsByAction.get(key);
          if (!slot) {
            slot = { ...kind, choices: new Map() };
            slotsByAction.set(key, slot);
            slots.push(slot);
          }
          let choice = slot.choices.get(c.id);
          if (!choice) {
            choice = { loadCase: c, symbol: t.symbol, factors: [], allowPattern: false };
            slot.choices.set(c.id, choice);
          }
          choice.factors.push(t.factor);
          choice.allowPattern ||= opts.patternsInCompanions === true || i === varying;
        }
      });
      return slots.map(slot => 'choices' in slot ? { ...slot, picks: choicePicks(slot, opts) } : slot);
    };
    const missingDirections = new Map(terms.filter(t => isDirectional(t.symbol))
      .flatMap(t => casesFor(t).map(c => [c.id, c.name] as const)));
    const seen = new Set<string>();
    for (const varying of opts.patternsInCompanions || tied.length === 0 ? [null] : tied) {
      for (const chosen of combineChoiceSlots(slotsFor(varying), spec.label)) {
        const factors = chosen.flatMap(p => p.factors);
        const key = factors.map((f) => `${f.caseId}:${f.factor}`).sort().join(' ');
        if (seen.has(key)) continue;
        seen.add(key);
        for (const { caseId } of factors) missingDirections.delete(caseId);
        const which = chosen.map((p) => p.label).filter(Boolean).join(', ');
        out.push({ name: which ? `${spec.label} (${which})` : spec.label, factors, purpose: spec.purpose ?? 'strength', specId: spec.id, ...(spec.origin ? { origin: spec.origin } : {}) });
      }
    }
    const omittedCase = missingDirections.values().next().value;
    if (omittedCase !== undefined) {
      throw new EngineMessageError(msg('combos.refused.directionalCase', { rule: spec.label, case: omittedCase }));
    }
  }
  return out;
}
