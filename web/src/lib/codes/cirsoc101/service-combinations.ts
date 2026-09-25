/**
 * Service combinations, for deflection, drift and cracking: the checks written against the
 * loads the structure carries, not the factored ones §2.3.2 uses for strength.
 *
 * CIRSOC 101-2025 applies §2.3 to strength only and prints no service combinations. For wind,
 * CIRSOC 102-2025 does, in Apéndice B.4.2, with W from the same speed as for strength:
 *
 *   0,6 D + 0,6 W
 *   D + 0,75 L + 0,45 W + 0,75 (Lr ó S ó R)
 *
 * B.4.2 also lists D + Wa and D + 0,5 L + Wa, with Wa a wind load for a shorter recurrence
 * (Figura C AB.4.2-1, in the commentary). The app does not produce Wa cases, so those two are
 * not generated. The gravity-only ones are the characteristic combination, every action at 1,0,
 * and say so rather than cite a clause:
 *
 *   D · D + L · D + (Lr ó S ó R) · D + L + (Lr ó S ó R)
 *
 * Seismic action has no service combination here: a serviceability check under the design
 * earthquake is the regulation's own drift limit, read from the strength analysis.
 *
 * Pure: no store, no runes.
 */
import { msg } from '../message';
import { clause } from '../regulation';

const R102_B42 = clause('cirsoc-102', '2025', 'B.4.2', 'combinaciones para comportamiento en servicio');
import type { CombinationInputs, CombinationTerm, LoadCombinationSpec } from './combinations';

/** One decimal as the regulation prints factors, more when the factor has them (0,75; 0,45). */
const factorText = (f: number) => (Math.round(f * 10) === f * 10 ? f.toFixed(1) : String(+f.toFixed(3)));

function label(terms: CombinationTerm[]): string {
  return terms.filter((t) => t.factor !== 0).map((t) => `${factorText(t.factor)} ${t.symbol}`).join(' + ');
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
    const w = (f: number): CombinationTerm => ({ symbol: 'W', factor: f });
    const b42 = [msg('loads.service.windB42')];
    const addW = (id: string, terms: CombinationTerm[]) =>
      out.push({ id: `S${id}`, terms, label: label(terms), refs: [R102_B42], notes: b42, purpose: 'service' });
    addW('5', [{ symbol: 'D', factor: 0.6 }, w(0.6)]);
    const companions = roof.length > 0 ? roof : [null];
    for (const r of companions) {
      addW(`6${r ?? ''}`, [D, ...(p.L ? [{ symbol: 'L' as const, factor: 0.75 }] : []), w(0.45),
        ...(r ? [{ symbol: r, factor: 0.75 }] : [])]);
    }
  }
  return out;
}
