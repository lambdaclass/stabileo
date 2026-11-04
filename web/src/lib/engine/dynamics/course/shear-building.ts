/**
 * The shear building idealization of a plane frame of columns and floor beams:
 * one horizontal displacement per floor, beams infinitely stiff, columns
 * axially rigid, the mass concentrated at the floors. Each storey is a spring
 * of stiffness Σ 12EI/h³ over its columns (3EI/h³ for a column hinged at one
 * end), and the floors are masses joined by those springs in series.
 */
import type { ModelData } from '../../solver-service';
import type { PointMass } from '../mass-source';
import { massDensities } from '../requests';
import { solverProperties } from '../../../section/state';
import { effectiveBendingInertia } from '../../solver-service';
import { type Mat, zeros } from './dense';
import type { DofRef } from './mdof-system';

export interface StoreyColumn { elementId: number; E: number; I: number; h: number; factor: 12 | 3; k: number }
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

export type ShearRefusal = 'notFrames' | 'base' | 'shape' | 'noColumns' | 'noMass';

const TOL = 1e-6;

export function shearBuilding(model: ModelData, points: readonly PointMass[], barMass: boolean): ShearBuilding | ShearRefusal {
  const els = [...model.elements.values()];
  if (!els.length || els.some((e) => e.type !== 'frame')) return 'notFrames';
  const supported = new Set([...model.supports.values()].map((s) => s.nodeId));
  const base = [...supported].map((id) => model.nodes.get(id)?.y).filter((y): y is number => y !== undefined);
  if (!base.length || base.some((y) => Math.abs(y - base[0]) > TOL)) return 'base';
  const z0 = Math.min(...base);
  if ([...model.supports.values()].some((s) => s.type !== 'fixed' && s.type !== 'pinned')) return 'base';
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
  for (const e of els) {
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
      continue;
    }
    if (Math.abs(a.x - b.x) > TOL || Math.abs(la - lb) !== 1) return 'shape';
    const [lo, hi] = la < lb ? [la, lb] : [lb, la];
    const [loEnd, hiEnd] = la < lb ? [e.releaseI?.mz === true, e.releaseJ?.mz === true] : [e.releaseJ?.mz === true, e.releaseI?.mz === true];
    const pinnedBase = lo === 0 && [...model.supports.values()].some((sp) => sp.type === 'pinned' && sp.nodeId === (la < lb ? e.nodeI : e.nodeJ));
    const freeLo = loEnd || pinnedBase;
    if (freeLo && hiEnd) return 'noColumns';
    const factor: 12 | 3 = freeLo || hiEnd ? 3 : 12;
    const E = mat.e * 1000, I = effectiveBendingInertia(s, props);
    const h = Math.abs(b.y - a.y);
    const f = floors[hi - 1];
    f.columns.push({ elementId: e.id, E, I, h, factor, k: (factor * E * I) / h ** 3 });
    f.mBars += mass / 2;
    if (lo > 0) floors[lo - 1].mBars += mass / 2;
  }
  for (const p of points) {
    const n = model.nodes.get(p.nodeId);
    const l = n ? levelOf(n.y) : -1;
    if (l > 0) floors[l - 1].mPoint += p.m;
  }
  for (const ld of model.loads) {
    if (ld.type !== 'nodal') continue;
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
