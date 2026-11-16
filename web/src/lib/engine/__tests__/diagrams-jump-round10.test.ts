import { expect, it } from 'vitest';
import { computeDiagram3D, evaluateDiagramAt } from '../diagrams-3d';
import type { Diagram3DKind } from '../diagrams-3d';
import type { ElementForces3D } from '../types-3d';

const round10 = process.env.RUN_KNOWN_WRONG === '2219-round10' ? it : it.skip;
const empty = (length: number): ElementForces3D => ({ elementId: 1, length, nStart: 0, nEnd: 0, vyStart: 0, vyEnd: 0, vzStart: 0, vzEnd: 0, mxStart: 0, mxEnd: 0, myStart: 0, myEnd: 0, mzStart: 0, mzEnd: 0, distributedLoadsY: [], distributedLoadsZ: [], pointLoadsY: [], pointLoadsZ: [] });

round10('known wrong result: #2219 piece jump stations bracket the 10 m member jump and retain its 7.5 peak', () => {
  for (const kind of ['shearY', 'shearZ', 'torsion'] as Diagram3DKind[]) for (const sign of [-1, 1]) {
    const f = empty(5);
    f.distributedLoadsY = f.distributedLoadsZ = [{ a: 0, b: 5, qI: -sign, qJ: -sign }];
    f.memberMoments = [{ a: 0, b: 5, moments: { x: [-sign, -sign, -sign], y: [0, 0, 0], z: [0, 0, 0] } }];
    f.pointLoadsY = f.pointLoadsZ = f.pointTorques = [{ a: 2.5, p: 10 * sign }];
    const parent = { ...empty(10), pieces: [{ x0: 0, x1: 5, forces: empty(5) }, { x0: 5, x1: 10, forces: f }] };
    for (const ef of [parent, { ...empty(10), combined: { method: 'abs' as const, parts: [parent] } }, { ...empty(10), combined: { method: 'srss' as const, parts: [parent] } }]) {
      const d = computeDiagram3D(ef, kind);
      expect(Math.max(Math.abs(d.minValue), Math.abs(d.maxValue))).toBeCloseTo(7.5, 12);
      const left = d.points.filter(p => p.t < 0.75).at(-1)!;
      const right = d.points.find(p => p.t > 0.75)!;
      expect(left.t).toBeLessThan(0.75);
      expect(right.t).toBeGreaterThan(0.75);
      expect(Math.abs(evaluateDiagramAt(ef, kind, left.t))).toBeCloseTo(2.5, 12);
      expect(Math.abs(evaluateDiagramAt(ef, kind, right.t))).toBeCloseTo(7.5, 12);
    }
  }
});
