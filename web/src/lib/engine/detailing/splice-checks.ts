/**
 * The lap splices as BUILT, checked against CIRSOC 201 §25.5 — or held open where they cannot be.
 *
 * ── Why a second pass over the laps exists ─────────────────────────
 *
 * `splice.ts` plans a transition from the layouts' slot positions and `lap-materialize.ts` turns
 * the plan into steel. Neither looked at the steel afterwards, and three of the clauses the plan
 * leans on were never measured on what it produced:
 *
 *   §25.5.1.3  the pitch of a non-contact pair was checked on the SLOTS, across only. The bars
 *              the materialiser pairs are found again from geometry, may sit in different
 *              layers, and the repair ladder moves them after that. `LapInterval.maxOffset` was
 *              recorded and nothing read it.
 *   §25.5.1.2  a contact pair has to be two bars side by side, and the pair has to keep §25.2's
 *              clear distance from its neighbours. A pair laid on ONE centreline — two layouts
 *              putting bars of different diameter at the same slot, or the two lifts of a
 *              column stack putting theirs at the same plan point — is not a contact lap: it is
 *              two solids in one place, with neither the side-by-side shift nor the crank that
 *              would make it a lap modelled. Where the bars sit and what clears what is then
 *              not known, so the clause is not evaluated.
 *   §25.5.2    the lap length the plan earned was taken from one member's depth and materials;
 *              the lap lies in the OTHER member (it runs from the joint into the outgoing span).
 *
 * A column stack's laps were never checked at all. Each lift is filed with its storey's assembly
 * (`levelOf`), the collision engine runs per assembly, and the lower lift's bars that run up a
 * lap length into the storey above are in a different assembly from the bars they lap with.
 *
 * ── What this module does with a check it cannot settle ────────────
 *
 * It reports it, as an open condition with its numbers, scoped to the members that hold the lap.
 * The run puts it on the assembly, the constructibility gate's `noUnsupportedRule` counts it, the
 * document keeps a draft while it is open, and the memoria, the IFC, the workbook and the desk
 * read the member as not conforming. Nothing here passes a lap it did not measure.
 *
 * ── The clauses, as checked here ───────────────────────────────────
 *
 *   §25.5.1.1   no lap for bars of db > 32 mm (25.5.5.3's compression exception is not used).
 *   §25.5.1.2   the two bars of a contact pair must not share a centreline (interpenetration);
 *               in a column, the pair's clear distance to every other bar of the lap section
 *               ≥ §25.2.3 (beams: the collision engine measures it within the level assembly).
 *   §25.5.1.3   non-contact pairs: centre-to-centre ≤ min(ℓst/5, 150 mm), ℓst the REQUIRED lap.
 *   §25.5.1.5   fy > 500 MPa: Ktr ≥ 0,5 db along the lap. Ktr is not computed: held open.
 *   §25.5.2.1   Table 25.5.2.1 — Class B, max(1,3 ℓd, 300 mm). Class A needs As,prov/As,req ≥ 2
 *               at the splice, which the detailing does not establish, so it is never claimed;
 *               Class B is admitted in every row of the table.
 *   §25.5.2.2   bars of different size: max(ℓd of the larger, ℓst of the smaller), which Class B
 *               on the larger bar's ℓd covers (1,3 ℓd,L ≥ ℓd,L and ≥ 1,3 ℓd,s).
 *   §25.5.1.4   ℓd without §25.4.10.1's excess-reinforcement reduction (none is applied here).
 *   §9.7.7.5    in a perimeter beam the negative-moment integrity bars (§9.7.7.1(b): at least a
 *               sixth of the top steel, and two bars, continuous) splice at or near midspan.
 *               A top-face lap at an interior support of a perimeter beam where fewer than two
 *               bars, or less than a sixth of the top steel there, pass through continuous is
 *               a splice of those bars at the support: held open.
 *   INPRES-CIRSOC 103-II §2.2.10.1 / §2.3.13 — a project bound to seismic design: laps lie at
 *               the beam ends and at the foot of each lift, within the potential plastic-hinge
 *               regions where the clauses forbid them (or ask what this app does not model):
 *               held open.
 *
 * Pure: no store, no runes, no i18n.
 */

import type { BarPath, Point3 } from '../../codes/cirsoc201/bar-geometry';
import {
  concreteBelowTopBars, deriveDevelopment, MIN_LAP_MM, topBarFactor, type DevelopmentResult,
} from '../../codes/cirsoc201/anchorage';
import { minClearSpacingColumn } from '../../codes/cirsoc201/spacing';
import { clause, type ClauseRef, type RegulationEdition } from '../../codes/regulation';
import type { UnsupportedCondition } from './assembly';
import { CONTACT_ALLOWANCE } from './classify';
import { MAX_NONCONTACT_PITCH_MM } from './splice';

/** §25.5.1.1 — the largest bar that may be lap spliced, mm. */
export const MAX_LAPPED_DIAMETER_MM = 32;
/** §25.5.1.5 — above this fy a lap needs Ktr ≥ 0,5 db. */
export const KTR_FY_LIMIT_MPA = 500;
/** Table 25.5.2.1 — the Class B factor on ℓd. */
export const CLASS_B_FACTOR = 1.3;

/** The 2025 clause, or the 2005 chapter that holds it (the 2005 numbering is not restated). */
function ref(edition: RegulationEdition, id: string, label: string): ClauseRef {
  if (edition === '2025') return clause('cirsoc-201', edition, id, label);
  const chapter = id.startsWith('9.7.7') ? '7.13' : id.startsWith('25.2') ? '7.6' : id.startsWith('10.7.4') ? '7.8'
    : id.startsWith('10.7.5') ? '12.17' : /25\.5\.2/.test(id) ? '12.15' : '12.14';
  return clause('cirsoc-201', edition, chapter, label);
}

const mm = (m: number) => Math.round(m * 10000) / 10;

/** A member's part in a lap: its depth, its concrete and steel, and its cover/stirrup. */
export interface LapMember {
  h: number;
  fc: number;
  fy: number;
  cover: number;
  stirrupDiaMm: number;
}

/**
 * ℓd for a lap on a beam line, from BOTH members.
 *
 * The planner read the incoming member alone, and the lap does not lie there: it runs from the
 * joint into the outgoing span. ψt (§25.4.2.5) is taken 1,3 when either member is deeper than
 * 300 mm (the planner's own test, now on both), f'c the lower and fy the higher of the two.
 * The favourable row of Table 25.4.2.3 is the run's stated assumption for every development
 * length (§25.2.1 clear spacing ≥ db between the pairs, cover ≥ db, the code's stirrups).
 */
export function lineLapDevelopment(
  a: Pick<LapMember, 'h' | 'fc' | 'fy'>, b: Pick<LapMember, 'h' | 'fc' | 'fy'> | undefined,
  diameterMm: number, edition: RegulationEdition,
): DevelopmentResult {
  const members = b ? [a, b] : [a];
  return deriveDevelopment({
    diameterMm,
    fy: Math.max(...members.map((m) => m.fy)),
    fc: Math.min(...members.map((m) => m.fc)),
    favourableSpacing: true, edition,
    psiT: members.some((m) => m.h > 0.3) ? 1.3 : 1.0,
  });
}

/**
 * The lap length §25.5.2.1/§25.5.2.2 require for two bars, m: Class B on the larger bar's ℓd.
 *
 * ψt is the bar's own: §25.4.2.5's 1,3 for a TOP bar with more than 300 mm of concrete cast
 * below it in either member, 1,0 for a bottom or a vertical bar.
 */
export function requiredLapLength(o: {
  diameterMm: number; members: readonly LapMember[]; face: 'top' | 'bottom' | 'vertical';
  edition: RegulationEdition;
}): { lap: number; ld: number; psiT: number } {
  const psiT = o.face !== 'top' ? 1.0
    : Math.max(...o.members.map((m) => topBarFactor(concreteBelowTopBars(m.h, m.cover, m.stirrupDiaMm, o.diameterMm))));
  const dev = deriveDevelopment({
    diameterMm: o.diameterMm,
    fy: Math.max(...o.members.map((m) => m.fy)),
    fc: Math.min(...o.members.map((m) => m.fc)),
    favourableSpacing: true, edition: o.edition, psiT,
  });
  return { lap: Math.max(CLASS_B_FACTOR * dev.ldM, MIN_LAP_MM / 1000), ld: dev.ldM, psiT };
}

/** The bar's body: its longest straight segment (hooks are extensions and arcs). */
function body(bar: BarPath): { start: Point3; end: Point3 } | null {
  let best: { start: Point3; end: Point3 } | null = null;
  let len = -1;
  for (const s of bar.segments) {
    if (s.kind !== 'straight') continue;
    const l = Math.hypot(s.end.x - s.start.x, s.end.y - s.start.y, s.end.z - s.start.z);
    if (l > len) { len = l; best = { start: s.start, end: s.end }; }
  }
  return best;
}

/**
 * Two bars' shared stretch, measured on their bodies: how long they run side by side and how far
 * apart their centrelines are there (least and greatest over the stretch), m.
 */
export function lapGeometry(a: BarPath, b: BarPath): { overlap: number; minOffset: number; maxOffset: number } | null {
  const pa = body(a), pb = body(b);
  if (!pa || !pb) return null;
  // A cranked bar (§10.7.4.1) laps on the straight run past its bend, not on its body: of the
  // two bars' parallel straight runs, the pair that shares the longest stretch is the lap.
  let best: { overlap: number; minOffset: number; maxOffset: number } | null = null;
  for (const sa of a.segments) {
    if (sa.kind !== 'straight') continue;
    for (const sb of b.segments) {
      if (sb.kind !== 'straight') continue;
      const g = segmentLap({ start: sa.start, end: sa.end }, { start: sb.start, end: sb.end });
      if (g && g.overlap > 1e-9 && (!best || g.overlap > best.overlap)) best = g;
    }
  }
  return best ?? segmentLap(pa, pb);
}

/** Two straight runs' shared stretch: null when they are not parallel (or degenerate). */
function segmentLap(pa: { start: Point3; end: Point3 }, pb: { start: Point3; end: Point3 }): { overlap: number; minOffset: number; maxOffset: number } | null {
  const d = { x: pa.end.x - pa.start.x, y: pa.end.y - pa.start.y, z: pa.end.z - pa.start.z };
  const L = Math.hypot(d.x, d.y, d.z);
  if (L < 1e-9) return null;
  const u = { x: d.x / L, y: d.y / L, z: d.z / L };
  const t = (p: Point3) => (p.x - pa.start.x) * u.x + (p.y - pa.start.y) * u.y + (p.z - pa.start.z) * u.z;
  const tb0 = t(pb.start), tb1 = t(pb.end);
  const lo = Math.max(0, Math.min(tb0, tb1)), hi = Math.min(L, Math.max(tb0, tb1));
  if (hi - lo <= 1e-9) return { overlap: 0, minOffset: Number.POSITIVE_INFINITY, maxOffset: Number.POSITIVE_INFINITY };
  // B's centreline at an along-coordinate of A, and its distance from A's line there.
  const offsetAt = (s: number) => {
    const f = Math.abs(tb1 - tb0) < 1e-12 ? 0 : (s - tb0) / (tb1 - tb0);
    const q = { x: pb.start.x + (pb.end.x - pb.start.x) * f, y: pb.start.y + (pb.end.y - pb.start.y) * f, z: pb.start.z + (pb.end.z - pb.start.z) * f };
    const w = { x: q.x - pa.start.x, y: q.y - pa.start.y, z: q.z - pa.start.z };
    const along = w.x * u.x + w.y * u.y + w.z * u.z;
    return Math.hypot(w.x - along * u.x, w.y - along * u.y, w.z - along * u.z);
  };
  const o0 = offsetAt(lo), o1 = offsetAt(hi);
  return { overlap: hi - lo, minOffset: Math.min(o0, o1), maxOffset: Math.max(o0, o1) };
}

/** Face of a beam bar from its declared layer (`e5:topJ:1` → top), else from its id. */
export function barFace(bar: BarPath): 'top' | 'bottom' | 'vertical' {
  const pa = body(bar);
  if (pa && Math.abs(pa.end.z - pa.start.z) > 0.5 * Math.hypot(pa.end.x - pa.start.x, pa.end.y - pa.start.y, pa.end.z - pa.start.z)) return 'vertical';
  const tag = (bar.layerId?.split(':')[1] ?? bar.id).toLowerCase();
  return tag.includes('top') ? 'top' : 'bottom';
}

export interface ProjectLapContext {
  edition: RegulationEdition;
  /** The project binds seismic design (INPRES-CIRSOC 103): `bentUp.seismicDesign`. */
  seismic: boolean;
}

function condition(
  key: string, elementIds: number[], params: Record<string, string | number>, refs: ClauseRef[],
  message: string,
): UnsupportedCondition {
  return { key: `detailing.lapCheck.${key}`, scope: { elementIds: [...new Set(elementIds)].sort((x, y) => x - y) }, message, params, refs };
}

/**
 * One materialised lap between two bars, checked as built.
 *
 * `members` are the two members the lap joins (the incoming one first). Returns the open
 * conditions; an empty list means every applicable clause was measured and holds.
 */
export function checkLapPair(o: {
  kind: 'beam' | 'column';
  joint: string;
  a: BarPath; b: BarPath;
  elementIds: number[];
  members: readonly LapMember[];
  ctx: ProjectLapContext;
}): UnsupportedCondition[] {
  const out: UnsupportedCondition[] = [];
  const { a, b, ctx } = o;
  const dMax = Math.max(a.diameterMm, b.diameterMm);
  const base = { joint: o.joint, bar: a.id, barB: b.id, diameter: dMax };
  if (dMax > MAX_LAPPED_DIAMETER_MM) {
    out.push(condition('barTooLarge', o.elementIds, { ...base, limit: MAX_LAPPED_DIAMETER_MM },
      [ref(ctx.edition, '25.5.1.1', 'no se empalman por yuxtaposición barras de db > 32 mm')],
      `${a.id}/${b.id}: Ø${dMax} > Ø${MAX_LAPPED_DIAMETER_MM}`));
  }
  const g = lapGeometry(a, b);
  const face = o.kind === 'column' ? 'vertical' : barFace(a);
  const req = requiredLapLength({ diameterMm: dMax, members: o.members, face, edition: ctx.edition });
  if (!g) return out;
  const contact = (a.diameterMm + b.diameterMm) / 2000;
  if (g.minOffset < contact - CONTACT_ALLOWANCE) {
    out.push(condition('unarranged', o.elementIds, {
      ...base, offset: mm(g.minOffset), contact: mm(contact), overlap: mm(g.overlap),
    }, [ref(ctx.edition, '25.5.1.2', 'empalmes por yuxtaposición en contacto'),
      ...(o.kind === 'column' ? [ref(ctx.edition, '10.7.4.1', 'barras desplazadas: pendiente no mayor que 1 en 6')] : [])],
    `${a.id}/${b.id}: ${mm(g.minOffset)} mm < ${mm(contact)} mm`));
  } else if (g.maxOffset > contact + CONTACT_ALLOWANCE) {
    const limit = Math.min(req.lap / 5, MAX_NONCONTACT_PITCH_MM / 1000);
    if (g.maxOffset > limit + 1e-6) {
      out.push(condition('pitch', o.elementIds, { ...base, offset: mm(g.maxOffset), limit: mm(limit), lap: mm(req.lap) },
        [ref(ctx.edition, '25.5.1.3', 'separación transversal de empalmes sin contacto')],
        `${a.id}/${b.id}: ${mm(g.maxOffset)} mm > ${mm(limit)} mm`));
    }
  }
  if (g.overlap < req.lap - 0.001) {
    out.push(condition('short', o.elementIds, {
      ...base, overlap: mm(g.overlap), required: mm(req.lap), ld: mm(req.ld), psiT: req.psiT,
    }, [ref(ctx.edition, 'Tabla 25.5.2.1', 'longitud de empalme por yuxtaposición en tracción'),
      ref(ctx.edition, '25.5.2.2', 'empalme de barras de diferente diámetro')],
    `${a.id}/${b.id}: ${mm(g.overlap)} mm < ${mm(req.lap)} mm`));
  }
  const fy = Math.max(...o.members.map((m) => m.fy));
  if (fy > KTR_FY_LIMIT_MPA) {
    out.push(condition('ktr', o.elementIds, { ...base, fy, limit: KTR_FY_LIMIT_MPA },
      [ref(ctx.edition, '25.5.1.5', 'armadura transversal Ktr ≥ 0,5 db a lo largo del empalme')],
      `${a.id}/${b.id}: fy ${fy} MPa > ${KTR_FY_LIMIT_MPA} MPa`));
  }
  if (ctx.seismic) {
    out.push(condition('seismic', o.elementIds, { ...base, member: o.kind },
      [clause('inpres-cirsoc-103-ii', '2005', o.kind === 'beam' ? '2.2.10.1' : '2.3.13.1',
        o.kind === 'beam' ? 'sin empalmes en la zona de rótula plástica potencial' : 'ubicación de los empalmes en columnas')],
      `${a.id}/${b.id}: ${o.kind}`));
  }
  return out;
}

/** A vertical bar seen in a column's lap section. */
export interface SectionBar {
  id: string;
  x: number; y: number;
  diameterMm: number;
  /** Elevation range of the bar's body. */
  zMin: number; zMax: number;
  /** The lift that owns it. */
  elementId: number;
}

/**
 * The laps at one column floor: every bar the upper lift starts there with, paired with the
 * nearest bar from below that runs on past the floor, checked as one plan section.
 *
 * §25.5.1.2 asks the PAIR to keep §25.2.1 (for a column §25.2.3, which governs its longitudinal
 * bars) from every adjacent bar and splice. The pair's own two bars are checked by
 * `checkLapPair`; here every other bar of the section is measured against each bar of the pair.
 * An upper bar with nothing below it to lap with starts at the floor undeveloped.
 */
export function checkColumnLapSection(o: {
  floorZ: number;
  bars: readonly SectionBar[];
  maxAggregateSizeMm: number;
  ctx: ProjectLapContext;
}): { pairs: Array<{ upper: SectionBar; lower: SectionBar }>; conditions: UnsupportedCondition[] } {
  const eps = 0.01;
  const upper = o.bars.filter((b) => Math.abs(b.zMin - o.floorZ) <= eps && b.zMax > o.floorZ + eps);
  const below = o.bars.filter((b) => b.zMin < o.floorZ - eps && b.zMax > o.floorZ + eps);
  const used = new Set<string>();
  const pairs: Array<{ upper: SectionBar; lower: SectionBar }> = [];
  const conditions: UnsupportedCondition[] = [];
  for (const u of upper) {
    let best: SectionBar | undefined;
    let bestD = Number.POSITIVE_INFINITY;
    for (const l of below) {
      if (used.has(l.id)) continue;
      const d = Math.hypot(l.x - u.x, l.y - u.y);
      if (d < bestD) { bestD = d; best = l; }
    }
    if (!best) {
      conditions.push(condition('noPartner', [u.elementId], { joint: `z${o.floorZ.toFixed(2)}`, bar: u.id, diameter: u.diameterMm },
        [ref(o.ctx.edition, '10.7.5.1.3', 'empalmes de la armadura longitudinal de columnas')],
        `${u.id}: starts at +${o.floorZ.toFixed(2)} m with no bar below to lap with`));
      continue;
    }
    used.add(best.id);
    pairs.push({ upper: u, lower: best });
  }
  // The section the laps stand in: every bar present just above the floor.
  const present = o.bars.filter((b) => b.zMin <= o.floorZ + eps && b.zMax > o.floorZ + eps);
  const partnerOf = new Map<string, string>();
  for (const p of pairs) { partnerOf.set(p.upper.id, p.lower.id); partnerOf.set(p.lower.id, p.upper.id); }
  const reported = new Set<string>();
  for (const p of pairs) {
    for (const m of [p.upper, p.lower]) {
      for (const n of present) {
        if (n.id === m.id || partnerOf.get(m.id) === n.id) continue;
        const key = m.id < n.id ? `${m.id}|${n.id}` : `${n.id}|${m.id}`;
        if (reported.has(key)) continue;
        const clear = Math.hypot(n.x - m.x, n.y - m.y) - (n.diameterMm + m.diameterMm) / 2000;
        const min = minClearSpacingColumn(o.ctx.edition, {
          barDiameterMm: Math.max(n.diameterMm, m.diameterMm), maxAggregateSizeMm: o.maxAggregateSizeMm,
        });
        if (clear < min.minClear - 1e-6) {
          reported.add(key);
          conditions.push(condition('spacing', [p.upper.elementId], {
            joint: `z${o.floorZ.toFixed(2)}`, bar: m.id, barB: n.id, clear: mm(clear), required: mm(min.minClear),
          }, [ref(o.ctx.edition, '25.5.1.2', 'separación libre del empalme a las barras adyacentes'), ...min.refs],
          `${m.id}/${n.id}: ${mm(clear)} mm < ${mm(min.minClear)} mm`));
        }
      }
    }
  }
  return { pairs, conditions };
}

/** A beam in plan, for the perimeter test. */
export interface PlanBeam { id: number; a: { x: number; y: number }; b: { x: number; y: number }; z: number }

/**
 * Is the beam on the structure's perimeter (§9.7.7.1)?
 *
 * From its midpoint, perpendicular in plan, both ways: a side along which no other beam of its
 * level is met is the outside of the floor. A beam with an outside is a perimeter beam. A beam
 * on the edge of an inner opening reads as interior, which is the reading §9.7.7.1 gives a beam
 * framed on both sides.
 */
export function isPerimeterBeam(beam: PlanBeam, all: readonly PlanBeam[]): boolean {
  const dx = beam.b.x - beam.a.x, dy = beam.b.y - beam.a.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-9) return false;
  const m = { x: (beam.a.x + beam.b.x) / 2, y: (beam.a.y + beam.b.y) / 2 };
  const n = { x: -dy / L, y: dx / L };
  const hits = (s: 1 | -1) => all.some((o) => {
    if (o.id === beam.id || Math.abs(o.z - beam.z) > 0.05) return false;
    // Ray m + t·s·n (t > 0) against the segment o.a → o.b.
    const ex = o.b.x - o.a.x, ey = o.b.y - o.a.y;
    const rx = s * n.x, ry = s * n.y;
    const den = rx * ey - ry * ex;
    if (Math.abs(den) < 1e-12) return false;
    const wx = o.a.x - m.x, wy = o.a.y - m.y;
    const t = (wx * ey - wy * ex) / den;
    const v = (wx * ry - wy * rx) / den;
    return t > 0.05 && v >= -1e-9 && v <= 1 + 1e-9;
  });
  return !hits(1) || !hits(-1);
}

/**
 * §9.7.7.5(b) at one interior support of a beam line: a top-face lap there splices the
 * negative-moment integrity steel at the support unless enough top steel runs through it.
 *
 * `continuousTop` are the top bars that pass through the joint (fused); `topAtSupport` the top
 * bars each of the two members brings to the joint, one list per side (a through bar is in both).
 * "Enough" is §9.7.7.1(b)'s floor, measured as a sufficient condition: at least two bars, and a
 * sixth of the top steel PROVIDED at the support, on the side that carries more (a sixth of the
 * provided is at least a sixth of the required). Short of it the splice may still be legal, and
 * it is held open rather than passed.
 */
export function checkIntegritySplice(o: {
  joint: string; elementIds: number[]; perimeter: boolean; topLaps: number;
  continuousTop: readonly { diameterMm: number }[];
  topAtSupport: readonly (readonly { diameterMm: number }[])[];
  edition: RegulationEdition;
}): UnsupportedCondition[] {
  if (!o.perimeter || o.topLaps === 0) return [];
  const area = (bars: readonly { diameterMm: number }[]) => bars.reduce((s, b) => s + Math.PI * (b.diameterMm / 2) ** 2, 0);
  const aCont = area(o.continuousTop), aAll = Math.max(0, ...o.topAtSupport.map(area));
  if (o.continuousTop.length >= 2 && aCont >= aAll / 6 - 1e-9) return [];
  return [condition('integrity', o.elementIds, {
    joint: o.joint, laps: o.topLaps, continuous: o.continuousTop.length,
    continuousArea: Math.round(aCont), supportArea: Math.round(aAll),
  }, [ref(o.edition, '9.7.7.5', 'empalmes de la armadura de integridad: momento negativo en o cerca de la mitad de la luz'),
    ref(o.edition, '9.7.7.1', 'armadura de integridad en vigas perimetrales')],
  `${o.joint}: ${o.topLaps} top lap(s) at the support, ${o.continuousTop.length} bar(s) continuous`)];
}
