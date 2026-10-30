/**
 * The envelope of an internal force along the members, the classroom way: at each section the
 * influence line is loaded as `ilExtremes` loads it, and its largest and smallest values are the
 * envelope there.
 *
 * Every section's line comes from the same solves: one per position of the unit load, each read
 * at every section. A section shares its position with a load sample, so the solve with the load
 * on it gives both ordinates of the jump there.
 */
import { solve } from '../wasm-solver';
import { loadOnMember } from '../moving-loads';
import type { AnalysisResults, SolverInput } from '../types';
import { ilExtremes, type IlLoads, type LivePlacement } from './areas';
import { memberGeom, readForce, type Dir, type IlPoint } from './unit-sweep';
import type { IlTarget } from './quantities';

export type EnvelopeQuantity = 'M' | 'V' | 'N';

export interface AlongEnvelope {
  quantity: EnvelopeQuantity;
  members: Array<{ elementId: number; t: number[]; max: number[]; min: number[] }>;
  globalMax: number;
}

interface Position { elementId: number; t: number; x: number; y: number; res?: AnalysisResults; truss?: { i: number; j: number } }

export function ilEnvelopeAlong(
  unit: SolverInput, quantity: EnvelopeQuantity, loads: IlLoads, placement: LivePlacement, dir: Dir, loadedIds: number[],
  sectionsPerMember = 10,
): AlongEnvelope {
  const nLoad = 2 * sectionsPerMember;
  const nodeRes = new Map<number, AnalysisResults>();
  const atNode = (nodeId: number) => {
    let r = nodeRes.get(nodeId);
    if (!r) {
      r = solve({ ...unit, loads: [{ type: 'nodal', data: { nodeId, fx: dir.x, fz: dir.z, my: 0 } }] });
      nodeRes.set(nodeId, r);
    }
    return r;
  };
  const positions: Position[] = [];
  for (const e of unit.elements.values()) {
    const { ni, nj, L } = memberGeom(unit, e.id);
    for (let k = 0; k <= nLoad; k++) {
      const t = k / nLoad;
      const at = { elementId: e.id, t, x: ni.x + t * (nj.x - ni.x), y: ni.z + t * (nj.z - ni.z) };
      positions.push(e.type === 'truss'
        ? { ...at, truss: { i: e.nodeI, j: e.nodeJ } }
        : { ...at, res: solve({ ...unit, loads: loadOnMember(unit, e.id, t * L, 1, dir) }) });
    }
  }
  const loaded = new Set(loadedIds);
  const lengthOf = (id: number) => memberGeom(unit, id).L;
  const lineAt = (target: IlTarget & { kind: 'section' }): IlPoint[] => {
    const pts: IlPoint[] = [];
    for (const p of positions) {
      const base = { x: p.x, y: p.y, elementId: p.elementId, t: p.t };
      if (p.truss) {
        const v = (1 - p.t) * readForce(quantity, atNode(p.truss.i), unit, target) + p.t * readForce(quantity, atNode(p.truss.j), unit, target);
        pts.push({ ...base, value: v });
      } else if (p.elementId === target.elementId && Math.abs(p.t - target.t) < 1e-9) {
        pts.push({ ...base, value: readForce(quantity, p.res!, unit, target, 'left'), side: 'left' });
        pts.push({ ...base, value: readForce(quantity, p.res!, unit, target), side: 'right' });
      } else pts.push({ ...base, value: readForce(quantity, p.res!, unit, target) });
    }
    return pts;
  };
  const members: AlongEnvelope['members'] = [];
  let globalMax = 0;
  for (const e of unit.elements.values()) {
    if (e.type === 'truss' && quantity !== 'N') continue;
    const ts = Array.from({ length: sectionsPerMember + 1 }, (_, j) => j / sectionsPerMember);
    const max: number[] = [], min: number[] = [];
    for (const t of ts) {
      const ex = ilExtremes(lineAt({ kind: 'section', elementId: e.id, t }), lengthOf, (id) => loaded.has(id), loads, placement);
      max.push(ex.max.value);
      min.push(ex.min.value);
      globalMax = Math.max(globalMax, Math.abs(ex.max.value), Math.abs(ex.min.value));
    }
    members.push({ elementId: e.id, t: ts, max, min });
  }
  return { quantity, members, globalMax };
}
