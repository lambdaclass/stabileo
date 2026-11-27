import type { PressureField } from '../engine/foundation/pressure-field';
import { gammaV, type Side } from '../engine/detailing/punching-moment';
import { PHI_SHEAR, sqrtFcCapped } from '../engine/detailing/punching-shear';
import { barArea } from './bars';
import { alphaOfSides, ceilTo, footingPunching, plainPunchingVc, r3, soilInside, type FootingPlan } from './footing-mechanics';
import type { FootingAction, PunchingCage, PunchingDrop, PunchingFix, PunchingSection } from './footing-types';

/** One combination as a column punches its footing: the soil under the whole base and the column's action at its node. */
export interface PunchingCase { f: PressureField; a: FootingAction; combo: string }

/**
 * Where a column punches its footing: the footing's plan with the column in it, d, from the node
 * down to the footing's top (`stub`), concrete and steel, MPa, thickness and cover, and how far a
 * drop may run past the column's faces before it meets another column, m.
 */
export interface PunchingSite { plan: FootingPlan; d: number; stub: number; fc: number; fy: number; h: number; cover: number; reach: number }

export interface PunchingReading {
  vu: number; phiVc: number; utilization: number; bo: number; position: 'interior' | 'edge' | 'corner'; combo: string;
  sections: PunchingSection[];
  fix?: PunchingFix; vs?: number; ceiling?: number; legs?: number;
}

type Rect = { x0: number; x1: number; y0: number; y1: number };

/** Leg diameters stirrups for punching are chosen from, mm. */
export const LEG_DIAMETERS: readonly number[] = [10, 12, 16, 20];
/** Legs no closer than this along a line, m: room to place them and pour between. */
const MIN_GAP = 0.1;
/** A leg stands this far inside the footing's sides past the cover, m: within the meshes' outer bars. */
export const LEG_INSET = 0.05;
const MAX_LINES = 40, MAX_DROP = 1.5, STEP = 0.05;

export const columnRect = (p: FootingPlan): Rect => ({ x0: p.xc - p.b / 2, x1: p.xc + p.b / 2, y0: p.yc - p.h / 2, y1: p.yc + p.h / 2 });
const grow = (r: Rect, a: number): Rect => ({ x0: r.x0 - a, x1: r.x1 + a, y0: r.y0 - a, y1: r.y1 + a });
const clip = (r: Rect, X: number, Y: number): Rect => ({ x0: Math.max(r.x0, -X), x1: Math.min(r.x1, X), y0: Math.max(r.y0, -Y), y1: Math.min(r.y1, Y) });

/** A drop's plan, m from the footing's centroid: the column's grown by `w`, within the footing. */
export const dropRect = (p: FootingPlan, drop: PunchingDrop): Rect => clip(grow(columnRect(p), drop.w), p.B / 2, p.L / 2);

/** A rectangle's sides as a critical section inside the plan less `inset`: a side at or past an edge is left out, the others cut at the edges. */
export function sidesIn(r: Rect, B: number, L: number, inset = 0): Side[] {
  const X = B / 2 - inset, Y = L / 2 - inset;
  const c = clip(r, X, Y);
  if (c.x1 - c.x0 < 1e-9 || c.y1 - c.y0 < 1e-9) return [];
  const out: Side[] = [];
  if (r.y0 > -Y + 1e-6) out.push({ x0: c.x0, y0: r.y0, x1: c.x1, y1: r.y0 });
  if (r.y1 < Y - 1e-6) out.push({ x0: c.x0, y0: r.y1, x1: c.x1, y1: r.y1 });
  if (r.x0 > -X + 1e-6) out.push({ x0: r.x0, y0: c.y0, x1: r.x0, y1: c.y1 });
  if (r.x1 < X - 1e-6) out.push({ x0: r.x1, y0: c.y0, x1: r.x1, y1: c.y1 });
  return out;
}

const lenOf = (s: Side) => Math.hypot(s.x1 - s.x0, s.y1 - s.y0);

/**
 * The largest shear stress on a section of these sides, MPa (§8.4.4.2): Vu over bo·d and the
 * moments about the section's centroid, the column's own and Vu times its offset from the column,
 * each carried by eccentric shear in γv on Jc of the sides as laid.
 */
export function sectionStress(sides: readonly Side[], d: number, Vu: number, Mx: number, My: number, xc: number, yc: number): { vu: number; bo: number } {
  const bo = sides.reduce((t, s) => t + lenOf(s), 0);
  if (!(bo > 1e-9)) return { vu: 0, bo: 0 };
  const cx = sides.reduce((t, s) => t + lenOf(s) * (s.x0 + s.x1) / 2, 0) / bo, cy = sides.reduce((t, s) => t + lenOf(s) * (s.y0 + s.y1) / 2, 0) / bo;
  let JcY = 0, JcX = 0;
  for (const s of sides) {
    const L = lenOf(s), mx = (s.x0 + s.x1) / 2 - cx, my = (s.y0 + s.y1) / 2 - cy, alongX = Math.abs(s.y1 - s.y0) < 1e-12;
    JcY += alongX ? d * L ** 3 / 12 + L * d ** 3 / 12 + d * L * mx * mx : d * L * mx * mx;
    JcX += alongX ? d * L * my * my : d * L ** 3 / 12 + L * d ** 3 / 12 + d * L * my * my;
  }
  const xs = sides.flatMap((s) => [s.x0, s.x1]), ys = sides.flatMap((s) => [s.y0, s.y1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const b1x = Math.max(x1 - x0, d), b2y = Math.max(y1 - y0, d);
  const MscY = Math.abs(My) + Math.abs(Vu * (cx - xc)), MscX = Math.abs(Mx) + Math.abs(Vu * (cy - yc));
  const vMy = JcY > 1e-12 ? (gammaV(b1x, b2y) * MscY * Math.max(x1 - cx, cx - x0)) / JcY : 0;
  const vMx = JcX > 1e-12 ? (gammaV(b2y, b1x) * MscX * Math.max(y1 - cy, cy - y0)) / JcX : 0;
  return { vu: (Vu / (bo * d) + vMy + vMx) / 1000, bo };
}

/** vc of Table 22.6.5.2 for a loaded area of these proportions and a section of these sides, MPa (λs = 1, §13.2.6.2(b)). */
const plainVc = (fc: number, r: Rect, sides: readonly Side[], d: number, bo: number): number => {
  const beta = Math.max(r.x1 - r.x0, r.y1 - r.y0) / Math.max(1e-9, Math.min(r.x1 - r.x0, r.y1 - r.y0));
  return plainPunchingVc(fc, beta, alphaOfSides(sides.length), d, bo);
};

/** A section `dist` past a loaded area's faces (the column's, or a drop's), read in every combination: the worst against φ·vc, vc given by `vcOf`. */
function outerReading(cases: readonly PunchingCase[], s: PunchingSite, area: Rect, dist: number, d: number, at: PunchingSection['at'], vcOf: (sides: readonly Side[], bo: number) => number): PunchingSection | null {
  const p = s.plan, r = grow(area, dist), sides = sidesIn(r, p.B, p.L);
  if (!sides.length) return null;
  const inside = clip(r, p.B / 2, p.L / 2);
  let worst: PunchingSection | null = null;
  for (const k of cases) {
    const Vu = Math.max(0, k.a.N - soilInside(k.f, inside));
    const st = sectionStress(sides, d, Vu, k.a.Mx - s.stub * k.a.Vy, k.a.My + s.stub * k.a.Vx, p.xc, p.yc);
    const phiV = PHI_SHEAR * vcOf(sides, st.bo);
    if (!worst || st.vu / phiV > worst.vu / worst.phiV) worst = { at, vu: st.vu, phiV, bo: st.bo, d, combo: k.combo };
  }
  return worst;
}

/** Each line's legs, m from the footing's centroid, with the way to the column a leg's hooks turn: legs spread evenly along the line's sides inside the footing, never more than 2d apart (§8.7.6.3). */
export function cageLegs(p: FootingPlan, d: number, cover: number, cage: PunchingCage): Array<Array<{ x: number; y: number; toward: [number, number] }>> {
  const col = columnRect(p), out: Array<Array<{ x: number; y: number; toward: [number, number] }>> = [];
  for (let k = 0; k < cage.lines; k++) {
    const sides = sidesIn(grow(col, cage.first + k * cage.spacing), p.B, p.L, cover + LEG_INSET);
    const total = sides.reduce((t, s) => t + lenOf(s), 0);
    if (!(total > 1e-9)) { out.push([]); continue; }
    const g = Math.min(total / Math.max(1, cage.legs), 2 * d);
    const line: Array<{ x: number; y: number; toward: [number, number] }> = [];
    for (const s of sides) {
      const L = lenOf(s), n = Math.max(1, Math.ceil(L / g - 1e-9));
      const alongX = Math.abs(s.y1 - s.y0) < 1e-12;
      const toward: [number, number] = alongX ? [0, s.y0 < p.yc ? 1 : -1] : [s.x0 < p.xc ? 1 : -1, 0];
      for (let j = 0; j < n; j++) { const t = (j + 0.5) / n; line.push({ x: s.x0 + (s.x1 - s.x0) * t, y: s.y0 + (s.y1 - s.y0) * t, toward }); }
    }
    out.push(line);
  }
  return out;
}

/**
 * Punching at a column in every combination, with what carries it where it has one: stirrups
 * (vc = 0,17·√f'c plus vs = Av·fyt/(bo·s), vu ≤ φ·0,5·√f'c, §22.6.6.1, §22.6.6.3, §22.6.7.2, and
 * the section d/2 past the outermost line with 0,17·√f'c, §22.6.4.2), or a drop under it (the
 * section d/2 from the column on the drop's depth and d/2 past its edges on the base's, §22.6.4.1).
 */
export function punchingReading(cases: readonly PunchingCase[], s: PunchingSite, fix?: PunchingFix): PunchingReading | null {
  if (!cases.length) return null;
  const p = s.plan, root = sqrtFcCapped(s.fc);
  const dIn = s.d + (fix?.drop?.hd ?? 0);
  let col: (ReturnType<typeof footingPunching> & { combo: string }) | null = null;
  for (const k of cases) { const r = footingPunching(k.f, p, dIn, k.a, s.stub, s.fc); if (!col || r.vu > col.vu) col = { ...r, combo: k.combo }; }
  const c = col!;
  let phiV = c.phiVc, vs: number | undefined, ceiling: number | undefined, legs: number | undefined;
  const sections: PunchingSection[] = [];
  if (fix?.cage) {
    const lines = cageLegs(p, s.d, s.cover, fix.cage);
    const placed = lines.filter((l) => l.length);
    legs = placed.length ? Math.min(...placed.map((l) => l.length)) : 0;
    vs = (legs * barArea(fix.cage.dia) * 100 * s.fy) / (c.bo * 1000 * fix.cage.spacing * 1000);
    phiV = PHI_SHEAR * (0.17 * root + vs);
    ceiling = PHI_SHEAR * 0.5 * root;
  }
  sections.push({ at: 'column', vu: c.vu, phiV, bo: c.bo, d: dIn, combo: c.combo });
  if (fix?.cage) {
    const o = outerReading(cases, s, columnRect(p), fix.cage.first + (fix.cage.lines - 1) * fix.cage.spacing + s.d / 2, s.d, 'outer', () => 0.17 * root);
    if (o) sections.push(o);
  }
  if (fix?.drop) {
    const area = grow(columnRect(p), fix.drop.w);
    const o = outerReading(cases, s, area, s.d / 2, s.d, 'drop', (sides, bo) => plainVc(s.fc, area, sides, s.d, bo));
    if (o) sections.push(o);
  }
  const utilization = Math.max(...sections.map((x) => x.vu / x.phiV), ceiling ? c.vu / ceiling : 0);
  return {
    vu: c.vu, phiVc: phiV, utilization, bo: c.bo, position: c.position, combo: c.combo, sections,
    ...(fix ? { fix } : {}), ...(vs !== undefined ? { vs, ceiling, legs } : {}),
  };
}

/**
 * Stirrups for punching where they carry it (§22.6.7): only where d ≥ 150 mm and 16 leg
 * diameters (§22.6.7.1) and vu ≤ φ·0,5·√f'c (§22.6.6.3); lines no more than d/2 apart, the first
 * at half that from the faces (§8.7.6.3); the widest spacing and then the thinnest legs that fit
 * no closer than 10 cm, and as many lines as the section past them needs. Null where none does.
 */
export function designCage(cases: readonly PunchingCase[], s: PunchingSite): PunchingCage | null {
  const plain = punchingReading(cases, s);
  if (!plain || plain.utilization <= 1 + 1e-9) return null;
  const root = sqrtFcCapped(s.fc);
  if (plain.vu > PHI_SHEAR * 0.5 * root + 1e-9 || s.d < 0.15 - 1e-9) return null;
  const steelStress = Math.max(0, plain.vu / PHI_SHEAR - 0.17 * Math.sqrt(Math.min(s.fc, 70)));
  const top = Math.floor(s.d / 2 / 0.025 + 1e-9) * 0.025;
  for (let sp = top; sp >= 0.1 - 1e-9; sp = r3(sp - 0.025)) {
    const requiredArea = (steelStress * plain.bo * sp / s.fy) * 1e6;
    for (const dia of LEG_DIAMETERS) {
      if (s.d < (16 * dia) / 1000 - 1e-9) continue;
      const cage: PunchingCage = { dia, spacing: r3(sp), first: r3(sp / 2), lines: 1, legs: Math.max(2, Math.ceil(requiredArea / (barArea(dia) * 100) - 1e-9)) };
      const first = cageLegs(s.plan, s.d, s.cover, cage)[0] ?? [];
      const total = sidesIn(grow(columnRect(s.plan), cage.first), s.plan.B, s.plan.L, s.cover + LEG_INSET).reduce((t, x) => t + lenOf(x), 0);
      if (!first.length || total / first.length < MIN_GAP - 1e-9) continue;
      for (let n = 1; n <= MAX_LINES; n++) {
        const c = { ...cage, lines: n };
        const rd = punchingReading(cases, s, { cage: c });
        if (rd && rd.utilization <= 1 + 1e-9) return c;
        if (rd && rd.sections.every((x) => x.at !== 'outer')) break;
      }
      break;
    }
  }
  return null;
}

/**
 * A drop under the column where nothing else carries it (§22.6.4.1(b); GA §7.2, a capital below):
 * the shallowest, then the narrowest, that carries the section d/2 from the column on the drop's
 * depth, running past the faces at least half that depth, and the section d/2 past its edges on
 * the base's. Null where none within 1,5 m deep and its reach does.
 */
export function designDrop(cases: readonly PunchingCase[], s: PunchingSite): PunchingDrop | null {
  for (let hd = 0.1; hd <= MAX_DROP + 1e-9; hd = r3(hd + STEP)) {
    const inner = punchingReading(cases, s, { drop: { w: s.reach, hd } });
    if (!inner || inner.sections[0]!.vu > inner.sections[0]!.phiV + 1e-9) continue;
    for (let w = ceilTo((s.d + hd) / 2, STEP); w <= s.reach + 1e-9; w = r3(w + STEP)) {
      const rd = punchingReading(cases, s, { drop: { w, hd } });
      if (rd && rd.utilization <= 1 + 1e-9) return { w, hd };
    }
  }
  return null;
}

/** The stirrups, else the drop, a column needs for punching; undefined where the concrete carries it, null where neither does. */
export function designPunchingFix(cases: readonly PunchingCase[], s: PunchingSite, stirrups: boolean): PunchingFix | undefined | null {
  const plain = punchingReading(cases, s);
  if (!plain || plain.utilization <= 1 + 1e-9) return undefined;
  const cage = stirrups ? designCage(cases, s) : null;
  if (cage) return { cage };
  const drop = designDrop(cases, s);
  return drop ? { drop } : null;
}
