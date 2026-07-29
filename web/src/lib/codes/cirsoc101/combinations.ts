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
 * The generator therefore never emits a combination containing both W and E.
 *
 * Pure: no store, no runes.
 */

import { clause, type ClauseRef } from '../regulation';
import { msg, type EngineMessage } from '../message';

/** The load symbols of §2.2, as used by the combinations. */
export type LoadSymbol = 'D' | 'L' | 'Lr' | 'S' | 'R' | 'W' | 'E' | 'F' | 'H' | 'T';

export interface CombinationTerm {
  symbol: LoadSymbol;
  factor: number;
}

export interface LoadCombinationSpec {
  /** 1..7 as printed, with a suffix when one printed combination expands to several. */
  id: string;
  /** Which of the seven printed combinations this came from. */
  basic: 1 | 2 | 3 | 4 | 5 | 6 | 7;
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
}

export interface CombinationInputs {
  /** Load categories present in the model. D is always assumed present. */
  present: {
    L: boolean; Lr: boolean; S: boolean; R: boolean;
    W: boolean; E: boolean; F: boolean; H: boolean;
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
}

const REF_BASIC = clause('cirsoc-101', '2025', '2.3.2', 'combinaciones básicas');
const REF_EXC1 = clause('cirsoc-101', '2025', '2.3.2 Excepción 1', 'factor de carga L reducido');
const REF_EXC2 = clause('cirsoc-101', '2025', '2.3.2 Excepción 2', 'S como carga de nieve sobre cubierta plana');

function fmt(f: number): string {
  // A point, not the regulation's comma: see `label` above. The boundary re-separates.
  return f.toFixed(1);
}

function label(terms: CombinationTerm[]): string {
  return terms
    .filter((t) => t.factor !== 0)
    .map((t) => `${fmt(t.factor)} ${t.symbol}`)
    .join(' + ');
}

/**
 * The reduced L factor permitted by Exception 1, or 1.0 when it does not apply.
 *
 * Exported because the exception is a decision a reviewing engineer will want to see
 * justified, not a hidden constant.
 */
export function liveLoadFactorInCompanion(
  inputs: CombinationInputs,
): { factor: number; note: EngineMessage | null } {
  const lo = inputs.maxLoKNm2;
  if (inputs.hasGarageOrPublicAssembly) {
    return {
      factor: 1.0,
      note: msg('loads.cirsoc101.exception1.blockedByAssembly'),
    };
  }
  if (lo === undefined) {
    return {
      factor: 1.0,
      note: msg('loads.cirsoc101.exception1.unknownLo'),
    };
  }
  if (lo <= 5.0) {
    return {
      factor: 0.5,
      note: msg('loads.cirsoc101.exception1.applied', { lo }),
    };
  }
  return { factor: 1.0, note: msg('loads.cirsoc101.exception1.heavyLo', { lo }) };
}

/**
 * Generate the strength combinations for a model.
 *
 * Combinations that would contain only absent loads are not emitted, and the alternates
 * inside "(Lr ó S ó R)" expand to one combination per present companion. Wind and
 * seismic are never combined.
 */
export function generateCombinations(inputs: CombinationInputs): LoadCombinationSpec[] {
  const p = inputs.present;
  const out: LoadCombinationSpec[] = [];
  const { factor: lCompanion, note: excNote } = liveLoadFactorInCompanion(inputs);

  /** Companions available for the "(Lr ó S ó R)" slot. */
  const roofCompanions: LoadSymbol[] = [
    ...(p.Lr ? (['Lr'] as const) : []),
    ...(p.S ? (['S'] as const) : []),
    ...(p.R ? (['R'] as const) : []),
  ];

  const push = (
    basic: LoadCombinationSpec['basic'],
    suffix: string,
    terms: CombinationTerm[],
    refs: ClauseRef[],
    notes: EngineMessage[],
  ) => {
    const withFH = applyFluidAndEarth(basic, terms, inputs);
    for (const variant of withFH) {
      out.push({
        id: `${basic}${suffix}${variant.suffix}`,
        basic,
        terms: variant.terms,
        label: label(variant.terms),
        refs: [...refs, ...variant.refs],
        notes: [...notes, ...variant.notes],
      });
    }
  };

  // ── 1. 1,4 D ──
  push(1, '', [{ symbol: 'D', factor: 1.4 }], [REF_BASIC], []);

  // ── 2. 1,2 D + 1,6 L + 0,5 (Lr ó S ó R) ──
  // The printed combination carries L at 1,6 unconditionally; Exception 1 applies only
  // to combinations 3, 4 and 5, so it is deliberately NOT applied here.
  if (p.L || roofCompanions.length > 0) {
    if (roofCompanions.length === 0) {
      push(2, '', [{ symbol: 'D', factor: 1.2 }, { symbol: 'L', factor: 1.6 }], [REF_BASIC], []);
    } else {
      for (const c of roofCompanions) {
        push(2, `-${c}`, [
          { symbol: 'D', factor: 1.2 },
          ...(p.L ? [{ symbol: 'L' as LoadSymbol, factor: 1.6 }] : []),
          { symbol: c, factor: 0.5 },
        ], [REF_BASIC, ...(c === 'S' ? [REF_EXC2] : [])],
        c === 'S' ? [msg('loads.cirsoc101.note.snowAsFlatRoof')] : []);
      }
    }
  }

  // ── 3. 1,2 D + 1,6 (Lr ó S ó R) + (L ó 0,5 W) ──
  for (const c of roofCompanions) {
    if (p.L) {
      push(3, `-${c}-L`, [
        { symbol: 'D', factor: 1.2 }, { symbol: c, factor: 1.6 },
        { symbol: 'L', factor: lCompanion },
      ], [REF_BASIC, REF_EXC1], excNote ? [excNote] : []);
    }
    if (p.W) {
      push(3, `-${c}-W`, [
        { symbol: 'D', factor: 1.2 }, { symbol: c, factor: 1.6 }, { symbol: 'W', factor: 0.5 },
      ], [REF_BASIC], []);
    }
    if (!p.L && !p.W) {
      push(3, `-${c}`, [{ symbol: 'D', factor: 1.2 }, { symbol: c, factor: 1.6 }], [REF_BASIC], []);
    }
  }

  // ── 4. 1,2 D + 1,0 W + L + 0,5 (Lr ó S ó R) ──
  if (p.W) {
    const base: CombinationTerm[] = [
      { symbol: 'D', factor: 1.2 }, { symbol: 'W', factor: 1.0 },
      ...(p.L ? [{ symbol: 'L' as LoadSymbol, factor: lCompanion }] : []),
    ];
    const notes = p.L && excNote ? [excNote] : [];
    if (roofCompanions.length === 0) {
      push(4, '', base, [REF_BASIC, REF_EXC1], notes);
    } else {
      for (const c of roofCompanions) {
        push(4, `-${c}`, [...base, { symbol: c, factor: 0.5 }],
          [REF_BASIC, REF_EXC1, ...(c === 'S' ? [REF_EXC2] : [])],
          [...notes, ...(c === 'S' ? [msg('loads.cirsoc101.note.snowAsFlatRoof')] : [])]);
      }
    }
  }

  // ── 5. 1,2 D + 1,0 E + L + 0,2 S ──
  // Never combined with W: §2.3.2 states wind and seismic need not be taken simultaneously.
  if (p.E) {
    push(5, '', [
      { symbol: 'D', factor: 1.2 }, { symbol: 'E', factor: 1.0 },
      ...(p.L ? [{ symbol: 'L' as LoadSymbol, factor: lCompanion }] : []),
      ...(p.S ? [{ symbol: 'S' as LoadSymbol, factor: 0.2 }] : []),
    ], [REF_BASIC, REF_EXC1, ...(p.S ? [REF_EXC2] : [])],
    [...(p.L && excNote ? [excNote] : []),
     ...(p.S ? [msg('loads.cirsoc101.note.snowAsFlatRoof')] : [])]);
  }

  // ── 6. 0,9 D + 1,0 W ──
  if (p.W) push(6, '', [{ symbol: 'D', factor: 0.9 }, { symbol: 'W', factor: 1.0 }], [REF_BASIC], []);

  // ── 7. 0,9 D + 1,0 E ──
  if (p.E) push(7, '', [{ symbol: 'D', factor: 0.9 }, { symbol: 'E', factor: 1.0 }], [REF_BASIC], []);

  return out;
}

interface Variant {
  suffix: string;
  terms: CombinationTerm[];
  refs: ClauseRef[];
  notes: EngineMessage[];
}

/**
 * Apply the F and H rules that follow the seven combinations.
 *
 * F takes the same factor as D, in combinations 1–5 and 7 (not 6 — the printed rule
 * lists "1 hasta 5 y 7").
 */
function applyFluidAndEarth(
  basic: number,
  terms: CombinationTerm[],
  inputs: CombinationInputs,
): Variant[] {
  let withF = terms;
  const refs: ClauseRef[] = [];
  const notes: EngineMessage[] = [];

  if (inputs.present.F && basic !== 6) {
    const dFactor = terms.find((t) => t.symbol === 'D')?.factor ?? 1.0;
    withF = [...terms, { symbol: 'F', factor: dFactor }];
    refs.push(clause('cirsoc-101', '2025', '2.3.2', 'cargas debidas a fluidos F'));
    notes.push(msg('loads.cirsoc101.note.fSameFactorAsD'));
  }

  if (!inputs.present.H) {
    return [{ suffix: '', terms: withF, refs, notes }];
  }

  const hRef = clause('cirsoc-101', '2025', '2.3.2', 'empuje lateral del suelo H');
  const action = inputs.earthPressureAction ?? 'unknown';
  const opposingFactor = inputs.earthPressurePermanent ? 0.9 : 0;
  const opposingNote = msg(inputs.earthPressurePermanent
    ? 'loads.cirsoc101.note.hOpposesPermanent'
    : 'loads.cirsoc101.note.hOpposesTemporary');

  if (action === 'adds') {
    return [{
      suffix: '',
      terms: [...withF, { symbol: 'H', factor: 1.6 }],
      refs: [...refs, hRef],
      notes: [...notes, msg('loads.cirsoc101.note.hAdds')],
    }];
  }
  if (action === 'opposes') {
    return [{
      suffix: '',
      terms: opposingFactor === 0 ? withF : [...withF, { symbol: 'H', factor: opposingFactor }],
      refs: [...refs, hRef],
      notes: [...notes, opposingNote],
    }];
  }

  // Unknown: the app must not guess which way the soil acts, so it generates both.
  return [
    {
      suffix: '-H+',
      terms: [...withF, { symbol: 'H', factor: 1.6 }],
      refs: [...refs, hRef],
      notes: [...notes, msg('loads.cirsoc101.note.hUnknownAdding')],
    },
    {
      suffix: '-H-',
      terms: opposingFactor === 0 ? withF : [...withF, { symbol: 'H', factor: opposingFactor }],
      refs: [...refs, hRef],
      notes: [...notes, msg('loads.cirsoc101.note.hUnknownOpposing', { factor: opposingFactor })],
    },
  ];
}
