import type { SolverInput, SolverLoad } from '../engine/types';
import { planeSigns, type AxesFrame } from './frame';

/** The plane model with one of the user's axes reversed: the user's coordinates are x′ = sx·x and z′ = sz·z, and what turns from +x′ toward +z′ (rotations, couples, a member's local y) changes sense with sx·sz. */
export function planeMirrored(f: AxesFrame): boolean {
  const p = planeSigns(f);
  return p.sx < 0 || p.sz < 0;
}

export function planeInputIn(input: SolverInput, f: AxesFrame): SolverInput {
  if (!planeMirrored(f)) return input;
  const { sx, sz } = planeSigns(f);
  const m = sx * sz;
  const turn = (a: number | undefined) => (a === undefined ? a : Math.atan2(sz * Math.sin(a), sx * Math.cos(a)));
  const load = (l: SolverLoad): SolverLoad => {
    switch (l.type) {
      case 'nodal': return { type: 'nodal', data: { ...l.data, fx: sx * l.data.fx + 0, fz: sz * l.data.fz + 0, my: m * l.data.my + 0 } };
      case 'distributed': return { type: 'distributed', data: { ...l.data, qI: m * l.data.qI + 0, qJ: m * l.data.qJ + 0 } };
      case 'pointOnElement': return { type: 'pointOnElement', data: { ...l.data, p: m * l.data.p + 0, ...(l.data.my !== undefined ? { my: m * l.data.my + 0 } : {}) } };
      case 'thermal': return { type: 'thermal', data: { ...l.data, dtGradient: m * l.data.dtGradient + 0 } };
      default: return l;
    }
  };
  return {
    ...input,
    nodes: new Map([...input.nodes].map(([id, n]) => [id, { ...n, x: sx * n.x + 0, z: sz * n.z + 0 }])),
    supports: new Map([...input.supports].map(([id, s]) => [id, {
      ...s,
      ...(s.angle !== undefined ? { angle: turn(s.angle) } : {}),
      ...(s.dx !== undefined ? { dx: sx * s.dx + 0 } : {}),
      ...(s.dz !== undefined ? { dz: sz * s.dz + 0 } : {}),
      ...(s.dry !== undefined ? { dry: m * s.dry + 0 } : {}),
    }])),
    loads: input.loads.map(load),
  };
}
