/**
 * CIRSOC 201 §25.4 development length and §25.5.2 lap splices.
 *
 * ── Why this module exists ─────────────────────────────────────────
 *
 * The bar generators take `ld` and `lapSplice` as callbacks, and until now nothing in the
 * app supplied a real one — the unit tests passed `(d) => 0.04 * d`, which is a placeholder,
 * not a rule. Wiring the detailing pipeline into production without this would have meant
 * shipping curtailment points and splice lengths computed from a made-up number.
 *
 * ── What is implemented ────────────────────────────────────────────
 *
 * §25.4.2.3 Table 25.4.2.3 — the simplified expressions, which §25.4.2.1(a) explicitly
 * permits as an alternative to the general equation (25.4.2.4a). The table is indexed on
 * a **16 mm** diameter threshold, not the 20 mm one an ACI-trained reader might assume:
 *
 *              spacing/cover satisfied        other cases
 *   db ≤ 16    fy·ψt·ψe·ψg / (2,1·√f'c)·db    fy·ψt·ψe·ψg / (1,4·√f'c)·db
 *   db > 16    fy·ψt·ψe·ψg / (1,7·√f'c)·db    fy·ψt·ψe·ψg / (1,1·√f'c)·db
 *
 * §25.4.2.1(b) — never less than 300 mm.
 * §25.5.2.1 Table 25.5.2.1 — Class A = max(1,0·ld, 300 mm), Class B = max(1,3·ld, 300 mm).
 *
 * ψe = 1 always: §25.4.2.4's commentary states epoxy coating is not permitted under this
 * regulation, so there is no coated case to model.
 *
 * ── What is NOT implemented ────────────────────────────────────────
 *
 * The general equation (25.4.2.4a) with an explicit (cb + Ktr)/db. It needs the real bar
 * layout, which the caller does not have at the point ld is first needed. The simplified
 * table is the conservative choice of the two for the "other cases" row and is what §25.4.2.1
 * permits, so using it is a documented decision rather than a gap. `deriveDevelopment`
 * records which row was taken.
 *
 * Pure: no store, no runes, no i18n.
 */

import { clause, type ClauseRef, type RegulationEdition } from '../regulation';
import { msg, round, type EngineMessage } from '../message';

/** §25.4.2.1(b). */
export const MIN_DEVELOPMENT_MM = 300;

/** §25.5.2.1 Table 25.5.2.1. */
export const MIN_LAP_MM = 300;

/** Table 25.4.2.3's diameter break. */
export const TABLE_25_4_2_3_DIAMETER_BREAK_MM = 16;

export type SpliceClass = 'A' | 'B';

export interface DevelopmentInputs {
  diameterMm: number;
  /** Specified yield strength, MPa. */
  fy: number;
  /** Specified compressive strength, MPa. */
  fc: number;
  /**
   * True when the clear spacing and cover conditions in the FIRST row of Table 25.4.2.3
   * are satisfied. False selects the "other cases" row, which is longer.
   *
   * No default: assuming the favourable row silently shortens every anchorage in the
   * model by a third, and the caller is the only party that knows the bar layout.
   */
  favourableSpacing: boolean;
  /**
   * ψt, §25.4.2.5 — bar location factor. 1,3 for horizontal top reinforcement placed such
   * that more than 300 mm of fresh concrete is cast below it, 1,0 otherwise.
   */
  psiT?: number;
  /** ψg, §25.4.2.5 — grade factor. 1,0 for fy ≤ 420, 1,15 for 550, 1,3 for 690. */
  psiG?: number;
  /** λ, §25.4.2.5 — lightweight concrete factor. 1,0 for normal weight. */
  lambda?: number;
  edition: RegulationEdition;
}

export interface DevelopmentResult {
  /** Development length ld, in METRES, to match the generators' units. */
  ldM: number;
  /** The value before the 300 mm floor, m — so a report can show which governed. */
  computedM: number;
  /** True when §25.4.2.1(b) governed. */
  governedByMinimum: boolean;
  /** Which cell of Table 25.4.2.3 was used. */
  tableRow: 'favourable' | 'other';
  tableColumn: 'db<=16' | 'db>16';
  /** The denominator coefficient actually applied (2,1 / 1,7 / 1,4 / 1,1). */
  coefficient: number;
  refs: ClauseRef[];
  derivation: EngineMessage;
}

/** ψg from §25.4.2.5, by specified grade. */
export function gradeFactor(fy: number): number {
  if (fy <= 420) return 1.0;
  if (fy <= 550) return 1.15;
  return 1.3;
}

/**
 * ld per §25.4.2.3 / Table 25.4.2.3, floored by §25.4.2.1(b).
 *
 * Returns metres because every consumer in the detailing pipeline works in metres.
 */
export function deriveDevelopment(input: DevelopmentInputs): DevelopmentResult {
  const { diameterMm: db, fy, fc, favourableSpacing, edition } = input;
  const psiT = input.psiT ?? 1.0;
  const psiE = 1.0;   // §25.4.2.4 commentary: epoxy coating is not permitted.
  const psiG = input.psiG ?? gradeFactor(fy);
  const lambda = input.lambda ?? 1.0;

  const large = db > TABLE_25_4_2_3_DIAMETER_BREAK_MM;
  const coefficient = favourableSpacing
    ? (large ? 1.7 : 2.1)
    : (large ? 1.1 : 1.4);

  // Table 25.4.2.3 is written in mm with f'c in MPa; the result is a multiple of db.
  const computedMm = (fy * psiT * psiE * psiG) / (coefficient * lambda * Math.sqrt(fc)) * db;
  const ldMm = Math.max(computedMm, MIN_DEVELOPMENT_MM);

  const refs = [
    clause('cirsoc-201', edition, 'Tabla 25.4.2.3',
      'longitud de anclaje para barras conformadas en tracción'),
    clause('cirsoc-201', edition, '25.4.2.1', 'longitud de anclaje mínima'),
  ];

  return {
    ldM: ldMm / 1000,
    computedM: computedMm / 1000,
    governedByMinimum: ldMm > computedMm,
    tableRow: favourableSpacing ? 'favourable' : 'other',
    tableColumn: large ? 'db>16' : 'db<=16',
    coefficient,
    refs,
    derivation: msg(
      ldMm > computedMm
        ? 'codes.cirsoc201.anchorage.developmentMinimum'
        : 'codes.cirsoc201.anchorage.development',
      {
        db, coefficient, psiT, psiG, lambda,
        computed: round(computedMm, 0), minimum: MIN_DEVELOPMENT_MM,
        ld: round(ldMm, 0),
        row: favourableSpacing
          ? 'codes.cirsoc201.anchorage.rowFavourable'
          : 'codes.cirsoc201.anchorage.rowOther',
      },
    ),
  };
}

export interface LapResult {
  /** Lap length, m. */
  lapM: number;
  spliceClass: SpliceClass;
  governedByMinimum: boolean;
  refs: ClauseRef[];
  derivation: EngineMessage;
}

/**
 * §25.5.2.1 Table 25.5.2.1 — tension lap splice.
 *
 * Class B (1,3 ld) unless the caller can show both conditions for Class A: provided area at
 * least twice required AND no more than 50 % of bars spliced within the lap length. Class B
 * is the default because it is the safe one, and because the app cannot infer splice
 * staggering from a model that does not record it.
 */
export function deriveLap(
  development: DevelopmentResult,
  opts: { spliceClass?: SpliceClass; edition: RegulationEdition },
): LapResult {
  const spliceClass = opts.spliceClass ?? 'B';
  const factor = spliceClass === 'A' ? 1.0 : 1.3;
  const computedMm = development.ldM * 1000 * factor;
  const lapMm = Math.max(computedMm, MIN_LAP_MM);
  return {
    lapM: lapMm / 1000,
    spliceClass,
    governedByMinimum: lapMm > computedMm,
    refs: [
      clause('cirsoc-201', opts.edition, 'Tabla 25.5.2.1',
        'longitud de empalme por yuxtaposición en tracción'),
      ...development.refs,
    ],
    derivation: msg('codes.cirsoc201.anchorage.lap', {
      spliceClass, factor, ld: round(development.ldM * 1000, 0),
      lap: round(lapMm, 0), minimum: MIN_LAP_MM,
    }),
  };
}

/**
 * The `(diameterMm) => metres` callbacks the bar generators expect.
 *
 * Built once per member so every bar in it shares the same f'c, fy and spacing assumption,
 * and so the clause references are collected once rather than per bar.
 */
export function anchorageFunctions(base: Omit<DevelopmentInputs, 'diameterMm'>): {
  ld: (diameterMm: number) => number;
  lapSplice: (diameterMm: number) => number;
  refs: ClauseRef[];
  derivationFor: (diameterMm: number) => EngineMessage;
} {
  const cache = new Map<number, DevelopmentResult>();
  const dev = (diameterMm: number): DevelopmentResult => {
    const hit = cache.get(diameterMm);
    if (hit) return hit;
    const r = deriveDevelopment({ ...base, diameterMm });
    cache.set(diameterMm, r);
    return r;
  };
  return {
    ld: (d) => dev(d).ldM,
    lapSplice: (d) => deriveLap(dev(d), { edition: base.edition }).lapM,
    refs: [
      clause('cirsoc-201', base.edition, 'Tabla 25.4.2.3',
        'longitud de anclaje para barras conformadas en tracción'),
      clause('cirsoc-201', base.edition, 'Tabla 25.5.2.1',
        'longitud de empalme por yuxtaposición en tracción'),
    ],
    derivationFor: (d) => dev(d).derivation,
  };
}
