import type { PlannedDistributed, PlannedSurface } from './load-plan';
import { atLine, massSamples, type MassRefusal, type SeismicLevel } from './seismic-mass';
import { fitStoryCarriers } from './seismic-story-carriers';
import { globalMemberLine, integrateWindPressure, WindPressureRefusal } from './wind-pressure-field';

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

type MemberLoad = Omit<PlannedDistributed, 'caseType' | 'caseIndex'>;
type ShellLoad = Omit<PlannedSurface, 'caseType' | 'caseIndex'>;

function geometryOf(level: SeismicLevel, fitted: NonNullable<ReturnType<typeof fitStoryCarriers>>) {
  const first = level.mass[0]!;
  const origin = first.kind === 'line' ? fitted.get(first)?.atStory ?? atLine(first, first.a) : first.nodes[0]!;
  const sampleLevel = (sample: Parameters<typeof massSamples>[1]) => {
    for (const mass of level.mass) {
      const story = mass.kind === 'line' ? fitted.get(mass) : undefined;
      massSamples(mass, (w, x, y) => sample(w, story?.atStory.x ?? x, story?.atStory.y ?? y));
    }
  };
  let sx = 0, sy = 0;
  sampleLevel((w, x, y) => { sx += w * (x - origin.x); sy += w * (y - origin.y); });
  const x = origin.x + sx / level.weightKN, y = origin.y + sy / level.weightKN;
  let polar = 0;
  sampleLevel((w, px, py) => { polar += w * ((px - x) ** 2 + (py - y) ** 2); });
  return { x, y, polar };
}

function levelLoading(level: SeismicLevel, fitted: ReturnType<typeof fitStoryCarriers>, fx: number, fy: number, eccentricity: number, axis: Case['axis']):
  { distributed: MemberLoad[]; surface: ShellLoad[] } | { reason: MassRefusal } {
  const distributed: MemberLoad[] = [], surface: ShellLoad[] = [];
  if (fx === 0 && fy === 0) return { distributed, surface };
  if (level.mass.length === 0 || ![fx, fy, level.weightKN].every(Number.isFinite) || level.weightKN <= 0) return { reason: 'weight' };
  if (eccentricity !== 0 && level.mass.some(m => m.kind === 'line' && !!m.width)) return { reason: 'eccentric' };
  if (!fitted) return { reason: 'overturning' };
  const g = geometryOf(level, fitted);
  const moment = eccentricity * (axis === 'X' ? fx * level.planWidth.y : fy * level.planWidth.x);
  if (![g.x, g.y, g.polar, moment].every(Number.isFinite) || (moment !== 0 && !(g.polar > 0))) return { reason: 'torsion' };
  const spin = moment === 0 ? 0 : moment / g.polar;
  const ax = (y: number) => fx / level.weightKN - spin * (y - g.y);
  const ay = (x: number) => fy / level.weightKN + spin * (x - g.x);
  for (const m of level.mass) {
    if (m.kind === 'shell') {
      for (const [coordinate, direction, varyDirection, field] of [
        ['y', [1, 0, 0], [0, 1, 0], ax], ['x', [0, 1, 0], [1, 0, 0], ay],
      ] as const) {
        const values = m.nodes.map(n => n[coordinate]), c1 = Math.min(...values), c2 = Math.max(...values);
        const q1 = m.density * field(c1), q2 = m.density * field(c2);
        if (q1 === 0 && q2 === 0) continue;
        const varying = c2 > c1 && q1 !== q2;
        surface.push({ quadId: m.quadId, ...(m.on ? { on: m.on } : {}), frame: 'global', dir: [...direction], q: varying ? 0 : q1,
          ...(varying ? { vary: { dir: [...varyDirection], c1, c2, q1, q2 } } : {}) });
      }
      continue;
    }
    const { a, b } = m;
    const story = fitted.get(m);
    if (story) {
      const x = ax(story.atStory.y), y = ay(story.atStory.x);
      const ends = [story.wi * x + 0, story.wj * x + 0, story.wi * y + 0, story.wj * y + 0] as const;
      if (!ends.every(Number.isFinite)) return { reason: 'overturning' };
      distributed.push(globalMemberLine(m.elementId, a, b, ...ends));
      continue;
    }
    const i = atLine(m, a), j = atLine(m, b);
    if (spin === 0 || m.wi === m.wj || (i.x === j.x && i.y === j.y)) {
      distributed.push(globalMemberLine(m.elementId, a, b, i.weight * ax(i.y), j.weight * ax(j.y), i.weight * ay(i.x), j.weight * ay(j.x)));
      continue;
    }
    try {
      for (const axis of ['x', 'y'] as const) {
        const parts = integrateWindPressure(b - a, [], s => {
          const p = atLine(m, a + s);
          return p.weight * (axis === 'x' ? ax(p.y) : ay(p.x));
        });
        for (const p of parts) {
          if (p.q === 0 && p.qJ === 0) continue;
          const ends: [number, number, number, number] = axis === 'x' ? [p.q, p.qJ, 0, 0] : [0, 0, p.q, p.qJ];
          distributed.push(globalMemberLine(m.elementId, a + p.a, a + p.b, ...ends));
        }
      }
    } catch (error) {
      if (!(error instanceof WindPressureRefusal)) throw error;
      return { reason: 'torsion' };
    }
  }
  return { distributed, surface };
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
  const perCase = cases.map(c => ({ ...c, distributed: [] as MemberLoad[], surface: [] as ShellLoad[] }));
  i.levels.forEach((level, k) => {
    if (level.refusals.size > 0) return;
    const fitted = fitStoryCarriers(level);
    const loads = cases.map(c => levelLoading(level, fitted, ...c.force(k), c.eccentricity, c.axis));
    for (const l of loads) if ('reason' in l) { refuse(level, l.reason); return; }
    loads.forEach((l, index) => {
      if ('reason' in l) return;
      for (const d of l.distributed) perCase[index]!.distributed.push(d);
      for (const s of l.surface) perCase[index]!.surface.push(s);
    });
  });
  return perCase;
}
