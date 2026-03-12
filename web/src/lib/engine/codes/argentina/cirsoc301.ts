/**
 * Verificacion de elementos de acero segun CIRSOC 301 (basado en AISC 360 LRFD).
 *
 * Este modulo NO toca el solver — recibe solicitaciones y propiedades de seccion
 * y devuelve resultados de verificacion.
 *
 * Unidades: kN, m, MPa (N/mm²) salvo donde se indique.
 */

import type { SolverDiagnostic } from '../../types';
import type { VerifStatus } from './cirsoc201';

// ---------------------------------------------------------------------------
// Types & Interfaces
// ---------------------------------------------------------------------------

export interface SteelDesignParams {
  Fy: number;    // tension de fluencia (MPa)
  Fu: number;    // tension de rotura (MPa)
  E: number;     // modulo de elasticidad (MPa)
  // Propiedades de seccion (SI: m, m², m⁴)
  A: number;     // area bruta (m²)
  Iz: number;    // inercia eje fuerte (m⁴)
  Iy: number;    // inercia eje debil (m⁴)
  h: number;     // altura total (m)
  b: number;     // ancho de ala (m)
  tw: number;    // espesor de alma (m)
  tf: number;    // espesor de ala (m)
  // Modulos plasticos (calculados si no se proveen)
  Zx?: number;   // modulo plastico eje fuerte (m³)
  Zy?: number;   // modulo plastico eje debil (m³)
  Sx?: number;   // modulo elastico eje fuerte (m³)
  // Parametros de longitud
  L: number;     // longitud del elemento (m)
  Lb: number;    // longitud no arriostrada para pandeo lateral-torsional (m)
  Kx?: number;   // factor de longitud efectiva, eje fuerte (default 1.0)
  Ky?: number;   // factor de longitud efectiva, eje debil (default 1.0)
  J?: number;    // constante torsional (m⁴)
  Cw?: number;   // constante de alabeo (m⁶)
}

export interface SteelTensionResult {
  Pu: number;      // demanda (kN)
  phiPn: number;   // capacidad (kN)
  ratio: number;
  status: VerifStatus;
  steps: string[];
}

export interface SteelCompressionResult {
  Pu: number;
  KLr: number;     // esbeltez gobernante
  Fe: number;      // tension de Euler (MPa)
  Fcr: number;     // tension critica (MPa)
  phiPn: number;   // capacidad (kN)
  ratio: number;
  status: VerifStatus;
  steps: string[];
}

export interface SteelFlexureResult {
  Mu: number;      // demanda (kN·m)
  Mp: number;      // momento plastico (kN·m)
  Mn: number;      // momento nominal (kN·m, puede estar reducido por LTB)
  phiMn: number;   // capacidad de diseno (kN·m)
  Lp: number;      // limite compacto (m)
  Lr: number;      // limite no compacto (m)
  ratio: number;
  status: VerifStatus;
  steps: string[];
}

export interface SteelShearResult {
  Vu: number;
  phiVn: number;
  Cv: number;
  ratio: number;
  status: VerifStatus;
  steps: string[];
}

export interface SteelInteractionResult {
  equation: 'H1-1a' | 'H1-1b';
  value: number;   // <= 1.0 verifica
  ratio: number;
  status: VerifStatus;
  steps: string[];
}

export interface SteelVerificationInput {
  elementId: number;
  Nu: number;    // kN (+ = compresion)
  Muy: number;   // kN·m (momento eje debil)
  Muz: number;   // kN·m (momento eje fuerte)
  Vu: number;    // kN
  params: SteelDesignParams;
}

export interface SteelVerification {
  elementId: number;
  // Solicitaciones
  Nu: number; Muy: number; Muz: number; Vu: number;
  // Verificaciones individuales
  tension?: SteelTensionResult;
  compression?: SteelCompressionResult;
  flexureZ: SteelFlexureResult;   // eje fuerte
  flexureY?: SteelFlexureResult;  // eje debil
  shear: SteelShearResult;
  interaction?: SteelInteractionResult;
  overallStatus: VerifStatus;
  diagnostics?: SolverDiagnostic[];
  steps: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(v: number, decimals = 2): string {
  return v.toFixed(decimals);
}

function statusFromRatio(ratio: number): VerifStatus {
  if (ratio <= 1.0) return 'ok';
  if (ratio <= 1.05) return 'warn';
  return 'fail';
}

function worstStatus(...statuses: VerifStatus[]): VerifStatus {
  if (statuses.includes('fail')) return 'fail';
  if (statuses.includes('warn')) return 'warn';
  return 'ok';
}

/** Radio de giro r = sqrt(I / A) */
function radiusOfGyration(I: number, A: number): number {
  return Math.sqrt(I / A);
}

/**
 * Calcula Zx (modulo plastico eje fuerte) para secciones I si no se provee.
 * Zx ≈ b·tf·(h - tf) + tw·(h - 2·tf)² / 4
 */
function computeZx(p: SteelDesignParams): number {
  const { b, tf, h, tw } = p;
  const hw = h - 2 * tf;
  return b * tf * (h - tf) + tw * hw * hw / 4;
}

/**
 * Calcula Zy (modulo plastico eje debil) para secciones I.
 * Zy ≈ tf·b²/2 + hw·tw²/4  (simplificado)
 */
function computeZy(p: SteelDesignParams): number {
  const { b, tf, h, tw } = p;
  const hw = h - 2 * tf;
  return tf * b * b / 2 + hw * tw * tw / 4;
}

/**
 * Calcula Sx (modulo elastico eje fuerte) = Iz / (h/2)
 */
function computeSx(p: SteelDesignParams): number {
  return p.Iz / (p.h / 2);
}

// ---------------------------------------------------------------------------
// §D — Traccion
// ---------------------------------------------------------------------------

export function checkSteelTension(params: SteelDesignParams, Pu: number): SteelTensionResult {
  const steps: string[] = [];
  const { Fy, Fu, A } = params;

  // A en m², Fy en MPa = N/mm² => convertir A a mm² para la multiplicacion
  // Pn = Fy * Ag  (N) => / 1000 => kN
  // A (m²) * 1e6 = mm²
  const Ag_mm2 = A * 1e6;
  const Ae_mm2 = Ag_mm2; // area neta efectiva = area bruta (sin agujeros)

  const phiY = 0.90;
  const phiR = 0.75;

  // Fluencia en seccion bruta
  const PnY = Fy * Ag_mm2 / 1000; // kN
  const phiPnY = phiY * PnY;

  steps.push(`§D2 — Fluencia en seccion bruta:`);
  steps.push(`  Ag = ${fmt(Ag_mm2, 0)} mm²`);
  steps.push(`  Pn = Fy·Ag = ${fmt(Fy)}·${fmt(Ag_mm2, 0)} = ${fmt(PnY)} kN`);
  steps.push(`  φPn = ${fmt(phiY)}·${fmt(PnY)} = ${fmt(phiPnY)} kN`);

  // Rotura en seccion neta
  const PnR = Fu * Ae_mm2 / 1000; // kN
  const phiPnR = phiR * PnR;

  steps.push(`§D2 — Rotura en seccion neta:`);
  steps.push(`  Ae = ${fmt(Ae_mm2, 0)} mm² (sin agujeros)`);
  steps.push(`  Pn = Fu·Ae = ${fmt(Fu)}·${fmt(Ae_mm2, 0)} = ${fmt(PnR)} kN`);
  steps.push(`  φPn = ${fmt(phiR)}·${fmt(PnR)} = ${fmt(phiPnR)} kN`);

  const phiPn = Math.min(phiPnY, phiPnR);
  const governing = phiPn === phiPnY ? 'fluencia' : 'rotura';
  steps.push(`  Gobierna: ${governing}, φPn = ${fmt(phiPn)} kN`);

  const absPu = Math.abs(Pu);
  const ratio = phiPn > 0 ? absPu / phiPn : (absPu > 0 ? Infinity : 0);

  steps.push(`  Pu = ${fmt(absPu)} kN`);
  steps.push(`  Ratio = ${fmt(ratio, 3)}`);

  return {
    Pu: absPu,
    phiPn,
    ratio,
    status: statusFromRatio(ratio),
    steps,
  };
}

// ---------------------------------------------------------------------------
// §E — Compresion
// ---------------------------------------------------------------------------

export function checkSteelCompression(params: SteelDesignParams, Pu: number): SteelCompressionResult {
  const steps: string[] = [];
  const { Fy, E, A, Iz, Iy, L } = params;
  const Kx = params.Kx ?? 1.0;
  const Ky = params.Ky ?? 1.0;

  const Ag_mm2 = A * 1e6;

  // Radios de giro
  const rx = radiusOfGyration(Iz, A); // m
  const ry = radiusOfGyration(Iy, A); // m

  // Esbelteces
  const KLrx = (Kx * L) / rx;
  const KLry = (Ky * L) / ry;
  const KLr = Math.max(KLrx, KLry);
  const governingAxis = KLr === KLrx ? 'fuerte (x)' : 'debil (y)';

  steps.push(`§E — Compresion:`);
  steps.push(`  rx = √(Iz/A) = ${fmt(rx * 1000, 1)} mm`);
  steps.push(`  ry = √(Iy/A) = ${fmt(ry * 1000, 1)} mm`);
  steps.push(`  KL/r (eje fuerte) = ${fmt(Kx)}·${fmt(L, 3)} / ${fmt(rx * 1000, 1)}mm = ${fmt(KLrx, 1)}`);
  steps.push(`  KL/r (eje debil)  = ${fmt(Ky)}·${fmt(L, 3)} / ${fmt(ry * 1000, 1)}mm = ${fmt(KLry, 1)}`);
  steps.push(`  KL/r gobernante = ${fmt(KLr, 1)} (eje ${governingAxis})`);

  // Tension critica de Euler
  const Fe = (Math.PI * Math.PI * E) / (KLr * KLr); // MPa

  steps.push(`  Fe = π²·E / (KL/r)² = ${fmt(Fe, 1)} MPa`);

  // Limite de esbeltez
  const limit = 4.71 * Math.sqrt(E / Fy);
  steps.push(`  4.71·√(E/Fy) = ${fmt(limit, 1)}`);

  let Fcr: number;
  if (KLr <= limit) {
    // Pandeo inelastico
    Fcr = Math.pow(0.658, Fy / Fe) * Fy;
    steps.push(`  KL/r ≤ ${fmt(limit, 1)} → pandeo inelastico`);
    steps.push(`  Fcr = 0.658^(Fy/Fe)·Fy = 0.658^(${fmt(Fy / Fe, 3)})·${fmt(Fy)} = ${fmt(Fcr, 1)} MPa`);
  } else {
    // Pandeo elastico
    Fcr = 0.877 * Fe;
    steps.push(`  KL/r > ${fmt(limit, 1)} → pandeo elastico`);
    steps.push(`  Fcr = 0.877·Fe = 0.877·${fmt(Fe, 1)} = ${fmt(Fcr, 1)} MPa`);
  }

  const phi = 0.90;
  const Pn = Fcr * Ag_mm2 / 1000; // kN
  const phiPn = phi * Pn;

  steps.push(`  Pn = Fcr·Ag = ${fmt(Fcr, 1)}·${fmt(Ag_mm2, 0)} = ${fmt(Pn)} kN`);
  steps.push(`  φPn = ${fmt(phi)}·${fmt(Pn)} = ${fmt(phiPn)} kN`);

  const absPu = Math.abs(Pu);
  const ratio = phiPn > 0 ? absPu / phiPn : (absPu > 0 ? Infinity : 0);

  steps.push(`  Pu = ${fmt(absPu)} kN`);
  steps.push(`  Ratio = ${fmt(ratio, 3)}`);

  return {
    Pu: absPu,
    KLr,
    Fe,
    Fcr,
    phiPn,
    ratio,
    status: statusFromRatio(ratio),
    steps,
  };
}

// ---------------------------------------------------------------------------
// §F — Flexion
// ---------------------------------------------------------------------------

export function checkSteelFlexure(
  params: SteelDesignParams,
  Mu: number,
  axis: 'strong' | 'weak',
): SteelFlexureResult {
  const steps: string[] = [];
  const { Fy, E, Iy, h, tf, Lb } = params;
  const phi = 0.90;

  const axisLabel = axis === 'strong' ? 'fuerte (z)' : 'debil (y)';
  steps.push(`§F — Flexion, eje ${axisLabel}:`);

  if (axis === 'weak') {
    // Eje debil: no hay pandeo lateral-torsional
    const Zy = params.Zy ?? computeZy(params);  // m³
    const Zy_mm3 = Zy * 1e9;
    const Mp = Fy * Zy_mm3 / 1e6; // kN·m

    steps.push(`  Zy = ${fmt(Zy_mm3, 0)} mm³`);
    steps.push(`  Mp = Fy·Zy = ${fmt(Fy)}·${fmt(Zy_mm3, 0)} / 1e6 = ${fmt(Mp)} kN·m`);
    steps.push(`  Eje debil: no se considera pandeo lateral-torsional`);

    const Mn = Mp;
    const phiMn = phi * Mn;

    steps.push(`  Mn = Mp = ${fmt(Mn)} kN·m`);
    steps.push(`  φMn = ${fmt(phi)}·${fmt(Mn)} = ${fmt(phiMn)} kN·m`);

    const absMu = Math.abs(Mu);
    const ratio = phiMn > 0 ? absMu / phiMn : (absMu > 0 ? Infinity : 0);

    steps.push(`  Mu = ${fmt(absMu)} kN·m`);
    steps.push(`  Ratio = ${fmt(ratio, 3)}`);

    return {
      Mu: absMu,
      Mp,
      Mn,
      phiMn,
      Lp: 0,
      Lr: 0,
      ratio,
      status: statusFromRatio(ratio),
      steps,
    };
  }

  // Eje fuerte
  const Zx = params.Zx ?? computeZx(params);  // m³
  const Sx = params.Sx ?? computeSx(params);    // m³
  const Zx_mm3 = Zx * 1e9;
  const Sx_mm3 = Sx * 1e9;

  const Mp = Fy * Zx_mm3 / 1e6; // kN·m

  steps.push(`  Zx = ${fmt(Zx_mm3, 0)} mm³`);
  steps.push(`  Sx = ${fmt(Sx_mm3, 0)} mm³`);
  steps.push(`  Mp = Fy·Zx = ${fmt(Fy)}·${fmt(Zx_mm3, 0)} / 1e6 = ${fmt(Mp)} kN·m`);

  // Radio de giro eje debil
  const A = params.A;
  const ry = radiusOfGyration(Iy, A); // m
  const ry_mm = ry * 1000;

  // Lp = 1.76·ry·√(E/Fy)
  const Lp = 1.76 * ry * Math.sqrt(E / Fy); // m

  steps.push(`  ry = ${fmt(ry_mm, 1)} mm`);
  steps.push(`  Lp = 1.76·ry·√(E/Fy) = 1.76·${fmt(ry_mm, 1)}·√(${E}/${Fy}) = ${fmt(Lp * 1000, 0)} mm = ${fmt(Lp, 3)} m`);

  // Lr: longitud limite para pandeo lateral-torsional inelastico
  // Lr = 1.95·rts·(E / (0.7·Fy))·√(J·c/(Sx·ho) + √((J·c/(Sx·ho))² + 6.76·(0.7·Fy/E)²))
  // Simplificacion para perfiles I laminados:
  // rts² ≈ √(Iy·Cw) / Sx   o bien   rts ≈ b / (2·√(12)) para ala rectangular
  // Usamos una formula simplificada con J y Cw si estan disponibles

  const ho = h - tf; // distancia entre centroides de alas (m)
  const ho_mm = ho * 1000;

  let Lr: number;
  let Mn: number;

  const J = params.J;
  const Cw = params.Cw;

  if (J != null && Cw != null && J > 0) {
    // Formula completa con constantes torsionales
    const J_mm4 = J * 1e12;
    const Cw_mm6 = Cw * 1e18;
    const c = 1.0; // para secciones I doblemente simetricas

    // rts² = √(Iy·Cw) / Sx
    const Iy_mm4 = Iy * 1e12;
    const rts2 = Math.sqrt(Iy_mm4 * Cw_mm6) / Sx_mm3;
    const rts = Math.sqrt(rts2); // mm

    const term = (J_mm4 * c) / (Sx_mm3 * ho_mm);
    const fRatio = 0.7 * Fy / E;

    Lr = (1.95 * rts * (E / (0.7 * Fy)) *
      Math.sqrt(term + Math.sqrt(term * term + 6.76 * fRatio * fRatio))) / 1000; // m

    steps.push(`  J = ${fmt(J_mm4, 0)} mm⁴, Cw = ${fmt(Cw_mm6, 0)} mm⁶`);
    steps.push(`  rts = ${fmt(rts, 1)} mm`);
    steps.push(`  Lr = ${fmt(Lr * 1000, 0)} mm = ${fmt(Lr, 3)} m`);
  } else {
    // Aproximacion simplificada para perfiles I laminados sin J/Cw
    // Lr ≈ π·ry·√(E / (0.7·Fy)) (simplificado, conservador)
    Lr = Math.PI * ry * Math.sqrt(E / (0.7 * Fy)); // m

    steps.push(`  J y Cw no provistos — se usa formula simplificada para Lr`);
    steps.push(`  Lr ≈ π·ry·√(E/(0.7·Fy)) = ${fmt(Lr * 1000, 0)} mm = ${fmt(Lr, 3)} m`);
  }

  steps.push(`  Lb = ${fmt(Lb * 1000, 0)} mm = ${fmt(Lb, 3)} m`);

  if (Lb <= Lp) {
    // Zona 1: plastificacion completa
    Mn = Mp;
    steps.push(`  Lb ≤ Lp → zona plastica, Mn = Mp = ${fmt(Mn)} kN·m`);
  } else if (Lb <= Lr) {
    // Zona 2: pandeo lateral-torsional inelastico (interpolacion lineal)
    const Mr = 0.7 * Fy * Sx_mm3 / 1e6; // kN·m
    Mn = Mp - (Mp - Mr) * ((Lb - Lp) / (Lr - Lp));
    Mn = Math.min(Mn, Mp);

    steps.push(`  Lp < Lb ≤ Lr → pandeo lateral-torsional inelastico`);
    steps.push(`  Mr = 0.7·Fy·Sx = ${fmt(Mr)} kN·m`);
    steps.push(`  Mn = Mp - (Mp - Mr)·(Lb - Lp)/(Lr - Lp) = ${fmt(Mn)} kN·m`);
  } else {
    // Zona 3: pandeo lateral-torsional elastico
    // Fcr = (Cb·π²·E / (Lb/rts)²) · √(1 + 0.078·(J·c/(Sx·ho))·(Lb/rts)²)
    // Simplificacion con Cb=1.0
    const Cb = 1.0;

    if (J != null && Cw != null && J > 0) {
      const J_mm4 = J * 1e12;
      const Cw_mm6 = Cw * 1e18;
      const Iy_mm4 = Iy * 1e12;
      const rts2 = Math.sqrt(Iy_mm4 * Cw_mm6) / Sx_mm3;
      const rts = Math.sqrt(rts2);
      const Lb_mm = Lb * 1000;
      const LbRts2 = (Lb_mm / rts) * (Lb_mm / rts);
      const c = 1.0;
      const term = (J_mm4 * c) / (Sx_mm3 * ho_mm);

      const Fcr = (Cb * Math.PI * Math.PI * E / LbRts2) *
        Math.sqrt(1 + 0.078 * term * LbRts2);

      Mn = Math.min(Fcr * Sx_mm3 / 1e6, Mp);
      steps.push(`  Lb > Lr → pandeo lateral-torsional elastico`);
      steps.push(`  Fcr = ${fmt(Fcr, 1)} MPa`);
      steps.push(`  Mn = min(Fcr·Sx, Mp) = ${fmt(Mn)} kN·m`);
    } else {
      // Sin J/Cw: usar Fe basado en ry
      const Lb_mm = Lb * 1000;
      const Fcr = (Cb * Math.PI * Math.PI * E) / ((Lb_mm / ry_mm) * (Lb_mm / ry_mm));
      Mn = Math.min(Fcr * Sx_mm3 / 1e6, Mp);

      steps.push(`  Lb > Lr → pandeo lateral-torsional elastico (simplificado)`);
      steps.push(`  Fcr = Cb·π²·E / (Lb/ry)² = ${fmt(Fcr, 1)} MPa`);
      steps.push(`  Mn = min(Fcr·Sx, Mp) = ${fmt(Mn)} kN·m`);
    }
  }

  const phiMn = phi * Mn;

  steps.push(`  φMn = ${fmt(phi)}·${fmt(Mn)} = ${fmt(phiMn)} kN·m`);

  const absMu = Math.abs(Mu);
  const ratio = phiMn > 0 ? absMu / phiMn : (absMu > 0 ? Infinity : 0);

  steps.push(`  Mu = ${fmt(absMu)} kN·m`);
  steps.push(`  Ratio = ${fmt(ratio, 3)}`);

  return {
    Mu: absMu,
    Mp,
    Mn,
    phiMn,
    Lp,
    Lr,
    ratio,
    status: statusFromRatio(ratio),
    steps,
  };
}

// ---------------------------------------------------------------------------
// §G — Corte
// ---------------------------------------------------------------------------

export function checkSteelShear(params: SteelDesignParams, Vu: number): SteelShearResult {
  const steps: string[] = [];
  const { Fy, E, h, tw, tf } = params;
  const phi = 0.90;

  // Area del alma Aw = d·tw (en mm²)
  const d_mm = h * 1000;
  const tw_mm = tw * 1000;
  const tf_mm = tf * 1000;
  const Aw_mm2 = d_mm * tw_mm;

  // Altura del alma
  const hw_mm = d_mm - 2 * tf_mm;

  steps.push(`§G — Corte:`);
  steps.push(`  d = ${fmt(d_mm, 1)} mm, tw = ${fmt(tw_mm, 1)} mm`);
  steps.push(`  Aw = d·tw = ${fmt(Aw_mm2, 0)} mm²`);
  steps.push(`  h/tw (alma) = ${fmt(hw_mm / tw_mm, 1)}`);

  // Coeficiente Cv
  const htw = hw_mm / tw_mm;
  const limit = 2.24 * Math.sqrt(E / Fy);
  let Cv: number;

  if (htw <= limit) {
    Cv = 1.0;
    steps.push(`  h/tw = ${fmt(htw, 1)} ≤ 2.24·√(E/Fy) = ${fmt(limit, 1)} → Cv = 1.0`);
  } else {
    // Para almas esbeltas (poco comun en perfiles laminados)
    const kv = 5.34; // sin rigidizadores
    const limit2 = 1.10 * Math.sqrt(kv * E / Fy);

    if (htw <= limit2) {
      Cv = 1.0;
      steps.push(`  Cv = 1.0 (alma con rigidez suficiente)`);
    } else {
      Cv = (1.10 * Math.sqrt(kv * E / Fy)) / htw;
      steps.push(`  Alma esbelta: Cv = 1.10·√(kv·E/Fy) / (h/tw) = ${fmt(Cv, 3)}`);
    }
  }

  // Vn = 0.6·Fy·Aw·Cv
  const Vn = 0.6 * Fy * Aw_mm2 * Cv / 1000; // kN
  const phiVn = phi * Vn;

  steps.push(`  Vn = 0.6·Fy·Aw·Cv = 0.6·${fmt(Fy)}·${fmt(Aw_mm2, 0)}·${fmt(Cv, 3)} = ${fmt(Vn)} kN`);
  steps.push(`  φVn = ${fmt(phi)}·${fmt(Vn)} = ${fmt(phiVn)} kN`);

  const absVu = Math.abs(Vu);
  const ratio = phiVn > 0 ? absVu / phiVn : (absVu > 0 ? Infinity : 0);

  steps.push(`  Vu = ${fmt(absVu)} kN`);
  steps.push(`  Ratio = ${fmt(ratio, 3)}`);

  return {
    Vu: absVu,
    phiVn,
    Cv,
    ratio,
    status: statusFromRatio(ratio),
    steps,
  };
}

// ---------------------------------------------------------------------------
// §H — Interaccion (H1-1)
// ---------------------------------------------------------------------------

export function checkSteelInteraction(
  params: SteelDesignParams,
  Pu: number,
  Mux: number,
  Muy: number,
): SteelInteractionResult {
  const steps: string[] = [];

  // Capacidades axiales
  const absPu = Math.abs(Pu);
  let phiPn: number;

  if (Pu >= 0) {
    // Compresion
    const comp = checkSteelCompression(params, Pu);
    phiPn = comp.phiPn;
    steps.push(`  Capacidad axial (compresion): φPn = ${fmt(phiPn)} kN`);
  } else {
    // Traccion
    const tens = checkSteelTension(params, Pu);
    phiPn = tens.phiPn;
    steps.push(`  Capacidad axial (traccion): φPn = ${fmt(phiPn)} kN`);
  }

  // Capacidades a flexion
  const flexZ = checkSteelFlexure(params, Mux, 'strong');
  const flexY = checkSteelFlexure(params, Muy, 'weak');
  const phiMnx = flexZ.phiMn;
  const phiMny = flexY.phiMn;

  steps.push(`  φMnx (eje fuerte) = ${fmt(phiMnx)} kN·m`);
  steps.push(`  φMny (eje debil)  = ${fmt(phiMny)} kN·m`);

  const axialRatio = phiPn > 0 ? absPu / phiPn : 0;
  const absMux = Math.abs(Mux);
  const absMuy = Math.abs(Muy);

  steps.push(`§H1-1 — Interaccion:`);
  steps.push(`  Pu/φPn = ${fmt(absPu)}/${fmt(phiPn)} = ${fmt(axialRatio, 3)}`);

  let equation: 'H1-1a' | 'H1-1b';
  let value: number;

  if (axialRatio >= 0.2) {
    // H1-1a: Pu/(φPn) + 8/9·(Mux/(φMnx) + Muy/(φMny)) ≤ 1.0
    equation = 'H1-1a';
    const momentTerm =
      (phiMnx > 0 ? absMux / phiMnx : 0) +
      (phiMny > 0 ? absMuy / phiMny : 0);
    value = axialRatio + (8 / 9) * momentTerm;

    steps.push(`  Pu/φPn ≥ 0.2 → ecuacion H1-1a`);
    steps.push(`  H1-1a = Pu/φPn + 8/9·(Mux/φMnx + Muy/φMny)`);
    steps.push(`        = ${fmt(axialRatio, 3)} + 8/9·(${fmt(absMux)}/${fmt(phiMnx)} + ${fmt(absMuy)}/${fmt(phiMny)})`);
    steps.push(`        = ${fmt(value, 3)}`);
  } else {
    // H1-1b: Pu/(2·φPn) + (Mux/(φMnx) + Muy/(φMny)) ≤ 1.0
    equation = 'H1-1b';
    const momentTerm =
      (phiMnx > 0 ? absMux / phiMnx : 0) +
      (phiMny > 0 ? absMuy / phiMny : 0);
    value = axialRatio / 2 + momentTerm;

    steps.push(`  Pu/φPn < 0.2 → ecuacion H1-1b`);
    steps.push(`  H1-1b = Pu/(2·φPn) + (Mux/φMnx + Muy/φMny)`);
    steps.push(`        = ${fmt(absPu)}/(2·${fmt(phiPn)}) + (${fmt(absMux)}/${fmt(phiMnx)} + ${fmt(absMuy)}/${fmt(phiMny)})`);
    steps.push(`        = ${fmt(value, 3)}`);
  }

  const ratio = value;
  const status = statusFromRatio(ratio);

  steps.push(`  Resultado: ${value <= 1.0 ? 'VERIFICA' : 'NO VERIFICA'} (${fmt(value, 3)} ${value <= 1.0 ? '≤' : '>'} 1.0)`);

  return {
    equation,
    value,
    ratio,
    status,
    steps,
  };
}

// ---------------------------------------------------------------------------
// Verificacion completa de un elemento
// ---------------------------------------------------------------------------

export function verifySteelElement(input: SteelVerificationInput): SteelVerification {
  const { elementId, Nu, Muy, Muz, Vu, params } = input;
  const steps: string[] = [];

  steps.push(`=== Verificacion CIRSOC 301 — Elemento ${elementId} ===`);
  steps.push(`Solicitaciones: Nu=${fmt(Nu)} kN, Muz=${fmt(Muz)} kN·m, Muy=${fmt(Muy)} kN·m, Vu=${fmt(Vu)} kN`);
  steps.push('');

  // Tension o compresion
  let tension: SteelTensionResult | undefined;
  let compression: SteelCompressionResult | undefined;

  if (Nu < 0) {
    // Traccion (convencion: + = compresion)
    tension = checkSteelTension(params, Nu);
    steps.push(...tension.steps);
    steps.push('');
  } else if (Nu > 0) {
    compression = checkSteelCompression(params, Nu);
    steps.push(...compression.steps);
    steps.push('');
  }

  // Flexion eje fuerte
  const flexureZ = checkSteelFlexure(params, Muz, 'strong');
  steps.push(...flexureZ.steps);
  steps.push('');

  // Flexion eje debil (solo si hay momento)
  let flexureY: SteelFlexureResult | undefined;
  if (Math.abs(Muy) > 1e-6) {
    flexureY = checkSteelFlexure(params, Muy, 'weak');
    steps.push(...flexureY.steps);
    steps.push('');
  }

  // Corte
  const shear = checkSteelShear(params, Vu);
  steps.push(...shear.steps);
  steps.push('');

  // Interaccion (si hay carga axial y flexion simultanea)
  let interaction: SteelInteractionResult | undefined;
  const hasAxial = Math.abs(Nu) > 1e-6;
  const hasMoment = Math.abs(Muz) > 1e-6 || Math.abs(Muy) > 1e-6;

  if (hasAxial && hasMoment) {
    interaction = checkSteelInteraction(params, Nu, Muz, Muy);
    steps.push(...interaction.steps);
    steps.push('');
  }

  // Estado general
  const allStatuses: VerifStatus[] = [flexureZ.status, shear.status];
  if (tension) allStatuses.push(tension.status);
  if (compression) allStatuses.push(compression.status);
  if (flexureY) allStatuses.push(flexureY.status);
  if (interaction) allStatuses.push(interaction.status);

  const overallStatus = worstStatus(...allStatuses);

  steps.push(`=== Resultado global: ${overallStatus.toUpperCase()} ===`);

  // Build diagnostics for sub-checks that fail or warn
  const diags: SolverDiagnostic[] = [];

  const checks: { name: string; result?: { status: VerifStatus; ratio: number } }[] = [
    { name: 'TENSION', result: tension },
    { name: 'COMPRESSION', result: compression },
    { name: 'FLEXURE_Z', result: flexureZ },
    { name: 'FLEXURE_Y', result: flexureY },
    { name: 'SHEAR', result: shear },
    { name: 'INTERACTION', result: interaction },
  ];

  for (const check of checks) {
    if (!check.result) continue;
    const { status, ratio } = check.result;
    if (status === 'fail') {
      diags.push({
        severity: 'error',
        code: `VERIF_STEEL_FAIL_${check.name}`,
        message: `Steel ${check.name.toLowerCase().replace('_', ' ')} check failed (ratio ${ratio.toFixed(3)})`,
        elementIds: [elementId],
        source: 'verification',
        details: { ratio },
      });
    } else if (status === 'warn') {
      diags.push({
        severity: 'warning',
        code: `VERIF_STEEL_WARN_${check.name}`,
        message: `Steel ${check.name.toLowerCase().replace('_', ' ')} check marginal (ratio ${ratio.toFixed(3)})`,
        elementIds: [elementId],
        source: 'verification',
        details: { ratio },
      });
    }
  }

  return {
    elementId,
    Nu,
    Muy,
    Muz,
    Vu,
    tension,
    compression,
    flexureZ,
    flexureY,
    shear,
    interaction,
    overallStatus,
    diagnostics: diags.length > 0 ? diags : undefined,
    steps,
  };
}
