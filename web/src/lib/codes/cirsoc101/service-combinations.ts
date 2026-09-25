/**
 * Service combinations: the characteristic combination, every action at factor 1,0.
 *
 * What they are for: deflection, drift and cracking — the checks written against the loads the
 * structure actually carries, not against the factored ones §2.3.2 uses for strength. They are
 * not a numbered combination of CIRSOC 101-2025, and they say so: the basis is stated on every
 * one rather than dressed as a clause.
 *
 *   1. D
 *   2. D + L
 *   3. D + (Lr ó S ó R)
 *   4. D + L + (Lr ó S ó R)
 *   5. D + W
 *   6. D + L + W
 *
 * Seismic action has no service combination here: a serviceability check under the design
 * earthquake is the regulation's own drift limit, read from the strength analysis.
 *
 * Pure: no store, no runes.
 */
import { msg } from '../message';
import type { CombinationInputs, CombinationTerm, LoadCombinationSpec } from './combinations';

function label(terms: CombinationTerm[]): string {
  return terms.filter((t) => t.factor !== 0).map((t) => `${t.factor.toFixed(1)} ${t.symbol}`).join(' + ');
}

/** The characteristic combinations for the loads `present`. */
export function generateServiceCombinations(inputs: Pick<CombinationInputs, 'present'>): LoadCombinationSpec[] {
  const p = inputs.present;
  const roof = (['Lr', 'S', 'R'] as const).filter((s) => p[s]);
  const out: LoadCombinationSpec[] = [];
  const note = msg('loads.service.basis');
  const add = (id: string, basic: LoadCombinationSpec['basic'], terms: CombinationTerm[]) => {
    out.push({ id: `S${id}`, basic, terms, label: label(terms), refs: [], notes: [note], purpose: 'service' });
  };
  const D: CombinationTerm = { symbol: 'D', factor: 1 };
  const L: CombinationTerm = { symbol: 'L', factor: 1 };
  add('1', 1, [D]);
  if (p.L) add('2', 2, [D, L]);
  for (const r of roof) add(`3${r}`, 3, [D, { symbol: r, factor: 1 }]);
  if (p.L) for (const r of roof) add(`4${r}`, 4, [D, L, { symbol: r, factor: 1 }]);
  if (p.W) {
    add('5', 5, [D, { symbol: 'W', factor: 1 }]);
    if (p.L) add('6', 6, [D, L, { symbol: 'W', factor: 1 }]);
  }
  return out;
}
