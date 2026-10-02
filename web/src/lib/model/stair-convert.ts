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
 */
import { modelStore } from '../store/model.svelte';
import type { SurfaceLoad3D, ThermalLoadQuad3D } from '../store/model.svelte';
import { findCoincidentNode } from '../engine/mesh-weld';
import { buildFlight, quadRunLength, tiltQuadToFlight, type Vec3 } from './stair';

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
  const surface = modelStore.loads.filter((l) => l.type === 'surface3d' && l.data.quadId === quadId).map((l) => l.data as SurfaceLoad3D);
  const thermal = modelStore.loads.filter((l) => l.type === 'thermalQuad3d' && l.data.quadId === quadId).map((l) => l.data as ThermalLoadQuad3D);
  const oldNodes = [...quad.nodes];
  const out: ConvertReport = { quadIds: [], carriedLoads: 0, removedNodes: 0 };
  modelStore.batch(() => {
    modelStore.removeQuad(quadId);
    out.quadIds = buildFlightInto(tiltQuadToFlight(corners, lowEdge, rise), o);
    for (const qid of out.quadIds) {
      for (const s of surface) modelStore.addSurfaceLoad3D(qid, s.q * cos, s.caseId);
      for (const th of thermal) modelStore.addThermalLoadQuad3D(qid, th.dtUniform, th.dtGradient, th.caseId);
    }
    out.carriedLoads = surface.length + thermal.length;
    const used = nodesInUse();
    for (const id of oldNodes) {
      if (!used.has(id) && modelStore.nodes.has(id)) { modelStore.removeNode(id); out.removedNodes++; }
    }
  });
  return out;
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
