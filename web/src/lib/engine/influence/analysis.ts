/**
 * One influence line, read the way a course uses it: its peaks, its areas, the largest and
 * smallest value under g, q and P, and the same two values solved directly with the loads where
 * the line put them. Each area is the effect of a unit uniform load over its zone, the integral
 * of the line there without a quadrature's error on a curved line.
 */
import { solve } from '../wasm-solver';
import { loadOnMember } from '../moving-loads';
import type { SolverInput, SolverLoad } from '../types';
import type { InfluenceLineResult } from '../../store/model.svelte';
import { extremeLoads, ilExtremes, ordinateExtremes, uniformAlong, type IlAreas, type IlExtreme, type IlLoads, type LivePlacement, type Zone } from './areas';
import { familyOf, type IlTarget } from './quantities';
import { memberGeom, readForce, type Dir, type IlPoint } from './unit-sweep';
import { targetDisplacement } from './maxwell';

export interface LineReading {
  target: IlTarget;
  etaMax: IlPoint | null;
  etaMin: IlPoint | null;
  areas: IlAreas;
  max: IlExtreme;
  min: IlExtreme;
  /** The direct solve of each extreme's loads, read at the target. */
  direct: { max: number; min: number };
  loadedIds: number[];
}

export function targetOf(il: InfluenceLineResult): IlTarget {
  return il.targetElementId !== undefined
    ? { kind: 'section', elementId: il.targetElementId, t: il.targetPosition ?? 0.5 }
    : { kind: 'node', nodeId: il.targetNodeId ?? -1 };
}

export function readLine(
  unit: SolverInput, il: InfluenceLineResult, loads: IlLoads, placement: LivePlacement, loadedIds: number[], dir: Dir,
): LineReading {
  const loaded = new Set(loadedIds);
  const isLoaded = (id: number) => loaded.has(id);
  const lengthOf = (id: number) => memberGeom(unit, id).L;
  const points = il.points as IlPoint[];
  const target = targetOf(il);
  const effectOf = (ls: SolverLoad[]): number => familyOf(il.quantity) === 'displacement'
    ? targetDisplacement(unit, il.quantity, target, ls)
    : readForce(il.quantity, solve({ ...unit, loads: ls }), unit, target);
  const zoneArea = (z: Zone) => effectOf(uniformAlong(unit, z.elementId, z.t0 * lengthOf(z.elementId), z.t1 * lengthOf(z.elementId), 1, dir));
  const { max, min, areas } = ilExtremes(points, lengthOf, isLoaded, loads, placement, zoneArea);
  const eta = ordinateExtremes(points, isLoaded);
  const pointLoad = (id: number, a: number, w: number) => loadOnMember(unit, id, a, w, dir);
  const valueUnder = (ex: IlExtreme): number => effectOf(extremeLoads(unit, loadedIds, loads, ex, dir, pointLoad));
  return {
    target, etaMax: eta.max, etaMin: eta.min, areas, max, min, loadedIds,
    direct: { max: valueUnder(max), min: valueUnder(min) },
  };
}
