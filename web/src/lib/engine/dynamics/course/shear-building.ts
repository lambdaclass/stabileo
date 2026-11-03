/**
 * The shear building idealization of a plane frame of columns and floor beams:
 * one horizontal displacement per floor, beams infinitely stiff, columns
 * axially rigid, the mass concentrated at the floors. Each storey is a spring
 * of stiffness Σ 12EI/h³ over its columns (3EI/h³ for a column with one end
 * free to rotate: its own hinge, a pinned support, or a joint where every other
 * member end is released or every floor beam reaches no other column or support;
 * none for a column free at both ends), and the floors
 * are masses joined by those springs in series. A column held at a joint only by
 * another column, with no rigid floor beam there, couples storeys and is refused.
 */
import type { ModelData } from '../../solver-service';
import type { PointMass } from '../mass-source';
import { massDensities } from '../requests';
import { solverProperties } from '../../../section/state';
import { effectiveBendingInertia } from '../../solver-service';
import { type Mat, zeros } from './dense';
import type { DofRef } from './mdof-system';

export interface StoreyColumn { elementId: number; E: number; I: number; h: number; factor: 12 | 3 | 0; k: number }
export interface Floor {
  level: number;
  z: number;
  nodes: number[];
  /** The storey below the floor: its height, columns and stiffness Σ factor·EI/h³. */
  h: number;
  columns: StoreyColumn[];
  k: number;
  /** Mass of the floor: point masses, beams, half the columns above and below. */
  mPoint: number;
  mBars: number;
  m: number;
  /** Horizontal nodal loads at the floor, kN. */
  F: number;
}

export interface ShearBuilding {
  floors: Floor[];
  K: Mat;
  M: Mat;
  F: number[];
  dofs: DofRef[];
}

export type ShearRefusal = 'notFrames' | 'base' | 'shape' | 'noColumns' | 'noMass' | 'floorSplit' | 'variableSection' | 'unsupportedBase' | 'continuousColumn' | 'memberLoad' | 'otherParts' | 'floorHinge';

const TOL = 1e-6;

export function shearBuilding(model: ModelData, points: readonly PointMass[], barMass: boolean): ShearBuilding | ShearRefusal {
  const els = [...model.elements.values()];
  if (!els.length || els.some((e) => e.type !== 'frame')) return 'notFrames';
  if ((model.plates?.size ?? 0) || (model.quads?.size ?? 0) || (model.constraints?.length ?? 0) || (model.connectors?.size ?? 0)) return 'otherParts';
  const supported = new Set([...model.supports.values()].map((s) => s.nodeId));
  const base = [...supported].map((id) => model.nodes.get(id)?.y).filter((y): y is number => y !== undefined);
  if (!base.length || base.some((y) => Math.abs(y - base[0]) > TOL)) return 'base';
  const z0 = Math.min(...base);
  if ([...model.supports.values()].some((s) => s.type !== 'fixed' && s.type !== 'pinned')) return 'base';
  if ([...model.nodes.values()].some((n) => !supported.has(n.id) && Math.abs(n.y - z0) <= TOL)) return 'unsupportedBase';
  const levels = [...new Set([...model.nodes.values()].filter((n) => !supported.has(n.id)).map((n) => n.y))].sort((a, b) => a - b);
  const zs: number[] = [];
  for (const z of levels) if (!zs.length || Math.abs(z - zs[zs.length - 1]) > TOL) zs.push(z);
  if (!zs.length || zs[0] <= z0 + TOL) return 'shape';
  const levelOf = (y: number) => (Math.abs(y - z0) <= TOL ? 0 : zs.findIndex((z) => Math.abs(z - y) <= TOL) + 1);
  const rho = massDensities(model.materials);
  const floors: Floor[] = zs.map((z, i) => ({ level: i + 1, z, nodes: [], h: z - (i ? zs[i - 1] : z0), columns: [], k: 0, mPoint: 0, mBars: 0, m: 0, F: 0 }));
  for (const n of model.nodes.values()) {
    const l = levelOf(n.y);
    if (l < 0) return 'shape';
    if (l > 0) floors[l - 1].nodes.push(n.id);
  }
  const parent = new Map<number, number>();
  const root = (id: number): number => { let r = id; while (parent.has(r)) r = parent.get(r)!; return r; };
  const join = (i: number, j: number) => { const a = root(i), b = root(j); if (a !== b) parent.set(a, b); };
  const isBeam = (e: (typeof els)[number]) => Math.abs(model.nodes.get(e.nodeI)!.y - model.nodes.get(e.nodeJ)!.y) <= TOL;
  const beams = els.filter(isBeam);
  const heldUp = new Set(supported);
  for (const e of els) if (!isBeam(e)) { heldUp.add(e.nodeI); heldUp.add(e.nodeJ); }
  const rigidAt = (e: (typeof els)[number], n: number) => (e.nodeI === n ? e.releaseI?.mz : e.releaseJ?.mz) !== true;
  const anchored = (beam: (typeof els)[number], near: number, from: number): boolean | 'released' => {
    const seen = new Set([near, from]), stack: Array<[(typeof els)[number], number]> = [[beam, from]];
    let blocked = false;
    while (stack.length) {
      const [via, n] = stack.pop()!;
      if (heldUp.has(n)) return true;
      for (const e of beams) {
        if (e === via || (e.nodeI !== n && e.nodeJ !== n)) continue;
        if (!rigidAt(via, n) || !rigidAt(e, n)) { blocked = true; continue; }
        const m = e.nodeI === n ? e.nodeJ : e.nodeI;
        if (m !== near && heldUp.has(m)) return true;
        if (!seen.has(m)) { seen.add(m); stack.push([e, m]); }
      }
    }
    return blocked ? 'released' : false;
  };
  const beamHolds = new Set<number>();
  const rigidEnds = new Map<number, number>();
  for (const e of els) {
    if (isBeam(e)) {
      for (const [n, far] of [[e.nodeI, e.nodeJ], [e.nodeJ, e.nodeI]] as const) {
        if (!rigidAt(e, n)) continue;
        const a = anchored(e, n, far);
        if (a === 'released') return 'floorHinge';
        if (a) beamHolds.add(n);
      }
      continue;
    }
    for (const [node, rel] of [[e.nodeI, e.releaseI?.mz], [e.nodeJ, e.releaseJ?.mz]] as const) if (rel !== true) rigidEnds.set(node, (rigidEnds.get(node) ?? 0) + 1);
  }
  const jointFree = (node: number, released: boolean): boolean | 'coupled' => {
    if (released) return true;
    if (beamHolds.has(node)) return false;
    return (rigidEnds.get(node) ?? 0) > 1 ? 'coupled' : true;
  };
  for (const e of els) {
    if (e.variableSection) return 'variableSection';
    const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    const la = levelOf(a.y), lb = levelOf(b.y);
    const s = model.sections.get(e.sectionId)!;
    const props = solverProperties(s);
    const mat = model.materials.get(e.materialId)!;
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    const mass = barMass ? ((rho.get(e.materialId) ?? 0) * props.a / 1000) * L : 0;
    if (Math.abs(a.y - b.y) <= TOL) {
      if (la === 0) return 'shape';
      floors[la - 1].mBars += mass;
      join(e.nodeI, e.nodeJ);
      continue;
    }
    if (Math.abs(a.x - b.x) > TOL || Math.abs(la - lb) !== 1) return 'shape';
    const [lo, hi] = la < lb ? [la, lb] : [lb, la];
    const [loEnd, hiEnd] = la < lb ? [e.releaseI?.mz === true, e.releaseJ?.mz === true] : [e.releaseJ?.mz === true, e.releaseI?.mz === true];
    const [loNode, hiNode] = la < lb ? [e.nodeI, e.nodeJ] : [e.nodeJ, e.nodeI];
    const pinnedBase = lo === 0 && [...model.supports.values()].some((sp) => sp.type === 'pinned' && sp.nodeId === loNode);
    const freeLo = lo === 0 ? loEnd || pinnedBase : jointFree(loNode, loEnd);
    const freeHi = jointFree(hiNode, hiEnd);
    if (freeLo === 'coupled' || freeHi === 'coupled') return 'continuousColumn';
    const factor: 12 | 3 | 0 = freeLo && freeHi ? 0 : freeLo || freeHi ? 3 : 12;
    const E = mat.e * 1000, I = effectiveBendingInertia(s, props);
    const h = Math.abs(b.y - a.y);
    const f = floors[hi - 1];
    f.columns.push({ elementId: e.id, E, I, h, factor, k: (factor * E * I) / h ** 3 });
    f.mBars += mass / 2;
    if (lo > 0) floors[lo - 1].mBars += mass / 2;
  }
  if (floors.some((f) => new Set(f.nodes.map(root)).size > 1)) return 'floorSplit';
  for (const p of points) {
    if (!(p.m > 0)) continue;
    const n = model.nodes.get(p.nodeId);
    const l = n ? levelOf(n.y) : -1;
    if (l > 0) floors[l - 1].mPoint += p.m;
  }
  const onBeam = (elementId: number) => {
    const e = model.elements.get(elementId);
    const a = e && model.nodes.get(e.nodeI), b = e && model.nodes.get(e.nodeJ);
    return !!a && !!b && Math.abs(a.y - b.y) <= TOL;
  };
  const vertical = (ld: (typeof model.loads)[number]): boolean => {
    if (ld.type === 'distributed') return onBeam(ld.data.elementId) && !ld.data.isGlobal && !ld.data.angle;
    if (ld.type === 'pointOnElement') return onBeam(ld.data.elementId) && !ld.data.isGlobal && !ld.data.angle && !ld.data.px && !(ld.data.my ?? ld.data.mz);
    return false;
  };
  for (const ld of model.loads) {
    if (vertical(ld)) continue;
    if (ld.type !== 'nodal') return 'memberLoad';
    const d = ld.data as { nodeId: number; fx?: number };
    const n = model.nodes.get(d.nodeId);
    const l = n ? levelOf(n.y) : -1;
    if (l > 0) floors[l - 1].F += d.fx ?? 0;
  }
  for (const f of floors) {
    f.k = f.columns.reduce((s, c) => s + c.k, 0);
    f.m = f.mPoint + f.mBars;
    if (!(f.k > 0)) return 'noColumns';
    if (!(f.m > 0)) return 'noMass';
  }
  const n = floors.length;
  const K = zeros(n), M = zeros(n);
  floors.forEach((f, i) => {
    K[i][i] += f.k;
    if (i > 0) { K[i - 1][i - 1] += f.k; K[i - 1][i] -= f.k; K[i][i - 1] -= f.k; }
    M[i][i] = f.m;
  });
  const dofs: DofRef[] = floors.map((f) => ({ nodeId: f.nodes[0], dir: 'ux' }));
  return { floors, K, M, F: floors.map((f) => f.F), dofs };
}
