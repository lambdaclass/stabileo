import { expect, it } from 'vitest';
import { floorLoad } from '../floor-loads';
import { regionModel, rectangle, floorResultant } from './physical-region-invariance';


for (const distribution of ['oneWay', 'twoWay'] as const) for (const width of [0.5e-12, 1.5e-12, 0.5e-9, 1.5e-9]) for (const q of [1, -1]) {
  it(`known wrong result: #2222 gravity slivers keep their load on the member: ${distribution}, width=${width}, q=${q}`, () => {
    const model = regionModel([rectangle(0,0,6,4)]), a = 1.5, b = a+width;
    const out = floorLoad({ nodes: model.nodes, beams: [...model.elements.values()].map(e=>({...e,type:'frame' as const})), q: q/(b-a), distribution, spanAxis:'y', zone: { outer: rectangle(a,0,b,1).map(p=>[p[0]!,p[1]!,p[2]!] as [number,number,number]) } });
    expect(out.loadedArea).toBeCloseTo(b-a, 15);
    expect(out.loads.every(l => (l.b??6)-(l.a??0) >= 1e-9)).toBe(true);
    const result = floorResultant(model,out);
    expect(result[0]).toBeCloseTo(q,8);
    expect(result[1]).toBeCloseTo(q*(a+(b-a)/2),8);
    expect(result[2]).toBeCloseTo(q/2,8);
    expect(out.nodal).toHaveLength(0);
    if(width<1e-9) expect(out.concentrated.some(l=>l.a>=a && l.a<=b)).toBe(true);
  });
}
