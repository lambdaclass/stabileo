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
 * 101-2025 did).
 *
 * ── The rule ─────────────────────────────────────────────────────
 *
 * Permanent and gravity symbols (D, L, Lr, S, R, F, H, T) sum all their cases: two dead-load
 * cases are both always there. Directional symbols (W, E) are alternatives: each case of the
 * symbol gets a combination of its own, never alongside another case of the same symbol.
 */
import type { LoadCombinationSpec, LoadSymbol, CombinationInputs } from '../../codes/cirsoc101/combinations';

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
