/**
 * The plastic panel's own pictures on the plane canvas: a collapse mechanism
 * (rigid pieces turned about their hinges, each hinge with its rotation as a
 * multiple of θ) and the hinges a user is placing; plus the moment diagram of
 * a user's mechanism, as element forces the ordinary diagram drawing reads.
 */
import type { AnalysisResults, ElementForces, SolverInput } from '../engine/types';
import type { MechanismView } from '../engine/plastic/mechanism';
import type { LimitModel } from '../engine/plastic/limit';
import { momentAt } from '../engine/plastic/sections';
import { computeDiagramValueAt } from '../engine/diagrams';
import { transverseSign, flipElementForces2D } from '../engine/transverse-sign-2d';

export interface CourseDrawContext {
  ctx: CanvasRenderingContext2D;
  worldToScreen: (wx: number, wy: number) => { x: number; y: number };
}

const MECH = '#4a8fd4';
const HINGE = 'rgba(233, 69, 96, 0.95)';

export function thetaLabel(theta: number): string {
  const a = Math.abs(theta);
  const k = Math.abs(a - 1) < 1e-6 ? '' : String(+a.toFixed(3));
  return `${theta < 0 ? '−' : '+'}${k}θ`;
}

/** The mechanism, magnified so its largest movement is about an eighth of the structure. */
export function drawMechanism(dc: CourseDrawContext, view: MechanismView): void {
  const { ctx, worldToScreen } = dc;
  const { km, d } = view;
  let size = 0, move = 0;
  const xs = km.points.map((p) => p.x), zs = km.points.map((p) => p.z);
  size = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) || 1;
  km.points.forEach((_, p) => { move = Math.max(move, Math.hypot(d[2 * p], d[2 * p + 1])); });
  const scale = move > 0 ? (0.13 * size) / move : 0;
  const at = (p: number) => worldToScreen(km.points[p].x + scale * d[2 * p], km.points[p].z + scale * d[2 * p + 1]);

  ctx.save();
  ctx.strokeStyle = MECH;
  ctx.lineWidth = 2.5;
  ctx.setLineDash([]);
  for (const list of km.stations.values()) {
    ctx.beginPath();
    list.forEach((s, k) => { const q = at(s.p); if (k === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y); });
    ctx.stroke();
  }
  for (const h of view.hinges) {
    if (h.p < 0) continue;
    let q = at(h.p);
    if (h.t <= 1e-9 || h.t >= 1 - 1e-9) {
      const list = km.stations.get(h.member);
      if (list) {
        const other = at(h.t < 0.5 ? list[1].p : list[list.length - 2].p);
        const len = Math.hypot(other.x - q.x, other.y - q.y) || 1;
        const off = Math.min(12, len / 3);
        q = { x: q.x + ((other.x - q.x) / len) * off, y: q.y + ((other.y - q.y) / len) * off };
      }
    }
    ctx.beginPath();
    ctx.arc(q.x, q.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = h.theta === 0 ? 'rgba(150, 150, 150, 0.9)' : HINGE;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (h.theta !== 0) {
      const ccw = h.theta > 0;
      ctx.beginPath();
      ctx.strokeStyle = HINGE;
      ctx.lineWidth = 1.5;
      const a0 = -Math.PI * 0.15, a1 = -Math.PI * 0.85;
      ctx.arc(q.x, q.y, 12, ccw ? a0 : a1, ccw ? a1 : a0, ccw);
      ctx.stroke();
      const end = ccw ? a1 : a0;
      const tip = { x: q.x + 12 * Math.cos(end), y: q.y + 12 * Math.sin(end) };
      const dir = ccw ? end - Math.PI / 2 : end + Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      ctx.lineTo(tip.x - 5 * Math.cos(dir - 0.5), tip.y - 5 * Math.sin(dir - 0.5));
      ctx.lineTo(tip.x - 5 * Math.cos(dir + 0.5), tip.y - 5 * Math.sin(dir + 0.5));
      ctx.closePath();
      ctx.fillStyle = HINGE;
      ctx.fill();
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = HINGE;
      ctx.fillText(thetaLabel(h.theta), q.x, q.y - 15);
    }
  }
  ctx.restore();
}

/** Where a hinge at t along a member sits, in model coordinates. */
export function hingePoint(input: SolverInput, member: number, t: number): { x: number; z: number } | null {
  const e = input.elements.get(member);
  if (!e) return null;
  const a = input.nodes.get(e.nodeI)!, b = input.nodes.get(e.nodeJ)!;
  const ti = t <= 1e-9 ? Math.min(0.08, 0.5) : t >= 1 - 1e-9 ? 0.92 : t;
  return { x: a.x + (b.x - a.x) * ti, z: a.z + (b.z - a.z) * ti };
}

/** The hinges being placed, numbered; those set aside drawn hollow. */
export function drawPlacedHinges(dc: CourseDrawContext, input: SolverInput, hinges: Array<{ member: number; t: number }>, setAside: Set<number>): void {
  const { ctx, worldToScreen } = dc;
  ctx.save();
  hinges.forEach((h, i) => {
    const w = hingePoint(input, h.member, h.t);
    if (!w) return;
    const q = worldToScreen(w.x, w.z);
    ctx.beginPath();
    ctx.arc(q.x, q.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = setAside.has(i) ? 'rgba(0, 0, 0, 0)' : HINGE;
    ctx.fill();
    ctx.strokeStyle = setAside.has(i) ? HINGE : '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = setAside.has(i) ? HINGE : '#fff';
    ctx.fillText(String(i + 1), q.x, q.y);
  });
  ctx.restore();
}

/**
 * Element forces whose moment diagram is the distribution M at λ, in the drawn
 * axes the canvas expects, so `drawDiagrams` draws it like any other.
 */
export function distributionResults(input: SolverInput, lm: LimitModel, M: number[], lambda: number): AnalysisResults {
  const elementForces: ElementForces[] = [];
  for (const e of input.elements.values()) {
    if (e.type === 'truss') continue;
    const a = input.nodes.get(e.nodeI)!, b = input.nodes.get(e.nodeJ)!;
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const pointLoads: ElementForces['pointLoads'] = [];
    const distributedLoads: ElementForces['distributedLoads'] = [];
    for (const l of input.loads) {
      if (l.type === 'pointOnElement' && l.data.elementId === e.id) pointLoads.push({ a: l.data.a, p: lambda * l.data.p, my: lambda * (l.data.my ?? 0) });
      if (l.type === 'distributed' && l.data.elementId === e.id) distributedLoads.push({ qI: lambda * l.data.qI, qJ: lambda * l.data.qJ, a: l.data.a ?? 0, b: l.data.b ?? L });
    }
    const m0 = -momentAt(lm.sm, e.id, 0, M, lambda), mL = -momentAt(lm.sm, e.id, 1, M, lambda);
    const base: ElementForces = {
      elementId: e.id, nStart: 0, nEnd: 0, vStart: 0, vEnd: 0, mStart: m0, mEnd: -mL, length: L,
      qI: 0, qJ: 0, pointLoads, distributedLoads, hingeStart: e.hingeStart, hingeEnd: e.hingeEnd,
    };
    const free = computeDiagramValueAt('moment', 1, base);
    const ef = { ...base, vStart: (free - mL) / L, vEnd: (free - mL) / L };
    elementForces.push(transverseSign(b.x - a.x, b.z - a.z) < 0 ? flipElementForces2D(ef) : ef);
  }
  return { displacements: [], reactions: [], elementForces } as unknown as AnalysisResults;
}
