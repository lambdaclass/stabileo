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

/** The stair's section: the landings, the flight's steps and its waist, in the plane of its run. */
export function stairSection(spec: StairDesignSpec): StairSection {
  const treads = treadCount(spec.steps), run = treads * spec.tread, rise = spec.steps * spec.riser;
  const angle = Math.atan2(rise, run), tan = Math.tan(angle), tv = spec.waist / Math.cos(angle);
  const tl = spec.landingThickness ?? spec.waist, Lb = spec.landingBottom, Lt = spec.landingTop;
  const sA = Lb + (tv - tl) / tan, sB = Lb + run + (tv - tl) / tan;
  const out: Array<[number, number]> = [[0, 0], [Lb, 0]];
  let s = Lb, z = 0;
  for (let i = 0; i < spec.steps; i++) { z += spec.riser; out.push([s, z]); if (i < treads) { s += spec.tread; out.push([s, z]); } }
  out.push([Lb + run + Lt, rise], [Lb + run + Lt, rise - tl], [Math.max(sB, Lb + run - 1e-6), rise - tl], [Math.min(sA, Lb + 1e-6) < 0 ? 0 : sA, -tl], [0, -tl]);
  return { outline: out.map(([a, b]) => [r3(a), r3(b)] as [number, number]), run, rise, landingBottom: Lb, landingTop: Lt, tl, tv, angle };
}

const lengthOf = (pts: ReadonlyArray<[number, number]>) => pts.slice(1).reduce((t, p, i) => t + Math.hypot(p[0] - pts[i]![0], p[1] - pts[i]![1]), 0);

/**
 * The bars, in the section: s along the run from the foot support, z up from the foot landing's top.
 * The main bar follows the soffit up from the foot, bending at the foot of the flight, and runs on
 * past its head up to the landing's top cover and ld beyond the break; the landing's bar comes in
 * level from the head support and runs ld past the break into the flight, or hooks down where the
 * flight's top would leave it less; each end at a support turns a leg into the slab; the top bars
 * reach ℓn/4 + ld from each support's face.
 */
export function stairBars(spec: StairDesignSpec, sec: StairSection, a: StairAdopted, c: StairContext, ld: number, monolithic: boolean): StairBar[] {
  const db = a.main.dia / 1000, e = c.cover + db / 2, w = spec.width, cos = Math.cos(sec.angle), sin = Math.sin(sec.angle), tan = Math.tan(sec.angle);
  const Lb = sec.landingBottom, Lt = sec.landingTop, run = sec.run, rise = sec.rise, tl = sec.tl, end = Lb + run + Lt;
  const soffitBar = (s: number) => (s - Lb) * tan - sec.tv + e / cos;
  const onSoffit = (z: number) => Lb + (z + sec.tv - e / cos) / tan;
  const count = (s: number) => Math.floor((w - 2 * c.cover) / s + 1e-9) + 1;
  const bars: StairBar[] = [];
  const push = (role: StairBarRole, b: { dia: number; spacing: number }, pts: Array<[number, number]>, n = count(b.spacing)) => {
    const p = pts.map(([x, y]) => [r3(x), r3(y)] as [number, number]);
    bars.push({ mark: '', role, dia: b.dia, spacing: b.spacing, count: n, shape: { pts: p, mandrel: (6 * b.dia) / 1000, dia: b.dia }, length: r3(lengthOf(p)) });
  };
  const legBottom = tl - 2 * e;
  const main: Array<[number, number]> = [];
  if (Lb > 0) {
    main.push([c.cover + db / 2, -tl + e + legBottom], [c.cover + db / 2, -tl + e]);
    main.push([onSoffit(-tl + e), -tl + e]);
  } else {
    const s0 = c.cover + db / 2, z0 = soffitBar(s0);
    main.push([s0 + (tl - 2 * e) * sin, z0 + (tl - 2 * e) * cos], [s0, z0]);
  }
  if (Lt > 0) {
    const zBreak = rise - tl + e, sBreak = onSoffit(zBreak), zCap = rise - e;
    const climb = (zCap - zBreak) / sin;
    if (climb >= ld) main.push([sBreak + ld * cos, zBreak + ld * sin]);
    else main.push([sBreak + climb * cos, zCap], [sBreak + climb * cos + (ld - climb), zCap]);
  } else {
    const s1 = Lb + run - c.cover - db / 2, z1 = soffitBar(s1);
    main.push([s1, z1], [s1 - (tl - 2 * e) * sin, z1 + (tl - 2 * e) * cos]);
  }
  push('main', a.main, main);
  if (Lt > 0) {
    const z = rise - tl + e, sBreak = onSoffit(z), sEnd = end - c.cover - db / 2;
    const exit = Lb + (z + e) / tan, reach = Math.min(ld, Math.max(0, sBreak - Math.max(exit, Lb)));
    const pts: Array<[number, number]> = [[sEnd, z + legBottom], [sEnd, z], [sBreak - reach, z]];
    if (reach < ld - 1e-6) pts.push([sBreak - reach, Math.max(z - (12 * db), soffitBar(sBreak - reach))]);
    push('landing', a.main, pts);
  }
  if (monolithic && a.top) {
    const dt = a.top.dia / 1000, et = c.cover + dt / 2, reach = (Lb + run + Lt) / 4 + ld, leg = tl - 2 * et;
    const topBar = (s: number) => (s - Lb) * tan - et / cos;
    const onTop = (z: number) => Lb + (z + et / cos) / tan;
    const along = (from: [number, number], len: number, dir: 1 | -1): [number, number] => [from[0] + dir * len * cos, from[1] + dir * len * sin];
    const s0 = c.cover + dt / 2;
    if (Lb > 0) {
      const z = -et, sBreak = onTop(z), level = reach - (Lb - s0);
      if (level <= 0) push('topFoot', a.top, [[s0, z - leg], [s0, z], [s0 + reach, z]]);
      else {
        const soffit = Lb + (z + sec.tv - e / cos) / tan, past = Math.min(ld, Math.max(0, soffit - sBreak));
        push('topFoot', a.top, [[s0, z - leg], [s0, z], [sBreak + past, z]]);
        const from = along([sBreak, topBar(sBreak)], Math.min(ld, (tl - 2 * et) / sin), -1);
        push('topFootFlight', a.top, [from, along([sBreak, topBar(sBreak)], level, 1)]);
      }
    } else {
      const start: [number, number] = [s0, topBar(s0)];
      push('topFoot', a.top, [[start[0] + leg * sin, start[1] - leg * cos], start, along(start, reach, 1)]);
    }
    const sEnd = end - c.cover - dt / 2;
    if (Lt > 0) {
      const z = rise - et, sBreak = onTop(z), level = sEnd - sBreak;
      const pts: Array<[number, number]> = [[sEnd, z - leg], [sEnd, z]];
      if (reach <= level) pts.push([sEnd - reach, z]);
      else pts.push([sBreak, z], along([sBreak, z], reach - level, -1));
      push('topHead', a.top, pts);
    } else {
      const start: [number, number] = [sEnd, topBar(sEnd)];
      push('topHead', a.top, [[start[0] - leg * sin, start[1] - leg * cos], start, along(start, reach, -1)]);
    }
  }
  const dd = a.dist.dia / 1000, across = w - 2 * c.cover, hook = Math.max(0.1, 12 * dd);
  const bottomRun = lengthOf(main), nDist = Math.floor(bottomRun / a.dist.spacing + 1e-9) + 1;
  push('dist', a.dist, [[0, hook], [0, 0], [across, 0], [across, hook]], nDist);
  bars[bars.length - 1]!.rows = sample(main, nDist).map(([s, z]) => [r3(s), r3(z + db / 2 + dd / 2)] as [number, number]);
  if (monolithic && a.top) {
    const tops = bars.filter((b) => b.role === 'topFoot' || b.role === 'topFootFlight' || b.role === 'topHead');
    const rows = tops.flatMap((b) => sample(b.shape.pts.slice(1), Math.max(2, Math.floor(lengthOf(b.shape.pts.slice(1)) / a.dist.spacing) + 1))).map(([s, z]) => [r3(s), r3(z - (a.top!.dia / 1000) / 2 - dd / 2)] as [number, number]);
    push('distTop', a.dist, [[0, -hook], [0, 0], [across, 0], [across, -hook]], rows.length);
    bars[bars.length - 1]!.rows = rows;
  }
  bars.forEach((b, i) => { b.mark = String(i + 1); });
  return bars;
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
