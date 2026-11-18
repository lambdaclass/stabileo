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
 * §25.4.2.1(b) — never less than 300 mm. §25.4.1.4 — √f'c at most 8,3 MPa (`developmentSqrtFc`).
 * §25.5.2.1 Table 25.5.2.1 — Class A = max(1,0·ld, 300 mm), Class B = max(1,3·ld, 300 mm).
 *
 * ψe = 1 always: §25.4.2.4's commentary states epoxy coating is not permitted under this
 * regulation, so there is no coated case to model.
 *
 * §25.4.2.4 — the general equation (25.4.2.4a), where the caller knows the bar layout:
 *
 *   ld = fy·ψt·ψe·ψs·ψg / (1,1·λ·√f'c·(cb + Ktr)/db) · db,   (cb + Ktr)/db ≤ 2,5
 *
 * cb the lesser of the cover to the bar's centre and half the centre-to-centre spacing; Ktr = 0
 * is allowed «aún si hay armadura transversal presente», and is what `confinementOf` takes.
 * ψs (Table 25.4.2.5) is 0,8 for db ≤ 16 mm and 1,0 above.
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

/**
 * §25.4.1.4: «Los valores de √f´c usados para calcular la longitud de anclaje no deben exceder de
 * 8,3 MPa.» Every development length of §25.4 reads it (ld §25.4.2, ldh §25.4.3, ldc §25.4.9), and
 * the laps of §25.5 through ld.
 */
export const SQRT_FC_DEVELOPMENT_LIMIT_MPA = 8.3;
export const developmentSqrtFc = (fc: number): number => Math.min(Math.sqrt(fc), SQRT_FC_DEVELOPMENT_LIMIT_MPA);
const capRef = (fc: number, edition: RegulationEdition): ClauseRef[] => (Math.sqrt(fc) > SQRT_FC_DEVELOPMENT_LIMIT_MPA
  ? [clause('cirsoc-201', edition, '25.4.1.4', '√f´c no mayor que 8,3 MPa en la longitud de anclaje')] : []);

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
   * The bar layout, for the general equation of §25.4.2.4: when given, it is used and
   * `favourableSpacing` is not read.
   */
  confinement?: Confinement;
  /**
   * ψt, §25.4.2.5 — bar location factor. 1,3 for horizontal top reinforcement placed such
   * that more than 300 mm of fresh concrete is cast below it, 1,0 otherwise.
   */
  psiT?: number;
  /** ψg, Table 25.4.2.5 — grade factor. 1,0 for fy = 220 or 420 MPa, 1,15 for 500. */
  psiG?: number;
  /** λ, §25.4.2.5 — lightweight concrete factor. 1,0 for normal weight. */
  lambda?: number;
  edition: RegulationEdition;
}

/** cb of §25.4.2.4 and the transverse index Ktr, mm. */
export interface Confinement { cbMm: number; ktrMm?: number }

/** §25.4.2.4: (cb + Ktr)/db is not taken greater than 2,5. */
export const MAX_CONFINEMENT_TERM = 2.5;

/**
 * cb of §25.4.2.4 for a row of bars at `spacingMm` between centres with `clearCoverMm` to the
 * outside of the bar: the lesser of the cover to the bar's centre and half the spacing. Ktr = 0.
 */
export const confinementOf = (diameterMm: number, clearCoverMm: number, spacingMm: number): Confinement =>
  ({ cbMm: Math.min(clearCoverMm + diameterMm / 2, spacingMm / 2) });

/**
 * Whether the first row of Table 25.4.2.3 holds: clear spacing ≥ db and clear cover ≥ db with at
 * least the code's minimum stirrups along ld, or clear spacing ≥ 2·db and clear cover ≥ db.
 */
export const favourableRow = (o: { diameterMm: number; clearSpacingMm: number; clearCoverMm: number; minimumStirrups: boolean }): boolean =>
  o.clearCoverMm >= o.diameterMm - 1e-9 && o.clearSpacingMm >= (o.minimumStirrups ? 1 : 2) * o.diameterMm - 1e-9;

/** ψs of Table 25.4.2.5. */
export const sizeFactor = (diameterMm: number): number => (diameterMm <= TABLE_25_4_2_3_DIAMETER_BREAK_MM ? 0.8 : 1.0);

export interface DevelopmentResult {
  /** Development length ld, in METRES, to match the generators' units. */
  ldM: number;
  /** The value before the 300 mm floor, m — so a report can show which governed. */
  computedM: number;
  /** True when §25.4.2.1(b) governed. */
  governedByMinimum: boolean;
  /** Which cell of Table 25.4.2.3 was used, or the general equation of §25.4.2.4. */
  tableRow: 'favourable' | 'other' | 'general';
  tableColumn: 'db<=16' | 'db>16';
  /** The denominator coefficient actually applied (2,1 / 1,7 / 1,4 / 1,1; 1,1·(cb + Ktr)/db/ψs for the general equation). */
  coefficient: number;
  /** (cb + Ktr)/db as taken, after the 2,5 cap, when the general equation was used. */
  confinementTerm?: number;
  refs: ClauseRef[];
  derivation: EngineMessage;
}

/** §25.4.2.5's depth of fresh concrete below a horizontal bar beyond which ψt = 1,3. */
export const TOP_BAR_CONCRETE_BELOW_MM = 300;

/**
 * ψt from §25.4.2.5, given the concrete cast below the bar, in METRES.
 *
 * 1,3 for horizontal reinforcement with more than 300 mm of fresh concrete placed below it:
 * the bleed water and settlement under it weaken the bond, so a top bar in a 50 cm beam needs
 * 30 % more length than the same bar at the bottom. 1,0 otherwise — bottom bars, shallow
 * members and vertical bars, for which the caller passes 0.
 */
export function topBarFactor(concreteBelowM: number): number {
  return concreteBelowM * 1000 > TOP_BAR_CONCRETE_BELOW_MM ? 1.3 : 1.0;
}

/**
 * Concrete cast below a beam's top bars, m: the depth less the top cover, the stirrup and the
 * outermost bar. Deeper rows of a top layer sit lower and have less below them; the outermost
 * is the one §25.4.2.5 is decided on, which errs long for the rows below it.
 */
export function concreteBelowTopBars(h: number, cover: number, stirrupDiaMm: number, barDiaMm: number): number {
  return h - cover - (stirrupDiaMm + barDiaMm) / 1000;
}

/** ψg from Table 25.4.2.5, by specified grade: the table lists 220, 420 and 500 MPa; above 550 the 1,3 is ACI 318's. */
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
  const general = input.confinement;
  const term = general ? Math.min((general.cbMm + (general.ktrMm ?? 0)) / db, MAX_CONFINEMENT_TERM) : undefined;
  const psiS = sizeFactor(db);
  const coefficient = term !== undefined
    ? (1.1 * term) / psiS
    : favourableSpacing ? (large ? 1.7 : 2.1) : (large ? 1.1 : 1.4);

  const computedMm = (fy * psiT * psiE * psiG) / (coefficient * lambda * developmentSqrtFc(fc)) * db;
  const ldMm = Math.max(computedMm, MIN_DEVELOPMENT_MM);

  const refs = [
    term !== undefined
      ? clause('cirsoc-201', edition, '25.4.2.4', 'longitud de anclaje para barras conformadas en tracción, expresión general')
      : clause('cirsoc-201', edition, 'Tabla 25.4.2.3', 'longitud de anclaje para barras conformadas en tracción'),
    ...(term !== undefined ? [clause('cirsoc-201', edition, 'Tabla 25.4.2.5', 'factores de modificación')] : []),
    clause('cirsoc-201', edition, '25.4.2.1', 'longitud de anclaje mínima'),
    ...capRef(fc, edition),
  ];
  const minimum = ldMm > computedMm;

  return {
    ldM: ldMm / 1000,
    computedM: computedMm / 1000,
    governedByMinimum: minimum,
    tableRow: term !== undefined ? 'general' : favourableSpacing ? 'favourable' : 'other',
    tableColumn: large ? 'db>16' : 'db<=16',
    coefficient,
    ...(term !== undefined ? { confinementTerm: term } : {}),
    refs,
    derivation: term !== undefined
      ? msg(minimum ? 'codes.cirsoc201.anchorage.developmentGeneralMinimum' : 'codes.cirsoc201.anchorage.developmentGeneral', {
        db, psiT, psiS, psiG, lambda, cb: round(general!.cbMm, 1), term: round(term, 2),
        computed: round(computedMm, 0), minimum: MIN_DEVELOPMENT_MM, ld: round(ldMm, 0),
      })
      : msg(minimum ? 'codes.cirsoc201.anchorage.developmentMinimum' : 'codes.cirsoc201.anchorage.development', {
        db, coefficient, psiT, psiG, lambda,
        computed: round(computedMm, 0), minimum: MIN_DEVELOPMENT_MM,
        ld: round(ldMm, 0),
        row: favourableSpacing ? 'codes.cirsoc201.anchorage.rowFavourable' : 'codes.cirsoc201.anchorage.rowOther',
      }),
  };
}

/**
 * §25.4.3.1 — ldh for a deformed bar ending in a standard hook, the LARGEST of:
 *
 *   (a) (0,24·fy·ψe·ψs·ψcc·ψr / (λ·√f'c))·db
 *   (b) 8·db
 *   (c) 150 mm
 *
 * Factors: ψe = 1 (§25.4.3.2 commentary: epoxy coating is not permitted in this
 * edition); ψs, ψcc, ψr default to 1.0 — the un-credited baseline, since the
 * caller rarely knows the confinement/cover conditions the sub-1.0 factors
 * require. λ defaults to 1.0 (normal weight).
 *
 * Returns metres because every consumer in the detailing pipeline works in metres.
 */
export interface HookedDevelopmentInputs {
  diameterMm: number;
  fy: number;
  fc: number;
  /** λ — lightweight concrete factor. 1,0 for normal weight. */
  lambda?: number;
  edition: RegulationEdition;
}

export interface HookedDevelopmentResult {
  /** Hooked development length ldh, in METRES. */
  ldhM: number;
  /** The (a) term before the (b)/(c) floors, m. */
  computedM: number;
  governedBy: 'formula' | '8db' | '150mm';
  refs: ClauseRef[];
}

export function deriveHookedDevelopment(input: HookedDevelopmentInputs): HookedDevelopmentResult {
  const { diameterMm: db, fy, fc, edition } = input;
  const lambda = input.lambda ?? 1.0;
  const psiE = 1.0;   // epoxy coating is not permitted in this edition.
  const psiS = 1.0;   // no size credit taken.
  const psiCC = 1.0;  // no concrete-cover credit taken.
  const psiR = 1.0;   // no confinement credit taken.

  const aMm = (0.24 * fy * psiE * psiS * psiCC * psiR) / (lambda * developmentSqrtFc(fc)) * db;
  const bMm = 8 * db;
  const cMm = 150;
  const ldhMm = Math.max(aMm, bMm, cMm);
  const governedBy = ldhMm === aMm ? 'formula' : ldhMm === bMm ? '8db' : '150mm';

  return {
    ldhM: ldhMm / 1000,
    computedM: aMm / 1000,
    governedBy,
    refs: [clause('cirsoc-201', edition, '25.4.3.1',
      'longitud de anclaje de ganchos normales en tracción'), ...capRef(fc, edition)],
  };
}

/**
 * §25.4.9 — ldc for a deformed bar in compression, the LARGER of (a) and (b) of §25.4.9.1:
 *
 *   (a) the larger of (0,24·fy·ψr / (λ·√f'c))·db and 0,043·fy·ψr·db   (§25.4.9.2)
 *   (b) 200 mm
 *
 * «Se permite tomar ψr igual a la unidad» (§25.4.9.3): no confinement credit is taken, as in
 * `deriveHookedDevelopment`. √f'c is limited to 8,3 MPa (§25.4.1.4). No hook shortens it:
 * «Los ganchos y las barras conformadas con cabeza no se deben emplear para anclar barras en
 * compresión» (§25.4.1.2).
 */
export interface CompressionDevelopmentResult {
  /** ldc, in METRES. */
  ldcM: number;
  governedBy: 'sqrtFc' | 'fy' | '200mm';
  refs: ClauseRef[];
}

export function deriveCompressionDevelopment(input: { diameterMm: number; fy: number; fc: number; lambda?: number; edition: RegulationEdition }): CompressionDevelopmentResult {
  const { diameterMm: db, fy, fc, edition } = input;
  const lambda = input.lambda ?? 1.0;
  const psiR = 1.0;
  const aMm = (0.24 * fy * psiR) / (lambda * developmentSqrtFc(fc)) * db;
  const bMm = 0.043 * fy * psiR * db;
  const ldcMm = Math.max(aMm, bMm, 200);
  return {
    ldcM: ldcMm / 1000,
    governedBy: ldcMm === 200 ? '200mm' : ldcMm === aMm ? 'sqrtFc' : 'fy',
    refs: [
      clause('cirsoc-201', edition, '25.4.9.1', 'longitud de anclaje en compresión'),
      clause('cirsoc-201', edition, '25.4.1.2', 'los ganchos no se deben emplear para anclar barras en compresión'),
    ],
  };
}

/** §25.5.5.1: compression lap splice, mm, never under 300 mm, a third longer where f'c is under 21 MPa. */
export const compressionLapMm = (fy: number, diameterMm: number, fc = 21): number =>
  Math.max(fy <= 420 ? 0.071 * fy * diameterMm : (0.13 * fy - 24) * diameterMm, MIN_LAP_MM) * (fc < 21 - 1e-9 ? 4 / 3 : 1);

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
