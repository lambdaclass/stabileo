import type { SolverInput } from '../../../lib/engine/types';
import type { View } from '../../examples/define';
import { Sketch, boundsOf } from '../../examples/draw';

export const LOAD = 2;
export const RESULT = 1;

export type MemberCurve = { elementId: number; points: [number, number][] };

export function modelSize(model: SolverInput): number {
  const xs = [...model.nodes.values()].map(n => n.x), zs = [...model.nodes.values()].map(n => n.z);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs), 1e-6);
}

function ends(model: SolverInput, elementId: number) {
  const el = model.elements.get(elementId)!;
  const a = model.nodes.get(el.nodeI)!, b = model.nodes.get(el.nodeJ)!;
  const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  return { a, b, L, tx: (b.x - a.x) / L, tz: (b.z - a.z) / L, nx: -(b.z - a.z) / L, nz: (b.x - a.x) / L };
}

function horizontalAt(model: SolverInput, nodeId: number): boolean {
  for (const el of model.elements.values()) {
    if (el.nodeI !== nodeId && el.nodeJ !== nodeId) continue;
    const { tx, tz } = ends(model, el.id);
    return Math.abs(tx) >= Math.abs(tz);
  }
  return true;
}

function support(s: Sketch, model: SolverInput, nodeId: number, type: string, h: number) {
  const n = model.nodes.get(nodeId)!;
  const xs = [...model.nodes.values()].map(v => v.x);
  const side = n.x <= (Math.min(...xs) + Math.max(...xs)) / 2 ? -1 : 1;
  if (type === 'fixed' || type === 'guidedX') {
    if (horizontalAt(model, nodeId)) {
      const x = n.x + (type === 'guidedX' ? side * h * 0.4 : 0);
      if (type === 'guidedX') s.line(n.x, n.z - h, n.x, n.z + h);
      s.line(x, n.z - h, x, n.z + h);
      for (const dz of [-h, 0, h]) s.line(x, n.z + dz, x + side * h * 0.6, n.z + dz - h * 0.6);
    } else {
      s.support(n.x, n.z, 'fixed', h);
    }
    return;
  }
  if (type === 'rollerZ') {
    s.line(n.x, n.z, n.x - h, n.z - h); s.line(n.x - h, n.z - h, n.x - h, n.z + h); s.line(n.x - h, n.z + h, n.x, n.z);
    s.line(n.x - h * 1.4, n.z - h, n.x - h * 1.4, n.z + h);
    return;
  }
  s.support(n.x, n.z, type === 'pinned' ? 'pinned' : 'roller', h);
}

/** Arrows show direction, not magnitude. */
export function drawStructure(s: Sketch, model: SolverInput, h: number) {
  s.category = 0;
  for (const el of model.elements.values()) {
    const { a, b } = ends(model, el.id);
    s.line(a.x, a.z, b.x, b.z);
  }
  for (const sup of model.supports.values()) support(s, model, sup.nodeId, String(sup.type), h);
  s.category = LOAD;
  const drawn: [number, number][] = [];
  const spacing = modelSize(model) / 10;
  const arrowTo = (x: number, z: number, dx: number, dz: number, size = 3) => {
    const length = Math.hypot(dx, dz);
    if (!length) return;
    s.arrow(x - dx / length * h * size, z - dz / length * h * size, dx / length * h * size, dz / length * h * size);
  };
  for (const load of model.loads) {
    if (load.type === 'nodal') {
      const n = model.nodes.get(load.data.nodeId)!;
      arrowTo(n.x, n.z, load.data.fx, load.data.fz, 5);
    } else if (load.type === 'pointOnElement') {
      const { a, tx, tz, nx, nz } = ends(model, load.data.elementId);
      arrowTo(a.x + tx * load.data.a, a.z + tz * load.data.a, nx * Math.sign(load.data.p), nz * Math.sign(load.data.p), 5);
    } else if (load.type === 'distributed') {
      const { a, L, tx, tz, nx, nz } = ends(model, load.data.elementId);
      const q = load.data.qI || load.data.qJ;
      if (!q) continue;
      const up = -Math.sign(q) * h * 3.5;
      s.line(a.x + nx * up, a.z + nz * up, a.x + tx * L + nx * up, a.z + tz * L + nz * up);
      const count = Math.max(1, Math.round(L / spacing));
      for (let k = 0; k <= count; k++) {
        const x = a.x + tx * L * k / count, z = a.z + tz * L * k / count;
        if (drawn.some(([px, pz]) => Math.hypot(px - x, pz - z) < spacing * 0.8)) continue;
        drawn.push([x, z]);
        arrowTo(x, z, nx * Math.sign(q), nz * Math.sign(q));
      }
    }
  }
}

export function structureView(model: SolverInput, field = 'structure'): View {
  const s = new Sketch();
  drawStructure(s, model, modelSize(model) * 0.025);
  return s.view(field, '', boundsOf(s.xy, 0.06));
}

export function curvesView(model: SolverInput, curves: MemberCurve[], field: string, unit: string): View {
  const s = new Sketch();
  const size = modelSize(model);
  for (const el of model.elements.values()) { const { a, b } = ends(model, el.id); s.line(a.x, a.z, b.x, b.z); }
  const largest = Math.max(1e-20, ...curves.flatMap(c => c.points.map(p => Math.abs(p[1]))));
  const scale = size * 0.15 / largest;
  s.category = RESULT;
  let peak: { value: number; at: [number, number] } = { value: 0, at: [0, 0] };
  let lastTick: [number, number] | null = null;
  for (const curve of curves) {
    const { a, tx, tz, nx, nz } = ends(model, curve.elementId);
    const base = (t: number): [number, number] => [a.x + tx * t, a.z + tz * t];
    const off = ([t, v]: [number, number]): [number, number] => [a.x + tx * t + nx * v * scale, a.z + tz * t + nz * v * scale];
    const points = curve.points.map(off);
    s.polyline(points);
    if (curve.points.length) {
      s.line(...base(curve.points[0][0]), ...points[0]);
      s.line(...base(curve.points.at(-1)![0]), ...points.at(-1)!);
    }
    curve.points.forEach((p, k) => {
      const at = base(p[0]);
      if (lastTick && Math.hypot(at[0] - lastTick[0], at[1] - lastTick[1]) < size / 30) return;
      lastTick = at;
      s.line(...at, ...points[k]);
    });
    curve.points.forEach((p, k) => { if (Math.abs(p[1]) > Math.abs(peak.value)) peak = { value: p[1], at: points[k] }; });
  }
  return { ...s.view(field, unit, boundsOf(s.xy, 0.08)), peak };
}

export function deformedView(model: SolverInput, shapes: { elementId: number; points: [number, number][] }[], field = 'deflection', unit = 'm'): View {
  const s = new Sketch();
  const size = modelSize(model);
  for (const el of model.elements.values()) { const { a, b } = ends(model, el.id); s.line(a.x, a.z, b.x, b.z); }
  const offsets = shapes.map(shape => {
    const { a, b } = ends(model, shape.elementId);
    return shape.points.map(([x, z], j): { base: [number, number]; d: [number, number] } => {
      const t = j / Math.max(1, shape.points.length - 1);
      const base: [number, number] = [a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t];
      return { base, d: [x - base[0], z - base[1]] };
    });
  });
  const largest = Math.max(1e-20, ...offsets.flat().map(o => Math.hypot(...o.d)));
  const scale = size * 0.1 / largest;
  s.category = RESULT;
  let peak: { value: number; at: [number, number] } = { value: 0, at: [0, 0] };
  for (const member of offsets) {
    const points = member.map(o => [o.base[0] + o.d[0] * scale, o.base[1] + o.d[1] * scale] as [number, number]);
    s.polyline(points);
    member.forEach((o, k) => { const v = Math.hypot(...o.d); if (v > peak.value) peak = { value: v, at: points[k] }; });
  }
  return { ...s.view(field, unit, boundsOf(s.xy, 0.08)), peak, legend: { shape: 'deformed', scale } };
}
