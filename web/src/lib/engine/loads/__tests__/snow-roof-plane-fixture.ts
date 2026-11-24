import type { LoadModelData } from '../load-plan';
import { gravityLayout } from '../plan-gravity';
import { snowLoadCases } from '../snow-loads';
import { stepRoof } from './snow-step-fixture';
import { defaultRegulations, type ProjectRegulations } from '../../../codes/roles';
export function regulations(): ProjectRegulations {
  const reg = defaultRegulations();
  for (const key of Object.keys(reg) as Array<keyof ProjectRegulations>) if (reg[key].adapterId) reg[key] = { ...reg[key], configComplete: true, state: 'applied' };
  return reg;
}

export const snow = { pg: 1, terrain: 'C' as const, exposure: 'partial' as const, thermal: 'normal' as const, category: 'II' as const, roofKind: 'gable' as const, slippery: true, partial: false };

export function pressure(loads: Array<{ elementId: number; q: number; qJ?: number; a?: number; b?: number }>, id: number, x = 0) {
  return -loads.filter(d => d.elementId === id && (d.a ?? 0) <= x && (d.b === undefined || d.b > x)).reduce((sum, d) => {
    const t = d.b === undefined ? 0 : (x - (d.a ?? 0)) / (d.b - (d.a ?? 0));
    return sum + d.q + ((d.qJ ?? d.q) - d.q) * t;
  }, 0);
}

export function run(model = stepRoof(), mode: 'panels' | 'width' = 'panels') {
  const layout = gravityLayout(model, { mode, tributaryWidth: 1 });
  return snowLoadCases({ model, snow, tributaryWidth: 1, layout })!;
}

export function skewRoof() {
  const model = stepRoof(0);
  model.nodes.clear(); model.elements.clear();
  for (const [id, x, y] of [[1, 0, 0], [2, 6, 0], [3, 6, 6], [4, 0, 6]] as const) model.nodes.set(id, { id, x, y, z: 3 + 0.5 * y });
  for (const [id, nodeI, nodeJ] of [[1, 1, 2], [2, 2, 3], [3, 3, 4], [4, 4, 1], [5, 1, 3]] as const) model.elements.set(id, { id, nodeI, nodeJ, sectionId: 1, materialId: 1 });
  return model;
}

export function transverseSnowLoads<T extends { elementId: number; q: number; qJ?: number; frame?: string }>(model: LoadModelData, loads: T[]): T[] {
  return loads.map(d => {
    if (d.frame !== 'projected') return d;
    const e = model.elements.get(d.elementId)!, a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    const horizontal2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    const factor = horizontal2 / (horizontal2 + ((b.z ?? 0) - (a.z ?? 0)) ** 2);
    return { ...d, q: d.q * factor, ...(d.qJ !== undefined ? { qJ: d.qJ * factor } : {}) };
  });
}
