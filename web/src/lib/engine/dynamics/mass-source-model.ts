/**
 * The model side of the mass source: each case's loads, converted exactly as the solve converts
 * them, so the frames they are written in are the engine's.
 *
 * Surface loads are taken from the model directly. The solve turns them into equivalent nodal
 * forces, and a nodal force has no member or shell to carry its mass; the shell they sit on
 * does.
 *
 * Only forces are weight. A tendon, a temperature, an initial strain and an imposed displacement
 * are in a case too, and the solve turns the first three into forces: a tendon's push on a curved
 * member is a load upward, which read as weight took the case's own downward weight off the mass.
 * They are left out.
 */

import { buildSolverLoads3D, type ModelData } from '../solver-service';
import { solvableModel } from '../member-behaviour';
import type { Load, SurfaceLoad3D } from '../../store/model.svelte';
import { surfaceDownwardPressure } from '../solver-shells';
import { withCaseEffects } from '../case-effects';
import { massWeightLoads, WEIGHT_CASE } from './mass-weights';
import type { SolverInput3D } from '../types-3d';
import {
  applyMassSource, resolveMassFactors,
  type CaseMassLoads, type MassSource, type MassSourceReport, type ResolvedFactor,
} from './mass-source';
import { withSectionMass } from './section-mass';

/** The loads that are forces, so weight when they point down; surface loads are read apart. */
const WEIGHT = new Set<Load['type']>(['nodal', 'nodal3d', 'distributed', 'distributed3d', 'pointOnElement', 'pointOnElement3d']);

export function caseMassLoads(
  model: ModelData,
  factors: ReadonlyArray<ResolvedFactor>,
  leftHand: boolean,
): CaseMassLoads[] {
  // On the members the analysis input has: a variable member's loads are its pieces' (idempotent).
  model = solvableModel(model);
  const out: CaseMassLoads[] = [];
  for (const f of factors) {
    if (!(f.factor > 0)) continue;
    const own = model.loads.filter((l) => (l.data.caseId ?? 1) === f.caseId);
    // A surface load's weight is its downward resultant, whatever its direction or field
    // (`shell-load-integration.ts`), spread over the shell: a suction or a wall pressure weighs nothing.
    const surface = own.filter((l) => l.type === 'surface3d').flatMap((l) => {
      const d = l.data as SurfaceLoad3D;
      const q = surfaceDownwardPressure(d, model.quads as never, model.nodes as never, model.plates as never);
      return q === null ? [] : [{ quadId: d.quadId, q, ...(d.on ? { on: d.on } : {}) }];
    });
    // A nodal load that names its member (a floor's share at a re-entrant corner) weighs on it,
    // when the member is still there and ends at the node.
    const carrierOf = (l: Load): number | null => {
      if (l.type !== 'nodal3d' || l.data.carrier === undefined) return null;
      const e = model.elements.get(l.data.carrier);
      return e && (e.nodeI === l.data.nodeId || e.nodeJ === l.data.nodeId) ? e.id : null;
    };
    const carried = own.flatMap((l) => {
      const id = carrierOf(l);
      return id === null || l.type !== 'nodal3d' ? [] : [{ elementId: id, down: -l.data.fz }];
    });
    const rest = own.filter((l) => WEIGHT.has(l.type) && carrierOf(l) === null);
    out.push({
      caseId: f.caseId,
      factor: f.factor,
      loads: buildSolverLoads3D(model, rest, [], leftHand),
      surface,
      ...(carried.length ? { carried } : {}),
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
  userLeftHand = false,
): { input: SolverInput3D; densities: Map<number, number>; report: MassSourceReport; factors: ResolvedFactor[] } {
  let factors = resolveMassFactors(loadCases, stated);
  // A composite case weighs what it takes in (`case-effects.ts`).
  model = withCaseEffects(model, loadCases as never, { includeSelfWeight: false, leftHand: userLeftHand });
  // The weights stated for the mass alone, as a case of their own taken whole (`mass-weights.ts`).
  if (stated?.weights?.length) {
    const extra = massWeightLoads(model as never, stated.weights, userLeftHand);
    if (extra.length) {
      model = { ...model, loads: [...model.loads, ...extra] };
      factors = [...factors, { caseId: WEIGHT_CASE, name: 'weights', type: '', factor: 1, basis: 'stated' }];
    }
  }
  // Then the model as the input was built from it: a variable member is its pieces, each with its
  // own section, so a load and a section are looked up by the ids the input has (`variable-members.ts`).
  model = solvableModel(model);
  // The analysis input is always right-handed; local loads still follow the displayed Y.
  const cases = caseMassLoads(model, factors, userLeftHand);
  const physical = withSectionMass(input, model);
  // A member solved on a section scaled by stiffness modifiers weighs with its own section's A.
  // A drawn section is left to withSectionMass, whose density already turns the solved area
  // into the section's real weight.
  const realArea = (id: number) => {
    const own = model.elements.get(id)?.sectionId;
    const solved = input.elements.get(id)?.sectionId;
    if (own === undefined || own === solved || model.sections.get(own)?.drawn) return undefined;
    return input.sections.get(own)?.a;
  };
  const r = applyMassSource(physical.input, physical.densities, cases, realArea);
  return { ...r, factors };
}

/** Densities for a request built after `withMassSource`: anything new gets 1 kg/m³. */
export function densitiesFor(input: SolverInput3D, densities: Map<number, number>): Map<number, number> {
  const out = new Map(densities);
  for (const id of input.materials.keys()) if (!out.has(id)) out.set(id, 1.0);
  return out;
}
