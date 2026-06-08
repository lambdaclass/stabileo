// Analytical shell offsets via ephemeral helper nodes + eccentric constraints.
//
// Mirrors member-offsets.ts for shells. A shell with offset metadata has its
// mid-surface parallel-shifted off its node plane. Inside the solver-input
// builder we, per shell corner:
//   - generate a helper node at corner + offset,
//   - retarget the shell's corner to the helper node,
//   - add an EccentricConnection (master = real joint, slave = helper, all 6
//     DOF rigid) so the shell's corner forces transfer to the joint through a
//     rigid arm — producing real eccentricity.
//
// Shell nodes are 6-DOF (has_plate/has_quad), so the all-6-DOF rigid link is
// DOF-compatible and needs NO solver change — the same EccentricConnection the
// member offsets already use. Helpers live only in the solver input and are
// pruned from results (pruneHelperNodeResults). Shared corners are safe: each
// offset shell gets its OWN helper per corner, each rigidly tied to the base
// node — independent offset surfaces, no conflict.

import type { SolverInput3D } from './types-3d';
import type { Plate, Quad } from '../store/model.svelte';
import type { ShellOffset } from '../model/element-3d-metadata';

const EPS = 1e-9;
const RIGID_RELEASES = [false, false, false, false, false, false];

/** True if a shell carries a non-zero offset. */
export function hasShellOffset(s: { offset?: ShellOffset }): boolean {
  const o = s.offset;
  return !!o && (Math.abs(o.x) > EPS || Math.abs(o.y) > EPS || Math.abs(o.z) > EPS);
}

/** Any plate/quad carries an offset. */
export function modelHasShellOffsets(
  plates: Map<number, Plate> | undefined,
  quads: Map<number, Quad> | undefined,
): boolean {
  if (plates) for (const p of plates.values()) if (hasShellOffset(p)) return true;
  if (quads) for (const q of quads.values()) if (hasShellOffset(q)) return true;
  return false;
}

type V3 = { x: number; y: number; z: number };

/** Shell local frame from corner geometry: ex along edge0→1, ez the face
 *  normal, ey = ez × ex. (Visual/offset convention only — not a solver axis.) */
function shellAxes(verts: V3[]): { ex: V3; ey: V3; ez: V3 } | null {
  const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
  const cross = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
  const norm = (v: V3): V3 | null => { const L = Math.hypot(v.x, v.y, v.z); return L > 1e-12 ? { x: v.x / L, y: v.y / L, z: v.z / L } : null; };
  const ex = norm(sub(verts[1], verts[0]));
  const ez = norm(cross(sub(verts[1], verts[0]), sub(verts[2], verts[0])));
  if (!ex || !ez) return null;
  const ey = cross(ez, ex);
  return { ex, ey, ez };
}

/** Resolve a shell offset to a global vector given the shell's corner points
 *  (for viewport preview + solver expansion). Returns null if degenerate. */
export function resolveShellOffsetGlobal(o: ShellOffset, corners: V3[]): V3 | null {
  if (o.frame === 'global') return { x: o.x, y: o.y, z: o.z };
  const axes = shellAxes(corners);
  if (!axes) return null;
  return offsetToGlobal(o, axes);
}

/** Resolve an offset vector to solver-space global coordinates. */
function offsetToGlobal(o: ShellOffset, axes: { ex: V3; ey: V3; ez: V3 }): V3 {
  if (o.frame === 'global') return { x: o.x, y: o.y, z: o.z };
  return {
    x: o.x * axes.ex.x + o.y * axes.ey.x + o.z * axes.ez.x,
    y: o.x * axes.ex.y + o.y * axes.ey.y + o.z * axes.ez.y,
    z: o.x * axes.ex.z + o.y * axes.ey.z + o.z * axes.ez.z,
  };
}

/**
 * Mutate `input` in place: expand offset shells into per-corner helper nodes +
 * eccentric constraints. Deterministic helper ids (max existing node id +
 * sequential; plates before quads, id order, corner order). No-op when no shell
 * carries an offset. Returns the set of helper node ids created.
 *
 * Run AFTER expandMemberOffsets so helper ids continue past any member helpers
 * (nextId is recomputed from input.nodes). Genuine 3D only (caller gates).
 */
export function expandShellOffsets(
  input: SolverInput3D,
  modelPlates: Map<number, Plate> | undefined,
  modelQuads: Map<number, Quad> | undefined,
): Set<number> {
  const helperIds = new Set<number>();
  const shells: Array<{ kind: 'p' | 'q'; offset: ShellOffset; id: number }> = [];
  for (const p of [...(modelPlates?.values() ?? [])].sort((a, b) => a.id - b.id)) if (hasShellOffset(p)) shells.push({ kind: 'p', offset: p.offset!, id: p.id });
  for (const q of [...(modelQuads?.values() ?? [])].sort((a, b) => a.id - b.id)) if (hasShellOffset(q)) shells.push({ kind: 'q', offset: q.offset!, id: q.id });
  if (shells.length === 0) return helperIds;

  let nextId = 0;
  for (const id of input.nodes.keys()) if (id > nextId) nextId = id;
  nextId += 1;

  const constraints = [...(input.constraints ?? [])];

  for (const { kind, offset, id } of shells) {
    // A curved quad's solver entry lives in curvedShells, not quads.
    const solverShell: any = kind === 'p'
      ? input.plates?.get(id)
      : (input.quads?.get(id) ?? input.curvedShells?.get(id));
    if (!solverShell) continue;
    const corners: V3[] = [];
    let ok = true;
    for (const nid of solverShell.nodes) { const n = input.nodes.get(nid); if (!n) { ok = false; break; } corners.push(n); }
    if (!ok) continue;
    const axes = shellAxes(corners);
    if (!axes) continue;
    const v = offsetToGlobal(offset, axes);

    // Replace (don't mutate) the nodes array — the solver input reuses the
    // model's array reference, so in-place edits would corrupt the model.
    const newNodes = [...solverShell.nodes];
    for (let k = 0; k < newNodes.length; k++) {
      const jointId = newNodes[k];
      const joint = input.nodes.get(jointId)!;
      const helperId = nextId++;
      input.nodes.set(helperId, { id: helperId, x: joint.x + v.x, y: joint.y + v.y, z: joint.z + v.z });
      helperIds.add(helperId);
      newNodes[k] = helperId;
      constraints.push({
        type: 'eccentricConnection',
        masterNode: jointId,
        slaveNode: helperId,
        offsetX: v.x, offsetY: v.y, offsetZ: v.z,
        releases: [...RIGID_RELEASES],
      } as any);
    }
    solverShell.nodes = newNodes;
  }

  input.constraints = constraints;
  return helperIds;
}
