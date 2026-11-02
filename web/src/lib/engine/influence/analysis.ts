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

const GOLDEN = (Math.sqrt(5) - 1) / 2;

/**
 * The sampled line with its zero crossings and its smooth interior peaks found by solves, so
 * that the zones and the ordinate a concentrated load takes are not those of the samples. A jump
 * at the target is a pair of `side` points at one t, left then right: each branch is refined up to
 * it. A line on a truss bar is straight between its nodes and is left as it is.
 */
export function refinedPoints(points: IlPoint[], ordinateAt: (id: number, t: number) => number, keep: (id: number) => boolean): IlPoint[] {
  const out: IlPoint[] = [];
  const groups = new Map<number, IlPoint[]>();
  for (const p of points) { const g = groups.get(p.elementId) ?? []; g.push(p); groups.set(p.elementId, g); }
  for (const [id, pts] of groups) {
    if (!keep(id)) { out.push(...pts); continue; }
    const extra: IlPoint[] = [];
    const at = (a: IlPoint, b: IlPoint, t: number, value: number): IlPoint => {
      const u = (t - a.t) / Math.max(b.t - a.t, 1e-300);
      return { x: a.x + u * (b.x - a.x), y: a.y + u * (b.y - a.y), elementId: id, t, value };
    };
    for (let k = 1; k + 1 < pts.length; k++) {
      const a = pts[k - 1], m = pts[k], b = pts[k + 1];
      if (m.side) continue;
      const sg = m.value > a.value && m.value >= b.value ? 1 : m.value < a.value && m.value <= b.value ? -1 : 0;
      if (!sg) continue;
      let lo = a.t, hi = b.t;
      let x1 = hi - GOLDEN * (hi - lo), x2 = lo + GOLDEN * (hi - lo);
      let f1 = sg * ordinateAt(id, x1), f2 = sg * ordinateAt(id, x2);
      for (let it = 0; it < 40 && hi - lo > 1e-7; it++) {
        if (f1 > f2) { hi = x2; x2 = x1; f2 = f1; x1 = hi - GOLDEN * (hi - lo); f1 = sg * ordinateAt(id, x1); }
        else { lo = x1; x1 = x2; f1 = f2; x2 = lo + GOLDEN * (hi - lo); f2 = sg * ordinateAt(id, x2); }
      }
      const [tb, fb] = f1 > f2 ? [x1, f1] : [x2, f2];
      if (fb > sg * m.value) extra.push(at(a, b, tb, sg * fb));
    }
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k], b = pts[k + 1];
      if (!a.side === !b.side || b.t - a.t < 1e-12) continue;
      for (const sg of [1, -1]) {
        let lo = a.t, hi = b.t;
        let x1 = hi - GOLDEN * (hi - lo), x2 = lo + GOLDEN * (hi - lo);
        let f1 = sg * ordinateAt(id, x1), f2 = sg * ordinateAt(id, x2);
        for (let it = 0; it < 40 && hi - lo > 1e-7; it++) {
          if (f1 > f2) { hi = x2; x2 = x1; f2 = f1; x1 = hi - GOLDEN * (hi - lo); f1 = sg * ordinateAt(id, x1); }
          else { lo = x1; x1 = x2; f1 = f2; x2 = lo + GOLDEN * (hi - lo); f2 = sg * ordinateAt(id, x2); }
        }
        const [tb, fb] = f1 > f2 ? [x1, f1] : [x2, f2];
        if (fb > Math.max(sg * a.value, sg * b.value) * (1 + 1e-9) + 1e-15) extra.push(at(a, b, tb, sg * fb));
      }
    }
    const merged = [...pts, ...extra].sort((p, q) => p.t - q.t);
    const zeros: IlPoint[] = [];
    for (let k = 0; k + 1 < merged.length; k++) {
      const a = merged[k], b = merged[k + 1];
      if (b.t - a.t < 1e-12 || !(a.value * b.value < 0)) continue;
      let t0 = a.t, v0 = a.value, t1 = b.t, v1 = b.value, t = t0, v = v0, kept = 0;
      for (let it = 0; it < 100 && t1 - t0 > 1e-12; it++) {
        t = Math.min(t1, Math.max(t0, t0 + (t1 - t0) * (v0 / (v0 - v1))));
        if (t - t0 < 1e-3 * (t1 - t0) || t1 - t < 1e-3 * (t1 - t0)) t = 0.5 * (t0 + t1);
        v = ordinateAt(id, t);
        if (v === 0) break;
        if (v * v0 < 0) { t1 = t; v1 = v; if (kept === -1) v0 /= 2; kept = -1; } else { t0 = t; v0 = v; if (kept === 1) v1 /= 2; kept = 1; }
      }
      zeros.push(at(a, b, t, 0));
    }
    out.push(...[...merged, ...zeros].sort((p, q) => p.t - q.t));
  }
  return out;
}

export function readLine(
  unit: SolverInput, il: InfluenceLineResult, loads: IlLoads, placement: LivePlacement, loadedIds: number[], dir: Dir,
): LineReading {
  const loaded = new Set(loadedIds);
  const isLoaded = (id: number) => loaded.has(id);
  const lengthOf = (id: number) => memberGeom(unit, id).L;
  const target = targetOf(il);
  const effectOf = (ls: SolverLoad[]): number => familyOf(il.quantity) === 'displacement'
    ? targetDisplacement(unit, il.quantity, target, ls)
    : readForce(il.quantity, solve({ ...unit, loads: ls }), unit, target);
  const unitAt = (id: number, t: number) => effectOf(loadOnMember(unit, id, t * lengthOf(id), 1, dir));
  const points = refinedPoints(il.points as IlPoint[], unitAt, (id) => isLoaded(id) && unit.elements.get(id)?.type !== 'truss');
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
