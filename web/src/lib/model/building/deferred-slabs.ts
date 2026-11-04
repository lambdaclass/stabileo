/**
 * Slabs meshed when the model is solved, not when they are placed.
 *
 * A slab meshed at placement cuts its beams at every edge node of the mesh and adds tens of
 * shells per panel: the model the person edits gets heavy long before it is analysed. A slab
 * placed this way is one shell per panel, its beams whole, and it carries the mesh size it
 * will be analysed with (`PhysicalData.meshAtSolve`). The first solve meshes it in place
 * (`meshQuad`, which keeps its loads and groups and cuts the beams so slab and beams share their
 * nodes), so the analysis, the results on screen and the slab design read the mesh they always
 * read. When the editing goes on, `simplifySlabs` puts the panel back: one shell, its loads, the
 * beams merged where the mesh had cut them and the mesh's own nodes gone.
 *
 * Every call is one undo step.
 */
import { modelStore } from '../../store/model.svelte';
import { physicalGroups } from '../../store/physical';
import { designData } from '../../store/design-data';
import { meshQuad } from '../edit/mesh-region';
import { mergeCollinear } from '../edit/merge-collinear';
import type { PhysicalData } from '../physical/types';
import type { SurfaceLoad3D, ThermalLoadQuad3D } from '../../store/model.svelte';
import { columnFootprintsAt, footprintGrid, outsideFootprints, tieFootprints, untieNodes } from './column-footprints';

type Deferred = ReturnType<typeof physicalGroups>[number] & { physical: PhysicalData & { meshAtSolve: NonNullable<PhysicalData['meshAtSolve']> } };
const deferred = (): Deferred[] => physicalGroups().filter((g): g is Deferred => g.physical.kind === 'slab' && !!g.physical.meshAtSolve);

/** The slabs waiting for their mesh: placed simple and not yet solved. */
export const slabsToMesh = (): number => deferred().filter((g) => !g.physical.meshAtSolve.meshed).length;
/** The slabs meshed by a solve, which can go back to one shell per panel. */
export const slabsToSimplify = (): number => deferred().filter((g) => g.physical.meshAtSolve.meshed).length;

/**
 * The size a waiting slab is meshed at: its own, and for a waffle slab with its rib system chosen
 * no more than the rib spacing, so the mesh has a row of elements per rib and the rib strips of the
 * design each read the moment over their own rib rather than a neighbour's average.
 */
export function meshSizeOf(g: { id: number; physical: { typology?: string; meshAtSolve: { size: number } } }): number {
  const size = g.physical.meshAtSolve.size;
  const rib = g.physical.typology === 'waffle' ? designData().specialFloors?.systems?.[`S${g.id}`]?.ribbed : undefined;
  return rib ? Math.min(size, rib.spacingX, rib.spacingY ?? rib.spacingX) : size;
}

/** Mesh every slab that is waiting for it, at its own size. Returns how many slabs and shells. */
export function meshDeferredSlabs(): { slabs: number; shells: number } {
  const out = { slabs: 0, shells: 0 };
  const waiting = deferred().filter((g) => !g.physical.meshAtSolve.meshed);
  if (waiting.length === 0) return out;
  modelStore.batch(() => {
    for (const g of waiting) {
      const quads = g.members.quads ?? [];
      // One shell per panel is what was placed; anything else was edited by hand and is left as it is.
      if (quads.length !== 1) continue;
      const r = meshWithFootprints(quads[0]!, meshSizeOf(g));
      if (!r || 'refused' in r) continue;
      out.slabs++; out.shells += r.quadCount;
      modelStore.setGroupData(g.id, { ...g.physical, meshAtSolve: { ...g.physical.meshAtSolve, meshed: true } } as unknown as Record<string, unknown>);
    }
  });
  return out;
}

/**
 * Put meshed slabs back to one shell per panel: the panel's corners, the material, thickness and
 * offset of its shells, the surface and thermal loads they carried (the same per square metre on
 * every shell of the mesh, so the first one's), the beams merged where the mesh had cut them, and
 * the mesh's own nodes removed. `ids` limits it to some slabs; absent, every one.
 */
export function simplifySlabs(ids?: readonly number[]): { slabs: number; removedNodes: number } {
  const out = { slabs: 0, removedNodes: 0 };
  const meshed = deferred().filter((g) => g.physical.meshAtSolve.meshed && (!ids || ids.includes(g.id)));
  if (meshed.length === 0) return out;
  modelStore.batch(() => {
    for (const g of meshed) {
      const quads = (g.members.quads ?? []).filter((id) => modelStore.quads.has(id));
      const panel = g.physical.meshAtSolve.panel;
      if (quads.length === 0 || panel.length !== 4 || panel.some((n) => !modelStore.nodes.has(n))) continue;
      const first = modelStore.quads.get(quads[0]!)!;
      const onFirst = (l: { data: { quadId?: number; on?: string } }) => l.data.quadId === first.id && !l.data.on;
      const surface = modelStore.loads.filter((l) => l.type === 'surface3d' && onFirst(l as never)).map((l) => l.data as SurfaceLoad3D);
      const thermal = modelStore.loads.filter((l) => l.type === 'thermalQuad3d' && onFirst(l as never)).map((l) => l.data as ThermalLoadQuad3D);
      const meshNodes = new Set(quads.flatMap((id) => modelStore.quads.get(id)!.nodes));
      for (const n of panel) meshNodes.delete(n);
      // The column ties the mesh made (`column-footprints.ts`) go with its nodes.
      untieNodes(meshNodes);
      for (const id of quads) modelStore.removeQuad(id);
      const q = modelStore.addQuad(panel as [number, number, number, number], first.materialId, first.thickness);
      if (first.offset) modelStore.setShellOffset('quad', q, first.offset);
      for (const s of surface) {
        const { id: _id, quadId: _q, q: qv, caseId, qNodes: _n, ...extra } = s;
        modelStore.addSurfaceLoad3D(q, qv, caseId, extra);
      }
      for (const t of thermal) modelStore.addThermalLoadQuad3D(q, t.dtUniform, t.dtGradient, t.caseId);
      const group = modelStore.model.groups.get(g.id);
      if (group) modelStore.setGroupMembers(g.id, { ...group.members, quads: [q] });
      modelStore.setGroupData(g.id, { ...g.physical, meshAtSolve: { ...g.physical.meshAtSolve, meshed: false } } as unknown as Record<string, unknown>);
      // The beams the mesh cut along the panel's edges, whole again where nothing else holds the cut.
      const onEdge = [...modelStore.elements.values()].filter((e) => meshNodes.has(e.nodeI) || meshNodes.has(e.nodeJ)).map((e) => e.id);
      out.removedNodes += mergeCollinear(onEdge).removedNodes;
      // The mesh's own nodes inside the panel, now holding nothing.
      const held = new Set<number>();
      for (const e of modelStore.elements.values()) { held.add(e.nodeI); held.add(e.nodeJ); }
      for (const s of modelStore.quads.values()) s.nodes.forEach((n) => held.add(n));
      for (const p of modelStore.plates.values()) p.nodes.forEach((n) => held.add(n));
      for (const s of modelStore.supports.values()) held.add(s.nodeId);
      for (const l of modelStore.loads) if ('nodeId' in l.data) held.add((l.data as { nodeId: number }).nodeId);
      for (const n of meshNodes) if (modelStore.nodes.has(n) && !held.has(n)) { modelStore.removeNode(n); out.removedNodes++; }
      out.slabs++;
    }
  });
  return out;
}

/**
 * Mesh one shell at `size` on the grid with lines on its columns' faces, and tie the slab nodes
 * inside each column's section to the column (`column-footprints.ts`); a shell that is not an
 * axis-aligned rectangle is meshed on the mesher's own grid. One undo step with the caller's.
 */
export function meshWithFootprints(quadId: number, size: number): ReturnType<typeof meshQuad> {
  const quad = modelStore.quads.get(quadId);
  if (!quad) return null;
  const corners = quad.nodes.map((id) => modelStore.nodes.get(id)!);
  const z = corners[0]?.z ?? 0;
  const columns = columnFootprintsAt(z);
  const grid = footprintGrid(corners, size, columns);
  const r = meshQuad(quadId, { density: { mode: 'targetSize', size }, splitBeams: true, ...(grid ? { mesh: grid, splitAt: outsideFootprints(columns, z) } : {}) });
  if (r && !('refused' in r) && grid) tieFootprints(new Set(r.quads.flatMap((q) => modelStore.quads.get(q)?.nodes ?? [])), columns);
  return r;
}

/**
 * The slabs a solve meshed before their columns' sections were represented: meshed, with columns
 * at the panel and not one slab node tied to them. Each goes back to one shell and is meshed
 * again on the footprint grid, as one step.
 */
export function slabsWithoutFootprints(): number[] {
  const tied = new Set((modelStore.model.constraints ?? []).flatMap((k) => (k.type === 'rigidLink' ? [k.slaveNode as number] : [])));
  return deferred().filter((g) => {
    if (!g.physical.meshAtSolve.meshed) return false;
    const corners = g.physical.meshAtSolve.panel.map((id) => modelStore.nodes.get(id));
    if (corners.some((c) => !c)) return false;
    const z = corners[0]!.z ?? 0;
    const cols = columnFootprintsAt(z);
    if (!footprintGrid(corners as never, g.physical.meshAtSolve.size, cols)) return false;
    const nodes = new Set((g.members.quads ?? []).flatMap((q) => modelStore.quads.get(q)?.nodes ?? []));
    const reached = cols.filter((c) => nodes.has(c.node));
    return reached.length > 0 && ![...nodes].some((n) => tied.has(n));
  }).map((g) => g.id);
}

/** Re-mesh the slabs `slabsWithoutFootprints` names: back to one shell, then on the footprint grid. */
export function representFootprints(): { slabs: number } {
  const ids = slabsWithoutFootprints();
  if (ids.length === 0) return { slabs: 0 };
  let n = 0;
  modelStore.batch(() => {
    simplifySlabs(ids);
    n = meshDeferredSlabs().slabs;
  });
  return { slabs: n };
}
