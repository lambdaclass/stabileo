/**
 * The project's concrete as built, read once from the model for every output that draws or
 * measures it: the model viewer's physical mode, the reinforcement workspace and the sheets drawn
 * from its scene, the IFC export and the quantities (`engine/physical/physical-frame.ts`).
 *
 * One function so they cannot disagree: each of them used to sweep members from node to node on
 * its own, and the only way to keep five copies of a joint rule in step is to have one.
 *
 * Memoised twice: on the model's version and its collections (no work at all while nothing
 * changed, however often a view asks), then on a signature of what the geometry reads (nodes,
 * members, sections, concrete shells and which materials are concrete), so an edit that does not
 * move concrete (a load, a name) keeps the frame. While a node is dragged it is rebuilt at most
 * every `DRAG_MS` (`setGeometryDrag`); the release rebuilds it from the final position.
 */
import { modelStore } from './model.svelte';
import { buildPhysicalFrame, type PhysicalFrame, type PhysicalShell, type PrismLayer } from '../engine/physical/physical-frame';
import { materialFamilyOf } from '../engine/steel/material-family';
import { catalogueGradeFamily } from '../engine/steel/grade-family';

/**
 * Whether a material is cast concrete for this geometry: classified concrete, or with no strength
 * to classify it by (the concrete examples state `fy` in the concrete band; an unknown is not
 * claimed as metal). Steel, timber, aluminium and masonry keep their own drawing.
 */
export function isCastConcrete(materialId: number): boolean {
  const f = materialFamilyOf(modelStore.model.materials.get(materialId) as never, catalogueGradeFamily).family;
  return f === 'concrete' || f === 'unknown';
}

let memo: { key: string; frame: PhysicalFrame; version: number; collections: readonly unknown[]; at: number } | null = null;

/** While a node is being dragged: the frame is rebuilt at most this often, ms. */
const DRAG_MS = 150;
let dragging = false;
/** A drag starts or ends; at the end the next ask rebuilds from where the node was left. */
export function setGeometryDrag(on: boolean): void { dragging = on; if (!on && memo) memo.version = -1; }

const collections = () => { const m = modelStore.model; return [m.nodes, m.elements, m.sections, m.quads, m.plates, m.materials]; };
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function signature(): string {
  const m = modelStore.model;
  const parts: string[] = [];
  const r = (v: number | undefined) => (v === undefined ? '' : Math.round(v * 1e6));
  for (const n of m.nodes.values()) parts.push(`n${n.id}:${r(n.x)},${r(n.y)},${r(n.z)}`);
  for (const e of m.elements.values()) parts.push(`e${e.id}:${e.type},${e.nodeI},${e.nodeJ},${e.sectionId},${e.materialId},${e.rollAngle ?? ''},${e.localYx ?? ''},${e.localYy ?? ''},${e.localYz ?? ''},${e.offset ? JSON.stringify(e.offset) : ''}`);
  for (const s of m.sections.values()) parts.push(`s${s.id}:${r(s.b)},${r(s.h)},${s.rotation ?? ''},${s.shape ?? ''}`);
  for (const q of m.quads.values()) parts.push(`q${q.id}:${q.nodes.join(',')},${r(q.thickness)},${q.materialId},${q.offset ? JSON.stringify(q.offset) : ''}`);
  for (const p of m.plates.values()) parts.push(`p${p.id}:${p.nodes.join(',')},${r(p.thickness)},${p.materialId},${p.offset ? JSON.stringify(p.offset) : ''}`);
  for (const mat of m.materials.values()) parts.push(`m${mat.id}:${isCastConcrete(mat.id) ? 1 : 0}`);
  return parts.join('|');
}

/** The concrete shells of the model, keyed as the quantities and the IFC key them (`q12`, `p3`). */
export function concreteShells(): PhysicalShell[] {
  const m = modelStore.model;
  return [
    ...[...m.quads.values()].filter((q) => isCastConcrete(q.materialId)).map((q) => ({ key: `q${q.id}`, nodes: [...q.nodes], thickness: q.thickness, ...(q.offset ? { offset: q.offset } : {}) })),
    ...[...m.plates.values()].filter((p) => isCastConcrete(p.materialId)).map((p) => ({ key: `p${p.id}`, nodes: [...p.nodes], thickness: p.thickness, ...(p.offset ? { offset: p.offset } : {}) })),
  ];
}

/** The physical frame of the current model. */
export function projectPhysicalFrame(): PhysicalFrame {
  const version = modelStore.modelVersion, cols = collections();
  if (memo && memo.version === version && memo.collections.every((c, i) => c === cols[i])) return memo.frame;
  if (memo && dragging && now() - memo.at < DRAG_MS) return memo.frame;
  const key = signature();
  if (memo && memo.key === key) { memo = { ...memo, version, collections: cols, at: now() }; return memo.frame; }
  const m = modelStore.model;
  const frame = buildPhysicalFrame({
    // Rectangles only: a T or an L section states its outline in other fields, and a rectangle of
    // its b × h would measure concrete nobody specified. Those keep their node-to-node rules.
    elementIds: [...m.elements.values()].filter((e) => {
      const shape = m.sections.get(e.sectionId)?.shape;
      return e.type !== 'truss' && (shape === undefined || shape === 'rect') && isCastConcrete(e.materialId);
    }).map((e) => e.id).sort((a, b) => a - b),
    nodes: [...m.nodes.values()],
    elements: [...m.elements.values()],
    sections: [...m.sections.values()],
    shells: concreteShells(),
  });
  memo = { key, frame, version, collections: cols, at: now() };
  return frame;
}

/**
 * What the model viewer draws for a member in its physical mode: the member's concrete as cut and
 * the joints attributed to it. Undefined where the frame did not cut the member (it keeps its
 * section); empty where the joints took it whole.
 */
export function physicalLayersOf(frame: PhysicalFrame, elementId: number): PrismLayer[] | undefined {
  const cut = frame.member.get(elementId);
  if (!cut || cut.kind === 'member') return undefined;
  return [...cut.layers, ...(frame.owned.get(elementId) ?? []).flatMap((j) => j.layers)];
}
