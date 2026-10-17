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
 * Pure: no store, no runes, no i18n. Reasons come back as a code plus a Spanish sentence, the
 * checker's language; surfaces translate the code.
 *
 * NOTE for the Rust migration of CIRSOC 301 (PR #298): this module is the whole of D.3/B.4.2.2
 * for the app; port it beside the checker and keep these tests as the oracle.
 */

import { nominalHoleMm, type HoleKind } from '../../connection/bolt-geometry';
import { ALL_PROFILES, profileToSectionFull } from '../../data/steel-profiles';
import { msg, round, type EngineMessage } from '../../codes/message';

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

type Geometry =
  | { kind: 'I' | 'U' | 'T'; h: number; b: number; tw: number; tf: number; count: number }
  | { kind: 'L'; h: number; b: number; t: number; count: number }
  | { kind: 'plate'; w: number; t: number; count: 1 };

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

/** An, U, Ae at one end, with the steps that produced them. Areas m². */
export interface EndNetArea {
  Ag: number;
  An: number;
  U: number;
  Ae: number;
  /** Clause the Ae came from. */
  clause: 'D.3(1)' | 'D.3.1' | 'D.3.3' | 'D.3.4' | 'D.3.5' | 'D.3(2)(a)';
  xBar?: number;
  L?: number;
  steps: string[];
  /** The same steps as engine messages (`steel.tc.calc.*`), for surfaces in the user's language. */
  messages: EngineMessage[];
}

const refuse = (code: RefusalCode, message: string): { refused: Refusal } => ({ refused: { code, message } });
const mm = (v: number, d = 1) => (v * 1000).toFixed(d);
const mm2 = (v: number) => (v * 1e6).toFixed(0);
const f3 = (v: number) => v.toFixed(3);
const r0 = (m2: number) => round(m2 * 1e6, 0);
const r1mm = (m: number) => round(m * 1000, 1);
const r3 = (v: number) => round(v, 3);
const pos = (v: number | undefined): v is number => v !== undefined && Number.isFinite(v) && v > 0;

const byName = new Map(ALL_PROFILES.map((p) => [p.name, p]));

/** The section as elements the clause can name, or why not. */
export function tensionGeometry(s: TensionSectionInput): Geometry | { refused: Refusal } {
  if (s.drawn || s.polygon) return refuse('drawn', 'seccion dibujada o poligonal: sus elementos (alas, alma, alas de angulo) no se pueden identificar para D.3');
  const comp = s.composition;
  if (comp && comp.arrangement !== 'single') {
    if (comp.arrangement !== 'doubleBack') return refuse('builtUp', `barra armada «${comp.arrangement}»: solo se describen pares espalda con espalda`);
    const p = byName.get(comp.profileName);
    if (!p) return refuse('builtUpPart', `perfil componente «${comp.profileName}» no encontrado en el catalogo`);
    const part = profileToSectionFull(p);
    const g = single({ ...part, name: p.name });
    if ('refused' in g) return g;
    if (g.kind !== 'L' && g.kind !== 'U') return refuse('builtUp', 'par espalda con espalda: solo angulos o canales');
    return { ...g, count: 2 };
  }
  return single(s);
}

function single(s: TensionSectionInput): Geometry | { refused: Refusal } {
  switch (s.shape) {
    case undefined: case 'generic':
      return refuse('noShape', 'la seccion no registra su forma: no se sabe que elementos tiene');
    case 'RHS': case 'CHS':
      return refuse('tube', 'tubos: D.3 remite el area neta efectiva al Reglamento CIRSOC 302');
    case 'C': case 'Z':
      return refuse('coldFormed', 'perfil conformado en frio: corresponde el Reglamento CIRSOC 303');
    case 'I': case 'H': case 'U': case 'T': {
      const { h, b, tw, tf } = s;
      if (!pos(h) || !pos(b) || !pos(tw) || !pos(tf)) return refuse('dimensions', 'faltan h, b, tw o tf de la seccion');
      const kind = s.shape === 'H' ? 'I' : s.shape;
      if ((kind === 'T' ? tf : 2 * tf) >= h) return refuse('dimensions', 'tf incompatible con h');
      return { kind, h, b, tw, tf, count: 1 };
    }
    case 'L': {
      const t = pos(s.t) ? s.t : pos(s.tw) && s.tw === s.tf ? s.tw : undefined;
      if (!pos(s.h) || !pos(s.b) || !pos(t)) return refuse('dimensions', 'faltan h, b o t del angulo');
      if (t >= s.h || t >= s.b) return refuse('dimensions', 't del angulo no menor que sus alas');
      return { kind: 'L', h: s.h, b: s.b, t, count: 1 };
    }
    case 'rect': {
      if (!pos(s.h) || !pos(s.b)) return refuse('dimensions', 'faltan b o h de la chapa');
      return { kind: 'plate', w: Math.max(s.b, s.h), t: Math.min(s.b, s.h), count: 1 };
    }
    default:
      return refuse('shape', `forma «${s.shape}» sin elementos definidos para D.3`);
  }
}

/** Allowed connected elements per geometry. */
export function connectedOptions(kind: Geometry['kind']): ConnectedElements[] {
  switch (kind) {
    case 'I': case 'U': return ['flanges', 'web', 'all'];
    case 'T': return ['flange', 'web', 'all'];
    case 'L': return ['legH', 'legB', 'all'];
    case 'plate': return ['all'];
  }
}

/** One element of a section: its gross area, thickness and clear width for holes. Per part (one angle of a pair). */
interface Elem { area: number; t: number; width: number }

/** The elements a connection grips, per part of the section, and x̄ (m) when not all are gripped. */
function connectedParts(g: Geometry, c: ConnectedElements): { conn: Elem[]; other: Elem[]; xBar: number | null } | null {
  if (!connectedOptions(g.kind).includes(c)) return null;
  if (g.kind === 'plate') return { conn: [{ area: g.w * g.t, t: g.t, width: g.w }], other: [], xBar: null };
  if (g.kind === 'L') {
    const legH: Elem = { area: g.h * g.t, t: g.t, width: g.h };
    const legBout: Elem = { area: (g.b - g.t) * g.t, t: g.t, width: g.b };
    if (c === 'all') return { conn: [legH, legBout], other: [], xBar: null };
    const a = c === 'legH' ? g.h : g.b, o = c === 'legH' ? g.b : g.h, t = g.t;
    const A = t * (a + o - t);
    const xBar = (t * (a * t + o * o - t * t)) / (2 * A);
    return {
      conn: [{ area: a * t, t, width: a }],
      other: [{ area: (o - t) * t, t, width: o }],
      xBar,
    };
  }
  const { h, b, tw, tf } = g;
  const flange: Elem = { area: b * tf, t: tf, width: b };
  if (g.kind === 'T') {
    const stem: Elem = { area: (h - tf) * tw, t: tw, width: h - tf };
    if (c === 'all') return { conn: [flange, stem], other: [], xBar: null };
    if (c === 'flange') {
      const xBar = (b * tf * (tf / 2) + (h - tf) * tw * (tf + (h - tf) / 2)) / (b * tf + (h - tf) * tw);
      return { conn: [flange], other: [stem], xBar };
    }
    // Stem: the half on each side of the stem's mid-plane, from that plane.
    const half = (b / 2) * tf + (h - tf) * (tw / 2);
    const xBar = ((b / 2) * tf * (b / 4) + (h - tf) * (tw / 2) * (tw / 4)) / half;
    return { conn: [stem], other: [flange], xBar };
  }
  // I and channel
  const web: Elem = { area: (h - 2 * tf) * tw, t: tw, width: h - 2 * tf };
  if (c === 'all') return { conn: [flange, flange, web], other: [], xBar: null };
  if (c === 'flanges') {
    // The half-section (a tee of depth h/2), from the flange face.
    const stemH = h / 2 - tf;
    const xBar = (b * tf * (tf / 2) + stemH * tw * (tf + stemH / 2)) / (b * tf + stemH * tw);
    return { conn: [flange, flange], other: [web], xBar };
  }
  if (g.kind === 'U') {
    // Channel by its web: the centroid from the back of the web.
    const A = 2 * b * tf + (h - 2 * tf) * tw;
    const xBar = (2 * b * tf * (b / 2) + (h - 2 * tf) * tw * (tw / 2)) / A;
    return { conn: [web], other: [flange, flange], xBar };
  }
  // I by its web: each half (two half-flanges and half the web), from the web's mid-plane.
  const half = b * tf + (h - 2 * tf) * (tw / 2);
  const xBar = (2 * (b / 2) * tf * (b / 4) + (h - 2 * tf) * (tw / 2) * (tw / 4)) / half;
  return { conn: [web], other: [flange, flange], xBar };
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

/**
 * An, U and Ae at one end, for a section whose gross area is `section.a`.
 */
export function endNetArea(section: TensionSectionInput, end: EndConnection): EndNetArea | { refused: Refusal } {
  const g = tensionGeometry(section);
  if ('refused' in g) return g;
  const Ag = section.a;
  if (!pos(Ag)) return refuse('area', 'la seccion no tiene area bruta');
  const parts = connectedParts(g, end.connected);
  if (!parts) return refuse('connectedForShape', `«${CONNECTED_ES[end.connected]}» no es un elemento de esta seccion`);
  const n = g.count;
  const steps: string[] = [];
  steps.push(`  Union: ${describeEnd(end)}`);
  const messages: EngineMessage[] = [msg('steel.tc.calc.connection', { what: describeEndMessage(end) })];
  const Aconn = n * parts.conn.reduce((s, e) => s + e.area, 0);
  const isAll = end.connected === 'all';
  const xBarL = (L: number) => {
    const raw = 1 - parts.xBar! / L;
    let U = Math.min(0.9, raw);
    steps.push(`  U = 1 − x̄/L = 1 − ${mm(parts.xBar!)}/${mm(L, 0)} = ${f3(raw)} ≤ 0,9 → ${f3(U)}  (D.3.2)`);
    messages.push(msg('steel.tc.calc.u', { xBar: r1mm(parts.xBar!), L: round(L * 1000, 0), raw: r3(raw), U: r3(U) }));
    const lower = Math.min(1, Aconn / Ag);
    if (lower > U) {
      U = lower;
      steps.push(`  U ≥ A unida/Ag = ${mm2(Aconn)}/${mm2(Ag)} = ${f3(lower)}  (D.3, secciones abiertas)`);
      messages.push(msg('steel.tc.calc.uFloor', { Aconn: r0(Aconn), Ag: r0(Ag), U: r3(lower) }));
    }
    return U;
  };

  if (end.kind === 'welded') {
    steps.push('  Sin agujeros en la union soldada: An = Ag  (B.4.2.2)');
    messages.push(msg('steel.tc.calc.weldNoHoles'));
    if (g.kind === 'plate' && end.weld === 'longitudinal') {
      const L = pos(end.lengthMm) ? end.lengthMm / 1000 : undefined;
      if (L === undefined) return refuse('weldLength', 'falta la longitud L de los cordones longitudinales (D.3.5)');
      const w = g.w;
      // Compared with a 1e-9 relative tolerance: 0,3 m against 1,5·0,2 m is a boundary of the
      // table, not a float rounding question.
      const atLeast = (k: number) => L >= k * w * (1 - 1e-9);
      if (!atLeast(1)) return refuse('plateWeldShort', `chapa con cordones longitudinales: L = ${mm(L, 0)} mm < w = ${mm(w, 0)} mm, D.3(2)(d) exige L ≥ w`);
      const U = atLeast(2) ? 1 : atLeast(1.5) ? 0.87 : 0.75;
      steps.push(`  Chapa con cordones en ambos bordes: L = ${mm(L, 0)} mm, w = ${mm(w, 0)} mm → U = ${U.toFixed(2)}  (D.3(2)(d))`);
      messages.push(msg('steel.tc.calc.plateTable', { L: round(L * 1000, 0), w: round(w * 1000, 0), U }));
      steps.push(`  Ae = Ag·U = ${mm2(Ag)}·${U.toFixed(2)} = ${mm2(Ag * U)} mm²  (D.3.5)`);
      messages.push(msg('steel.tc.calc.aeAg', { Ag: r0(Ag), U, Ae: r0(Ag * U), clause: 'D.3.5' }));
      return { Ag, An: Ag, U, Ae: Ag * U, clause: 'D.3.5', L, steps, messages };
    }
    if (isAll || g.kind === 'plate') {
      steps.push(`  Todos los elementos unidos: Ae = An = ${mm2(Ag)} mm²  (D.3(1))`);
      messages.push(msg('steel.tc.calc.all', { Ae: r0(Ag) }));
      return { Ag, An: Ag, U: 1, Ae: Ag, clause: 'D.3(1)', steps, messages };
    }
    if (end.weld === 'transverse') {
      steps.push(`  Solo cordones transversales: Ae = A unida = ${mm2(Aconn)} mm², U = 1  (D.3(2)(c), D.3.4)`);
      messages.push(msg('steel.tc.calc.transverse', { Ae: r0(Math.min(Ag, Aconn)) }));
      return { Ag, An: Ag, U: 1, Ae: Math.min(Ag, Aconn), clause: 'D.3.4', steps, messages };
    }
    const L = pos(end.lengthMm) ? end.lengthMm / 1000 : undefined;
    if (L === undefined) return refuse('weldLength', 'falta la longitud L de los cordones longitudinales (D.3.2)');
    steps.push(`  x̄ = ${mm(parts.xBar!)} mm (Figura D.3.1), L = ${mm(L, 0)} mm`);
    messages.push(msg('steel.tc.calc.xBarWeld', { xBar: r1mm(parts.xBar!), L: round(L * 1000, 0) }));
    const U = xBarL(L);
    steps.push(`  Ae = Ag·U = ${mm2(Ag)}·${f3(U)} = ${mm2(Ag * U)} mm²  (D.3(2)(b), D.3.3)`);
    messages.push(msg('steel.tc.calc.aeAg', { Ag: r0(Ag), U: r3(U), Ae: r0(Ag * U), clause: 'D.3.3' }));
    return { Ag, An: Ag, U, Ae: Ag * U, clause: 'D.3.3', xBar: parts.xBar!, L, steps, messages };
  }

  // ── Bolted ──
  const d = end.diameterMm;
  if (!pos(d)) return refuse('diameter', 'falta el diametro del bulon');
  const hole = nominalHoleMm(d, end.holeKind);
  if (hole === null) return refuse('holeNotTabulated', `bulon de ${d} mm: la Tabla J.3.3 no da su agujero`);
  const nb = end.boltsPerLine, nl = end.lines;
  if (!(nb !== undefined && Number.isInteger(nb) && nb >= 1)) return refuse('boltsPerLine', 'falta el numero de bulones por fila (entero ≥ 1)');
  if (!(nl !== undefined && Number.isInteger(nl) && nl >= 1)) return refuse('lines', 'falta el numero de filas por elemento unido (entero ≥ 1)');
  const secondary = isAll && g.kind !== 'plate';
  const nw = secondary ? end.webLines : 0;
  if (secondary && !(nw !== undefined && Number.isInteger(nw) && nw >= 0)) return refuse('webLines', 'todos los elementos unidos: falta el numero de filas en el alma (o en la otra ala)');
  if (nb >= 2 && !pos(end.pitchMm)) return refuse('pitch', 'falta el paso entre bulones a lo largo de la fuerza');
  const dh = (hole + 2) / 1000;
  steps.push(`  Agujero: ${hole} mm (Tabla J.3.3) + 2 mm = ${mm(dh)} mm  (B.4.2.2)`);
  messages.push(msg('steel.tc.calc.hole', { hole, dh: r1mm(dh) }));

  // Which elements carry the `nl` lines, and which carry the secondary ones.
  const lineElems: Elem[] = secondary
    ? (g.kind === 'L' ? [parts.conn[0]!] : parts.conn.filter((e) => e !== parts.conn[parts.conn.length - 1]))
    : parts.conn;
  const webElem: Elem | null = secondary ? parts.conn[parts.conn.length - 1]! : null;

  let stagger: { s: number; g: number } | null = null;
  if (end.stagger) {
    if (secondary && (nw ?? 0) > 0) return refuse('staggerWithWebLines', 'tresbolillo combinado con filas en el alma: cadenas no cubiertas');
    const { sMm, gMm } = end.stagger;
    if (!pos(sMm) || !pos(gMm)) return refuse('stagger', 'tresbolillo sin s o g');
    if (nl < 2) return refuse('stagger', 'tresbolillo con una sola fila');
    stagger = { s: sMm / 1000, g: gMm / 1000 };
  }

  let deduct = 0;
  for (const e of lineElems) {
    if (nl * dh >= e.width) return refuse('holesDoNotFit', `${nl} agujeros de ${mm(dh)} mm no caben en un elemento de ${mm(e.width, 0)} mm`);
    const straight = (stagger ? Math.ceil(nl / 2) : nl) * dh * e.t;
    let worst = straight;
    if (stagger) {
      const zig = nl * dh * e.t - (nl - 1) * (stagger.s * stagger.s * e.t) / (4 * stagger.g);
      steps.push(`  Cadena recta: ${Math.ceil(nl / 2)}·${mm(dh)}·${mm(e.t)} = ${mm2(straight)} mm²; en zigzag: ${nl}·${mm(dh)}·${mm(e.t)} − ${nl - 1}·s²t/4g = ${mm2(zig)} mm²  (B.4.2.2)`);
      messages.push(msg('steel.tc.calc.chains', { straight: r0(straight), zig: r0(zig) }));
      worst = Math.max(straight, zig);
    }
    deduct += worst;
  }
  if (webElem && (nw ?? 0) > 0) {
    if (nw! * dh >= webElem.width) return refuse('holesDoNotFit', `${nw} agujeros de ${mm(dh)} mm no caben en un elemento de ${mm(webElem.width, 0)} mm`);
    deduct += nw! * dh * webElem.t;
  }
  deduct *= n;
  const An = Ag - deduct;
  steps.push(`  An = Ag − Σ agujeros = ${mm2(Ag)} − ${mm2(deduct)} = ${mm2(An)} mm²  (B.4.2.2)`);
  messages.push(msg('steel.tc.calc.an', { Ag: r0(Ag), deduct: r0(deduct), An: r0(An) }));
  if (!(An > 0)) return refuse('netArea', 'An ≤ 0');

  if (isAll || g.kind === 'plate') {
    steps.push(`  Todos los elementos unidos: Ae = An = ${mm2(An)} mm²  (D.3(1))`);
    messages.push(msg('steel.tc.calc.all', { Ae: r0(An) }));
    return { Ag, An, U: 1, Ae: An, clause: 'D.3(1)', steps, messages };
  }
  if (nb === 1) {
    // «Si existe sólo una fila de bulones Ae = área neta de los elementos directamente unidos».
    const Ae = Math.min(An, Aconn - deduct);
    if (!(Ae > 0)) return refuse('netArea', 'area neta de los elementos unidos ≤ 0');
    steps.push(`  Un solo bulon por fila: Ae = A neta de los elementos unidos = ${mm2(Aconn)} − ${mm2(deduct)} = ${mm2(Ae)} mm²  (D.3(2)(a))`);
    messages.push(msg('steel.tc.calc.oneBolt', { Aconn: r0(Aconn), deduct: r0(deduct), Ae: r0(Ae) }));
    return { Ag, An, U: Ae / An, Ae, clause: 'D.3(2)(a)', steps, messages };
  }
  const L = (nb - 1) * end.pitchMm! / 1000;
  steps.push(`  x̄ = ${mm(parts.xBar!)} mm (Figura D.3.1), L = (${nb} − 1)·${end.pitchMm} = ${mm(L, 0)} mm`);
  messages.push(msg('steel.tc.calc.xBarBolt', { xBar: r1mm(parts.xBar!), n: nb, pitch: end.pitchMm!, L: round(L * 1000, 0) }));
  const U = xBarL(L);
  steps.push(`  Ae = An·U = ${mm2(An)}·${f3(U)} = ${mm2(An * U)} mm²  (D.3(2)(a), D.3.1)`);
  messages.push(msg('steel.tc.calc.aeAn', { An: r0(An), U: r3(U), Ae: r0(An * U) }));
  return { Ag, An, U, Ae: An * U, clause: 'D.3.1', xBar: parts.xBar!, L, steps, messages };
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
  const steps: string[] = [];
  const missing = ends.filter((e) => !e.connection);
  if (missing.length > 0) {
    return { missing, steps: [`  Falta la union extrema en: ${missing.map(label).join('; ')}`] };
  }
  const perEnd: Array<{ at: MemberEnd; result: EndNetArea }> = [];
  const messages: EngineMessage[] = [];
  for (const at of ends) {
    const r = endNetArea(section, at.connection!);
    if ('refused' in r) return { refused: r.refused, at, steps: [`  ${label(at)}: ${r.refused.message}`] };
    steps.push(`  — ${label(at)}:`, ...r.steps);
    messages.push(msg('steel.tc.calc.end', { id: at.elementId, end: at.end.toUpperCase() }), ...r.messages);
    perEnd.push({ at, result: r });
  }
  if (perEnd.length === 0) return { missing: [], steps: ['  Sin extremos que describir'] };
  const gov = perEnd.reduce((m, p) => (p.result.Ae < m.result.Ae ? p : m), perEnd[0]!);
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
