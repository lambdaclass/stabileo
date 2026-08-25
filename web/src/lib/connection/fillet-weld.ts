/**
 * Fillet welds — CIRSOC 301-2018 §J.2.2 and §J.2.4.
 *
 * ── What the shipped text gives, and it is a lot ────────────────────
 *
 *   · **§J.2.2(a)** — «El área efectiva será el producto de la longitud efectiva del filete por
 *     el espesor efectivo de garganta.» For a manual fillet the throat is `0,707 w`; for
 *     submerged arc the clause overrides it — the leg itself up to 9 mm, and the theoretical
 *     throat plus 3 mm above that.
 *   · **§J.2.4, Tabla J.2.5** — `Rn = φ Fnw Awe (10⁻¹)` with `φ = 0,60` and `Fnw = 0,60 FEXX`
 *     for shear on the effective area of a fillet.
 *   · **Tabla J.2.4** — minimum leg by the thickness of the THICKER part joined: 3, 5, 6, 8 mm.
 *   · **§J.2.2(b)** — maximum leg along an edge: the material thickness below 6 mm, and
 *     thickness − 2 mm at or above it.
 *   · **§J.2.2(b)** — minimum effective length is `4 w`; below that «se considerará que el lado
 *     de la soldadura no excede de 1/4 de la longitud efectiva», which is a REDUCTION of the
 *     size used, not a refusal.
 *   · **§J.2.1** — end-loaded fillets longer than `100 w` lose effectiveness: `β = 1,2 −
 *     0,002 (L/w) ≤ 1`, and above `300 w` the effective length is capped at `180 w`.
 *
 * ── What it does not do ─────────────────────────────────────────────
 *
 * It does not choose a size or a length. Both are inputs, because both are decisions a detailer
 * makes — and a weld sized by this module to exactly meet the demand would look designed while
 * being a number nobody chose. What it does is evaluate a chosen weld and say which clause each
 * verdict came from.
 *
 * The base-metal limit state is deliberately absent from the capacity: Tabla J.2.5 says the base
 * metal for a fillet is «Gobernado por la Sección J.4», a different chapter about the connected
 * elements, and computing it needs the member's net and gross areas at the connection. Reported
 * as an outstanding check rather than quietly dropped.
 */

/** How the fillet is laid, which changes the effective throat — §J.2.2(a). */
export type WeldProcess = 'manual' | 'submergedArc';

/** Whether the weld is loaded along its axis at a member end — §J.2.1's β applies only then. */
export type WeldLoading = 'endLoaded' | 'other';

export interface WeldInput {
  /** Leg size `w`, mm. An input: a detailer's decision, never derived from the demand. */
  legMm?: number;
  /** Actual length of one run, mm. */
  lengthMm?: number;
  /** How many runs of that length. Two for a fillet on both sides. */
  runs?: number;
  /** Electrode classification strength `FEXX`, MPa. */
  fexxMPa?: number;
  /** Thickness of the THICKER part joined, mm — Tabla J.2.4's axis. */
  thickerPartMm?: number;
  /** Thickness of the THINNER part, mm — the maximum-size rule's axis. */
  thinnerPartMm?: number;
  process?: WeldProcess;
  loading?: WeldLoading;
  /** Required shear on the weld, kN. */
  demandKN?: number;
}

export type WeldCheckState = 'adequate' | 'exceeded' | 'unavailable';

export interface WeldCheck {
  id: 'strength' | 'minimumSize' | 'maximumSize' | 'minimumLength' | 'baseMetal';
  state: WeldCheckState;
  clause: string;
  /** kN for strength, mm for the geometric ones. Null when unavailable. */
  value: number | null;
  limit: number | null;
  noteKeys: readonly string[];
}

export type WeldState =
  | 'notDesigned'
  | 'incomplete'
  | 'designed'
  | 'exceeded'
  | 'notVerifiable'
  /** Never returned. Same reason as the bolted joint: no metallic authority exists. */
  | 'verified';

export interface WeldDesign {
  state: WeldState;
  checks: WeldCheck[];
  /** Effective throat, mm. Null without a leg. */
  throatMm: number | null;
  /** Effective length of ONE run after §J.2.1, mm. Null without inputs. */
  effectiveLengthMm: number | null;
  /** Effective area of the whole weld, cm². */
  effectiveAreaCm2: number | null;
  missingKeys: readonly string[];
}

/** φ for shear on the effective area of a fillet — Tabla J.2.5. */
const PHI = 0.6;

/**
 * Tabla J.2.4 — minimum leg, mm, by the thickness of the thicker part joined.
 *
 * Transcribed as ranges rather than a formula, because that is how the table is written and a
 * fitted curve would answer for thicknesses the table brackets differently.
 */
export function minimumLegMm(thickerPartMm: number): number {
  if (thickerPartMm <= 6) return 3;
  if (thickerPartMm <= 13) return 5;
  if (thickerPartMm <= 19) return 6;
  return 8;
}

/**
 * §J.2.2(b) — maximum leg along an edge, mm.
 *
 * «Menor o igual que el espesor del material para cordones a lo largo de los bordes de material
 * de espesor menor que 6 mm» and «menos 2 mm» at or above 6 mm.
 */
export function maximumLegMm(thinnerPartMm: number): number {
  return thinnerPartMm < 6 ? thinnerPartMm : thinnerPartMm - 2;
}

/**
 * §J.2.2(a) — effective throat, mm.
 *
 * `0,707 w` for a manual fillet. Submerged arc gets the clause's override: the leg itself up to
 * 9 mm, and the theoretical throat plus 3 mm above it — a real difference of up to 40 %, which
 * is why the process is an input rather than an assumption.
 */
export function effectiveThroatMm(legMm: number, process: WeldProcess = 'manual'): number {
  if (process !== 'submergedArc') return 0.707 * legMm;
  return legMm <= 9 ? legMm : 0.707 * legMm + 3;
}

/**
 * §J.2.1 — effective length of an end-loaded fillet, mm.
 *
 * A long end-loaded fillet does not carry uniformly, so the code discounts it. Applies ONLY to
 * end-loaded welds; anywhere else the effective length is the actual one, and applying β there
 * would understate a weld the code does not discount.
 */
export function effectiveLengthMm(
  lengthMm: number, legMm: number, loading: WeldLoading = 'other',
): number {
  if (loading !== 'endLoaded' || legMm <= 0) return lengthMm;
  const ratio = lengthMm / legMm;
  if (ratio <= 100) return lengthMm;
  if (ratio > 300) return 180 * legMm;
  const beta = Math.min(1, 1.2 - 0.002 * ratio);
  return beta * lengthMm;
}

const none = (id: WeldCheck['id'], clause: string, keys: string[]): WeldCheck =>
  ({ id, state: 'unavailable', clause, value: null, limit: null, noteKeys: keys });

export function designFilletWeld(input: WeldInput): WeldDesign {
  const {
    legMm, lengthMm, runs = 1, fexxMPa, thickerPartMm, thinnerPartMm,
    process = 'manual', loading = 'other', demandKN,
  } = input;

  if (!(legMm && legMm > 0) || !(lengthMm && lengthMm > 0)) {
    return {
      state: 'notDesigned', checks: [], throatMm: null,
      effectiveLengthMm: null, effectiveAreaCm2: null,
      missingKeys: [
        ...(legMm && legMm > 0 ? [] : ['weld.missing.leg']),
        ...(lengthMm && lengthMm > 0 ? [] : ['weld.missing.length']),
      ],
    };
  }

  const missing: string[] = [];
  if (!(fexxMPa && fexxMPa > 0)) missing.push('weld.missing.fexx');
  if (!(thickerPartMm && thickerPartMm > 0)) missing.push('weld.missing.thickerPart');
  if (!(thinnerPartMm && thinnerPartMm > 0)) missing.push('weld.missing.thinnerPart');
  if (demandKN === undefined) missing.push('weld.missing.demand');

  const throat = effectiveThroatMm(legMm, process);
  const le = effectiveLengthMm(lengthMm, legMm, loading);
  // Awe in cm²: throat and length in mm → /100.
  const areaCm2 = (throat * le * runs) / 100;

  const checks: WeldCheck[] = [];

  // ── §J.2.4 electrode strength ───────────────────────────────────
  if (!fexxMPa || demandKN === undefined) {
    checks.push(none('strength', 'J.2.4', [
      ...(fexxMPa ? [] : ['weld.missing.fexx']),
      ...(demandKN === undefined ? ['weld.missing.demand'] : []),
    ]));
  } else {
    // Rn = φ (0,60 FEXX) Awe (10⁻¹)
    const cap = PHI * 0.6 * fexxMPa * areaCm2 * 0.1;
    checks.push({
      id: 'strength', state: demandKN <= cap ? 'adequate' : 'exceeded',
      clause: 'J.2.4', value: demandKN, limit: cap,
      noteKeys: [`weld.process.${process}`, `weld.loading.${loading}`],
    });
  }

  // ── Tabla J.2.4 minimum leg ─────────────────────────────────────
  checks.push(thickerPartMm
    ? {
        id: 'minimumSize', state: legMm >= minimumLegMm(thickerPartMm) ? 'adequate' : 'exceeded',
        clause: 'J.2.2(b)', value: legMm, limit: minimumLegMm(thickerPartMm),
        noteKeys: ['weld.note.minimumFromThicker'],
      }
    : none('minimumSize', 'J.2.2(b)', ['weld.missing.thickerPart']));

  // ── §J.2.2(b) maximum leg ───────────────────────────────────────
  checks.push(thinnerPartMm
    ? {
        id: 'maximumSize', state: legMm <= maximumLegMm(thinnerPartMm) ? 'adequate' : 'exceeded',
        clause: 'J.2.2(b)', value: legMm, limit: maximumLegMm(thinnerPartMm),
        noteKeys: ['weld.note.maximumFromThinner'],
      }
    : none('maximumSize', 'J.2.2(b)', ['weld.missing.thinnerPart']));

  // ── §J.2.2(b) minimum effective length ──────────────────────────
  checks.push({
    id: 'minimumLength', state: le >= 4 * legMm ? 'adequate' : 'exceeded',
    clause: 'J.2.2(b)', value: le, limit: 4 * legMm,
    /*
     * Below `4 w` the clause does not refuse the weld: «se considerará que el lado de la
     * soldadura no excede de 1/4 de la longitud efectiva». That is a reduction of the size used,
     * and this reports it rather than applying it silently — applying it would quietly change
     * the number the strength check was run against.
     */
    noteKeys: le >= 4 * legMm ? [] : ['weld.note.shortWeldReducesSize'],
  });

  /*
   * The base metal. Tabla J.2.5 says it is «Gobernado por la Sección J.4» — a different chapter,
   * about the connected elements, needing the member's net and gross areas at the connection.
   * Reported as outstanding rather than dropped: a weld check that omits the base metal is half
   * a check, and the half it omits can govern.
   */
  checks.push(none('baseMetal', 'J.4', ['weld.note.baseMetalGovernedByJ4']));

  const anyExceeded = checks.some((c) => c.state === 'exceeded');
  const CLAUSE_BLOCKED = new Set(['weld.note.baseMetalGovernedByJ4']);
  const blockedByInput = missing.length > 0 || checks.some(
    (c) => c.state === 'unavailable' && !c.noteKeys.some((k) => CLAUSE_BLOCKED.has(k)),
  );

  return {
    state: anyExceeded ? 'exceeded'
      : blockedByInput ? 'incomplete'
        /*
         * The base metal check can never run here, so a fillet weld in this app tops out at
         * `notVerifiable` — never `designed`, and never `verified`. Saying `designed` while a
         * governing limit state was never evaluated would be the claim this refuses.
         */
        : 'notVerifiable',
    checks,
    throatMm: throat,
    effectiveLengthMm: le,
    effectiveAreaCm2: areaCm2,
    missingKeys: missing,
  };
}
