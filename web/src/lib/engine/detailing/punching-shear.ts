/**
 * Two-way (punching) shear — CIRSOC 201-2025 §22.6.
 *
 * ── The finding that made this possible ────────────────────────
 *
 * An earlier audit concluded punching shear was blocked on a missing solver output,
 * because `QuadStress` carries membrane forces and bending moments (σxx, σyy, τxy, mx,
 * my, mxy) but no transverse shear vx / vy. That conclusion was reached by looking only
 * at the shell output, and it was wrong.
 *
 * Punching-shear demand is not a shell stress. It is the force transferred through the
 * connection, and equilibrium gives it directly from outputs the solver already
 * produces:
 *
 *   * At a slab-column joint, V_u is the STEP in the column's axial force across the
 *     slab level — what the column above delivers minus what the column below carries
 *     away. `ElementForces3D` carries the axial force at both member ends.
 *
 *   * At a footing, V_u is the column axial load less the soil pressure acting inside
 *     the critical perimeter. `reactions` carries the support force directly.
 *
 *   * The unbalanced moment M_sc transferred to the connection is likewise the step in
 *     the column end moments across the joint.
 *
 * This is exactly how a worked example computes it by hand, and it is exact rather than
 * approximate: it is a free body, not an interpolation. It needs no solver change.
 *
 * What it DOES need is the load applied inside the critical perimeter, which is
 * subtracted from the transferred force per the standard treatment. When that is not
 * known the correction is omitted, which is conservative (it over-states V_u), and the
 * result says so rather than hiding it.
 *
 * ── Normative content ──────────────────────────────────────────
 *
 * §22.6.4.1   the critical section is at d/2 from the column face, with a perimeter
 *             b_o that is a minimum; straight sides permitted for rectangular columns
 *             (§22.6.4.1.1); circular columns replaced by an equal-area square
 *             (§22.6.4.1.2)
 * §22.6.5.2   v_c is the least of Table 22.6.5.2 (a), (b), (c):
 *               (a) 0,33 λ_s λ √f'c
 *               (b) 0,17 (1 + 2/β) λ_s λ √f'c
 *               (c) 0,083 (2 + α_s d / b_o) λ_s λ √f'c
 * §22.6.5.3   α_s = 40 interior, 30 edge, 20 corner
 * §22.5.5.1.3 λ_s = √(2 / (1 + 0,004 d)) ≤ 1,0, with d in mm
 * §22.6.3.1   √f'c is capped at 8,3 MPa
 *
 * Pure: no store, no runes. All lengths in metres, forces in kN, stresses in MPa.
 */

import { clause, type ClauseRef } from '../../codes/regulation';

export type ColumnPosition = 'interior' | 'edge' | 'corner';

const R_CRIT = clause('cirsoc-201', '2025', '22.6.4.1', 'secciones críticas para corte en dos direcciones');
const R_VC = clause('cirsoc-201', '2025', 'Tabla 22.6.5.2', 'vc para elementos en dos direcciones sin armadura de corte');
const R_ALPHAS = clause('cirsoc-201', '2025', '22.6.5.3', 'valor de αs');
const R_LAMBDAS = clause('cirsoc-201', '2025', '22.5.5.1.3', 'factor de modificación por efecto de tamaño');
const R_SQRTFC = clause('cirsoc-201', '2025', '22.6.3.1', 'límite de √f´c');
const R_PHI = clause('cirsoc-201', '2025', '21.2', 'factores de reducción de resistencia');

/** §22.6.5.3 — α_s by column position. */
export const ALPHA_S: Readonly<Record<ColumnPosition, number>> = Object.freeze({
  interior: 40, edge: 30, corner: 20,
});

/** §21.2 — φ for shear. */
export const PHI_SHEAR = 0.75;

/** §22.5.5.1.3 — size-effect modification factor. `d` in metres. */
export function sizeEffectFactor(d: number): number {
  return Math.min(1.0, Math.sqrt(2 / (1 + 0.004 * (d * 1000))));
}

/** §22.6.3.1 — √f'c capped at 8,3 MPa. */
export function sqrtFcCapped(fc: number): number {
  return Math.min(Math.sqrt(fc), 8.3);
}

// ─── Critical section ────────────────────────────────────────────

export interface CriticalSection {
  /** Perimeter b_o of the critical section, m. */
  bo: number;
  /** Ratio β of long to short side of the loaded area. */
  beta: number;
  /** Effective depth d used, m. */
  d: number;
  /** Plan area enclosed by the critical perimeter, m². */
  enclosedArea: number;
  refs: ClauseRef[];
  notes: string[];
}

/**
 * Critical section at d/2 from the column face, with straight sides (§22.6.4.1.1).
 *
 * `position` truncates the perimeter at a free edge: an edge column has three sides
 * contributing, a corner column two. Using the full interior perimeter for an edge
 * column over-states the resistance by roughly a third, which is the single most common
 * punching-shear error.
 */
export function criticalSection(
  columnB: number, columnH: number, d: number, position: ColumnPosition,
  shape: 'rect' | 'circular' = 'rect',
): CriticalSection {
  const notes: string[] = [];
  let b = columnB;
  let h = columnH;

  if (shape === 'circular') {
    // §22.6.4.1.2 — a circular column may be replaced by a square of equal area.
    const side = Math.sqrt(Math.PI * (columnB / 2) ** 2);
    b = side; h = side;
    notes.push('Columna circular reemplazada por una columna cuadrada de área equivalente (22.6.4.1.2).');
  }

  const bx = b + d;   // side length of the critical rectangle, x direction
  const hy = h + d;

  let bo: number;
  switch (position) {
    case 'interior':
      bo = 2 * (bx + hy);
      break;
    case 'edge':
      // Three sides: the perimeter is truncated at the free edge.
      bo = 2 * bx + hy;
      notes.push('Columna de borde: el perímetro crítico se trunca en el borde libre (tres lados).');
      break;
    case 'corner':
      bo = bx + hy;
      notes.push('Columna de esquina: el perímetro crítico se trunca en dos bordes libres (dos lados).');
      break;
  }

  const long = Math.max(b, h);
  const short = Math.min(b, h);

  return {
    bo,
    beta: short > 0 ? long / short : 1,
    d,
    enclosedArea: bx * hy,
    refs: [R_CRIT],
    notes,
  };
}

// ─── Demand, by equilibrium ──────────────────────────────────────

export interface PunchingDemandInput {
  /**
   * Axial force in the column ABOVE the connection, kN, compression positive.
   * Omit when there is no column above (a roof-level or footing connection).
   */
  axialAbove?: number;
  /**
   * Axial force in the column BELOW the connection, kN, compression positive.
   * Omit at a footing, where `supportReaction` is used instead.
   */
  axialBelow?: number;
  /**
   * Support reaction at the connection, kN. Used at a footing, where the reaction IS
   * the transferred force.
   */
  supportReaction?: number;
  /**
   * Distributed load acting on the slab inside the critical perimeter, kPa. Subtracted
   * from the transferred force per the standard treatment. Omit when unknown — the
   * result then says the correction was not applied, which is conservative.
   */
  loadInsidePerimeter?: number;
  /** Step in column end moment about x across the connection, kN·m. */
  unbalancedMomentX?: number;
  /** Step in column end moment about y across the connection, kN·m. */
  unbalancedMomentY?: number;
}

export type DemandOutcome = 'DERIVED' | 'UNAVAILABLE';

export interface PunchingDemand {
  outcome: DemandOutcome;
  /** Factored two-way shear V_u, kN. Zero when unavailable. */
  Vu: number;
  /** Unbalanced moment magnitude transferred, kN·m. */
  Msc: number;
  /** How V_u was obtained, in words, for the calculation memo. */
  derivation: string;
  /** True when the inside-perimeter load correction was NOT applied. */
  conservative: boolean;
  /** Why it is unavailable, when it is. */
  unavailableReason?: string;
  refs: ClauseRef[];
}

/**
 * Derive the punching-shear demand by equilibrium at the connection.
 *
 * Returns UNAVAILABLE, with a reason, when neither a column-axial step nor a support
 * reaction is present. It never returns a guessed number — a punching check computed
 * from an invented demand is worse than no check, because it looks like one.
 */
export function derivePunchingDemand(
  input: PunchingDemandInput, critical: CriticalSection,
): PunchingDemand {
  const refs = [clause('cirsoc-201', '2025', '22.6.4', 'corte en dos direcciones')];
  const msc = Math.hypot(input.unbalancedMomentX ?? 0, input.unbalancedMomentY ?? 0);

  let transferred: number;
  let derivation: string;

  if (input.supportReaction !== undefined) {
    transferred = Math.abs(input.supportReaction);
    derivation =
      `V transferida = reacción de apoyo = ${transferred.toFixed(1)} kN ` +
      '(equilibrio en la fundación).';
  } else if (input.axialAbove !== undefined || input.axialBelow !== undefined) {
    const above = input.axialAbove ?? 0;
    const below = input.axialBelow ?? 0;
    transferred = Math.abs(below - above);
    derivation =
      `V transferida = salto de la fuerza axial de la columna en el nudo = ` +
      `|${below.toFixed(1)} − ${above.toFixed(1)}| = ${transferred.toFixed(1)} kN ` +
      '(cuerpo libre del nudo; equilibrio exacto, no una interpolación).';
  } else {
    return {
      outcome: 'UNAVAILABLE',
      Vu: 0, Msc: msc, conservative: false,
      derivation: '',
      unavailableReason:
        'No hay fuerza axial de columna ni reacción de apoyo en este nudo, de modo que la ' +
        'fuerza transferida no puede plantearse por equilibrio. El punzonado queda como ' +
        'no verificado; no se adopta un valor supuesto.',
      refs,
    };
  }

  let Vu = transferred;
  let conservative = true;
  if (input.loadInsidePerimeter !== undefined) {
    const inside = input.loadInsidePerimeter * critical.enclosedArea;
    Vu = Math.max(0, transferred - inside);
    conservative = false;
    derivation +=
      ` Se descuenta la carga dentro del perímetro crítico: ${input.loadInsidePerimeter.toFixed(2)} ` +
      `kPa × ${critical.enclosedArea.toFixed(3)} m² = ${inside.toFixed(1)} kN. ` +
      `Vu = ${Vu.toFixed(1)} kN.`;
  } else {
    derivation +=
      ' No se descuenta la carga dentro del perímetro crítico porque no está disponible; ' +
      'el resultado es conservador (Vu queda sobreestimado).';
  }

  return { outcome: 'DERIVED', Vu, Msc: msc, derivation, conservative, refs };
}

// ─── Resistance ──────────────────────────────────────────────────

export interface PunchingResistance {
  /** Governing v_c, MPa. */
  vc: number;
  /** The three Table 22.6.5.2 candidates, MPa, in printed order. */
  candidates: { a: number; b: number; c: number };
  /** Which of (a), (b), (c) governed. */
  governedBy: 'a' | 'b' | 'c';
  lambdaS: number;
  alphaS: number;
  refs: ClauseRef[];
}

/**
 * v_c per Table 22.6.5.2 — the least of the three expressions.
 *
 * `lambda` is the lightweight-concrete factor (§19.2.4); 1.0 for normal-weight.
 */
export function punchingResistance(
  fc: number, critical: CriticalSection, position: ColumnPosition, lambda = 1.0,
): PunchingResistance {
  const lambdaS = sizeEffectFactor(critical.d);
  const alphaS = ALPHA_S[position];
  const root = sqrtFcCapped(fc);
  const base = lambdaS * lambda * root;

  const a = 0.33 * base;
  const b = 0.17 * (1 + 2 / critical.beta) * base;
  const c = 0.083 * (2 + (alphaS * critical.d) / critical.bo) * base;

  const vc = Math.min(a, b, c);
  const governedBy = vc === a ? 'a' : vc === b ? 'b' : 'c';

  return {
    vc,
    candidates: { a, b, c },
    governedBy,
    lambdaS,
    alphaS,
    refs: [R_VC, R_ALPHAS, R_LAMBDAS, R_SQRTFC],
  };
}

// ─── The check ───────────────────────────────────────────────────

export type PunchingStatus = 'OK' | 'FAIL' | 'UNSUPPORTED';

export interface PunchingCheck {
  status: PunchingStatus;
  /** Applied shear stress v_u, MPa. */
  vu: number;
  /** Design resistance φ v_c, MPa. */
  phiVc: number;
  /** Utilization v_u / (φ v_c), the app's demand/capacity convention. */
  utilization: number;
  demand: PunchingDemand;
  resistance: PunchingResistance | null;
  critical: CriticalSection;
  /** Full memo lines for the certificate. */
  memo: string[];
  refs: ClauseRef[];
  /** Present when status is UNSUPPORTED. */
  unsupportedReason?: string;
}

/**
 * Direct two-way shear check, without moment transfer.
 *
 * Moment transfer (γ_v M_sc eccentric shear, §8.4.4.2) is NOT implemented: it needs the
 * section modulus of the critical perimeter and the γ_f / γ_v split, and getting it
 * approximately right would produce a check that passes connections that fail. When an
 * unbalanced moment is present the result is downgraded to UNSUPPORTED rather than
 * reported as a direct-shear pass.
 */
export function checkPunchingShear(opts: {
  fc: number;
  columnB: number;
  columnH: number;
  /** Effective depth of the slab or footing, m. */
  d: number;
  position: ColumnPosition;
  shape?: 'rect' | 'circular';
  lambda?: number;
  demand: PunchingDemandInput;
  /** Treat a non-zero unbalanced moment as significant above this fraction of V_u·d. */
  momentTolerance?: number;
}): PunchingCheck {
  const critical = criticalSection(opts.columnB, opts.columnH, opts.d, opts.position, opts.shape);
  const demand = derivePunchingDemand(opts.demand, critical);
  const memo: string[] = [...critical.notes];

  if (demand.outcome === 'UNAVAILABLE') {
    return {
      status: 'UNSUPPORTED',
      vu: 0, phiVc: 0, utilization: 0,
      demand, resistance: null, critical,
      memo: [...memo, demand.unavailableReason ?? ''],
      refs: [R_CRIT],
      unsupportedReason: demand.unavailableReason,
    };
  }

  memo.push(demand.derivation);
  memo.push(
    `Perímetro crítico a d/2 de la cara: bo = ${critical.bo.toFixed(3)} m, ` +
    `β = ${critical.beta.toFixed(2)}, d = ${(critical.d * 1000).toFixed(0)} mm.`);

  const resistance = punchingResistance(opts.fc, critical, opts.position, opts.lambda);
  const phiVc = PHI_SHEAR * resistance.vc;

  // v_u = V_u / (b_o d). kN / m² -> kPa; /1000 -> MPa.
  const vu = demand.Vu / (critical.bo * critical.d) / 1000;

  memo.push(
    `vc = mín(${resistance.candidates.a.toFixed(3)}; ${resistance.candidates.b.toFixed(3)}; ` +
    `${resistance.candidates.c.toFixed(3)}) = ${resistance.vc.toFixed(3)} MPa ` +
    `(gobierna la expresión ${resistance.governedBy}; λs = ${resistance.lambdaS.toFixed(3)}, ` +
    `αs = ${resistance.alphaS}).`,
    `vu = ${demand.Vu.toFixed(1)} / (${critical.bo.toFixed(3)} × ${critical.d.toFixed(3)}) = ` +
    `${vu.toFixed(3)} MPa contra φvc = ${phiVc.toFixed(3)} MPa.`);

  const utilization = phiVc > 0 ? vu / phiVc : Infinity;

  // Moment transfer: refuse rather than approximate.
  const tol = opts.momentTolerance ?? 0.02;
  const momentSignificant = demand.Msc > tol * Math.max(demand.Vu * opts.d, 1e-9);
  if (momentSignificant) {
    return {
      status: 'UNSUPPORTED',
      vu, phiVc, utilization,
      demand, resistance, critical,
      memo: [...memo,
        `Momento no balanceado Msc = ${demand.Msc.toFixed(1)} kN·m transferido al nudo. ` +
        'La transferencia de momento por corte excéntrico (artículo 8.4.4.2) no está ' +
        'implementada, y verificar sólo el corte directo daría por aprobado un nudo que ' +
        'puede no serlo. Punzonado NO VERIFICADO en este nudo.'],
      refs: [...critical.refs, ...resistance.refs, R_PHI,
        clause('cirsoc-201', '2025', '8.4.4.2', 'transferencia de momento por corte excéntrico')],
      unsupportedReason:
        'Transferencia de momento no balanceado no implementada (artículo 8.4.4.2).',
    };
  }

  if (demand.conservative) {
    memo.push(
      'Nota: no se descontó la carga dentro del perímetro crítico, por lo que la ' +
      'verificación es conservadora.');
  }

  return {
    status: utilization <= 1.0 ? 'OK' : 'FAIL',
    vu, phiVc, utilization,
    demand, resistance, critical,
    memo,
    refs: [...critical.refs, ...resistance.refs, R_PHI],
  };
}
