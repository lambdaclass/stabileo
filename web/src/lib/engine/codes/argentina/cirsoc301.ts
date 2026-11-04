/**
 * Verificacion de elementos de acero segun CIRSOC 301-2018 — the app's boundary to the engine.
 *
 * Every number here comes from the engine (`engine/src/postprocess/cirsoc301_check.rs`, reached
 * through `cirsoc301-kernel.ts`): tension D.2 with Ae = An·U, compression E.3/E.4/E.7, single and
 * double angles E.5/E.6, flexure F.2–F.6 with load height and Cb, shear G.2/G.4, interaction H.1.
 * This module holds no clause. It maps `SteelDesignParams` to the engine's input, and the engine's
 * result back to the shapes the app reads, rendering the calculation's messages as Spanish `steps`
 * (the UI localises the `messages` themselves).
 *
 * The TypeScript statement of the clauses this file used to hold lives on as the oracle of the
 * differential test (`__tests__/differential/cirsoc301-oracle.ts`).
 *
 * No engine, no verdict: when the kernel is not registered every check FAILS with
 * «el motor de cálculo no está cargado», and `engine.available` is false.
 *
 * What the app adds around the engine, none of it a second statement of a clause the engine has:
 *   · per-axis buckling lengths (`Lx`, `Ly`), sent as K·Lx/L and K·Ly/L since the engine buckles
 *     K·L about each axis;
 *   · a Lb per flange (`LbNeg`): the member is checked once per moment sign with the flange that
 *     sign compresses, and the worse reading is the member's;
 *   · §G.6, shear along the weak axis on the flanges of an I or a channel
 *     (`cirsoc301-weak-shear.ts`), which the engine does not have;
 *   · the near-limit band of every design surface (`utilizationStatus`): a pass above 0,95 reads
 *     `warn`, still a pass; a failure is the engine's;
 *   · the verdict (`cirsoc301-verdict.ts`): a check the engine refuses under load is `held`, never
 *     `ok` and never a failure with an infinite ratio; and the readings over a datum the member does
 *     not state (rolled or welded, `builtUp`; the load height, `loadPosition`), each justified there.
 *     A shape the section does not state is not taken as an I: the engine refuses it by name.
 *
 * Unidades: kN, m, MPa (N/mm²).
 */

import type { SolverDiagnostic } from '../../types';
import type { VerifStatus } from './cirsoc201';
import type { EngineMessage } from '../../../codes/message';
import steelEs from '../../../i18n/locales/steel/es';
import { engineCheckMembers, type EngineCheck, type EngineMemberResult } from './cirsoc301-kernel';
import { weakAxisShear } from './cirsoc301-weak-shear';
import { utilizationStatus } from '../../design/outcome';
import {
  combineFabrication, combineLoadHeight, fabricationMatters, loadHeightMatters, steelNotEvaluated, steelResultLine, steelVerdict,
  worseSteel,
} from './cirsoc301-verdict';

/**
 * A member check's verdict: the three words of a ratio, or `held` when a limit state it needs was
 * not evaluated, or its verdict depends on a datum the member does not state
 * (`cirsoc301-verdict.ts`). `held` is never a pass and never a failure.
 */
export type SteelStatus = VerifStatus | 'held';

/** A limit state a check did not evaluate under load: the engine's refusal, with its clause. */
export interface SteelNotEvaluated {
  /** The clause of the check refused (the engine's: 'E.4', 'F', 'D.2(b)', …). */
  clause: string;
  /** The engine's refusal message key (`c301.refuse.*`) and its parameters. */
  key: string;
  params?: EngineMessage['params'];
  /**
   * Whether the capacity reported is still an upper bound of the true one. The engine refuses a
   * check whole, reporting no capacity, so this is false: a refused check never proves a failure.
   */
  upperBound: boolean;
}

/** A limit state left out, with the check it belongs to. */
export interface SteelCheckNotEvaluated extends SteelNotEvaluated {
  check: 'tension' | 'compression' | 'flexureZ' | 'flexureY' | 'shear' | 'shearWeak' | 'interaction';
}

/**
 * Whether the section is rolled or welded, and where that came from. `declared`: the section says
 * so. `undeclared`: it does not, and the member was read as both (`combineFabrication`).
 */
export type SteelFabrication =
  | { basis: 'declared'; welded: boolean }
  | {
      basis: 'undeclared';
      rolled: { status: SteelStatus; ratio: number };
      welded: { status: SteelStatus; ratio: number };
      /** Which reading the reported checks are. */
      governs: 'rolled' | 'welded';
      /** True when the two verdicts differ: the member is held until the section declares it. */
      dependsOnIt: boolean;
    };

/**
 * Where the transverse load acts for F.2.2, and where that came from. `undeclared`: read on the top
 * flange, and on the web only where the top-flange reading fails (`combineLoadHeight`).
 */
export type SteelLoadHeight =
  | { basis: 'declared'; position: 'web' | 'topFlange' }
  | {
      basis: 'undeclared';
      top: { status: SteelStatus; ratio: number };
      web?: { status: SteelStatus; ratio: number };
      /** True when the verdict depends on it: held until the member declares where the load acts. */
      dependsOnIt: boolean;
    };

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
  /**
   * Longitudes de pandeo flexional por eje (m), cuando la barra las declara (arriostramiento por
   * eje). Ausentes => L. El motor pandea K·L: se le envia K·Lx/L y K·Ly/L.
   */
  Lx?: number;
  Ly?: number;
  /**
   * Lb del ala que comprimen los momentos negativos (la inferior), m. Ausente => `Lb` para los dos
   * signos. Con ella y el momento por signo (`MuzPos`, `MuzNeg`), cada signo con su ala.
   */
  LbNeg?: number;
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
  /**
   * Single angle (`shape: 'L'`) or double angle (`shape: '2L'`): legs, thickness and how it is
   * loaded and connected (§E.5, §E.6). See `AngleParams`.
   */
  angle?: AngleParams;
}

/**
 * Angle data, m. One thickness. A double angle is two equal angles back to back with `gap`
 * between the backs (0 = continuous contact) and intermediate connectors every `connectorSpacing`.
 */
export interface AngleParams {
  legLong: number;
  legShort: number;
  t: number;
  /** Catalogue properties of ONE angle (m², m⁴), when known: the check scales its own down to them. */
  area?: number;
  iParLong?: number;
  iParShort?: number;
  /** E.5: 'concentric' | 'e5aLong' | 'e5aShort' | 'e5bLong' | 'e5bShort'. Absent: compression refused. */
  endCondition?: string;
  backToBack?: 'long' | 'short';
  gap?: number;
  connectorSpacing?: number;
  connector?: 'snugBolts' | 'welded';
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
  /**
   * Ae already resolved from the model's end connections (`engine/steel/tension-connection.ts`),
   * m², with the steps that produced it — printed verbatim. Takes precedence over every field below.
   */
  resolved?: { Ae: number; steps: string[]; messages?: EngineMessage[] };
  /** The model's end connections could not give Ae: the reason, printed and returned as NOT EVALUATED. */
  refused?: string;
  /** The same refusal as a localisable message (`c301.refuse.*`); the engine reports it as is. */
  refusedMessage?: EngineMessage;
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
  status: SteelStatus;
  steps: string[];
  /** Why the check could not be evaluated (no connection for D.2(b)). */
  notEvaluated?: string;
  /** The calculation as the engine reports it, one localisable message per line (`c301.*`). */
  messages: EngineMessage[];
  /** The governing clause (e.g. 'F.2', 'E.4', 'D.2(b)'). */
  clauseRef?: string;
  /** Why it was not evaluated, as a message (the same reason as `notEvaluated`). */
  notEvaluatedMessage?: EngineMessage;
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
  status: SteelStatus;
  steps: string[];
  /** Presente cuando la resistencia no se pudo evaluar: el motivo. Nunca es un «verifica». */
  notEvaluated?: string;
  /** The calculation as the engine reports it, one localisable message per line (`c301.*`). */
  messages: EngineMessage[];
  /** The governing clause (e.g. 'F.2', 'E.4', 'D.2(b)'). */
  clauseRef?: string;
  /** Why it was not evaluated, as a message (the same reason as `notEvaluated`). */
  notEvaluatedMessage?: EngineMessage;
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
  status: SteelStatus;
  steps: string[];
  /** Presente cuando la resistencia no se pudo evaluar: el motivo. Nunca es un «verifica». */
  notEvaluated?: string;
  /** The calculation as the engine reports it, one localisable message per line (`c301.*`). */
  messages: EngineMessage[];
  /** The governing clause (e.g. 'F.2', 'E.4', 'D.2(b)'). */
  clauseRef?: string;
  /** Why it was not evaluated, as a message (the same reason as `notEvaluated`). */
  notEvaluatedMessage?: EngineMessage;
}

export interface SteelShearResult {
  /** The axis the shear acts along: 'strong' on the web (G.2), 'weak' on the flanges (G.6). */
  axis?: 'strong' | 'weak';
  Vu: number;
  phiVn: number;
  Cv: number;
  ratio: number;
  status: SteelStatus;
  steps: string[];
  /** The calculation as the engine reports it, one localisable message per line (`c301.*`). */
  messages: EngineMessage[];
  /** The governing clause (e.g. 'F.2', 'E.4', 'D.2(b)'). */
  clauseRef?: string;
  /** Why it was not evaluated, as a message (the same reason as `notEvaluated`). */
  notEvaluatedMessage?: EngineMessage;
}

export interface SteelInteractionResult {
  equation: 'H1-1a' | 'H1-1b';
  value: number;   // <= 1.0 verifica
  ratio: number;
  status: SteelStatus;
  steps: string[];
  /** Presente cuando una capacidad que la interaccion usa no se pudo evaluar. */
  notEvaluated?: string;
  /** The calculation as the engine reports it, one localisable message per line (`c301.*`). */
  messages: EngineMessage[];
  /** The governing clause (e.g. 'F.2', 'E.4', 'D.2(b)'). */
  clauseRef?: string;
  /** Why it was not evaluated, as a message (the same reason as `notEvaluated`). */
  notEvaluatedMessage?: EngineMessage;
}

export interface SteelVerificationInput {
  elementId: number;
  Nu: number;    // kN (+ = compresion)
  Muy: number;   // kN·m (momento eje debil)
  Muz: number;   // kN·m (momento eje fuerte)
  Vu: number;    // kN
  /** Shear along the weak axis, on the flanges of an I or a channel (G.6), kN. Absent: none. */
  VuWeak?: number;
  /** Strong-axis moment by sign, kN·m, when each flange has its own unbraced length (`LbNeg`). */
  MuzPos?: number;
  MuzNeg?: number;
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
  /** §G.6 on the flanges (I, channel), when the member carries weak-axis shear. */
  shearWeak?: SteelShearResult;
  interaction?: SteelInteractionResult;
  overallStatus: SteelStatus;
  /** The limit states the checks left out under load, each with its check (`steelNotEvaluated`). */
  notEvaluated?: SteelCheckNotEvaluated[];
  /** Rolled or welded: declared, or read both ways (`combineFabrication`). Absent where it does not matter. */
  fabrication?: SteelFabrication;
  /** The load height of F.2.2: declared, or read as `combineLoadHeight` says. Absent where it does not matter. */
  loadHeight?: SteelLoadHeight;
  /**
   * The exact engine inputs the verdict rests on, one per reading of an undeclared datum (the
   * per-flange Lb aside, which the caller pairs with each demand's sign). The engine gate certifies
   * a pass on every one of them (`cirsoc301-engine-gate.ts`).
   */
  inputs?: SteelDesignParams[];
  diagnostics?: SolverDiagnostic[];
  steps: string[];
  /** Governing combination per force component (from combo-driven verification). */
  /**
   * The engine's own verdict on this exact input. `available: false` — the engine was not loaded,
   * and every check is a failure, never the absence of one.
   */
  engine: { available: boolean; pass: boolean; unityRatio: number; governingCheck: string; unevaluated: string[] };
  governingCombos?: {
    flexure?: { comboId: number; comboName: string };
    shear?: { comboId: number; comboName: string };
    axial?: { comboId: number; comboName: string };
    /** The combination and station whose forces, acting together, govern H.1. */
    interaction?: { comboId: number; comboName: string; t: number };
  };
}


/** A compression element for Q (§E.7). `b`, `t` in m. Kinds as Tabla B.4.1a, see the engine. */
export interface CompressionElement {
  kind: 'unstiffenedRolled' | 'unstiffenedWelded' | 'angle' | 'teeStem' | 'stiffened' | 'tubeWall';
  b: number;
  t: number;
  /** How many such elements the section has. */
  count: number;
}

// ---------------------------------------------------------------------------
// Messages → Spanish steps
// ---------------------------------------------------------------------------

/** Engine params that name a word the locales translate (`c301.word.*`). */
const WORD_PARAMS = new Set(['cls', 'name', 'which', 'cw']);

/** Turn the engine's word params into nested messages, so every surface can translate them. */
function localisable(m: EngineMessage): EngineMessage {
  if (!m.params) return m;
  const params: Record<string, EngineMessage['params'] extends Readonly<Record<string, infer V>> | undefined ? V : never> = {};
  for (const [k, v] of Object.entries(m.params)) {
    if (WORD_PARAMS.has(k) && typeof v === 'string') params[k] = { key: `c301.word.${v}` };
    else if (k === 'reason' && v && typeof v === 'object') params[k] = localisable(v as EngineMessage);
    else params[k] = v as never;
  }
  return { key: m.key, params };
}

function fmtNum(v: number): string {
  if (!Number.isFinite(v)) return String(v);
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000);
}

/** A message in Spanish, from the steel dictionary (no i18n store: this module stays pure). */
export function renderEs(m: EngineMessage): string {
  const raw = steelEs[m.key] ?? m.key;
  if (!m.params) return raw;
  return raw.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const v = m.params![name];
    if (v === undefined || v === null) return whole;
    if (typeof v === 'object') return renderEs(v as EngineMessage);
    return typeof v === 'number' ? fmtNum(v) : String(v);
  });
}

// ---------------------------------------------------------------------------
// Engine call
// ---------------------------------------------------------------------------

/** A ratio above 1,0 fails: CIRSOC 301 grants no overstress band. A warning is never a failure. */
export function statusFromRatio(ratio: number): VerifStatus {
  return ratio <= 1.0 ? 'ok' : 'fail';
}

/** Section family the engine classifies. Absent => 'I'. */
export type SteelShape = 'I' | 'U' | 'T' | 'box' | 'RHS' | 'CHS' | 'solid' | 'L' | '2L';

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
    case 'L': return 'L';
    case '2L': return '2L';
    default: return null; // 'C' (cold-formed, CIRSOC 303) and anything else
  }
}

/**
 * The input the engine reads: the params themselves, with the resolved Ae's messages as steps, and
 * the per-axis lengths as effective-length factors (the engine buckles K·L about each axis, so
 * K·Lx/L about the strong one is K·Lx exactly).
 */
export function engineMember(elementId: number, p: SteelDesignParams): object {
  const tc = p.tensionConnection;
  const tensionConnection = tc?.resolved
    ? { ...tc, resolved: { Ae: tc.resolved.Ae, steps: tc.resolved.steps, messages: tc.resolved.messages ?? [] } }
    : tc;
  const { Lx, Ly, LbNeg: _lbNeg, ...rest } = p;
  // A tee's web is d − tf tall, and that is the h of kc (Tabla B.4.1, E.7.1(b)); the engine's
  // default clear height, h − 2·tf, is a doubly flanged section's and would overstate kc.
  if (p.shape === 'T' && p.hw === undefined && p.h > 0 && p.tf > 0) (rest as SteelDesignParams).hw = p.h - p.tf;
  const axisK = p.L > 0 ? {
    ...(Lx !== undefined ? { Kx: (p.Kx ?? 1) * Lx / p.L } : {}),
    ...(Ly !== undefined ? { Ky: (p.Ky ?? 1) * Ly / p.L } : {}),
  } : {};
  return { ...rest, ...axisK, elementId, ...(tensionConnection ? { tensionConnection } : {}) };
}

/** The step that says how per-axis lengths reached the engine, when the member declares them. */
function lengthsStep(p: SteelDesignParams): EngineMessage[] {
  if (p.Lx === undefined && p.Ly === undefined) return [];
  const Lx = p.Lx ?? p.L, Ly = p.Ly ?? p.L;
  return [{ key: 'c301.lengthsPerAxis', params: {
    Lx: fmtNum(Lx), Ly: fmtNum(Ly), L: fmtNum(p.L),
    kx: fmtNum((p.Kx ?? 1) * Lx / p.L), ky: fmtNum((p.Ky ?? 1) * Ly / p.L),
  } }];
}

const UNAVAILABLE: EngineMessage = { key: 'c301.refuse.engineUnavailable' };

/** One engine run for one demand, or null when the engine is not available. */
function run(p: SteelDesignParams, f: { Nu: number; Muz: number; Muy: number; Vu: number }, elementId = 0, steps = true): EngineMemberResult | null {
  const out = engineCheckMembers([engineMember(elementId, p)], [{ elementId, ...f }], { steps });
  return out?.[0] ?? null;
}

interface Common {
  ratio: number; status: SteelStatus; steps: string[]; messages: EngineMessage[];
  clauseRef?: string; notEvaluated?: string; notEvaluatedMessage?: EngineMessage;
}

function common(c: EngineCheck): Common {
  const messages = c.steps.map(localisable);
  const ne = c.notEvaluated ? localisable(c.notEvaluated) : undefined;
  return {
    ratio: c.ratio,
    // The engine decides pass or fail; a pass near the limit reads `warn` as on every surface. A
    // check it refused under load is held: no capacity was computed, so nothing passes or fails.
    status: ne && c.demand > 0 ? 'held' : c.pass ? (utilizationStatus(c.ratio) === 'warn' ? 'warn' : 'ok') : 'fail',
    steps: messages.map(renderEs),
    messages,
    clauseRef: c.clause,
    ...(ne ? { notEvaluated: renderEs(ne), notEvaluatedMessage: ne } : {}),
  };
}

function unavailable(): Common {
  const m = { key: 'c301.notEvaluated', params: { reason: UNAVAILABLE } };
  return {
    ratio: Infinity, status: 'fail', steps: [renderEs(m)], messages: [m],
    notEvaluated: renderEs(UNAVAILABLE), notEvaluatedMessage: UNAVAILABLE,
  };
}

const v = (c: EngineCheck, k: string): number => {
  const x = c.values[k];
  return typeof x === 'number' ? x : NaN;
};

/** A check asked for with no demand: the engine is run at a unit demand and the ratio is zero. */
function unloaded<T extends Common>(r: T): T {
  if (r.notEvaluated && r.notEvaluatedMessage?.key === UNAVAILABLE.key) return r;
  const keep = r.messages.filter((m) => m.key !== 'c301.demand');
  return { ...r, ratio: 0, status: 'ok', messages: keep, steps: keep.map(renderEs) };
}

// ---------------------------------------------------------------------------
// §D, §E, §F, §G, §H — one limit state at a time
// ---------------------------------------------------------------------------

function tensionOf(c: EngineCheck, p?: SteelDesignParams): SteelTensionResult {
  const r: SteelTensionResult = { Pu: c.demand, phiPn: c.capacity, ...common(c) };
  // The model's end-connection refusal keeps its Spanish sentence in the log (the UI reads the message).
  const legacy = p?.tensionConnection?.refused;
  if (legacy && r.notEvaluatedMessage?.key.startsWith('c301.refuse.end')) {
    r.notEvaluated = legacy;
    r.steps = r.steps.map((x) => (x.includes(renderEs(r.notEvaluatedMessage!)) ? `  NO EVALUADO — ${legacy}` : x));
  }
  return r;
}

export function checkSteelTension(params: SteelDesignParams, Pu: number): SteelTensionResult {
  const zero = Math.abs(Pu) === 0;
  const r = run(params, { Nu: zero ? -1 : -Math.abs(Pu), Muz: 0, Muy: 0, Vu: 0 });
  if (!r?.tension) return { Pu: Math.abs(Pu), phiPn: 0, ...unavailable() };
  const t = tensionOf(r.tension, params);
  return zero ? { ...unloaded(t), Pu: 0, phiPn: t.notEvaluated ? v(r.tension, 'phiPnYield') || t.phiPn : t.phiPn } : t;
}

function compressionOf(c: EngineCheck): SteelCompressionResult {
  const refused = !!c.notEvaluated;
  return {
    Pu: c.demand, KLr: v(c, 'KLr'), Fe: v(c, 'Fe'), Fcr: refused ? NaN : v(c, 'Fcr'),
    phiPn: c.capacity, Q: refused ? NaN : v(c, 'Q'), ...common(c),
  };
}

export function checkSteelCompression(params: SteelDesignParams, Pu: number): SteelCompressionResult {
  const zero = Math.abs(Pu) === 0;
  const r = run(params, { Nu: zero ? 1 : Math.abs(Pu), Muz: 0, Muy: 0, Vu: 0 });
  if (!r?.compression) return { Pu: Math.abs(Pu), KLr: NaN, Fe: NaN, Fcr: NaN, phiPn: 0, Q: NaN, ...unavailable() };
  const c = compressionOf(r.compression);
  return zero ? { ...unloaded(c), Pu: 0 } : c;
}

function flexureOf(c: EngineCheck): SteelFlexureResult {
  return {
    Mu: c.demand, Mp: v(c, 'Mp'), Mn: c.notEvaluated ? 0 : v(c, 'Mn'), phiMn: c.capacity,
    Lp: v(c, 'Lp'), Lr: v(c, 'Lr'), clause: c.clause, ...common(c),
  };
}

export function checkSteelFlexure(params: SteelDesignParams, Mu: number, axis: 'strong' | 'weak'): SteelFlexureResult {
  const absMu = Math.abs(Mu);
  // The weak-axis check runs only above 1e-6 kN·m; below it, ask at a unit moment.
  const small = axis === 'weak' ? absMu <= 1e-6 : absMu === 0;
  const m = small ? 1 : absMu;
  const r = run(params, { Nu: 0, Muz: axis === 'strong' ? m : 0, Muy: axis === 'weak' ? m : 0, Vu: 0 });
  const c = r && (axis === 'strong' ? r.flexureStrong : r.flexureWeak);
  if (!c) return { Mu: absMu, Mp: NaN, Mn: 0, phiMn: 0, Lp: NaN, Lr: NaN, ...unavailable() };
  const f = flexureOf(c);
  if (!small) return f;
  const u = unloaded(f);
  return { ...u, Mu: absMu, ratio: f.phiMn > 0 ? absMu / f.phiMn : 0, status: 'ok' };
}

function shearOf(c: EngineCheck): SteelShearResult {
  return { Vu: c.demand, phiVn: c.capacity, Cv: v(c, 'Cv'), ...common(c) };
}

export function checkSteelShear(params: SteelDesignParams, Vu: number): SteelShearResult {
  const r = run(params, { Nu: 0, Muz: 0, Muy: 0, Vu: Math.abs(Vu) });
  if (!r) return { Vu: Math.abs(Vu), phiVn: 0, Cv: NaN, ...unavailable() };
  return shearOf(r.shear);
}

/** §G.6 on the flanges of an I or a channel, for the weak-axis shear the member carries. */
function weakShearOf(p: SteelDesignParams, VuWeak: number | undefined): SteelShearResult | undefined {
  const shape = steelShapeOf(p.shape);
  if (VuWeak === undefined || Math.abs(VuWeak) <= 1e-6 || (shape !== 'I' && shape !== 'U') || !(p.b > 0 && p.tf > 0)) return undefined;
  const w = weakAxisShear({ Fy: p.Fy, E: p.E, b: p.b, tf: p.tf, shape }, VuWeak);
  const status: VerifStatus = w.ratio <= 1 ? (utilizationStatus(w.ratio) === 'warn' ? 'warn' : 'ok') : 'fail';
  return { axis: 'weak', Vu: w.Vu, phiVn: w.phiVn, Cv: w.Cv, ratio: w.ratio, status, steps: w.messages.map(renderEs), messages: w.messages, clauseRef: 'G.6' };
}

function interactionOf(c: EngineCheck): SteelInteractionResult {
  const equation = c.clause === 'H.1.1a' ? 'H1-1a' : 'H1-1b';
  return { equation, value: c.ratio, ...common(c) };
}

/** H.1 for the given demand (Pu + compression). */
export function checkSteelInteraction(params: SteelDesignParams, Pu: number, Mux: number, Muy: number): SteelInteractionResult {
  // A Lb per flange: the sign of the strong-axis moment says which flange it compresses.
  const p = params.LbNeg !== undefined ? { ...params, Lb: Mux < 0 ? params.LbNeg : params.Lb, LbNeg: undefined } : params;
  const r = run(p, { Nu: Pu, Muz: Mux, Muy, Vu: 0 });
  if (!r) return { equation: 'H1-1b', value: Infinity, ...unavailable() };
  if (r.interaction) return interactionOf(r.interaction);
  // H.1 does not apply (one moment, no axial force): H.1.1b reduces to that flexure ratio.
  const f = r.flexureWeak && Math.abs(Muy) > 0 ? r.flexureWeak : r.flexureStrong;
  return { equation: 'H1-1b', value: f.ratio, ...common(f) };
}

/**
 * H.1 for many demands in one engine call and without the calculation: the ratio of each, as
 * `checkSteelInteraction` reads it (the flexure ratio where H.1 does not apply; Infinity for a
 * check the engine did not evaluate). Null when the engine is not available. For a search over
 * the combinations and stations of a member; the governing one is then read with its steps.
 */
export function interactionRatios(cases: ReadonlyArray<{ params: SteelDesignParams; Pu: number; Mux: number; Muy: number }>): number[] | null {
  if (cases.length === 0) return [];
  const members = cases.map((c, k) => {
    const p = c.params.LbNeg !== undefined ? { ...c.params, Lb: c.Mux < 0 ? c.params.LbNeg : c.params.Lb, LbNeg: undefined } : c.params;
    return engineMember(k + 1, p);
  });
  const out = engineCheckMembers(members, cases.map((c, k) => ({ elementId: k + 1, Nu: c.Pu, Muz: c.Mux, Muy: c.Muy, Vu: 0 })), { steps: false });
  if (!out) return null;
  const byId = new Map(out.map((r) => [r.elementId, r]));
  return cases.map((c, k) => {
    const r = byId.get(k + 1);
    if (!r) return Infinity;
    const x = r.interaction ?? (r.flexureWeak && Math.abs(c.Muy) > 0 ? r.flexureWeak : r.flexureStrong);
    return x.notEvaluated ? Infinity : x.ratio;
  });
}

// ---------------------------------------------------------------------------
// Verificacion completa de un elemento
// ---------------------------------------------------------------------------

/** The worse of two verifications of one member: by verdict (a failure, a hold, the passes), then by ratio. */
export const worseSteelVerification = (a: SteelVerification, b: SteelVerification): SteelVerification => worseSteel(a, b);

/**
 * The data the member does not state, settled: a shape not given is not taken as an I (the engine
 * refuses `'undeclared'` by name), and `builtUp` / `loadPosition` are read as `cirsoc301-verdict.ts`
 * says when absent. `each(params)` reads the member with every datum definite.
 */
export function withUndeclaredData(params: SteelDesignParams, each: (p: SteelDesignParams) => SteelVerification): SteelVerification {
  const p = params.shape === undefined ? { ...params, shape: 'undeclared' } : params;
  const byLoad = (q: SteelDesignParams): SteelVerification => {
    if (q.loadPosition !== undefined || !loadHeightMatters(q.shape)) {
      const v = each(q);
      return q.loadPosition !== undefined && loadHeightMatters(q.shape) ? { ...v, loadHeight: { basis: 'declared', position: q.loadPosition } } : v;
    }
    const top = each({ ...q, loadPosition: 'topFlange' });
    return combineLoadHeight(top, top.overallStatus === 'fail' ? each({ ...q, loadPosition: 'web' }) : undefined);
  };
  if (p.builtUp !== undefined || !fabricationMatters(p.shape)) {
    const v = byLoad(p);
    return p.builtUp !== undefined && fabricationMatters(p.shape) ? { ...v, fabrication: { basis: 'declared', welded: p.builtUp } } : v;
  }
  return combineFabrication(byLoad({ ...p, builtUp: false }), byLoad({ ...p, builtUp: true }));
}

/**
 * The whole member. `opts.trace: false` skips the calculation (no `steps`, no `messages`): for a
 * search that screens many candidates and reports only the verdict.
 *
 * With a Lb per flange (`params.LbNeg`) and the moment by sign, the member is checked twice, each
 * sign of the strong-axis moment with the flange it compresses (the top one, `Lb`, for positive
 * moments; the bottom one, `LbNeg`, for negative), and the worse reading is the member's. Each run
 * is a whole check of the member under that moment, so its interaction reads the flexural
 * capacity of the flange that moment compresses.
 */
export function verifySteelElement(input: SteelVerificationInput, opts: { trace?: boolean } = {}): SteelVerification {
  return withUndeclaredData(input.params, (params) => verifyByFlange({ ...input, params }, opts));
}

/** The member with every datum stated: once, or once per flange with its own Lb. */
export function verifyByFlange(input: SteelVerificationInput, opts: { trace?: boolean } = {}): SteelVerification {
  const p = input.params;
  if (p.LbNeg === undefined || (input.MuzPos === undefined && input.MuzNeg === undefined)) {
    // Without the moment by sign, the longer of the two flange lengths serves both signs.
    const Lb = p.LbNeg !== undefined ? Math.max(p.Lb, p.LbNeg) : p.Lb;
    return verifyOnce(input, { ...p, Lb, LbNeg: undefined }, opts);
  }
  const flange = (sign: 'positive' | 'negative', Lb: number): EngineMessage => ({
    key: 'c301.flangeLb',
    params: { sign: { key: `c301.word.${sign}` }, flange: { key: `c301.word.${sign === 'positive' ? 'top' : 'bottom'}` }, Lb: fmtNum(Lb) },
  });
  const pos = verifyOnce({ ...input, Muz: input.MuzPos ?? 0 }, { ...p, LbNeg: undefined }, opts, flange('positive', p.Lb));
  const neg = verifyOnce({ ...input, Muz: input.MuzNeg ?? 0 }, { ...p, Lb: p.LbNeg, LbNeg: undefined }, opts, flange('negative', p.LbNeg));
  return { ...worseSteelVerification(pos, neg), Muz: input.Muz, inputs: [{ ...p, LbNeg: undefined }] };
}

function verifyOnce(input: SteelVerificationInput, params: SteelDesignParams, opts: { trace?: boolean }, note?: EngineMessage): SteelVerification {
  const { elementId, Nu, Muy, Muz, Vu } = input;
  const r = run(params, { Nu, Muz, Muy, Vu }, elementId, opts.trace ?? true);

  const header = [
    `=== Verificacion CIRSOC 301 — Elemento ${elementId} ===`,
    `Solicitaciones: Nu=${Nu.toFixed(2)} kN, Muz=${Muz.toFixed(2)} kN·m, Muy=${Muy.toFixed(2)} kN·m, Vu=${Vu.toFixed(2)} kN`,
    ...[...lengthsStep(params), ...(note ? [note] : [])].map(renderEs),
    '',
  ];

  if (!r) {
    const u = unavailable();
    const diag: SolverDiagnostic = {
      severity: 'error', code: 'VERIF_ENGINE_UNAVAILABLE', message: 'diag.verifEngineUnavailable',
      elementIds: [elementId], source: 'verification',
    };
    return {
      elementId, Nu, Muy, Muz, Vu,
      flexureZ: { Mu: Math.abs(Muz), Mp: NaN, Mn: 0, phiMn: 0, Lp: NaN, Lr: NaN, ...u },
      shear: { Vu: Math.abs(Vu), phiVn: 0, Cv: NaN, ...u },
      ...(Nu < 0 ? { tension: { Pu: Math.abs(Nu), phiPn: 0, ...u } } : {}),
      ...(Nu > 0 ? { compression: { Pu: Nu, KLr: NaN, Fe: NaN, Fcr: NaN, phiPn: 0, Q: NaN, ...u } } : {}),
      overallStatus: 'fail',
      diagnostics: [diag],
      steps: [...header, ...u.steps],
      engine: { available: false, pass: false, unityRatio: Infinity, governingCheck: 'none', unevaluated: ['engine'] },
      inputs: [params],
    };
  }

  const tension = r.tension && tensionOf(r.tension, params);
  const compression = r.compression && compressionOf(r.compression);
  const flexureZ = flexureOf(r.flexureStrong);
  const flexureY = r.flexureWeak && flexureOf(r.flexureWeak);
  const shear: SteelShearResult = { ...shearOf(r.shear), axis: 'strong' };
  const interaction = r.interaction && interactionOf(r.interaction);
  const shearWeak = weakShearOf(params, input.VuWeak);

  const steps = [...header];
  for (const c of [tension, compression, flexureZ, flexureY, shear, shearWeak, interaction]) {
    if (c) steps.push(...c.steps, '');
  }
  // The verdict of the checks (`steelVerdict`): a proven failure, a hold where a check was refused
  // under load, else the passes by band. §G.6 (app-side) can only lower it.
  const parts = { tension, compression, flexureZ, flexureY, shear, shearWeak, interaction };
  const overallStatus = steelVerdict(parts);
  const notEvaluated = steelNotEvaluated(parts);
  if (notEvaluated.length) {
    const word: Record<string, string> = { tension: 'tracción', compression: 'compresión', flexureZ: 'flexión, eje fuerte', flexureY: 'flexión, eje débil', shear: 'corte', shearWeak: 'corte, eje débil', interaction: 'interacción' };
    steps.push(`Estados límite no evaluados: ${notEvaluated.map((n) => `${n.clause || '—'} (${word[n.check]})`).join(', ')}. El miembro no se da por verificado.`);
  }
  steps.push(steelResultLine(overallStatus));

  const diags: SolverDiagnostic[] = [];
  const checks: { name: string; result?: Common }[] = [
    { name: 'TENSION', result: tension },
    { name: 'COMPRESSION', result: compression },
    { name: 'FLEXURE_Z', result: flexureZ },
    { name: 'FLEXURE_Y', result: flexureY },
    { name: 'SHEAR', result: shear },
    { name: 'SHEAR_WEAK', result: shearWeak },
    { name: 'INTERACTION', result: interaction },
  ];
  for (const check of checks) {
    if (!check.result) continue;
    const { status, ratio, notEvaluated } = check.result;
    if (notEvaluated && status === 'held') {
      diags.push({
        severity: 'error', code: `VERIF_STEEL_NOT_EVALUATED_${check.name}`,
        message: `Steel ${check.name.toLowerCase().replace('_', ' ')} check not evaluated: ${notEvaluated}`,
        elementIds: [elementId], source: 'verification', details: { ratio },
      });
    } else if (status === 'fail') {
      diags.push({
        severity: 'error', code: `VERIF_STEEL_FAIL_${check.name}`,
        message: `Steel ${check.name.toLowerCase().replace('_', ' ')} check failed (ratio ${ratio.toFixed(3)})`,
        elementIds: [elementId], source: 'verification', details: { ratio },
      });
    }
  }

  return {
    elementId, Nu, Muy, Muz, Vu,
    tension, compression, flexureZ, flexureY, shear, ...(shearWeak ? { shearWeak } : {}), interaction,
    overallStatus,
    ...(notEvaluated.length ? { notEvaluated } : {}),
    diagnostics: diags.length > 0 ? diags : undefined,
    steps,
    engine: { available: true, pass: r.pass, unityRatio: r.unityRatio, governingCheck: r.governingCheck, unevaluated: r.unevaluated },
    inputs: [params],
  };
}
