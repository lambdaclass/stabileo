/**
 * A stair in the reinforcement sheets: the one-way slab it is, spanning in the direction one walks
 * it, designed per metre of width as a simply supported horizontal beam with the factored load on
 * its plan (HA FIUBA §4.2), the lever arm read across the waist, the slab's worst section (§13.4),
 * and barred as the course's detail draws it (§13.4, p. 104):
 *
 * - the bottom bars bend without a break at the foot of the flight, where the bend pushes into the
 *   concrete;
 * - at its head, where a bent bar would pull out through the cover, they do not bend: the flight's
 *   bars run on up to the landing's top and anchor there, the landing's run down into the flight,
 *   and the two cross;
 * - a bar that reaches a support goes into it to the cover and ends in a leg turned into the slab;
 * - a stair cast with its supports takes top bars over each for wu·ℓn²/24;
 * - distribution bars across, under the main ones and under the top ones apart.
 *
 * The loads, moments, reactions and thickness are the desk's stair (`engine/design/slabs/stairs.ts`),
 * which reads CIRSOC 201: the sheets design stairs under it and ACI 318, whose provisions there are
 * the same, and say so under the others. m, kN, MPa.
 */
import { stairDesign, type StairDesign, type StairDesignSpec } from '../engine/design/slabs/stairs';
import { slabVc } from '../engine/design/slabs/one-way-shear';
import { treadCount } from '../model/stair';
import { barArea } from './bars';
import { cirsocSlabDevelopment } from './slab-row';
import type { Fmt } from './format';
import type { BarShape } from './shape';
import { check, ratioOf, type CheckLine, type RowStatus, type SheetCode, type StepGroup } from './types';

/** The codes the stairs are designed under. */
export const STAIR_CODES: readonly SheetCode[] = ['cirsoc201-2025', 'aci318-19'];

/** A stair as the sheets find it: the desk's, or a flight built in the model, and where it stands. */
export interface StairDemand {
  key: string; name: string; level?: string;
  source: 'desk' | 'model';
  spec: StairDesignSpec;
  /** The foot of the flight's run in plan and height, m, and the way up the run, a unit vector in plan. Null for a desk stair with no flight in the model. */
  place: { x: number; y: number; z: number; dir: { x: number; y: number } } | null;
  /** The model's shells of its flight. */
  quads: number[];
  /** What was presumed rather than read: i18n keys. */
  presumed: string[];
}

export interface StairContext { fc: number; fy: number; cover: number; diameters: readonly number[] }

/** The bars a stair is given: main bars below, top bars over the supports, distribution across. */
export interface StairAdopted {
  main: { dia: number; spacing: number };
  top?: { dia: number; spacing: number };
  dist: { dia: number; spacing: number };
}

export type StairBarRole = 'main' | 'landing' | 'topFoot' | 'topFootFlight' | 'topHead' | 'dist' | 'distTop';

/** One position of bars: its shape in the stair's section, m along the run from the foot support and up from the foot landing's top, and how many across. */
export interface StairBar {
  mark: string; role: StairBarRole; dia: number; spacing: number; count: number;
  shape: BarShape;
  /** For a bar across the width: where its rows stand in the section, m. */
  rows?: Array<[number, number]>;
  length: number;
}

/** The stair's section: its concrete outline and the lines its layers run on, m. */
export interface StairSection { outline: Array<[number, number]>; run: number; rise: number; landingBottom: number; landingTop: number; tl: number; tv: number; angle: number }

export interface StairRow {
  family: 'stair';
  key: string; name: string; level?: string;
  demand: StairDemand;
  design: StairDesign | null;
  section: StairSection;
  proposed: StairAdopted;
  adopted: StairAdopted;
  isAdopted: boolean;
  bars: StairBar[];
  ld: number;
  verifications: CheckLine[];
  status: RowStatus;
  utilization: number;
  steps: StepGroup[];
  /** Set when the project's code is not one the stairs are designed under. */
  unsupported?: SheetCode;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const PHI_FLEX = 0.9, PHI_SHEAR = 0.75;

/** The largest spacing in 25 mm steps giving `as`, m²/m, with bars of `dia`, within `max`. */
const spacingFor = (as: number, dia: number, max: number) => Math.max(0.075, Math.min(max, Math.floor((barArea(dia) * 1e-4) / Math.max(as, 1e-9) / 0.025 + 1e-9) * 0.025));
const perMetre = (b: { dia: number; spacing: number }) => (barArea(b.dia) * 1e-4) / b.spacing;
const phiMn = (as: number, d: number, c: StairContext) => { const a = (as * c.fy) / (0.85 * c.fc); return PHI_FLEX * as * c.fy * (d - a / 2) * 1000; };

/** The lightest diameter of those offered whose spacing for `as` is 10 cm or more, else the largest. */
function pick(as: number, sMax: number, diameters: readonly number[], least: number): { dia: number; spacing: number } {
  const list = [...diameters].filter((d) => d >= least).sort((a, b) => a - b);
  const all = list.length ? list : [Math.max(least, 10)];
  for (const dia of all) { const s = spacingFor(as, dia, sMax); if (s >= 0.1 - 1e-9 && perMetre({ dia, spacing: s }) >= as - 1e-12) return { dia, spacing: s }; }
  const dia = all[all.length - 1]!;
  return { dia, spacing: spacingFor(as, dia, sMax) };
}

/**
 * The stair's section: the landings, the flight's steps and its waist, in the plane of its run. The
 * waist runs at the steps' slope, riser over tread, its top through their inner corners; it meets
 * the head landing's soffit past the last riser.
 */
export function stairSection(spec: StairDesignSpec): StairSection {
  const treads = treadCount(spec.steps), run = treads * spec.tread, rise = spec.steps * spec.riser;
  const m = spec.riser / spec.tread, angle = Math.atan(m), tv = spec.waist * Math.hypot(1, m);
  const tl = spec.landingThickness ?? spec.waist, Lb = spec.landingBottom, Lt = spec.landingTop, end = Lb + run + Lt;
  const sA = Lb + (tv - tl) / m, sB = Math.min(end, Lb + (rise - tl + tv) / m);
  const out: Array<[number, number]> = [[0, 0], [Lb, 0]];
  let s = Lb, z = 0;
  for (let i = 0; i < spec.steps; i++) { z += spec.riser; out.push([s, z]); if (i < treads) { s += spec.tread; out.push([s, z]); } }
  out.push([end, rise], [end, rise - tl]);
  if (sB < end - 1e-6) out.push([sB, rise - tl]);
  else out.push([end, (end - Lb) * m - tv]);
  out.push([Math.min(sA, Lb + 1e-6) < 0 ? 0 : sA, -tl], [0, -tl]);
  return { outline: out.map(([a, b]) => [r3(a), r3(b)] as [number, number]), run, rise, landingBottom: Lb, landingTop: Lt, tl, tv, angle };
}

const lengthOf = (pts: ReadonlyArray<[number, number]>) => pts.slice(1).reduce((t, p, i) => t + Math.hypot(p[0] - pts[i]![0], p[1] - pts[i]![1]), 0);

/**
 * The bars, in the section: s along the run from the foot support, z up from the foot landing's top.
 * As the course and the stair detail draw them, the bars cross at the head:
 *
 * - the flight's bottom bar comes in along the foot landing's soffit, bends up at the foot of the
 *   flight where the bend pushes into the concrete, runs up the waist and on, past the last riser,
 *   to the head landing's top, where it runs ld or to the support and turns a leg down;
 * - the head landing's bottom bar comes from its support along its soffit to where the flight's
 *   top layer meets it, and runs up that layer ld into the flight;
 * - a stair cast with its supports takes top bars over each, ℓn/4 + ld from the support: at the foot
 *   along the landing's top and on up the flight's top layer, at the head along the landing's top as
 *   far as the last riser, the landing's bottom bar crossing up the flight's top layer past it;
 * - distribution bars across, on the bottom bars and under the top ones.
 *
 * Every bar keeps to the concrete: the waist's layers are parallel to its soffit and to the line
 * of the steps' inner corners.
 */
export function stairBars(spec: StairDesignSpec, sec: StairSection, a: StairAdopted, c: StairContext, ld: number, monolithic: boolean): StairBar[] {
  const db = a.main.dia / 1000, e = c.cover + db / 2, w = spec.width, m = Math.tan(sec.angle), root = Math.hypot(1, m), cos = 1 / root, sin = m / root;
  const Lb = sec.landingBottom, Lt = sec.landingTop, run = sec.run, rise = sec.rise, tl = sec.tl, end = Lb + run + Lt, tv = sec.tv;
  const soffitBar = (s: number) => (s - Lb) * m - tv + e * root;
  const onSoffit = (z: number) => Lb + (z + tv - e * root) / m;
  const count = (b: { dia: number; spacing: number }) => Math.floor((w - 2 * c.cover - b.dia / 1000) / b.spacing + 1e-9) + 1;
  const bars: StairBar[] = [];
  const push = (role: StairBarRole, b: { dia: number; spacing: number }, pts: Array<[number, number]>, n = count(b)) => {
    const p = pts.map(([x, y]) => [r3(x), r3(y)] as [number, number]);
    bars.push({ mark: '', role, dia: b.dia, spacing: b.spacing, count: n, shape: { pts: p, mandrel: (6 * b.dia) / 1000, dia: b.dia }, length: r3(lengthOf(p)) });
  };
  const along = (from: [number, number], len: number, dir: 1 | -1): [number, number] => [from[0] + dir * len * cos, from[1] + dir * len * sin];
  const legBottom = tl - 2 * e, sEnd = end - e;
  const main: Array<[number, number]> = [];
  if (Lb > 0) main.push([e, -tl + e + legBottom], [e, -tl + e], [onSoffit(-tl + e), -tl + e]);
  else { const z0 = soffitBar(e); main.push([e + legBottom * sin, z0 + legBottom * cos], [e, z0]); }
  const zCap = rise - e;
  if (Lt > 0) {
    const xt = onSoffit(zCap);
    if (xt >= sEnd) main.push([sEnd, soffitBar(sEnd)], [sEnd, zCap]);
    else if (xt + ld <= sEnd) main.push([xt, zCap], [xt + ld, zCap]);
    else main.push([xt, zCap], [sEnd, zCap], [sEnd, zCap - legBottom]);
  } else {
    const s1 = Lb + run - e, z1 = soffitBar(s1);
    main.push([s1, z1], [s1 - legBottom * sin, z1 + legBottom * cos]);
  }
  push('main', a.main, main);
  const topLine = (s: number, et: number) => (s - Lb) * m - et * root;
  const onTopLine = (z: number, et: number) => Lb + (z + et * root) / m;
  let crossRun: Array<[number, number]> = [];
  if (Lt > 0) {
    const zb = rise - tl + e, xx = Math.min(onTopLine(zb, e), sEnd), lo = Lb + 0.05;
    const start = along([xx, zb], Math.min(ld, Math.max(0, (xx - lo) / cos)), -1);
    push('landing', a.main, [start, [xx, zb], [sEnd, zb], [sEnd, zb + legBottom]]);
    crossRun = [[xx, zb], [sEnd, zb]];
  }
  if (monolithic && a.top) {
    const dt = a.top.dia / 1000, et = c.cover + dt / 2, reach = end / 4 + ld, leg = tl - 2 * et;
    const s0 = et;
    if (Lb > 0) {
      const z = -et, sBreak = onTopLine(z, et), level = reach - (sBreak - s0);
      if (level <= 0) push('topFoot', a.top, [[s0, z - leg], [s0, z], [s0 + reach, z]]);
      else {
        const meet = Lb + (z + tv - et * root) / m, past = Math.min(ld, Math.max(0, meet - sBreak));
        push('topFoot', a.top, [[s0, z - leg], [s0, z], [sBreak + past, z]]);
        const from = along([sBreak, topLine(sBreak, et)], Math.min(ld, (tl - 2 * et) / sin), -1);
        push('topFootFlight', a.top, [from, along([sBreak, topLine(sBreak, et)], level, 1)]);
      }
    } else {
      const start: [number, number] = [s0, topLine(s0, et)];
      push('topFoot', a.top, [[start[0] + leg * sin, start[1] - leg * cos], start, along(start, reach, 1)]);
    }
    const sTop = end - et;
    if (Lt > 0) {
      const z = rise - et, sRiser = Lb + run + et, level = sTop - sRiser;
      push('topHead', a.top, [[sTop, z - leg], [sTop, z], [sTop - Math.min(reach, level), z]]);
    } else {
      const start: [number, number] = [sTop, topLine(sTop, et)];
      push('topHead', a.top, [[start[0] - leg * sin, start[1] - leg * cos], start, along(start, reach, -1)]);
    }
  }
  const dd = a.dist.dia / 1000, across = w - 2 * c.cover, hook = Math.max(0.1, 12 * dd), off = db / 2 + dd / 2;
  const leaves = onSoffit(rise - tl + e);
  const bottomRuns = [clipS(main.slice(Lb > 0 ? 1 : 0), -Infinity, Lt > 0 ? leaves : Infinity), ...(crossRun.length ? [clipS(crossRun, Lb + run, Infinity)] : [])].filter((r) => r.length > 1);
  const rowsOn = (runs: Array<Array<[number, number]>>, dz: number) => runs.flatMap((r) => sample(r, Math.floor(lengthOf(r) / a.dist.spacing + 1e-9) + 1)).map(([s, z]) => [r3(s), r3(z + dz)] as [number, number]);
  const bottomRows = rowsOn(bottomRuns, off * root);
  push('dist', a.dist, [[0, hook], [0, 0], [across, 0], [across, hook]], bottomRows.length);
  bars[bars.length - 1]!.rows = bottomRows;
  const topRuns: Array<Array<[number, number]>> = [];
  if (Lt > 0) {
    topRuns.push(clipS(main, Math.min(onSoffit(zCap), sEnd), Infinity));
    const land = bars.find((b) => b.role === 'landing');
    if (land) topRuns.push(land.shape.pts.slice(0, 2) as Array<[number, number]>);
  }
  const topRows = rowsOn(topRuns.filter((r) => r.length > 1 && lengthOf(r) > 1e-6), -off * root);
  if (monolithic && a.top) {
    const tops = bars.filter((b) => b.role === 'topFoot' || b.role === 'topFootFlight' || b.role === 'topHead');
    const dt = a.top.dia / 1000;
    const runsOf = (b: StairBar) => {
      const pts = Lb > 0 && b.role === 'topFoot' ? clipS(b.shape.pts, -Infinity, Lb) : Lb > 0 && b.role === 'topFootFlight' ? clipS(b.shape.pts, Lb, Infinity) : b.shape.pts;
      const legged = b.role === 'topFoot' || b.role === 'topHead';
      return pts.slice(1).map((q, i) => [pts[i]!, q] as Array<[number, number]>).filter(([p0, q], i) => !(legged && i === 0) && Math.abs(q[0] - p0[0]) > 1e-6);
    };
    topRows.push(...tops.flatMap(runsOf).flatMap((r) => sample(r, Math.max(2, Math.floor(lengthOf(r) / a.dist.spacing) + 1))).map(([s, z]) => [r3(s), r3(z - (dt / 2 + dd / 2) * root)] as [number, number]));
  }
  if (topRows.length) {
    push('distTop', a.dist, [[0, -hook], [0, 0], [across, 0], [across, -hook]], topRows.length);
    bars[bars.length - 1]!.rows = topRows;
  }
  bars.forEach((b, i) => { b.mark = String(i + 1); });
  return bars;
}

/** The part of a polyline between `s0` and `s1` along the run. */
function clipS(pts: ReadonlyArray<[number, number]>, s0: number, s1: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const lerp = (a: [number, number], b: [number, number], s: number): [number, number] => { const t = (s - a[0]) / (b[0] - a[0]); return [s, a[1] + (b[1] - a[1]) * t]; };
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!, lo = Math.min(a[0], b[0]), hi = Math.max(a[0], b[0]);
    if (hi < s0 || lo > s1) continue;
    if (Math.abs(b[0] - a[0]) < 1e-12) { out.push(a, b); continue; }
    out.push(a[0] < s0 ? lerp(a, b, s0) : a[0] > s1 ? lerp(a, b, s1) : a, b[0] < s0 ? lerp(a, b, s0) : b[0] > s1 ? lerp(a, b, s1) : b);
  }
  return out.filter((p, k) => k === 0 || Math.hypot(p[0] - out[k - 1]![0], p[1] - out[k - 1]![1]) > 1e-9);
}

/** `n` points evenly along a polyline. */
function sample(pts: ReadonlyArray<[number, number]>, n: number): Array<[number, number]> {
  const L = lengthOf(pts), out: Array<[number, number]> = [];
  for (let k = 0; k < n; k++) {
    let t = n > 1 ? (L * k) / (n - 1) : 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!, b = pts[i]!, l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (t <= l + 1e-9 || i === pts.length - 1) { const u = l > 0 ? Math.min(1, t / l) : 0; out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]); break; }
      t -= l;
    }
  }
  return out;
}

/** The stair's bars proposed for its moments, spacing and the least steel. */
export function proposeStair(dz: StairDesign, spec: StairDesignSpec, c: StairContext): StairAdopted {
  const h = Math.min(spec.waist, spec.landingThickness ?? spec.waist), sMax = Math.min(3 * h, 0.3), asMin = 0.0018 * h;
  const main = pick(Math.max(dz.asBottom ?? asMin, asMin), sMax, c.diameters, 8);
  const top = dz.muNeg > 0 ? pick(Math.max(dz.asTop, asMin), sMax, c.diameters, 8) : undefined;
  const dist = pick(asMin, Math.min(5 * h, 0.45), c.diameters, 6);
  return { main, ...(top ? { top } : {}), dist };
}

/** A stair's row: designed, proposed or as adopted, checked and barred. */
export function stairRow(d: StairDemand, c: StairContext, adopted: StairAdopted | undefined, fmt: Fmt, code: SheetCode): StairRow {
  const spec = d.spec, sec = stairSection(spec);
  const base = { family: 'stair' as const, key: d.key, name: d.name, ...(d.level !== undefined ? { level: d.level } : {}), demand: d, section: sec };
  const supported = STAIR_CODES.includes(code);
  const dz = supported ? stairDesign(spec, { fc: c.fc, fy: c.fy, cover: c.cover, barDia: c.diameters[0] ?? 12, distDia: 8 }) : null;
  const proposed = dz ? proposeStair(dz, spec, c) : { main: { dia: 12, spacing: 0.15 }, dist: { dia: 8, spacing: 0.25 } };
  const a = adopted ?? proposed;
  const ld = cirsocSlabDevelopment({ fc: c.fc, fy: c.fy }, a.main.dia, false, spec.waist, { cover: c.cover, spacing: a.main.spacing }).ldM;
  const monolithic = spec.ends === 'monolithic';
  const bars = stairBars(spec, sec, a, c, ld, monolithic);
  if (!dz) {
    return { ...base, design: null, proposed, adopted: a, isAdopted: !!adopted, bars, ld, verifications: [check('rcSheets.v.stairCode', false, { demand: code })], status: 'none', utilization: 0, steps: [], unsupported: code };
  }
  const h = Math.min(spec.waist, spec.landingThickness ?? spec.waist), db = a.main.dia / 1000, d0 = h - c.cover - db / 2;
  const asMain = perMetre(a.main), asTop = a.top ? perMetre(a.top) : 0, asDist = perMetre(a.dist), asMin = 0.0018 * h;
  const mnBottom = phiMn(asMain, d0, c), mnTop = a.top ? phiMn(asTop, h - c.cover - a.top.dia / 2000, c) : 0;
  const { vc } = slabVc(c.fc, 1, d0, asMain / d0), phiVc = PHI_SHEAR * vc;
  const thick = dz.rows.find((r) => r.titleKey === 'check.stair.thickness');
  const hMin = thick?.demand ?? 0;
  const sMax = Math.min(3 * h, 0.3), sDistMax = Math.min(5 * h, 0.45);
  const cm2 = (v: number) => `${fmt(v * 1e4, 2)} cm²/m`, cm = (v: number) => `${fmt(v * 100, 1)} cm`, knm = (v: number) => `${fmt(v, 1)} kN·m/m`, kn = (v: number) => `${fmt(v, 1)} kN/m`;
  const barText = (b: { dia: number; spacing: number }) => `Ø${b.dia} c/${fmt(b.spacing * 100, Number.isInteger(Math.round(b.spacing * 1000) / 10) ? 0 : 1)}`;
  const v: CheckLine[] = [
    check('rcSheets.v.stairThickness', hMin <= h + 1e-9, { clause: '§7.3.1.1', demand: cm(hMin), capacity: cm(h), ratio: ratioOf(hMin, h) }),
    check('rcSheets.v.stairFlexure', dz.mu <= mnBottom + 1e-6, { clause: '§22.3', demand: knm(dz.mu), capacity: `${barText(a.main)} · φMn = ${knm(mnBottom)}`, ratio: ratioOf(dz.mu, mnBottom) }),
    check('rcSheets.v.stairMin', asMain >= asMin - 1e-12, { clause: '§7.6.1.1', demand: cm2(asMin), capacity: cm2(asMain), ratio: ratioOf(asMin, asMain) }),
    check('rcSheets.v.stairSpacing', a.main.spacing <= sMax + 1e-9, { clause: '§7.7.2.3', demand: cm(a.main.spacing), capacity: `≤ ${cm(sMax)}` }),
    ...(monolithic ? [check('rcSheets.v.stairTop', !!a.top && dz.muNeg <= mnTop + 1e-6, { clause: '§6.5.2', demand: knm(dz.muNeg), capacity: a.top ? `${barText(a.top)} · φMn = ${knm(mnTop)}` : '—', ratio: ratioOf(dz.muNeg, mnTop) })] : []),
    check('rcSheets.v.stairDistribution', asDist >= asMin - 1e-12 && a.dist.spacing <= sDistMax + 1e-9, { clause: '§24.4.3.2', demand: `${cm2(asMin)} · ≤ ${cm(sDistMax)}`, capacity: `${barText(a.dist)} (${cm2(asDist)})`, ratio: ratioOf(asMin, asDist) }),
    check('rcSheets.v.stairShear', dz.vu <= phiVc + 1e-6, { clause: '§22.5.5.1', demand: kn(dz.vu), capacity: kn(phiVc), ratio: ratioOf(dz.vu, phiVc) }),
  ];
  const status: RowStatus = v.every((l) => l.ok) ? 'ok' : 'fail';
  const utilization = Math.max(0, ...v.map((l) => l.ratio ?? 0).filter(Number.isFinite));
  const presumedNote = d.presumed.length ? [{ label: 'rcSheets.s.stairPresumed', value: d.presumed.join(' · ') }] : [];
  const steps: StepGroup[] = [
    { title: 'rcSheets.g.stairLoads', steps: [
      ...presumedNote,
      { label: 'rcSheets.s.stairGeometry', formula: 'n · a × p · θ', value: `${spec.steps} · ${cm(spec.riser)} × ${cm(spec.tread)} · ${fmt((sec.angle * 180) / Math.PI, 1)}°` },
      { label: 'rcSheets.s.stairLoads', formula: 'D tramo · D descanso · L', value: `${fmt(dz.loads.deadFlight, 2)} · ${fmt(dz.loads.deadLanding, 2)} · ${fmt(dz.loads.live, 2)} kN/m²` },
      { label: 'rcSheets.s.stairWu', formula: 'max(1,4D; 1,2D + 1,6L)', value: `${fmt(dz.loads.wuFlight, 2)} · ${fmt(dz.loads.wuLanding, 2)} kN/m²` },
      { label: 'rcSheets.s.stairSpan', formula: 'ℓ (planta) · Mu', value: `${fmt(dz.geometry.span, 2)} m · ${knm(dz.mu)}` },
    ] },
    { title: 'rcSheets.g.stairBars', steps: [
      { label: 'rcSheets.s.stairMain', formula: 'As ≥ máx(As,req; 0,0018·h)', value: `${barText(a.main)} (${cm2(asMain)})` },
      ...(a.top ? [{ label: 'rcSheets.s.stairTop', formula: 'wu·ℓn²/24', value: `${barText(a.top)} · ${knm(dz.muNeg)}` }] : []),
      { label: 'rcSheets.s.stairBreak', formula: 'ld', value: cm(ld) },
    ] },
  ];
  return { ...base, design: dz, proposed, adopted: a, isAdopted: !!adopted, bars, ld, verifications: v, status, utilization, steps };
}
