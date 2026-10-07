/**
 * Turning a slab that is already drawn into a stair flight.
 *
 * The slab keeps its footprint and its far edge rises; the flight is meshed one quad per step.
 * Two things the first version dropped are carried here. The slab's own loads went with it
 * (`removeQuad` takes a quad's loads along), so a live load put on the slab vanished from the
 * flight with nothing said; they are now put on every quad of the flight. And the slab's two
 * raised corners stayed behind at the old level, joined to nothing; they are removed when
 * nothing else refers to them.
 *
 * A surface load was stated per square metre of the flat slab, which is the plan of the flight.
 * The engine integrates it over the inclined area, so it is scaled by cos θ to keep the total
 * the user applied. The step weight is different: it is worked out per inclined area already
 * (`stepWeightPerInclinedArea`).
 *
 * Every field of a surface load is carried, re-read on the flight so that each load keeps its
 * total and where it acts in plan (`carriedOnFlight`): the flight lies over the slab, each point
 * of it straight above the point of the slab it came from. A direction along the slab's normal
 * (`local`) or per its projected area is the force it gave on the slab, now per true area along
 * that fixed direction; a value per corner is the slab's field at each flight quad's corners; a
 * variation along a direction that rises, and a region seen along one, are what they were on the
 * slab, written in plan. A load that gave the slab nothing (a variation whose range missed it, a
 * region seen edge-on) gives the flight nothing and is not carried. It used to keep q alone, so
 * a fluid's load (q = 0, all of it in its variation) vanished. Only the quad's own loads: a
 * triangle numbered as the slab (`on: 'plate'`) is another shell.
 */
import { modelStore } from '../store/model.svelte';
import type { SurfaceLoad3D, ThermalLoadQuad3D } from '../store/model.svelte';
import { findCoincidentNode } from '../engine/mesh-weld';
import { buildFlight, quadRunLength, tiltQuadToFlight, type Vec3 } from './stair';
import { shellFrame, shellShapeAt } from '../engine/shell-load-integration';
import { scaledLoad } from './loads/load-magnitudes';

export interface FlightOptions {
  divisions: number;
  materialId: number;
  waist: number;
  /** kN/m² of inclined surface, on the dead case; 0 for none. */
  stepLoad: number;
  deadCase: number;
}

export interface ConvertReport {
  quadIds: number[];
  /** Loads of the slab put on the flight. */
  carriedLoads: number;
  /** Corners of the slab left joined to nothing, and removed. */
  removedNodes: number;
}

/** Build a flight over `corners` into the model; the quads made. */
export function buildFlightInto(corners: [Vec3, Vec3, Vec3, Vec3], o: FlightOptions): number[] {
  let quadIds: number[] = [];
  modelStore.batch(() => {
    const r = buildFlight(
      {
        findNode: (x, y, z) => findCoincidentNode(modelStore.nodes.values(), x, y, z),
        addNode: (x, y, z) => modelStore.addNode(x, y, z !== 0 ? z : undefined),
        addQuad: (nodes) => modelStore.addQuad(nodes, o.materialId, o.waist),
      },
      corners,
      o.divisions,
    );
    quadIds = r.quadIds;
    /* Positive q is gravity: `convertSurfaceLoad` resolves it as fz = −q·A/4. */
    if (o.stepLoad > 0) for (const qid of quadIds) modelStore.addSurfaceLoad3D(qid, o.stepLoad, o.deadCase);
  });
  return quadIds;
}

/** Replace quad `quadId` by a flight rising `rise` from its edge `lowEdge`. One undo step; null when it is not a four-node quad. */
export function convertQuadToFlight(quadId: number, lowEdge: 0 | 1 | 2 | 3, rise: number, o: FlightOptions): ConvertReport | null {
  const quad = modelStore.model.quads.get(quadId);
  if (!quad || quad.nodes.length !== 4) return null;
  const ns = quad.nodes.map((id) => modelStore.nodes.get(id));
  if (ns.some((n) => !n)) return null;
  const corners = ns.map((n) => ({ x: n!.x, y: n!.y ?? 0, z: (n as { z?: number }).z ?? 0 })) as [Vec3, Vec3, Vec3, Vec3];
  const run = quadRunLength(corners, lowEdge);
  const cos = run / Math.hypot(run, rise);
  const own = (l: { data: { quadId: number; on?: 'plate' } }) => l.data.quadId === quadId && !l.data.on;
  const surface = modelStore.loads.filter((l) => l.type === 'surface3d' && own(l)).map((l) => l.data as SurfaceLoad3D);
  const thermal = modelStore.loads.filter((l) => l.type === 'thermalQuad3d' && own(l)).map((l) => l.data as ThermalLoadQuad3D);
  const oldNodes = [...quad.nodes];
  const out: ConvertReport = { quadIds: [], carriedLoads: 0, removedNodes: 0 };
  modelStore.batch(() => {
    modelStore.removeQuad(quadId);
    out.quadIds = buildFlightInto(tiltQuadToFlight(corners, lowEdge, rise), o);
    const carried = surface.map((s) => carriedOnFlight(s, corners, cos)).filter((s): s is SurfaceLoad3D => !!s);
    for (const qid of out.quadIds) {
      const at = modelStore.model.quads.get(qid)!.nodes.map((id) => modelStore.nodes.get(id)!);
      for (const { id: _id, quadId: _q, q, caseId, qNodes, ...rest } of carried) {
        // The slab's field at this quad's corners, each straight below it on the slab.
        const field = qNodes && at.map((p) => {
          const N = shellShapeAt('quad', corners, onSlab(corners, p.x, p.y ?? 0));
          return N ? N.reduce((acc, v, i) => acc + v * (qNodes[i] ?? 0), 0) : 0;
        });
        modelStore.addSurfaceLoad3D(qid, q, caseId, { ...rest, ...(field ? { qNodes: field } : {}) });
      }
      for (const th of thermal) modelStore.addThermalLoadQuad3D(qid, th.dtUniform, th.dtGradient, th.caseId);
    }
    out.carriedLoads = carried.length + thermal.length;
    const used = nodesInUse();
    for (const id of oldNodes) {
      if (!used.has(id) && modelStore.nodes.has(id)) { modelStore.removeNode(id); out.removedNodes++; }
    }
  });
  return out;
}

type P3 = [number, number, number];

/** The point of the slab's plane straight above or below (x, y). */
function onSlab(corners: readonly Vec3[], x: number, y: number): P3 {
  const f = shellFrame('quad', corners)!;
  const o = corners[0]!;
  return [x, y, o.z - (f.ez[0] * (x - o.x) + f.ez[1] * (y - o.y)) / f.ez[2]];
}

/**
 * A slab's surface load as the flight carries it (see the header), its values still per corner of
 * the slab; null when it gave the slab nothing. `cos`: the flight's horizontal run over its length.
 */
export function carriedOnFlight(s: SurfaceLoad3D, corners: readonly Vec3[], cos: number): SurfaceLoad3D | null {
  const f = shellFrame('quad', corners);
  if (!f || Math.abs(f.ez[2]) < 1e-9) return null;
  const ez = f.ez as P3, o = corners[0]!;
  const unit = (v: P3): P3 => { const n = Math.hypot(...v); return [v[0] / n, v[1] / n, v[2] / n]; };
  const dot = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const out: SurfaceLoad3D = { ...s };
  // The direction: the force on the slab per its area, now along a fixed direction per true area.
  let k = cos;
  if (s.frame === 'local') { out.frame = 'global'; out.dir = [...ez]; }
  else if (s.frame === 'projected') {
    const d = unit(s.dir ?? [0, 0, -1]);
    out.frame = 'global'; out.dir = d; k *= Math.abs(dot(ez, d));
  }
  // A variation along a direction that rises: on the slab, a coordinate linear in x and y.
  if (s.vary) {
    const d = unit(s.vary.dir);
    // On the slab z = o.z − (ez·(x − o.x) + ez·(y − o.y)) / ez_z.
    const A = d[0] - d[2] * ez[0] / ez[2], B = d[1] - d[2] * ez[1] / ez[2];
    const K = d[2] * (o.z + (ez[0] * o.x + ez[1] * o.y) / ez[2]);
    const L = Math.hypot(A, B);
    const { c1, q1, c2, q2 } = s.vary;
    if (c1 === c2) return null;
    if (L > 1e-12) out.vary = { dir: [A / L, B / L, 0], c1: (c1 - K) / L, q1, c2: (c2 - K) / L, q2 };
    else {
      // The slab lies at one value of it: that value's q, or nothing outside the range.
      if (K < Math.min(c1, c2) - 1e-9 || K > Math.max(c1, c2) + 1e-9) return null;
      delete out.vary;
      out.q = q1 + (q2 - q1) * (K - c1) / (c2 - c1);
    }
  }
  // A region seen along a direction: its outline on the slab, seen from above.
  if (s.region) {
    const n = unit(s.region.normal), den = dot(ez, n);
    if (Math.abs(den) < 1e-9) return null;
    const put = (P: P3): P3 => { const t = dot(ez, [o.x - P[0], o.y - P[1], o.z - P[2]]) / den; return [P[0] + t * n[0], P[1] + t * n[1], P[2] + t * n[2]]; };
    out.region = { normal: [0, 0, 1], points: s.region.points.map(put), ...(s.region.holes ? { holes: s.region.holes.map((h) => h.map(put)) } : {}) };
  }
  return scaledLoad({ type: 'surface3d', data: out }, k).data;
}

/** Every node something refers to: members, shells, supports, nodal loads, constraints and connectors. */
function nodesInUse(): Set<number> {
  const used = new Set<number>();
  for (const e of modelStore.elements.values()) { used.add(e.nodeI); used.add(e.nodeJ); }
  for (const q of modelStore.quads.values()) q.nodes.forEach((n) => used.add(n));
  for (const p of modelStore.plates.values()) p.nodes.forEach((n) => used.add(n));
  for (const s of modelStore.supports.values()) used.add(s.nodeId);
  for (const l of modelStore.loads) { const n = (l.data as { nodeId?: number }).nodeId; if (n !== undefined) used.add(n); }
  for (const n of modelStore.referencedNodeIds()) used.add(n);
  return used;
}
