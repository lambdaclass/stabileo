/**
 * The end connection of a steel tension member, and the effective net area it leaves —
 * CIRSOC 301-2018 §D.3 and §B.4.2.2.
 *
 * ── Why this exists ────────────────────────────────────────────────
 *
 * D.2(b) rates rupture on Ae = An·U. An depends on the holes and U on HOW the member is joined
 * (which elements carry the force into the connection, over what length), and a section alone
 * knows neither. #295 made the checker refuse rupture without them; this module is where the
 * model's description of each member end becomes An, U and Ae, with every step quoted.
 *
 * ── What is described ──────────────────────────────────────────────
 *
 * Per member END (`MemberTensionConnection.i` / `.j`), because the two ends of a brace are often
 * joined differently and rupture is checked at each:
 *
 *   · bolted — bolt diameter, hole kind (standard / oversize, Tabla J.3.3), bolts in each line
 *     along the force, lines in each connected element, the pitch along the force, and an
 *     optional stagger (s, g) for the s²/4g of B.4.2.2;
 *   · welded — longitudinal, transverse, or both, with the longitudinal weld length.
 *
 * and which elements of the section are connected: every element, both flanges, the web, one
 * flange of a tee, one leg of an angle.
 *
 * ── What is computed, clause by clause ─────────────────────────────
 *
 *   · B.4.2.2 — each hole deducts its NOMINAL dimension (Tabla J.3.3) PLUS 2 mm; a zig-zag chain
 *     adds s²·t/(4g) per diagonal, and the smallest An over the chains governs.
 *   · D.3(1) — every element connected: Ae = An.
 *   · D.3(2)(a) — bolts, some elements: Ae = An·U, U = 1 − x̄/L ≤ 0,9 (D.3.2); a single bolt in
 *     the force direction («sólo una fila de bulones»): Ae = net area of the connected elements.
 *   · D.3(2)(b) — longitudinal welds (alone or with transverse), not a flat plate: Ae = Ag·U.
 *   · D.3(2)(c) — transverse welds only: Ae = area of the connected elements (U = 1).
 *   · D.3(2)(d) — a flat plate with longitudinal welds along both edges: L ≥ w, U from the table.
 *   · D.3, last paragraph — in open sections U is never below A_connected/Ag.
 *
 * x̄ is the distance from the connection plane to the centroid of the part of the section that
 * delivers the force to it (Figura D.3.1): a single angle's centroid from the back of the
 * connected leg; the half-section (a tee) from the flange face for an I or channel joined by its
 * flanges; the half on each side of the plane of symmetry, from that plane, for a section joined
 * through its web or stem (taken from the mid-plane, not the face: the larger x̄, the smaller U).
 * Element areas use the sharp-cornered outline (no root fillets), which places the centroid
 * slightly further out and the connected area slightly lower — both on the side of a smaller Ae.
 *
 * ── What is refused, by name ───────────────────────────────────────
 *
 * Tubes (§D.3 sends them to CIRSOC 302), cold-formed shapes (CIRSOC 303), drawn or polygon
 * sections, built-up arrangements other than back-to-back pairs, a shape with no recorded family,
 * a bolt diameter Tabla J.3.3 does not tabulate, a stagger mixed with web lines, holes that do not
 * fit in the element, a plate whose weld is shorter than its width, and any missing number the
 * clause needs. Nothing is defaulted: a missing pitch is not "3 d", and a missing connection is
 * not Ae = Ag.
 *
 * The engine computes all of it (`engine/src/postprocess/tension_net_area.rs`, op `netArea`); this
 * module sends the model's description, resolves the catalogue part of a built-up pair and the
 * nominal hole of Tabla J.3.3, and words the engine's steps and refusals. Reasons come back as a
 * code plus a Spanish sentence, the checker's language; surfaces translate the code.
 */

import { nominalHoleMm, type HoleKind } from '../../connection/bolt-geometry';
import { ALL_PROFILES, profileToSectionFull } from '../../data/steel-profiles';
import { msg, round, type EngineMessage } from '../../codes/message';
import { cirsoc301InputsRequest } from './cirsoc301-inputs';

// ─── The stored description ──────────────────────────────────────────

/** Which elements of the cross-section the connection grips. */
export type ConnectedElements =
  /** Every element of the section (D.3(1)). A plate has only this. */
  | 'all'
  /** I/H or channel: both flanges, web free. */
  | 'flanges'
  /** I/H, channel or tee: the web (stem) only. */
  | 'web'
  /** Tee: the flange only. */
  | 'flange'
  /** Angle (single or each of a pair): the leg of length h. */
  | 'legH'
  /** Angle (single or each of a pair): the leg of length b. */
  | 'legB';

export type WeldLayout = 'longitudinal' | 'transverse' | 'longitudinalAndTransverse';

export interface BoltedEnd {
  kind: 'bolted';
  connected: ConnectedElements;
  /** Nominal bolt diameter, mm. */
  diameterMm?: number;
  holeKind: HoleKind;
  /** Bolts in each line, along the force (≥ 1). */
  boltsPerLine?: number;
  /** Lines of bolts in EACH connected element (each flange, the web, the leg, the plate). */
  lines?: number;
  /**
   * For `connected: 'all'` on an I, channel or tee: lines in the web; on an angle: lines in the
   * second leg. Ignored otherwise.
   */
  webLines?: number;
  /** Pitch along the force between consecutive bolts of a line, mm. Needed when boltsPerLine ≥ 2. */
  pitchMm?: number;
  /**
   * Staggered lines: `s` along the force between holes of adjacent lines, `g` across, mm
   * (B.4.2.2). Absent: holes of all lines lie in one cross-section.
   */
  stagger?: { sMm?: number; gMm?: number };
}

export interface WeldedEnd {
  kind: 'welded';
  connected: ConnectedElements;
  weld: WeldLayout;
  /** Length of the longitudinal welds, mm (the shortest when they differ). */
  lengthMm?: number;
}

export type EndConnection = BoltedEnd | WeldedEnd;

/** What a member stores. Absent end: not described, and rupture there is not evaluated. */
export interface MemberTensionConnection {
  i?: EndConnection;
  j?: EndConnection;
}

// ─── The section, as the clause sees it ──────────────────────────────

/** Section fields read here (SI, m and m²). The model's `Section` is assignable to it. */
export interface TensionSectionInput {
  name?: string;
  shape?: string;
  a?: number;
  h?: number;
  b?: number;
  tw?: number;
  tf?: number;
  t?: number;
  composition?: { profileName: string; arrangement: string; gapMm?: number };
  polygon?: unknown;
  drawn?: unknown;
}

export type GeometryKind = 'I' | 'U' | 'T' | 'L' | 'plate';

export type TensionGeometry = { kind: GeometryKind; options: ConnectedElements[] };

export type RefusalCode =
  | 'noShape' | 'tube' | 'coldFormed' | 'drawn' | 'builtUp' | 'builtUpPart' | 'shape'
  | 'dimensions' | 'area' | 'connectedForShape' | 'diameter' | 'holeNotTabulated'
  | 'boltsPerLine' | 'lines' | 'webLines' | 'pitch' | 'stagger' | 'staggerWithWebLines'
  | 'holesDoNotFit' | 'netArea' | 'weldLength' | 'plateWeldShort' | 'missing';

export interface Refusal {
  code: RefusalCode;
  /** Spanish, the checker's language — for the calculation steps. */
  message: string;
}

export type Clause = 'D.3(1)' | 'D.3.1' | 'D.3.3' | 'D.3.4' | 'D.3.5' | 'D.3(2)(a)';

/** An, U, Ae at one end, with the steps that produced them. Areas m². */
export interface EndNetArea {
  Ag: number;
  An: number;
  U: number;
  Ae: number;
  /** Clause the Ae came from. */
  clause: Clause;
  xBar?: number;
  L?: number;
  steps: string[];
  /** The same steps as engine messages (`steel.tc.calc.*`), for surfaces in the user's language. */
  messages: EngineMessage[];
}

type EngineRefusal = { code: RefusalCode; variant?: string; n?: number; dh?: number; width?: number; L?: number; w?: number };

type EngineEvent =
  | { step: 'weldNoHoles' }
  | { step: 'plateTable'; L: number; w: number; U: number }
  | { step: 'aeAg'; Ag: number; U: number; Ae: number; clause: 'D.3.3' | 'D.3.5' }
  | { step: 'all'; Ae: number }
  | { step: 'transverse'; Aconn: number; Ae: number }
  | { step: 'xBarWeld'; xBar: number; L: number }
  | { step: 'u'; xBar: number; L: number; raw: number; U: number }
  | { step: 'uFloor'; Aconn: number; Ag: number; U: number }
  | { step: 'hole'; hole: number; dh: number }
  | { step: 'chains'; straightHoles: number; lines: number; dh: number; t: number; straight: number; zig: number }
  | { step: 'an'; Ag: number; deduct: number; An: number }
  | { step: 'oneBolt'; Aconn: number; deduct: number; Ae: number }
  | { step: 'xBarBolt'; xBar: number; n: number; pitch: number; L: number }
  | { step: 'aeAn'; An: number; U: number; Ae: number };

type EngineEnd = { Ag: number; An: number; U: number; Ae: number; clause: Clause; xBar?: number; L?: number; events: EngineEvent[] };

type EngineMember =
  | { missing: number[] }
  | { refused: EngineRefusal; at: number }
  | { perEnd: EngineEnd[]; governing: number };

const mm = (v: number, d = 1) => (v * 1000).toFixed(d);
const mm2 = (v: number) => (v * 1e6).toFixed(0);
const f3 = (v: number) => v.toFixed(3);
const r0 = (m2: number) => round(m2 * 1e6, 0);
const r1mm = (m: number) => round(m * 1000, 1);
const r3 = (v: number) => round(v, 3);

const byName = new Map(ALL_PROFILES.map((p) => [p.name, p]));

/** The section as the engine reads it: the catalogue part of a built-up pair resolved here. */
function sectionPayload(s: TensionSectionInput) {
  const comp = s.composition;
  const p = comp?.arrangement === 'doubleBack' ? byName.get(comp.profileName) : undefined;
  const part = p ? profileToSectionFull(p) : undefined;
  return {
    shape: s.shape, a: s.a, h: s.h, b: s.b, tw: s.tw, tf: s.tf, t: s.t,
    drawn: !!(s.drawn || s.polygon),
    arrangement: comp?.arrangement,
    part: part && { shape: part.shape, h: part.h, b: part.b, tw: part.tw, tf: part.tf, t: part.t },
  };
}

function endPayload(e: EndConnection) {
  if (e.kind === 'welded') return e;
  const hole = e.diameterMm !== undefined && Number.isFinite(e.diameterMm) && e.diameterMm > 0 ? nominalHoleMm(e.diameterMm, e.holeKind) : null;
  return hole === null ? e : { ...e, holeMm: hole };
}

function refusalMessage(why: EngineRefusal, s: TensionSectionInput, end?: EndConnection): string {
  const comp = s.composition;
  switch (why.code) {
    case 'drawn': return 'seccion dibujada o poligonal: sus elementos (alas, alma, alas de angulo) no se pueden identificar para D.3';
    case 'builtUp': return why.variant === 'pair' ? 'par espalda con espalda: solo angulos o canales' : `barra armada «${comp?.arrangement}»: solo se describen pares espalda con espalda`;
    case 'builtUpPart': return `perfil componente «${comp?.profileName}» no encontrado en el catalogo`;
    case 'noShape': return 'la seccion no registra su forma: no se sabe que elementos tiene';
    case 'tube': return 'tubos: D.3 remite el area neta efectiva al Reglamento CIRSOC 302';
    case 'coldFormed': return 'perfil conformado en frio: corresponde el Reglamento CIRSOC 303';
    case 'dimensions':
      switch (why.variant) {
        case 'flange': return 'tf incompatible con h';
        case 'angle': return 'faltan h, b o t del angulo';
        case 'angleThickness': return 't del angulo no menor que sus alas';
        case 'plate': return 'faltan b o h de la chapa';
        default: return 'faltan h, b, tw o tf de la seccion';
      }
    case 'shape': {
      const p = comp && comp.arrangement !== 'single' ? byName.get(comp.profileName) : undefined;
      return `forma «${p ? profileToSectionFull(p).shape : s.shape}» sin elementos definidos para D.3`;
    }
    case 'area': return 'la seccion no tiene area bruta';
    case 'connectedForShape': return `«${end ? CONNECTED_ES[end.connected] : '?'}» no es un elemento de esta seccion`;
    case 'diameter': return 'falta el diametro del bulon';
    case 'holeNotTabulated': return `bulon de ${end?.kind === 'bolted' ? end.diameterMm : '?'} mm: la Tabla J.3.3 no da su agujero`;
    case 'boltsPerLine': return 'falta el numero de bulones por fila (entero ≥ 1)';
    case 'lines': return 'falta el numero de filas por elemento unido (entero ≥ 1)';
    case 'webLines': return 'todos los elementos unidos: falta el numero de filas en el alma (o en la otra ala)';
    case 'pitch': return 'falta el paso entre bulones a lo largo de la fuerza';
    case 'staggerWithWebLines': return 'tresbolillo combinado con filas en el alma: cadenas no cubiertas';
    case 'stagger': return why.variant === 'oneLine' ? 'tresbolillo con una sola fila' : 'tresbolillo sin s o g';
    case 'holesDoNotFit': return `${why.n} agujeros de ${mm(why.dh!)} mm no caben en un elemento de ${mm(why.width!, 0)} mm`;
    case 'netArea': return why.variant === 'connected' ? 'area neta de los elementos unidos ≤ 0' : 'An ≤ 0';
    case 'weldLength': return `falta la longitud L de los cordones longitudinales (${why.variant})`;
    case 'plateWeldShort': return `chapa con cordones longitudinales: L = ${mm(why.L!, 0)} mm < w = ${mm(why.w!, 0)} mm, D.3(2)(d) exige L ≥ w`;
    case 'missing': return 'no descrita';
  }
}

function render(ev: EngineEvent): [string, EngineMessage] {
  switch (ev.step) {
    case 'weldNoHoles':
      return ['  Sin agujeros en la union soldada: An = Ag  (B.4.2.2)', msg('steel.tc.calc.weldNoHoles')];
    case 'plateTable':
      return [`  Chapa con cordones en ambos bordes: L = ${mm(ev.L, 0)} mm, w = ${mm(ev.w, 0)} mm → U = ${ev.U.toFixed(2)}  (D.3(2)(d))`,
        msg('steel.tc.calc.plateTable', { L: round(ev.L * 1000, 0), w: round(ev.w * 1000, 0), U: ev.U })];
    case 'aeAg':
      return ev.clause === 'D.3.5'
        ? [`  Ae = Ag·U = ${mm2(ev.Ag)}·${ev.U.toFixed(2)} = ${mm2(ev.Ae)} mm²  (D.3.5)`, msg('steel.tc.calc.aeAg', { Ag: r0(ev.Ag), U: ev.U, Ae: r0(ev.Ae), clause: 'D.3.5' })]
        : [`  Ae = Ag·U = ${mm2(ev.Ag)}·${f3(ev.U)} = ${mm2(ev.Ae)} mm²  (D.3(2)(b), D.3.3)`, msg('steel.tc.calc.aeAg', { Ag: r0(ev.Ag), U: r3(ev.U), Ae: r0(ev.Ae), clause: 'D.3.3' })];
    case 'all':
      return [`  Todos los elementos unidos: Ae = An = ${mm2(ev.Ae)} mm²  (D.3(1))`, msg('steel.tc.calc.all', { Ae: r0(ev.Ae) })];
    case 'transverse':
      return [`  Solo cordones transversales: Ae = A unida = ${mm2(ev.Aconn)} mm², U = 1  (D.3(2)(c), D.3.4)`, msg('steel.tc.calc.transverse', { Ae: r0(ev.Ae) })];
    case 'xBarWeld':
      return [`  x̄ = ${mm(ev.xBar)} mm (Figura D.3.1), L = ${mm(ev.L, 0)} mm`, msg('steel.tc.calc.xBarWeld', { xBar: r1mm(ev.xBar), L: round(ev.L * 1000, 0) })];
    case 'u':
      return [`  U = 1 − x̄/L = 1 − ${mm(ev.xBar)}/${mm(ev.L, 0)} = ${f3(ev.raw)} ≤ 0,9 → ${f3(ev.U)}  (D.3.2)`,
        msg('steel.tc.calc.u', { xBar: r1mm(ev.xBar), L: round(ev.L * 1000, 0), raw: r3(ev.raw), U: r3(ev.U) })];
    case 'uFloor':
      return [`  U ≥ A unida/Ag = ${mm2(ev.Aconn)}/${mm2(ev.Ag)} = ${f3(ev.U)}  (D.3, secciones abiertas)`, msg('steel.tc.calc.uFloor', { Aconn: r0(ev.Aconn), Ag: r0(ev.Ag), U: r3(ev.U) })];
    case 'hole':
      return [`  Agujero: ${ev.hole} mm (Tabla J.3.3) + 2 mm = ${mm(ev.dh)} mm  (B.4.2.2)`, msg('steel.tc.calc.hole', { hole: ev.hole, dh: r1mm(ev.dh) })];
    case 'chains':
      return [`  Cadena recta: ${ev.straightHoles}·${mm(ev.dh)}·${mm(ev.t)} = ${mm2(ev.straight)} mm²; en zigzag: ${ev.lines}·${mm(ev.dh)}·${mm(ev.t)} − ${ev.lines - 1}·s²t/4g = ${mm2(ev.zig)} mm²  (B.4.2.2)`,
        msg('steel.tc.calc.chains', { straight: r0(ev.straight), zig: r0(ev.zig) })];
    case 'an':
      return [`  An = Ag − Σ agujeros = ${mm2(ev.Ag)} − ${mm2(ev.deduct)} = ${mm2(ev.An)} mm²  (B.4.2.2)`, msg('steel.tc.calc.an', { Ag: r0(ev.Ag), deduct: r0(ev.deduct), An: r0(ev.An) })];
    case 'oneBolt':
      return [`  Un solo bulon por fila: Ae = A neta de los elementos unidos = ${mm2(ev.Aconn)} − ${mm2(ev.deduct)} = ${mm2(ev.Ae)} mm²  (D.3(2)(a))`,
        msg('steel.tc.calc.oneBolt', { Aconn: r0(ev.Aconn), deduct: r0(ev.deduct), Ae: r0(ev.Ae) })];
    case 'xBarBolt':
      return [`  x̄ = ${mm(ev.xBar)} mm (Figura D.3.1), L = (${ev.n} − 1)·${ev.pitch} = ${mm(ev.L, 0)} mm`,
        msg('steel.tc.calc.xBarBolt', { xBar: r1mm(ev.xBar), n: ev.n, pitch: ev.pitch, L: round(ev.L * 1000, 0) })];
    case 'aeAn':
      return [`  Ae = An·U = ${mm2(ev.An)}·${f3(ev.U)} = ${mm2(ev.Ae)} mm²  (D.3(2)(a), D.3.1)`, msg('steel.tc.calc.aeAn', { An: r0(ev.An), U: r3(ev.U), Ae: r0(ev.Ae) })];
  }
}

function endResult(r: EngineEnd, end: EndConnection): EndNetArea {
  const steps = [`  Union: ${describeEnd(end)}`];
  const messages: EngineMessage[] = [msg('steel.tc.calc.connection', { what: describeEndMessage(end) })];
  for (const ev of r.events) {
    const [step, m] = render(ev);
    steps.push(step);
    messages.push(m);
  }
  const out: EndNetArea = { Ag: r.Ag, An: r.An, U: r.U, Ae: r.Ae, clause: r.clause, steps, messages };
  if (r.xBar !== undefined) out.xBar = r.xBar;
  if (r.L !== undefined) out.L = r.L;
  return out;
}

const netAreaRequest = (s: TensionSectionInput, ends: ReadonlyArray<EndConnection | undefined>) =>
  cirsoc301InputsRequest<EngineMember>('netArea', 'effective net area', { section: sectionPayload(s), ends: ends.map((e) => (e ? endPayload(e) : null)) });

/** The section's kind and the elements a connection can grip, from the engine, or why it has none. */
export function tensionGeometry(s: TensionSectionInput): TensionGeometry | { refused: Refusal } {
  const r = cirsoc301InputsRequest<TensionGeometry | { refused: EngineRefusal }>('tensionGeometry', 'tension geometry', sectionPayload(s));
  return 'refused' in r ? { refused: { code: r.refused.code, message: refusalMessage(r.refused, s) } } : r;
}

const CONNECTED_ES: Record<ConnectedElements, string> = {
  all: 'todos los elementos', flanges: 'ambas alas', web: 'el alma', flange: 'el ala',
  legH: 'el ala h del angulo', legB: 'el ala b del angulo',
};

/** One line describing an end connection, for the report. Spanish, like the steps. */
export function describeEnd(e: EndConnection): string {
  if (e.kind === 'welded') {
    const w = e.weld === 'longitudinal' ? 'cordones longitudinales' : e.weld === 'transverse' ? 'cordones transversales' : 'cordones longitudinales y transversales';
    return `soldada, ${w}${e.lengthMm ? ` L = ${e.lengthMm} mm` : ''}, unida por ${CONNECTED_ES[e.connected]}`;
  }
  const n = e.boltsPerLine ?? '?', l = e.lines ?? '?';
  const st = e.stagger ? `, tresbolillo s = ${e.stagger.sMm ?? '?'} mm, g = ${e.stagger.gMm ?? '?'} mm` : '';
  const web = e.connected === 'all' && e.webLines ? ` + ${e.webLines} fila(s) en alma/otra ala` : '';
  return `abulonada, ${l} fila(s) × ${n} bulon(es) M${e.diameterMm ?? '?'} (agujero ${e.holeKind === 'standard' ? 'normal' : 'holgado'})${e.pitchMm ? `, paso ${e.pitchMm} mm` : ''}${st}${web}, unida por ${CONNECTED_ES[e.connected]}`;
}

/** The connection as an engine message, for the calculation shown in the user's language. */
export function describeEndMessage(e: EndConnection): EngineMessage {
  const connected = msg(`steel.tc.connected.${e.connected}`);
  if (e.kind === 'welded') {
    return msg('steel.tc.calc.welded', { weld: msg(`steel.tc.weld.${e.weld}`), L: e.lengthMm ?? '—', connected });
  }
  return msg('steel.tc.calc.bolted', {
    lines: e.lines ?? '?', n: e.boltsPerLine ?? '?', d: e.diameterMm ?? '?', hole: msg(`steel.tc.hole.${e.holeKind}`),
    pitch: e.pitchMm ?? '—', connected,
  });
}

/** An, U and Ae at one end, computed by the engine, for a section whose gross area is `section.a`. */
export function endNetArea(section: TensionSectionInput, end: EndConnection): EndNetArea | { refused: Refusal } {
  const r = netAreaRequest(section, [end]);
  if ('refused' in r) return { refused: { code: r.refused.code, message: refusalMessage(r.refused, section, end) } };
  if ('missing' in r) throw new Error('effective net area: the engine reported a described end as missing');
  return endResult(r.perEnd[0]!, end);
}

// ─── The member: every end that must be described ───────────────────

export interface MemberEnd {
  elementId: number;
  end: 'i' | 'j';
  connection?: EndConnection;
}

/** The governing Ae over a member's ends, or why it cannot be had. */
export type MemberNetArea =
  | { Ae: number; governing: MemberEnd; perEnd: Array<{ at: MemberEnd; result: EndNetArea }>; steps: string[]; messages: EngineMessage[] }
  | { missing: MemberEnd[]; steps: string[] }
  | { refused: Refusal; at: MemberEnd; steps: string[] };

const label = (e: MemberEnd) => `barra ${e.elementId}, extremo ${e.end.toUpperCase()}`;

export function memberNetArea(section: TensionSectionInput, ends: readonly MemberEnd[]): MemberNetArea {
  const missing = ends.filter((e) => !e.connection);
  if (missing.length > 0) {
    return { missing, steps: [`  Falta la union extrema en: ${missing.map(label).join('; ')}`] };
  }
  if (ends.length === 0) return { missing: [], steps: ['  Sin extremos que describir'] };
  const r = netAreaRequest(section, ends.map((e) => e.connection));
  if ('missing' in r) throw new Error('effective net area: the engine reported a described end as missing');
  if ('refused' in r) {
    const at = ends[r.at]!;
    const message = refusalMessage(r.refused, section, at.connection);
    return { refused: { code: r.refused.code, message }, at, steps: [`  ${label(at)}: ${message}`] };
  }
  const steps: string[] = [];
  const messages: EngineMessage[] = [];
  const perEnd = r.perEnd.map((res, k) => {
    const at = ends[k]!;
    const result = endResult(res, at.connection!);
    steps.push(`  — ${label(at)}:`, ...result.steps);
    messages.push(msg('steel.tc.calc.end', { id: at.elementId, end: at.end.toUpperCase() }), ...result.messages);
    return { at, result };
  });
  const gov = perEnd[r.governing]!;
  if (perEnd.length > 1) {
    steps.push(`  Gobierna ${label(gov.at)}: Ae = ${mm2(gov.result.Ae)} mm²`);
    messages.push(msg('steel.tc.calc.governingEnd', { id: gov.at.elementId, end: gov.at.end.toUpperCase(), Ae: r0(gov.result.Ae) }));
  }
  return { Ae: gov.result.Ae, governing: gov.at, perEnd, steps, messages };
}

// ─── Which ends a member has to describe ────────────────────────────

interface EndsModel {
  elements: ReadonlyMap<number, {
    id: number; nodeI: number; nodeJ: number;
    releaseI?: { my?: boolean; mz?: boolean; t?: boolean; slide?: unknown };
    releaseJ?: { my?: boolean; mz?: boolean; t?: boolean; slide?: unknown };
    jointI?: { dof: readonly boolean[] }; jointJ?: { dof: readonly boolean[] };
    semiRigid?: { i?: unknown; j?: unknown };
    tensionConnection?: MemberTensionConnection;
  }>;
}

/**
 * The ends whose connection decides the rupture of element `id`.
 *
 * A member drawn as a chain of collinear elements (`memberLengths().chain`, nothing else at the
 * nodes between them) is one physical bar: its ends are the chain's two outer ends. A node inside
 * the chain is continuous material — unless an end there is released, has a joint or a
 * semi-rigid spring, which says something is joined there, or the user described a connection at
 * it (a splice). Those interior ends are added and must be described too.
 */
export function memberEndsFor(id: number, model: EndsModel, chain?: readonly number[]): MemberEnd[] {
  const own = model.elements.get(id);
  if (!own) return [];
  const ids = chain && chain.length > 1 && chain.includes(id) ? chain : [id];
  const conn = (eid: number, end: 'i' | 'j') => model.elements.get(eid)?.tensionConnection?.[end];
  if (ids.length === 1) return [{ elementId: id, end: 'i', connection: conn(id, 'i') }, { elementId: id, end: 'j', connection: conn(id, 'j') }];

  const out: MemberEnd[] = [];
  const endAt = (eid: number, node: number): 'i' | 'j' => (model.elements.get(eid)!.nodeI === node ? 'i' : 'j');
  const joined = (eid: number, end: 'i' | 'j') => {
    const e = model.elements.get(eid)!;
    const r = end === 'i' ? e.releaseI : e.releaseJ;
    const jt = end === 'i' ? e.jointI : e.jointJ;
    return !!(r && (r.my || r.mz || r.t || r.slide)) || !!jt?.dof.some(Boolean) || !!e.semiRigid?.[end];
  };
  for (let k = 0; k < ids.length; k++) {
    const e = model.elements.get(ids[k]!)!;
    const prev = k > 0 ? model.elements.get(ids[k - 1]!)! : null;
    const next = k < ids.length - 1 ? model.elements.get(ids[k + 1]!)! : null;
    for (const node of [e.nodeI, e.nodeJ]) {
      const end = endAt(e.id, node);
      const neighbour = [prev, next].find((o) => o && (o.nodeI === node || o.nodeJ === node));
      if (!neighbour) { out.push({ elementId: e.id, end, connection: conn(e.id, end) }); continue; }
      const theirs = endAt(neighbour.id, node);
      if (conn(e.id, end) || joined(e.id, end) || joined(neighbour.id, theirs)) {
        out.push({ elementId: e.id, end, connection: conn(e.id, end) });
      }
    }
  }
  return out;
}

// ─── Presets ────────────────────────────────────────────────────────

export const TENSION_PRESETS = [
  'singleAngle1Line', 'doubleAngleBackToBack', 'iFlangesBolted', 'weldedAllAround', 'gussetWeldedBothSides',
] as const;
export type TensionPreset = (typeof TENSION_PRESETS)[number];

/**
 * What a preset fills: the topology, never a dimension the user did not state. The bolt count,
 * pitch and weld length stay empty until typed — a pitch guessed as 3 d is a fabricated number.
 * The connected element follows the section where the preset names a role ("flanges" of an I,
 * the leg of an angle).
 */
export function presetConnection(p: TensionPreset, shape?: string): EndConnection {
  const leg: ConnectedElements = 'legH';
  const plateLike = shape === 'rect';
  switch (p) {
    case 'singleAngle1Line':
      return { kind: 'bolted', connected: leg, diameterMm: 16, holeKind: 'standard', lines: 1 };
    case 'doubleAngleBackToBack':
      return { kind: 'bolted', connected: leg, holeKind: 'standard', lines: 1 };
    case 'iFlangesBolted':
      return { kind: 'bolted', connected: 'flanges', holeKind: 'standard', lines: 2 };
    case 'weldedAllAround':
      return { kind: 'welded', connected: 'all', weld: 'longitudinalAndTransverse' };
    case 'gussetWeldedBothSides':
      return {
        kind: 'welded', weld: 'longitudinal',
        connected: plateLike ? 'all' : shape === 'L' ? leg : shape === 'T' ? 'flange' : shape === 'I' || shape === 'H' || shape === 'U' ? 'flanges' : 'all',
      };
  }
}
