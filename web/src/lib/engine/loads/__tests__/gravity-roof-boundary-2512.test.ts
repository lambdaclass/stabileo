import { expect, it } from 'vitest';
import { applyLoadPlan } from '../../../store/apply-load-plan';
import { modelStore } from '../../../store/index';
import { buildLoadPlan, roofWeightFor, type PlannedDistributed } from '../load-plan';
import { gravityLayout } from '../plan-gravity';
import { planAreaLoads } from '../plan-area-loads';
import { roofMembers } from '../wind-cases';
import { snowDriftRefusal } from '../snow-drift-loads';
import { snowLoadCases, type SnowCaseLoads } from '../snow-loads';
import { input } from './gravity-width-mass-fixture';
import { snow, pressure } from './snow-roof-plane-fixture';
import { asymmetric, mesh, transform } from './snow-surface-round2-fixture';

type ComparableSnowCase = {
  nameKey: string;
  nameParams?: SnowCaseLoads['nameParams'];
  distributed: Pick<PlannedDistributed, 'elementId' | 'frame' | 'a' | 'b' | 'q' | 'qJ'>[];
  nodal: SnowCaseLoads['nodal'];
};

function compareSnow(actual: ComparableSnowCase[], expected: ComparableSnowCase[]) {
  expect(actual).toHaveLength(expected.length);
  const sortLoads = (loads: ComparableSnowCase['distributed']) => [...loads].sort((a, b) =>
    a.elementId - b.elementId || (a.a ?? 0) - (b.a ?? 0) || a.q - b.q);
  for (const [i, found] of actual.entries()) {
    const reference = expected[i]!;
    expect(found.nameKey).toBe(reference.nameKey);
    expect(found.nameParams).toEqual(reference.nameParams);
    expect(found.nodal).toHaveLength(reference.nodal.length);
    for (const [j, load] of found.nodal.entries()) {
      const want = reference.nodal[j]!;
      expect({ nodeId: load.nodeId, carrier: load.carrier }).toEqual({ nodeId: want.nodeId, carrier: want.carrier });
      for (const axis of ['fx', 'fy', 'fz'] as const) expect(load[axis]).toBeCloseTo(want[axis], 9);
    }
    const loads = sortLoads(found.distributed), referenceLoads = sortLoads(reference.distributed);
    expect(loads).toHaveLength(referenceLoads.length);
    for (const [j, load] of loads.entries()) {
      const want = referenceLoads[j]!;
      expect(load.elementId).toBe(want.elementId);
      expect(load.frame).toBe(want.frame);
      for (const field of ['a', 'b', 'q', 'qJ'] as const) {
        const value = want[field];
        if (value === undefined) expect(load[field]).toBeUndefined();
        else expect(load[field]).toBeCloseTo(value, 9);
      }
    }
  }
}

for (const mode of ['width', 'panels'] as const) {
  it(`#2512 a rotated roof preserves the actions on its own boundary in ${mode} mode`, () => {
    const gravity = { mode };
    const tributaryWidth = 1;
    const eaves = [8, 9];
    const roof = { use: 'maintenance', weight: 'heavy', dead: 3, slopeDeg: 0 } as const;
    const baseline = asymmetric();
    const rotated = transform(asymmetric(), 0.37, 0);
    const options = { ...gravity, tributaryWidth };
    const referenceLayout = gravityLayout(baseline, options);
    const referenceSnow = snowLoadCases({ model: baseline, layout: referenceLayout, snow, tributaryWidth })!;
    const reference = planAreaLoads({
      layout: referenceLayout, tributaryWidth,
      floor: { dead: 1, lo: 2, liveOf: () => 2 },
      roof: { ...roof, slopePercent: 0 },
    });
    const layout = gravityLayout(rotated, options);
    const loads = planAreaLoads({
      layout, tributaryWidth,
      floor: { dead: 1, lo: 2, liveOf: () => 2 },
      roof: { ...roof, slopePercent: 0 },
    });
    const plan = buildLoadPlan(input(rotated, { gravity, tributaryWidth, snow: { ...snow, enabled: true, source: 'site' } }));
    const directSnow = snowLoadCases({ model: rotated, layout, snow, tributaryWidth })!;
    expect(plan.outcome, JSON.stringify(plan.blockedKeys)).toBe('READY');
    expect(directSnow.result.refused).toBeUndefined();
    expect(referenceSnow.result.refused).toBeUndefined();
    compareSnow(directSnow.cases, referenceSnow.cases);
    const plannedSnow = (modelPlan: ReturnType<typeof buildLoadPlan>) => modelPlan.cases.flatMap((c, caseIndex) => c.type !== 'S' ? [] : [{
      nameKey: c.nameKey, nameParams: c.nameParams,
      distributed: modelPlan.distributed.filter(load => load.caseIndex === caseIndex),
      nodal: modelPlan.nodal.filter(load => load.caseIndex === caseIndex),
    }]);
    const referencePlan = buildLoadPlan(input(baseline, { gravity, tributaryWidth, snow: { ...snow, enabled: true, source: 'site' } }));
    expect(referencePlan.outcome).toBe('READY');
    compareSnow(plannedSnow(plan), plannedSnow(referencePlan));
    const snowCase = plan.cases.findIndex(c => c.type === 'S');
    expect(snowCase).toBeGreaterThanOrEqual(0);
    for (const id of eaves) {
      expect(layout.roof.has(id)).toBe(true);
      const dead = loads.distributed.filter(load => load.caseType === 'D' && load.elementId === id);
      const referenceDead = reference.distributed.filter(load => load.caseType === 'D' && load.elementId === id);
      expect(dead).toHaveLength(referenceDead.length);
      expect(dead.length).toBeGreaterThan(0);
      for (const [index, load] of dead.entries()) {
        expect(load.q).toBeCloseTo(referenceDead[index]!.q, 9);
        expect(load.qJ ?? load.q).toBeCloseTo(referenceDead[index]!.qJ ?? referenceDead[index]!.q, 9);
      }
      const direct = pressure(directSnow.cases[0]!.distributed, id, 3.5);
      expect(direct).toBeGreaterThan(0);
      const planned = pressure(plan.distributed.filter(load => load.caseIndex === snowCase), id, 3.5);
      expect(planned).toBeCloseTo(direct, 9);
    }
  });
}

function lowerOverhang({ shift = 0, start = 0, end = 3, coverZ = 6, upper = 'shell' } = {}) {
  const d = Number.EPSILON;
  const model = mesh([[[-1 + d, 1 + d + shift, 3], [2, 4 + shift, 3]]]);
  const outline = [[start, start + 2], [end, end + 2], [end, end + 4], [start, start + 4]];
  const nodes = outline.map(([x, y], i) => {
    const id = i + 3;
    model.nodes.set(id, { id, x: x!, y: y!, z: coverZ });
    return id;
  });
  if (upper === 'frame') {
    nodes.forEach((nodeI, i) => {
      const id = i + 2;
      model.elements.set(id, { id, nodeI, nodeJ: nodes[(i + 1) % nodes.length]!, sectionId: 1, materialId: 1 });
    });
  }
  const quads = upper === 'shell' ? new Map([[1, { id: 1, nodes, materialId: 1, thickness: 0.1 }]]) : undefined;
  return { ...model, quads };
}

const boundaryRefusal = { key: 'loadPlan.gravity.roundedRoofBoundary', params: { id: 1 } };
const tributaryWidth = 1;
const siteSnow = { ...snow, enabled: true, source: 'site' } as const;

for (const mode of ['width', 'panels'] as const) for (const upper of ['shell', 'frame']) {
  it(`#2512 rounded midpoint on an overhanging ${upper} edge blocks ${mode} loads`, () => {
    const model = lowerOverhang({ upper });
    const gravity = { mode };
    const plan = buildLoadPlan(input(model, { gravity, tributaryWidth, snow: siteSnow, generateCombinations: true }));
    expect(plan.outcome, JSON.stringify(plan.blockedKeys)).toBe('BLOCKED');
    expect(plan.blockedKeys).toEqual([boundaryRefusal]);
    expect(plan).toMatchObject({ cases: [], distributed: [], nodal: [], surface: [], combinations: [], levels: [] });
    expect(() => gravityLayout(model, { ...gravity, tributaryWidth })).toThrow(expect.objectContaining(boundaryRefusal));
    expect(() => roofWeightFor(model, gravity, tributaryWidth, 0)).toThrow(expect.objectContaining(boundaryRefusal));
    expect(() => roofMembers(model)).toThrow(expect.objectContaining(boundaryRefusal));
    expect(() => snowDriftRefusal(model)).toThrow(expect.objectContaining(boundaryRefusal));
    expect(() => snowLoadCases({ model, snow, tributaryWidth })).toThrow(expect.objectContaining(boundaryRefusal));
  });
}

it('#2512 apply refuses the lower roof-edge overhang', () => {
  const plan = buildLoadPlan(input(lowerOverhang(), { tributaryWidth, snow: siteSnow }));
  const before = modelStore.snapshot();
  expect(plan.outcome).toBe('BLOCKED');
  expect(applyLoadPlan(plan, { clearExisting: true, bothSenses: true, nameOf: key => key })).toEqual(boundaryRefusal);
  expect(modelStore.snapshot()).toEqual(before);
});

for (const mode of ['width', 'panels'] as const) {
  it(`#2512 exact roof-edge controls preserve the ${mode} loads`, () => {
    for (const [geometry, exposed] of [
      [{ shift: -0.01 }, true],
      [{ shift: 0.01 }, false],
      [{ start: -2 }, false],
      [{ end: 0.49 }, true],
      [{ coverZ: 3.049 }, true],
    ] as const) {
      const model = lowerOverhang(geometry);
      const gravity = { mode, loadEveryPanel: true };
      const plan = buildLoadPlan(input(model, { gravity, tributaryWidth, snow: siteSnow }));
      expect(plan.outcome, JSON.stringify({ geometry, blocked: plan.blockedKeys })).toBe('READY');
      expect(gravityLayout(model, { ...gravity, tributaryWidth }).roof.has(1)).toBe(exposed);
      expect(plan.distributed.some(load => load.elementId === 1 && load.caseType === 'S')).toBe(exposed);
    }
  });
}

const review2512Roof = process.env.RUN_KNOWN_WRONG === '2512' ? it : it.skip;

for (const mode of ['width', 'panels'] as const) for (const upper of ['shell', 'frame']) {
  review2512Roof(`known wrong result: #2512 the exact midpoint on an overhanging ${upper} edge is covered in ${mode}`, () => {
    const model = lowerOverhang({ upper });
    const gravity = { mode };
    const plan = buildLoadPlan(input(model, { gravity, tributaryWidth, snow: siteSnow, generateCombinations: true }));
    expect(plan.outcome, JSON.stringify(plan.blockedKeys)).toBe('READY');
    expect(gravityLayout(model, { ...gravity, tributaryWidth }).roof.has(1)).toBe(false);
    expect(roofMembers(model).some(member => member.id === 1)).toBe(false);
    expect(plan.distributed.some(load => load.elementId === 1 && load.caseType === 'S')).toBe(false);
    expect(() => roofWeightFor(model, gravity, tributaryWidth, 0)).not.toThrow();
    expect(() => snowDriftRefusal(model)).not.toThrow();
    expect(() => snowLoadCases({ model, snow, tributaryWidth })).not.toThrow();
  });
}
