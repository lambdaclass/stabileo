/**
 * Reverse a member: J becomes I, and its local x points the other way.
 *
 * The structure must not change, only how the member is described. So
 * everything recorded against an end or a local axis goes with it:
 *
 * - The end records swap: releases, 3D joints, member offsets.
 * - Positions measured from I are measured from the new I: a → L − a, and a
 *   partial load's [a, b] → [L − b, L − a] with its end values swapped.
 * - A plane member's transverse axis is the solver's, x turned 90°
 *   counter-clockwise, so it turns over with x: a local transverse load (and
 *   a local load at an angle, whose axial part turns over too) changes sign,
 *   as does a temperature gradient across it. A load given in global axes is
 *   the same load.
 * - A space member's local z is "up" made perpendicular to x, which does not
 *   depend on the sense of x; its y = z × x turns over. So a local qY/Py
 *   changes sign and qZ/Pz does not, and a roll angle about x changes sign.
 *   (With an explicit local-y reference it is the other way round: y is kept
 *   and z turns over.)
 *
 * Checked by solving before and after: same reactions, same displacements.
 */
import type { Element, Load } from './model.svelte';
import { hasExplicitLocalY } from '../model/element-3d-metadata';

interface ReversibleModel {
  nodes: Map<number, { x: number; y: number; z?: number }>;
  elements: Map<number, Element>;
  loads: Load[];
}

export function reverseElementInModel(model: ReversibleModel, id: number): boolean {
  const el = model.elements.get(id);
  if (!el) return false;
  const ni = model.nodes.get(el.nodeI), nj = model.nodes.get(el.nodeJ);
  if (!ni || !nj) return false;
  const L = Math.hypot(nj.x - ni.x, nj.y - ni.y, (nj.z ?? 0) - (ni.z ?? 0));
  const explicitY = hasExplicitLocalY(el);

  const next: Element = {
    ...el,
    nodeI: el.nodeJ,
    nodeJ: el.nodeI,
    releaseI: { ...el.releaseJ },
    releaseJ: { ...el.releaseI },
  };
  if (el.jointI || el.jointJ) {
    if (el.jointJ) next.jointI = { dof: [...el.jointJ.dof] as typeof el.jointJ.dof }; else delete next.jointI;
    if (el.jointI) next.jointJ = { dof: [...el.jointI.dof] as typeof el.jointI.dof }; else delete next.jointJ;
  }
  if (el.rollAngle) next.rollAngle = -el.rollAngle;
  if (el.offset) {
    const turn = (v?: { x: number; y: number; z: number }) => {
      if (!v) return undefined;
      if (el.offset!.frame !== 'local') return { ...v };
      return explicitY ? { x: -v.x, y: v.y, z: -v.z } : { x: -v.x, y: -v.y, z: v.z };
    };
    next.offset = {
      frame: el.offset.frame,
      ...(el.offset.j ? { i: turn(el.offset.j) } : {}),
      ...(el.offset.i ? { j: turn(el.offset.i) } : {}),
    };
  }
  model.elements.set(id, next);

  const span = (a: number | undefined, b: number | undefined) => {
    const out: { a?: number; b?: number } = {};
    if (a !== undefined || b !== undefined) {
      const na = L - (b ?? L), nb = L - (a ?? 0);
      if (na > 1e-12) out.a = na;
      if (b !== undefined || a !== undefined) out.b = nb;
    }
    return out;
  };

  model.loads = model.loads.map((l): Load => {
    const d = l.data as { elementId?: number };
    if (d.elementId !== id) return l;
    switch (l.type) {
      case 'distributed': {
        const q = l.data;
        const s = q.isGlobal ? 1 : -1;
        const { a: _a, b: _b, ...rest } = q;
        return { type: 'distributed', data: { ...rest, qI: s * q.qJ, qJ: s * q.qI, ...span(q.a, q.b) } };
      }
      case 'pointOnElement': {
        const p = l.data;
        const s = p.isGlobal ? 1 : -1;
        return {
          type: 'pointOnElement',
          data: { ...p, a: L - p.a, p: s * p.p, ...(p.px !== undefined ? { px: s * p.px } : {}) },
        };
      }
      case 'thermal':
        return { type: 'thermal', data: { ...l.data, dtGradient: -l.data.dtGradient } };
      case 'distributed3d': {
        const q = l.data;
        const sy = explicitY ? 1 : -1, sz = explicitY ? -1 : 1;
        const { a: _a, b: _b, ...rest } = q;
        return {
          type: 'distributed3d',
          data: { ...rest, qYI: sy * q.qYJ, qYJ: sy * q.qYI, qZI: sz * q.qZJ, qZJ: sz * q.qZI, ...span(q.a, q.b) },
        };
      }
      case 'pointOnElement3d': {
        const p = l.data;
        const sy = explicitY ? 1 : -1, sz = explicitY ? -1 : 1;
        return { type: 'pointOnElement3d', data: { ...p, a: L - p.a, py: sy * p.py, pz: sz * p.pz } };
      }
      default:
        return l;
    }
  });
  return true;
}
