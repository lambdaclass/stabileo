/**
 * Reverse members: I becomes J. The section keeps its orientation (its local y is pinned to what
 * it was, so the web stays where it was), which reverses local x and so local z. Everything stated
 * per end or along the member follows: releases, joints, semi-rigid ends, offsets and a variable
 * member's two sections swap ends;
 * member loads are mirrored along the length, and their local z components change sign — a
 * temperature gradient too, since it is stated across local z.
 *
 * A plane load (`distributed`, `pointOnElement`) is stated against the member's direction, so
 * what the reversal does to it is what reversing that direction does: its axial part turns
 * round, and so does its transverse part unless it is in the drawn axes of a flat model, which
 * do not depend on the direction (`transverse-sign-2d.ts`). Global ones only move along.
 *
 * A member with reinforcement is not reversed: its regions are laid from end I, and reversing
 * them is the design's to redo. One undo step.
 */
import { modelStore } from '../../store/model.svelte';
import { computeLocalAxes3D } from '../../engine/local-axes-3d';
import { shouldEmbedFlat2DModelIn3D } from '../../engine/solver-service';

export interface FlipReport { flipped: number[]; skipped: Array<{ id: number; reason: 'reinforced' | 'missing' }> }

export function flipMembers(ids: Iterable<number>): FlipReport {
  const report: FlipReport = { flipped: [], skipped: [] };
  const todo = [...new Set(ids)];
  // Flat models state plane loads in the drawn axes; reversing a member does not change that.
  const flat = shouldEmbedFlat2DModelIn3D(modelStore.model as never);
  modelStore.batch(() => {
    for (const id of todo) {
      const e = modelStore.elements.get(id);
      const a = e && modelStore.nodes.get(e.nodeI), b = e && modelStore.nodes.get(e.nodeJ);
      if (!e || !a || !b) { report.skipped.push({ id, reason: 'missing' }); continue; }
      if (e.reinforcement) { report.skipped.push({ id, reason: 'reinforced' }); continue; }
      const P = (n: typeof a) => ({ x: n.x, y: n.y ?? 0, z: n.z ?? 0 });
      const localY = e.localYx !== undefined && e.localYy !== undefined && e.localYz !== undefined ? { x: e.localYx, y: e.localYy, z: e.localYz } : undefined;
      const axes = computeLocalAxes3D(P(a) as never, P(b) as never, localY, e.rollAngle);
      const L = axes.L;
      const off = e.offset;
      const mirror = (v?: { x: number; y: number; z: number }) => (v && off?.frame === 'local' ? { x: -v.x, y: v.y, z: -v.z } : v);
      modelStore.updateElement(id, {
        nodeI: e.nodeJ, nodeJ: e.nodeI,
        releaseI: e.releaseJ, releaseJ: e.releaseI,
        jointI: e.jointJ, jointJ: e.jointI,
        ...(e.variableSection ? { sectionId: e.variableSection.sectionJ, variableSection: { ...e.variableSection, sectionJ: e.sectionId } } : {}),
        ...(e.semiRigid ? { semiRigid: { ...(e.semiRigid.j ? { i: e.semiRigid.j } : {}), ...(e.semiRigid.i ? { j: e.semiRigid.i } : {}) } } : {}),
        ...(off ? { offset: { frame: off.frame, ...(off.j ? { i: mirror(off.j) } : {}), ...(off.i ? { j: mirror(off.i) } : {}) } } : {}),
        localYx: axes.ey[0], localYy: axes.ey[1], localYz: axes.ey[2], rollAngle: 0,
      } as never);
      // Member loads along the reversed member.
      const next = modelStore.loads.map((l) => {
        const d = l.data as unknown as Record<string, number | undefined>;
        if (d.elementId !== id) return l;
        if (l.type === 'distributed3d') {
          const aa = d.a ?? 0, bb = d.b ?? L;
          const span = d.a !== undefined || d.b !== undefined ? { a: L - bb, b: L - aa } : {};
          // Global and projected loads point where they pointed: only the ends swap. A local one
          // follows the reversed axes, x and z turning over with the section kept in place.
          if ((d as { frame?: string }).frame === 'global' || (d as { frame?: string }).frame === 'projected') {
            return { ...l, data: { ...d, qYI: d.qYJ, qYJ: d.qYI, qZI: d.qZJ, qZJ: d.qZI, ...(d.qXI !== undefined || d.qXJ !== undefined ? { qXI: d.qXJ, qXJ: d.qXI } : {}), ...span } };
          }
          return { ...l, data: { ...d, qYI: d.qYJ, qYJ: d.qYI, qZI: -(d.qZJ ?? 0), qZJ: -(d.qZI ?? 0), ...(d.qXI !== undefined || d.qXJ !== undefined ? { qXI: -(d.qXJ ?? 0), qXJ: -(d.qXI ?? 0) } : {}), ...span } };
        }
        if (l.type === 'pointOnElement3d') return { ...l, data: { ...d, a: L - (d.a ?? 0), pz: -(d.pz ?? 0) } };
        if (l.type === 'thermal') return { ...l, data: { ...d, dtGradient: -(d.dtGradient ?? 0) } };
        const local = !(l.data as { isGlobal?: boolean }).isGlobal;
        // A local plane load: axial part reversed; transverse part too, outside a flat model.
        // In a flat model that is the angle's sign; elsewhere the whole load's.
        const turn = (q: number | undefined) => (local && !flat ? -(q ?? 0) : q);
        const angle = local && flat && d.angle ? { angle: -d.angle } : {};
        if (l.type === 'distributed') {
          const aa = d.a ?? 0, bb = d.b ?? L;
          return { ...l, data: { ...d, qI: turn(d.qJ), qJ: turn(d.qI), ...angle, ...(d.a !== undefined || d.b !== undefined ? { a: L - bb, b: L - aa } : {}) } };
        }
        if (l.type === 'pointOnElement') {
          return { ...l, data: { ...d, a: L - (d.a ?? 0), p: turn(d.p), ...angle, ...(d.px !== undefined ? { px: -d.px } : {}) } };
        }
        return l;
      });
      modelStore.replaceLoads(next as never);
      report.flipped.push(id);
    }
  });
  return report;
}
