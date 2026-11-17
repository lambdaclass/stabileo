import { expectGravityAnswerOrRefusal } from './physical-region-invariance';
import { expect, it } from 'vitest';
import { floorLoad } from '../floor-loads';
import { regionModel, rectangle, floorResultant } from './physical-region-invariance';


for (const distribution of ['oneWay', 'twoWay'] as const) for (const width of [0.5e-12, 1.5e-12, 0.5e-9, 1.5e-9]) for (const q of [1, -1]) {
  it(`supported gravity slivers keep their load on the member: ${distribution}, width=${width}, q=${q}`, () => expectGravityAnswerOrRefusal(() => {
    const model = regionModel([rectangle(0,0,6,4)]), a = 1.5, b = a+width;
    const scale = (b-a) * 2 ** 19;
    const out = floorLoad({ nodes: model.nodes, beams: [...model.elements.values()].map(e=>({...e,type:'frame' as const})), q: q*scale/(b-a), distribution, spanAxis:'y', zone: { outer: rectangle(a,0,b,1).map(p=>[p[0]!,p[1]!,p[2]!] as [number,number,number]) } });
    expect(out.loadedArea).toBeCloseTo(b-a, 15);
    expect(out.loads.length).toBeGreaterThan(0);
    for (const load of out.loads) { expect(load.a).toBe(a); expect(load.b).toBe(b); }
    const result = floorResultant(model,out).map(value => value / scale);
    expect(result[0]).toBeCloseTo(q,8);
    expect(result[1]).toBeCloseTo(q*(a+(b-a)/2),8);
    expect(result[2]).toBeCloseTo(q/2,8);
    expect(out.nodal).toHaveLength(0);
    expect(out.concentrated).toEqual([]);
  }));
}

for (const distribution of ['oneWay', 'twoWay'] as const) for (const width of [0.5e-12, 1.5e-12, 0.5e-9, 1.5e-9]) for (const q of [1, -1]) {
  it(`large intensity gravity slivers refuse before losing their load: ${distribution}, width=${width}, q=${q}`, () => {
    const model = regionModel([rectangle(0,0,6,4)]), a = 1.5, b = a+width;
    expect(() => floorLoad({ nodes: model.nodes, beams: [...model.elements.values()].map(e=>({...e,type:'frame' as const})), q: q/(b-a), distribution, spanAxis:'y', zone: { outer: rectangle(a,0,b,1).map(p=>[p[0]!,p[1]!,p[2]!] as [number,number,number]) } })).toThrow(/profile intensity/);
  });
}
