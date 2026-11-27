import { deferred } from '../../code-profiles/deferred';
import { combinationLabel, type CombinationInputs, type CombinationTerm, type LoadCombinationSpec, type LoadSymbol } from '../cirsoc101/combinations';
import type { ClauseRef } from '../regulation';
import { msg, type EngineMessage } from '../message';
import type { ActionCategory } from '../families/origin';
import { EN1990, EN1991_1_1, type EcFamily } from './refs';
import { loadsProfile } from '../../code-profiles/registry';
import { generatedCombinationsOf, symbolsOf } from '../../code-profiles/adapters/combinations';
import { roofPartOf, type EcPlanContext, type ImposedCategory } from './context';

export type Psi = readonly [number, number, number];

const PROFILE: Readonly<Record<EcFamily, string>> = { eurocode: 'en-1990-1991', uk: 'en-1990-1991-uk' };
const data = deferred(() => ({
  eurocode: generatedCombinationsOf(loadsProfile(PROFILE.eurocode)),
  uk: generatedCombinationsOf(loadsProfile(PROFILE.uk)),
}));

const IMPOSED_CATEGORIES: readonly ImposedCategory[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

function psiOf(family: EcFamily) {
  const t = data()[family].psi;
  return {
    imposed: Object.fromEntries(IMPOSED_CATEGORIES.map((c) => [c, t[c]!])) as Record<ImposedCategory, Psi>,
    snowLow: t.snowLow!, snowHigh: t.snowHigh!, wind: t.wind!, thermal: t.thermal!,
  };
}

export const psiFactors = deferred(() => ({ eurocode: psiOf('eurocode'), uk: psiOf('uk') }));
export const gammaFactors = (family: EcFamily) => data()[family].gamma;
export const xiFactor = (family: EcFamily) => data()[family].xi;
export const SNOW_ALTITUDE_LIMIT_M = 1000;

export const actionCategories = deferred((): Readonly<Record<string, ActionCategory>> => Object.freeze(symbolsOf(loadsProfile(PROFILE.eurocode))));

type Variable = 'L' | 'Lr' | 'S' | 'W' | 'T';
const VARIABLES: readonly Variable[] = ['L', 'Lr', 'S', 'W', 'T'];

export interface PsiSet { L: Psi; Lr: Psi; S: Psi; W: Psi; T: Psi }

/**
 * The ψ of each variable action. L is the floors' category's (Table A1.1 gives ψ by category);
 * a roof of another category is a part of its own (`roofPart`), at its category's ψ. With no
 * floor category known, the largest of the categories present.
 */
export function psiSet(family: EcFamily, categories: ReadonlySet<ImposedCategory>, snowAltitudeM?: number, floor?: ImposedCategory): PsiSet {
  const p = psiFactors()[family];
  const cats = categories.size ? [...categories] : (['A'] as ImposedCategory[]);
  const L = floor && floor !== 'H' ? p.imposed[floor]
    : [0, 1, 2].map((k) => Math.max(...cats.filter((c) => c !== 'H').map((c) => p.imposed[c][k]!), 0)) as unknown as Psi;
  return { L, Lr: p.imposed.H, S: (snowAltitudeM ?? 0) > SNOW_ALTITUDE_LIMIT_M ? p.snowHigh : p.snowLow, W: p.wind, T: p.thermal };
}

const compatibleIn = (family: EcFamily) => (s: readonly Variable[]) =>
  !data()[family].exclusive.some((pair) => pair.every((v) => s.includes(v as Variable)));

function subsets<T>(xs: readonly T[]): T[][] {
  return xs.reduce<T[][]>((acc, x) => [...acc, ...acc.map((s) => [...s, x])], [[]]);
}

function companionSets(family: EcFamily, all: readonly Variable[], notActing: boolean): Variable[][] {
  const ok = subsets(all).filter(compatibleIn(family));
  if (notActing) return ok;
  return ok.filter((s) => !ok.some((o) => o.length > s.length && s.every((x) => o.includes(x))));
}

interface Builder { out: LoadCombinationSpec[]; seen: Set<string>; refs: ClauseRef[] }

function push(b: Builder, id: string, terms: CombinationTerm[], purpose: 'strength' | 'service', notes: EngineMessage[] = []) {
  const t = terms.filter((x) => Math.abs(x.factor) > 1e-12).map((x) => ({ ...x, factor: Math.round(x.factor * 1e6) / 1e6 }));
  const label = combinationLabel(t);
  if (b.seen.has(`${purpose}:${label}`)) return;
  b.seen.add(`${purpose}:${label}`);
  b.out.push({ id, terms: t, label, refs: b.refs, notes, purpose });
}

const permanent = (ci: CombinationInputs, g: number): CombinationTerm[] => [
  { symbol: 'D', factor: g },
  ...(ci.present.H ? [{ symbol: 'H' as LoadSymbol, factor: g }] : []),
  ...(ci.present.F ? [{ symbol: 'F' as LoadSymbol, factor: g }] : []),
];

function permanentSets(ci: CombinationInputs, sup: number, inf: number): Array<{ terms: CombinationTerm[]; tag: string }> {
  const symbols = (['D', 'H', 'F'] as const).filter((s) => s === 'D' || ci.present[s]);
  return Array.from({ length: 1 << symbols.length }, (_, m) => {
    const low = symbols.filter((_, i) => m & (1 << i));
    const tag = low.length === 0 ? '' : low.length === symbols.length ? '-inf' : `-inf${low.join('')}`;
    return { terms: symbols.map((symbol) => ({ symbol: symbol as LoadSymbol, factor: low.includes(symbol) ? inf : sup })), tag };
  });
}

function presentVariables(ci: CombinationInputs): Variable[] {
  return VARIABLES.filter((v) => (v === 'T' ? !!ci.present.T : ci.present[v]));
}

function contextFor(family: EcFamily, ctx?: EcPlanContext) {
  const roof = roofPartOf(ctx);
  const psi = psiSet(family, ctx?.categories ?? new Set(), ctx?.snowAltitudeM, ctx?.floor);
  /**
   * A variable action's terms at one ψ (0, 1, 2) or leading (ψ = 1), times γ. The imposed load
   * with a roof of another category is one action of two parts (EN 1991-1-1 §3.3.1(2)P), each at
   * its own ψ: they lead together and accompany together.
   */
  const alphaN = ctx?.alphaN ?? 1;
  const terms = (v: Variable, k: 0 | 1 | 2 | 'lead', gamma = 1): CombinationTerm[] => [
    { symbol: v as LoadSymbol, factor: gamma * (k === 'lead' ? 1 : psi[v][k] / (v === 'L' ? alphaN : 1)) },
    ...(v === 'L' && roof ? [{ symbol: 'L' as LoadSymbol, group: roof, factor: gamma * (k === 'lead' ? 1 : psiFactors()[family].imposed[roof][k]) }] : []),
  ];
  /** Whether the action enters at ψk at all: any of its parts. */
  const has = (v: Variable, k: 0 | 1 | 2) => terms(v, k).some((t) => t.factor > 0);
  return { psi, known: !!ctx?.categories.size, terms, has, roof, alphaN };
}

export function strengthCombinations(family: EcFamily, ci: CombinationInputs, ctx?: EcPlanContext): { combinations: LoadCombinationSpec[]; refs: ClauseRef[]; notes: EngineMessage[] } {
  const { known, terms, has, roof, alphaN } = contextFor(family, ctx);
  const xi = xiFactor(family), gamma = gammaFactors(family), compatible = compatibleIn(family);
  const tableRefs = [data()[family].refs.factors, data()[family].refs.psi];
  const notActing = ci.notActing ?? data()[family].notActing;
  const vars = presentVariables(ci);
  const b: Builder = { out: [], seen: new Set(), refs: [EN1990('6.4.3.2', 'eq. 6.10a and 6.10b'), ...tableRefs] };
  const withPsi0 = (vs: readonly Variable[]) => vs.filter((v) => has(v, 0));

  const permanentA = permanentSets(ci, gamma.gSup, gamma.gInf).filter((g) => g.tag !== '-inf');
  const permanentB = permanentSets(ci, xi * gamma.gSup, gamma.gInf);
  companionSets(family, withPsi0(vars), notActing).forEach((set, k) => {
    for (const g of permanentA) push(b, `6.10a-${k + 1}${g.tag}`, [...g.terms, ...set.flatMap((v) => terms(v, 0, gamma.q))], 'strength');
  });
  for (const lead of vars) {
    const others = withPsi0(vars.filter((v) => v !== lead && compatible([lead, v])));
    companionSets(family, others, notActing).forEach((set, k) => {
      const q: CombinationTerm[] = [...terms(lead, 'lead', gamma.q), ...set.flatMap((v) => terms(v, 0, gamma.q))];
      for (const g of permanentB) push(b, `6.10b-${lead}-${k + 1}${g.tag}`, [...g.terms, ...q], 'strength');
    });
  }
  if (ci.present.E) {
    b.refs = [EN1990('6.4.3.4', 'eq. 6.12b'), ...tableRefs];
    const comp = vars.filter((v) => v !== 'W' && has(v, 2));
    companionSets(family, comp, notActing).forEach((set, k) => {
      push(b, `6.12b-${k + 1}`, [...permanent(ci, 1), { symbol: 'E', factor: 1 }, ...set.flatMap((v) => terms(v, 2))], 'strength');
    });
  }
  const notes: EngineMessage[] = [msg('loads.ec.combo.set610ab', { xi })];
  if (vars.includes('Lr')) notes.push(msg('loads.ec.combo.roofAlone'));
  if (ci.present.H || ci.present.F) notes.push(msg('loads.ec.combo.hfAsPermanent'));
  if (!known) notes.push(msg('loads.ec.combo.noContext'));
  if (alphaN < 1 && vars.includes('L')) notes.push(msg('loads.ec.reduction.alphaNWithPsi', { alpha: Math.round(alphaN * 1000) / 1000 }));
  if (roof && vars.includes('L')) notes.push(msg('loads.ec.combo.roofPart', { floor: ctx?.floor ?? '—', roof }));
  const refs = [EN1990('6.4.3.2', 'eq. 6.10a and 6.10b'), ...tableRefs, ...(vars.includes('Lr') ? [EN1991_1_1('3.3.2(1)', 'roofs')] : [])];
  return { combinations: b.out, refs, notes };
}

export function serviceCombinations(family: EcFamily, ci: CombinationInputs, ctx?: EcPlanContext): LoadCombinationSpec[] {
  const { terms, has } = contextFor(family, ctx);
  const compatible = compatibleIn(family);
  const vars = presentVariables(ci);
  const notActing = ci.notActing ?? data()[family].notActing;
  const b: Builder = { out: [], seen: new Set(), refs: [EN1990('6.5.3', 'SLS combinations')] };
  for (const lead of vars) {
    const others = vars.filter((v) => v !== lead && compatible([lead, v]));
    companionSets(family, others.filter((v) => has(v, 0)), notActing).forEach((set, k) => {
      push(b, `6.14b-${lead}-${k + 1}`, [...permanent(ci, 1), ...terms(lead, 'lead'), ...set.flatMap((v) => terms(v, 0))], 'service');
    });
    if (has(lead, 1)) {
      companionSets(family, others.filter((v) => has(v, 2)), notActing).forEach((set, k) => {
        push(b, `6.15b-${lead}-${k + 1}`, [...permanent(ci, 1), ...terms(lead, 1), ...set.flatMap((v) => terms(v, 2))], 'service');
      });
    }
  }
  companionSets(family, vars.filter((v) => has(v, 2)), false).forEach((set, k) => {
    push(b, `6.16b-${k + 1}`, [...permanent(ci, 1), ...set.flatMap((v) => terms(v, 2))], 'service');
  });
  return b.out;
}
