/**
 * Move, rotate or mirror a set of entities where it is, keeping its connections.
 *
 * The set's nodes move. A member with both ends in the set moves rigidly and its frame, offsets,
 * joints and local loads are carried exactly as a copy's would be. A member with one end in the
 * set and one outside stretches to follow — which is what "keeping connections" means — and keeps
 * its automatic frame. Supports and nodal loads on moved nodes are carried with them.
 *
 * One undo step.
 */

import { modelStore } from '../../store/model.svelte';
import type { Element, Load, NodalLoad3D, DistributedLoad3D, PointLoadOnElement3D, ThermalLoad } from '../../store/model.svelte';
import { applyAxial, applyPoint, applyVector, isReflection, reflection, rotation, type Affine } from './affine';
import { carriedJoint, carriedOffset, carriedOrientation, carriedSupport, type EditWarning } from './transform-fields';
import { closure, type EntitySet } from './transformed-copy';

export interface InPlaceReport {
  movedNodes: number;
  rigidMembers: number;
  stretchedMembers: number;
  warnings: Partial<Record<EditWarning, number>>;
}

export function transformInPlace(set: EntitySet, T: Affine, opts: { leftHand?: boolean } = {}): InPlaceReport {
  const src = closure(set);
  const report: InPlaceReport = { movedNodes: 0, rigidMembers: 0, stretchedMembers: 0, warnings: {} };
  const warn = (w: EditWarning) => { report.warnings[w] = (report.warnings[w] ?? 0) + 1; };
  if (src.nodes.size === 0) return report;

  modelStore.batch(() => {
    const before = new Map([...src.nodes].map((id) => [id, { ...modelStore.nodes.get(id)! }]));
    // Members wholly inside move rigidly; their frames are read before anything moves.
    const rigid = [...modelStore.elements.values()].filter((e) => src.nodes.has(e.nodeI) && src.nodes.has(e.nodeJ));
    report.stretchedMembers = [...modelStore.elements.values()].filter((e) => src.nodes.has(e.nodeI) !== src.nodes.has(e.nodeJ)).length;

    for (const [id, n] of before) {
      const p = applyPoint(T, [n.x, n.y, n.z ?? 0]);
      modelStore.updateNode(id, p[0], p[1], p[2]);
      report.movedNodes++;
    }

    const signs = new Map<number, { sy: 1 | -1; sz: 1 | -1 }>();
    for (const e0 of rigid) {
      const e = JSON.parse(JSON.stringify(e0)) as Element;
      const ni = before.get(e.nodeI)!, nj = before.get(e.nodeJ)!;
      const ni2 = modelStore.nodes.get(e.nodeI)!, nj2 = modelStore.nodes.get(e.nodeJ)!;
      const o = carriedOrientation(T, e, ni, nj, ni2, nj2, modelStore.sections.get(e.sectionId), opts.leftHand ?? false);
      if (!o.exact) warn('asymmetricProfile');
      signs.set(e.id, { sy: o.sy, sz: o.sz });
      const patch: Partial<Element> = { localYx: undefined, localYy: undefined, localYz: undefined, rollAngle: undefined, ...o.fields };
      const jI = carriedJoint(T, e.jointI), jJ = carriedJoint(T, e.jointJ);
      if (jI === null || jJ === null) warn('jointDropped');
      patch.jointI = jI ?? undefined;
      patch.jointJ = jJ ?? undefined;
      patch.offset = carriedOffset(T, e.offset, o.sy, o.sz);
      if (e.arc) {
        const mp = (v: { x: number; y: number; z: number }) => { const q = applyPoint(T, [v.x, v.y, v.z]); return { x: q[0], y: q[1], z: q[2] }; };
        patch.arc = { id: e.arc.id, spec: { ...e.arc.spec, start: mp(e.arc.spec.start), through: mp(e.arc.spec.through), end: mp(e.arc.spec.end) } };
      }
      modelStore.updateElement(e.id, patch);
      report.rigidMembers++;
    }

    // Shells move rigidly whenever all their nodes move, including node-only selections.
    const rigidQuads = [...modelStore.quads.values()].filter((q) => q.nodes.every((n) => src.nodes.has(n))).map((q) => q.id);
    const rigidPlates = [...modelStore.plates.values()].filter((p) => p.nodes.every((n) => src.nodes.has(n))).map((p) => p.id);

    // Global shell eccentricities are physical vectors, including for rotations without reflection.
    for (const [kind, ids, shells] of [
      ['quad', rigidQuads, modelStore.quads], ['plate', rigidPlates, modelStore.plates],
    ] as const) {
      for (const id of ids) {
        const offset = shells.get(id)?.offset;
        if (offset?.frame !== 'global') continue;
        const v = applyVector(T, [offset.x, offset.y, offset.z]);
        modelStore.setShellOffset(kind, id, { frame: 'global', x: v[0], y: v[1], z: v[2] });
      }
    }

    if (isReflection(T)) {
      for (const id of rigidQuads) {
        const q = modelStore.quads.get(id);
        if (q && q.nodes.every((n) => src.nodes.has(n))) modelStore.updateQuadNodes(id, [q.nodes[0], q.nodes[3], q.nodes[2], q.nodes[1]]);
      }
      for (const id of rigidPlates) {
        const p = modelStore.plates.get(id);
        if (p && p.nodes.every((n) => src.nodes.has(n))) modelStore.updatePlateNodes(id, [p.nodes[0], p.nodes[2], p.nodes[1]]);
      }
    }

    const identity = new Map([...modelStore.elements.keys()].map((id) => [id, id]));
    for (const s of [...modelStore.supports.values()]) {
      if (!src.nodes.has(s.nodeId)) continue;
      const c = carriedSupport(T, s, s.nodeId, identity);
      if (c) modelStore.addSupportEntry(c);
      else { modelStore.removeSupport(s.id); warn('supportDropped'); }
    }

    const moved = (l: Load): Load | null => {
      switch (l.type) {
        case 'nodal3d': {
          const n = l.data as NodalLoad3D;
          if (!src.nodes.has(n.nodeId)) return null;
          const F = applyVector(T, [n.fx, n.fy, n.fz]), M = applyAxial(T, [n.mx, n.my, n.mz]);
          return { type: 'nodal3d', data: { ...n, fx: F[0], fy: F[1], fz: F[2], mx: M[0], my: M[1], mz: M[2] } };
        }
        case 'distributed3d': {
          const q = l.data as DistributedLoad3D; const g = signs.get(q.elementId); if (!g) return null;
          return { type: 'distributed3d', data: { ...q, qYI: g.sy * q.qYI, qYJ: g.sy * q.qYJ, qZI: g.sz * q.qZI, qZJ: g.sz * q.qZJ } };
        }
        case 'pointOnElement3d': {
          const q = l.data as PointLoadOnElement3D; const g = signs.get(q.elementId); if (!g) return null;
          return { type: 'pointOnElement3d', data: { ...q, py: g.sy * q.py, pz: g.sz * q.pz } };
        }
        case 'thermal': {
          const q = l.data as ThermalLoad; const g = signs.get(q.elementId); if (!g) return null;
          return { type: 'thermal', data: { ...q, dtGradient: g.sz * q.dtGradient } };
        }
        default: return null;
      }
    };
    const next = modelStore.loads.map((l) => moved(l) ?? l);
    modelStore.replaceLoads(next);
  });
  return report;
}

/** The centre of a set of nodes. */
function centreOf(nodeIds: Iterable<number>): [number, number, number] | null {
  let n = 0; const c: [number, number, number] = [0, 0, 0];
  for (const id of nodeIds) { const p = modelStore.nodes.get(id); if (!p) continue; c[0] += p.x; c[1] += p.y; c[2] += p.z ?? 0; n++; }
  return n ? [c[0] / n, c[1] / n, c[2] / n] : null;
}

/**
 * Mirror the selected nodes, and every member wholly among them, in place — about the plane
 * through their centre normal to global X or Y. What the context menu's "mirror" does.
 */
export function mirrorSelectionInPlace(nodeIds: Iterable<number>, axis: 'x' | 'y', opts: { leftHand?: boolean } = {}): InPlaceReport | null {
  const ids = [...nodeIds];
  const c = centreOf(ids);
  if (!c) return null;
  return transformInPlace({ nodes: ids, elements: [] }, reflection(c, axis === 'x' ? [1, 0, 0] : [0, 1, 0]), opts);
}

/** Rotate the selected nodes about the vertical axis through their centre, in place. */
export function rotateSelectionInPlace(nodeIds: Iterable<number>, deg: number, opts: { leftHand?: boolean } = {}): InPlaceReport | null {
  const ids = [...nodeIds];
  const c = centreOf(ids);
  if (!c) return null;
  return transformInPlace({ nodes: ids, elements: [] }, rotation(c, [0, 0, 1], deg), opts);
}
