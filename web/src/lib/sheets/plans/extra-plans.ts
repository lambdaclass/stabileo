/**
 * Sheets the set lacked: the columns' setting-out with its coordinate table, the loads on the
 * foundation per column and case, the loads applied on each floor, each column's elevation at full
 * height with its laps and its breakdown, the walls' elevations with their reinforcement, and the
 * corbels. Each takes plain data (the store reads the model) and returns drawings for the set.
 */
import type { DrawingInput } from '../compose';
import type { P, Primitive } from '../primitives';
import { boxOf, drawAxes, rectAt, type PlanAxis } from './plan-common';
import { drawTable } from './table';
import type { Tr } from './details';

type Fmt = (v: number, d: number) => string;
const k = 1000;
const frame = (pts: P[], s: number) => { const b = boxOf(pts); return boxOf([...pts, { x: b.x0 - 20 * s, y: b.y0 - 20 * s }, { x: b.x1 + 20 * s, y: b.y1 + 20 * s }]); };
const tableInput = (key: string, title: string, t: { primitives: Primitive[]; width: number; height: number }): DrawingInput => ({ key, title, primitives: t.primitives, width: t.width, height: t.height, origin: { x: 0, y: 0 }, paper: true, table: true });

// ─── Setting-out of the columns ───

export interface SetoutColumn { name: string; x: number; y: number; b: number; h: number; rotDeg?: number }

/**
 * The columns of a level in plan, each with its distance to the nearest axis in x and in y, and
 * the table of their coordinates: from the axes' origin (the first axis of each direction) for
 * `centre`, or from a fixed point of the site.
 */
export function setoutPlan(level: string, cols: readonly SetoutColumn[], axes: readonly PlanAxis[], scale: number, ref: { kind: 'centre' } | { kind: 'fixed'; x: number; y: number }, tr: Tr, fmt: Fmt, withTable = true): DrawingInput[] {
  if (!cols.length) return [];
  const s = scale, out: Primitive[] = [], pts: P[] = [];
  const xs = axes.filter((a) => a.axis === 'x').map((a) => a.at), ys = axes.filter((a) => a.axis === 'y').map((a) => a.at);
  const near = (vs: number[], v: number) => (vs.length ? vs.reduce((m, a) => (Math.abs(a - v) < Math.abs(m - v) ? a : m)) : null);
  for (const c of cols) {
    const cc = { x: c.x * k, y: c.y * k };
    const o = rectAt(cc, c.b * k, c.h * k, c.rotDeg ?? 0);
    out.push({ kind: 'polyline', layer: 'FW-OUTLINE', closed: true, points: o });
    out.push({ kind: 'text', layer: 'FW-TAG', at: { x: cc.x + (c.b * k) / 2 + 1 * s, y: cc.y + (c.h * k) / 2 + 1 * s }, text: c.name, height: 2.5 });
    pts.push(...o);
    // The distance from the nearest axis, in each direction, when the column is off it.
    const ax = near(xs, c.x), ay = near(ys, c.y);
    if (ax !== null && Math.abs(ax - c.x) > 1e-4) out.push({ kind: 'dimension', layer: 'RC-DIM', a: { x: ax * k, y: cc.y }, b: { x: cc.x, y: cc.y }, offset: 4 * s });
    if (ay !== null && Math.abs(ay - c.y) > 1e-4) out.push({ kind: 'dimension', layer: 'RC-DIM', a: { x: cc.x, y: ay * k }, b: { x: cc.x, y: cc.y }, offset: -4 * s });
  }
  const box = boxOf(pts);
  out.push(...drawAxes(axes, box, s));
  const all = frame(pts, s);
  const plan: DrawingInput = { key: `setout-${level}`, title: tr('plan.setout.title', { level }), primitives: out, width: all.x1 - all.x0, height: all.y1 - all.y0, origin: { x: all.x0, y: all.y0 }, scale: s };
  if (!withTable) return [plan];
  const ox = ref.kind === 'fixed' ? ref.x : (xs.length ? Math.min(...xs) : 0), oy = ref.kind === 'fixed' ? ref.y : (ys.length ? Math.min(...ys) : 0);
  const rows = [...cols].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map((c) => [c.name, fmt(c.x - ox, 3), fmt(c.y - oy, 3), `${Math.round(c.b * 100)}×${Math.round(c.h * 100)}`, c.rotDeg ? `${fmt(c.rotDeg, 1)}°` : '0°']);
  const t = drawTable({ columns: [{ label: tr('plan.setout.col'), width: 18 }, { label: 'X (m)', width: 22, align: 'right' }, { label: 'Y (m)', width: 22, align: 'right' }, { label: tr('plan.setout.section'), width: 20 }, { label: tr('plan.setout.rot'), width: 14, align: 'right' }], rows });
  const refText = ref.kind === 'fixed' ? tr('plan.setout.refFixed', { x: fmt(ref.x, 3), y: fmt(ref.y, 3) }) : tr('plan.setout.refAxes');
  return [plan, tableInput(`setout-${level}-table`, `${tr('plan.setout.table', { level })} — ${refText}`, t)];
}

// ─── Loads on the foundation ───

export interface FoundationLoad { name: string; case: string; n: number; vx: number; vy: number; mx: number; my: number }

/** Each column base's reactions per load case, kN and kN·m (N positive in compression). */
export function foundationLoadsTable(rows: readonly FoundationLoad[], tr: Tr, fmt: Fmt): DrawingInput[] {
  if (!rows.length) return [];
  const per = 40, out: DrawingInput[] = [];
  for (let p = 0; p * per < rows.length; p++) {
    const page = rows.slice(p * per, (p + 1) * per).map((r) => [r.name, r.case, fmt(r.n, 1), fmt(r.vx, 1), fmt(r.vy, 1), fmt(r.mx, 1), fmt(r.my, 1)]);
    const t = drawTable({ columns: [{ label: tr('plan.setout.col'), width: 18 }, { label: tr('plan.fl.case'), width: 40 }, { label: 'N (kN)', width: 20, align: 'right' }, { label: 'Vx (kN)', width: 20, align: 'right' }, { label: 'Vy (kN)', width: 20, align: 'right' }, { label: 'Mx (kN·m)', width: 22, align: 'right' }, { label: 'My (kN·m)', width: 22, align: 'right' }], rows: page });
    out.push(tableInput(`fdn-loads-${p + 1}`, tr('plan.fl.title') + (rows.length > per ? ` (${p + 1})` : ''), t));
  }
  return out;
}

// ─── Loads applied on a floor ───

export interface FloorLoads {
  lines: Array<{ a: P; b: P; text: string }>;
  points: Array<{ at: P; text: string }>;
  areas: Array<{ outline: P[]; text: string }>;
}

/** A floor's loads as applied: on the beams (kN/m), at points (kN), over the slabs (kPa), by case. */
export function appliedLoadsPlan(level: string, loads: FloorLoads, axes: readonly PlanAxis[], scale: number, tr: Tr): DrawingInput | null {
  if (!loads.lines.length && !loads.points.length && !loads.areas.length) return null;
  const s = scale, out: Primitive[] = [], pts: P[] = [];
  for (const a of loads.areas) {
    const o = a.outline.map((p) => ({ x: p.x * k, y: p.y * k }));
    out.push({ kind: 'polyline', layer: 'FW-HIDDEN', closed: true, points: o }); pts.push(...o);
    const c = { x: o.reduce((t, p) => t + p.x, 0) / o.length, y: o.reduce((t, p) => t + p.y, 0) / o.length };
    out.push({ kind: 'text', layer: 'RC-TEXT', at: c, text: a.text, height: 2.4, align: 'center' });
  }
  for (const l of loads.lines) {
    const a = { x: l.a.x * k, y: l.a.y * k }, b = { x: l.b.x * k, y: l.b.y * k };
    out.push({ kind: 'line', layer: 'FW-OUTLINE', a, b }); pts.push(a, b);
    out.push({ kind: 'text', layer: 'RC-TEXT', at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 1.5 * s }, text: l.text, height: 2.2, align: 'center' });
  }
  for (const q of loads.points) {
    const c = { x: q.at.x * k, y: q.at.y * k };
    out.push({ kind: 'circle', layer: 'RC-MARK', c, r: 1.2 * s, fill: true }); pts.push(c);
    out.push({ kind: 'text', layer: 'RC-TEXT', at: { x: c.x + 2 * s, y: c.y + 2 * s }, text: q.text, height: 2.2 });
  }
  const box = boxOf(pts);
  out.push(...drawAxes(axes, box, s));
  const all = frame(pts, s);
  return { key: `loads-${level}`, title: tr('plan.loads.title', { level }), primitives: out, width: all.x1 - all.x0, height: all.y1 - all.y0, origin: { x: all.x0, y: all.y0 }, scale: s };
}

// ─── A column at full height ───

export interface ElevationLift { level: string; zLo: number; zHi: number; b: number; bars: string; barDia?: number; barCount?: number; ties: string; lap: number; joint: number }

/**
 * A column stack drawn up its height: each lift's concrete, its bars running on a lap length past
 * the joint above (hatched where they overlap), the ties' text and the levels; beside it the
 * breakdown per lift (bars with their length, H + lap, and ties).
 */
export function columnElevation(name: string, lifts: readonly ElevationLift[], tr: Tr, fmt: Fmt, withTable = true): DrawingInput[] {
  if (!lifts.length) return [];
  const out: Primitive[] = [], pts: P[] = [];
  const w = Math.max(...lifts.map((l) => l.b)) * k;
  for (const [i, l] of lifts.entries()) {
    const y0 = l.zLo * k, y1 = l.zHi * k, half = (l.b * k) / 2;
    out.push({ kind: 'polyline', layer: 'RC-OUTLINE', closed: true, points: [{ x: -half, y: y0 }, { x: half, y: y0 }, { x: half, y: y1 }, { x: -half, y: y1 }] });
    pts.push({ x: -w, y: y0 }, { x: w, y: y1 });
    const last = i === lifts.length - 1;
    // Bars: from the lift's foot up to a lap past the joint above (the top lift stops under the roof).
    const top = last ? y1 - 50 : y1 + (l.joint + l.lap) * k, inset = half - 40;
    for (const x of [-inset, inset]) out.push({ kind: 'line', layer: 'RC-BAR', a: { x, y: y0 }, b: { x, y: top }, ...(l.barDia ? { dia: l.barDia } : {}) });
    if (!last) {
      // The lap zone, above the joint: where this lift's bars and the next one's overlap.
      const a = y1 + l.joint * k, b = a + l.lap * k;
      for (let yy = a; yy < b; yy += 100) out.push({ kind: 'line', layer: 'RC-DIM', a: { x: -inset, y: yy }, b: { x: -inset + 60, y: yy + 60 } });
      out.push({ kind: 'dimension', layer: 'RC-DIM', a: { x: half + 150, y: a }, b: { x: half + 150, y: b }, offset: 0, text: `ℓ ${fmt(l.lap, 2)}` });
    }
    out.push({ kind: 'text', layer: 'RC-TEXT', at: { x: half + 300, y: (y0 + y1) / 2 }, text: `${l.bars} · ${l.ties}`, height: 2.4, ...(l.barDia ? { dia: l.barDia } : {}) });
    out.push({ kind: 'line', layer: 'FW-LEVEL', a: { x: -half - 400, y: y1 }, b: { x: half + 1200, y: y1 } });
    out.push({ kind: 'text', layer: 'FW-LEVEL', at: { x: -half - 400, y: y1 + 60 }, text: `${l.level} +${fmt(l.zHi, 2)}`, height: 2.2 });
  }
  const b = boxOf(pts), all = { x0: b.x0 - 600, y0: b.y0 - 400, x1: b.x1 + 2200, y1: b.y1 + 600 };
  const elev: DrawingInput = { key: `colelev-${name}`, title: tr('plan.colElev.title', { name }), primitives: out, width: all.x1 - all.x0, height: all.y1 - all.y0, origin: { x: all.x0, y: all.y0 } };
  if (!withTable) return [elev];
  const rows = lifts.map((l) => [l.level, l.bars, fmt(l.zHi - l.zLo + l.lap + l.joint, 2), fmt(l.lap, 2), l.ties]);
  const t = drawTable({ columns: [{ label: tr('plan.colElev.lift'), width: 20 }, { label: tr('plan.colElev.bars'), width: 34 }, { label: 'L (m)', width: 16, align: 'right' }, { label: tr('plan.colElev.lap'), width: 18, align: 'right' }, { label: tr('plan.colElev.ties'), width: 34 }], rows });
  return [elev, tableInput(`colelev-${name}-table`, tr('plan.colElev.breakdown', { name }), t)];
}

// ─── A wall's elevation ───

export interface WallElevation { id: string; /** The physical wall's name, where it has one (`member-names.ts`). */ name?: string; length: number; height: number; vertical: { diameter: number; spacing: number }; horizontal: { diameter: number; spacing: number }; curtains: number; boundary?: { count: number; diameter: number }; openings?: { count: number; diameter: number } }

/** A wall face-on: its outline, the mesh drawn at its spacings, the boundary bars at its ends and the bars around its openings. */
export function wallElevation(w: WallElevation, tr: Tr, fmt: Fmt): DrawingInput {
  const L = w.length * k, H = w.height * k, out: Primitive[] = [{ kind: 'polyline', layer: 'RC-OUTLINE', closed: true, points: [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: H }, { x: 0, y: H }] }];
  const step = (sp: number, span: number) => Math.max(sp * k, span / 60);
  for (let x = w.vertical.spacing * k / 2; x < L; x += step(w.vertical.spacing, L)) out.push({ kind: 'line', layer: 'RC-BAR', a: { x, y: 0 }, b: { x, y: H }, dia: w.vertical.diameter });
  for (let y = w.horizontal.spacing * k / 2; y < H; y += step(w.horizontal.spacing, H)) out.push({ kind: 'line', layer: 'RC-STIRRUP', a: { x: 0, y }, b: { x: L, y }, dia: w.horizontal.diameter });
  const lines = [
    tr('plan.wall.vertical', { n: w.curtains, d: w.vertical.diameter, s: Math.round(w.vertical.spacing * 100) }),
    tr('plan.wall.horizontal', { n: w.curtains, d: w.horizontal.diameter, s: Math.round(w.horizontal.spacing * 100) }),
    ...(w.boundary ? [tr('plan.wall.boundary', { n: w.boundary.count, d: w.boundary.diameter })] : []),
    ...(w.openings ? [tr('plan.wall.openings', { n: w.openings.count, d: w.openings.diameter })] : []),
  ];
  lines.forEach((t, i) => out.push({ kind: 'text', layer: 'RC-TEXT', at: { x: 0, y: H + 250 + (lines.length - 1 - i) * 220 }, text: t, height: 2.4 }));
  if (w.boundary) for (const x of [80, L - 80]) out.push({ kind: 'polyline', layer: 'RC-BAR', closed: true, points: [{ x: x - 60, y: 0 }, { x: x + 60, y: 0 }, { x: x + 60, y: H }, { x: x - 60, y: H }], dia: w.boundary.diameter });
  out.push({ kind: 'dimension', layer: 'RC-DIM', a: { x: 0, y: -300 }, b: { x: L, y: -300 }, offset: 0, text: fmt(w.length, 2) });
  out.push({ kind: 'dimension', layer: 'RC-DIM', a: { x: -300, y: H }, b: { x: -300, y: 0 }, offset: 0, text: fmt(w.height, 2) });
  return { key: `wall-${w.id}`, title: tr('plan.wall.title', { id: w.name ?? w.id }), primitives: out, width: L + 1200, height: H + 400 + lines.length * 220 + 600, origin: { x: -600, y: -600 } };
}

// ─── Corbels ───

export interface CorbelSheet { name: string; bw: number; h: number; hEdge?: number; d: number; av: number; asPrimary: number; ah: number; ascProvided?: number; ahProvided?: number; status: string }

/** A corbel in elevation: the column face, its outline, the primary tie with its anchorage and the closed stirrups over 2/3 d. */
export function corbelDrawing(c: CorbelSheet, tr: Tr, fmt: Fmt): DrawingInput {
  const H = c.h * k, he = (c.hEdge ?? c.h / 2) * k, len = (c.av + 0.15) * k, d = c.d * k;
  const out: Primitive[] = [
    { kind: 'line', layer: 'RC-OUTLINE', a: { x: 0, y: -600 }, b: { x: 0, y: H + 600 } },
    { kind: 'polyline', layer: 'RC-OUTLINE', closed: false, points: [{ x: 0, y: H }, { x: len, y: H }, { x: len, y: H - he }, { x: 0, y: 0 }] },
  ];
  const tieY = H - (c.h - c.d) * k;
  out.push({ kind: 'line', layer: 'RC-BAR', a: { x: -400, y: tieY }, b: { x: len - 40, y: tieY } }, { kind: 'line', layer: 'RC-BAR', a: { x: len - 40, y: tieY }, b: { x: len - 40, y: tieY - 150 } });
  // Closed stirrups parallel to the tie, spread over the 2/3 d below it.
  for (let i = 1; i <= 3; i++) { const y = tieY - (i * (2 * d) / 3) / 3; out.push({ kind: 'line', layer: 'RC-STIRRUP', a: { x: 0, y }, b: { x: len - 60 - (i * 40), y } }); }
  out.push({ kind: 'dimension', layer: 'RC-DIM', a: { x: 0, y: H + 250 }, b: { x: c.av * k, y: H + 250 }, offset: 0, text: `av ${fmt(c.av, 2)}` });
  out.push({ kind: 'dimension', layer: 'RC-DIM', a: { x: len + 200, y: H }, b: { x: len + 200, y: 0 }, offset: 0, text: `h ${fmt(c.h, 2)}` });
  const t = [
    tr('plan.corbel.tie', { need: fmt(c.asPrimary, 2), have: c.ascProvided !== undefined ? fmt(c.ascProvided, 2) : '—' }),
    tr('plan.corbel.stirrups', { need: fmt(c.ah, 2), have: c.ahProvided !== undefined ? fmt(c.ahProvided, 2) : '—' }),
    tr('plan.corbel.width', { bw: fmt(c.bw, 2) }),
  ];
  t.forEach((s, i) => out.push({ kind: 'text', layer: 'RC-TEXT', at: { x: 0, y: -400 - i * 220 }, text: s, height: 2.4 }));
  return { key: `corbel-${c.name}`, title: tr('plan.corbel.title', { name: c.name, status: c.status }), primitives: out, width: len + 1200, height: H + 1800, origin: { x: -600, y: -1200 } };
}
