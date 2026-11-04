/**
 * Isolated spread footings, CIRSOC 201-2025: a thin adapter over the engine.
 *
 * The check is the engine's, `check_isolated_footings` (`engine/src/postprocess/isolated_footing.rs`):
 * service bearing with biaxial eccentricity (the column's plan offset from the footing centroid
 * included), and under the factored loads one-way shear at d from each column face in both
 * directions (22.5, Tabla 22.5.5.1 (c)), punching on the critical perimeter for the column's
 * position (22.6) with the soil inside the perimeter deducted and the unbalanced moment formed by
 * equilibrium (a significant or unformed one is refused: 8.4.4.2 is not implemented), and the
 * column-face moment (13.2.7.1). A resultant outside the kern is refused, not reported.
 *
 * This module maps the app's `FootingInput` in and the engine's numbers out, and writes the
 * calculation memo from those numbers. It computes nothing of its own: without the engine
 * `checkFooting` throws `EngineUnavailableError`.
 *
 * Then the engine gate (as for CIRSOC 201 and 301): an OK footing is handed to the CERTIFIED
 * check (`certify_isolated_footings`, the same formulas in outward-rounded interval arithmetic)
 * and stays OK only if its utilization is proven below 1. Otherwise it becomes FAIL with the
 * reason in `engineRecheck` and the memo.
 *
 * The TypeScript implementation this replaced is the tests' oracle
 * (`__tests__/differential/foundation-check-oracle.ts`), compared with the engine on thousands
 * of random footings in `footing-engine.test.ts`.
 *
 * Not here: combined and strip footings, mats, pile caps, settlement. Each is refused by name.
 *
 * Forces kN, moments kN·m, lengths m, pressures kPa.
 */

import { clause, type ClauseRef } from '../../codes/regulation';
import type {
  ColumnPosition, CriticalSection, MomentTransferStatus, PunchingCheck, PunchingDemand, PunchingResistance,
} from './punching-shear';
import { checkIsolatedFootings, certifyIsolatedFootings } from '../wasm-solver';

const R_FOUND = clause('cirsoc-201', '2025', '13.2', 'generalidades de fundaciones');
const R_ONEWAY = clause('cirsoc-201', '2025', '22.5', 'resistencia a corte en una dirección');
const R_FLEX = clause('cirsoc-201', '2025', '13.2.7', 'sección crítica para momento en zapatas');
const R_SOIL = clause('cirsoc-201', '2025', '13.3.1', 'zapatas superficiales');
const R_CRIT = clause('cirsoc-201', '2025', '22.6.4.1', 'secciones críticas para corte en dos direcciones');
const R_VC = clause('cirsoc-201', '2025', 'Tabla 22.6.5.2', 'vc para elementos en dos direcciones sin armadura de corte');
const R_ALPHAS = clause('cirsoc-201', '2025', '22.6.5.3', 'valor de αs');
const R_LAMBDAS = clause('cirsoc-201', '2025', '22.5.5.1.3', 'factor de modificación por efecto de tamaño');
const R_SQRTFC = clause('cirsoc-201', '2025', '22.6.3.1', 'límite de √f´c');
const R_PHI = clause('cirsoc-201', '2025', '21.2', 'factores de reducción de resistencia');
const R_MOMENT_TRANSFER = clause('cirsoc-201', '2025', '8.4.4.2', 'transferencia de momento por corte excéntrico');
const R_DEMAND = clause('cirsoc-201', '2025', '22.6.4', 'corte en dos direcciones');

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
  /** The edge pressure may reach this many times the allowable while the mean stays under it (`BearingResistance`). */
  edgeFactor?: number;
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
  /** The certified re-check of an OK verdict (absent when the verdict was not OK). */
  engineRecheck?: FootingEngineRecheck;
}

export interface FootingEngineRecheck {
  certified: boolean;
  certifiedOk: boolean;
  utilizationLower?: number;
  utilizationUpper?: number;
  governingCheck?: string;
  reason?: string;
  /** The OK verdict was not confirmed and became FAIL. */
  disagrees: boolean;
}


// ─── Engine boundary ──────────────────────────────────────────

interface EngineAxis {
  columnOffset: number; momentEccentricity: number; resultantOffsets: [number, number];
  worstResultantOffset: number; kernLimit: number; outsideKern: boolean;
}
interface EngineOneWay {
  status: CheckStatus; vu: number; phiVc: number | null; utilization: number | null; direction: 'B' | 'L';
  governingSide?: 'low' | 'high'; cantilever: number; qSection: number; qEdge: number;
  momentEccentricity: number; columnOffset: number; lambdaS: number; rhoW: number;
}
interface EngineUnbalanced { msc: number; applied: number; relief: number; orientation: number }
interface EnginePunching {
  status: CheckStatus; vu: number; phiVc: number; utilization: number | null; demandVu: number;
  transferred: number; loadInside: number; bo: number; beta: number; d: number; enclosedArea: number;
  vc: number; vcA: number; vcB: number; vcC: number; governedBy: 'a' | 'b' | 'c'; lambdaS: number; alphaS: number;
  mscX: number; mscY: number; msc: number; threshold: number; significant: boolean;
  momentTransfer: MomentTransferStatus; unbalancedB?: EngineUnbalanced; unbalancedL?: EngineUnbalanced;
}
interface EngineFlexure { mu: number; side?: 'low' | 'high'; cantilever: number; qFace: number; qEdge: number }
interface EngineFooting {
  footingId: number; status: CheckStatus;
  bearing: { status: CheckStatus; qMax: number; qMin: number; b: EngineAxis; l: EngineAxis; uplift: boolean; utilization: number | null; refusal?: string };
  factoredB: EngineAxis; factoredL: EngineAxis; factoredUplift: boolean; qFactored: number;
  oneWayShear?: EngineOneWay; punching?: EnginePunching; flexureB: EngineFlexure; flexureL: EngineFlexure;
  punchingLoadInsidePerimeter: number; worstUtilization: number; refusals: string[];
}
interface EngineCertified {
  certified: boolean; certifiedOk: boolean; utilizationLower: number; utilizationUpper: number;
  governingCheck: string; reason?: string;
}

/** A non-finite number crosses JSON as null. */
const inf = (x: number | null | undefined): number => (x === null || x === undefined ? Infinity : x);

/** The soil's edge factor k (`FootingInput.edgeFactor`): 1 when none is stated. */
const edgeK = (f: FootingInput) => (f.edgeFactor && f.edgeFactor > 1 ? f.edgeFactor : 1);

function engineInput(f: FootingInput) {
  return {
    footingId: 0, kind: f.kind === 'pileCap' ? 'pileCap' : f.kind,
    b: f.B, l: f.L, thickness: f.thickness, d: f.d, columnB: f.columnB, columnH: f.columnH,
    // With an edge factor the engine holds the edge pressure to k times the allowable; the mean
    // is held to the allowable itself in `bearingFrom`.
    fc: f.fc, allowableBearing: f.allowableBearing * edgeK(f),
    serviceAxial: f.serviceAxial, factoredAxial: f.factoredAxial,
    serviceMomentB: f.serviceMomentB ?? 0, serviceMomentL: f.serviceMomentL ?? 0,
    factoredMomentB: f.factoredMomentB ?? 0, factoredMomentL: f.factoredMomentL ?? 0,
    eccentricityB: f.eccentricityB ?? 0, eccentricityL: f.eccentricityL ?? 0,
    position: f.position ?? 'interior',
  };
}

/** The engine's check of one footing. Throws `EngineUnavailableError` / `EngineCheckError`. */
function engineCheck(f: FootingInput): EngineFooting {
  const [r] = checkIsolatedFootings({ footings: [engineInput(f)] }) as EngineFooting[];
  if (!r) throw new Error('the engine returned no footing result');
  return r;
}

// ─── Bearing ──────────────────────────────────────────────────

function bearingFrom(f: FootingInput, e: EngineFooting): BearingResult {
  const refs = [R_SOIL];
  const memo: string[] = [];
  const b = e.bearing;
  if (b.refusal === 'bearingInvalidInput' || (b.status === 'UNSUPPORTED' && !b.uplift && f.kind !== 'isolated')) {
    return {
      status: 'UNSUPPORTED', qMax: 0, qMin: 0, eB: 0, eL: 0,
      geometricOffsetB: 0, geometricOffsetL: 0,
      momentEccentricityB: 0, momentEccentricityL: 0,
      uplift: false, utilization: 0,
      memo, refs,
      unsupportedReason: 'Dimensiones o carga de servicio no válidas para la verificación de tensiones.',
    };
  }
  const N = f.serviceAxial;
  const eB = b.b.worstResultantOffset;
  const eL = b.l.worstResultantOffset;
  const { qMax, qMin } = b;
  const common = {
    geometricOffsetB: b.b.columnOffset, geometricOffsetL: b.l.columnOffset,
    momentEccentricityB: b.b.momentEccentricity, momentEccentricityL: b.l.momentEccentricity,
  };
  memo.push(
    `N = ${N.toFixed(1)} kN sobre ${f.B.toFixed(2)} × ${f.L.toFixed(2)} m; ` +
    `eB = ${eB.toFixed(3)} m, eL = ${eL.toFixed(3)} m.`);
  if (b.b.columnOffset !== 0 || b.l.columnOffset !== 0) {
    memo.push(
      `Excentricidad respecto del CENTROIDE de la zapata: término geométrico ` +
      `(N·e por el desplazamiento del centroide respecto del nudo) ` +
      `${b.b.columnOffset.toFixed(3)} / ${b.l.columnOffset.toFixed(3)} m más el término ` +
      `del momento aplicado ±${b.b.momentEccentricity.toFixed(3)} / ` +
      `±${b.l.momentEccentricity.toFixed(3)} m (envolvente de ambos signos).`);
  }
  // With an edge factor the mean is held to the allowable and the edge to k times it: the edge
  // by the engine (it was given k·qadm), the mean here.
  const k = edgeK(f);
  const qMean = N / (f.B * f.L);
  memo.push(k > 1
    ? `qmedia = ${qMean.toFixed(1)} kPa contra qadm = ${f.allowableBearing.toFixed(1)} kPa; ` +
      `qmax = ${qMax.toFixed(1)} kPa, qmin = ${qMin.toFixed(1)} kPa contra ${k}·qadm = ${(k * f.allowableBearing).toFixed(1)} kPa.`
    : `qmax = ${qMax.toFixed(1)} kPa, qmin = ${qMin.toFixed(1)} kPa contra ` +
      `qadm = ${f.allowableBearing.toFixed(1)} kPa.`);
  const meanUse = k > 1 ? qMean / f.allowableBearing : 0;
  const utilization = Math.max(inf(b.utilization), meanUse);
  if (b.uplift) {
    return {
      status: 'UNSUPPORTED', qMax, qMin, eB, eL, ...common, uplift: true, utilization,
      memo: [...memo,
        'La resultante cae fuera del núcleo central: la base se despega parcialmente y la ' +
        'distribución lineal deja de ser válida. El área efectiva reducida no está ' +
        'implementada; informar qmax lineal subestimaría la presión real. NO VERIFICADO.' +
        (b.b.outsideKern || b.l.outsideKern
          ? ''
          : ' Ninguno de los dos ejes excede B/6 ni L/6 por separado: es la combinación ' +
            'biaxial la que levanta una esquina (qmin < 0).')],
      refs,
      unsupportedReason: 'Resultante fuera del núcleo central (despegue parcial de la base).',
    };
  }
  const status = b.status === 'OK' && meanUse > 1 + 1e-9 ? 'FAIL' : b.status;
  return { status, qMax, qMin, eB, eL, ...common, uplift: false, utilization, memo, refs };
}

/** Linear bearing pressure with biaxial eccentricity, by the engine. */
export function checkBearing(f: FootingInput): BearingResult {
  return bearingFrom(f, engineCheck({ ...f, kind: 'isolated' }));
}

// ─── One-way shear ────────────────────────────────────────────

const NOT_GOVERNING = 'La sección crítica a d de la cara cae fuera de la zapata: el corte en una dirección no gobierna.';

function oneWayFrom(f: FootingInput, o: EngineOneWay, qFactored: number): OneWayShearResult {
  if (o.governingSide === undefined) {
    return {
      status: 'OK', Vu: 0, phiVc: Infinity, utilization: 0,
      governingSide: null, cantilever: 0, qSection: 0, qEdge: 0,
      memo: [NOT_GOVERNING], refs: [R_ONEWAY],
    };
  }
  const L = o.direction === 'B' ? f.L : f.B;
  const a = o.cantilever;
  const eB = o.momentEccentricity;
  const uCol = o.columnOffset;
  const phiVc = inf(o.phiVc);
  const memo = [
    `Corte en una dirección a d de la cara: a = ${a.toFixed(3)} m, ` +
    (eB > 1e-9 || uCol !== 0
      ? `presión trapezoidal (eB de momento = ${eB.toFixed(3)} m, columna a ` +
        `${uCol.toFixed(3)} m del centroide, gobierna el lado ${o.governingSide}): ` +
        `Vu = (q_sección ${o.qSection.toFixed(1)} + q_borde ${o.qEdge.toFixed(1)}) / 2 × ${a.toFixed(3)} × ` +
        `${L.toFixed(2)} = ${o.vu.toFixed(1)} kN.`
      : `Vu = ${qFactored.toFixed(1)} × ${a.toFixed(3)} × ${L.toFixed(2)} = ${o.vu.toFixed(1)} kN.`),
    `φVc = 0,75 × ${(0.66 * Math.cbrt(o.rhoW)).toFixed(4)} × ${o.lambdaS.toFixed(3)} × √${f.fc} × ${L.toFixed(2)} × ` +
    `${f.d.toFixed(3)} = ${phiVc.toFixed(1)} kN.`,
  ];
  const r: OneWayShearResult = {
    status: o.status, Vu: o.vu, phiVc, utilization: inf(o.utilization),
    governingSide: o.governingSide, cantilever: a, qSection: o.qSection, qEdge: o.qEdge,
    memo, refs: [R_ONEWAY],
  };
  return o.direction === 'L' ? { ...r, memo: ['Dirección L (franjas a lo largo de L):', ...r.memo] } : r;
}

/**
 * One-way shear at d from the column face, per §22.5, both directions, by the engine.
 *
 * `qFactored` is the mean factored pressure. The engine forms it as `factoredAxial / (B·L)`; a
 * caller that passes another mean pressure gets the engine's answer for that pressure (the
 * demand is linear in it, and the moment eccentricities stay those of `factoredAxial`).
 */
export function checkOneWayShear(f: FootingInput, qFactored: number): OneWayShearResult {
  const A = f.B * f.L;
  const e = engineCheck({ ...f, kind: 'isolated' });
  const o = e.oneWayShear;
  if (!o) {
    return {
      status: 'UNSUPPORTED', Vu: 0, phiVc: 0, utilization: 0, governingSide: null, cantilever: 0, qSection: 0, qEdge: 0,
      memo: ['Con la combinación de resistencia la resultante cae fuera del núcleo: el corte en una dirección no se emite.'],
      refs: [R_ONEWAY],
    };
  }
  const q0 = e.qFactored;
  if (!(A > 0) || q0 === qFactored || !(q0 > 0)) return oneWayFrom(f, o, qFactored);
  // A different mean pressure: the demand scales with it, and the engine is asked again with
  // the pressure carried by the axial force when its own was zero.
  const k = qFactored / q0;
  const vu = o.vu * k;
  const phiVc = inf(o.phiVc);
  return oneWayFrom(f, {
    ...o, vu, qSection: o.qSection * k, qEdge: o.qEdge * k,
    utilization: phiVc > 0 ? vu / phiVc : Infinity,
    status: vu <= phiVc ? 'OK' : 'FAIL',
  }, qFactored);
}

// ─── Punching ─────────────────────────────────────────────────

function punchingFrom(p: EnginePunching, position: ColumnPosition): PunchingCheck {
  const notes: string[] = [];
  if (position === 'edge') notes.push('Columna de borde: el perímetro crítico se trunca en el borde libre (tres lados).');
  if (position === 'corner') notes.push('Columna de esquina: el perímetro crítico se trunca en dos bordes libres (dos lados).');
  const critical: CriticalSection = { bo: p.bo, beta: p.beta, d: p.d, enclosedArea: p.enclosedArea, refs: [R_CRIT], notes };
  const inside = p.enclosedArea > 0 ? p.loadInside / p.enclosedArea : 0;
  const demand: PunchingDemand = {
    outcome: 'DERIVED', Vu: p.demandVu, Msc: p.msc, conservative: false, refs: [R_DEMAND],
    derivation:
      `V transferida = reacción de apoyo = ${p.transferred.toFixed(1)} kN ` +
      '(equilibrio en la fundación).' +
      ` Se descuenta la carga dentro del perímetro crítico: ${inside.toFixed(2)} ` +
      `kPa × ${p.enclosedArea.toFixed(3)} m² = ${p.loadInside.toFixed(1)} kN. ` +
      `Vu = ${p.demandVu.toFixed(1)} kN.`,
  };
  const resistance: PunchingResistance = {
    vc: p.vc, candidates: { a: p.vcA, b: p.vcB, c: p.vcC }, governedBy: p.governedBy,
    lambdaS: p.lambdaS, alphaS: p.alphaS, refs: [R_VC, R_ALPHAS, R_LAMBDAS, R_SQRTFC],
  };
  const memo: string[] = [...notes, demand.derivation,
    `Perímetro crítico a d/2 de la cara: bo = ${p.bo.toFixed(3)} m, ` +
    `β = ${p.beta.toFixed(2)}, d = ${(p.d * 1000).toFixed(0)} mm.`,
    `vc = mín(${p.vcA.toFixed(3)}; ${p.vcB.toFixed(3)}; ` +
    `${p.vcC.toFixed(3)}) = ${p.vc.toFixed(3)} MPa ` +
    `(gobierna la expresión ${p.governedBy}; λs = ${p.lambdaS.toFixed(3)}, ` +
    `αs = ${p.alphaS}).`,
    `vu = ${p.demandVu.toFixed(1)} / (${p.bo.toFixed(3)} × ${p.d.toFixed(3)}) = ` +
    `${p.vu.toFixed(3)} MPa contra φvc = ${p.phiVc.toFixed(3)} MPa.`];
  const utilization = inf(p.utilization);
  const base = { vu: p.vu, phiVc: p.phiVc, utilization, demand, resistance, critical };
  const mscX = Math.abs(p.mscX), mscY = Math.abs(p.mscY);
  if (p.momentTransfer === 'UNSUPPORTED_MOMENT_NOT_FORMED') {
    const notFormed =
      `el perímetro crítico está truncado (columna de ${position === 'edge' ? 'borde' : 'esquina'}), ` +
      'de modo que la región encerrada no está centrada en el eje de la columna y el ' +
      'planteo de equilibrio implementado no es aplicable.';
    return {
      status: 'UNSUPPORTED', ...base,
      momentTransfer: {
        status: 'UNSUPPORTED_MOMENT_NOT_FORMED', MscX: mscX, MscY: mscY, Msc: p.msc,
        threshold: p.threshold, significant: p.significant, notFormedReason: notFormed, refs: [R_MOMENT_TRANSFER],
      },
      memo: [...memo,
        `El momento no balanceado transferido al nudo no pudo plantearse: ${notFormed} ` +
        'Verificar sólo el corte directo daría por aprobado un nudo cuyo momento nadie ' +
        'evaluó. Punzonado NO VERIFICADO en este nudo.'],
      refs: [R_CRIT, ...resistance.refs, R_PHI, R_MOMENT_TRANSFER],
      unsupportedReason: `No se pudo plantear la transferencia de momento no balanceado: ${notFormed}`,
    };
  }
  if (p.momentTransfer === 'UNSUPPORTED_MOMENT_TRANSFER_NOT_EVALUATED') {
    return {
      status: 'UNSUPPORTED', ...base,
      momentTransfer: {
        status: 'UNSUPPORTED_MOMENT_TRANSFER_NOT_EVALUATED', MscX: mscX, MscY: mscY, Msc: p.msc,
        threshold: p.threshold, significant: true, refs: [R_MOMENT_TRANSFER],
      },
      memo: [...memo,
        `Momento no balanceado Msc = ${p.msc.toFixed(1)} kN·m transferido al nudo ` +
        `(componentes ${mscX.toFixed(1)} y ${mscY.toFixed(1)} kN·m), contra un umbral de ` +
        `significancia de ${p.threshold.toFixed(1)} kN·m. ` +
        'La transferencia de momento por corte excéntrico (artículo 8.4.4.2) no está ' +
        'implementada, y verificar sólo el corte directo daría por aprobado un nudo que ' +
        'puede no serlo. Punzonado NO VERIFICADO en este nudo.'],
      refs: [R_CRIT, ...resistance.refs, R_PHI, R_MOMENT_TRANSFER],
      unsupportedReason: 'Transferencia de momento no balanceado no implementada (artículo 8.4.4.2).',
    };
  }
  if (p.msc > 0) {
    memo.push(
      `Momento no balanceado Msc = ${p.msc.toFixed(3)} kN·m, por debajo del umbral de ` +
      `significancia ${p.threshold.toFixed(3)} kN·m (2 % de Vu·d): ` +
      'gobierna el corte directo. No es una verificación del artículo 8.4.4.2.');
  }
  return {
    status: p.status, ...base,
    momentTransfer: {
      status: p.msc > 0 ? 'NEGLIGIBLE' : 'NONE', MscX: mscX, MscY: mscY, Msc: p.msc,
      threshold: p.threshold, significant: false, refs: p.msc > 0 ? [R_MOMENT_TRANSFER] : [],
    },
    memo,
    refs: [R_CRIT, ...resistance.refs, R_PHI],
  };
}

// ─── The whole footing ────────────────────────────────────────

const KIND_LABEL: Record<FootingKind, string> = {
  isolated: '', combined: 'Zapatas combinadas', strip: 'Zapatas corridas',
  mat: 'Plateas', pileCap: 'Cabezales de pilotes',
};

/**
 * Complete isolated-footing check, by the engine, with the certified gate on an OK verdict.
 *
 * `status` is UNSUPPORTED whenever ANY constituent check is unsupported: a footing whose
 * punching could not be verified is not a verified footing.
 */
export function checkFooting(f: FootingInput): FootingCheck {
  const refs: ClauseRef[] = [R_FOUND];
  if (f.kind !== 'isolated') {
    return {
      status: 'UNSUPPORTED',
      bearing: {
        status: 'UNSUPPORTED', qMax: 0, qMin: 0, eB: 0, eL: 0,
        geometricOffsetB: 0, geometricOffsetL: 0, momentEccentricityB: 0, momentEccentricityL: 0,
        uplift: false, utilization: 0, memo: [], refs: [],
      },
      oneWayShear: null, punching: null,
      Mu: 0, MuSide: null, MuCantilever: 0, MuQFace: 0, MuQEdge: 0,
      punchingLoadInsidePerimeter: 0, worstUtilization: 0,
      memo: [`${KIND_LABEL[f.kind]} no están implementadas. Tratarlas como zapatas aisladas ` +
             'daría un resultado incorrecto con apariencia de correcto.'],
      refs,
      unsupported: [`${KIND_LABEL[f.kind]} no implementadas.`],
    };
  }

  const e = engineCheck(f);
  const unsupported: string[] = [];
  const memo: string[] = [];
  const bearing = bearingFrom(f, e);
  memo.push(...bearing.memo);
  if (bearing.status === 'UNSUPPORTED' && bearing.unsupportedReason) unsupported.push(bearing.unsupportedReason);

  if (e.factoredUplift) {
    unsupported.push(
      `Con la combinación de resistencia gobernante la resultante cae fuera del núcleo ` +
      `(eB = ${e.factoredB.worstResultantOffset.toFixed(3)} m, ` +
      `eL = ${e.factoredL.worstResultantOffset.toFixed(3)} m, de los cuales ` +
      `${e.factoredB.columnOffset.toFixed(3)} / ${e.factoredL.columnOffset.toFixed(3)} m son ` +
      `geométricos): la distribución lineal no vale y las verificaciones de resistencia no ` +
      'se emiten.');
  }
  const oneWayShear = e.oneWayShear ? oneWayFrom(f, e.oneWayShear, e.qFactored) : null;
  if (oneWayShear) memo.push(...oneWayShear.memo);

  const position = f.position ?? 'interior';
  const uCol = e.factoredB.columnOffset, vCol = e.factoredL.columnOffset;
  const punching = e.punching ? punchingFrom(e.punching, position) : null;
  if (punching && e.punching) {
    memo.push(...punching.memo);
    const ub = e.punching.unbalancedB, ul = e.punching.unbalancedL;
    if (ub && ul) {
      memo.push(
        `Momento no balanceado en la conexión, por equilibrio del bloque interior al ` +
        `perímetro crítico y respecto de su centro: eje B → aplicado ` +
        `${ub.applied.toFixed(1)} kN·m menos el alivio de la presión encerrada ` +
        `${ub.relief.toFixed(1)} kN·m = ${ub.msc.toFixed(1)} kN·m; eje L → ` +
        `${ul.applied.toFixed(1)} − ${ul.relief.toFixed(1)} = ` +
        `${ul.msc.toFixed(1)} kN·m (envolvente de ambos signos del momento ` +
        'aplicado). La fuerza axial no aporta momento: actúa sobre el eje de la columna, que ' +
        'es el centro de la región encerrada mientras el perímetro no esté truncado.');
    }
    if (uCol !== 0 || vCol !== 0) {
      memo.push(
        `La presión descontada dentro del perímetro crítico se evalúa en el EJE DE LA ` +
        `COLUMNA (${uCol.toFixed(3)}, ${vCol.toFixed(3)}) m respecto del centroide, no en el ` +
        `centroide: ${e.punchingLoadInsidePerimeter.toFixed(1)} kPa contra ${e.qFactored.toFixed(1)} kPa ` +
        'uniformes (envolvente menos favorable de ambos signos del momento).');
    }
    if (punching.status === 'UNSUPPORTED' && punching.unsupportedReason) unsupported.push(punching.unsupportedReason);
    refs.push(...punching.refs);
  }

  const fx = e.flexureB;
  const mEcc = e.factoredB.momentEccentricity;
  memo.push(
    `Momento en la cara de la columna (13.2.7): Mu = ${fx.mu.toFixed(1)} kN·m` +
    (mEcc > 1e-9 || uCol !== 0
      ? ` (presión trapezoidal, eB de momento = ${mEcc.toFixed(3)} m, ` +
        `columna a ${uCol.toFixed(3)} m del centroide, gobierna el lado ` +
        `${fx.side ?? '—'} con un voladizo de ${fx.cantilever.toFixed(3)} m). `
      : ' (presión uniforme). ') +
    'La armadura de flexión se dimensiona con el verificador de secciones.');
  refs.push(R_FLEX, R_ONEWAY);

  const anyFail = bearing.status === 'FAIL' || oneWayShear?.status === 'FAIL' || punching?.status === 'FAIL';
  const result: FootingCheck = {
    status: unsupported.length > 0 ? 'UNSUPPORTED' : anyFail ? 'FAIL' : 'OK',
    bearing, oneWayShear, punching,
    Mu: fx.mu, MuSide: fx.side ?? null, MuCantilever: fx.cantilever, MuQFace: fx.qFace, MuQEdge: fx.qEdge,
    punchingLoadInsidePerimeter: e.punchingLoadInsidePerimeter,
    // The mean pressure under an edge factor is held here, not by the engine: it can govern.
    worstUtilization: Math.max(e.worstUtilization, bearing.utilization),
    memo, refs, unsupported,
  };
  return result.status === 'OK' ? engineGateFooting(f, result) : result;
}

/**
 * The engine has the last word on an OK footing: its certified check must prove every
 * utilization below 1. Otherwise the footing FAILS, and says why.
 */
function engineGateFooting(f: FootingInput, r: FootingCheck): FootingCheck {
  let c: EngineCertified | undefined;
  let reason: string | undefined;
  try {
    [c] = certifyIsolatedFootings({ footings: [engineInput(f)] }) as EngineCertified[];
  } catch (err) {
    reason = (err as Error)?.message ?? String(err);
  }
  const rc: FootingEngineRecheck = {
    certified: !!c?.certified, certifiedOk: !!c?.certifiedOk, disagrees: false,
    ...(c?.certified ? { utilizationLower: c.utilizationLower, utilizationUpper: c.utilizationUpper, governingCheck: c.governingCheck } : {}),
    ...(c && !c.certified && c.reason ? { reason: c.reason } : reason ? { reason } : {}),
  };
  if (rc.certifiedOk) return { ...r, engineRecheck: rc };
  rc.disagrees = true;
  return {
    ...r,
    status: 'FAIL',
    engineRecheck: rc,
    memo: [...r.memo,
      'La verificación certificada del motor (aritmética de intervalos) no confirma que la zapata ' +
      `verifique: ${rc.certified ? `utilización ≤ ${(rc.utilizationUpper ?? 0).toFixed(4)} (${rc.governingCheck})` : rc.reason ?? 'sin respuesta'}. NO VERIFICADO.`],
  };
}
