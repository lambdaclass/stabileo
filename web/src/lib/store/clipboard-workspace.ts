/**
 * A copy keeps the coordinates the model stored it in. A plane model (Basic 2D, or a 2D model shown
 * standing in a space workspace) stores its vertical as `y`; the space workspace rewrites it with
 * the vertical as `z` before any edit (`materialize-space.ts`). A plane copy pasted there is rewritten
 * the same way, or it lands turned onto the floor.
 */
import type { Fragment } from '../model/edit/fragment';
import type { ModelData } from '../engine/solver-service';
import type { Node } from './model.svelte';
import { materializeStandingPlaneModel } from './materialize-space';

/** The plane copy in space coordinates, as the model it came from would be rewritten. */
export function planeFragmentToSpace(frag: Fragment): Fragment {
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  const model: ModelData = {
    nodes: new Map(frag.nodes.map((n) => [n.id, { id: n.id, x: n.x, y: n.y, ...(n.z ? { z: n.z } : {}) } as Node])),
    elements: new Map(frag.elements.map((e) => [e.id, clone(e)])),
    supports: new Map(frag.supports.map((s) => [s.id, clone(s)])),
    loads: clone(frag.loads),
    materials: new Map(frag.materials.map((m) => [m.id, clone(m)])),
    sections: new Map(frag.sections.map((s) => [s.id, clone(s)])),
  };
  let nextLoad = Math.max(0, ...frag.loads.map((l) => (l.data as { id?: number }).id ?? 0)) + 1;
  if (!materializeStandingPlaneModel(model, () => nextLoad++)) return frag;
  return {
    ...frag,
    nodes: [...model.nodes.values()].map((n) => ({ id: n.id, x: n.x, y: n.y, z: n.z ?? 0 })),
    elements: [...model.elements.values()],
    supports: [...model.supports.values()],
    loads: model.loads,
  };
}

