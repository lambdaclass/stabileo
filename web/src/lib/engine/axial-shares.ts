/**
 * The axial part of member loads, given back to the members it came from.
 *
 * The engine takes no axial member load, so `member-loads.ts` moves it to the end nodes by statics
 * and tags each of those nodal loads with its member and end (`axialOf`). The member then sees none
 * of it, and its axial force is the same at both ends: the average of the true one. A column under
 * its own weight read, in a validation model, −23.68 kN all along where it carries −26.04 at its
 * foot and −21.3 at its head; design reads the foot.
 *
 * With the load at the nodes, the true end forces are, tension positive,
 *   N(0) = N₀ + p_I,   N(L) = N₀ − p_J,
 * N₀ the engine's (uniform) axial force and p_I, p_J the loads put at each end along the member's
 * x: for an axial bar the consistent end loads are the simple-support shares, which is what was
 * put there, so the nodal displacements are exact and so is this. Between the ends the diagram is
 * linear, which is exact for a load uniform along the member (self-weight) and the chord of the
 * true curve otherwise.
 *
 * Pure.
 */
import type { AnalysisResults3D, SolverLoad3D } from './types-3d';

export type AxialCorrection = { i: number; j: number };

/** Per member, the axial forces its loads put at its ends, from the tagged nodal loads. */
export function axialShares(loads: readonly SolverLoad3D[]): Map<number, AxialCorrection> {
  const out = new Map<number, AxialCorrection>();
  for (const l of loads) {
    if (l.type !== 'nodal' || !l.data.axialOf) continue;
    const { elementId, end, p } = l.data.axialOf;
    const c = out.get(elementId) ?? { i: 0, j: 0 };
    c[end] += p;
    out.set(elementId, c);
  }
  return out;
}

/** The corrections of a combination: its cases', with the factors. */
export function combineShares(factors: ReadonlyArray<{ caseId: number; factor: number }>, perCase: ReadonlyMap<number, Map<number, AxialCorrection>>): Map<number, AxialCorrection> {
  const out = new Map<number, AxialCorrection>();
  for (const f of factors) {
    for (const [id, c] of perCase.get(f.caseId) ?? []) {
      const o = out.get(id) ?? { i: 0, j: 0 };
      o.i += f.factor * c.i; o.j += f.factor * c.j;
      out.set(id, o);
    }
  }
  return out;
}

/** The results with each member's axial end forces given back their loads' axial part. In place. */
export function giveBackAxialShares<T extends Pick<AnalysisResults3D, 'elementForces'>>(results: T, shares: ReadonlyMap<number, AxialCorrection>): T {
  if (shares.size === 0) return results;
  for (const f of results.elementForces ?? []) {
    const c = shares.get(f.elementId);
    if (!c) continue;
    f.nStart += c.i;
    f.nEnd -= c.j;
  }
  return results;
}
