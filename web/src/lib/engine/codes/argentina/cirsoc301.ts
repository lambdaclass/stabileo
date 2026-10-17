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
  Sy?: number;   // modulo elastico eje debil al borde del ala (m³); en una U el baricentro esta cerca del alma
  c?: number;    // factor c de F.2: 1 en una I doblemente simetrica, (h0/2)·√(Iy/Cw) en una U
  // Parametros de longitud
  L: number;     // longitud del elemento (m)
  Lb: number;    // longitud no arriostrada para pandeo lateral-torsional (m)
  Kx?: number;   // factor de longitud efectiva, eje fuerte (default 1.0)
  Ky?: number;   // factor de longitud efectiva, eje debil (default 1.0)
  J?: number;    // constante torsional (m⁴)
  Cw?: number;   // constante de alabeo (m⁶)
  /**
   * Factor de modificacion por gradiente de momento, F.1.1.
   *
   * Opcional. Ausente => 1,0, que el reglamento permite explicitamente («Se permite adoptar
   * conservadoramente un valor Cb = 1 para todos los casos»). El llamador lo calcula desde el
   * diagrama de momentos con `engine/steel/moment-gradient.ts`, que tambien decide cuando F.1.1
   * NO aplica — voladizo con extremo libre, o simple simetria en doble curvatura (§F.1(4)).
   */
  Cb?: number;
  /**
   * Seccion armada (soldada) en lugar de laminada. Solo cambia `d` en Aw = d·tw de §G.2.2:
   * altura del alma en una armada, altura total en una laminada. Ausente => laminada.
   */
  builtUp?: boolean;
  /**
   * Familia de la seccion para la clasificacion (Tabla B.4.1): 'I' (tambien 'H'), 'U', 'T',
   * 'box', 'RHS', 'CHS', 'rect'/'solid'. Ausente => 'I'. Una forma que la clasificacion no
   * conoce (p. ej. 'C' conformada en frio, CIRSOC 303) se rechaza: NO EVALUADO, nunca verifica.
   * En 'box'/'RHS'/'CHS', `tw` es el espesor de las almas (de la pared en tubos), `tf` el de las alas.
   */
  shape?: string;
  /** Altura libre del alma h de B.4.1(b), m. Ausente => h − 2·tf (sin radio: ≥ la real, conservador). */
  hw?: number;
  /**
   * Posicion de la carga para F.2.2: 'web' — en el alma o el ala inferior (F.2.4a/F.2.5a/F.2.6a);
   * 'topFlange' — en el ala superior (F.2.4b/F.2.5b/F.2.6b). Ausente => 'topFlange', las
   * expresiones menores, porque el verificador no sabe donde se aplica la carga.
   */
  loadPosition?: 'web' | 'topFlange';
  /** Modulo de elasticidad transversal G (MPa). Ausente => 77 200 MPa (A.3.5). */
  G?: number;
  /** Elementos comprimidos para Q (§E.7), si se quieren dar explicitamente en vez de derivarlos. */
  compressionElements?: CompressionElement[];
  /**
   * Pandeo torsional y flexo-torsional, §E.4: factor kz (default 1,0 — torsion impedida y alabeo
   * libre en los extremos) y longitud no arriostrada a torsion Lz (m, default L).
   */
  Kz?: number;
  Lz?: number;
  /**
   * Distancia del centro de corte al baricentro sobre el eje de simetria (m), para 'U' y 'T'
   * (xo, yo de E.4.10/E.4.11). Ausente => la de la seccion de chapas delgadas a partir de h, b,
   * tw, tf.
   */
  shearCentreOffset?: number;
  /**
   * La union extrema de un miembro traccionado, para el area neta efectiva Ae = An·U de D.2(b)
   * y D.3. Ausente => la rotura en la seccion neta NO se evalua y la traccion queda NO EVALUADA:
   * An depende de los agujeros y U de como se une la barra, datos que la seccion no tiene.
   */
  tensionConnection?: TensionConnection;
}

/**
 * The end connection of a tension member (D.3, B.4.2.2). Lengths in m, areas in m².
 *
 * Net area An: `An` as given, else Ag − Σ holes·(d + 2 mm)·t + Σ s²·t/(4g) over the chain
 * (B.4.2.2), else Ag (no holes: `holes` empty or absent).
 * Shear lag U, in this order:
 *   · `U` as given (0 < U ≤ 1);
 *   · `allElementsConnected` — D.3(1): every element of the section is connected, U = 1;
 *   · `plateWeld` {L, w} — D.3(2)(d), a flat plate welded along both edges: L ≥ 2w → 1,
 *     2w > L ≥ 1,5w → 0,87, 1,5w > L ≥ w → 0,75, L < w refused; applied to Ag (D.3.5);
 *   · `xBar` and `length` — D.3.2, U = 1 − x̄/L ≤ 0,9, never below `connectedArea`/Ag
 *     when that is given (D.3, open sections). Applied to An if bolted, to Ag if welded
 *     (`welded`, D.3.3).
 * Without any of them U is unknown and the rupture limit state is refused.
 */
export interface TensionConnection {
  An?: number;
  holes?: { count: number; d: number; t: number; staggers?: { s: number; g: number; t: number }[] };
  U?: number;
  allElementsConnected?: boolean;
  plateWeld?: { L: number; w: number };
  xBar?: number;
  length?: number;
  connectedArea?: number;
  welded?: boolean;
}

export interface SteelTensionResult {
  Pu: number;      // demanda (kN)
  phiPn: number;   // capacidad (kN)
  ratio: number;
  status: VerifStatus;
  steps: string[];
  /** Why the check could not be evaluated (no connection for D.2(b)). */
  notEvaluated?: string;
}

export interface SteelCompressionResult {
  Pu: number;
  KLr: number;     // esbeltez gobernante
  Fe: number;      // tension de Euler (MPa)
  Fcr: number;     // tension critica (MPa)
  phiPn: number;   // capacidad (kN)
  /** Factor de reduccion por elementos esbeltos Q = Qs·Qa (§E.7); 1 sin elementos esbeltos. */
  Q: number;
  ratio: number;
  status: VerifStatus;
  steps: string[];
  /** Presente cuando la resistencia no se pudo evaluar: el motivo. Nunca es un «verifica». */
  notEvaluated?: string;
}

export interface SteelFlexureResult {
  Mu: number;      // demanda (kN·m)
  Mp: number;      // momento plastico (kN·m)
  Mn: number;      // momento nominal (kN·m, puede estar reducido por LTB)
  phiMn: number;   // capacidad de diseno (kN·m)
  Lp: number;      // limite compacto (m)
  Lr: number;      // limite no compacto (m)
  /** Seccion del Capitulo F aplicada: 'F.2' … 'F.6'. */
  clause?: string;
  ratio: number;
  status: VerifStatus;
  steps: string[];
  /** Presente cuando la resistencia no se pudo evaluar: el motivo. Nunca es un «verifica». */
  notEvaluated?: string;
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
  /** Presente cuando una capacidad que la interaccion usa no se pudo evaluar. */
  notEvaluated?: string;
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
  /** Governing combination per force component (from combo-driven verification). */
  governingCombos?: {
    flexure?: { comboId: number; comboName: string };
    shear?: { comboId: number; comboName: string };
    axial?: { comboId: number; comboName: string };
  };
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

/**
 * Sy — modulo elastico eje debil = Iy / (b/2).
 *
 * El espejo exacto de `computeSx`, y hace falta porque F.6.1 impone el mismo tope que F.2.1 en el
 * eje debil:
 *
 *     Mn = Mp = Fy Zy (10)-3 ≤ 1,5 Fy Sy (10)-3                                (F.6.1)
 *
 * Antes no existia, asi que el tope no se podia aplicar. Es aritmetica sobre datos que la seccion
 * ya trae — no un dato nuevo.
 */
function computeSy(p: SteelDesignParams): number {
  return p.Sy ?? p.Iy / (p.b / 2);
}

// ---------------------------------------------------------------------------
// §D — Traccion
// ---------------------------------------------------------------------------

export function checkSteelTension(params: SteelDesignParams, Pu: number): SteelTensionResult {
  const steps: string[] = [];
  const { Fy, Fu, A } = params;

  // A en m², Fy en MPa = N/mm² => convertir A a mm² para la multiplicacion
  // Pn = Fy * Ag  (N) => / 1000 => kN
  const Ag_mm2 = A * 1e6;

  const phiY = 0.90;
  const phiR = 0.75;

  // Fluencia en seccion bruta
  const PnY = Fy * Ag_mm2 / 1000; // kN
  const phiPnY = phiY * PnY;

  steps.push(`§D2 — Fluencia en seccion bruta:`);
  steps.push(`  Ag = ${fmt(Ag_mm2, 0)} mm²`);
  steps.push(`  Pn = Fy·Ag = ${fmt(Fy)}·${fmt(Ag_mm2, 0)} = ${fmt(PnY)} kN`);
  steps.push(`  φPn = ${fmt(phiY)}·${fmt(PnY)} = ${fmt(phiPnY)} kN`);

  /*
   * ── D.2(b): rupture on the effective net section, Ae = An·U (D.3) ──
   *
   * It used Ae = Ag: no hole deduction and no shear lag. A bolted angle connected by one leg
   * (U ≈ 0,6–0,8, holes ≈ 15 %) was overstated by up to half. Without the connection the
   * limit state cannot be evaluated, and is refused.
   */
  const absPu = Math.abs(Pu);
  const ae = effectiveNetArea(params, steps);
  if ('refused' in ae) {
    steps.push(`§D2 — Rotura en seccion neta: NO EVALUADO — ${ae.refused}`);
    return {
      Pu: absPu, phiPn: absPu > 0 ? 0 : phiPnY, ratio: absPu > 0 ? Infinity : 0,
      status: absPu > 0 ? 'fail' : 'ok', steps, notEvaluated: ae.refused,
    };
  }
  const Ae_mm2 = ae.Ae * 1e6;
  const PnR = Fu * Ae_mm2 / 1000; // kN
  const phiPnR = phiR * PnR;

  steps.push(`§D2 — Rotura en seccion neta:`);
  steps.push(`  Ae = ${fmt(Ae_mm2, 0)} mm²`);
  steps.push(`  Pn = Fu·Ae = ${fmt(Fu)}·${fmt(Ae_mm2, 0)} = ${fmt(PnR)} kN`);
  steps.push(`  φPn = ${fmt(phiR)}·${fmt(PnR)} = ${fmt(phiPnR)} kN`);

  const phiPn = Math.min(phiPnY, phiPnR);
  const governing = phiPn === phiPnY ? 'fluencia' : 'rotura';
  steps.push(`  Gobierna: ${governing}, φPn = ${fmt(phiPn)} kN`);

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

/** Ae (m²) per D.3 and B.4.2.2 from `tensionConnection`, or why it cannot be known. */
function effectiveNetArea(p: SteelDesignParams, steps: string[]): { Ae: number } | { refused: string } {
  const c = p.tensionConnection;
  if (!c) return { refused: 'falta la union extrema (agujeros y coeficiente U de D.3)' };
  const Ag = p.A;
  let An = Ag;
  if (c.An !== undefined) {
    if (!(c.An > 0 && c.An <= Ag)) return { refused: `An = ${c.An} fuera de (0, Ag]` };
    An = c.An;
    steps.push(`  An = ${fmt(An * 1e6, 0)} mm² (dada)`);
  } else if (c.holes && c.holes.count > 0) {
    const { count, d, t } = c.holes;
    if (!(d > 0 && t > 0)) return { refused: 'agujeros sin diametro o espesor' };
    // B.4.2.2: the hole width is the nominal hole (Tabla J.3.3) plus 2 mm.
    const stagger = (c.holes.staggers ?? []).reduce((acc, z) => acc + (z.s * z.s * z.t) / (4 * z.g), 0);
    An = Ag - count * (d + 0.002) * t + stagger;
    steps.push(`  An = Ag − n·(d + 2 mm)·t + Σs²t/4g = ${fmt(Ag * 1e6, 0)} − ${count}·${fmt((d + 0.002) * 1000, 1)}·${fmt(t * 1000, 1)} + ${fmt(stagger * 1e6, 0)} = ${fmt(An * 1e6, 0)} mm²  (B.4.2.2)`);
    if (!(An > 0)) return { refused: 'An ≤ 0' };
  }

  if (c.U !== undefined) {
    if (!(c.U > 0 && c.U <= 1)) return { refused: `U = ${c.U} fuera de (0, 1]` };
    steps.push(`  U = ${fmt(c.U, 3)} (dado)`);
    return { Ae: An * c.U };
  }
  if (c.allElementsConnected) {
    steps.push(`  Todos los elementos unidos: Ae = An  (D.3(1))`);
    return { Ae: An };
  }
  if (c.plateWeld) {
    const { L, w } = c.plateWeld;
    if (!(L > 0 && w > 0) || L < w) return { refused: 'chapa soldada en sus bordes con L < w (D.3(2)(d) exige L ≥ w)' };
    const U = L >= 2 * w ? 1 : L >= 1.5 * w ? 0.87 : 0.75;
    steps.push(`  Chapa con cordones longitudinales: L = ${fmt(L * 1000, 0)} mm, w = ${fmt(w * 1000, 0)} mm → U = ${fmt(U, 2)}  (D.3.5)`);
    return { Ae: Ag * U };
  }
  if (c.xBar !== undefined && c.length !== undefined) {
    if (!(c.xBar >= 0 && c.length > 0)) return { refused: 'x̄ o L de la union no validos' };
    let U = Math.min(0.9, 1 - c.xBar / c.length);
    steps.push(`  U = 1 − x̄/L = 1 − ${fmt(c.xBar * 1000, 1)}/${fmt(c.length * 1000, 0)} = ${fmt(1 - c.xBar / c.length, 3)} ≤ 0,9 → ${fmt(U, 3)}  (D.3.2)`);
    if (c.connectedArea !== undefined && c.connectedArea > 0) {
      const lower = Math.min(1, c.connectedArea / Ag);
      if (lower > U) {
        U = lower;
        steps.push(`  U ≥ A unida/Ag = ${fmt(lower, 3)} (D.3, secciones abiertas)`);
      }
    }
    if (!(U > 0)) return { refused: `U = ${fmt(U, 3)} ≤ 0` };
    const base = c.welded ? Ag : An;
    steps.push(`  Ae = ${c.welded ? 'Ag' : 'An'}·U  (${c.welded ? 'D.3.3' : 'D.3.1'})`);
    return { Ae: base * U };
  }
  return { refused: 'la union no da U: falta U, allElementsConnected, plateWeld o x̄ y L (D.3)' };
}

// ---------------------------------------------------------------------------
// Clasificacion — Tabla B.4.1a / B.4.1b
// ---------------------------------------------------------------------------
/*
 * The limits below are Table B.4.1a (compression) and Table B.4.1b (flexure) of CIRSOC
 * 301-2018, Cap. B pp. 21–23 (PDF pp. 75–77). The tables are images in the source PDF, so the
 * shipped Markdown has no text for them; they were transcribed from the official PDF
 * (`docs/codes/CIRSOC/SOURCES.md`, SHA-256 cbfd04b8…) and agree with the values INTI's
 * *Ejemplos de Aplicación CIRSOC 301-2018* quotes in their 2005-style form (170/√Fy,
 * 425/√(FL/kc), 1680/√Fy, 2550/√Fy, 665/√Fy, 250/√Fy at E = 200 000 MPa).
 *
 *   B.4.1a  case 1  rolled flanges            b/t   λr = 0,56 √(E/Fy)
 *           case 2  welded flanges            b/t   λr = 0,64 √(kc E/Fy)
 *           case 3  angles                    b/t   λr = 0,45 √(E/Fy)
 *           case 4  tee stems                 d/t   λr = 0,75 √(E/Fy)
 *           case 5  webs of I and channels    h/tw  λr = 1,49 √(E/Fy)
 *           case 6  walls of RHS              b/t   λr = 1,40 √(E/Fy)
 *           case 8  walls of welded boxes     b/t   λr = 1,49 √(E/Fy)
 *           case 10 circular tubes            D/t   λr = 0,11 E/Fy
 *   B.4.1b  case 11 rolled I/channel flanges  b/t   λp = 0,38 √(E/Fy)  λr = 0,83 √(E/FL), FL = 0,7 Fy (obs. b)
 *           case 12 welded I flanges          b/t   λp = 0,38 √(E/Fy)  λr = 0,95 √(kc E/FL)
 *           case 14 flanges, minor axis       b/t   λp = 0,38 √(E/Fy)  λr = 1,00 √(E/Fy)
 *           case 16 webs of I and channels    h/tw  λp = 3,76 √(E/Fy)  λr = 5,70 √(E/Fy)
 *   kc = 4/√(h/tw), 0,35 ≤ kc ≤ 0,763 (obs. a).
 */

/** Residual stress Fr, F.2.7 / F.3.2 / F.4.6a: 69 MPa rolled, 114 MPa welded. */
const FR_ROLLED = 69;
const FR_WELDED = 114;
/** G, A.3.5 (Simbologia): 77 200 MPa. */
const G_CIRSOC = 77200;

/** Section family the classification knows. Absent => 'I' (the checker's historical model). */
export type SteelShape = 'I' | 'U' | 'T' | 'box' | 'RHS' | 'CHS' | 'solid';

/** Map an app shape name to the checker's family, or null for one it cannot classify. */
export function steelShapeOf(shape: string | undefined): SteelShape | null {
  switch (shape) {
    case undefined: case 'I': case 'H': return 'I';
    case 'U': return 'U';
    case 'T': return 'T';
    case 'box': return 'box';
    case 'RHS': return 'RHS';
    case 'CHS': return 'CHS';
    case 'rect': case 'solid': return 'solid';
    default: return null; // 'C' (cold-formed, CIRSOC 303), 'L' and anything else
  }
}

/** Clear web height h of B.4.1(b), mm. Without `hw`, d − 2 tf: no root radius, so ≥ the true h. */
function webClearHeightMm(p: SteelDesignParams): number {
  return (p.hw ?? (p.h - 2 * p.tf)) * 1000;
}

/** kc = 4/√(h/tw), clamped to 0,35 … 0,763 (Tabla B.4.1, obs. a). */
function kcOf(hMm: number, twMm: number): number {
  return Math.min(0.763, Math.max(0.35, 4 / Math.sqrt(hMm / twMm)));
}

/** A compression element for Q (§E.7). `b`, `t` in m. */
export interface CompressionElement {
  /**
   * unstiffenedRolled — Tabla B.4.1a case 1, E.7.4–E.7.6;
   * unstiffenedWelded — case 2, E.7.7–E.7.9 (needs the web's h/tw for kc);
   * angle — case 3, E.7.10–E.7.12; teeStem — case 4, E.7.13–E.7.15;
   * stiffened — cases 5 and 8, E.7.17 with f = Fcr(Q = 1);
   * tubeWall — case 6, E.7.18 with f = Fy (the permitted conservative value).
   */
  kind: 'unstiffenedRolled' | 'unstiffenedWelded' | 'angle' | 'teeStem' | 'stiffened' | 'tubeWall';
  b: number;
  t: number;
  /** How many such elements the section has. */
  count: number;
}

/** The section's compression elements as B.4.1 defines their widths, or null if unknown. */
function compressionElements(p: SteelDesignParams, shape: SteelShape): CompressionElement[] | null {
  if (p.compressionElements) return p.compressionElements;
  const hw = webClearHeightMm(p) / 1000;
  const flange: CompressionElement['kind'] = p.builtUp ? 'unstiffenedWelded' : 'unstiffenedRolled';
  switch (shape) {
    case 'I': // B.4.1(a)(a): b = bf/2; B.4.1(b)(a)/(b): h
      return [{ kind: flange, b: p.b / 2, t: p.tf, count: 4 }, { kind: 'stiffened', b: hw, t: p.tw, count: 1 }];
    case 'U': // B.4.1(a)(b): b = bf
      return [{ kind: flange, b: p.b, t: p.tf, count: 2 }, { kind: 'stiffened', b: hw, t: p.tw, count: 1 }];
    case 'T': // B.4.1(a)(a) flange bf/2, (d) stem = total depth d
      return [{ kind: flange, b: p.b / 2, t: p.tf, count: 2 }, { kind: 'teeStem', b: p.h, t: p.tw, count: 1 }];
    case 'box': // B.4.1(b)(c): distance between welds
      return [
        { kind: 'stiffened', b: p.b - 2 * p.tw, t: p.tf, count: 2 },
        { kind: 'stiffened', b: p.h - 2 * p.tf, t: p.tw, count: 2 },
      ];
    case 'RHS': // B.4.1(b)(d): radius unknown → total width − 3 t
      return [
        { kind: 'tubeWall', b: p.b - 3 * p.tw, t: p.tw, count: 2 },
        { kind: 'tubeWall', b: p.h - 3 * p.tw, t: p.tw, count: 2 },
      ];
    case 'solid':
      return [];
    default:
      return null;
  }
}

interface QResult { Q: number; Qs: number; Qa: number; slender: boolean; refused?: string }

/**
 * §E.7 — Q = Qs·Qa. `fQ1` is f = Fcr with Q = 1 (E.7.17); `kcHtw` the h/tw that sets kc.
 */
function slenderReduction(
  p: SteelDesignParams, shape: SteelShape, fQ1: number, steps: string[],
): QResult {
  const { Fy, E } = p;
  if (shape === 'CHS') {
    // E.7.2(c), Tabla B.4.1a case 10. D = h, t = tw.
    const Dt = p.h / p.tw;
    const lim = 0.11 * E / Fy;
    if (Dt <= lim) {
      steps.push(`  D/t = ${fmt(Dt, 1)} ≤ 0,11·E/Fy = ${fmt(lim, 1)} → no esbelta, Q = 1 (Tabla B.4.1a caso 10)`);
      return { Q: 1, Qs: 1, Qa: 1, slender: false };
    }
    if (Dt > 0.45 * E / Fy) {
      return { Q: 0, Qs: 1, Qa: 0, slender: true,
        refused: `D/t = ${fmt(Dt, 1)} > 0,45·E/Fy = ${fmt(0.45 * E / Fy, 1)}: E.7.2(c) no cubre este tubo` };
    }
    const Q = 0.038 * E / (Fy * Dt) + 2 / 3;
    steps.push(`  D/t = ${fmt(Dt, 1)} > 0,11·E/Fy → Q = Qa = 0,038·E/(Fy·D/t) + 2/3 = ${fmt(Q, 3)}  (E.7.19)`);
    return { Q, Qs: 1, Qa: Q, slender: true };
  }

  const elems = compressionElements(p, shape);
  if (elems == null) {
    return { Q: 0, Qs: 1, Qa: 0, slender: true,
      refused: `forma de seccion «${p.shape}» sin clasificacion segun la Tabla B.4.1a` };
  }
  const r = Math.sqrt(E / Fy);
  const kc = kcOf(webClearHeightMm(p), p.tw * 1000);
  let Qs = 1;
  let lostArea = 0; // m²
  let slender = false;
  for (const el of elems) {
    const lam = el.b / el.t;
    let q = 1;
    let lamR: number;
    switch (el.kind) {
      case 'unstiffenedRolled': // E.7.4–E.7.6
        lamR = 0.56 * r;
        if (lam > 1.03 * r) q = 0.69 * E / (Fy * lam * lam);
        else if (lam > lamR) q = 1.415 - 0.74 * lam / r;
        break;
      case 'unstiffenedWelded': { // E.7.7–E.7.9
        const rk = Math.sqrt(E * kc / Fy);
        lamR = 0.64 * rk;
        if (lam > 1.17 * rk) q = 0.90 * E * kc / (Fy * lam * lam);
        else if (lam > lamR) q = 1.415 - 0.65 * lam / rk;
        break;
      }
      case 'angle': // E.7.10–E.7.12
        lamR = 0.45 * r;
        if (lam > 0.91 * r) q = 0.53 * E / (Fy * lam * lam);
        else if (lam > lamR) q = 1.34 - 0.76 * lam / r;
        break;
      case 'teeStem': // E.7.13–E.7.15
        lamR = 0.75 * r;
        if (lam > 1.03 * r) q = 0.69 * E / (Fy * lam * lam);
        else if (lam > lamR) q = 1.908 - 1.22 * lam / r;
        break;
      case 'stiffened': { // cases 5 / 8, E.7.17 with f = Fcr(Q = 1)
        lamR = 1.49 * r;
        const rf = Math.sqrt(E / fQ1);
        if (lam > lamR && lam >= 1.49 * rf) {
          const be = Math.min(el.b, 1.91 * el.t * rf * (1 - 0.34 / lam * rf));
          lostArea += el.count * (el.b - be) * el.t;
          steps.push(`  elemento rigidizado b/t = ${fmt(lam, 1)} > λr = ${fmt(lamR, 1)}: be = 1,91·t·√(E/f)·[1 − 0,34/(b/t)·√(E/f)] = ${fmt(be * 1000, 1)} mm de ${fmt(el.b * 1000, 1)} mm (E.7.17, f = ${fmt(fQ1, 1)} MPa)`);
        }
        break;
      }
      case 'tubeWall': { // case 6, E.7.18 with f = Fy (conservative, as the Observacion permits)
        lamR = 1.40 * r;
        const rf = Math.sqrt(E / Fy);
        if (lam > lamR) {
          const be = Math.min(el.b, 1.91 * el.t * rf * (1 - 0.38 / lam * rf));
          lostArea += el.count * (el.b - be) * el.t;
          steps.push(`  pared de tubo b/t = ${fmt(lam, 1)} > λr = ${fmt(lamR, 1)}: be = ${fmt(be * 1000, 1)} mm (E.7.18, f = Fy)`);
        }
        break;
      }
    }
    if (lam > lamR) slender = true;
    if (q < 1) {
      steps.push(`  elemento no rigidizado (${el.kind}) b/t = ${fmt(lam, 1)} > λr = ${fmt(lamR, 1)}: Qs = ${fmt(q, 3)}`);
      Qs = Math.min(Qs, q); // §E.7: the smallest Qs, which the clause allows conservatively
    }
  }
  const Qa = (p.A - lostArea) / p.A; // E.7.16
  return { Q: Qs * Qa, Qs, Qa, slender };
}

// ---------------------------------------------------------------------------
// §E — Compresion
// ---------------------------------------------------------------------------

/**
 * §E.4 — torsional and flexural-torsional buckling. Returns the governing critical stress from
 * E.4 for the section (null where E.4 does not apply), or the reason it cannot be evaluated.
 *
 *   I (doubly symmetric):  Fe = [π²·E·Cw/(kz·Lz)² + G·J]/(Ix + Iy)                    (E.4.4)
 *   U (symmetric about x), T with slender elements (symmetric about y):
 *     Fe = (Fes + Fez)/(2H)·[1 − √(1 − 4·Fes·Fez·H/(Fes + Fez)²)]                      (E.4.5)
 *     Fez = [π²·E·Cw/(kz·Lz)² + G·J]/(Ag·ro²), ro² = e0² + (Ix + Iy)/Ag, H = 1 − e0²/ro²
 *   T without slender elements (case (a)):
 *     Fcr = (Fcry + Fcrz)/(2H)·[1 − √(1 − 4·Fcry·Fcrz·H/(Fcry + Fcrz)²)]              (E.4.2)
 *     Fcrz = G·J/(Ag·ro²)                                                              (E.4.3)
 *   Closed sections (box, RHS, CHS) and solid bars: their torsional stiffness keeps E.4 from
 *   governing; not evaluated.
 *
 * Fe goes into E.7.2a/E.7.3a (E.3.2a/E.3.3a with Q = 1) as the flexural Fe does.
 */
type TorsionalBuckling =
  | { kind: 'none' }
  | { kind: 'Fe'; Fe: number }
  | { kind: 'Fcr'; Fcr: number }
  | { kind: 'refused'; reason: string };

function torsionalBuckling(
  p: SteelDesignParams, shape: SteelShape, Q: number, fcrFlexural: (Fe: number) => number, steps: string[],
): TorsionalBuckling {
  if (shape === 'box' || shape === 'RHS' || shape === 'CHS' || shape === 'solid') return { kind: 'none' };
  const { E, A, Iz, Iy, L } = p;
  const G = p.G ?? G_CIRSOC;
  const kz = p.Kz ?? 1.0;
  const Lz = p.Lz ?? L;
  const kzL = kz * Lz;
  const Ky = p.Ky ?? 1.0, Kx = p.Kx ?? 1.0;
  const J = p.J;
  if (shape === 'I') {
    // E.4 applies to a doubly symmetric open section when its torsional length exceeds the
    // flexural one; it is evaluated whenever J and Cw are known (it can only lower Pn).
    if (!(J && J > 0 && p.Cw && p.Cw > 0)) {
      if (kzL > Ky * L) return { kind: 'refused', reason: '§E.4: kz·Lz > ky·L y faltan J o Cw para el pandeo torsional' };
      steps.push(`  §E.4: sin J/Cw; no aplica a una seccion doblemente simetrica con kz·Lz ≤ ky·L`);
      return { kind: 'none' };
    }
    const Fe = ((Math.PI ** 2 * E * p.Cw) / (kzL * kzL) + G * J) / (Iz + Iy);
    steps.push(`  §E.4 pandeo torsional: Fe = [π²·E·Cw/(kz·Lz)² + G·J]/(Ix + Iy) = ${fmt(Fe, 1)} MPa  (E.4.4)`);
    return { kind: 'Fe', Fe };
  }
  // Singly symmetric: U about x (the strong axis), T about y.
  if (!(J && J > 0)) return { kind: 'refused', reason: '§E.4: falta J para el pandeo flexo-torsional' };
  const e0 = p.shearCentreOffset ?? shearCentreOffsetOf(p, shape);
  if (!(Number.isFinite(e0) && e0 >= 0)) return { kind: 'refused', reason: '§E.4: centro de corte desconocido' };
  // Cw of a tee is small and of a channel not always given: 0 understates Fez (conservative).
  const Cw = p.Cw && p.Cw > 0 ? p.Cw : 0;
  const ro2 = e0 * e0 + (Iz + Iy) / A;
  const H = 1 - (e0 * e0) / ro2;
  const Fez = ((Math.PI ** 2 * E * Cw) / (kzL * kzL) + G * J) / (A * ro2);
  const combine = (a: number, b: number) => ((a + b) / (2 * H)) * (1 - Math.sqrt(1 - (4 * a * b * H) / ((a + b) * (a + b))));
  steps.push(`  §E.4: e0 = ${fmt(e0 * 1000, 1)} mm, ro² = ${fmt(ro2 * 1e4, 2)} cm², H = ${fmt(H, 3)}  (E.4.10, E.4.11)`);
  if (shape === 'T' && Q >= 1) {
    const ry = radiusOfGyration(Iy, A);
    const Fcry = fcrFlexural((Math.PI ** 2 * E) / ((Ky * L) / ry) ** 2);
    const Fcrz = (G * J) / (A * ro2);
    const Fcr = combine(Fcry, Fcrz);
    steps.push(`  §E.4(a) Te: Fcry = ${fmt(Fcry, 1)} MPa, Fcrz = G·J/(Ag·ro²) = ${fmt(Fcrz, 1)} MPa → Fcr = ${fmt(Fcr, 1)} MPa  (E.4.2, E.4.3)`);
    return { kind: 'Fcr', Fcr };
  }
  const Fes = shape === 'U'
    ? (Math.PI ** 2 * E) / ((Kx * L) / radiusOfGyration(Iz, A)) ** 2
    : (Math.PI ** 2 * E) / ((Ky * L) / radiusOfGyration(Iy, A)) ** 2;
  const Fe = combine(Fes, Fez);
  steps.push(`  §E.4(b.2) flexo-torsional: Fe(eje de simetria) = ${fmt(Fes, 1)}, Fez = ${fmt(Fez, 1)} → Fe = ${fmt(Fe, 1)} MPa  (E.4.5, E.4.9)`);
  return { kind: 'Fe', Fe };
}

/**
 * Shear-centre offset from the centroid along the axis of symmetry, thin-walled plates (m):
 *   T: the flange/stem junction, e0 = (h − tf)·tw·(h/2)/(b·tf + (h − tf)·tw) from the flange
 *      mid-plane to the centroid;
 *   U: e = 3·b'²·tf/(6·b'·tf + h'·tw) behind the web, centroid x̄ = b'²·tf/(2·b'·tf + h'·tw) in
 *      front of it, e0 = e + x̄, with b' = b − tw/2 and h' = h − tf.
 */
function shearCentreOffsetOf(p: SteelDesignParams, shape: SteelShape): number {
  const { h, b, tw, tf } = p;
  if (shape === 'T') return ((h - tf) * tw * (h / 2)) / (b * tf + (h - tf) * tw);
  const bp = b - tw / 2, hp = h - tf;
  return (3 * bp * bp * tf) / (6 * bp * tf + hp * tw) + (bp * bp * tf) / (2 * bp * tf + hp * tw);
}

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

  // Tension critica de Euler (E.3.4a)
  const Fe = (Math.PI * Math.PI * E) / (KLr * KLr); // MPa
  steps.push(`  Fe = π²·E / (KL/r)² = ${fmt(Fe, 1)} MPa`);

  /*
   * E.3 / E.7 in the λc form: λe = √(Fy/Fe), and with Q
   *
   *     λe·√Q ≤ 1,5:  Fcr = Q·0,658^(Q·λe²)·Fy                                    (E.7.2)
   *     λe·√Q > 1,5:  Fcr = (0,877/λe²)·Fy                                         (E.7.3)
   *
   * which is E.3.2/E.3.3 for Q = 1 (a section with no slender element, B.4.1).
   */
  const fcrOf = (Q: number, fe = Fe) => {
    const lam2 = Fy / fe;
    return Math.sqrt(Q * lam2) <= 1.5 ? Q * Math.pow(0.658, Q * lam2) * Fy : (0.877 / lam2) * Fy;
  };

  /*
   * ── §E.7: slender elements ───────────────────────────────────────
   *
   * Missing before: every section was taken as non-slender and E.3 applied with Q = 1. INTI's
   * Ejemplo 10(c) (welded box 180×180×2,5, b/t = 72 > λr = 43,4) prints Q = 0,794 and
   * Pd = 204,7 kN; the checker gave 237,4 kN, 16 % on the unsafe side.
   */
  const shape = steelShapeOf(params.shape);
  const fQ1 = fcrOf(1);
  const q = shape == null
    ? { Q: 0, Qs: 1, Qa: 0, slender: true, refused: `forma de seccion «${params.shape}» sin clasificacion segun la Tabla B.4.1a` }
    : slenderReduction(params, shape, fQ1, steps);

  const absPu = Math.abs(Pu);
  if (q.refused) {
    steps.push(`  NO EVALUADO — ${q.refused}`);
    const ratio = absPu > 0 ? Infinity : 0;
    return {
      Pu: absPu, KLr, Fe, Fcr: NaN, phiPn: 0, Q: NaN, ratio,
      status: absPu > 0 ? 'fail' : 'ok', steps, notEvaluated: q.refused,
    };
  }

  const Q = q.Q;
  if (q.slender) {
    steps.push(`  Seccion con elementos esbeltos (§E.7): Qs = ${fmt(q.Qs, 3)}, Qa = ${fmt(q.Qa, 3)}, Q = ${fmt(Q, 3)}`);
  } else {
    steps.push(`  Seccion sin elementos esbeltos (Tabla B.4.1a): Q = 1`);
  }

  const FcrFlex = fcrOf(Q);
  const lamE = Math.sqrt(Fy / Fe);
  steps.push(Math.sqrt(Q) * lamE <= 1.5
    ? `  λe·√Q = ${fmt(lamE * Math.sqrt(Q), 3)} ≤ 1,5 → Fcr = Q·0,658^(Q·λe²)·Fy = ${fmt(FcrFlex, 1)} MPa  (${Q < 1 ? 'E.7.2' : 'E.3.2'})`
    : `  λe·√Q = ${fmt(lamE * Math.sqrt(Q), 3)} > 1,5 → Fcr = 0,877/λe²·Fy = ${fmt(FcrFlex, 1)} MPa  (${Q < 1 ? 'E.7.3' : 'E.3.3'})`);

  /*
   * ── §E.4: torsional and flexural-torsional buckling ─────────────
   *
   * Missing before: only flexural buckling was checked, so a tee, a channel or a doubly
   * symmetric section braced only against flexure could pass with a capacity E.4 does not give.
   * Pn is the least of the limit states (E.7: «el menor valor ... pandeo flexional, pandeo
   * torsional y pandeo flexotorsional»).
   */
  const tb = torsionalBuckling(params, shape!, Q, (fe) => fcrOf(1, fe), steps);
  if (tb.kind === 'refused') {
    steps.push(`  NO EVALUADO — ${tb.reason}`);
    const ratio = absPu > 0 ? Infinity : 0;
    return {
      Pu: absPu, KLr, Fe, Fcr: NaN, phiPn: 0, Q, ratio,
      status: absPu > 0 ? 'fail' : 'ok', steps, notEvaluated: tb.reason,
    };
  }
  const FcrTors = tb.kind === 'Fe' ? fcrOf(Q, tb.Fe) : tb.kind === 'Fcr' ? tb.Fcr : Infinity;
  if (tb.kind === 'Fe') steps.push(`  Fcr (E.4 con Q) = ${fmt(FcrTors, 1)} MPa  (${Q < 1 ? 'E.7.2a/E.7.3a' : 'E.3.2a/E.3.3a'})`);
  const Fcr = Math.min(FcrFlex, FcrTors);
  if (FcrTors < FcrFlex) steps.push(`  Gobierna el pandeo ${shape === 'I' ? 'torsional' : 'flexo-torsional'} (§E.4): Fcr = ${fmt(Fcr, 1)} MPa`);

  // E.1: φc = 0,85. It read 0,90, the AISC 360 value, which the CIRSOC 301 text does not
  // adopt; the clause map already stated 0,85, so the check was 5,9 % on the unsafe side of it.
  const phi = 0.85;
  const Pn = Fcr * Ag_mm2 / 1000; // kN
  const phiPn = phi * Pn;

  steps.push(`  Pn = Fcr·Ag = ${fmt(Fcr, 1)}·${fmt(Ag_mm2, 0)} = ${fmt(Pn)} kN`);
  steps.push(`  φPn = ${fmt(phi)}·${fmt(Pn)} = ${fmt(phiPn)} kN`);

  const ratio = phiPn > 0 ? absPu / phiPn : (absPu > 0 ? Infinity : 0);

  steps.push(`  Pu = ${fmt(absPu)} kN`);
  steps.push(`  Ratio = ${fmt(ratio, 3)}`);

  return {
    Pu: absPu,
    KLr,
    Fe,
    Fcr,
    phiPn,
    Q,
    ratio,
    status: statusFromRatio(ratio),
    steps,
  };
}

// ---------------------------------------------------------------------------
// §F — Flexion
// ---------------------------------------------------------------------------

/** Nominal strength of one limit state, kN·m, with the clause that gave it. */
interface LimitState { name: string; Mn: number }

/** A flexure outcome before φ: the governing Mn and the lengths reported. */
interface FlexureCore {
  Mp: number; Mn: number; Lp: number; Lr: number; clause: string; refused?: string;
}

/**
 * §F.2.2 — lateral-torsional buckling of compact doubly symmetric I-sections and channels, in
 * CIRSOC 301-2018's own X1/X2 form, with the load-height cases the clause distinguishes:
 *
 *   (1) load on the web or bottom flange:  Lp = 1,76 ry √(E/Fyf)                       (F.2.5a)
 *       Lr = (ry X1/FL) √(1 + √(1 + X2 FL²))                                           (F.2.6a)
 *       Mcr = Cb Sx X1 √2/(Lb/ry) · √(1 + X1² X2/(2 (Lb/ry)²))                        (F.2.4a)
 *   (2) load on the top flange:            Lp = 1,59 ry √(E/Fyf)                       (F.2.5b)
 *       Lr = 1,28 ry X1/FL                                                             (F.2.6b)
 *       Mcr = 1,28 Cb Sx X1/(Lb/ry)                                                    (F.2.4b)
 *   X1 = (π/Sx) √(E G J Ag/2) (F.2.4c), X2 = (4 Cw/Iy)(Sx/(G J))² (F.2.4d),
 *   Mr = FL Sx (F.2.7a/b), FL = min(Fyf − Fr, Fyw), Fr = 69 MPa rolled, 114 MPa welded.
 *
 * Before: AISC 360-10's rts/c expressions with Mr = 0,7 Fy Sx, and no load height — INTI's
 * Ejemplo 14, V1 case I-B (IPN 180, deck on the top flange, Lb = 5 m) prints Md = 18,39 kNm.
 */
function ltbF22(
  p: SteelDesignParams, Mp: number, FL: number, steps: string[],
): { Mn: number; Lp: number; Lr: number; refused?: string } {
  const { Fy, E } = p;
  const G = p.G ?? G_CIRSOC;
  const top = (p.loadPosition ?? 'topFlange') === 'topFlange';
  const A = p.A * 1e6;
  const Iy = p.Iy * 1e12;
  const Sx = (p.Sx ?? computeSx(p)) * 1e9;
  const ry = Math.sqrt(Iy / A);
  const Lb = p.Lb * 1000;
  const Cb = p.Cb ?? 1.0;

  steps.push(p.loadPosition
    ? `  Carga aplicada ${top ? 'en el ala superior' : 'en el alma o el ala inferior'} (F.2.2 ${top ? '(2)' : '(1)'})`
    : `  Posicion de la carga no indicada: se adoptan las expresiones de ala superior (F.2.2 (2)), las conservadoras`);
  steps.push(p.Cb != null
    ? `  Cb = ${fmt(p.Cb, 3)} (F.1.1, calculado del diagrama)`
    : `  Cb = 1,000 (F.1.1 permite adoptarlo conservadoramente)`);

  const Lp = (top ? 1.59 : 1.76) * ry * Math.sqrt(E / Fy);
  steps.push(`  ry = ${fmt(ry, 1)} mm; Lp = ${top ? '1,59' : '1,76'}·ry·√(E/Fy) = ${fmt(Lp, 0)} mm  (F.2.5${top ? 'b' : 'a'})`);
  steps.push(`  Lb = ${fmt(Lb, 0)} mm`);
  if (Lb <= Lp) {
    steps.push(`  Lb ≤ Lp → Mn = Mp = ${fmt(Mp)} kN·m  (F.2.2(a))`);
    return { Mn: Mp, Lp: Lp / 1000, Lr: Lp / 1000 };
  }

  const J = (p.J ?? 0) * 1e12;
  if (!(J > 0)) {
    return { Mn: 0, Lp: Lp / 1000, Lr: NaN, refused: 'J no disponible: el pandeo lateral-torsional (F.2.4c) no se puede evaluar' };
  }
  const X1 = (Math.PI / Sx) * Math.sqrt(E * G * J * A / 2);
  // X2 needs Cw. Without it X2 = 0, which drops the warping contribution and can only lower
  // Lr and Mcr — a lower bound the clause's own expressions give, noted as such.
  const Cw = (p.Cw ?? 0) * 1e18;
  const X2 = Cw > 0 ? (4 * Cw / Iy) * (Sx / (G * J)) ** 2 : 0;
  const Lr = top
    ? 1.28 * ry * X1 / FL
    : (ry * X1 / FL) * Math.sqrt(1 + Math.sqrt(1 + X2 * FL * FL));
  const Mr = FL * Sx / 1e6;
  steps.push(`  X1 = (π/Sx)·√(E·G·J·A/2) = ${fmt(X1, 0)} MPa (F.2.4c)${Cw > 0 ? `, X2 = ${X2.toExponential(3)} MPa⁻² (F.2.4d)` : ', Cw no disponible: X2 = 0 (cota inferior)'}`);
  steps.push(`  FL = Fy − Fr = ${fmt(FL, 0)} MPa; Lr = ${fmt(Lr, 0)} mm (F.2.6${top ? 'b' : 'a'}); Mr = FL·Sx = ${fmt(Mr)} kN·m (F.2.7)`);

  if (Lb <= Lr) {
    const Mn = Math.min(Cb * (Mp - (Mp - Mr) * (Lb - Lp) / (Lr - Lp)), Mp);
    steps.push(`  Lp < Lb ≤ Lr → pandeo lateral-torsional inelastico: Mn = Cb·[Mp − (Mp − Mr)·(Lb − Lp)/(Lr − Lp)] ≤ Mp = ${fmt(Mn)} kN·m  (F.2.2)`);
    return { Mn, Lp: Lp / 1000, Lr: Lr / 1000 };
  }
  const lr = Lb / ry;
  const Mcr = (top
    ? 1.28 * Cb * Sx * X1 / lr
    : (Cb * Sx * X1 * Math.SQRT2 / lr) * Math.sqrt(1 + X1 * X1 * X2 / (2 * lr * lr))) / 1e6;
  const Mn = Math.min(Mcr, Mp);
  steps.push(`  Lb > Lr → pandeo lateral-torsional elastico: Mcr = ${fmt(Mcr)} kN·m (F.2.4${top ? 'b' : 'a'}); Mn = Mcr ≤ Mp = ${fmt(Mn)} kN·m  (F.2.3)`);
  return { Mn, Lp: Lp / 1000, Lr: Lr / 1000 };
}

/** rt of F.4.10 (I with a rectangular compression flange) or F.4.11 (channel), mm. */
function rtOf(p: SteelDesignParams, channel: boolean): number | null {
  const d = p.h * 1000, bf = p.b * 1000, tf = p.tf * 1000, tw = p.tw * 1000;
  const hw = webClearHeightMm(p);
  const ho = d - tf;
  if (channel) {
    const Cw = (p.Cw ?? 0) * 1e18;
    if (!(Cw > 0)) return null;
    return Math.sqrt(Math.sqrt(p.Iy * 1e12 * Cw) / ((p.Sx ?? computeSx(p)) * 1e9)); // F.4.11
  }
  const aw = hw * tw / (bf * tf);
  return bf / Math.sqrt(12 * (ho / d + aw * hw * hw / (6 * ho * d))); // F.4.10
}

/** Strong-axis flexure of I-sections (F.2–F.5) and channels (F.2–F.4). */
function strongAxisFlexure(p: SteelDesignParams, shape: 'I' | 'U', steps: string[]): FlexureCore {
  const { Fy, E } = p;
  const channel = shape === 'U';
  const d = p.h * 1000, bf = p.b * 1000, tf = p.tf * 1000, tw = p.tw * 1000;
  const hw = webClearHeightMm(p);
  const ho = d - tf;
  const Sx = (p.Sx ?? computeSx(p)) * 1e9;
  const Zx = (p.Zx ?? computeZx(p)) * 1e9;
  const Fr = p.builtUp ? FR_WELDED : FR_ROLLED;
  const FL = Fy - Fr; // min(Fyf − Fr, Fyw) with Fyw = Fyf (homogeneous)
  const sqEF = Math.sqrt(E / Fy);
  const kc = kcOf(hw, tw);

  // F.2.1: Mp = Fy Zx ≤ 1,5 My, My = Fy Sx.
  const MpUncapped = Fy * Zx / 1e6;
  const My = Fy * Sx / 1e6;
  const Mp = Math.min(MpUncapped, 1.5 * My);
  steps.push(`  Zx = ${fmt(Zx, 0)} mm³, Sx = ${fmt(Sx, 0)} mm³`);
  steps.push(1.5 * My < MpUncapped
    ? `  Mp = 1,5·My = ${fmt(Mp)} kN·m — el tope de F.2.1 gobierna (Zx/Sx = ${fmt(Zx / Sx, 3)} > 1,5)`
    : `  Mp = Fy·Zx = ${fmt(Mp)} kN·m — el tope de F.2.1 no gobierna (Zx/Sx = ${fmt(Zx / Sx, 3)} ≤ 1,5)`);

  // Classification, Tabla B.4.1b.
  const lamF = channel ? bf / tf : bf / (2 * tf);
  const lamPf = 0.38 * sqEF;
  const lamRf = p.builtUp ? 0.95 * Math.sqrt(kc * E / FL) : 0.83 * Math.sqrt(E / (0.7 * Fy));
  const lamW = hw / tw;
  const lamPw = 3.76 * sqEF;
  const lamRw = 5.70 * sqEF;
  const flangeClass = lamF <= lamPf ? 'compacta' : lamF <= lamRf ? 'no compacta' : 'esbelta';
  const webClass = lamW <= lamPw ? 'compacta' : lamW <= lamRw ? 'no compacta' : 'esbelta';
  steps.push(`  Ala: λf = ${fmt(lamF, 2)}, λpf = ${fmt(lamPf, 2)}, λrf = ${fmt(lamRf, 2)} → ${flangeClass} (Tabla B.4.1b caso ${p.builtUp ? 12 : 11})`);
  steps.push(`  Alma: h/tw = ${fmt(lamW, 1)}, λpw = ${fmt(lamPw, 1)}, λrw = ${fmt(lamRw, 1)} → ${webClass} (caso 16)`);

  const flb = (Mmax: number): LimitState | null => {
    // F.3.2 / F.4.3 with Mmax = Mp (F.3.1) or Rpc·Myc (F.4.12)
    if (lamF <= lamPf) return null;
    if (lamF <= lamRf) {
      return { name: 'pandeo local del ala (no compacta)',
        Mn: Mmax - (Mmax - FL * Sx / 1e6) * (lamF - lamPf) / (lamRf - lamPf) };
    }
    const k = p.builtUp || webClass !== 'compacta' ? 0.9 * kc : 0.69; // F.3.2b / F.4.13 vs F.3.2a
    return { name: 'pandeo local del ala (esbelta)', Mn: k * E * Sx / (lamF * lamF) / 1e6 };
  };

  if (webClass === 'compacta') {
    // §F.2 (compact flange) or §F.3 (noncompact / slender flange): LTB of F.2.2 and FLB of F.3.2.
    const clause = flangeClass === 'compacta' ? 'F.2' : 'F.3';
    const ltb = ltbF22(p, Mp, FL, steps);
    if (ltb.refused) return { Mp, Mn: 0, Lp: ltb.Lp, Lr: ltb.Lr, clause, refused: ltb.refused };
    const states: LimitState[] = [{ name: flangeClass === 'compacta' ? 'plastificacion / pandeo lateral-torsional' : 'pandeo lateral-torsional', Mn: ltb.Mn }];
    const f = flb(Mp);
    if (f) states.push(f);
    for (const s of states) steps.push(`  ${s.name}: Mn = ${fmt(s.Mn)} kN·m`);
    const gov = states.reduce((a, b) => (b.Mn < a.Mn ? b : a));
    steps.push(`  §${clause}: gobierna ${gov.name}, Mn = ${fmt(gov.Mn)} kN·m`);
    return { Mp, Mn: gov.Mn, Lp: ltb.Lp, Lr: ltb.Lr, clause };
  }

  const Lb = p.Lb * 1000;
  const Cb = p.Cb ?? 1.0;

  if (webClass === 'no compacta') {
    /*
     * §F.4 — noncompact web (doubly symmetric: Sxc = Sxt = Sx, hc = h, Iyc/Iy = 0,5 > 0,23).
     * Before: only §F.2 existed, so INTI's Ejemplo 14 girder V2 (h/tw = 138, λf = 12,6) kept
     * φMp = 326,0 kNm against the printed 286,1 kNm — 14 % unsafe.
     */
    const Myc = Fy * Sx / 1e6;
    const MpMyc = Mp / Myc;
    const Rpc = Math.min(MpMyc - (MpMyc - 1) * (lamW - lamPw) / (lamRw - lamPw), MpMyc); // F.4.9b
    const RM = Rpc * Myc;
    steps.push(`  §F.4: Myc = Fy·Sxc = ${fmt(Myc)} kN·m; Rpc = ${fmt(Rpc, 3)} (F.4.9b); Rpc·Myc = ${fmt(RM)} kN·m  (F.4.1)`);
    const states: LimitState[] = [{ name: 'fluencia del ala comprimida', Mn: RM }];

    // F.4.2 LTB
    const rt = rtOf(p, channel);
    if (rt == null) {
      return { Mp, Mn: 0, Lp: NaN, Lr: NaN, clause: 'F.4', refused: 'Cw no disponible: rt de la canal (F.4.11) no se puede evaluar' };
    }
    const J = (p.J ?? 0) * 1e12; // J = 0 lowers Lr and Fcr: the conservative side of F.4.5/F.4.8
    const c = channel ? (p.c ?? (ho / 2) * Math.sqrt(p.Iy * 1e12 / ((p.Cw ?? 0) * 1e18))) : 1;
    const jt = c * J / (Sx * ho);
    const Lp = 1.10 * rt * sqEF; // F.4.7
    const Lr = 1.95 * rt * (E / FL) * Math.sqrt(jt + Math.sqrt(jt * jt + 6.76 * (FL / E) ** 2)); // F.4.8
    steps.push(`  rt = ${fmt(rt, 1)} mm (F.4.${channel ? 11 : 10}); Lp = ${fmt(Lp, 0)} mm (F.4.7); Lr = ${fmt(Lr, 0)} mm (F.4.8); Lb = ${fmt(Lb, 0)} mm`);
    if (Lb > Lp) {
      let Mltb: number;
      if (Lb <= Lr) {
        Mltb = Math.min(Cb * (RM - (RM - FL * Sx / 1e6) * (Lb - Lp) / (Lr - Lp)), RM); // F.4.2
      } else {
        const lr2 = (Lb / rt) ** 2;
        const Fcr = (Cb * Math.PI * Math.PI * E / lr2) * Math.sqrt(1 + 0.078 * jt * lr2); // F.4.5
        Mltb = Math.min(Fcr * Sx / 1e6, RM); // F.4.3
      }
      states.push({ name: 'pandeo lateral-torsional', Mn: Mltb });
    }
    const f = flb(RM);
    if (f) states.push(f);
    for (const s of states) steps.push(`  ${s.name}: Mn = ${fmt(s.Mn)} kN·m`);
    const gov = states.reduce((a, b) => (b.Mn < a.Mn ? b : a));
    steps.push(`  §F.4: gobierna ${gov.name}, Mn = ${fmt(gov.Mn)} kN·m  (F.4.4: Sxt = Sxc, fluencia del ala traccionada no critica)`);
    return { Mp, Mn: gov.Mn, Lp: Lp / 1000, Lr: Lr / 1000, clause: 'F.4' };
  }

  // §F.5 — slender web.
  if (channel) {
    return { Mp, Mn: 0, Lp: NaN, Lr: NaN, clause: 'F.5', refused: 'canal con alma esbelta: §F.5 cubre solo secciones doble Te' };
  }
  const aw = hw * tw / (bf * tf);
  if (aw > 10) {
    return { Mp, Mn: 0, Lp: NaN, Lr: NaN, clause: 'F.5', refused: `aw = ${fmt(aw, 2)} > 10: fuera del alcance de F.5.6` };
  }
  const rt = rtOf(p, false)!;
  const Lp = 1.10 * rt * sqEF; // F.5.5a
  const Lr = Math.PI * rt * Math.sqrt(E / (Fy - Fr)); // F.5.5b
  let FcrLtb = Fy;
  if (Lb > Lr) {
    // F.5.4 as printed: the constant 1 970 000 MPa is π²·E for the code's E (ES_MPA).
    FcrLtb = Math.min(1970000 * Cb / (Lb / rt) ** 2, Fy);
  } else if (Lb > Lp) {
    // F.5.3, as printed: Fyf − (Fyf − Fr)·(Lb − Lp)/(Lr − Lp)
    FcrLtb = Math.min(Cb * (Fy - (Fy - Fr) * (Lb - Lp) / (Lr - Lp)), Fy);
  }
  // F.5.8 / F.5.9 (Tabla B.4.1b caso 12; 180 000 = 0,9·E for E = 200 000 MPa)
  const lamRf12 = 0.95 * Math.sqrt(kc * E / FL);
  let FcrFlb = Fy;
  if (lamF > lamRf12) FcrFlb = Math.min(0.9 * E * kc / (lamF * lamF), Fy);
  else if (lamF > lamPf) FcrFlb = Fy - (Fy - FL) * (lamF - lamPf) / (lamRf12 - lamPf);
  const Fcrf = Math.min(FcrLtb, FcrFlb);
  const Rpg = Math.min(1, 1 - aw / (1200 + 300 * aw) * (lamW - 5.70 * Math.sqrt(E / Fcrf))); // F.5.6
  const states: LimitState[] = [
    { name: 'fluencia del ala comprimida', Mn: Rpg * Fy * Sx / 1e6 },
    { name: 'pandeo lateral-torsional', Mn: Rpg * FcrLtb * Sx / 1e6 },
    { name: 'pandeo local del ala', Mn: Rpg * FcrFlb * Sx / 1e6 },
  ];
  steps.push(`  §F.5: aw = ${fmt(aw, 3)}; rt = ${fmt(rt, 1)} mm; Lp = ${fmt(Lp, 0)} mm (F.5.5a); Lr = ${fmt(Lr, 0)} mm (F.5.5b); Lb = ${fmt(Lb, 0)} mm`);
  steps.push(`  Fcr (LTB) = ${fmt(FcrLtb, 1)} MPa; Fcrf (FLB) = ${fmt(FcrFlb, 1)} MPa; Rpg = ${fmt(Rpg, 3)} (F.5.6); Re = 1 (homogenea)`);
  for (const s of states) steps.push(`  ${s.name}: Mn = ${fmt(s.Mn)} kN·m`);
  const gov = states.reduce((a, b) => (b.Mn < a.Mn ? b : a));
  steps.push(`  §F.5: gobierna ${gov.name}, Mn = ${fmt(gov.Mn)} kN·m`);
  return { Mp, Mn: gov.Mn, Lp: Lp / 1000, Lr: Lr / 1000, clause: 'F.5' };
}

/** §F.6 — minor-axis bending of I-sections and channels: plastification and flange local buckling. */
function weakAxisFlexure(p: SteelDesignParams, shape: 'I' | 'U', steps: string[]): FlexureCore {
  const { Fy, E } = p;
  const Zy = (p.Zy ?? computeZy(p)) * 1e9;
  const Sy = computeSy(p) * 1e9;
  const Mp = Math.min(Fy * Zy, 1.5 * Fy * Sy) / 1e6; // F.6.1
  steps.push(`  Zy = ${fmt(Zy, 0)} mm³, Sy = ${fmt(Sy, 0)} mm³`);
  steps.push(`  Mp = Fy·Zy ≤ 1,5·Fy·Sy = ${fmt(Mp)} kN·m  (F.6.1)`);
  steps.push(`  Eje debil: no hay pandeo lateral-torsional (F.6)`);
  // F.6.2, Tabla B.4.1b caso 14: λ = b/t, b = bf/2 (doble Te) or bf (canal)
  const lam = shape === 'U' ? p.b / p.tf : p.b / (2 * p.tf);
  const lamP = 0.38 * Math.sqrt(E / Fy);
  const lamR = 1.00 * Math.sqrt(E / Fy);
  let Mn = Mp;
  if (lam > lamR) {
    const Fcr = 0.69 * E / (lam * lam); // F.6.3: 138 000/(bf/tf)² for E = 200 000 MPa
    Mn = Fcr * Sy / 1e6;
    steps.push(`  λf = ${fmt(lam, 2)} > λrf = ${fmt(lamR, 2)} (caso 14): ala esbelta, Fcr = ${fmt(Fcr, 1)} MPa, Mn = Fcr·Sy = ${fmt(Mn)} kN·m  (F.6.2(c))`);
  } else if (lam > lamP) {
    Mn = Mp - (Mp - 0.7 * Fy * Sy / 1e6) * (lam - lamP) / (lamR - lamP);
    steps.push(`  λf = ${fmt(lam, 2)} entre λpf = ${fmt(lamP, 2)} y λrf = ${fmt(lamR, 2)} (caso 14): Mn = ${fmt(Mn)} kN·m  (F.6.2)`);
  } else {
    steps.push(`  λf = ${fmt(lam, 2)} ≤ λpf = ${fmt(lamP, 2)} (caso 14): ala compacta, F.6.2 no aplica`);
  }
  return { Mp, Mn, Lp: 0, Lr: 0, clause: 'F.6' };
}

export function checkSteelFlexure(
  params: SteelDesignParams,
  Mu: number,
  axis: 'strong' | 'weak',
): SteelFlexureResult {
  const steps: string[] = [];
  const phi = 0.90;

  const axisLabel = axis === 'strong' ? 'fuerte (z)' : 'debil (y)';
  steps.push(`§F — Flexion, eje ${axisLabel}:`);

  const shape = steelShapeOf(params.shape);
  let core: FlexureCore;
  if (shape === 'I' || shape === 'U') {
    core = axis === 'strong' ? strongAxisFlexure(params, shape, steps) : weakAxisFlexure(params, shape, steps);
  } else {
    // F.7 (boxes), F.8 (circular tubes), F.9 (tees), F.11 (solid bars) are not implemented, and
    // F.2 applied to them is not their clause: refuse rather than return a number.
    core = { Mp: NaN, Mn: 0, Lp: 0, Lr: 0, clause: 'F',
      refused: `forma «${params.shape}»: §F.7–F.11 no implementados (solo doble Te y canales, §F.2–F.6)` };
  }

  const absMu = Math.abs(Mu);
  if (core.refused) {
    steps.push(`  NO EVALUADO — ${core.refused}`);
    const ratio = absMu > 0 ? Infinity : 0;
    return {
      Mu: absMu, Mp: core.Mp, Mn: 0, phiMn: 0, Lp: core.Lp, Lr: core.Lr, clause: core.clause,
      ratio, status: absMu > 0 ? 'fail' : 'ok', steps, notEvaluated: core.refused,
    };
  }

  const Mn = core.Mn;
  const phiMn = phi * Mn;
  steps.push(`  φMn = ${fmt(phi)}·${fmt(Mn)} = ${fmt(phiMn)} kN·m`);

  const ratio = phiMn > 0 ? absMu / phiMn : (absMu > 0 ? Infinity : 0);

  steps.push(`  Mu = ${fmt(absMu)} kN·m`);
  steps.push(`  Ratio = ${fmt(ratio, 3)}`);

  return {
    Mu: absMu,
    Mp: core.Mp,
    Mn,
    phiMn,
    Lp: core.Lp,
    Lr: core.Lr,
    clause: core.clause,
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

  // Area del alma Aw = d·tw (G.2.2), con «d = altura total del perfil» en secciones laminadas
  // y «d = altura del alma» en secciones armadas. Antes siempre la altura total, que en una
  // viga armada sobrestima Aw en 2·tf/hw (2,4 % en la V2 del Ejemplo 14 de INTI).
  const d_mm = h * 1000;
  const tw_mm = tw * 1000;
  const tf_mm = tf * 1000;

  // Altura del alma
  const hw_mm = d_mm - 2 * tf_mm;
  const Aw_mm2 = (params.builtUp ? hw_mm : d_mm) * tw_mm;

  steps.push(`§G — Corte:`);
  steps.push(`  d = ${fmt(d_mm, 1)} mm, tw = ${fmt(tw_mm, 1)} mm`);
  steps.push(`  Aw = d·tw = ${fmt(Aw_mm2, 0)} mm²`);
  steps.push(`  h/tw (alma) = ${fmt(hw_mm / tw_mm, 1)}`);

  /*
   * Coeficiente Cv — CIRSOC 301-2018 §G.2.1(a), almas sin rigidizar (kv = 5):
   *
   *     h/tw ≤ 1,10 √(kv E/Fyw)                   Cv = 1,0                       (G.2.3)
   *     1,10 √(kv E/Fyw) < h/tw ≤ 1,37 √(kv E/Fyw)  Cv = 1,10 √(kv E/Fyw)/(h/tw)  (G.2.4)
   *     h/tw > 1,37 √(kv E/Fyw)                   Cv = 1,51 E kv/((h/tw)² Fyw)    (G.2.5)
   *
   * Antes: el limite 2,24 √(E/Fy) y kv = 5,34 de AISC 360-10, y sin la rama elastica G.2.5,
   * de modo que un alma esbelta conservaba la expresion inelastica. En la viga armada V2 del
   * Ejemplo 14 de INTI (h/tw = 138) daba Cv = 0,536 contra 0,336: φVn un 60 % del lado inseguro.
   */
  const htw = hw_mm / tw_mm;
  const kv = 5;
  const lim = Math.sqrt(kv * E / Fy);
  let Cv: number;

  if (htw <= 1.10 * lim) {
    Cv = 1.0;
    steps.push(`  h/tw = ${fmt(htw, 1)} ≤ 1,10·√(kv·E/Fy) = ${fmt(1.10 * lim, 1)} → Cv = 1,0  (G.2.3)`);
  } else if (htw <= 1.37 * lim) {
    Cv = (1.10 * lim) / htw;
    steps.push(`  Cv = 1,10·√(kv·E/Fy)/(h/tw) = ${fmt(Cv, 3)}  (G.2.4)`);
  } else {
    Cv = (1.51 * E * kv) / (htw * htw * Fy);
    steps.push(`  Alma esbelta: Cv = 1,51·E·kv/((h/tw)²·Fy) = ${fmt(Cv, 3)}  (G.2.5)`);
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

  let axialRefused: string | undefined;
  if (Pu >= 0) {
    // Compresion
    const comp = checkSteelCompression(params, Pu);
    phiPn = comp.phiPn;
    axialRefused = comp.notEvaluated;
    steps.push(`  Capacidad axial (compresion): φPn = ${fmt(phiPn)} kN`);
  } else {
    // Traccion
    const tens = checkSteelTension(params, Pu);
    phiPn = tens.phiPn;
    axialRefused = tens.notEvaluated;
    steps.push(`  Capacidad axial (traccion): φPn = ${fmt(phiPn)} kN`);
  }

  // Capacidades a flexion
  const flexZ = checkSteelFlexure(params, Mux, 'strong');
  const flexY = checkSteelFlexure(params, Muy, 'weak');
  const phiMnx = flexZ.phiMn;
  const phiMny = flexY.phiMn;

  /*
   * A capacity that was refused is 0 here, and the terms below skip a zero capacity — which
   * would turn «not evaluated» into a passing interaction. Refuse the interaction instead
   * whenever a refused capacity carries a demand.
   */
  const refused = (absPu > 0 ? axialRefused : undefined)
    ?? (Math.abs(Mux) > 0 ? flexZ.notEvaluated : undefined)
    ?? (Math.abs(Muy) > 0 ? flexY.notEvaluated : undefined);
  if (refused) {
    steps.push(`§H1-1 — Interaccion: NO EVALUADO — ${refused}`);
    return {
      equation: absPu / Math.max(phiPn, 1e-300) >= 0.2 ? 'H1-1a' : 'H1-1b',
      value: Infinity, ratio: Infinity, status: 'fail', steps, notEvaluated: refused,
    };
  }

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
    const notEvaluated = (check.result as { notEvaluated?: string }).notEvaluated;
    if (notEvaluated && ratio > 0) {
      diags.push({
        severity: 'error',
        code: `VERIF_STEEL_NOT_EVALUATED_${check.name}`,
        message: `Steel ${check.name.toLowerCase().replace('_', ' ')} check not evaluated: ${notEvaluated}`,
        elementIds: [elementId],
        source: 'verification',
        details: { ratio },
      });
    } else if (status === 'fail') {
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
