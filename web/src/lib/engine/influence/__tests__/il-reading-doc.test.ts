/**
 * The line as the panel and the explained document read it: exact areas, the extremes against a
 * direct solve, the section picked by a click, the document's structure and its numbers, and the
 * combination that governs each member.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { initSolver, solve } from '../../wasm-solver';
import { computeInfluenceLine } from '../../influence-service';
import { buildSolverInput2D } from '../../solver-service';
import { unitSolver } from '../unit-sweep';
import { readLine } from '../analysis';
import { sectionAt, positionToT, otherSideOf } from '../section-pick';
import { buildInfluenceDoc } from '../../steps/influence-doc';
import { planeModel as pmOf } from '../../steps/plane-model';
import { computeGoverning2D } from '../../governing-case';
import { computePoints } from '../../influence-service';
import type { Block, StepDoc } from '../../steps/doc';
import type { InfluenceQuantity } from '../../../store/model.svelte';
import type { IlTarget } from '../quantities';
import { simpleBeam, threeSpan, twoSpan } from './fixtures';

beforeAll(async () => { await initSolver(); });
const DOWN = { x: 0, z: -1 };

function reading(model: never, q: InfluenceQuantity, node: number | undefined, elem: number | undefined, t: number, loads = { g: 10, q: 15, P: 30 }, placement: 'zones' | 'spans' = 'zones') {
  const unit = unitSolver(buildSolverInput2D(model, false)!);
  const il = computeInfluenceLine(model, q, node, elem, t);
  if (typeof il === 'string') throw new Error(il);
  return readLine(unit, il, loads, placement, [...unit.elements.keys()], DOWN);
}

describe('reading a line', () => {
  it('simple beam, M at midspan of L = 8: A⁺ = L²/8, η max = L/4, max = (g+q)L²/8 + P·L/4', () => {
    const r = reading(simpleBeam(8) as never, 'M', undefined, 1, 0.5);
    expect(r.areas.pos).toBeCloseTo(8, 9);
    expect(r.etaMax!.value).toBeCloseTo(2, 9);
    expect(r.max.value).toBeCloseTo(25 * 8 + 30 * 2, 6);
    expect(r.min.value).toBeCloseTo(10 * 8, 6);
    expect(r.direct.max).toBeCloseTo(r.max.value, 6);
  });

  it('three spans, zones and spans: the areas are exact, so the extremes equal the direct solve', () => {
    for (const placement of ['zones', 'spans'] as const) {
      for (const [q, elem, t] of [['M', 2, 0.5], ['V', 2, 0.25], ['M', 1, 1]] as const) {
        const r = reading(threeSpan(6) as never, q, undefined, elem, t, { g: 10, q: 15, P: 20 }, placement);
        expect(r.max.value).toBeCloseTo(r.direct.max, 7);
        expect(r.min.value).toBeCloseTo(r.direct.min, 7);
      }
    }
  });

  it('a displacement line too: max and min of uz at midspan against the direct solve', () => {
    const r = reading(twoSpan(6) as never, 'uz', undefined, 1, 0.5, { g: 10, q: 15, P: 20 });
    expect(r.min.value).toBeLessThan(0);
    expect(r.min.value).toBeCloseTo(r.direct.min, 12);
    expect(r.max.value).toBeCloseTo(r.direct.max, 12);
  });
});

describe('picking the section', () => {
  const a = { x: 0, y: 0 }, b = { x: 10, y: 0 };
  it('snaps to the ends and the midpoint within the tolerance, else rounds to the centimetre', () => {
    expect(sectionAt({ x: 0.2, y: 0.1 }, a, b, 0.3)).toBe(0);
    expect(sectionAt({ x: 9.85, y: -0.2 }, a, b, 0.3)).toBe(1);
    expect(sectionAt({ x: 5.1, y: 0 }, a, b, 0.3)).toBe(0.5);
    expect(sectionAt({ x: 2.5432, y: 0.4 }, a, b, 0.3)).toBeCloseTo(0.254, 12);
    expect(sectionAt({ x: -3, y: 0 }, a, b, 0.3)).toBe(0);
  });
  it('a typed x outside [0, L] is refused', () => {
    expect(positionToT(2.5, 10)).toBe(0.25);
    expect(positionToT(10, 10)).toBe(1);
    expect(positionToT(10.5, 10)).toBeNull();
    expect(positionToT(-0.1, 10)).toBeNull();
    expect(positionToT(Number.NaN, 10)).toBeNull();
  });
  it('the other side of an end node is the collinear member there', () => {
    const nodes = new Map([[1, { x: 0, y: 0 }], [2, { x: 4, y: 0 }], [3, { x: 8, y: 0 }], [4, { x: 4, y: 3 }]]);
    const elements = new Map([[1, { id: 1, nodeI: 1, nodeJ: 2, type: 'frame' }], [2, { id: 2, nodeI: 2, nodeJ: 3, type: 'frame' }], [3, { id: 3, nodeI: 2, nodeJ: 4, type: 'frame' }]]);
    expect(otherSideOf(1, 1, elements, nodes)).toEqual({ elementId: 2, t: 0 });
    expect(otherSideOf(2, 0, elements, nodes)).toEqual({ elementId: 1, t: 1 });
    expect(otherSideOf(1, 0, elements, nodes)).toBeNull();
    expect(otherSideOf(1, 0.5, elements, nodes)).toBeNull();
  });
});

function docFor(model: never, q: InfluenceQuantity, target: IlTarget): StepDoc {
  const input = buildSolverInput2D(model, false)!;
  const unit = unitSolver(input);
  const points = computePoints(unit, q, target, 20, DOWN, 'vertical');
  return buildInfluenceDoc({
    unit, pm: pmOf(input), quantity: q, target, points, dir: DOWN, vertical: true,
    loads: { g: 10, q: 5, P: 20 }, placement: 'zones', loadedIds: [...unit.elements.keys()], gh: target.kind === 'node' ? 1 : 0, defaulted: false,
  });
}
const blocksOf = (doc: StepDoc): Block[] => [...doc.intro, ...doc.steps.flatMap((s) => s.blocks)];

describe('the explained document', () => {
  it('a force line: definition, Müller-Breslau, ordinates, reading, use; the comparisons agree', () => {
    const doc = docFor(simpleBeam(8) as never, 'M', { kind: 'section', elementId: 1, t: 0.5 });
    expect(doc.method).toBe('influenceLine');
    expect(doc.steps.map((s) => s.title.key)).toEqual([
      'course.influence.doc.mb.title', 'course.influence.doc.ord.title', 'course.influence.doc.read.title', 'course.influence.doc.use.title',
    ]);
    const all = blocksOf(doc);
    expect(all.some((b) => b.kind === 'fig')).toBe(true);
    expect(all.some((b) => b.kind === 'p' && b.text.key === 'course.influence.doc.mb.determinate')).toBe(true);
    for (const b of all) if (b.kind === 'compare') for (const r of b.rows) expect(r.method).toBeCloseTo(r.matrix, 6);
    const maxCalc = all.find((b) => b.kind === 'calc' && b.label?.key === 'course.influence.doc.use.max');
    // (g + q)·L²/8 + P·L/4 = 15·8 + 20·2 = 160 kN·m.
    expect(maxCalc && maxCalc.kind === 'calc' && maxCalc.result).toContain('160');
    const area = all.find((b) => b.kind === 'calc' && b.label?.key === 'course.influence.doc.read.areaPos');
    expect(area && area.kind === 'calc' && area.result).toContain('A^+ = 8');
  });

  it('a displacement line: Maxwell, with the reciprocity check', () => {
    const doc = docFor(twoSpan(6) as never, 'ry', { kind: 'section', elementId: 1, t: 0 });
    expect(doc.steps[0].title.key).toBe('course.influence.doc.maxwell.title');
    const cmp = doc.steps[0].blocks.find((b) => b.kind === 'compare');
    expect(cmp && cmp.kind === 'compare' && cmp.rows[0].method).toBeCloseTo(cmp && cmp.kind === 'compare' ? cmp.rows[0].matrix : NaN, 12);
  });

  it('an indeterminate structure says so, with GH and the curved line', () => {
    const doc = docFor(twoSpan(6) as never, 'Rz', { kind: 'node', nodeId: 2 });
    expect(blocksOf(doc).some((b) => b.kind === 'p' && b.text.key === 'course.influence.doc.mb.indeterminate' && b.text.params?.gh === 1)).toBe(true);
  });
});

describe('the governing combination of each member', () => {
  it('is read along the member: a simple span with zero end moments is governed by its larger load', () => {
    const input = buildSolverInput2D(simpleBeam(8) as never, false)!;
    const under = (q: number) => solve({ ...input, loads: [{ type: 'distributed', data: { elementId: 1, qI: -q, qJ: -q } }] });
    const g = computeGoverning2D(new Map([[1, under(10)], [2, under(25)]]), new Map([[1, 'D'], [2, '1.2 D + 1.6 L']]));
    expect(g.get(1)!.moment).toMatchObject({ comboId: 2, comboName: '1.2 D + 1.6 L' });
    expect(g.get(1)!.moment!.value).toBeCloseTo((25 * 64) / 8, 6);
    expect(g.get(1)!.shear!.value).toBeCloseTo(100, 6);
  });
});
