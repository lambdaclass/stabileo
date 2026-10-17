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
 * Unidades: kN, m, MPa (N/mm²).
 */

import type { SolverDiagnostic } from '../../types';
import type { VerifStatus } from './cirsoc201';
import type { EngineMessage } from '../../../codes/message';
import steelEs from '../../../i18n/locales/steel/es';
import { engineCheckMembers, type EngineCheck, type EngineMemberResult } from './cirsoc301-kernel';

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
  status: VerifStatus;
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
  status: VerifStatus;
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
  Vu: number;
  phiVn: number;
  Cv: number;
  ratio: number;
  status: VerifStatus;
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
  status: VerifStatus;
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
  /**
   * The engine's own verdict on this exact input. `available: false` — the engine was not loaded,
   * and every check is a failure, never the absence of one.
   */
  engine: { available: boolean; pass: boolean; unityRatio: number; governingCheck: string; unevaluated: string[] };
  governingCombos?: {
    flexure?: { comboId: number; comboName: string };
    shear?: { comboId: number; comboName: string };
    axial?: { comboId: number; comboName: string };
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

/** The input the engine reads: the params themselves, with the resolved Ae's messages as steps. */
function engineMember(elementId: number, p: SteelDesignParams): object {
  const tc = p.tensionConnection;
  const tensionConnection = tc?.resolved
    ? { ...tc, resolved: { Ae: tc.resolved.Ae, steps: tc.resolved.steps, messages: tc.resolved.messages ?? [] } }
    : tc;
  return { ...p, elementId, ...(tensionConnection ? { tensionConnection } : {}) };
}

const UNAVAILABLE: EngineMessage = { key: 'c301.refuse.engineUnavailable' };

/** One engine run for one demand, or null when the engine is not available. */
function run(p: SteelDesignParams, f: { Nu: number; Muz: number; Muy: number; Vu: number }, elementId = 0): EngineMemberResult | null {
  const out = engineCheckMembers([engineMember(elementId, p)], [{ elementId, ...f }]);
  return out?.[0] ?? null;
}

interface Common {
  ratio: number; status: VerifStatus; steps: string[]; messages: EngineMessage[];
  clauseRef?: string; notEvaluated?: string; notEvaluatedMessage?: EngineMessage;
}

function common(c: EngineCheck): Common {
  const messages = c.steps.map(localisable);
  const ne = c.notEvaluated ? localisable(c.notEvaluated) : undefined;
  return {
    ratio: c.ratio,
    status: c.pass ? 'ok' : 'fail',
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

function tensionOf(c: EngineCheck): SteelTensionResult {
  return { Pu: c.demand, phiPn: c.capacity, ...common(c) };
}

export function checkSteelTension(params: SteelDesignParams, Pu: number): SteelTensionResult {
  const zero = Math.abs(Pu) === 0;
  const r = run(params, { Nu: zero ? -1 : -Math.abs(Pu), Muz: 0, Muy: 0, Vu: 0 });
  if (!r?.tension) return { Pu: Math.abs(Pu), phiPn: 0, ...unavailable() };
  const t = tensionOf(r.tension);
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

function interactionOf(c: EngineCheck): SteelInteractionResult {
  const equation = c.clause === 'H.1.1a' ? 'H1-1a' : 'H1-1b';
  return { equation, value: c.ratio, ...common(c) };
}

/** H.1 for the given demand (Pu + compression). */
export function checkSteelInteraction(params: SteelDesignParams, Pu: number, Mux: number, Muy: number): SteelInteractionResult {
  const r = run(params, { Nu: Pu, Muz: Mux, Muy, Vu: 0 });
  if (!r) return { equation: 'H1-1b', value: Infinity, ...unavailable() };
  if (r.interaction) return interactionOf(r.interaction);
  // H.1 does not apply (one moment, no axial force): H.1.1b reduces to that flexure ratio.
  const f = r.flexureWeak && Math.abs(Muy) > 0 ? r.flexureWeak : r.flexureStrong;
  return { equation: 'H1-1b', value: f.ratio, ...common(f) };
}

// ---------------------------------------------------------------------------
// Verificacion completa de un elemento
// ---------------------------------------------------------------------------

export function verifySteelElement(input: SteelVerificationInput): SteelVerification {
  const { elementId, Nu, Muy, Muz, Vu, params } = input;
  const r = run(params, { Nu, Muz, Muy, Vu }, elementId);

  const header = [
    `=== Verificacion CIRSOC 301 — Elemento ${elementId} ===`,
    `Solicitaciones: Nu=${Nu.toFixed(2)} kN, Muz=${Muz.toFixed(2)} kN·m, Muy=${Muy.toFixed(2)} kN·m, Vu=${Vu.toFixed(2)} kN`,
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
    };
  }

  const tension = r.tension && tensionOf(r.tension);
  const compression = r.compression && compressionOf(r.compression);
  const flexureZ = flexureOf(r.flexureStrong);
  const flexureY = r.flexureWeak && flexureOf(r.flexureWeak);
  const shear = shearOf(r.shear);
  const interaction = r.interaction && interactionOf(r.interaction);

  const steps = [...header];
  for (const c of [tension, compression, flexureZ, flexureY, shear, interaction]) {
    if (c) steps.push(...c.steps, '');
  }
  const overallStatus: VerifStatus = r.pass ? 'ok' : 'fail';
  steps.push(`=== Resultado global: ${overallStatus.toUpperCase()} ===`);

  const diags: SolverDiagnostic[] = [];
  const checks: { name: string; result?: Common }[] = [
    { name: 'TENSION', result: tension },
    { name: 'COMPRESSION', result: compression },
    { name: 'FLEXURE_Z', result: flexureZ },
    { name: 'FLEXURE_Y', result: flexureY },
    { name: 'SHEAR', result: shear },
    { name: 'INTERACTION', result: interaction },
  ];
  for (const check of checks) {
    if (!check.result) continue;
    const { status, ratio, notEvaluated } = check.result;
    if (notEvaluated && ratio > 0) {
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
    tension, compression, flexureZ, flexureY, shear, interaction,
    overallStatus,
    diagnostics: diags.length > 0 ? diags : undefined,
    steps,
    engine: { available: true, pass: r.pass, unityRatio: r.unityRatio, governingCheck: r.governingCheck, unevaluated: r.unevaluated },
  };
}
