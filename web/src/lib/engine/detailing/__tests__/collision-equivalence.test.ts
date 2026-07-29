/**
 * The optimised collision sweep must return exactly what the exhaustive one returns.
 *
 * ── Why a reference and not just "the suite still passes" ──────────
 *
 * The optimisation is a rejection: candidate segment pairs whose bounding boxes are further
 * apart than anything reportable are skipped, and the spatial hash keys cells by a mixed
 * integer instead of a string. Both are supposed to be invisible — the first removes work
 * whose answer is already known, the second can only ever offer EXTRA candidates, never fewer.
 * "Supposed to be" is the part that needs a gate.
 *
 * So `detectCollisions` keeps an escape hatch, `{ prune: false }`, which measures every
 * segment pair exhaustively — the behaviour before the rejection existed. Every case below
 * runs both and requires identical output: same conflicts, same bar ids, same classification,
 * same ordering, same clearances to the last representable digit.
 *
 * If this file ever fails, the optimisation has changed geometry and must be reverted, not
 * re-baselined.
 */

import { describe, expect, it } from 'vitest';
import qa8 from '../../../templates/fixtures/rc-design-qa-8.json';
import row2 from '../../../templates/fixtures/rc-design-qa-row2.json';
import { solveFixture } from '../../design/__tests__/helpers';
import { runDesign } from '../../design/candidate-search';
import { cirsoc201Adapter } from '../../design/adapters/cirsoc201-adapter';
import { runDetailing } from '../run-detailing';
import { detectCollisions, DEFAULT_TOLERANCES } from '../collision';
import { classifyPair, type ClassificationContext } from '../classify';
import { buildStirrupSet, buildColumnTieSet } from '../../../codes/cirsoc201/transverse-cage';
import {
  buildStraightBarWithHooks, straightSegment, type BarPath,
} from '../../../codes/cirsoc201/bar-geometry';
import type { MemberDesignOutcome } from '../../design/outcome';

const CTX: ClassificationContext = {
  edition: '2025', maxAggregateSizeMm: 19, memberKindOf: () => 'beam',
};
const classify = (a: BarPath, b: BarPath, s: number, ta?: never, tb?: never) =>
  classifyPair(a, b, CTX, s, ta, tb);

/**
 * Everything a caller can observe, in a comparable shape.
 *
 * `placementFor` is threaded through because the pruning cutoff is built from the pair's
 * own placement allowance. A per-pair allowance therefore reaches the optimisation, and
 * the gate has to exercise it or the two paths could diverge exactly where they are used.
 */
function shapeOf(
  bars: readonly BarPath[], withClassifier: boolean,
  placementFor?: (a: BarPath, b: BarPath) => number,
) {
  const opts = {
    tolerances: DEFAULT_TOLERANCES,
    classifyFor: withClassifier ? classify : undefined,
    placementFor,
  };
  const fast = detectCollisions(bars, opts);
  const slow = detectCollisions(bars, { ...opts, prune: false });
  const norm = (r: typeof fast) => r.conflicts.map((c) => ({
    barA: c.barA, barB: c.barB, severity: c.severity, pairClass: c.pairClass,
    classLabelKey: c.classLabelKey, clearance: c.clearance, required: c.required,
    shortfall: c.shortfall, elementIds: c.elementIds,
    at: { x: +c.at.x.toFixed(9), y: +c.at.y.toFixed(9), z: +c.at.z.toFixed(9) },
  }));
  return { fast, slow, fastN: norm(fast), slowN: norm(slow) };
}

function expectEquivalent(
  bars: readonly BarPath[], label: string, withClassifier = true,
  placementFor?: (a: BarPath, b: BarPath) => number,
) {
  const { fast, slow, fastN, slowN } = shapeOf(bars, withClassifier, placementFor);
  // Same conflicts, in the same order, with the same ids and the same classification.
  expect(fastN, `${label}: conflict list`).toEqual(slowN);
  expect(fast.constructible, `${label}: constructible flag`).toBe(slow.constructible);
  expect(fast.barCount, `${label}: bar count`).toBe(slow.barCount);
  // Not asserted equal: `narrowPhaseTests` and `barPairsTested`. Those are the WORK done, and
  // doing less of it is the point.
  expect(fast.narrowPhaseTests, `${label}: rejection did no work`)
    .toBeLessThanOrEqual(slow.narrowPhaseTests);
  return { fast, slow };
}

// ─── Synthetic geometry, every relationship the classifier distinguishes ───

function straight(id: string, y: number, z: number, dia = 16, role: BarPath['role'] = 'longitudinal'): BarPath {
  return {
    id, diameterMm: dia, role,
    segments: [straightSegment({ x: 0, y, z }, { x: 4, y, z })],
    startTreatment: { kind: 'straight' }, endTreatment: { kind: 'straight' },
    cuttingLength: 4, ownerElementIds: [1], source: 'generated', locked: false, refs: [],
  };
}

function crossing(id: string, x: number, dia = 16): BarPath {
  return {
    id, diameterMm: dia, role: 'longitudinal',
    segments: [straightSegment({ x, y: -1, z: 0 }, { x, y: 1, z: 0 })],
    startTreatment: { kind: 'straight' }, endTreatment: { kind: 'straight' },
    cuttingLength: 2, ownerElementIds: [2], source: 'generated', locked: false, refs: [],
  };
}

function hooked(id: string, y: number, angle: 90 | 135): BarPath {
  return buildStraightBarWithHooks({
    id, diameterMm: 16, role: 'longitudinal',
    start: { x: 0, y, z: 0 }, end: { x: 3, y, z: 0 },
    axis: { x: 1, y: 0, z: 0 }, hookNormal: { x: 0, y: 0, z: 1 },
    startHook: angle, endHook: angle,
    ownerElementIds: [1], edition: '2025',
  });
}

const cage = (across: { x: number; y: number; z: number }) => buildStirrupSet({
  elementId: 1, zoneId: 'z', station: 0,
  b: 0.3, h: 0.55, cover: 0.025, stirrupDiaMm: 8, legs: 3,
  longitudinalBars: [
    { id: 'lb0', across: -0.1, up: -0.2, diameterMm: 16 },
    { id: 'lb1', across: 0, up: -0.2, diameterMm: 16 },
    { id: 'lb2', across: 0.1, up: -0.2, diameterMm: 16 },
    { id: 'lt0', across: -0.1, up: 0.2, diameterMm: 16 },
    { id: 'lt1', across: 0, up: 0.2, diameterMm: 16 },
    { id: 'lt2', across: 0.1, up: 0.2, diameterMm: 16 },
  ],
  origin: { x: 0, y: 0, z: 0 }, axis: { x: 1, y: 0, z: 0 },
  up: { x: 0, y: 0, z: 1 }, across,
  hookOrientation: 'a', maxAggregateSizeMm: 19, acrossMax: 0.2,
}).pieces.map((p) => p.path);

describe('optimised and exhaustive agree on synthetic geometry', () => {
  it('straight against straight — tangent contact, legal clearance, interpenetration', () => {
    const r = 16 / 2000;
    for (const [gap, label] of [
      [2 * r, 'tangent contact'],
      [2 * r + 0.0005, 'a hair clear'],
      [2 * r + 0.030, 'legally clear'],
      [2 * r - 0.004, 'slight interpenetration'],
      [0, 'coincident'],
    ] as const) {
      expectEquivalent([straight('a', 0, 0), straight('b', gap, 0)], `parallel ${label}`);
    }
  });

  it('unrelated bars crossing at right angles', () => {
    expectEquivalent([straight('a', 0, 0), crossing('x', 2)], 'orthogonal crossing');
    // A per-pair allowance feeds the pruning cutoff. Both directions are exercised: an
    // allowance below the flat tolerance (a tied crossing) and one above it, which is the
    // case a cutoff built from the global tolerance would have wrongly rejected.
    expectEquivalent([straight('a', 0, 0), crossing('x', 2)], 'crossing, zero allowance',
      true, () => 0);
    expectEquivalent([straight('a', 0, 0), crossing('x', 2)], 'crossing, generous allowance',
      true, () => 0.05);
    expectEquivalent([straight('a', 0, 0), straight('b', 0.05, 0)], 'parallel, generous allowance',
      true, () => 0.05);
    expectEquivalent([straight('a', 0, 0), crossing('x', 2, 32)], 'crossing, big bar');
  });

  it('90° and 135° hooks, where the arcs are', () => {
    expectEquivalent([hooked('h90', 0, 90), hooked('h90b', 0.03, 90)], '90° hooks');
    expectEquivalent([hooked('h135', 0, 135), hooked('h135b', 0.03, 135)], '135° hooks');
    expectEquivalent([hooked('h135', 0, 135), crossing('x', 1)], 'hook against a crossing bar');
  });

  it('a beam stirrup set — closed stirrup and its crossties', () => {
    expectEquivalent(cage({ x: 0, y: 1, z: 0 }), 'stirrup set');
  });

  it('a stirrup set against the longitudinal bars it holds', () => {
    const bars = [
      ...cage({ x: 0, y: 1, z: 0 }),
      straight('lb0', -0.1, -0.2), straight('lt0', -0.1, 0.2),
    ];
    expectEquivalent(bars, 'cage + longitudinal');
  });

  it('a column tie set, both crosstie directions', () => {
    const ties = buildColumnTieSet({
      elementId: 9, zoneId: 'j', station: 0,
      b: 0.4, h: 0.4, cover: 0.025, stirrupDiaMm: 8, legs: 2,
      longitudinalBars: [
        { id: 'c0', across: -0.15, up: -0.15, diameterMm: 16 },
        { id: 'c1', across: 0.15, up: -0.15, diameterMm: 16 },
        { id: 'c2', across: 0.15, up: 0.15, diameterMm: 16 },
        { id: 'c3', across: -0.15, up: 0.15, diameterMm: 16 },
        { id: 'c4', across: 0, up: -0.15, diameterMm: 16 },
        { id: 'c5', across: 0, up: 0.15, diameterMm: 16 },
        { id: 'c6', across: -0.15, up: 0, diameterMm: 16 },
        { id: 'c7', across: 0.15, up: 0, diameterMm: 16 },
      ],
      origin: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: 0, z: 1 },
      up: { x: 1, y: 0, z: 0 }, across: { x: 0, y: 1, z: 0 },
      hookOrientation: 'a', maxAggregateSizeMm: 19,
    }).pieces.map((p) => p.path);
    expect(ties.length).toBeGreaterThan(1);
    expectEquivalent(ties, 'column tie set');
  });

  it('a deterministic pseudo-random field of bars, and its reorderings', () => {
    // Fixed seed: the same field every run, so a failure is reproducible.
    let seed = 20260728;
    const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const field: BarPath[] = [];
    for (let i = 0; i < 60; i++) {
      const y = (rnd() - 0.5) * 0.4;
      const z = (rnd() - 0.5) * 0.4;
      field.push(rnd() > 0.5 ? straight(`s${i}`, y, z) : crossing(`c${i}`, rnd() * 4));
    }
    expectEquivalent(field, 'random field');
    // Input order must not change the answer, for either path.
    const reversed = [...field].reverse();
    const a = detectCollisions(field, { tolerances: DEFAULT_TOLERANCES, classifyFor: classify });
    const b = detectCollisions(reversed, { tolerances: DEFAULT_TOLERANCES, classifyFor: classify });
    expect(b.conflicts).toEqual(a.conflicts);
  });
});

// ─── Real fixtures, through the production path ───

function detailOf(fixture: unknown) {
  const solved = solveFixture(fixture as never);
  const summary = runDesign(cirsoc201Adapter, solved.contexts.values(), { maxRunMs: 180_000 });
  return runDetailing({
    contexts: solved.contexts,
    outcomes: summary.outcomes as ReadonlyMap<number, MemberDesignOutcome>,
    nodes: solved.data.nodes as never, elements: solved.data.elements as never,
    edition: '2025', verifierId: 'equiv', demandRevision: 1, maxAggregateSizeMm: 19,
  });
}

describe('optimised and exhaustive agree on the real fixtures', () => {
  for (const [name, data] of [['rc-design-qa-8', qa8], ['rc-design-qa-row2', row2]] as const) {
    it(`${name}: every assembly, bar for bar`, () => {
      const r = detailOf(data);
      expect(r.assemblies.length).toBeGreaterThan(0);
      let saved = 0; let total = 0;
      for (const a of r.assemblies) {
        const { fast, slow } = expectEquivalent(a.bars, `${name}/${a.id}`);
        saved += slow.narrowPhaseTests - fast.narrowPhaseTests;
        total += slow.narrowPhaseTests;
      }
      // The rejection has to actually reject, or this file is proving nothing.
      expect(saved / total, `${name}: work removed`).toBeGreaterThan(0.5);
    }, 300_000);
  }
});

describe('the rejection cannot hide a conflict', () => {
  it('a bar moved into another is caught identically by both paths', () => {
    const a = straight('a', 0, 0);
    const b = straight('b', 0.0005, 0);   // driven almost entirely into `a`
    const { fast, slow } = expectEquivalent([a, b], 'forced interpenetration');
    expect(fast.conflicts.length).toBe(1);
    expect(fast.conflicts[0].pairClass).toBe('prohibitedOverlap');
    expect(slow.conflicts[0].pairClass).toBe('prohibitedOverlap');
  });

  it('a relationship declared over that interpenetration changes nothing', () => {
    const a = { ...straight('a', 0, 0, 16, 'transverse'), enclosesBarIds: ['b'], restrainsBarIds: ['b'] };
    const b = straight('b', 0.0005, 0);
    const { fast } = expectEquivalent([a, b], 'declared + interpenetrating');
    expect(fast.conflicts[0].pairClass).toBe('prohibitedOverlap');
  });
});
