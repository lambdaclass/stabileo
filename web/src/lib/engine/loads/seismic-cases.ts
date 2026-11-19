import { msg } from '../../codes/message';
import type { PlannedDistributed, PlannedNodal, PlannedSurface } from './load-plan';
import { massSamples, type MassRefusal, type SeismicLevel } from './seismic-mass';

export type TorsionalIrregularity = 'low' | 'medium' | 'extreme';
export const ACCIDENTAL_ECCENTRICITY: Readonly<Record<TorsionalIrregularity, number>> = Object.freeze({ low: 0, medium: 0.05, extreme: 0.1 });

type Directions = { x: boolean; y: boolean };
type Selection = { directions: Directions } & (
  { diagonal: true; torsion: 'low' } | { diagonal: false; torsion: TorsionalIrregularity }
);

export function staticSeismicSelection({ directions, diagonal, torsion = 'low' }: {
  directions: Directions; diagonal?: boolean; torsion?: TorsionalIrregularity;
}): Selection | { blocked: ReturnType<typeof msg> } {
  if (!diagonal) return { directions, diagonal: false, torsion };
  if (torsion === 'low') return { directions, diagonal: true, torsion };
  return { blocked: msg('loadPlan.blocked.seismicDiagonalTorsion') };
}

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
  selection: Selection;
};

type CaseLoad<T> = Omit<T, 'caseType' | 'caseIndex'>;
type StoryLoads = {
  nodal: CaseLoad<PlannedNodal>[];
  distributed: CaseLoad<PlannedDistributed>[];
  surface: CaseLoad<PlannedSurface>[];
};

function geometryOf(level: SeismicLevel) {
  const first = level.mass[0]!;
  const origin = first.kind === 'shell' ? first.nodes[0]! : first.nodeI;
  let sx = 0, sy = 0, weight = 0;
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
  return { origin, x, y, polar, weight };
}

function levelLoading(level: SeismicLevel, g: ReturnType<typeof geometryOf>, fx: number, fy: number, eccentricity: number, axis: Case['axis']):
  StoryLoads | { reason: MassRefusal } {
  const loads: StoryLoads = { nodal: [], distributed: [], surface: [] };
  if (fx === 0 && fy === 0) return loads;
  if (![fx, fy, g.weight, level.weightKN].every(Number.isFinite) || g.weight <= 0 || level.weightKN <= 0) return { reason: 'weight' };
  if (eccentricity !== 0 && level.mass.some(m => m.kind !== 'shell' && !!m.width)) return { reason: 'eccentric' };
  const moment = eccentricity * (axis === 'X' ? fx * level.planWidth.y : fy * level.planWidth.x);
  if (![g.x, g.y, g.polar, moment].every(Number.isFinite) || (moment !== 0 && !(g.polar > 0))) return { reason: 'torsion' };
  const spin = moment === 0 ? 0 : moment / g.polar;
  const ax = fx / level.weightKN, ay = fy / level.weightKN;
  const acceleration = Math.hypot(ax, ay);
  if (![acceleration, spin].every(Number.isFinite)) return { reason: 'torsion' };
  const turnX = (y: number) => -spin * ((y - g.origin.y) - g.y);
  const turnY = (x: number) => spin * ((x - g.origin.x) - g.x);
  const actions = new Map<number, CaseLoad<PlannedNodal>>();

  for (const mass of level.mass) {
    switch (mass.kind) {
      case 'member': {
        if (spin !== 0 && mass.wi !== mass.wj) return { reason: 'torsion' };
        const x = (s: number) => mass.nodeI.x + (mass.nodeJ.x - mass.nodeI.x) * (s / mass.length);
        const y = (s: number) => mass.nodeI.y + (mass.nodeJ.y - mass.nodeI.y) * (s / mass.length);
        const qX = mass.wi * (ax + turnX(y(mass.a))), qXJ = mass.wj * (ax + turnX(y(mass.b)));
        const qY = mass.wi * (ay + turnY(x(mass.a))), qYJ = mass.wj * (ay + turnY(x(mass.b)));
        if (![qX, qXJ, qY, qYJ].every(Number.isFinite)) return { reason: 'torsion' };
        if (qX || qXJ || qY || qYJ) {
          loads.distributed.push({ elementId: mass.elementId, frame: 'global', a: mass.a, b: mass.b, q: 0, qX, qXJ, qY, qYJ });
        }
        break;
      }
      case 'shell': {
        const q = mass.density * acceleration;
        if (!Number.isFinite(q)) return { reason: 'torsion' };
        if (q) loads.surface.push({ quadId: mass.quadId, on: mass.on, frame: 'global', q, dir: [ax / acceleration, ay / acceleration, 0] });
        if (spin === 0) break;
        for (const [dir, along, turn] of [
          [[1, 0, 0], 'y', turnX], [[0, 1, 0], 'x', turnY],
        ] as const) {
          const coords = mass.nodes.map(n => n[along]);
          const c1 = Math.min(...coords), c2 = Math.max(...coords);
          const q1 = mass.density * turn(c1), q2 = mass.density * turn(c2);
          if (![q1, q2].every(Number.isFinite) || c1 === c2) return { reason: 'torsion' };
          if (q1 || q2) loads.surface.push({
            quadId: mass.quadId, on: mass.on, frame: 'global', q: 0, dir: [...dir],
            vary: { dir: along === 'x' ? [1, 0, 0] : [0, 1, 0], c1, c2, q1, q2 },
          });
        }
        break;
      }
      case 'nodal': {
        const { node } = mass;
        const load = actions.get(node.id) ?? { nodeId: node.id, fx: 0, fy: 0, fz: 0 };
        const share = (mass.b - mass.a) * (mass.wi + mass.wj) / 2 / level.weightKN;
        load.fx += share * fx;
        load.fy += share * fy;
        massSamples(mass, (w, x, y) => {
          const spinX = w * turnX(y), spinY = w * turnY(x);
          load.fx += spinX;
          load.fy += spinY;
          const mz = (x - node.x) * (w * ay + spinY) - (y - node.y) * (w * ax + spinX);
          if (mz !== 0) load.mz = (load.mz ?? 0) + mz;
        });
        actions.set(node.id, load);
        break;
      }
    }
  }

  const nodal = [...actions.values()].sort((a, b) => a.nodeId - b.nodeId);
  if (nodal.some(n => ![n.fx, n.fy, n.mz ?? 0].every(Number.isFinite))) return { reason: 'torsion' };
  loads.nodal = nodal.filter(n => n.fx !== 0 || n.fy !== 0 || n.mz);
  return loads;
}

export function staticSeismicCases(i: SeismicCasesInput, refuse: (level: SeismicLevel, reason: MassRefusal) => void) {
  const { directions, diagonal, torsion } = i.selection;
  const e = ACCIDENTAL_ECCENTRICITY[torsion];
  const cases: Case[] = [];
  for (const axis of ['X', 'Y'] as const) {
    if (!(axis === 'X' ? directions.x : directions.y)) continue;
    const force: Case['force'] = k => axis === 'X' ? [i.forces[k]!, 0] : [0, i.forces[k]!];
    for (const sign of e > 0 ? [1, -1] : [0]) {
      cases.push(sign === 0
        ? { nameKey: 'autoLoad.seismicCaseDir', nameParams: { dir: axis }, axis, force, eccentricity: 0 }
        : { nameKey: 'autoLoad.seismicCaseEcc', nameParams: { dir: axis, sign: sign > 0 ? '+' : '−', e: Math.round(e * 100) }, axis, force, eccentricity: sign * e });
    }
  }
  if (diagonal) cases.push({
    nameKey: 'autoLoad.seismicCaseDir', nameParams: { dir: '45°' }, axis: 'diagonal', eccentricity: 0,
    force: k => {
      const f = Math.abs(i.forces[k]!) / Math.SQRT2;
      return [f, f];
    },
  });
  const perCase = cases.map((c): Case & StoryLoads => ({ ...c, nodal: [], distributed: [], surface: [] }));
  i.levels.forEach((level, k) => {
    if (level.refusals.size > 0) return;
    if (level.mass.length === 0) { refuse(level, 'weight'); return; }
    const geometry = geometryOf(level);
    const loads = cases.map(c => levelLoading(level, geometry, ...c.force(k), c.eccentricity, c.axis));
    const refused = loads.find(l => 'reason' in l);
    if (refused) { refuse(level, refused.reason); return; }
    loads.forEach((load, index) => {
      if ('reason' in load) return;
      const target = perCase[index]!;
      for (const n of load.nodal) target.nodal.push(n);
      for (const d of load.distributed) target.distributed.push(d);
      for (const s of load.surface) target.surface.push(s);
    });
  });
  return perCase;
}
