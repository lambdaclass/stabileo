/**
 * Phases by hand: the usual sequence by level with its dates, what each phase builds and what
 * stands before it, the safety items of a level, and the stages of the staged analysis.
 */
import { describe, expect, it } from 'vitest';
import { builtBy, phaseEnd, phasesByLevel, safetyItems, stagesFromPhases, type SiteMember } from '../phases';

const levels = [{ name: 'PB', z: 0 }, { name: 'P1', z: 3 }, { name: 'P2', z: 6 }];
const members: SiteMember[] = [
  { key: 'f1', kind: 'foundation', zBottom: -1, zTop: -0.5 },
  { key: 'g1', kind: 'vertical', zBottom: 0, zTop: 3 }, { key: 'g2', kind: 'horizontal', zBottom: 3, zTop: 3 },
  { key: 'g3', kind: 'vertical', zBottom: 3, zTop: 6 }, { key: 'g4', kind: 'horizontal', zBottom: 6, zTop: 6 },
];

describe('phases', () => {
  it('foundations, then each level\'s verticals and horizontals, one after the other', () => {
    const r = phasesByLevel(levels, members, '2026-11-02', 7);
    expect(r.phases.map((p) => [p.nameKey, p.params.level ?? '', p.start])).toEqual([
      ['site.phase.foundations', '', '2026-11-02'], ['site.phase.verticals', 'P1', '2026-11-09'], ['site.phase.horizontals', 'P1', '2026-11-16'],
      ['site.phase.verticals', 'P2', '2026-11-23'], ['site.phase.horizontals', 'P2', '2026-11-30'],
    ]);
    expect(phaseEnd(r.phases[4]!)).toBe('2026-12-07');
    expect(r.assign).toEqual({ f1: 'ph1', g1: 'ph2', g2: 'ph3', g3: 'ph4', g4: 'ph5' });
    const b = builtBy({ phases: r.phases, assign: r.assign });
    expect(b[3]!.keys).toEqual(['g3']);
    expect(b[3]!.before).toEqual(['f1', 'g1', 'g2']);
  });

  it('safety of a level from its slabs, and the staged analysis\' stages', () => {
    const s = safetyItems('P1', [{ perimeter: 22, area: 30 }], 3, 'ph3');
    expect(s.map((x) => [x.kind, x.quantity])).toEqual([['guardrail', 22], ['net', 66], ['scaffold', 66], ['shoring', 30]]);
    const r = phasesByLevel(levels, members, '2026-11-02', 7);
    const stages = stagesFromPhases({ phases: r.phases.map((p) => ({ ...p, name: p.nameKey })), assign: r.assign }, (k) => ({ elements: k.startsWith('g') ? [Number(k.slice(1))] : [], plates: [], quads: [] }), [1, 2]);
    expect(stages.map((x) => x.elementsAdded)).toEqual([[], [1], [2], [3], [4]]);
    expect(stages[0]!.caseIds).toEqual([1, 2]);
    expect(stages[1]!.caseIds).toEqual([]);
  });
});
