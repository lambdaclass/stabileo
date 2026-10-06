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
  /** The code that wrote the spec, when it was a code's (`codes/families/origin.ts`). */
  origin?: import('../../codes/families/origin').CombinationOrigin;
}

/** Which load symbols the model has cases for. */
export function presentSymbols(cases: ReadonlyArray<{ type?: string }>): CombinationInputs['present'] {
  const has = (s: LoadSymbol) => cases.some((c) => symbolOfType(c.type) === s);
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
}

/** Actions that vary: the ones a rule has a principal among. D, F and H are permanent. */
const VARIABLE: ReadonlySet<LoadSymbol> = new Set(['L', 'Lr', 'S', 'R', 'W', 'Wa', 'E', 'T']);

export function expandCombinations(
  specs: readonly LoadCombinationSpec[],
  cases: ReadonlyArray<{ id: number; type?: string; name: string; alternatives?: string; pattern?: boolean }>,
  opts: ExpandOptions = {},
): CaseCombination[] {
  type Case = { id: number; name: string; alternatives?: string; pattern?: boolean };
  const bySymbol = new Map<LoadSymbol, Case[]>();
  for (const c of cases) {
    const s = symbolOfType(c.type);
    if (!s) continue;
    bySymbol.set(s, [...(bySymbol.get(s) ?? []), { id: c.id, name: c.name, alternatives: c.alternatives, pattern: c.pattern }]);
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
    const principal = Math.max(0, ...terms.filter((t) => VARIABLE.has(t.symbol)).map((t) => Math.abs(t.factor)));
    const arranged = (t: (typeof terms)[number]) => !ALTERNATIVE.has(t.symbol) && bySymbol.get(t.symbol)!.some((c) => c.pattern);
    // The terms that may be the principal one and have arrangements to vary (see the header).
    const tied = terms.flatMap((t, i) => (VARIABLE.has(t.symbol) && Math.abs(t.factor) >= principal - 1e-9 && arranged(t) ? [i] : []));
    /** The slots of the rule with the patterned term `varying` the principal (null: none varies). */
    const slotsFor = (varying: number | null) => {
      const slots: Array<{ factor: number; picks: Pick[] }> = [];
      terms.forEach((t, i) => {
        const all = bySymbol.get(t.symbol)!;
        if (ALTERNATIVE.has(t.symbol)) {
          const reverse = !!opts.bothSenses?.[t.symbol as 'W' | 'E'];
          const sensesOf = (c: Case): Array<1 | -1> =>
            reverse && (t.symbol !== 'W' || !opts.reversible || opts.reversible(c.id)) ? [1, -1] : [1];
          const named = all.length > 1 || all.some((c) => sensesOf(c).length > 1);
          slots.push({ factor: t.factor, picks: all.flatMap((c) => sensesOf(c).map((sense) => ({
            cases: [c], sense, label: named ? `${sensesOf(c).length > 1 ? (sense > 0 ? '+' : '−') : ''}${c.name}` : '',
          }))) });
          return;
        }
        const plain = all.filter((c) => !c.alternatives);
        if (plain.length > 0) slots.push({ factor: t.factor, picks: [{ cases: plain, sense: 1, label: '' }] });
        const groups = new Map<string, Case[]>();
        for (const c of all) if (c.alternatives) groups.set(c.alternatives, [...(groups.get(c.alternatives) ?? []), c]);
        const companion = !opts.patternsInCompanions && i !== varying;
        for (const g0 of groups.values()) {
          // A companion takes its action whole: the group's cases that are no pattern.
          const whole = g0.filter((c) => !c.pattern);
          const g = companion && whole.length > 0 ? whole : g0;
          slots.push({ factor: t.factor, picks: g.map((c) => ({ cases: [c], sense: 1, label: g.length > 1 ? c.name : '' })) });
        }
      });
      return slots;
    };
    const seen = new Set<string>();
    for (const varying of opts.patternsInCompanions || tied.length === 0 ? [null] : tied) {
      const slots = slotsFor(varying);
      let combos: Pick[][] = [[]];
      for (const slot of slots) combos = combos.flatMap((chosen) => slot.picks.map((p) => [...chosen, p]));
      for (const chosen of combos) {
        const factors: CaseCombination['factors'] = [];
        chosen.forEach((p, i) => { for (const c of p.cases) factors.push({ caseId: c.id, factor: p.sense * slots[i]!.factor }); });
        const key = factors.map((f) => `${f.caseId}:${f.factor}`).sort().join(' ');
        if (seen.has(key)) continue;
        seen.add(key);
        const which = chosen.map((p) => p.label).filter(Boolean).join(', ');
        out.push({ name: which ? `${spec.label} (${which})` : spec.label, factors, purpose: spec.purpose ?? 'strength', specId: spec.id, ...(spec.origin ? { origin: spec.origin } : {}) });
      }
    }
  }
  return out;
}
