/**
 * A basement wall's earth pressure, defined by the wall: its retained soil (grade, γ, K, surcharge
 * and a plan point in the soil) applied to its own shells as a pressure p = K·(γ·(grade − z) + q)
 * by the same generator the load plan uses (`special-loads.ts`), in the earth-pressure case H. The
 * soil is kept with the physical wall so it can be read and applied again; the earlier pressure on
 * those shells in H is replaced. A strength combination that does not carry H takes it at 1,6
 * (CIRSOC 101 / ACI 5.3: H adds to the gravity it acts with). One undo step.
 */
import { modelStore } from './model.svelte';
import { physicalGroups } from './physical';
import { specialLoads, wallPressureForces, type SoilInput } from '../engine/loads/special-loads';

export const H_FACTOR = 1.6;

export function applyEarthPressure(groupIds: readonly number[], soil: SoilInput): { shells: number; caseId: number; combinations: number; notes: number; force: { x: number; y: number } } {
  const groups = physicalGroups().filter((g) => groupIds.includes(g.id) && g.physical.kind === 'wall');
  const quadIds = new Set(groups.flatMap((g) => g.members.quads ?? []));
  const quads = new Map([...modelStore.quads].filter(([id]) => quadIds.has(id)).map(([id, q]) => [id, { id, nodes: q.nodes }]));
  const res = specialLoads({ nodes: modelStore.nodes as never, elements: new Map(), quads }, { soil });
  let caseId = -1, combinations = 0;
  modelStore.batch(() => {
    caseId = modelStore.model.loadCases.find((c) => c.type === 'H')?.id ?? modelStore.addLoadCase('H', 'H');
    for (const l of [...modelStore.model.loads]) {
      const d = l.data as { id: number; quadId?: number; caseId?: number };
      if (l.type === 'surface3d' && d.caseId === caseId && d.quadId !== undefined && quadIds.has(d.quadId)) modelStore.removeLoad(d.id);
    }
    for (const w of res.soil) modelStore.addSurfaceLoad3D(w.quadId, 0, caseId, { frame: 'global', dir: w.dir, vary: w.vary } as never);
    for (const g of groups) modelStore.setGroupData(g.id, { ...(g.physical as unknown as Record<string, unknown>), retains: { ...soil } });
    for (const c of modelStore.model.combinations) {
      if (c.origin?.purpose === 'service' || c.factors.some((f) => f.caseId === caseId)) continue;
      modelStore.updateCombination(c.id, { factors: [...c.factors, { caseId, factor: H_FACTOR }] });
      combinations++;
    }
  });
  const f = wallPressureForces({ nodes: modelStore.nodes as never, elements: new Map(), quads }, res.soil);
  return { shells: res.soil.length, caseId, combinations, notes: res.notes.length, force: { x: f.reduce((s, n) => s + n.fx, 0), y: f.reduce((s, n) => s + n.fy, 0) } };
}
