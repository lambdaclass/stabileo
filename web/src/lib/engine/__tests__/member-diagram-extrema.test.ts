import { expect, it } from 'vitest';
import { computeElementDiagram } from '../diagrams';
import { computeDiagram3D, type Diagram3DKind } from '../diagrams-3d';
import type { ElementForces3D } from '../types-3d';

it('covers the dense independent maxima of variable partial loads, forces and couples', () => {
  let seed = 291557;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const length = 20;
  const gaussOffset = 1 / Math.sqrt(3);
  for (let layout = 0; layout < 10; layout++) {
    const a = 1 + random(), b = a + 0.03 + 0.09 * random();
    const distributed = [
      { a, b, qI: 2 + 4 * random(), qJ: -2 - 4 * random() },
      { a: (a + b) / 2, b: b + 0.1 * random(), qI: -random(), qJ: random() },
    ];
    const point = 2.7 + random(), gap = 0.002 + 0.02 * random(), p = random() - 0.5, couple = random() - 0.5;
    const actions = [{ a: point, p, my: couple }, { a: point + gap, p: -p, my: -couple }];
    const contribution = (x: number, right: boolean) => {
      let v = 0, m = 0, my = 0;
      for (const d of distributed) {
        const end = Math.min(d.b, x);
        if (end <= d.a) continue;
        const half = (end - d.a) / 2;
        for (const direction of [-1, 1]) {
          const position = d.a + half * (1 + direction * gaussOffset);
          const force = half * (d.qI + (d.qJ - d.qI) * (position - d.a) / (d.b - d.a));
          v += force;
          m += force * (x - position);
        }
      }
      for (const action of actions) {
        if (action.a > x || (action.a === x && !right)) continue;
        v += action.p;
        m += action.p * (x - action.a);
        my += action.my;
      }
      return { v, m, my };
    };
    const end = contribution(length, false);
    const vStart = -end.v;
    const mStart = vStart * length + end.m - end.my;
    const spaceMomentStart = -(vStart * length + end.m);
    const planar = { length, qI: 0, qJ: 0, vStart, vEnd: 0, mStart, mEnd: 0, nStart: 0, nEnd: 0,
      distributedLoads: distributed, pointLoads: actions };
    const spatial: ElementForces3D = {
      elementId: 1, length, nStart: 0, nEnd: 0, vyStart: 0, vyEnd: 0, vzStart: vStart, vzEnd: 0,
      mxStart: 0, mxEnd: 0, myStart: spaceMomentStart, myEnd: 0, mzStart: 0, mzEnd: 0,
      qYI: 0, qYJ: 0, qZI: 0, qZJ: 0, distributedLoadsY: [], distributedLoadsZ: distributed,
      pointLoadsY: [], pointLoadsZ: actions, releaseMyStart: false, releaseMyEnd: false,
      releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false,
    };
    const cuts = [0, length, ...distributed.flatMap(d => [d.a, d.b]), ...actions.map(p => p.a)].sort((a, b) => a - b);
    const exact = { shear: 0, moment: 0, spaceMoment: 0 };
    const scan = (x: number, side: boolean) => {
      const { v, m, my } = contribution(x, side);
      exact.shear = Math.max(exact.shear, Math.abs(vStart + v));
      exact.moment = Math.max(exact.moment, Math.abs(mStart - vStart * x - m + my));
      exact.spaceMoment = Math.max(exact.spaceMoment, Math.abs(spaceMomentStart + vStart * x + m));
    };
    cuts.forEach(x => { scan(x, false); scan(x, true); });
    for (let i = 1; i < cuts.length; i++) {
      const lo = cuts[i - 1]!, hi = cuts[i]!;
      for (let k = 1; k < 2048; k++) scan(lo + (hi - lo) * k / 2048, false);
    }
    for (const [kind, want] of [['shear', exact.shear], ['moment', exact.moment]] as const) {
      const diagram = computeElementDiagram(kind, planar, 0, 0, length, 0);
      expect.soft(Math.abs(diagram.maxAbsValue) + 1e-12, `planar ${kind}, layout ${layout}`).toBeGreaterThanOrEqual(want);
      expect.soft(Math.abs(diagram.maxAbsValue), `planar ${kind}, layout ${layout}`).toBeCloseTo(want, 5);
    }
    const expected: [Diagram3DKind, number][] = [['shearZ', exact.shear], ['momentY', exact.spaceMoment]];
    for (const [kind, want] of expected) {
      const diagram = computeDiagram3D(spatial, kind);
      expect.soft(Math.abs(diagram.maxAbsValue) + 1e-12, `spatial ${kind}, layout ${layout}`).toBeGreaterThanOrEqual(want);
      expect.soft(Math.abs(diagram.maxAbsValue), `spatial ${kind}, layout ${layout}`).toBeCloseTo(want, 5);
    }
  }
});
