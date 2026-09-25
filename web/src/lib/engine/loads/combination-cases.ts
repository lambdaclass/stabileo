/**
 * Combinations written in load symbols (1,2 D + 1,0 W + L), onto the model's load cases.
 *
 * ── What was wrong ────────────────────────────────────────────────
 *
 * Two generators did this, and both mishandled a symbol with several cases. The regulation
 * dialog gave every case of a symbol the term's factor, so "1,2 D + 1,0 W + L" came out with
 * the X and Y wind cases in the same combination — wind blowing both ways at once. The Loads
 * tab had its own table instead, labelled ASCE 7-22 and carrying 1,6 W, which is not what
 * ASCE 7-22 prints either (it moved to 1,0 W with strength-level wind speeds, as CIRSOC
 * 101-2025 did). 1,6 W stays available, stated as what it is: the factor for service-level
 * wind (`withWindBasis`), not a silent default of an unnamed table.
 *
 * ── The rule ─────────────────────────────────────────────────────
 *
 * Permanent and gravity symbols (D, L, Lr, S, R, F, H, T) sum all their cases: two dead-load
 * cases are both always there. Directional symbols (W, E) are alternatives: each case of the
 * symbol gets a combination of its own, never alongside another case of the same symbol.
 */
import type { LoadCombinationSpec, LoadSymbol, CombinationInputs, CombinationTerm } from '../../codes/cirsoc101/combinations';

/** Symbols whose cases are alternatives (one direction at a time), not summands. */
const ALTERNATIVE: ReadonlySet<LoadSymbol> = new Set(['W', 'E']);

const SYMBOLS: readonly LoadSymbol[] = ['D', 'L', 'Lr', 'S', 'R', 'W', 'E', 'F', 'H', 'T'];

/** The symbol a load case type stands for, case-insensitively ('LR' is Lr). */
export function symbolOfType(type: string | undefined): LoadSymbol | null {
  const u = (type ?? '').toUpperCase();
  return SYMBOLS.find((s) => s.toUpperCase() === u) ?? null;
}

export interface CaseCombination {
  /** The spec's label, with the alternative case named when there is more than one. */
  name: string;
  factors: Array<{ caseId: number; factor: number }>;
  purpose: 'strength' | 'service';
  /** The spec it came from. */
  specId: string;
}

/** Which load symbols the model has cases for. */
export function presentSymbols(cases: ReadonlyArray<{ type?: string }>): CombinationInputs['present'] {
  const has = (s: LoadSymbol) => cases.some((c) => symbolOfType(c.type) === s);
  return { L: has('L'), Lr: has('Lr'), S: has('S'), R: has('R'), W: has('W'), E: has('E'), F: has('F'), H: has('H') };
}

/**
 * Expand `specs` over `cases`. A spec that names a symbol with no case is dropped, since a
 * combination missing one of its actions is not the combination the spec prints.
 */
export function expandCombinations(
  specs: readonly LoadCombinationSpec[],
  cases: ReadonlyArray<{ id: number; type?: string; name: string }>,
): CaseCombination[] {
  const bySymbol = new Map<LoadSymbol, Array<{ id: number; name: string }>>();
  for (const c of cases) {
    const s = symbolOfType(c.type);
    if (!s) continue;
    bySymbol.set(s, [...(bySymbol.get(s) ?? []), { id: c.id, name: c.name }]);
  }
  const out: CaseCombination[] = [];
  for (const spec of specs) {
    const terms = spec.terms.filter((t) => t.factor !== 0);
    if (terms.some((t) => !bySymbol.has(t.symbol))) continue;
    const alt = terms.find((t) => ALTERNATIVE.has(t.symbol));
    const choices = alt ? bySymbol.get(alt.symbol)! : [null];
    for (const choice of choices) {
      const factors: CaseCombination['factors'] = [];
      for (const t of terms) {
        const ids = t.symbol === alt?.symbol ? [choice!] : bySymbol.get(t.symbol)!;
        for (const c of ids) factors.push({ caseId: c.id, factor: t.factor });
      }
      const named = alt && choices.length > 1 && choice ? `${spec.label} (${choice.name})` : spec.label;
      out.push({ name: named, factors, purpose: spec.purpose ?? 'strength', specId: spec.id });
    }
  }
  return out;
}

/**
 * Where the wind cases' loads came from, which decides W's factor in the strength combinations.
 *
 * CIRSOC 101-2025 prints 1,0 W and 0,5 W: it is written for wind from CIRSOC 102-2025, the one
 * this app's regulation generator applies. A wind case the user entered by hand may have been
 * computed with service-level speeds, the basis CIRSOC 101-2005 combined at 1,6 W and 0,8 W.
 * Multiplying 2025's wind factors by 1,6 gives exactly 2005's (1,0 → 1,6 and 0,5 → 0,8), so that
 * reading is the same combinations with W scaled, not a second table.
 */
export type WindBasis = 'service' | 'strength';

/** 1,6 for service-level wind, 1 for wind from CIRSOC 102-2025. */
export const WIND_SCALE: Readonly<Record<WindBasis, number>> = { service: 1.6, strength: 1 };

const labelOf = (terms: readonly CombinationTerm[]) =>
  terms.filter((t) => t.factor !== 0).map((t) => `${t.factor.toFixed(1)} ${t.symbol}`).join(' + ');

/** The strength combinations with W scaled for `basis`. Service combinations are left as they are. */
export function withWindBasis(specs: readonly LoadCombinationSpec[], basis: WindBasis): LoadCombinationSpec[] {
  const k = WIND_SCALE[basis];
  if (k === 1) return [...specs];
  return specs.map((s) => {
    if (s.purpose === 'service' || !s.terms.some((t) => t.symbol === 'W')) return s;
    const terms = s.terms.map((t) => (t.symbol === 'W' ? { ...t, factor: Math.round(t.factor * k * 100) / 100 } : t));
    return { ...s, terms, label: labelOf(terms) };
  });
}
