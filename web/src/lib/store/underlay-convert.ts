/**
 * Putting a confirmed conversion plan in the model (`model/underlay-convert.ts`), as one undo
 * step: nodes on the points (onto a node already there within the tolerance), members on the
 * pieces, curved members on the arcs, columns down to the level below, the pieces met at a T cut
 * there. What it made is kept as a group of kind `dxfConversion`, with the template and layers it
 * came from, so it can be found and reviewed.
 */
import { modelStore } from './model.svelte';
import { createArc } from './curved-members';
import { splitAtNodes } from '../model/edit/cut-members';
import { segmentsForTolerance, arcThroughThree } from '../model/curved-member';
import type { ConvertPlan } from '../model/underlay-convert';
import type { Underlay } from '../model/underlay';
import { NodeIndex } from '../model/edit/node-index';
import type { Vec3 } from '../model/edit/affine';

export interface ConvertChoices { beamSection: number; columnSection: number; materialId: number; tol: number; columnFootZ: number | null; memberLayers: readonly string[]; columnLayers: readonly string[] }

export function applyConversion(u: Underlay, plan: ConvertPlan, c: ConvertChoices): { members: number; arcs: number; columns: number; groupId: number } {
  const made: number[] = [];
  let arcs = 0, columns = 0, groupId = -1;
  modelStore.batch(() => {
    // The model's nodes hashed once: a plan of thousands of points looked each one up against every node.
    const index = new NodeIndex(c.tol);
    const pos = (id: number): Vec3 | undefined => { const n = modelStore.nodes.get(id); return n ? [n.x, n.y, n.z ?? 0] : undefined; };
    for (const [id, n] of modelStore.nodes) index.add(id, [n.x, n.y, n.z ?? 0]);
    const nodeAt = (x: number, y: number, z: number): number => {
      const hit = index.find([x, y, z], pos);
      if (hit !== null) return hit;
      const id = modelStore.addNode(x, y, z);
      index.add(id, [x, y, z]);
      return id;
    };
    const member = (i: number, j: number, sectionId: number) => {
      const id = modelStore.addElement(i, j);
      modelStore.updateElement(id, { sectionId, materialId: c.materialId } as never);
      made.push(id);
    };
    for (const b of plan.beams) member(nodeAt(b.a[0], b.a[1], plan.z), nodeAt(b.b[0], b.b[1], plan.z), c.beamSection);
    for (const a of plan.arcs) {
      const i = nodeAt(a.a[0], a.a[1], plan.z), j = nodeAt(a.b[0], a.b[1], plan.z);
      const through = { x: a.mid[0], y: a.mid[1], z: plan.z };
      const g = arcThroughThree({ x: a.a[0], y: a.a[1], z: plan.z }, through, { x: a.b[0], y: a.b[1], z: plan.z });
      const ids = createArc(i, through, j, g ? Math.max(2, segmentsForTolerance(g, 0.02)) : 2);
      for (const id of ids) modelStore.updateElement(id, { sectionId: c.beamSection, materialId: c.materialId } as never);
      made.push(...ids); arcs++;
    }
    if (c.columnFootZ !== null) {
      for (const col of plan.columns) { member(nodeAt(col.at[0], col.at[1], c.columnFootZ), nodeAt(col.at[0], col.at[1], plan.z), c.columnSection); columns++; }
    }
    // The pieces an end meets at its middle are cut there, so the two are joined.
    const tees = plan.tees.map((p) => nodeAt(p[0], p[1], plan.z));
    const replaced = new Map<number, number[]>();
    if (tees.length) for (const x of splitAtNodes(made.filter((id) => modelStore.elements.has(id)), tees).cut) replaced.set(x.elementId, x.segments);
    const kept = made.flatMap((id) => replaced.get(id) ?? [id]).filter((id) => modelStore.elements.has(id));
    groupId = modelStore.addGroup(`DXF · ${u.name}`, 'dxfConversion', { elements: kept }, {
      data: { underlay: u.id, memberLayers: [...c.memberLayers], columnLayers: [...c.columnLayers], tol: c.tol, at: new Date().toISOString() },
    });
  });
  return { members: made.length, arcs, columns, groupId };
}
