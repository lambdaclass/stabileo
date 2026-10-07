/**
 * Weights that are mass and no load case (`MassSource.weights`): written as the loads they stand
 * for, in a case of their own that the mass source takes with factor 1, so they become density the
 * same way a case's loads do (`mass-source.ts`).
 *
 *   members   kN/m along each member in the region, downward;
 *   slabs     kN/m² on each shell in the region, downward;
 *   floor     kN/m² on the region's floor, carried to its beams by tributary area
 *             (`floor-definitions.ts`): a zone, a group or a box of coordinates.
 *
 * Pure.
 */
import type { Load } from '../../store/model.svelte';
import type { MassWeight } from './mass-source';
import { regionMembers, regionNodes } from '../../model/loads/region-nodes';
import { expandDefinition, type DefinitionModel, type FloorTarget } from '../../model/loads/floor-definitions';

/** The case id the weights are written in: no model case has it. */
export const WEIGHT_CASE = -1001;

export function massWeightLoads(m: DefinitionModel, weights: readonly MassWeight[], leftHand: boolean): Load[] {
  const out: Load[] = [];
  let id = 1;
  for (const w of weights) {
    if (!(w.w !== 0)) continue;
    if (w.on === 'members') {
      const ids = regionMembers(m, w.region) ?? [...m.elements.keys()];
      for (const e of ids) out.push({ type: 'distributed3d', data: { id: id++, elementId: e, qYI: 0, qYJ: 0, qZI: -w.w, qZJ: -w.w, frame: 'global', caseId: WEIGHT_CASE } });
    } else if (w.on === 'slabs') {
      const nodes = regionNodes(m, w.region);
      const set = nodes ? new Set(nodes) : null;
      const inside = (ns: number[]) => !set || ns.every((n) => set.has(n));
      for (const q of m.quads.values()) if (inside(q.nodes)) out.push({ type: 'surface3d', data: { id: id++, quadId: q.id, q: w.w, caseId: WEIGHT_CASE } });
      for (const p of m.plates.values()) if (inside(p.nodes)) out.push({ type: 'surface3d', data: { id: id++, quadId: p.id, on: 'plate', q: w.w, caseId: WEIGHT_CASE } });
    } else {
      const r = w.region;
      const target: FloorTarget | null = r.kind === 'zone' ? { by: 'zone', zoneId: r.zoneId } : r.kind === 'group' ? { by: 'group', groupId: r.groupId }
        : r.kind === 'box' ? { by: 'range', ...(r.x ? { x: r.x } : {}), ...(r.y ? { y: r.y } : {}), ...(r.z ? { z: r.z } : {}) } : null;
      if (!target) continue;
      const e = expandDefinition({ ...m, loadCases: [{ id: WEIGHT_CASE }] }, { caseId: WEIGHT_CASE, q: w.w, target, distribution: 'twoWay' }, {}, -1, { leftHand });
      for (const l of e.loads) out.push({ ...l, data: { ...l.data, id: id++ } } as Load);
    }
  }
  return out;
}
