import { expect, it } from 'vitest';
import { applyLoadPlan } from '../../../store/apply-load-plan';
import { buildLoadPlan, roofWeightFor, type LoadModelData } from '../load-plan';
import { gravityLayout, MIN_STOREY_HEADROOM } from '../plan-gravity';
import { roofMembers } from '../wind-cases';
import { regulations } from './snow-roof-plane-fixture';
import { mesh } from './snow-surface-round2-fixture';

const modes = ['panels', 'width'] as const;
type Mode = typeof modes[number];

function plan(model: LoadModelData, mode: Mode, loadEveryPanel = true, separateRoof = false) {
  return buildLoadPlan({
    model, regulations: regulations(), occupancyKey: 'vivienda', dead: [{ labelKey: 'test', q: 1 }],
    reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false,
    generateCombinations: false, tributaryWidth: 1, gravity: { mode, loadEveryPanel },
    ...(separateRoof ? { roof: { dead: 3, use: 'occupancy', occupancyKey: 'vivienda', slopeDeg: 0 } as const } : {}),
  });
}

function deadResultant(result: ReturnType<typeof plan>, model: LoadModelData, id: number) {
  const element = model.elements.get(id)!;
  const a = model.nodes.get(element.nodeI)!, b = model.nodes.get(element.nodeJ)!;
  const length = Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0));
  return result.distributed.filter(load => load.elementId === id && load.caseType === 'D').reduce((sum, load) => {
    const span = (load.b ?? length) - (load.a ?? 0);
    return sum - (load.q + (load.qJ ?? load.q)) / 2 * span;
  }, 0);
}

function checkMemberActions(model: LoadModelData, mode: Mode, roof: boolean) {
  const result = plan(model, mode, true, true);
  expect(result.blockedKeys).toEqual([{ key: 'loadPlan.blocked.concentratedRoof' }]);
  expect(deadResultant(result, model, 1)).toBeCloseTo(roof ? 6 : 2, 12);
  if (mode === 'width') expect(roofMembers(model).some(member => member.id === 1)).toBe(roof);
}

function ring(z: number, side = 6): [number, number, number][] {
  return [[0, 0, z], [side, 0, z], [side, side, z], [0, side, z]];
}

function stackedBays(lower: number, upper: number) {
  return mesh([ring(lower), ring(upper), [[0, 3, upper], [6, 3, upper]]]);
}

it('#2564 retained framing bays trim by their physical gap', () => {
  const model = stackedBays(3.0004, 5.1998);
  const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
  expect(layout.areaByLevel.get(3)).toBeUndefined();
  expect(layout.areaByLevel.get(5.2)).toBeCloseTo(36, 12);
  const result = plan(model, 'panels', false);
  expect(result.outcome).toBe('READY');
  expect(result.distributed.filter(load => load.elementId <= 4)).toHaveLength(0);
  expect(result.nodal).toHaveLength(0);
});

it('#2564 the headroom probes use the physical lower elevation', () => {
  const model = stackedBays(3.0004, 5.2002);
  const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
  expect(layout.areaByLevel.get(3)).toBeUndefined();
  expect(layout.areaByLevel.get(5.2)).toBeCloseTo(36, 12);
});

it('#2564 a retained framing bay clips a member strip at local clearance', () => {
  const lowerStart = 2.9996, lowerEnd = 3.0004;
  const model = mesh([[[0, 3, lowerStart], [6, 3, lowerEnd]], ring(5.2), [[0, 3, 5.2], [6, 3, 5.2]]]);
  const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1, uniformPressure: true });
  const retained = (layout.areaOf.get(1) ?? 0) + (layout.roofAreaOf.get(1) ?? 0);
  expect(retained).toBeCloseTo(3, 10);
  const spans = layout.widthMembers.find(member => member.elementId === 1)?.spans ?? [];
  expect(spans.length).toBeGreaterThan(0);
  expect(Math.max(...spans.map(span => span.t1))).toBeCloseTo(0.5, 10);
  const result = plan(model, 'panels', false);
  expect(result.outcome).toBe('READY');
  expect(deadResultant(result, model, 1)).toBeCloseTo(Math.hypot(3, (lowerEnd - lowerStart) / 2), 10);
});

function stripUnderBay(upper: number) {
  return mesh([[[0, 3, 2.9996], [6, 3, 3.0004]], ring(upper), [[0, 3, upper], [6, 3, upper]]]);
}

function bayUnderShell(upper: number, corner = 0.0004) {
  const lower = ring(0);
  lower[0]![2] = corner;
  const model = mesh([lower, ring(upper)]);
  model.quads = new Map([[1, { id: 1, nodes: [5, 6, 7, 8] }]]);
  for (const id of [5, 6, 7, 8]) model.elements.delete(id);
  return model;
}

it('#2564 clips low headroom beyond the last strip probe', () => {
  const model = stripUnderBay(5.2003);
  const keptLength = 5.25;
  const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1, uniformPressure: true });
  const retained = (layout.areaOf.get(1) ?? 0) + (layout.roofAreaOf.get(1) ?? 0);
  expect.soft(retained).toBeCloseTo(keptLength, 10);
  const spans = layout.widthMembers.find(member => member.elementId === 1)?.spans ?? [];
  expect.soft(Math.max(...spans.map(span => span.t1))).toBeCloseTo(keptLength / 6, 10);

  const result = plan(model, 'panels', false);
  expect(result.outcome).toBe('READY');
  expect(deadResultant(result, model, 1)).toBeCloseTo(Math.hypot(6, 3.0004 - 2.9996) * keptLength / 6, 10);
});

function cornerUnderBay(lower: readonly number[], upper: number, upperStart = 0) {
  return mesh([
    ring(0).map(([x, y], i) => [x, y, lower[i]!]),
    ring(upper).map(([x, y, z]) => [x === 0 ? upperStart : x, y, z]),
  ]);
}

const bayClipping2564 = process.env.RUN_KNOWN_WRONG === '2564' ? it : it.skip;

bayClipping2564.each([
  { lower: [2.9996, 3, 3.0004, 3], upper: 5.20035, upperStart: 0 },
  { lower: [-500, -240, 20, -240].map(offset => 3 + offset / 2 ** 20), upper: 5.2 - 20 / 2 ** 20, upperStart: 3 },
])('known wrong result: #2564 clips a bay beyond the last headroom probe ($upper, $upperStart)', ({ lower, upper, upperStart }) => {
  const model = cornerUnderBay(lower, upper, upperStart);
  const corner = lower[2]!;
  const cut = 6 * ((corner - (upper - MIN_STOREY_HEADROOM)) / (corner - lower[1]!));
  const kept = 36 - cut ** 2 / 2;
  const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1, uniformPressure: true });
  expect.soft(layout.areaByLevel.get(3)).toBeCloseTo(kept, 9);
  expect.soft(layout.notes).toContainEqual(expect.objectContaining({ key: 'loadPlan.gravity.roofFringe' }));
  expect(layout.areaByLevel.get(5.2)).toBeCloseTo(6 * (6 - upperStart), 12);

  const result = plan(model, 'panels', false);
  expect(result.outcome).toBe('READY');
  const distributed = [1, 2, 3, 4].reduce((sum, id) => sum + deadResultant(result, model, id), 0);
  const nodal = result.nodal.filter(load => load.caseType === 'D' && load.nodeId <= 4).reduce((sum, load) => sum - load.fz, 0);
  expect(distributed + nodal).toBeCloseTo(kept, 9);
});

it('#2564 keeps a full bay when the physical headroom band has no area', () => {
  const lower = [2.9996, 3, 3.0004, 3];
  const clear = cornerUnderBay(lower, 5.2005);
  const touching = cornerUnderBay([0, 2 ** -12, 2 ** -11, 2 ** -12], MIN_STOREY_HEADROOM + 2 ** -11);
  for (const [model, level] of [[clear, 3], [touching, 0]] as const) {
    const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
    expect(layout.areaByLevel.get(level)).toBeCloseTo(36, 12);
    expect(plan(model, 'panels', false).outcome).toBe('READY');
  }
});

it('#2564 keeps the full load when all bays are explicitly selected', () => {
  const model = cornerUnderBay([2.9996, 3, 3.0004, 3], 5.20035);
  const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1, loadEveryPanel: true });
  expect(layout.areaByLevel.get(3)).toBeCloseTo(36, 12);
  const result = plan(model, 'panels', true);
  expect(result.outcome).toBe('READY');
  expect([1, 2, 3, 4].reduce((sum, id) => sum + deadResultant(result, model, id), 0)).toBeCloseTo(36, 12);
});

it('#2564 refuses indeterminate clearance at the strict headroom limit', () => {
  const model = bayUnderShell(MIN_STOREY_HEADROOM);
  const refusal = { key: 'loadPlan.gravity.uncertainDeckCover' };
  const result = plan(model, 'panels', false);
  expect(result.outcome).toBe('BLOCKED');
  expect(result.blockedKeys).toEqual([expect.objectContaining(refusal)]);
  expect(result.distributed).toHaveLength(0);
  expect(result.nodal).toHaveLength(0);
  expect(result.surface).toHaveLength(0);
  expect(applyLoadPlan(result, { clearExisting: true, bothSenses: true, nameOf: key => key })).toEqual(refusal);
  expect(() => roofWeightFor(model, { mode: 'panels', loadEveryPanel: false }, 1, 1)).toThrow(expect.objectContaining(refusal));
});

it('#2564 strip with headroom above the limit keeps its full load', () => {
  const model = stripUnderBay(5.2005);
  const result = plan(model, 'panels', false);
  expect(result.outcome).toBe('READY');
  expect(deadResultant(result, model, 1)).toBeCloseTo(Math.hypot(6, 3.0004 - 2.9996), 10);
});

it('#2564 width mode keeps the strip load when it does not retain the bay', () => {
  const model = stripUnderBay(5.2003);
  const result = plan(model, 'width', false);
  expect(result.outcome).toBe('READY');
  expect(deadResultant(result, model, 1)).toBeCloseTo(Math.hypot(6, 3.0004 - 2.9996), 10);
});

it.each([
  { upper: MIN_STOREY_HEADROOM - 0.0004, corner: 0.0004, retained: false },
  { upper: MIN_STOREY_HEADROOM + 0.0005, corner: 0.0004, retained: true },
  { upper: MIN_STOREY_HEADROOM, corner: 0, retained: true },
])('#2564 classifies a definite shell headroom band ($upper, $corner)', ({ upper, corner, retained }) => {
  const model = bayUnderShell(upper, corner);
  const result = plan(model, 'panels', false);
  expect(result.outcome).toBe('READY');
  expect(deadResultant(result, model, 2)).toBeCloseTo(retained ? 9 : 0, 10);
  expect(result.surface.some(load => load.caseType === 'D')).toBe(true);
});

it('#2564 clearance above the headroom limit keeps a full second storey', () => {
  const layout = gravityLayout(stackedBays(2.9996, 5.1998), { mode: 'panels', tributaryWidth: 1 });
  expect(layout.areaByLevel.get(3)).toBeCloseTo(36, 12);
  expect(layout.areaByLevel.get(5.2)).toBeCloseTo(36, 12);
});

it('#2564 clearance exactly at the headroom limit keeps the lower bay', () => {
  const layout = gravityLayout(stackedBays(0, MIN_STOREY_HEADROOM), { mode: 'panels', tributaryWidth: 1 });
  expect(layout.areaByLevel.get(0)).toBeCloseTo(36, 12);
});

function upperBay(low: number, high: number, y = 3, covered = false) {
  const upper = ring(high, 4);
  upper[0]![2] = low;
  const rings = [[[2, y, 3], [4, y, 3]], upper];
  if (covered) rings.push([[3, y - 1, 4], [3, y + 1, 4]]);
  return mesh(rings);
}

function pitchedShell(x: number) {
  const model = mesh([[[1, 0, 1.45], [x, 2, 1.45]], [[0, 0, 2], [2, 0, 1], [2, 2, 1], [0, 2, 2]]]);
  model.quads = new Map([[1, { id: 1, nodes: [3, 4, 5, 6] }]]);
  for (const id of [2, 3, 4, 5]) model.elements.delete(id);
  return model;
}

function diagonal(x: number) {
  return mesh([[[1, 0, 3], [x, 2, 3]], [[0, 0, 4], [2, 2, 4]]]);
}

for (const mode of modes) {
  it(`#2564 ${mode} refuses a noncoplanar bay straddling the cover threshold`, () => {
    const model = upperBay(3.0498, 3.0502);
    const refusal = { key: 'loadPlan.gravity.uncertainDeckCover' };
    const result = plan(model, mode);
    expect(result.outcome).toBe('BLOCKED');
    expect(result.blockedKeys).toEqual([expect.objectContaining(refusal)]);
    expect(result.distributed).toHaveLength(0);
    expect(result.nodal).toHaveLength(0);
    expect(result.surface).toHaveLength(0);
    expect(applyLoadPlan(result, { clearExisting: true, bothSenses: true, nameOf: key => key })).toEqual(refusal);
    expect(() => roofWeightFor(model, { mode, loadEveryPanel: true }, 1, 1)).toThrow(expect.objectContaining(refusal));
    if (mode === 'width') expect(() => roofMembers(model)).toThrow(expect.objectContaining(refusal));
  });

  it(`#2564 ${mode} decides a bay on either side of the limit or outside the footprint`, () => {
    checkMemberActions(upperBay(3.0496, 3.0498), mode, true);
    checkMemberActions(upperBay(3.0502, 3.0504), mode, false);
    checkMemberActions(upperBay(3.0498, 3.0502, 5), mode, true);
    checkMemberActions(upperBay(3.0498, 3.0502, 3, true), mode, false);
  });

  it(`#2564 ${mode} evaluates a pitched shell at the exact member midpoint`, () => {
    checkMemberActions(pitchedShell(1 + Number.EPSILON), mode, true);
  });

  it(`#2564 ${mode} keeps pitched shell cover on the other side of the threshold`, () => {
    checkMemberActions(pitchedShell(1), mode, false);
  });

  it(`#2564 ${mode} excludes a bare beam off the exact midpoint`, () => {
    checkMemberActions(diagonal(1 + Number.EPSILON), mode, true);
  });

  it(`#2564 ${mode} cover requires strictly more than the cover rise`, () => {
    const lower = 0.0625;
    const boundary = lower + 0.05;
    for (const steps of [-1, 0, 1]) {
      const upper = boundary + steps * 2 ** -56;
      checkMemberActions(mesh([[[1, 0, lower], [1, 2, lower]], [[0, 0, upper], [2, 2, upper]]]), mode, steps <= 0);
    }
  });

  it(`#2564 ${mode} keeps bare-beam cover through the exact midpoint`, () => {
    checkMemberActions(diagonal(1), mode, false);
  });
}
