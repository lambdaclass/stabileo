import { expect, it } from 'vitest';
import { ConcurrentDemand } from '../concurrent-demand';
import { verifyConcurrentElement } from '../concurrent-verification';
import { checkSlender, verifyElement, type ConcurrentVerificationInput } from '../codes/argentina/cirsoc201';
import { getCodeDetail, runUnifiedVerification, runCirsocDesign } from '../verification-service';
import { autoVerifyFromResults, type AutoVerifyModelData } from '../auto-verify';
import { solve3D, solvePDelta3D } from '../wasm-solver';
import { extractGoverningDemands } from '../station-design-forces';
import type { SolverInput3D } from '../types-3d';

const params = { b: 0.4, h: 0.6, fc: 30, fy: 420, cover: 0.025, stirrupDia: 8 };

function input(elementType: 'column' | 'wall' | 'beam', axis: 'My' | 'Mz', secondary: number, n = 0, comboId = 1): ConcurrentVerificationInput {
  const demand = ConcurrentDemand.fromTuples([{ comboId, comboName: `comb ${comboId}`, forces: {
    n: -n, my: axis === 'My' ? 20 : secondary, mz: axis === 'Mz' ? 20 : secondary,
    vy: 5, vz: 5, torsion: 0, t: 0.5, x: 2,
  } }])[0]!.section(axis);
  return { ...params, elementId: 1, elementType, demand, Lu: 4 };
}

for (const elementType of ['column', 'wall'] as const) {
  for (const axis of ['My', 'Mz'] as const) {
    for (const edition of ['2005', '2025'] as const) {
      for (const secondary of [0, 0.009, 0.01, 0.011]) {
        const test = secondary <= 0.01 ? it.fails : it;
        test(`#1316 — ${elementType}, ${axis}, ${edition}, secondary moment ${secondary} retains its own slenderness and memo`, () => {
          const i = { ...input(elementType, axis, secondary), edition };
          const single = verifyElement(i);
          const expected = checkSlender({ ...params, b: params.h, h: params.b }, 0, secondary, i.Lu!, {
            M1: secondary, M2: secondary,
          });
          expect(single.slenderSecondary).toEqual(expected);
          expect(expected.isSlender).toBe(true);
          expect(single.biaxial !== undefined).toBe(secondary > 0.01);
          const aggregate = verifyConcurrentElement([i]);
          expect(aggregate.slenderSecondary).toEqual(expected);
          expect(getCodeDetail(aggregate)!.memos.find(m => m.titleKey === 'design.memo.slenderSecondary')!.steps).toEqual(expected.steps);
        });
      }
    }
  }
  for (const reverse of [false, true]) {
    it.fails(`#1316 — ${elementType} selects secondary amplification independently of biaxial utilization, reverse=${reverse}`, () => {
      const a = input(elementType, 'My', 12, 100, 1);
      const b = input(elementType, 'My', 0, 500, 2);
      const v = verifyConcurrentElement(reverse ? [b, a] : [a, b]);
      const cases = v.concurrentChecks!;
      const amplification = cases.find(c => c.demand.comboId === 2)!.verification.slenderSecondary!;
      const other = cases.find(c => c.demand.comboId === 1)!.verification;
      expect(amplification.delta_ns).toBeGreaterThan(other.slenderSecondary!.delta_ns);
      expect(v.biaxial).toEqual(other.biaxial);
      expect(v.slenderSecondary).toEqual(amplification);
    });
  }
  for (const Lu of [0, 1, 0.3 * params.b * 22, 0.3 * params.b * 22 + 0.001]) {
    const test = Lu > 0 ? it.fails : it;
    test(`#1316 — ${elementType} retains secondary slenderness at length ${Lu}`, () => {
      const i = { ...input(elementType, 'My', 0), Lu };
      const single = verifyElement(i);
      expect(single.slenderSecondary?.isSlender ?? false).toBe(Lu > 0.3 * params.b * 22);
      expect(verifyConcurrentElement([i]).slenderSecondary).toEqual(single.slenderSecondary);
    });
  }
}

for (const reverse of [false, true]) {
  it.fails(`#1316 — slender secondary result governs a short result with equal amplification, reverse=${reverse}`, () => {
    const a = { ...input('column', 'My', 0.011, 0, 1), M1Secondary: -0.011, M2Secondary: 0.011 };
    const b = input('column', 'My', 0, 0, 2);
    const v = verifyConcurrentElement(reverse ? [b, a] : [a, b]);
    const short = v.concurrentChecks!.find(c => c.demand.comboId === 1)!.verification.slenderSecondary!;
    const slender = v.concurrentChecks!.find(c => c.demand.comboId === 2)!.verification.slenderSecondary!;
    expect(short.isSlender).toBe(false);
    expect(slender.isSlender).toBe(true);
    expect(short.delta_ns).toBe(slender.delta_ns);
    expect(v.slenderSecondary).toEqual(slender);
  });
}

it('#1316 — beams retain their answer without secondary slenderness', () => {
  const v = verifyConcurrentElement([input('beam', 'My', 0)]);
  expect(v.slenderSecondary).toBeUndefined();
  expect(v.biaxial).toBeUndefined();
  expect(v.flexure.ratio).toBeGreaterThan(0);
  expect(getCodeDetail(v)!.memos.some(m => m.titleKey === 'design.memo.slenderSecondary')).toBe(false);
});

for (const nonlinear of [false, true]) {
  for (const spatial of [false, true]) {
    for (const stations of [false, true]) {
      for (const entry of ['auto', 'unified', 'design'] as const) {
        it.fails(`#1316 — ${spatial ? 'spatial' : 'planar'} ${nonlinear ? 'P-Delta' : 'linear'} column, ${stations ? 'stations' : 'endpoints'}, ${entry} retains the secondary check`, () => {
          const model: AutoVerifyModelData = {
            elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1 }]]),
            nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0, y: 0, z: 4 }]]),
            sections: new Map([[1, { id: 1, name: 'RC', ...params, a: params.b * params.h,
              iy: params.b * params.h ** 3 / 12, iz: params.h * params.b ** 3 / 12, j: 0.001 }]]),
            materials: new Map([[1, { id: 1, name: 'H30', fc: 30, fy: 30, e: 25000, nu: 0.2 }]]),
            supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }]]),
          };
          const solver: SolverInput3D = { ...model, supports: new Map([[1, { nodeId: 1,
            rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
            loads: [{ type: 'nodal', data: { nodeId: 2, fx: 5, fy: spatial ? 0.009 / 4 : 0, fz: 0, mx: 0, my: 0, mz: 0 } }],
          } as SolverInput3D;
          const results = nonlinear ? solvePDelta3D(solver).results : solve3D(solver);
          const demands = stations ? new Map([[1, extractGoverningDemands({ elementId: 1, length: 4, stationTs: [0, 1],
            comboResults: [{ comboId: 1, comboName: 'load', stations: ConcurrentDemand.endpoints(results.elementForces[0]!).map(d => ({ ...d.forces })) }],
          })]]) : undefined;
          const v = entry === 'auto' ? autoVerifyFromResults(results, model, null, undefined, demands).concrete[0]!
            : entry === 'unified' ? runUnifiedVerification(results, model, null, demands)[0]!
            : runCirsocDesign(results, model, demands, new Map(), null).concrete[0]!;
          expect(v.concurrentChecks!.every(c => c.verification.slenderSecondary !== undefined)).toBe(true);
          expect(v.concurrentChecks!.some(c => c.verification.slenderSecondary!.isSlender)).toBe(true);
          expect(v.biaxial).toBeUndefined();
          expect(v.slenderSecondary?.isSlender).toBe(true);
          expect(getCodeDetail(v)!.memos.some(m => m.titleKey === 'design.memo.slenderSecondary')).toBe(true);
        });
      }
    }
  }
}
