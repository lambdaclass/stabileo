/**
 * The plane model every explained method reads: the solver's own 2D input
 * (so the loads are exactly the ones the matrix solve sees, self-weight
 * included), put in the terms a hand calculation uses.
 *
 * - Nodes get letter names, A, B, C … in id order, as the documents write them.
 * - Members carry length, direction cosines, EI and EA in kN and m
 *   (the input's E is MPa).
 * - Supports become restraints: which of ux, uz, θ each one holds.
 * - Member loads stay in the member's own axes, the solver's: x from I to J,
 *   y a quarter turn counter-clockwise from x. A load q > 0 pushes towards +y.
 *   For a member drawn left to right +y is up, so a gravity load is q < 0.
 *   `w = -q` is the classical "positive downward" load of a horizontal span
 *   traversed left to right; fem.ts works with it.
 */
import type { SolverInput, SupportType } from '../types';
import { letterName } from './format';

export interface PNode { id: number; x: number; z: number; name: string }

export interface PMember {
  id: number;
  i: number;
  j: number;
  /** Name by its end nodes, "A–B". */
  name: string;
  L: number;
  /** Direction cosines of I→J. */
  c: number;
  s: number;
  /** kN/m², m², m⁴ and their products. */
  E: number;
  A: number;
  I: number;
  EI: number;
  EA: number;
  truss: boolean;
  hingeI: boolean;
  hingeJ: boolean;
}

export interface PSupport {
  node: number;
  type: SupportType;
  /** What the support holds. A spring holds nothing rigidly. */
  ux: boolean;
  uz: boolean;
  ry: boolean;
  kx?: number;
  kz?: number;
  kr?: number;
  /** Rolling surface angle of an inclined roller, rad. */
  angle?: number;
  /** Prescribed movements (settlements), m and rad. */
  dx?: number;
  dz?: number;
  dry?: number;
}

export type PMemberLoad =
  /** Linearly varying over [a, b] from the I end, local y, kN/m. */
  | { kind: 'dist'; member: number; a: number; b: number; qa: number; qb: number }
  /** At a from the I end: p along local y, px along the axis (towards J), m a counter-clockwise couple. */
  | { kind: 'point'; member: number; a: number; p: number; px: number; m: number }
  | { kind: 'thermal'; member: number; dtUniform: number; dtGradient: number };

export interface PNodalLoad { node: number; fx: number; fz: number; my: number }

export interface PlaneModel {
  nodes: Map<number, PNode>;
  members: Map<number, PMember>;
  /** By node id. */
  supports: Map<number, PSupport>;
  memberLoads: PMemberLoad[];
  nodalLoads: PNodalLoad[];
  /** Node ids in naming order. */
  nodeOrder: number[];
  /** Member ids in id order. */
  memberOrder: number[];
}

export function supportRestraints(type: SupportType): { ux: boolean; uz: boolean; ry: boolean } {
  switch (type) {
    case 'fixed': return { ux: true, uz: true, ry: true };
    case 'pinned': return { ux: true, uz: true, ry: false };
    case 'rollerX': return { ux: false, uz: true, ry: false };
    case 'rollerZ': return { ux: true, uz: false, ry: false };
    // Along its surface it moves; normal to it, held. In global terms it holds a mix.
    case 'inclinedRoller': return { ux: false, uz: false, ry: false };
    default: return { ux: false, uz: false, ry: false };
  }
}

export function planeModel(input: SolverInput): PlaneModel {
  const nodeOrder = [...input.nodes.keys()].sort((a, b) => a - b);
  const nodes = new Map<number, PNode>();
  nodeOrder.forEach((id, k) => {
    const n = input.nodes.get(id)!;
    nodes.set(id, { id, x: n.x, z: n.z, name: letterName(k) });
  });

  const memberOrder = [...input.elements.keys()].sort((a, b) => a - b);
  const members = new Map<number, PMember>();
  for (const id of memberOrder) {
    const e = input.elements.get(id)!;
    const ni = nodes.get(e.nodeI)!, nj = nodes.get(e.nodeJ)!;
    const dx = nj.x - ni.x, dz = nj.z - ni.z;
    const L = Math.hypot(dx, dz);
    const mat = input.materials.get(e.materialId);
    const sec = input.sections.get(e.sectionId);
    const E = (mat?.e ?? 0) * 1000;
    const A = sec?.a ?? 0;
    const I = sec?.iz ?? 0;
    members.set(id, {
      id, i: e.nodeI, j: e.nodeJ, name: `${ni.name}–${nj.name}`,
      L, c: L > 0 ? dx / L : 1, s: L > 0 ? dz / L : 0,
      E, A, I, EI: E * I, EA: E * A,
      truss: e.type === 'truss', hingeI: !!e.hingeStart, hingeJ: !!e.hingeEnd,
    });
  }

  const supports = new Map<number, PSupport>();
  for (const s of input.supports.values()) {
    const r = supportRestraints(s.type);
    supports.set(s.nodeId, {
      node: s.nodeId, type: s.type, ...r,
      ...(s.type === 'spring' ? { kx: s.kx, kz: s.ky, kr: s.kz } : {}),
      ...(s.angle !== undefined ? { angle: s.angle } : {}),
      ...(s.dx ? { dx: s.dx } : {}), ...(s.dz ? { dz: s.dz } : {}), ...(s.dry ? { dry: s.dry } : {}),
    });
  }

  const memberLoads: PMemberLoad[] = [];
  const nodalLoads: PNodalLoad[] = [];
  for (const l of input.loads) {
    if (l.type === 'nodal') {
      nodalLoads.push({ node: l.data.nodeId, fx: l.data.fx, fz: l.data.fz, my: l.data.my });
    } else if (l.type === 'distributed') {
      const m = members.get(l.data.elementId);
      if (!m) continue;
      memberLoads.push({ kind: 'dist', member: m.id, a: l.data.a ?? 0, b: l.data.b ?? m.L, qa: l.data.qI, qb: l.data.qJ });
    } else if (l.type === 'pointOnElement') {
      memberLoads.push({ kind: 'point', member: l.data.elementId, a: l.data.a, p: l.data.p, px: l.data.px ?? 0, m: l.data.my ?? 0 });
    } else if (l.type === 'thermal') {
      memberLoads.push({ kind: 'thermal', member: l.data.elementId, dtUniform: l.data.dtUniform, dtGradient: l.data.dtGradient });
    }
  }

  return { nodes, members, supports, memberLoads, nodalLoads, nodeOrder, memberOrder };
}

/** The loads on one member. */
export const loadsOn = (pm: PlaneModel, member: number) => pm.memberLoads.filter((l) => l.member === member);

/** The members meeting at a node. */
export const membersAt = (pm: PlaneModel, node: number) => [...pm.members.values()].filter((m) => m.i === node || m.j === node);

/** A member horizontal (|sin| tiny), vertical (|cos| tiny), or neither. */
export function orientation(m: PMember, tol = 1e-6): 'horizontal' | 'vertical' | 'inclined' {
  if (Math.abs(m.s) < tol) return 'horizontal';
  if (Math.abs(m.c) < tol) return 'vertical';
  return 'inclined';
}

/** The sum of the net nodal load at a node (all nodal loads added). */
export function nodalLoadAt(pm: PlaneModel, node: number): { fx: number; fz: number; my: number } {
  let fx = 0, fz = 0, my = 0;
  for (const l of pm.nodalLoads) if (l.node === node) { fx += l.fx; fz += l.fz; my += l.my; }
  return { fx, fz, my };
}

/** Has any support a spring, a settlement, or an inclined surface: the classical methods here do not take them. */
export function hasSpecialSupports(pm: PlaneModel): boolean {
  for (const s of pm.supports.values()) {
    if (s.type === 'spring' || s.type === 'inclinedRoller') return true;
    if (s.dx || s.dz || s.dry) return true;
  }
  return false;
}

export const hasThermal = (pm: PlaneModel) => pm.memberLoads.some((l) => l.kind === 'thermal');
