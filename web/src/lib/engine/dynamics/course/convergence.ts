/**
 * How the frequencies of a bar model approach the exact ones as the members
 * are cut finer, for each mass model: lumped, consistent and consistent
 * condensed to the translations. The exact values are the continuous beam's
 * (Euler-Bernoulli bending plus the axial bar) when the model is one straight
 * prismatic member with classical end conditions.
 */
import type { ModelData } from '../../solver-service';
import type { PointMass } from '../mass-source';
import { massDensities } from '../requests';
import { solverProperties } from '../../../section/state';
import { effectiveBendingInertia } from '../../solver-service';
import { modelSystem, type SystemOptions } from './mdof-system';
import { generalizedEigen } from './dense';
import type { MassModel } from './mass-model';

export type BeamCase = 'cantilever' | 'simple' | 'fixedPinned' | 'fixedFixed';

/** (βL)² of the first bending modes, ω = (βL)²·√(EI/(m·L⁴)). */
export const BENDING_COEFFS: Record<BeamCase, number[]> = {
  cantilever: [3.5160, 22.0345, 61.6972, 120.902, 199.860, 298.556],
  simple: [1, 4, 9, 16, 25, 36].map((k) => k * Math.PI ** 2),
  fixedPinned: [15.4182, 49.9649, 104.248, 178.270, 272.031, 385.531],
  fixedFixed: [22.3733, 61.6728, 120.903, 199.859, 298.556, 416.991],
};

export interface ExactBeam {
  beamCase: BeamCase;
  L: number;
  EI: number;
  EA: number;
  rhoA: number;
  /** Exact frequencies, Hz, bending and axial together, ascending, each with its kind. */
  modes: Array<{ f: number; kind: 'bending' | 'axial'; order: number }>;
}

const holdsX = (t: string) => t === 'fixed' || t === 'pinned' || t === 'rollerZ';
const holdsZ = (t: string) => t === 'fixed' || t === 'pinned' || t === 'rollerX';

export function exactBeam(model: ModelData, points: readonly PointMass[], count = 6): ExactBeam | null {
  if (model.elements.size !== 1 || points.some((p) => p.m > 0)) return null;
  const e = [...model.elements.values()][0];
  if (e.type !== 'frame' || e.releaseI?.mz || e.releaseJ?.mz || e.variableSection) return null;
  const a = model.nodes.get(e.nodeI), b = model.nodes.get(e.nodeJ);
  if (!a || !b) return null;
  const sup = new Map([...model.supports.values()].map((s) => [s.nodeId, s.type as string]));
  if (sup.size !== model.supports.size || [...sup.keys()].some((n) => n !== e.nodeI && n !== e.nodeJ)) return null;
  const sa = sup.get(e.nodeI), sb = sup.get(e.nodeJ);
  const c = Math.hypot(b.x - a.x, b.y - a.y);
  const ex = (b.x - a.x) / c, ez = (b.y - a.y) / c;
  const axisAligned = Math.abs(ex) < 1e-9 || Math.abs(ez) < 1e-9;
  if (!axisAligned) return null;
  const horizontal = Math.abs(ez) < 1e-9;
  const transverse = (t?: string) => !!t && (horizontal ? holdsZ(t) : holdsX(t));
  const axial = (t?: string) => !!t && (horizontal ? holdsX(t) : holdsZ(t));
  const fixedEnd = (t?: string) => t === 'fixed';
  const ends = [sa, sb];
  const nFixed = ends.filter(fixedEnd).length;
  const nTrans = ends.filter(transverse).length;
  let beamCase: BeamCase | null = null;
  if (nFixed === 1 && nTrans === 1) beamCase = 'cantilever';
  else if (nFixed === 0 && nTrans === 2) beamCase = 'simple';
  else if (nFixed === 1 && nTrans === 2) beamCase = 'fixedPinned';
  else if (nFixed === 2) beamCase = 'fixedFixed';
  if (!beamCase) return null;
  const nAxial = ends.filter(axial).length;
  if (nAxial === 0) return null;
  const sec = model.sections.get(e.sectionId), mat = model.materials.get(e.materialId);
  if (!sec || !mat) return null;
  const props = solverProperties(sec);
  const E = mat.e * 1000;
  const EI = E * effectiveBendingInertia(sec, props), EA = E * props.a;
  const rhoA = ((massDensities(model.materials).get(e.materialId) ?? 0) * props.a) / 1000;
  if (!(rhoA > 0)) return null;
  const bend = BENDING_COEFFS[beamCase].slice(0, count).map((k, i) => ({ f: (k * Math.sqrt(EI / (rhoA * c ** 4))) / (2 * Math.PI), kind: 'bending' as const, order: i + 1 }));
  const bar = Math.sqrt(EA / rhoA) / c;
  const ax = Array.from({ length: count }, (_, i) => ({ f: ((nAxial === 1 ? (2 * i + 1) * Math.PI / 2 : (i + 1) * Math.PI) * bar) / (2 * Math.PI), kind: 'axial' as const, order: i + 1 }));
  return { beamCase, L: c, EI, EA, rhoA, modes: [...bend, ...ax].sort((x, y) => x.f - y.f).slice(0, count) };
}

export interface ConvergenceRow {
  n: number;
  dofs: Record<MassModel, number>;
  /** The first frequencies, Hz, of each mass model. */
  f: Record<MassModel, number[]>;
  /** The engine's modal analysis of the same subdivided model (consistent mass), when it ran. */
  engine?: number[];
}

export const MASS_MODELS: MassModel[] = ['lumped', 'consistent', 'guyan'];

export function frequenciesOf(model: ModelData, points: readonly PointMass[], opts: SystemOptions, count: number): { f: number[]; dofs: number } {
  const s = modelSystem(model, points, opts);
  const { lambda } = generalizedEigen(s.K, s.M);
  return { f: lambda.slice(0, count).map((l) => Math.sqrt(Math.max(l, 0)) / (2 * Math.PI)), dofs: s.dofs.length };
}

export function convergenceTable(
  model: ModelData, points: readonly PointMass[], ns: readonly number[], count: number, barMass: boolean,
  engine?: (n: number) => number[] | null,
): ConvergenceRow[] {
  return ns.map((n) => {
    const f = {} as Record<MassModel, number[]>;
    const dofs = {} as Record<MassModel, number>;
    for (const mm of MASS_MODELS) {
      const r = frequenciesOf(model, points, { nPerMember: n, massModel: mm, barMass }, count);
      f[mm] = r.f; dofs[mm] = r.dofs;
    }
    const e = engine?.(n) ?? undefined;
    return { n, dofs, f, ...(e ? { engine: e.slice(0, count) } : {}) };
  });
}
