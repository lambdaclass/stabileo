/**
 * §9.7.3.8.2 by the member's declared role in the lateral-force-resisting system: the three values
 * on one beam, read by the verifier (`supportInputOf`, `endSupportVerdicts`) and by the planner
 * the detailing lays the bars with (`planSupportEnd`), with the numbers worked by hand.
 *
 * The beam: 20×50, 5 m, between two 40×40 columns of H-30 with no beam crossing them, 2Ø12 below
 * and 2Ø12 above at both ends, cover 2,5 cm, Ø8 stirrups and ties, the aggregate not stated
 * (20 mm assumed), every column at the project's default cage (Ø32, the largest bar it admits).
 *
 *   Not part of the system: a quarter of the bottom bars, at least two, run 150 mm past the face
 *   (§9.7.3.8.2) and stop: 2Ø12 straight, 15,0 cm available, 15,0 cm required.
 *   Part of it, and NOT DECLARED: fy developed at the face, hooked. ℓdh(Ø12, H-30) =
 *   0,24·420/√30·0,012 = 0,2208 m. The hook's outer edge stands behind the column's Ø32 with
 *   §25.2.3's máx(40 mm; 1,5·32 mm) = 48 mm: ring 0,20 − 0,025 − 0,008 − 0,001 = 0,166, plane
 *   0,166 + 0,001 − 0,032 − 0,048 = 0,087; the bottom hook turns inside the top row's, one Ø12
 *   and §25.2.1's máx(25; 12; 4/3·20) = 26,67 mm in: 0,087 − 0,03867 = 0,04833. Available
 *   0,20 + 0,04833 = 0,2483 m ≥ 0,2208: a hook.
 */
import { describe, it, expect } from 'vitest';
import { buildMemberContext, type ContextModelData } from '../member-context';
import { endSupportChecks, endSupportVerdicts, supportInputOf } from '../end-support-anchorage';
import { lateralReadingOf, physicalKey, memberKey, type LateralSystemData, spanLateralReading } from '../../../model/lateral-system';
import { deriveHookedDevelopment } from '../../../codes/cirsoc201/anchorage';
import type { ProvidedReinforcement } from '../../../design-contract/reinforcement';

const model: ContextModelData = {
  nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0, y: 0, z: 3 }], [3, { id: 3, x: 5, y: 0, z: 3 }], [4, { id: 4, x: 5, y: 0, z: 0 }]]),
  elements: new Map([
    [1, { id: 1, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1, type: 'frame' }],
    [2, { id: 2, nodeI: 2, nodeJ: 3, sectionId: 2, materialId: 1, type: 'frame' }],
    [3, { id: 3, nodeI: 4, nodeJ: 3, sectionId: 1, materialId: 1, type: 'frame' }],
  ]),
  sections: new Map([[1, { id: 1, name: '40x40', b: 0.4, h: 0.4 }], [2, { id: 2, name: '20x50', b: 0.2, h: 0.5 }]]),
  materials: new Map([[1, { id: 1, name: 'H-30', fy: 30 }]]),
  supports: new Map([[1, { nodeId: 1, type: 'fixed3d' }], [2, { nodeId: 4, type: 'fixed3d' }]]),
};

const rebar: ProvidedReinforcement = {
  regions: {
    bottomSpan: { count: 2, diameter: 12 }, topStart: { count: 2, diameter: 12 }, topEnd: { count: 2, diameter: 12 },
    stirrupsSupport: { diameter: 8, legs: 2, spacing: 0.1 }, stirrupsSpan: { diameter: 8, legs: 2, spacing: 0.15 },
  },
} as never;

/** The bottom rows at both ends, as the verifier reads them under a declaration. */
function bottomEnds(data: LateralSystemData | undefined) {
  const ctx = buildMemberContext(2, model, { lateralOf: (id, kind) => lateralReadingOf(data, id, { kind }) })!;
  expect(ctx.elementType).toBe('beam');
  const input = supportInputOf(ctx, rebar)!;
  const verdicts = endSupportVerdicts(input).filter((v) => v.position === 'bottom');
  const rows = endSupportChecks(endSupportVerdicts(input), input.lateral).filter((c) => /bottom/.test(c.category));
  return {
    role: ctx.lateral?.role, develops: input.lateralSystem,
    ends: verdicts.map((v) => [v.end, v.row, v.rule, v.solution, +v.required.toFixed(4), +v.available.toFixed(4)]),
    notes: rows.map((r) => r.description.split(' · ')[1]),
  };
}

describe('§9.7.3.8.2: one beam, its three readings', () => {
  const ldh12 = deriveHookedDevelopment({ diameterMm: 12, fy: 420, fc: 30, edition: '2025' }).ldhM;
  const hooked = 0.2 + (0.166 + 0.001 - 0.032 - 0.048) - (0.012 + (4 / 3) * 0.020);

  it('ℓdh(Ø12, H-30) and the hook plane are the ones worked by hand', () => {
    expect(ldh12).toBeCloseTo(0.24 * 420 / Math.sqrt(30) * 0.012, 6);
    expect(+ldh12.toFixed(4)).toBe(0.2208);
    expect(+hooked.toFixed(4)).toBe(0.2483);
  });

  it('declared not part of the system: 150 mm past the face, straight', () => {
    const r = bottomEnds({ members: { [memberKey(2)]: 'gravity' } });
    expect([r.role, r.develops]).toEqual(['gravity', false]);
    // Cut 150 mm past the face, every bottom row ends straight there: the plan also allows the
    // extra top layer (`endSupportPlan`), which lays a second bottom row, and it ends so too.
    expect(r.ends).toEqual([
      ['start', 0, '9.7.3.8.2', 'straight', 0.15, 0.15], ['start', 1, '9.7.3.8.2', 'straight', 0.15, 0.15],
      ['end', 0, '9.7.3.8.2', 'straight', 0.15, 0.15], ['end', 1, '9.7.3.8.2', 'straight', 0.15, 0.15],
    ]);
    expect(r.notes.every((n) => /declared not part/.test(n!))).toBe(true);
  });

  it('declared part of the system: fy developed at the face, hooked, ℓdh against the hook\'s outer edge', () => {
    const r = bottomEnds({ members: { [memberKey(2)]: 'lateral' } });
    expect([r.role, r.develops]).toEqual(['lateral', true]);
    // Hooked, a second bottom row would turn one Ø12 and 26,67 mm further in, 0,2097 < 0,2208:
    // the plan holds the member to its fewest top layers and lays one bottom row.
    expect(r.ends).toEqual([['start', 0, 'ldh', 'hook', 0.2208, 0.2483], ['end', 0, 'ldh', 'hook', 0.2208, 0.2483]]);
    expect(r.notes.every((n) => /declared part of the lateral-force-resisting system, fy developed/.test(n!))).toBe(true);
  });

  it('NOT declared: designed as part of the system, the same ends, and the rows say it was assumed', () => {
    for (const data of [undefined, {}, { members: { [memberKey(9)]: 'gravity' as const } }]) {
      const r = bottomEnds(data);
      expect([r.role, r.develops]).toEqual(['undeclared', true]);
      expect(r.ends).toEqual([['start', 0, 'ldh', 'hook', 0.2208, 0.2483], ['end', 0, 'ldh', 'hook', 0.2208, 0.2483]]);
      expect(r.notes.every((n) => /not declared, designed as part of it \(fy developed at the face, which also meets the 150 mm\)/.test(n!))).toBe(true);
    }
  });

  it('a context built with no declaration at all is not declared, never «not part»', () => {
    const ctx = buildMemberContext(2, model, {})!;
    expect(ctx.lateral).toBeUndefined();
    expect(supportInputOf(ctx, rebar)!.lateralSystem).toBe(true);
  });
});

describe('where a declaration is read from', () => {
  it('the member over its physical element over the beams\' default; the default is the beams\' only', () => {
    const d: LateralSystemData = { beams: 'gravity', members: { [physicalKey(7)]: 'lateral', [memberKey(5)]: 'gravity' } };
    expect(lateralReadingOf(d, 5, { physicalId: 7 })).toEqual({ role: 'gravity', source: 'member' });
    expect(lateralReadingOf(d, 6, { physicalId: 7 })).toEqual({ role: 'lateral', source: 'physical' });
    expect(lateralReadingOf(d, 6)).toEqual({ role: 'gravity', source: 'project' });
    expect(lateralReadingOf(d, 6, { kind: 'column' })).toEqual({ role: 'undeclared' });
  });

  it('a span: any piece part of the system makes it so; outside only when every piece is declared so', () => {
    const L = { role: 'lateral' as const, source: 'member' as const }, G = { role: 'gravity' as const, source: 'member' as const };
    expect(spanLateralReading([G, L, undefined]).role).toBe('lateral');
    expect(spanLateralReading([G, G]).role).toBe('gravity');
    expect(spanLateralReading([G, undefined]).role).toBe('undeclared');
  });
});

describe('every support row has a name of its own', () => {
  /*
   * The defect: a group of more than two top bars at a support lays the continuous pair and the
   * rest of the group in the same outer row (`supportRows`), and both rows were named
   * «Anchorage at support (start, top)». The verification table keys its rows on that name, so
   * on rc-design-qa-8 the duplicate took the whole design panel down
   * (`f3-edit-retroactive.spec.ts`, `f3-product-decisions.spec.ts`: «ProPanel tab error»).
   */
  it('the continuous pair and the rest of its group, in one row, read as two rows', () => {
    const four: ProvidedReinforcement = {
      regions: { ...rebar.regions!, topStart: { count: 4, diameter: 12 }, topEnd: { count: 4, diameter: 12 } },
    } as never;
    const ctx = buildMemberContext(2, model, {})!;
    const input = supportInputOf(ctx, four)!;
    const verdicts = endSupportVerdicts(input);
    // The premise: two verdicts in the outer top row at one end, the pair and the rest.
    expect(verdicts.filter((v) => v.end === 'start' && v.position === 'top' && v.row === 0).map((v) => v.continuousPair))
      .toEqual([true, false]);
    const names = endSupportChecks(verdicts, input.lateral).map((c) => c.category);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('Anchorage at support (start, top, continuous pair)');
    expect(names).toContain('Anchorage at support (start, top)');
  });
});
