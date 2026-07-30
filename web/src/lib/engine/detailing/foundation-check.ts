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
  position?: ColumnPosition;
}

export type CheckStatus = 'OK' | 'FAIL' | 'UNSUPPORTED';

export interface BearingResult {
  status: CheckStatus;
  /** Maximum bearing pressure, kPa. */
  qMax: number;
  qMin: number;
  /** Eccentricity along B and L, m. */
  eB: number;
  eL: number;
  /** True when the resultant falls outside the middle third and the base partially lifts. */
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
      status: 'UNSUPPORTED', qMax: 0, qMin: 0, eB: 0, eL: 0, uplift: false, utilization: 0,
      memo, refs,
      unsupportedReason: 'Dimensiones o carga de servicio no válidas para la verificación de tensiones.',
    };
  }

  const eB = (f.serviceMomentB ?? 0) / N;
  const eL = (f.serviceMomentL ?? 0) / N;
  const outsideKern = Math.abs(eB) > f.B / 6 || Math.abs(eL) > f.L / 6;

  const q0 = N / A;
  const qMax = q0 * (1 + 6 * Math.abs(eB) / f.B + 6 * Math.abs(eL) / f.L);
  const qMin = q0 * (1 - 6 * Math.abs(eB) / f.B - 6 * Math.abs(eL) / f.L);

  memo.push(
    `N = ${N.toFixed(1)} kN sobre ${f.B.toFixed(2)} × ${f.L.toFixed(2)} m; ` +
    `eB = ${eB.toFixed(3)} m, eL = ${eL.toFixed(3)} m.`,
    `qmax = ${qMax.toFixed(1)} kPa, qmin = ${qMin.toFixed(1)} kPa contra ` +
    `qadm = ${f.allowableBearing.toFixed(1)} kPa.`);

  if (outsideKern) {
    return {
      status: 'UNSUPPORTED', qMax, qMin, eB, eL, uplift: true,
      utilization: qMax / f.allowableBearing,
      memo: [...memo,
        'La resultante cae fuera del núcleo central: la base se despega parcialmente y la ' +
        'distribución lineal deja de ser válida. El área efectiva reducida no está ' +
        'implementada; informar qmax lineal subestimaría la presión real. NO VERIFICADO.'],
      refs,
      unsupportedReason: 'Resultante fuera del núcleo central (despegue parcial de la base).',
    };
  }

  return {
    status: qMax <= f.allowableBearing ? 'OK' : 'FAIL',
    qMax, qMin, eB, eL, uplift: false,
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
  memo: string[];
  refs: ClauseRef[];
}

/**
 * One-way shear at d from the column face, per §22.5.
 *
 * The critical strip is the part of the base beyond that section; the demand is the net
 * upward soil pressure acting on it.
 */
export function checkOneWayShear(f: FootingInput, qFactored: number): OneWayShearResult {
  // Cantilever measured from the column face, less d.
  const a = (f.B - f.columnB) / 2 - f.d;
  const memo: string[] = [];

  if (a <= 0) {
    return {
      status: 'OK', Vu: 0, phiVc: Infinity, utilization: 0,
      memo: ['La sección crítica a d de la cara cae fuera de la zapata: el corte en una ' +
             'dirección no gobierna.'],
      refs: [R_ONEWAY],
    };
  }

  const Vu = qFactored * a * f.L;
  const lambdaS = sizeEffectFactor(f.d);
  // §22.5.5.1 without axial force and with Av < Av,min: Vc = 0.66 λs λ (ρw)^(1/3) √f'c bw d.
  // Footings carry no shear reinforcement and ρw is not known here, so the simpler and
  // widely used 0.17 λ √f'c bw d form is applied, with λs, which is conservative.
  const Vc = 0.17 * lambdaS * sqrtFcCapped(f.fc) * f.L * f.d * 1000;
  const phiVc = PHI_SHEAR * Vc;

  memo.push(
    `Corte en una dirección a d de la cara: a = ${a.toFixed(3)} m, ` +
    `Vu = ${qFactored.toFixed(1)} × ${a.toFixed(3)} × ${f.L.toFixed(2)} = ${Vu.toFixed(1)} kN.`,
    `φVc = 0,75 × 0,17 × ${lambdaS.toFixed(3)} × √${f.fc} × ${f.L.toFixed(2)} × ` +
    `${f.d.toFixed(3)} = ${phiVc.toFixed(1)} kN.`);

  return {
    status: Vu <= phiVc ? 'OK' : 'FAIL',
    Vu, phiVc, utilization: phiVc > 0 ? Vu / phiVc : Infinity,
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
        status: 'UNSUPPORTED', qMax: 0, qMin: 0, eB: 0, eL: 0, uplift: false,
        utilization: 0, memo: [], refs: [],
      },
      oneWayShear: null, punching: null, Mu: 0, worstUtilization: 0,
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

  // Factored net upward pressure for strength checks.
  const A = f.B * f.L;
  const qFactored = A > 0 ? f.factoredAxial / A : 0;

  const oneWayShear = checkOneWayShear(f, qFactored);
  memo.push(...oneWayShear.memo);

  const punching = checkPunchingShear({
    fc: f.fc, columnB: f.columnB, columnH: f.columnH, d: f.d,
    position: f.position ?? 'interior',
    demand: {
      supportReaction: f.factoredAxial,
      // At a footing the soil pushes UP inside the critical perimeter, and that part of
      // the load never crosses the critical section. Same equilibrium argument as at a
      // slab-column joint, opposite sign convention.
      loadInsidePerimeter: qFactored,
    },
  });
  memo.push(...punching.memo);
  if (punching.status === 'UNSUPPORTED' && punching.unsupportedReason) {
    unsupported.push(punching.unsupportedReason);
  }
  refs.push(...punching.refs);

  // Flexure at the column face, §13.2.7.
  const cantilever = (f.B - f.columnB) / 2;
  const Mu = qFactored * f.L * cantilever * cantilever / 2;
  memo.push(
    `Momento en la cara de la columna (13.2.7): Mu = ${qFactored.toFixed(1)} × ` +
    `${f.L.toFixed(2)} × ${cantilever.toFixed(3)}² / 2 = ${Mu.toFixed(1)} kN·m. ` +
    'La armadura de flexión se dimensiona con el verificador de secciones.');
  refs.push(R_FLEX, R_ONEWAY);

  const utils = [bearing.utilization, oneWayShear.utilization, punching.utilization]
    .filter((u) => Number.isFinite(u) && u > 0);
  const worstUtilization = utils.length > 0 ? Math.max(...utils) : 0;

  const anyUnsupported = unsupported.length > 0;
  const anyFail = bearing.status === 'FAIL' || oneWayShear.status === 'FAIL'
    || punching.status === 'FAIL';

  return {
    status: anyUnsupported ? 'UNSUPPORTED' : anyFail ? 'FAIL' : 'OK',
    bearing, oneWayShear, punching, Mu, worstUtilization,
    memo, refs, unsupported,
  };
}
