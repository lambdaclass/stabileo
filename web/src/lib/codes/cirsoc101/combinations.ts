/**
 * CIRSOC 101-2025 §2.3.2 — strength load combinations.
 *
 * The seven basic combinations, transcribed from the normative column of the official
 * text (Edición Julio 2025, pp. 51–52), together with the two numbered exceptions and
 * the F and H rules that follow them.
 *
 *   1. 1,4 D
 *   2. 1,2 D + 1,6 L + 0,5 (Lr ó S ó R)
 *   3. 1,2 D + 1,6 (Lr ó S ó R) + (L ó 0,5 W)
 *   4. 1,2 D + 1,0 W + L + 0,5 (Lr ó S ó R)
 *   5. 1,2 D + 1,0 E + L + 0,2 S
 *   6. 0,9 D + 1,0 W
 *   7. 0,9 D + 1,0 E
 *
 * Exception 1 — the L factor in combinations 3, 4 and 5 may be taken as 0,5 for every
 * occupancy whose Lo in Table 4.1 is ≤ 5 kN/m², except garages and areas of public
 * assembly.
 *
 * Exception 2 — in combinations 2, 4 and 5 the companion load S is the flat-roof snow
 * load.
 *
 * F (fluids with well-defined pressures and maximum heights) is included with the same
 * factor as D in combinations 1 through 5 and 7.
 *
 * H (lateral earth/water pressure) is included with 1,6 where its effect adds to the
 * primary variable load effect; with 0,9 where it opposes and the load is permanent;
 * and with 0 in every other opposing condition.
 *
 * Also normative in §2.3.2: the effects of one or more loads not acting must be
 * investigated, and wind and seismic effects need not be considered simultaneously.
 * The generator therefore never emits a combination containing both W and E, and emits each
 * combination also without each subset of its companion loads (`notActing`): a companion whose
 * effect opposes the principal one (a live load whose moment counters the wind's in a column)
 * lowers the combination, and the printed one alone does not reach the case where it is absent.
 * Taking the principal load away needs no combination of its own: what is left lies between
 * 1,4 D and a combination the set already holds, so its effect is inside their envelope. Except
 * with H: 1,2 D + 1,6 H is not between them when D and H act in opposite senses, so a
 * combination with H is also emitted without its principal load (1,2 D + 1,6 H, 0,9 D + 1,6 H),
 * and with neither W nor E there, 0,9 D + H is emitted all the same (6 and 7 with W, E not acting).
 *
 * Seismic combinations. INPRES-CIRSOC 103-2018 Parte I §3.7.1 defines the combinations that
 * include the earthquake as [3.16] 1,2 D ± 1,0 E + f1 L + f2 S and [3.17] 0,9 D ± 1,0 E, f1 and
 * f2 from its Tabla 3.3: f2 = 0,70 on a roof that is horizontal or does not shed its snow, where
 * combination 5 above prints 0,2 S. With `seismicCompanions` the companions of combination 5
 * take the larger of the two codes' factors, so the combination satisfies both.
 *
 * The generator runs in the engine (`engine/src/loads/cirsoc101_combinations.rs`); this module
 * is its adapter and renders the result. No store, no runes.
 */

import { clause, type ClauseRef } from '../regulation';
import { msg, type EngineMessage, type MessageParam } from '../message';
import { loadsRequest } from '../../engine/wasm-solver';

/** The load symbols of §2.2, as used by the combinations. */
/** `Wa`: wind for a recurrence shorter than the risk category's (CIRSOC 102-2025 B.4), service only. */
/**
 * The symbols a combination names. M (mass), A (accidental) and I (ice) are in no rule of this
 * code: only a project's own rules name them (`engine/loads/combination-rules.ts`).
 */
export type LoadSymbol = 'D' | 'L' | 'Lr' | 'S' | 'R' | 'W' | 'Wa' | 'E' | 'F' | 'H' | 'T' | 'M' | 'A' | 'I';

export interface CombinationTerm {
  symbol: LoadSymbol;
  factor: number;
}

export interface LoadCombinationSpec {
  /** 1..7 as printed, with a suffix when one printed combination expands to several. */
  id: string;
  /** Which of the seven printed combinations this came from. Absent for a project's own rule. */
  basic?: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  terms: CombinationTerm[];
  /**
   * Canonical notation, e.g. `1.2 D + 1.6 L + 0.5 Lr`.
   *
   * Deliberately locale-neutral: this is a formula, and it is also the stable identity a
   * test and a stored combination are matched on. `formatCombinationLabel()` at the i18n
   * boundary renders it with the reader's decimal separator, so a Spanish user sees
   * `1,2 D + 1,6 L`.
   */
  label: string;
  refs: ClauseRef[];
  /** Notes attached by an exception that was applied. Translated at the boundary. */
  notes: EngineMessage[];
  /** Strength (§2.3.2) or service (`service-combinations.ts`). Absent means strength. */
  purpose?: 'strength' | 'service';
  /** The code that wrote it, set by the load plan (`codes/families/origin.ts`). */
  origin?: import('../families/origin').CombinationOrigin;
}

export interface CombinationInputs {
  /** Load categories present in the model. D is always assumed present. */
  present: {
    L: boolean; Lr: boolean; S: boolean; R: boolean;
    W: boolean; E: boolean; F: boolean; H: boolean;
    /** A service-level wind case exists (B.4.2's D + Wa). Absent: false. */
    Wa?: boolean;
    /** Restraint effects T (§2.3.4). Absent: false. */
    T?: boolean;
  };
  /**
   * Governing Lo from Table 4.1, in kN/m². Drives Exception 1. When several occupancies
   * are present, pass the largest — the exception must not be applied on the strength of
   * a lighter area than the one that governs.
   */
  maxLoKNm2?: number;
  /** True when any area is a garage or a place of public assembly (Exception 1 carve-out). */
  hasGarageOrPublicAssembly?: boolean;
  /**
   * How H acts relative to the primary variable load effect. The app cannot infer this
   * from the model, so it is a project statement; 'unknown' generates BOTH the additive
   * and the opposing case, which is the conservative reading of §2.3.2.
   */
  earthPressureAction?: 'adds' | 'opposes' | 'unknown';
  /** True when H is a permanent load, which allows 0,9 rather than 0 when it opposes. */
  earthPressurePermanent?: boolean;
  /**
   * The companions of the seismic combination by INPRES-CIRSOC 103-2018 [3.16] (Tabla 3.3):
   * f1 for L, f2 for S. Combination 5 takes the larger of these and its own factor for each.
   * Absent: combination 5 as CIRSOC 101 prints it.
   */
  seismicCompanions?: { f1?: number; f2?: number };
  /**
   * Also emit each combination without each subset of its companion loads (§2.3.2, "se deberán
   * investigar los efectos de una o más cargas que no estén actuando"). Absent: true.
   */
  notActing?: boolean;
}

function factorText(f: number): string {
  const r = +f.toFixed(3);
  return Math.abs(r * 10 - Math.round(r * 10)) < 1e-9 ? r.toFixed(1) : String(r);
}

/**
 * A combination's formula (`1.2 D + 1.6 L`, `0.9 D − 1.0 E`), '—' when it has no term. The one
 * formatter for the strength and service generators and the project rules, which each had one.
 */
export function combinationLabel(terms: readonly CombinationTerm[]): string {
  const t = terms.filter((x) => x.factor !== 0);
  if (t.length === 0) return '—';
  return t.map((x, i) => {
    const sign = x.factor < 0 ? (i === 0 ? '−' : ' − ') : i === 0 ? '' : ' + ';
    return `${sign}${factorText(Math.abs(x.factor))} ${x.symbol}`;
  }).join('');
}



// ─── The engine (engine/src/loads/cirsoc101_combinations.rs) ──────────
//
// The combinations are generated by the engine; this module renders what it returns (clause
// references and messages) in the app's types, and writes the label. Without the engine it throws
// `EngineUnavailableError`. The TypeScript generator verified in #292 is the tests' oracle
// (`__tests__/combinations-oracle.ts`).

interface EngineRef { regulation: string; edition: string; clause: string; label: string }
interface EngineNote { key: string; params?: Record<string, MessageParam> }
interface EngineCombination { id: string; basic?: number; terms: CombinationTerm[]; refs: EngineRef[]; notes: EngineNote[] }

const toRef = (r: EngineRef): ClauseRef => clause(r.regulation as never, r.edition as never, r.clause, r.label);
const toNote = (n: EngineNote): EngineMessage => msg(n.key, n.params);

function engineInputs(inputs: CombinationInputs) {
  return {
    present: inputs.present,
    ...(inputs.maxLoKNm2 !== undefined ? { maxLoKNm2: inputs.maxLoKNm2 } : {}),
    hasGarageOrPublicAssembly: !!inputs.hasGarageOrPublicAssembly,
    ...(inputs.earthPressureAction ? { earthPressureAction: inputs.earthPressureAction } : {}),
    earthPressurePermanent: !!inputs.earthPressurePermanent,
    ...(inputs.seismicCompanions ? { seismicCompanions: inputs.seismicCompanions } : {}),
    ...(inputs.notActing !== undefined ? { notActing: inputs.notActing } : {}),
  };
}

/**
 * The companion factor on L in combinations 3, 4 and 5 (§2.3.2 Exception 1), and why: 0,5 when
 * Lo ≤ 5 kN/m² and the structure has no garage or public assembly area, 1,0 otherwise.
 */
export function liveLoadFactorInCompanion(
  inputs: CombinationInputs,
): { factor: number; note: EngineMessage | null } {
  const r = loadsRequest({ op: 'cirsoc101LiveCompanion', inputs: engineInputs(inputs) }) as { factor: number; note: EngineNote };
  return { factor: r.factor, note: toNote(r.note) };
}

/**
 * The CIRSOC 101-2025 §2.3.2 strength combinations for the loads present, with [3.16]'s
 * companions in the seismic one, F and H, the "loads not acting" variants and §2.3.4 (T).
 */
export function generateCombinations(inputs: CombinationInputs): LoadCombinationSpec[] {
  const out = loadsRequest({ op: 'cirsoc101Combinations', inputs: engineInputs(inputs) }) as EngineCombination[];
  return out.map((c) => ({
    id: c.id,
    ...(c.basic !== undefined ? { basic: c.basic as NonNullable<LoadCombinationSpec['basic']> } : {}),
    terms: c.terms,
    label: combinationLabel(c.terms),
    refs: c.refs.map(toRef),
    notes: c.notes.map(toNote),
  }));
}
