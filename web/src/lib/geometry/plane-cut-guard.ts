import type { Constraint3D } from '../engine/types-3d';
import type { Element, Node, Section } from '../store/model.svelte';
import type { DrawPlane } from './plane-projection';
import { computeLocalAxes3D, memberRoll } from '../engine/local-axes-3d';
import { effectiveBendingInertia, spaceBendingInertias } from '../engine/solver-service';
import { solverProperties } from '../section/state';

/** The plane solver's [ux, uz, θ] for each space DOF that lies in the plane. */
const PLANE_DOFS: Record<DrawPlane, Record<number, number>> = {
  xz: { 0: 0, 2: 1, 4: 2 },
  yz: { 1: 0, 2: 1, 3: 2 },
  xy: { 0: 0, 1: 1, 5: 2 },
};

const NORMAL: Record<DrawPlane, [number, number, number]> = { xy: [0, 0, 1], xz: [0, 1, 0], yz: [1, 0, 0] };

function planeDofs(dofs: number[], plane: DrawPlane): string {
  return [...new Set(dofs.map((d) => PLANE_DOFS[plane][d]).filter((d) => d !== undefined))].sort().join();
}

function readAlike(c: Constraint3D, plane: DrawPlane): boolean {
  switch (c.type) {
    case 'rigidLink': return !c.dofs?.length || planeDofs(c.dofs, 'xz') === planeDofs(c.dofs, plane);
    case 'equalDOF': return planeDofs(c.dofs ?? [], 'xz') === planeDofs(c.dofs ?? [], plane);
    case 'diaphragm': return (c.plane ?? 'XY').toUpperCase() === (plane === 'yz' ? 'XY' : 'YZ');
    case 'linearMPC': return c.terms.every((t) => PLANE_DOFS.xz[t.dof] === PLANE_DOFS[plane][t.dof]);
    default: return false;
  }
}

function constraintNodes(c: Constraint3D): number[] {
  switch (c.type) {
    case 'diaphragm': return [c.masterNode, ...c.slaveNodes];
    case 'linearMPC': return c.terms.map((t) => t.nodeId);
    default: return [c.masterNode, c.slaveNode];
  }
}

/**
 * The constraints that reach a plane model cut on `plane` and that `constraintsTo2D`, which reads
 * every constraint as if the model stood in X–Z, would give another meaning there (#466).
 */
export function constraintsMisreadOn(
  plane: DrawPlane,
  constraints: readonly Constraint3D[],
  kept: ReadonlySet<number>,
): Constraint3D[] {
  if (plane === 'xz') return [];
  return constraints.filter((c) => constraintNodes(c).some((n) => kept.has(n)) && !readAlike(c, plane));
}

const QUARTER_TURN_SHAPES = new Set([undefined, 'I', 'H', 'RHS', 'CHS', 'rect']);

function turnsSafely(s: Section): boolean {
  return QUARTER_TURN_SHAPES.has(s.shape) && !s.polygon && !s.drawn && !s.composition;
}

export interface PlaneBending {
  /** Members whose plane bending the plane solver cannot represent: they couple in-plane and out-of-plane bending, or would need a section turned that is not doubly symmetric. */
  offAxis: number[];
  /** The sections of each member that the plane model must turn to `rotation` (0 or 90) for it to bend with its space inertia. */
  turns: Map<number, { rotation: 0 | 90; sections: number[] }>;
}

/**
 * How each frame member of a plane model cut on `plane` bends in that plane in the space model,
 * against the inertia the plane solver reads from its section's rotation (#1238).
 */
export function planeBending(
  plane: DrawPlane,
  memberIds: Iterable<number>,
  elements: ReadonlyMap<number, Element>,
  nodes: ReadonlyMap<number, Node>,
  sections: ReadonlyMap<number, Section>,
): PlaneBending {
  const n = NORMAL[plane];
  const offAxis: number[] = [];
  const turns = new Map<number, { rotation: 0 | 90; sections: number[] }>();
  for (const id of memberIds) {
    const e = elements.get(id);
    if (!e || e.type !== 'frame') continue;
    const a = nodes.get(e.nodeI), b = nodes.get(e.nodeJ);
    if (!a || !b) continue;
    const localY = e.localYx !== undefined && e.localYy !== undefined && e.localYz !== undefined
      ? { x: e.localYx, y: e.localYy, z: e.localYz } : undefined;
    let axes;
    try {
      axes = computeLocalAxes3D(
        { id: a.id, x: a.x, y: a.y, z: a.z ?? 0 }, { id: b.id, x: b.x, y: b.y, z: b.z ?? 0 },
        localY, memberRoll(e, sections),
      );
    } catch { continue; }
    const along = n[0] * axes.ex[0] + n[1] * axes.ex[1] + n[2] * axes.ex[2];
    const p = [n[0] - along * axes.ex[0], n[1] - along * axes.ex[1], n[2] - along * axes.ex[2]];
    const len = Math.hypot(p[0], p[1], p[2]);
    if (len < 1e-9) continue;
    const cy = (p[0] * axes.ey[0] + p[1] * axes.ey[1] + p[2] * axes.ey[2]) / len;
    const cz = (p[0] * axes.ez[0] + p[1] * axes.ez[1] + p[2] * axes.ez[2]) / len;
    const rotation: 0 | 90 = cz * cz > cy * cy ? 90 : 0;
    const skew = Math.min(cy * cy, cz * cz) > 1e-12;
    const sectionIds = [e.sectionId, ...(e.variableSection ? [e.variableSection.sectionJ] : [])];
    let off = false;
    const turned: number[] = [];
    for (const sid of sectionIds) {
      const s = sections.get(sid);
      if (!s) continue;
      if (skew && s.shape !== 'CHS') { off = true; continue; }
      const props = solverProperties(s);
      const { iy, iz } = spaceBendingInertias(s, props);
      const held = iy * cy * cy + iz * cz * cz;
      const across = iy * cz * cz + iz * cy * cy;
      const free = across > 0 ? (iy * iz) / across : held;
      const differs = (value: number, flat: number) => Math.abs(value - flat) > 1e-6 * Math.abs(flat);
      const flat = effectiveBendingInertia(s, props);
      if (!differs(held, flat) && !differs(free, flat)) continue;
      const planeFlat = effectiveBendingInertia({ ...s, rotation }, props);
      if (differs(held, planeFlat) || differs(free, planeFlat) || !turnsSafely(s)) off = true;
      else turned.push(sid);
    }
    if (off) offAxis.push(id);
    else if (turned.length > 0) turns.set(id, { rotation, sections: turned });
  }
  return { offAxis: offAxis.sort((x, y) => x - y), turns };
}

/** The members of `planeBending` that a plane model of the cut cannot bend as the space model does. */
export function membersBentOffAxis(
  plane: DrawPlane,
  memberIds: Iterable<number>,
  elements: ReadonlyMap<number, Element>,
  nodes: ReadonlyMap<number, Node>,
  sections: ReadonlyMap<number, Section>,
): number[] {
  return planeBending(plane, memberIds, elements, nodes, sections).offAxis;
}
