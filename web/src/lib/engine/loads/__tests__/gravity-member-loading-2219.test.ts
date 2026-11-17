import { expect, it } from 'vitest';
import { floorLoad } from '../floor-loads';
import { physicalRegion, transferRegionToCarriers } from '../physical-region-loads';
import { rectangle, regionModel } from './physical-region-invariance';

const evaluate = (v: number[], t: number) => 2 * (t - 0.5) * (t - 1) * v[0]! + 4 * t * (1 - t) * v[1]! + 2 * t * (t - 0.5) * v[2]!;

for (const angle of [0, 0.37, Math.PI / 2]) for (const mirror of [1, -1]) for (const split of [false, true]) {
  it(`known wrong result: #2219 each carrier receives its physical tributary load, rotation=${angle}, mirror=${mirror}, split=${split}`, () => {
    const p = (x: number, y: number): [number, number] => [mirror * x * Math.cos(angle) - y * Math.sin(angle), mirror * x * Math.sin(angle) + y * Math.cos(angle)];
    const contour = rectangle(0, 0, 6, 4).map(([x, y]) => p(x!, y!));
    const ring = split ? contour.flatMap((a, i) => { const b = contour[(i + 1) % 4]!; return [a, [a[0] + 0.3 * (b[0] - a[0]), a[1] + 0.3 * (b[1] - a[1])]]; }) : contour;
    const m = regionModel([ring]);
    const out = transferRegionToCarriers(m, physicalRegion(contour), [...m.elements.keys()]);
    for (let side = 0; side < 4; side++) {
      const ids = split ? [2 * side + 1, 2 * side + 2] : [side + 1];
      const expected = side % 2 === 0 ? 8 : 4;
      const pieces = out.pieces.filter(l => ids.includes(l.elementId));
      expect(pieces.reduce((f, l) => f + (l.wI + l.wJ) * (l.b - l.a) / 2, 0)).toBeCloseTo(expected, 8);
      const length = side % 2 === 0 ? 6 : 4;
      for (const x of [0.2, 0.7, 1.7, length / 2, length - 0.2]) {
        let value = 0;
        for (const l of pieces) {
          const e = m.elements.get(l.elementId)!, a = m.nodes.get(e.nodeI)!, start = contour[side]!;
          const offset = Math.hypot(a.x - start[0], a.y - start[1]);
          const at = x - offset;
          if (at >= l.a && at < l.b) value += l.wI + (at-l.a)/(l.b-l.a)*(l.wJ-l.wI);
        }
        expect(value).toBeCloseTo(Math.min(x, length-x, 2), 8);
      }
    }
    expect(out.points.filter(p => Math.abs(p.w) > 1e-10)).toHaveLength(0);
  });
}

for (const distribution of ['twoWay', 'oneWay'] as const) for (const leftHand of [false, true]) {
  it(`known wrong result: #2219 floor eccentricity is a member moment, ${distribution}, leftHand=${leftHand}`, () => {
    const m = regionModel([rectangle(0, 0, 6, 4)]);
    const out = floorLoad({ nodes: m.nodes, beams: [...m.elements.values()].map(e => ({ ...e, type: 'frame' as const })), q: 1, distribution, spanAxis: 'y', leftHand });
    const bottom = out.loads.filter(l => l.elementId === 1);
    for (const x of [0.5, 1.5, 3, 4.5, 5.5]) {
      const depth = distribution === 'twoWay' ? Math.min(x, 6 - x, 2) : 2;
      let force = 0, torque = 0;
      for (const l of bottom) {
        const a = l.a ?? 0, b = l.b ?? 6;
        if (x <= a || x >= b) continue;
        const t = (x - a) / (b - a);
        force += l.qI + t * (l.qJ - l.qI);
        const moments = (l as typeof l & { moments?: { x: number[] } }).moments;
        if (moments) torque += evaluate(moments.x, t);
      }
      expect(force).toBeCloseTo(depth, 8);
      expect(torque).toBeCloseTo((leftHand ? 1 : -1) * depth * depth / 2, 8);
    }
    expect(out.nodal.filter(n => n.transfer !== 'roundoff' && (n.mx !== 0 || n.my !== 0))).toHaveLength(0);
  });
}

for(const [region,accepted] of [
  [rectangle(0,0,6,1),true],[rectangle(0.5,0,5.5,1),true],[rectangle(-0.001,0,6,1),false],[rectangle(0,0,6.001,1),false],
] as const) {
  it(`carrier projection boundary is explicit: ${region[0]![0]}..${region[1]![0]}`,()=>{
    const model={nodes:new Map([[1,{x:0,y:0}],[2,{x:6,y:0}]]),elements:new Map([[1,{nodeI:1,nodeJ:2}]])};
    const run=()=>transferRegionToCarriers(model,physicalRegion(region.map(([x,y])=>[x!,y!])),[1]);
    if(!accepted) expect(run).toThrow('physical carrier partition');
    else expect(run().pieces.reduce((sum,p)=>sum+(p.wI+p.wJ)*(p.b-p.a)/2,0)).toBeCloseTo(region[1]![0]!-region[0]![0]!,8);
  });
}
