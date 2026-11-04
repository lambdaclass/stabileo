/**
 * The steel drawings: the general arrangement of each level (members as lines with their
 * profile, columns marked where they pass) and of each frame (an elevation of the members in one
 * vertical plane), the anchor plan (base plates with their anchors, set out from the axes, and the
 * plate table) and one sheet per designed joint, drawn from the joint's own parts in plan and
 * elevation with its parameters listed.
 */
import type { DrawingInput } from '../compose';
import type { P, Primitive } from '../primitives';
import { boxOf, drawAxes, levelMark, rectAt, type PlanAxis } from './plan-common';
import { drawTable } from './table';
import type { Tr } from './details';

type V3 = { x: number; y: number; z: number };
export interface SteelMember { name: string; a: V3; b: V3; profile: string; role: 'column' | 'beam' | 'brace' }
export interface SteelBase { name: string; at: { x: number; y: number }; N: number; B: number; t: number; anchors: Array<{ x: number; y: number }>; anchorD: number; kind: string }
export interface JointSheetPart { kind: string; center: V3; u: V3; v: V3; size: [number, number, number] }
export interface SteelJointSheet { name: string; kind: string; parts: JointSheetPart[]; members: SteelMember[]; at: V3; params: Array<[string, string]> }

const k = 1000;

function finish(key: string, title: string, out: Primitive[], pts: P[], s: number, pad = 20): DrawingInput {
  const box = boxOf(pts.length ? pts : [{ x: 0, y: 0 }]);
  const all = boxOf([{ x: box.x0 - pad * s, y: box.y0 - pad * s }, { x: box.x1 + pad * s, y: box.y1 + pad * s }]);
  return { key, title, primitives: out, width: all.x1 - all.x0, height: all.y1 - all.y0, origin: { x: all.x0, y: all.y0 }, scale: s };
}

function memberLine(m: SteelMember, A: P, B: P, s: number, dashed = false): Primitive[] {
  const L = Math.hypot(B.x - A.x, B.y - A.y) || 1, n = { x: -(B.y - A.y) / L, y: (B.x - A.x) / L };
  const ang = (Math.atan2(B.y - A.y, B.x - A.x) * 180) / Math.PI, up = ang > 90 || ang <= -90 ? ang + 180 : ang;
  return [
    { kind: 'line', layer: 'ST-MEMBER', a: A, b: B, ...(dashed ? { dash: true } : {}) },
    { kind: 'text', layer: 'ST-TEXT', at: { x: (A.x + B.x) / 2 + n.x * 1.2 * s, y: (A.y + B.y) / 2 + n.y * 1.2 * s }, text: `${m.name} ${m.profile}`, height: 2.2, align: 'center', rotation: up },
  ];
}

/** The members whose two ends sit at the level, in plan; the columns through it as squares. */
export function steelLevelPlan(level: { name: string; z: number }, members: readonly SteelMember[], axes: readonly PlanAxis[], scale: number, title: string, fmt: (v: number) => string): DrawingInput | null {
  const tol = 0.05, s = scale, out: Primitive[] = [], pts: P[] = [];
  const at = members.filter((m) => m.role !== 'column' && Math.abs(m.a.z - level.z) < tol && Math.abs(m.b.z - level.z) < tol);
  if (at.length === 0) return null;
  for (const m of at) { const A = { x: m.a.x * k, y: m.a.y * k }, B = { x: m.b.x * k, y: m.b.y * k }; pts.push(A, B); out.push(...memberLine(m, A, B, s, m.role === 'brace')); }
  for (const c of members.filter((m) => m.role === 'column' && Math.min(m.a.z, m.b.z) < level.z + tol && Math.max(m.a.z, m.b.z) > level.z - tol)) {
    const p = { x: c.a.x * k, y: c.a.y * k };
    out.push({ kind: 'polyline', layer: 'ST-MEMBER', closed: true, fill: true, points: rectAt(p, 1.2 * s, 1.2 * s) });
    out.push({ kind: 'text', layer: 'ST-TEXT', at: { x: p.x + 1.2 * s, y: p.y + 1.2 * s }, text: `${c.name} ${c.profile}`, height: 2 });
  }
  const box = boxOf(pts);
  out.push(...drawAxes(axes, box, s), ...levelMark({ x: box.x1 + 4 * s, y: box.y1 + 4 * s }, level.z, s, fmt));
  return finish(`steel-level-${level.name}`, title, out, pts, s);
}

/** The members lying in the vertical plane through `origin` along `dir`, in elevation. */
export function steelFrameElevation(id: string, origin: { x: number; y: number }, dir: { x: number; y: number }, members: readonly SteelMember[], scale: number, title: string): DrawingInput | null {
  const tol = 0.05, s = scale, out: Primitive[] = [], pts: P[] = [];
  const off = (p: V3) => (p.x - origin.x) * -dir.y + (p.y - origin.y) * dir.x;
  const u = (p: V3) => (p.x - origin.x) * dir.x + (p.y - origin.y) * dir.y;
  const inPlane = members.filter((m) => Math.abs(off(m.a)) < tol && Math.abs(off(m.b)) < tol);
  if (inPlane.length < 2) return null;
  for (const m of inPlane) { const A = { x: u(m.a) * k, y: m.a.z * k }, B = { x: u(m.b) * k, y: m.b.z * k }; pts.push(A, B); out.push(...memberLine(m, A, B, s)); }
  const box = boxOf(pts);
  out.push({ kind: 'line', layer: 'FW-OUTLINE', a: { x: box.x0 - 5 * s, y: 0 }, b: { x: box.x1 + 5 * s, y: 0 } });
  return finish(`steel-frame-${id}`, title, out, pts, s);
}

/** Base plates and anchors in plan, set out from the axes, with the plate table. */
export function anchorPlan(bases: readonly SteelBase[], axes: readonly PlanAxis[], scale: number, tr: Tr): DrawingInput[] {
  if (bases.length === 0) return [];
  const s = scale, out: Primitive[] = [], pts: P[] = [];
  for (const b of bases) {
    const c = { x: b.at.x * k, y: b.at.y * k };
    const o = rectAt(c, b.N, b.B);
    pts.push(...o);
    out.push({ kind: 'polyline', layer: 'ST-PLATE', closed: true, points: o });
    for (const a of b.anchors) out.push({ kind: 'circle', layer: 'ST-ANCHOR', c: { x: a.x * k, y: a.y * k }, r: Math.max(b.anchorD, 12) / 2 });
    out.push({ kind: 'text', layer: 'ST-TEXT', at: { x: c.x + b.N / 2 + 1 * s, y: c.y + b.B / 2 + 0.5 * s }, text: b.name, height: 2.5 });
    for (const dir of ['x', 'y'] as const) {
      const cands = axes.filter((a) => a.axis === dir);
      if (!cands.length) continue;
      const v = dir === 'x' ? c.x : c.y;
      const near = cands.reduce((m, a) => (Math.abs(a.at * k - v) < Math.abs(m.at * k - v) ? a : m));
      if (Math.abs(v - near.at * k) < 1) continue;
      out.push({ kind: 'dimension', layer: 'RC-DIM', a: dir === 'x' ? { x: near.at * k, y: c.y } : { x: c.x, y: near.at * k }, b: c, offset: 4 });
    }
  }
  const box = boxOf(pts);
  out.push(...drawAxes(axes, box, s));
  const plan = finish('anchor-plan', tr('plan.steel.anchorPlan'), out, pts, s);
  const t = drawTable({
    columns: [{ label: tr('plan.found.name'), width: 18 }, { label: tr('plan.steel.base'), width: 30 }, { label: tr('plan.steel.plate'), width: 40, align: 'center' }, { label: tr('plan.steel.anchors'), width: 34, align: 'center' }],
    rows: bases.map((b) => [b.name, b.kind, `${Math.round(b.N)}×${Math.round(b.B)}×${Math.round(b.t)}`, `${b.anchors.length} Ø${b.anchorD}`]),
  });
  return [plan, { key: 'anchor-table', title: tr('plan.steel.plateTable'), primitives: t.primitives, width: t.width, height: t.height, origin: { x: 0, y: 0 }, paper: true }];
}

/** A box's eight corners projected on a plane (right, up), as the outline of their hull. */
function projectedBox(p: JointSheetPart, right: V3, up: V3, o: V3): P[] {
  const pts: P[] = [];
  const n = { x: p.u.y * p.v.z - p.u.z * p.v.y, y: p.u.z * p.v.x - p.u.x * p.v.z, z: p.u.x * p.v.y - p.u.y * p.v.x };
  for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) {
    const q = {
      x: p.center.x + (a * p.size[0] * p.u.x + b * p.size[1] * p.v.x + c * p.size[2] * n.x) / 2 - o.x,
      y: p.center.y + (a * p.size[0] * p.u.y + b * p.size[1] * p.v.y + c * p.size[2] * n.y) / 2 - o.y,
      z: p.center.z + (a * p.size[0] * p.u.z + b * p.size[1] * p.v.z + c * p.size[2] * n.z) / 2 - o.z,
    };
    pts.push({ x: (q.x * right.x + q.y * right.y + q.z * right.z) * k, y: (q.x * up.x + q.y * up.y + q.z * up.z) * k });
  }
  // Convex hull (monotone chain).
  const s = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cr = (o2: P, a: P, b: P) => (a.x - o2.x) * (b.y - o2.y) - (a.y - o2.y) * (b.x - o2.x);
  const lo: P[] = [], hi: P[] = [];
  for (const q of s) { while (lo.length >= 2 && cr(lo[lo.length - 2]!, lo[lo.length - 1]!, q) <= 0) lo.pop(); lo.push(q); }
  for (const q of [...s].reverse()) { while (hi.length >= 2 && cr(hi[hi.length - 2]!, hi[hi.length - 1]!, q) <= 0) hi.pop(); hi.push(q); }
  return [...lo.slice(0, -1), ...hi.slice(0, -1)];
}

const LAYER_OF: Record<string, string> = { plate: 'ST-PLATE', stiffener: 'ST-PLATE', bolt: 'ST-BOLT', anchor: 'ST-ANCHOR', weld: 'ST-PLATE' };

/** One joint: elevation along the main member and plan, from its parts, with its parameters. */
export function jointSheet(j: SteelJointSheet, tr: Tr): DrawingInput[] {
  const main = j.members[0];
  const d = main ? { x: main.b.x - main.a.x, y: main.b.y - main.a.y } : { x: 1, y: 0 };
  const L = Math.hypot(d.x, d.y);
  const along: V3 = L > 1e-6 ? { x: d.x / L, y: d.y / L, z: 0 } : { x: 1, y: 0, z: 0 };
  const views: Array<[string, V3, V3]> = [[tr('plan.steel.elevation'), along, { x: 0, y: 0, z: 1 }], [tr('plan.steel.planView'), { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }]];
  const out: DrawingInput[] = [];
  for (const [label, right, up] of views) {
    const ps: Primitive[] = [], pts: P[] = [];
    const proj = (p: V3): P => { const q = { x: p.x - j.at.x, y: p.y - j.at.y, z: p.z - j.at.z }; return { x: (q.x * right.x + q.y * right.y + q.z * right.z) * k, y: (q.x * up.x + q.y * up.y + q.z * up.z) * k }; };
    for (const m of j.members) {
      // A stub of each member, 600 mm from the joint.
      const far = Math.hypot(m.b.x - j.at.x, m.b.y - j.at.y, m.b.z - j.at.z) > Math.hypot(m.a.x - j.at.x, m.a.y - j.at.y, m.a.z - j.at.z) ? m.b : m.a;
      const len = Math.hypot(far.x - j.at.x, far.y - j.at.y, far.z - j.at.z) || 1, f = Math.min(1, 0.5 / len);
      const tip = { x: j.at.x + (far.x - j.at.x) * f, y: j.at.y + (far.y - j.at.y) * f, z: j.at.z + (far.z - j.at.z) * f };
      const A = proj(j.at), B = proj(tip);
      if (Math.hypot(B.x - A.x, B.y - A.y) > 1) { ps.push({ kind: 'line', layer: 'FW-AXIS', a: A, b: B }); ps.push({ kind: 'text', layer: 'ST-TEXT', at: B, text: m.profile, height: 2 }); pts.push(A, B); }
    }
    for (const p of j.parts) {
      const hull = projectedBox(p, right, up, j.at);
      pts.push(...hull);
      ps.push({ kind: 'polyline', layer: LAYER_OF[p.kind] ?? 'ST-PLATE', closed: true, points: hull, ...(p.kind === 'bolt' || p.kind === 'anchor' ? { fill: true } : {}) });
    }
    if (pts.length) out.push(finish(`joint-${j.name}-${label}`, `${j.name} — ${label}`, ps, pts, 20, 6));
  }
  const t = drawTable({ columns: [{ label: tr('plan.steel.param'), width: 40 }, { label: tr('plan.steel.value'), width: 60, align: 'right' }], rows: j.params.map(([a, b]) => [a, b]) });
  out.push({ key: `joint-${j.name}-table`, title: `${j.name} — ${j.kind}`, primitives: t.primitives, width: t.width, height: t.height, origin: { x: 0, y: 0 }, paper: true });
  return out;
}
