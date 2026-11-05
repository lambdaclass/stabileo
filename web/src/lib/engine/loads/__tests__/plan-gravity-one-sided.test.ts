import { describe, it, expect } from 'vitest';
import { gravityLayout, loadedSides, oneSidedSomewhere, type GravityModel } from '../plan-gravity';
import { buildLoadPlan, type LoadModelData, type LoadPlanInput } from '../load-plan';
import { defaultRegulations, type ProjectRegulations } from '../../../codes/roles';

type Nodes = Map<number, { id: number; x: number; y: number; z?: number }>;
type Elements = Map<number, { id: number; nodeI: number; nodeJ: number; sectionId: number; materialId: number }>;

function model(nodes: Nodes, elements: Elements): GravityModel & LoadModelData {
  return {
    nodes, elements,
    sections: new Map([[1, { id: 1, a: 0.09 }]]), materials: new Map([[1, { id: 1, rho: 25 }]]),
    loadCases: [{ id: 1, type: 'D', name: 'D' }, { id: 2, type: 'L', name: 'L' }],
  };
}

function twoBays(): GravityModel & LoadModelData {
  const nodes: Nodes = new Map();
  const at = (i: number, j: number) => j * 3 + i + 1;
  for (let j = 0; j <= 1; j++) for (let i = 0; i <= 2; i++) nodes.set(at(i, j), { id: at(i, j), x: 5 * i, y: 4 * j, z: 3 });
  const elements: Elements = new Map();
  const add = (id: number, nodeI: number, nodeJ: number) => elements.set(id, { id, nodeI, nodeJ, sectionId: 1, materialId: 1 });
  add(1, at(0, 0), at(1, 0)); add(2, at(1, 0), at(2, 0));
  add(3, at(0, 1), at(1, 1)); add(4, at(1, 1), at(2, 1));
  add(5, at(0, 0), at(0, 1)); add(6, at(1, 0), at(1, 1)); add(7, at(2, 0), at(2, 1));
  return model(nodes, elements);
}

const EDGE = 5;
const INTERIOR = 6;

function underRoof(roofWidth: [number, number]): GravityModel & LoadModelData {
  const nodes: Nodes = new Map([
    [1, { id: 1, x: 0, y: 0, z: 3 }], [2, { id: 2, x: 6, y: 0, z: 3 }],
    [11, { id: 11, x: 0, y: roofWidth[0], z: 4 }], [12, { id: 12, x: 6, y: roofWidth[0], z: 4 }],
    [13, { id: 13, x: 6, y: roofWidth[1], z: 4 }], [14, { id: 14, x: 0, y: roofWidth[1], z: 4 }],
  ]);
  const elements: Elements = new Map();
  const add = (id: number, nodeI: number, nodeJ: number) => elements.set(id, { id, nodeI, nodeJ, sectionId: 1, materialId: 1 });
  add(1, 1, 2);
  add(11, 11, 12); add(12, 12, 13); add(13, 13, 14); add(14, 14, 11);
  return model(nodes, elements);
}

function underRafters(): GravityModel & LoadModelData {
  const nodes: Nodes = new Map([[1, { id: 1, x: 0, y: 0, z: 3 }], [2, { id: 2, x: 6, y: 0, z: 3 }]]);
  const elements: Elements = new Map([[1, { id: 1, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1 }]]);
  for (const [k, x] of [0, 3, 6].entries()) {
    nodes.set(11 + 2 * k, { id: 11 + 2 * k, x, y: 0, z: 4 });
    nodes.set(12 + 2 * k, { id: 12 + 2 * k, x, y: 5, z: 4 });
    elements.set(11 + k, { id: 11 + k, nodeI: 11 + 2 * k, nodeJ: 12 + 2 * k, sectionId: 1, materialId: 1 });
  }
  return { ...model(nodes, elements), quads: new Map([[1, { id: 1, nodes: [11, 15, 16, 12] }]]) };
}

function partlyUnderRafters(): GravityModel & LoadModelData {
  const nodes: Nodes = new Map([[1, { id: 1, x: 0, y: 0, z: 3 }], [2, { id: 2, x: 6, y: 0, z: 3 }]]);
  const elements: Elements = new Map([[1, { id: 1, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1 }]]);
  for (const [k, x] of [0, 3].entries()) {
    nodes.set(11 + 2 * k, { id: 11 + 2 * k, x, y: 0, z: 4 });
    nodes.set(12 + 2 * k, { id: 12 + 2 * k, x, y: 5, z: 4 });
    elements.set(11 + k, { id: 11 + k, nodeI: 11 + 2 * k, nodeJ: 12 + 2 * k, sectionId: 1, materialId: 1 });
  }
  for (const [id, x, y, z] of [[21, 0, -2, 3.8], [22, 6, -2, 3.8], [23, 6, 5, 4.5], [24, 0, 5, 4.5]] as const) nodes.set(id, { id, x, y, z });
  return { ...model(nodes, elements), quads: new Map([[1, { id: 1, nodes: [21, 22, 23, 24] }]]) };
}

function staggeredNotches(): GravityModel & LoadModelData {
  const nodes: Nodes = new Map([[1, { id: 1, x: 0, y: 0, z: 3 }], [2, { id: 2, x: 20, y: 0, z: 3 }]]);
  const elements: Elements = new Map([[1, { id: 1, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1 }]]);
  const roofs: Array<[number, number, number, number]> = [[0, 10.01, 0, 5], [10.04, 20, 0, 5], [0, 10.06, -5, 0], [10.09, 20, -5, 0]];
  roofs.forEach(([x0, x1, y0, y1], k) => {
    const n = 10 + 4 * k;
    [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].forEach(([x, y], i) => nodes.set(n + i, { id: n + i, x: x!, y: y!, z: 4 }));
    for (let i = 0; i < 4; i++) elements.set(n + i, { id: n + i, nodeI: n + i, nodeJ: n + (i + 1) % 4, sectionId: 1, materialId: 1 });
  });
  return model(nodes, elements);
}

function applied(reg: ProjectRegulations): ProjectRegulations {
  const out = { ...reg };
  for (const k of Object.keys(out) as Array<keyof ProjectRegulations>) {
    if (out[k].adapterId) out[k] = { ...out[k], configComplete: true, state: 'applied' };
  }
  return out;
}

const planInput = (m: LoadModelData, mode: 'panels' | 'width'): LoadPlanInput => ({
  regulations: applied(defaultRegulations()), model: m,
  dead: [{ labelKey: 'a', q: 2 }], occupancyKey: 'vivienda', tributaryWidth: 3,
  reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false,
  generateCombinations: false, gravity: { mode },
});

function advisory(m: LoadModelData, mode: 'panels' | 'width') {
  const plan = buildLoadPlan(planInput(m, mode));
  const key = 'loadPlan.assumption.oneSidedTorsion';
  const named = (list: typeof plan.assumptions) => list.find((a) => a.key === key)?.params?.ids;
  return { assumption: named(plan.assumptions), derivation: named(plan.derivation) };
}

describe('one-sided slab load on an edge beam is named for a torsion check (#1401)', () => {
  for (const mode of ['panels', 'width'] as const) {
    it(`${mode}: the edge beam is named, the interior beam with slab on both sides is not`, () => {
      const { assumption, derivation } = advisory(twoBays(), mode);
      expect(assumption).toBe('1, 2, 3, 4, 5, 7');
      expect(derivation).toBe('1, 2, 3, 4, 5, 7');
      const g = gravityLayout(twoBays(), { mode, tributaryWidth: 3 });
      expect(g.oneSided).toContain(EDGE);
      expect(g.oneSided).not.toContain(INTERIOR);
      expect(g.oneSided).toEqual([1, 2, 3, 4, 5, 7]);
    });
  }

  it('panels, one way: the edge beams across the span are named, those along it carry no slab and are not', () => {
    const g = gravityLayout(twoBays(), { mode: 'panels', slab: 'oneWay', spanAxis: 'x', tributaryWidth: 3 });
    expect(g.oneSided).toEqual([EDGE, 7]);
  });

  it('plan fringe: a member whose uncovered strip lies on one side of it is named', () => {
    const cases = [['panels', underRoof([0, 4])], ['panels', underRafters()], ['width', underRafters()]] as const;
    for (const [mode, m] of cases) {
      expect(String(advisory(m, mode).assumption).split(', '), mode).toContain('1');
      const g = gravityLayout(m, { mode, tributaryWidth: 3 });
      const fringe = g.widthMembers.find((w) => w.elementId === 1);
      expect(fringe?.spans, mode).toBeDefined();
      expect(fringe!.spans!.reduce((s, w) => s + w.width * (w.t1 - w.t0), 0) * 6, mode).toBeCloseTo(9, 3);
      expect(g.oneSided, mode).toContain(1);
    }
  });

  it('plan fringe: a member one-sided over part of its length and two-sided over the rest is named', () => {
    const m = partlyUnderRafters();
    const g = gravityLayout(m, { mode: 'width', tributaryWidth: 3 });
    const spans = g.widthMembers.find((w) => w.elementId === 1)?.spans?.map((w) => [w.t0, w.t1, w.width]);
    expect(spans).toHaveLength(2);
    expect(spans![0]![1]).toBeCloseTo(0.75, 6);
    expect(spans![0]![2]).toBeCloseTo(1.5, 6);
    expect(spans![1]![2]).toBeCloseTo(3, 6);
    expect(String(advisory(m, 'width').assumption).split(', ')).toContain('1');
    expect(g.oneSided).toContain(1);
  });

  it('plan fringe: a member whose uncovered strip lies on both sides of it is not', () => {
    const g = gravityLayout(underRoof([-0.5, 0.5]), { mode: 'panels', tributaryWidth: 3 });
    expect(g.widthMembers.find((m) => m.elementId === 1)?.spans).toBeDefined();
    expect(g.oneSided).not.toContain(1);
  });

  it('plan fringe: uncovered patches on opposite sides at different stations of one bin are not both-sided (#1426)', () => {
    const g = gravityLayout(staggeredNotches(), { mode: 'panels', tributaryWidth: 3 });
    expect(g.widthMembers.find((w) => w.elementId === 1)?.spans).toBeDefined();
    expect(g.oneSided).toContain(1);
    expect(String(advisory(staggeredNotches(), 'panels').assumption).split(', ')).toContain('1');
  });

  it('a hole on one side removes only the stations where no load is left on that side (#1426)', () => {
    const axis = { p: [0, 0] as [number, number], u: [1, 0] as [number, number], L: 6 };
    const rect = (x0: number, x1: number, y0: number, y1: number): Array<[number, number]> => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
    const twoSidedBesideAHole = [
      [rect(0, 6, 0, 1.5), rect(2, 4, 0.5, 1)],
      [rect(0, 6, -1.5, 0)],
    ];
    expect(oneSidedSomewhere(loadedSides(twoSidedBesideAHole, axis))).toBe(false);
    const oneSidedWhereTheHoleIs = [
      [rect(0, 6, 0, 1.5), rect(2, 4, 0.5, 1)],
      [rect(0, 2, -1.5, 0)], [rect(4, 6, -1.5, 0)],
    ];
    expect(oneSidedSomewhere(loadedSides(oneSidedWhereTheHoleIs, axis))).toBe(true);
    const throughTheFullDepth = [
      [rect(0, 2, 0, 1.5)], [rect(4, 6, 0, 1.5)],
      [rect(0, 6, -1.5, 0)],
    ];
    expect(oneSidedSomewhere(loadedSides(throughTheFullDepth, axis))).toBe(true);
  });

  it('a lone member that bounds no panel gets no advisory', () => {
    const nodes: Nodes = new Map([[1, { id: 1, x: 0, y: 0, z: 3 }], [2, { id: 2, x: 5, y: 0, z: 3 }]]);
    const elements: Elements = new Map([[1, { id: 1, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1 }]]);
    for (const mode of ['panels', 'width'] as const) {
      expect(gravityLayout(model(nodes, elements), { mode, tributaryWidth: 3 }).oneSided, mode).toEqual([]);
      expect(advisory(model(nodes, elements), mode).assumption, mode).toBeUndefined();
    }
  });
});
