/**
 * Slabs meshed when the model is solved, not when they are placed, as Basic 3D reads them.
 *
 * A slab placed this way (`PhysicalData.meshAtSolve`) is one shell per panel, its beams whole, and
 * it carries the mesh size it will be analysed with. In PRO it becomes a physical plate
 * (`store/plates-from-shells.ts`); Basic 3D has no plates, so the first solve meshes it in place
 * (`meshQuad`, which keeps its loads and groups and cuts the beams so slab and beams share their
 * nodes), and the analysis and the results on screen read that mesh.
 *
 * Every call is one undo step.
 */
import { modelStore } from '../../store/model.svelte';
import { physicalGroups } from '../../store/physical';
import { designData } from '../../store/design-data';
import { meshQuad } from '../edit/mesh-region';
import { mergeCollinear } from '../edit/merge-collinear';
import type { PhysicalData } from '../physical/types';
import type { Load } from '../../store/model.svelte';
import { canonicalExactJson } from '../../provenance/exact-hash';
import { plateNodeReferences, retainedPlateNodes } from '../../store/plate-node-references';
import { columnFootprintsAt, footprintGrid, outsideFootprints, tieFootprints, releaseFootprintLinks } from './column-footprints';

type Deferred = ReturnType<typeof physicalGroups>[number] & { physical: PhysicalData & { meshAtSolve: NonNullable<PhysicalData['meshAtSolve']> } };
const deferred = (): Deferred[] => physicalGroups().filter((g): g is Deferred => g.physical.kind === 'slab' && !!g.physical.meshAtSolve);

export function deferredSlabMeshes() {
  const waiting: number[] = [], meshed: number[] = [];
  for (const slab of deferred()) (slab.physical.meshAtSolve.meshed ? meshed : waiting).push(slab.id);
  return { waiting, meshed };
}

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
      const r = meshWithFootprints(quads[0]!, meshSizeOf(g), g.id);
      if (!r || 'refused' in r) continue;
      out.slabs++; out.shells += r.quadCount;
      modelStore.setGroupData(g.id, { ...g.physical, meshAtSolve: { ...g.physical.meshAtSolve, meshed: true } } as unknown as Record<string, unknown>);
    }
  });
  return out;
}

type QuadLoad = Extract<Load, { type: 'surface3d' | 'thermalQuad3d' }>;

function panelLoads(quads: readonly number[]): QuadLoad[] | null {
  const byCell = new Map(quads.map(id => [id, [] as QuadLoad[]]));
  for (const load of modelStore.loads) {
    if ((load.type !== 'surface3d' && load.type !== 'thermalQuad3d') || load.data.on) continue;
    const cell = byCell.get(load.data.quadId);
    if (!cell) continue;
    if (load.type === 'surface3d' && load.data.qNodes) {
      const { qNodes, ...data } = load.data;
      const q = qNodes[0];
      if (q === undefined || !Number.isFinite(q) || qNodes.length !== 4 || !qNodes.every(value => value === q)) return null;
      cell.push({ type: load.type, data: { ...data, q } });
    } else {
      cell.push(load);
    }
  }
  let expected: string | undefined;
  for (const [id, loads] of byCell) {
    const quad = modelStore.quads.get(id)!;
    if (quad.curved) return null;
    const fields = loads.map(({ type, data }) => {
      const { id: _id, quadId: _target, ...field } = data;
      return canonicalExactJson([type, field]);
    }).sort();
    const signature = canonicalExactJson([quad.materialId, quad.thickness, quad.offset, fields]);
    if (expected !== undefined && signature !== expected) return null;
    expected = signature;
  }
  return byCell.get(quads[0]!) ?? [];
}

/**
 * Put meshed slabs back to one shell per panel: the panel's corners, the material, thickness and
 * offset of its shells, the surface and thermal loads they carried (the same per square metre on
 * every shell of the mesh, so the first one's), the beams merged where the mesh had cut them, and
 * the mesh's own nodes removed. `ids` limits it to some slabs; absent, every one.
 */
export function simplifySlabs(ids?: readonly number[]): { slabs: number; removedNodes: number; refused: string[] } {
  const out = { slabs: 0, removedNodes: 0, refused: [] as string[] };
  const meshed = deferred().filter(g => g.physical.meshAtSolve.meshed && (!ids || ids.includes(g.id)));
  if (meshed.length === 0) return out;
  const plans = meshed.flatMap(g => {
    const quads = g.members.quads ?? [];
    const panel = g.physical.meshAtSolve.panel;
    const valid = quads.length > 0 && !g.members.plates?.length && quads.every(id => modelStore.quads.has(id))
      && panel.length === 4 && panel.every(id => modelStore.nodes.has(id));
    const loads = valid ? panelLoads(quads) : null;
    if (!loads) {
      out.refused.push(g.name);
      return [];
    }
    return [{ g, quads, panel, loads, first: modelStore.quads.get(quads[0]!)! }];
  });
  if (out.refused.length) return out;
  modelStore.batch(() => {
    for (const { g, quads, panel, loads, first } of plans) {
      const meshNodes = new Set(quads.flatMap((id) => modelStore.quads.get(id)!.nodes));
      for (const n of panel) meshNodes.delete(n);
      // The column ties the mesh made (`column-footprints.ts`) go with its nodes.
      releaseFootprintLinks(g.id);
      for (const id of quads) modelStore.removeQuad(id);
      const q = modelStore.addQuad(panel as [number, number, number, number], first.materialId, first.thickness);
      if (first.offset) modelStore.setShellOffset('quad', q, first.offset);
      modelStore.addLoadEntries(loads.map(l => l.type === 'surface3d'
        ? { type: l.type, data: { ...l.data, quadId: q } }
        : { type: l.type, data: { ...l.data, quadId: q } }));
      const group = modelStore.model.groups.get(g.id);
      if (group) modelStore.setGroupMembers(g.id, { ...group.members, quads: [q] });
      modelStore.setGroupData(g.id, { ...g.physical, meshAtSolve: { ...g.physical.meshAtSolve, meshed: false } } as unknown as Record<string, unknown>);
      // The beams the mesh cut along the panel's edges, whole again where nothing else holds the cut.
      const onEdge = [...modelStore.elements.values()].filter((e) => meshNodes.has(e.nodeI) || meshNodes.has(e.nodeJ)).map((e) => e.id);
      out.removedNodes += mergeCollinear(onEdge, plateNodeReferences()).removedNodes;
      // The mesh's own nodes inside the panel, now holding nothing.
      const held = retainedPlateNodes();
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
export function meshWithFootprints(quadId: number, size: number, owner?: number): ReturnType<typeof meshQuad> {
  const quad = modelStore.quads.get(quadId);
  if (!quad) return null;
  const corners = quad.nodes.map((id) => modelStore.nodes.get(id)!);
  const z = corners[0]?.z ?? 0;
  const columns = columnFootprintsAt(z);
  const grid = footprintGrid(corners, size, columns);
  const r = meshQuad(quadId, { density: { mode: 'targetSize', size }, splitBeams: true, ...(grid ? { mesh: grid, splitAt: outsideFootprints(columns, z) } : {}) });
  if (r && !('refused' in r) && grid) tieFootprints(new Set(r.quads.flatMap((q) => modelStore.quads.get(q)?.nodes ?? [])), columns, owner);
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
export function representFootprints(): { slabs: number; refused: string[] } {
  const ids = slabsWithoutFootprints();
  const result = { slabs: 0, refused: [] as string[] };
  if (!ids.length) return result;
  modelStore.batch(() => {
    result.refused = simplifySlabs(ids).refused;
    if (!result.refused.length) result.slabs = meshDeferredSlabs().slabs;
  });
  return result;
}
