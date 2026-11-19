import type { PlannedNodal } from './load-plan';
import { massSamples, massTributaries, type MassRefusal, type SeismicLevel } from './seismic-mass';

export type TorsionalIrregularity = 'low' | 'medium' | 'extreme';
export const ACCIDENTAL_ECCENTRICITY: Readonly<Record<TorsionalIrregularity, number>> = Object.freeze({ low: 0, medium: 0.05, extreme: 0.1 });

type Case = {
  nameKey: string;
  nameParams: Record<string, string | number>;
  axis: 'X' | 'Y' | 'diagonal';
  force: (k: number) => [number, number];
  eccentricity: number;
};

type SeismicCasesInput = {
  levels: readonly SeismicLevel[];
  forces: readonly number[];
  diagonal?: boolean;
  directions: { x: boolean; y: boolean };
  torsion?: TorsionalIrregularity;
};

type StoryLoad = Omit<PlannedNodal, 'caseType' | 'caseIndex'>;

function geometryOf(level: SeismicLevel) {
  const origin = level.mass[0]!.nodes[0]!;
  let sx = 0, sy = 0, weight = 0;
  const tributaries = new Map<number, number>();
  for (const mass of level.mass) massTributaries(mass, (node, w) => {
    tributaries.set(node.id, (tributaries.get(node.id) ?? 0) + w);
  });
  for (const mass of level.mass) massSamples(mass, (w, x, y) => {
    sx += w * (x - origin.x);
    sy += w * (y - origin.y);
    weight += w;
  });
  const x = sx / weight, y = sy / weight;
  let polar = 0;
  for (const mass of level.mass) massSamples(mass, (w, px, py) => {
    polar += w * (((px - origin.x) - x) ** 2 + ((py - origin.y) - y) ** 2);
  });
  return { origin, x, y, polar, weight, tributaries };
}

function levelLoading(level: SeismicLevel, g: ReturnType<typeof geometryOf>, fx: number, fy: number, eccentricity: number, axis: Case['axis']):
  { nodal: StoryLoad[] } | { reason: MassRefusal } {
  if (fx === 0 && fy === 0) return { nodal: [] };
  if (![fx, fy, g.weight, level.weightKN].every(Number.isFinite) || g.weight <= 0 || level.weightKN <= 0) return { reason: 'weight' };
  if (eccentricity !== 0 && level.mass.some(m => m.kind === 'line' && !!m.width)) return { reason: 'eccentric' };
  const moment = eccentricity * (axis === 'X' ? fx * level.planWidth.y : fy * level.planWidth.x);
  if (![g.x, g.y, g.polar, moment].every(Number.isFinite) || (moment !== 0 && !(g.polar > 0))) return { reason: 'torsion' };
  const spin = moment === 0 ? 0 : moment / g.polar;
  const actions = new Map<number, StoryLoad>();
  for (const [nodeId, weight] of g.tributaries) {
    const share = weight / level.weightKN;
    actions.set(nodeId, { nodeId, fx: share * fx, fy: share * fy, fz: 0 });
  }
  for (const mass of level.mass) {
    if (spin === 0 && mass.nodes.length > 1) continue;
    massSamples(mass, (w, x, y, nodes, shape) => {
      const spinX = -w * spin * ((y - g.origin.y) - g.y);
      const spinY = w * spin * ((x - g.origin.x) - g.x);
      for (const [i, node] of nodes.entries()) {
        const load = actions.get(node.id)!;
        load.fx += shape[i]! * spinX;
        load.fy += shape[i]! * spinY;
        if (nodes.length === 1) {
          const mz = (x - node.x) * (w * (fy / level.weightKN) + spinY)
            - (y - node.y) * (w * (fx / level.weightKN) + spinX);
          if (mz !== 0) load.mz = (load.mz ?? 0) + mz;
        }
      }
    });
  }
  const nodal = [...actions.values()].sort((a, b) => a.nodeId - b.nodeId);
  if (nodal.some(n => ![n.fx, n.fy, n.mz ?? 0].every(Number.isFinite))) return { reason: 'torsion' };
  return { nodal: nodal.filter(n => n.fx !== 0 || n.fy !== 0 || n.mz) };
}

export function staticSeismicCases(i: SeismicCasesInput, refuse: (level: SeismicLevel, reason: MassRefusal) => void) {
  const e = ACCIDENTAL_ECCENTRICITY[i.torsion ?? 'low'];
  const cases: Case[] = [];
  for (const axis of ['X', 'Y'] as const) {
    if (!(axis === 'X' ? i.directions.x : i.directions.y)) continue;
    const force: Case['force'] = k => axis === 'X' ? [i.forces[k]!, 0] : [0, i.forces[k]!];
    for (const sign of e > 0 ? [1, -1] : [0]) {
      cases.push(sign === 0
        ? { nameKey: 'autoLoad.seismicCaseDir', nameParams: { dir: axis }, axis, force, eccentricity: 0 }
        : { nameKey: 'autoLoad.seismicCaseEcc', nameParams: { dir: axis, sign: sign > 0 ? '+' : '−', e: Math.round(e * 100) }, axis, force, eccentricity: sign * e });
    }
  }
  if (i.diagonal) cases.push({
    nameKey: 'autoLoad.seismicCaseDir', nameParams: { dir: '45°' }, axis: 'diagonal', eccentricity: 0,
    force: k => {
      const f = Math.abs(i.forces[k]!) / Math.SQRT2;
      return [f, f];
    },
  });
  const perCase = cases.map(c => ({ ...c, nodal: [] as StoryLoad[] }));
  i.levels.forEach((level, k) => {
    if (level.refusals.size > 0) return;
    if (level.mass.length === 0) { refuse(level, 'weight'); return; }
    const geometry = geometryOf(level);
    const loads = cases.map(c => levelLoading(level, geometry, ...c.force(k), c.eccentricity, c.axis));
    for (const l of loads) if ('reason' in l) { refuse(level, l.reason); return; }
    loads.forEach((l, index) => {
      if ('reason' in l) return;
      for (const n of l.nodal) perCase[index]!.nodal.push(n);
    });
  });
  return perCase;
}
