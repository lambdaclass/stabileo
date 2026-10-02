/**
 * Isolated spread footings — productizing a solver capability that was never reachable.
 *
 * ── What was already there ─────────────────────────────────────
 *
 * The WASM engine exports `check_spread_footings`, and `wasm-solver.ts` wraps it as
 * `checkSpreadFootings`. The only caller in the entire codebase is
 * `ProVerificationTab.svelte`, which is dead code — the PRO panel routes the design tab
 * to `ProRcWorkflowTab`, so that component never mounts. A real solver capability has
 * been sitting unreachable.
 *
 * ── What this adds ─────────────────────────────────────────────
 *
 * An app-side footing check that a user can actually reach, assembled from outputs the
 * solver already produces:
 *
 *   * bearing pressure and eccentricity, from the support reaction (`reactions`), which
 *     is exactly the column load delivered to the footing;
 *   * two-way (punching) shear, from the punching engine, whose demand is the same
 *     support reaction less the soil pressure inside the critical perimeter — a genuine
 *     equilibrium free body, not an approximation;
 *   * one-way (beam) shear at d from the column face;
 *   * flexure at the column face.
 *
 * ── What is deliberately NOT here ──────────────────────────────
 *
 * Combined and strip footings, mats and rafts, piles and pile caps, settlement, and
 * soil-structure interaction beyond a linear bearing distribution. Each returns an
 * explicit unsupported outcome. A footing module that quietly treats a two-column
 * combined base as two isolated ones would be producing a wrong answer that looks right.
 *
 * Pure: no store, no runes. Forces kN, moments kN·m, lengths m, pressures kPa.
 */

import { clause, type ClauseRef } from '../../codes/regulation';
import {
  PHI_SHEAR, checkPunchingShear, sizeEffectFactor, sqrtFcCapped,
  type ColumnPosition, type PunchingCheck,
} from './punching-shear';
import {
  axisPressure, footingCentroidActions, footingUnbalancedMoment, planPressure,
  type FootingCentroidActions, type FootingUnbalancedMoment,
} from './footing-actions';

const R_FOUND = clause('cirsoc-201', '2025', '13.2', 'generalidades de fundaciones');
const R_ONEWAY = clause('cirsoc-201', '2025', '22.5', 'resistencia a corte en una dirección');
const R_FLEX = clause('cirsoc-201', '2025', '13.2.7', 'sección crítica para momento en zapatas');
const R_SOIL = clause('cirsoc-201', '2025', '13.3.1', 'zapatas superficiales');

export type FootingKind = 'isolated' | 'combined' | 'strip' | 'mat' | 'pileCap';

export interface FootingInput {
  kind: FootingKind;
  /** Plan dimensions, m. */
  B: number;
  L: number;
  /** Overall thickness, m. */
  thickness: number;
  /** Effective depth, m. */
  d: number;
  columnB: number;
  columnH: number;
  fc: number;
  /** Allowable bearing pressure, kPa. Service-level. */
  allowableBearing: number;
  /** Axial load from the column, kN (service level for bearing). */
  serviceAxial: number;
  /** Factored axial load, kN, for strength checks. */
  factoredAxial: number;
  /** Service moments about the two plan axes, kN·m. */
  serviceMomentB?: number;
  serviceMomentL?: number;
  /**
   * FACTORED moments about the two plan axes, kN·m, from the governing strength
   * combination. Used for the one-way-shear strip integral and the column-face
   * flexure demand. The punching deduction is unaffected for a centred column:
   * the bilinear pressure averages to Nu/A over the centred enclosed area.
   */
  factoredMomentB?: number;
  factoredMomentL?: number;
  /**
   * Plan offset of the footing CENTROID from the supported node, m, in local axes.
   *
   * The moment `N · e` this creates about the centroid is part of every pressure-dependent
   * check here — see `footing-actions.ts` for the transformation and for why it was missing.
   * Optional, defaulting to zero, so a centred footing reads exactly as it did before.
   */
  eccentricityB?: number;
  eccentricityL?: number;
  position?: ColumnPosition;
}

/**
 * The one pressure field every check in this module integrates.
 *
 * Built once per `checkFooting` call and threaded to each check, so bearing, one-way shear,
 * punching and flexure cannot end up describing three different footings. `checkBearing` and
 * `checkOneWayShear` are also reachable on their own — they build their own from the same
 * function, never a second formula.
 */
function serviceActions(f: FootingInput): FootingCentroidActions {
  return footingCentroidActions({
    B: f.B, L: f.L, axial: f.serviceAxial,
    momentB: f.serviceMomentB, momentL: f.serviceMomentL,
    eccentricityB: f.eccentricityB, eccentricityL: f.eccentricityL,
  });
}

function factoredActions(f: FootingInput): FootingCentroidActions {
  return footingCentroidActions({
    B: f.B, L: f.L, axial: f.factoredAxial,
    momentB: f.factoredMomentB, momentL: f.factoredMomentL,
    eccentricityB: f.eccentricityB, eccentricityL: f.eccentricityL,
  });
}

export type CheckStatus = 'OK' | 'FAIL' | 'UNSUPPORTED';

export interface BearingResult {
  status: CheckStatus;
  /** Maximum bearing pressure, kPa. */
  qMax: number;
  qMin: number;
  /**
   * Offset of the pressure resultant from the footing CENTROID along B and L, m.
   *
   * The TOTAL eccentricity, which is what a bearing check needs: the applied moment's
   * `M/N` together with the geometric `−e` of the centroid from the node. Previously this
   * was `M/N` alone, and a deliberately eccentric footing was checked as if it were centred.
   * The two constituents are reported separately below so the sum is auditable.
   */
  eB: number;
  eL: number;
  /** The geometric term: column centre from the centroid, m. `−eccentricityB/L`. */
  geometricOffsetB: number;
  geometricOffsetL: number;
  /** The applied-moment term, m — magnitude, enveloped over both orientations. */
  momentEccentricityB: number;
  momentEccentricityL: number;
  /**
   * True when the base does not keep full contact — `q_min < 0`.
   *
   * The biaxial full-contact boundary is the kern RHOMBUS, not the two per-axis limits taken
   * separately; see `footingCentroidActions`. This flags a strict superset of what the
   * per-axis test flagged.
   */
  uplift: boolean;
  utilization: number;
  memo: string[];
  refs: ClauseRef[];
  unsupportedReason?: string;
}

/**
 * Linear bearing-pressure distribution with biaxial eccentricity.
 *
 * When the resultant leaves the kern the base lifts off and the linear distribution is
 * no longer valid. The correct treatment is a reduced effective bearing area, and this
 * module does NOT implement it — it reports UNSUPPORTED. Reporting a linear q_max for a
 * partially uplifted base under-states the real peak pressure, which is the wrong
 * direction to be wrong in.
 */
export function checkBearing(f: FootingInput): BearingResult {
  const N = f.serviceAxial;
  const A = f.B * f.L;
  const memo: string[] = [];
  const refs = [R_SOIL];

  if (!(A > 0) || !(N > 0)) {
    return {
      status: 'UNSUPPORTED', qMax: 0, qMin: 0, eB: 0, eL: 0,
      geometricOffsetB: 0, geometricOffsetL: 0,
      momentEccentricityB: 0, momentEccentricityL: 0,
      uplift: false, utilization: 0,
      memo, refs,
      unsupportedReason: 'Dimensiones o carga de servicio no válidas para la verificación de tensiones.',
    };
  }

  const act = serviceActions(f);
  const eB = act.b.worstResultantOffset;
  const eL = act.l.worstResultantOffset;
  const { qMax, qMin } = act;
  const common = {
    geometricOffsetB: act.b.columnOffset, geometricOffsetL: act.l.columnOffset,
    momentEccentricityB: act.b.momentEccentricity,
    momentEccentricityL: act.l.momentEccentricity,
  };

  memo.push(
    `N = ${N.toFixed(1)} kN sobre ${f.B.toFixed(2)} × ${f.L.toFixed(2)} m; ` +
    `eB = ${eB.toFixed(3)} m, eL = ${eL.toFixed(3)} m.`);
  // The decomposition is printed whenever the footing is offset, because the sum is the whole
  // correction: a reader who sees only the total cannot tell an applied moment from a
  // deliberate plan eccentricity, and only one of the two is theirs to remove.
  if (act.b.columnOffset !== 0 || act.l.columnOffset !== 0) {
    memo.push(
      `Excentricidad respecto del CENTROIDE de la zapata: término geométrico ` +
      `(N·e por el desplazamiento del centroide respecto del nudo) ` +
      `${act.b.columnOffset.toFixed(3)} / ${act.l.columnOffset.toFixed(3)} m más el término ` +
      `del momento aplicado ±${act.b.momentEccentricity.toFixed(3)} / ` +
      `±${act.l.momentEccentricity.toFixed(3)} m (envolvente de ambos signos).`);
  }
  memo.push(
    `qmax = ${qMax.toFixed(1)} kPa, qmin = ${qMin.toFixed(1)} kPa contra ` +
    `qadm = ${f.allowableBearing.toFixed(1)} kPa.`);

  if (!act.fullContact) {
    return {
      status: 'UNSUPPORTED', qMax, qMin, eB, eL, ...common, uplift: true,
      utilization: qMax / f.allowableBearing,
      memo: [...memo,
        'La resultante cae fuera del núcleo central: la base se despega parcialmente y la ' +
        'distribución lineal deja de ser válida. El área efectiva reducida no está ' +
        'implementada; informar qmax lineal subestimaría la presión real. NO VERIFICADO.' +
        (act.axisOutsideKern.b || act.axisOutsideKern.l
          ? ''
          : ' Ninguno de los dos ejes excede B/6 ni L/6 por separado: es la combinación ' +
            'biaxial la que levanta una esquina (qmin < 0).')],
      refs,
      unsupportedReason: 'Resultante fuera del núcleo central (despegue parcial de la base).',
    };
  }

  return {
    status: qMax <= f.allowableBearing ? 'OK' : 'FAIL',
    qMax, qMin, eB, eL, ...common, uplift: false,
    utilization: qMax / f.allowableBearing,
    memo, refs,
  };
}

export interface OneWayShearResult {
  status: CheckStatus;
  /** Factored shear at the critical section, kN. */
  Vu: number;
  /** φV_c, kN. */
  phiVc: number;
  utilization: number;
  /**
   * Which footing edge the governing strip reaches, in centroid coordinates.
   *
   * Both are evaluated. A footing whose column is offset in plan has two unequal cantilevers,
   * and the longer one is not always the one under the heavier pressure — the applied moment
   * can put the peak pressure over the SHORT cantilever, and which product is larger is not
   * decidable in advance. Null when no critical section falls inside the base.
   */
  governingSide: 'low' | 'high' | null;
  /** Cantilever beyond the governing critical section, m. */
  cantilever: number;
  /** Factored pressure at that critical section and at its edge, kPa. */
  qSection: number;
  qEdge: number;
  memo: string[];
  refs: ClauseRef[];
}

/** One candidate one-way section: a critical section at d from one column face. */
interface OneWaySide {
  side: 'low' | 'high';
  a: number;
  qSection: number;
  qEdge: number;
  Vu: number;
}

/**
 * One-way shear at d from the column face, per §22.5.
 *
 * The critical strip is the part of the base beyond that section; the demand is the net
 * upward soil pressure acting on it.
 */
export function checkOneWayShear(f: FootingInput, qFactored: number): OneWayShearResult {
  /*
   * Both directions. This checked the strips along B only, so the verdict depended on how the
   * footing was oriented: the same 1,5 × 3,0 m base passed one way round and failed at 380
   * against 158 kN turned 90°. The L direction is the B one on the base turned: B and L,
   * the column sides, the moments and the eccentricities swap.
   */
  const alongB = oneWayShearAlongB(f, qFactored);
  const turned: FootingInput = {
    ...f, B: f.L, L: f.B, columnB: f.columnH, columnH: f.columnB,
    serviceMomentB: f.serviceMomentL, serviceMomentL: f.serviceMomentB,
    factoredMomentB: f.factoredMomentL, factoredMomentL: f.factoredMomentB,
    eccentricityB: f.eccentricityL, eccentricityL: f.eccentricityB,
  };
  const alongL = oneWayShearAlongB(turned, qFactored);
  if (alongL.utilization > alongB.utilization) {
    return { ...alongL, memo: ['Dirección L (franjas a lo largo de L):', ...alongL.memo] };
  }
  return alongB;
}

function oneWayShearAlongB(f: FootingInput, qFactored: number): OneWayShearResult {
  const memo: string[] = [];
  const act = factoredActions(f);
  const uCol = act.b.columnOffset;

  // Geometry, per side. The cantilever beyond the critical section does NOT depend on the
  // moment — it is set by where the column sits — so it is computed once and the pressure
  // diagram is what the envelope varies.
  const aLow = f.B / 2 + uCol - f.columnB / 2 - f.d;
  const aHigh = f.B / 2 - uCol - f.columnB / 2 - f.d;

  if (aLow <= 0 && aHigh <= 0) {
    return {
      status: 'OK', Vu: 0, phiVc: Infinity, utilization: 0,
      governingSide: null, cantilever: 0, qSection: 0, qEdge: 0,
      memo: ['La sección crítica a d de la cara cae fuera de la zapata: el corte en una ' +
             'dirección no gobierna.'],
      refs: [R_ONEWAY],
    };
  }

  /**
   * The strip beyond the critical section, integrated exactly.
   *
   * The pressure is linear, so the exact integral over the strip is the trapezoid
   * `(q_section + q_edge)/2 · a · L`. Both column faces are tried under both moment
   * orientations and the largest demand governs.
   *
   * What this replaces: one cantilever `(B − columnB)/2 − d`, symmetric, with the heavy edge
   * ALWAYS placed at +B by an `Math.abs` on the moment. On an eccentric footing the symmetric
   * cantilever is neither of the two real ones, and forcing the heavy edge to +B picks the
   * favourable diagram half the time.
   */
  let governing: OneWaySide | null = null;
  for (const uR of act.b.resultantOffsets) {
    const q = axisPressure(qFactored, f.B, uR);
    for (const side of ['low', 'high'] as const) {
      const a = side === 'low' ? aLow : aHigh;
      if (!(a > 0)) continue;
      const edgeU = side === 'low' ? -f.B / 2 : f.B / 2;
      const secU = side === 'low' ? edgeU + a : edgeU - a;
      const qSection = q(secU);
      const qEdge = q(edgeU);
      const Vu = (qSection + qEdge) / 2 * a * f.L;
      if (governing === null || Vu > governing.Vu) {
        governing = { side, a, qSection, qEdge, Vu };
      }
    }
  }
  // Unreachable: at least one side has `a > 0` past the guard above.
  if (governing === null) {
    return {
      status: 'OK', Vu: 0, phiVc: Infinity, utilization: 0,
      governingSide: null, cantilever: 0, qSection: 0, qEdge: 0,
      memo: ['La sección crítica a d de la cara cae fuera de la zapata: el corte en una ' +
             'dirección no gobierna.'],
      refs: [R_ONEWAY],
    };
  }

  const a = governing.a;
  const qSec = governing.qSection;
  const qEdge = governing.qEdge;
  const Vu = governing.Vu;
  const eB = act.b.momentEccentricity;
  const lambdaS = sizeEffectFactor(f.d);
  // §22.5.5.1 row (c) for Av < Av,min (footings carry no shear reinforcement):
  // Vc = 0,66·λs·λ·(ρw)^⅓·√f'c·bw·d. ρw is floored at the minimum (0,0018) —
  // footing flexural steel is designed after this check, so the minimum is the
  // only honest value here, and it is the conservative floor. The previous
  // 0,17 form is row (a) — for members WITH minimum shear reinforcement — and
  // is ~2× the (c) value, NOT conservative as the old comment claimed.
  const RHO_W_MIN = 0.0018;
  const Vc = 0.66 * lambdaS * Math.cbrt(RHO_W_MIN) * sqrtFcCapped(f.fc) * f.L * f.d * 1000;
  const phiVc = PHI_SHEAR * Vc;

  memo.push(
    `Corte en una dirección a d de la cara: a = ${a.toFixed(3)} m, ` +
    (eB > 1e-9 || uCol !== 0
      ? `presión trapezoidal (eB de momento = ${eB.toFixed(3)} m, columna a ` +
        `${uCol.toFixed(3)} m del centroide, gobierna el lado ${governing.side}): ` +
        `Vu = (q_sección ${qSec.toFixed(1)} + q_borde ${qEdge.toFixed(1)}) / 2 × ${a.toFixed(3)} × ` +
        `${f.L.toFixed(2)} = ${Vu.toFixed(1)} kN.`
      : `Vu = ${qFactored.toFixed(1)} × ${a.toFixed(3)} × ${f.L.toFixed(2)} = ${Vu.toFixed(1)} kN.`),
    `φVc = 0,75 × ${(0.66 * Math.cbrt(RHO_W_MIN)).toFixed(4)} × ${lambdaS.toFixed(3)} × √${f.fc} × ${f.L.toFixed(2)} × ` +
    `${f.d.toFixed(3)} = ${phiVc.toFixed(1)} kN.`);

  return {
    status: Vu <= phiVc ? 'OK' : 'FAIL',
    Vu, phiVc, utilization: phiVc > 0 ? Vu / phiVc : Infinity,
    governingSide: governing.side, cantilever: a, qSection: qSec, qEdge,
    memo, refs: [R_ONEWAY],
  };
}

export interface FootingCheck {
  status: CheckStatus;
  bearing: BearingResult;
  oneWayShear: OneWayShearResult | null;
  punching: PunchingCheck | null;
  /** Factored moment at the column face, kN·m. */
  Mu: number;
  /**
   * Which column face the reported `Mu` is taken at, in centroid coordinates.
   *
   * Both are evaluated under both moment orientations. Null when the footing produced no
   * flexural demand at all — an unsupported kind, or a resultant outside the kern.
   */
  MuSide: 'low' | 'high' | null;
  /** Cantilever from that face to its edge, m, and the pressures bounding it, kPa. */
  MuCantilever: number;
  MuQFace: number;
  MuQEdge: number;
  /**
   * The soil pressure this check DEDUCTED inside the critical perimeter, kPa.
   *
   * Published because the punching free body is measured for closure downstream: the record
   * computes `N_u − (V_u + q · A_enclosed)` and must use the pressure the check actually
   * deducted, not a restatement of `N_u/A`. On a centred footing the two are the same number;
   * on an offset one they are not, and a residual measured against the wrong one would report
   * a broken free body for a check that closes exactly.
   */
  punchingLoadInsidePerimeter: number;
  /** Worst utilization across every check that produced one. */
  worstUtilization: number;
  memo: string[];
  refs: ClauseRef[];
  unsupported: string[];
}

/**
 * Complete isolated-footing check.
 *
 * `status` is UNSUPPORTED whenever ANY constituent check is unsupported. A footing
 * whose punching could not be verified is not a verified footing, and rolling that up
 * as OK because bearing and flexure passed is exactly the false-completeness failure
 * the capability model exists to prevent.
 */
export function checkFooting(f: FootingInput): FootingCheck {
  const unsupported: string[] = [];
  const memo: string[] = [];
  const refs: ClauseRef[] = [R_FOUND];

  if (f.kind !== 'isolated') {
    const label: Record<FootingKind, string> = {
      isolated: '', combined: 'Zapatas combinadas', strip: 'Zapatas corridas',
      mat: 'Plateas', pileCap: 'Cabezales de pilotes',
    };
    return {
      status: 'UNSUPPORTED',
      bearing: {
        status: 'UNSUPPORTED', qMax: 0, qMin: 0, eB: 0, eL: 0,
        geometricOffsetB: 0, geometricOffsetL: 0,
        momentEccentricityB: 0, momentEccentricityL: 0,
        uplift: false,
        utilization: 0, memo: [], refs: [],
      },
      oneWayShear: null, punching: null,
      Mu: 0, MuSide: null, MuCantilever: 0, MuQFace: 0, MuQEdge: 0,
      punchingLoadInsidePerimeter: 0,
      worstUtilization: 0,
      memo: [`${label[f.kind]} no están implementadas. Tratarlas como zapatas aisladas ` +
             'daría un resultado incorrecto con apariencia de correcto.'],
      refs,
      unsupported: [`${label[f.kind]} no implementadas.`],
    };
  }

  const bearing = checkBearing(f);
  memo.push(...bearing.memo);
  if (bearing.status === 'UNSUPPORTED' && bearing.unsupportedReason) {
    unsupported.push(bearing.unsupportedReason);
  }

  // ── One factored pressure field, for every strength check ──────
  //
  // Built from the SAME transformation the bearing check used, at factored level. Beyond the
  // kern the base lifts and the linear distribution under-states the peak, so the strength
  // checks are not emitted at all — the same refusal as the service path, and now with the
  // geometric `N · e` inside the test rather than the applied moment alone. A footing offset
  // far enough to lift under its own reaction used to pass this gate.
  const A = f.B * f.L;
  const qFactored = A > 0 ? f.factoredAxial / A : 0;
  const fact = factoredActions(f);
  const factoredUplift = !fact.fullContact;
  if (factoredUplift) {
    unsupported.push(
      `Con la combinación de resistencia gobernante la resultante cae fuera del núcleo ` +
      `(eB = ${fact.b.worstResultantOffset.toFixed(3)} m, ` +
      `eL = ${fact.l.worstResultantOffset.toFixed(3)} m, de los cuales ` +
      `${fact.b.columnOffset.toFixed(3)} / ${fact.l.columnOffset.toFixed(3)} m son ` +
      `geométricos): la distribución lineal no vale y las verificaciones de resistencia no ` +
      'se emiten.');
  }

  const oneWayShear = factoredUplift ? null : checkOneWayShear(f, qFactored);
  if (oneWayShear) memo.push(...oneWayShear.memo);

  /**
   * The soil pressure standing inside the critical perimeter, kPa.
   *
   * The mean of a LINEAR field over a region is its value at that region's centroid, and the
   * critical perimeter is centred on the COLUMN. On a centred footing the column centre is the
   * footing centroid, where the field equals `q0` exactly — which is why the previous constant
   * `qFactored` was exact there, moment or no moment, and why it stays bit-identical now.
   *
   * On an OFFSET footing the column centre is not the centroid and the mean is not `q0`. The
   * enveloped value is the SMALLEST over the orientation pairs, because a smaller deduction is
   * a larger `V_u`: taking the largest would credit the connection with soil relief that the
   * unfavourable moment sign removes. Floored at zero — a negative deduction would ADD to the
   * punching demand, which the free body does not support.
   */
  const uCol = fact.b.columnOffset;
  const vCol = fact.l.columnOffset;
  let insidePerimeter = qFactored;
  if (uCol !== 0 || vCol !== 0) {
    let least = Infinity;
    for (const uR of fact.b.resultantOffsets) {
      for (const vR of fact.l.resultantOffsets) {
        least = Math.min(least, planPressure(qFactored, f.B, f.L, uR, vR)(uCol, vCol));
      }
    }
    insidePerimeter = Math.max(0, least);
  }

  /**
   * The unbalanced moment the connection transfers, formed by the same free body.
   *
   * ── What was here before ─────────────────────────────────────
   *
   * Nothing. This call site passed `supportReaction` and `loadInsidePerimeter` and no moment
   * at all, so `checkPunchingShear` measured `M_sc = hypot(0, 0)` for every footing this app
   * has ever checked — including the ones whose flexural steel was being sized for a factored
   * moment fifty lines below. The §8.4.4.2 refusal inside that function was correct and
   * unreachable: the footing path never gave it a moment to refuse.
   *
   * ── Why the perimeter position decides whether it can be formed ──
   *
   * `footingUnbalancedMoment` takes moments about the centre of the enclosed region, and that
   * is the column axis only while the perimeter closes on all four sides. A TRUNCATED
   * perimeter (edge, corner) encloses a region whose centre has moved, so the axial force
   * starts contributing a moment of its own and the enclosed rectangle is no longer centred
   * on the column — two corrections this pass does not implement.
   *
   * Guessing is not an option here: the whole point of the exercise is that an unformed
   * moment must not read as zero. So the truncated case is declared unformed by name, which
   * `checkPunchingShear` turns into UNSUPPORTED. An edge or corner footing was already
   * carrying a truncated-perimeter assumption; it now also carries an honest statement that
   * its moment transfer was not evaluated.
   */
  const position = f.position ?? 'interior';
  let unbalanced: FootingUnbalancedMoment | null = null;
  if (position === 'interior') {
    unbalanced = footingUnbalancedMoment({
      B: f.B, L: f.L, q0: qFactored, axial: f.factoredAxial,
      momentB: f.factoredMomentB, momentL: f.factoredMomentL,
      eccentricityB: f.eccentricityB, eccentricityL: f.eccentricityL,
      // The enclosed rectangle of an untruncated perimeter: `(c + d) × (c + d)`, straight
      // sides per §22.6.4.1.1 — the same region `criticalSection` reports the area of.
      enclosedSpanB: f.columnB + f.d,
      enclosedSpanL: f.columnH + f.d,
    });
  }

  const punching = factoredUplift ? null : checkPunchingShear({
    fc: f.fc, columnB: f.columnB, columnH: f.columnH, d: f.d,
    position,
    demand: {
      supportReaction: f.factoredAxial,
      // At a footing the soil pushes UP inside the critical perimeter, and that part of
      // the load never crosses the critical section. Same equilibrium argument as at a
      // slab-column joint, opposite sign convention.
      loadInsidePerimeter: insidePerimeter,
      // Axis mapping, stated once: a moment ABOUT the L axis produces the eccentricity ALONG
      // B, so the footing's B-axis quantity is the punching engine's `unbalancedMomentY` and
      // the L-axis quantity is its `unbalancedMomentX`. Only the resultant magnitude reaches
      // the significance test, so the mapping cannot change the verdict — it is stated so the
      // memo and the record name the right axis.
      ...(unbalanced
        ? {
          unbalancedMomentY: unbalanced.b.Msc,
          unbalancedMomentX: unbalanced.l.Msc,
        }
        : {
          momentTransferNotFormed:
            `el perímetro crítico está truncado (columna de ${position === 'edge' ? 'borde' : 'esquina'}), ` +
            'de modo que la región encerrada no está centrada en el eje de la columna y el ' +
            'planteo de equilibrio implementado no es aplicable.',
        }),
    },
  });
  if (punching) {
    memo.push(...punching.memo);
    if (unbalanced) {
      // The free body is printed whenever it produced anything, because the RELIEF term is
      // the part a reader cannot reproduce from the applied moment alone — and on a footing
      // with plan eccentricity and no applied moment it is the entire unbalanced moment.
      memo.push(
        `Momento no balanceado en la conexión, por equilibrio del bloque interior al ` +
        `perímetro crítico y respecto de su centro: eje B → aplicado ` +
        `${unbalanced.b.applied.toFixed(1)} kN·m menos el alivio de la presión encerrada ` +
        `${unbalanced.b.relief.toFixed(1)} kN·m = ${unbalanced.b.Msc.toFixed(1)} kN·m; eje L → ` +
        `${unbalanced.l.applied.toFixed(1)} − ${unbalanced.l.relief.toFixed(1)} = ` +
        `${unbalanced.l.Msc.toFixed(1)} kN·m (envolvente de ambos signos del momento ` +
        'aplicado). La fuerza axial no aporta momento: actúa sobre el eje de la columna, que ' +
        'es el centro de la región encerrada mientras el perímetro no esté truncado.');
    }
    if (uCol !== 0 || vCol !== 0) {
      memo.push(
        `La presión descontada dentro del perímetro crítico se evalúa en el EJE DE LA ` +
        `COLUMNA (${uCol.toFixed(3)}, ${vCol.toFixed(3)}) m respecto del centroide, no en el ` +
        `centroide: ${insidePerimeter.toFixed(1)} kPa contra ${qFactored.toFixed(1)} kPa ` +
        'uniformes (envolvente menos favorable de ambos signos del momento).');
    }
    if (punching.status === 'UNSUPPORTED' && punching.unsupportedReason) {
      unsupported.push(punching.unsupportedReason);
    }
    refs.push(...punching.refs);
  }

  /**
   * Flexure at the column face, §13.2.7.1 — the §13.2.6.6 cantilever integral.
   *
   * `Mu = L·c²·(2·q_face + q_edge)/6`, exact for a linear pressure. BOTH faces are evaluated
   * under BOTH moment orientations: the previous version took the symmetric cantilever
   * `(B − columnB)/2` and forced the heavy edge to +B, so on an offset footing it reported the
   * moment of a footing that does not exist. The larger of the two real products governs, and
   * the longer cantilever is not always it.
   */
  let Mu = 0;
  let MuSide: 'low' | 'high' | null = null;
  let MuCantilever = 0;
  let MuQFace = 0;
  let MuQEdge = 0;
  if (!factoredUplift) {
    const cLow = f.B / 2 + uCol - f.columnB / 2;
    const cHigh = f.B / 2 - uCol - f.columnB / 2;
    for (const uR of fact.b.resultantOffsets) {
      const q = axisPressure(qFactored, f.B, uR);
      for (const side of ['low', 'high'] as const) {
        const c = side === 'low' ? cLow : cHigh;
        if (!(c > 0)) continue;
        const edgeU = side === 'low' ? -f.B / 2 : f.B / 2;
        const faceU = side === 'low' ? edgeU + c : edgeU - c;
        const qFace = q(faceU);
        const qEdge = q(edgeU);
        const m = f.L * c * c * (2 * qFace + qEdge) / 6;
        if (MuSide === null || m > Mu) {
          Mu = m; MuSide = side; MuCantilever = c; MuQFace = qFace; MuQEdge = qEdge;
        }
      }
    }
  }
  memo.push(
    `Momento en la cara de la columna (13.2.7): Mu = ${Mu.toFixed(1)} kN·m` +
    (fact.b.momentEccentricity > 1e-9 || uCol !== 0
      ? ` (presión trapezoidal, eB de momento = ${fact.b.momentEccentricity.toFixed(3)} m, ` +
        `columna a ${uCol.toFixed(3)} m del centroide, gobierna el lado ` +
        `${MuSide ?? '—'} con un voladizo de ${MuCantilever.toFixed(3)} m). `
      : ' (presión uniforme). ') +
    'La armadura de flexión se dimensiona con el verificador de secciones.');
  refs.push(R_FLEX, R_ONEWAY);

  const utils = [bearing.utilization, oneWayShear?.utilization, punching?.utilization]
    .filter((u): u is number => typeof u === 'number' && Number.isFinite(u) && u > 0);
  const worstUtilization = utils.length > 0 ? Math.max(...utils) : 0;

  const anyUnsupported = unsupported.length > 0;
  const anyFail = bearing.status === 'FAIL' || oneWayShear?.status === 'FAIL'
    || punching?.status === 'FAIL';

  return {
    status: anyUnsupported ? 'UNSUPPORTED' : anyFail ? 'FAIL' : 'OK',
    bearing, oneWayShear, punching,
    Mu, MuSide, MuCantilever, MuQFace, MuQEdge,
    punchingLoadInsidePerimeter: insidePerimeter,
    worstUtilization,
    memo, refs, unsupported,
  };
}
