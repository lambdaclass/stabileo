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
 * ── Both senses ──────────────────────────────────────────────────
 *
 * Wind and earthquake act either way along a direction, and a case holds one of the two. With
 * `bothSenses`, each case of W or E also enters with the opposite sign (−1,0 E beside +1,0 E),
 * which for a linear analysis is the case reversed, without a second solve. It is exact for the
 * cases the regulation generator makes (the same forces on every node of a level, mirrored),
 * and a statement about any case loaded by hand, which the option says where it is offered.
 */
import type { LoadCombinationSpec, LoadSymbol, CombinationInputs } from '../../codes/cirsoc101/combinations';

/** Symbols whose cases are alternatives (one direction at a time), not summands. */
const ALTERNATIVE: ReadonlySet<LoadSymbol> = new Set(['W', 'Wa', 'E']);

const SYMBOLS: readonly LoadSymbol[] = ['D', 'L', 'Lr', 'S', 'R', 'W', 'Wa', 'E', 'F', 'H', 'T'];

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
  return { L: has('L'), Lr: has('Lr'), S: has('S'), R: has('R'), W: has('W'), E: has('E'), F: has('F'), H: has('H'), Wa: has('Wa') };
}

/**
 * Expand `specs` over `cases`. A spec that names a symbol with no case is dropped, since a
 * combination missing one of its actions is not the combination the spec prints.
 */
export interface ExpandOptions {
  /** Symbols whose cases also enter with the opposite sign. */
  bothSenses?: Partial<Record<'W' | 'E', boolean>>;
}

export function expandCombinations(
  specs: readonly LoadCombinationSpec[],
  cases: ReadonlyArray<{ id: number; type?: string; name: string; alternatives?: string }>,
  opts: ExpandOptions = {},
): CaseCombination[] {
  type Case = { id: number; name: string; alternatives?: string };
  const bySymbol = new Map<LoadSymbol, Case[]>();
  for (const c of cases) {
    const s = symbolOfType(c.type);
    if (!s) continue;
    bySymbol.set(s, [...(bySymbol.get(s) ?? []), { id: c.id, name: c.name, alternatives: c.alternatives }]);
  }
  /** One way of taking a term: the cases it adds, their sign, and what names it. */
  type Pick = { cases: Case[]; sense: 1 | -1; label: string };
  const out: CaseCombination[] = [];
  for (const spec of specs) {
    const terms = spec.terms.filter((t) => t.factor !== 0);
    if (terms.some((t) => !bySymbol.has(t.symbol))) continue;
    /*
     * Each term offers one or more picks, and a combination takes one pick of every term.
     * A directional symbol (W, Wa, E) offers each of its cases on its own, and each sense when
     * asked. Any other symbol always adds its plain cases, and one case of each alternatives
     * group: the balanced and unbalanced snow patterns of one roof are one snow, three ways,
     * and adding them was snow three times over. A second directional symbol in the same rule
     * is taken one case at a time too; it used to sum every direction of it.
     */
    const slots: Array<{ factor: number; picks: Pick[] }> = [];
    for (const t of terms) {
      const all = bySymbol.get(t.symbol)!;
      if (ALTERNATIVE.has(t.symbol)) {
        const senses: Array<1 | -1> = opts.bothSenses?.[t.symbol as 'W' | 'E'] ? [1, -1] : [1];
        const named = all.length > 1 || senses.length > 1;
        slots.push({ factor: t.factor, picks: all.flatMap((c) => senses.map((sense) => ({
          cases: [c], sense, label: named ? `${senses.length > 1 ? (sense > 0 ? '+' : '−') : ''}${c.name}` : '',
        }))) });
        continue;
      }
      const plain = all.filter((c) => !c.alternatives);
      if (plain.length > 0) slots.push({ factor: t.factor, picks: [{ cases: plain, sense: 1, label: '' }] });
      const groups = new Map<string, Case[]>();
      for (const c of all) if (c.alternatives) groups.set(c.alternatives, [...(groups.get(c.alternatives) ?? []), c]);
      for (const g of groups.values()) {
        slots.push({ factor: t.factor, picks: g.map((c) => ({ cases: [c], sense: 1, label: g.length > 1 ? c.name : '' })) });
      }
    }
    let combos: Pick[][] = [[]];
    for (const slot of slots) combos = combos.flatMap((chosen) => slot.picks.map((p) => [...chosen, p]));
    for (const chosen of combos) {
      const factors: CaseCombination['factors'] = [];
      chosen.forEach((p, i) => { for (const c of p.cases) factors.push({ caseId: c.id, factor: p.sense * slots[i]!.factor }); });
      const which = chosen.map((p) => p.label).filter(Boolean).join(', ');
      out.push({ name: which ? `${spec.label} (${which})` : spec.label, factors, purpose: spec.purpose ?? 'strength', specId: spec.id });
    }
  }
  return out;
}
