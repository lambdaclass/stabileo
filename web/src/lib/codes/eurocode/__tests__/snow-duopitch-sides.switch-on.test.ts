import { describe, expect, it } from 'vitest';
import { buildLoadPlan, type LoadModelData, type LoadPlanInput } from '../../../engine/loads/load-plan';
import { planInput } from '../../__tests__/family-plan-helpers';

function shed(dy: number): LoadModelData {
  const nodes = new Map<number, { id: number; x: number; y: number; z?: number }>();
  const elements = new Map<number, { id: number; nodeI: number; nodeJ: number; sectionId: number; materialId: number }>();
  let n = 1, e = 1;
  const node = (x: number, y: number, z: number) => { nodes.set(n, { id: n, x, y: y + dy, z }); return n++; };
  const bar = (i: number, j: number) => { elements.set(e, { id: e, nodeI: i, nodeJ: j, sectionId: 1, materialId: 1 }); return e++; };
  const eave: number[][] = [];
  for (const x of [0, 3, 6]) {
    const lo = node(x, 0, 3), hi = node(x, 6, 3), ridge = node(x, 3, 4.5);
    eave.push([lo, hi]);
    bar(lo, ridge); bar(ridge, hi);
    if (x !== 3) { bar(node(x, 0, 0), lo); bar(node(x, 6, 0), hi); }
  }
  for (const side of [0, 1]) { bar(eave[0]![side]!, eave[1]![side]!); bar(eave[1]![side]!, eave[2]![side]!); }
  return { nodes, elements, sections: new Map([[1, { id: 1, a: 0.01 }]]), materials: new Map([[1, { id: 1, rho: 78.5 }]]), loadCases: [] };
}

describe('EN 1991-1-3 duopitch arrangements on a roof away from the origin', () => {
  for (const dy of [0, 10, -25]) it(`ridge at y = ${3 + dy}: case (ii) halves one slope and keeps the other`, () => {
    const model = shed(dy);
    const plan = buildLoadPlan(planInput('eurocode', {
      model, tributaryWidth: 1, gravity: { mode: 'width' },
      codeInputs: { 'en1991-1-3': { sk: 1, roof: 'duopitch' } },
      snow: { enabled: true, pg: 1, source: 'site', terrain: 'C', exposure: 'partial', thermal: 'normal', category: 'II', roofKind: 'gable', slippery: false, partial: false } as LoadPlanInput['snow'],
    }));
    const snow = plan.cases.map((c, k) => ({ c, k })).filter(({ c }) => c.type === 'S');
    expect(snow.map(({ c }) => c.nameKey)).toEqual(['loads.ec.snowCase.i', 'loads.ec.snowCase.ii', 'loads.ec.snowCase.iii']);
    const rafters = [...model.elements.values()].filter((el) => {
      const zs = [model.nodes.get(el.nodeI)!.z, model.nodes.get(el.nodeJ)!.z];
      return zs.includes(3) && zs.includes(4.5);
    });
    const load = (caseIndex: number, id: number) => plan.distributed.filter((d) => d.caseIndex === caseIndex && d.elementId === id).reduce((s, d) => s - d.q, 0);
    const ratios = (k: number) => rafters.map((el) => {
      const midY = (model.nodes.get(el.nodeI)!.y + model.nodes.get(el.nodeJ)!.y) / 2;
      return { side: midY < 3 + dy ? 'low' : 'high', ratio: load(k, el.id) / load(snow[0]!.k, el.id) };
    });
    const bySide = (k: number) => {
      const rs = ratios(k);
      const of = (side: string) => [...new Set(rs.filter((r) => r.side === side).map((r) => +r.ratio.toFixed(9)))];
      return [of('low'), of('high')];
    };
    const [lowII, highII] = bySide(snow[1]!.k), [lowIII, highIII] = bySide(snow[2]!.k);
    expect([lowII, highII].sort()).toEqual([[0.5], [1]]);
    expect(lowIII).toEqual(highII);
    expect(highIII).toEqual(lowII);
  });
});
