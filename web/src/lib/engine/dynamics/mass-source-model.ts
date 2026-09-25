/**
 * The model side of the mass source: each case's loads, converted exactly as the solve converts
 * them, so the frames they are written in are the engine's.
 *
 * Surface loads are taken from the model directly. The solve turns them into equivalent nodal
 * forces, and a nodal force has no member or shell to carry its mass; the shell they sit on
 * does.
 */

import { buildSolverLoads3D, type ModelData } from '../solver-service';
import type { SurfaceLoad3D } from '../../store/model.svelte';
import type { SolverInput3D } from '../types-3d';
import {
  applyMassSource, resolveMassFactors,
  type CaseMassLoads, type MassSource, type MassSourceReport, type ResolvedFactor,
} from './mass-source';
import { massDensities } from './requests';

export function caseMassLoads(
  model: ModelData,
  factors: ReadonlyArray<ResolvedFactor>,
  leftHand: boolean,
): CaseMassLoads[] {
  const out: CaseMassLoads[] = [];
  for (const f of factors) {
    if (!(f.factor > 0)) continue;
    const own = model.loads.filter((l) => (l.data.caseId ?? 1) === f.caseId);
    const surface = own
      .filter((l) => l.type === 'surface3d')
      .map((l) => ({ quadId: (l.data as SurfaceLoad3D).quadId, q: (l.data as SurfaceLoad3D).q }));
    const rest = own.filter((l) => l.type !== 'surface3d');
    out.push({
      caseId: f.caseId,
      factor: f.factor,
      loads: buildSolverLoads3D(model, rest, false, leftHand),
      surface,
    });
  }
  return out;
}

/**
 * The analysis input with the mass source applied, and its densities.
 *
 * Anything added to the input AFTER this — a rigid diaphragm's penalty members — has no density
 * here; `densitiesFor` gives it one.
 */
export function withMassSource(
  model: ModelData,
  loadCases: ReadonlyArray<{ id: number; name: string; type: string }>,
  stated: MassSource | null | undefined,
  input: SolverInput3D,
): { input: SolverInput3D; densities: Map<number, number>; report: MassSourceReport; factors: ResolvedFactor[] } {
  const factors = resolveMassFactors(loadCases, stated);
  const cases = caseMassLoads(model, factors, input.leftHand ?? false);
  const r = applyMassSource(input, massDensities(model.materials), cases);
  return { ...r, factors };
}

/** Densities for a request built after `withMassSource`: anything new gets 1 kg/m³. */
export function densitiesFor(input: SolverInput3D, densities: Map<number, number>): Map<number, number> {
  const out = new Map(densities);
  for (const id of input.materials.keys()) if (!out.has(id)) out.set(id, 1.0);
  return out;
}
