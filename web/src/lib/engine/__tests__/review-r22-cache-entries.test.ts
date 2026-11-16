import { expect, it } from 'vitest';
import { solve, solve3D, solvePDelta, solvePDelta3D } from '../wasm-solver';
import type { SolverInput, ElementForces } from '../types';
import type { AnalysisResults3D, SolverInput3D } from '../types-3d';
import { ConcurrentDemand } from '../concurrent-demand';
import { extractGoverningDemands } from '../station-design-forces';
import { autoVerifyFromResults } from '../auto-verify';
import { runUnifiedVerification, runCirsocDesign } from '../verification-service';

for (const spatial of [false, true]) for (const nonlinear of [false, true]) for (const edition of ['2005', '2025'] as const) for (const entry of ['auto', 'unified', 'design'] as const) {
  it(`known wrong result: #2080 shared span equals uncached WASM spatial=${spatial} nonlinear=${nonlinear} ${edition} ${entry}`, () => {
    const model = {
      nodes: new Map([1, 2, 3].map(id => [id, { id, x: (id - 1) * 0.4, y: 0, z: 0 }])),
      elements: new Map([1, 2].map(id => [id, { id, nodeI: id, nodeJ: id + 1, type: 'frame' as const, sectionId: id, materialId: 1 }])),
      sections: new Map([1, 2].map(id => {
        const b = id === 1 ? 0.3 : 0.6, h = id === 1 ? 0.6 : 0.3;
        return [id, { id, name: 'RC', b, h, a: b * h, iy: b * h ** 3 / 12, iz: h * b ** 3 / 12, j: 0.001 }];
      })),
      materials: new Map([[1, { id: 1, name: 'H25', fc: 25, fy: 25, e: 25000, nu: 0.2 }]]),
      supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' as const }]]),
    };
    let raw: AnalysisResults3D;
    if (spatial) {
      const input: SolverInput3D = { ...model,
        elements: new Map([...model.elements].map(([id, e]) => [id, { ...e, releaseMyStart: false, releaseMyEnd: false,
          releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }])),
        supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
        loads: [{ type: 'nodal', data: { nodeId: 3, fx: 0, fy: 0, fz: 0, mx: 0, my: 20, mz: 15 } }],
      };
      raw = nonlinear ? solvePDelta3D(input).results : solve3D(input);
    } else {
      const input: SolverInput = { ...model,
        nodes: new Map([...model.nodes].map(([id, n]) => [id, { id, x: n.x, z: 0 }])),
        elements: new Map([...model.elements].map(([id, e]) => [id, { ...e, hingeStart: false, hingeEnd: false }])),
        loads: [{ type: 'nodal', data: { nodeId: 3, fx: 0, fz: 0, my: 20 } }],
      };
      const planar = nonlinear ? solvePDelta(input).results : solve(input);
      raw = { displacements: [], reactions: [], elementForces: planar.elementForces.map((ef: ElementForces) => ({
        elementId: ef.elementId, length: ef.length, nStart: ef.nStart, nEnd: ef.nEnd,
        myStart: ef.mStart, myEnd: ef.mEnd, mzStart: 0, mzEnd: 0,
        vyStart: 0, vyEnd: 0, vzStart: ef.vStart, vzEnd: ef.vEnd, mxStart: 0, mxEnd: 0,
      })) };
    }
    const tuples = ConcurrentDemand.endpoints(raw.elementForces[0]!);
    const demands = extractGoverningDemands({ elementId: 1, length: 0.8, stationTs: [0, 1],
      comboResults: [{ comboId: 1, comboName: 'shared', stations: tuples.map(d => ({ ...d.forces })) }] });
    const shared = new Map([1, 2].map(elementId => [elementId, { ...demands, elementId }]));
    const run = (elementForces: typeof raw.elementForces, inputModel = model, stationDemands = shared) => entry === 'auto'
      ? autoVerifyFromResults({ ...raw, elementForces }, inputModel, null, { edition }, stationDemands).concrete
      : entry === 'unified' ? runUnifiedVerification({ ...raw, elementForces }, inputModel, null, stationDemands, { edition })
        : runCirsocDesign({ ...raw, elementForces }, inputModel, stationDemands, new Map(), null, { edition }).concrete;
    expect(shared.get(2)!.elementId).toBe(2);
    expect(shared.get(2)!.concurrent).toBe(shared.get(1)!.concurrent);
    const expected = raw.elementForces.flatMap(ef => run([ef], {
      ...model, elements: new Map([[ef.elementId, model.elements.get(ef.elementId)!]]),
    }, shared));
    const uncached = new Map([...shared].map(([id, d]) => [id, { ...d, concurrent: [...d.concurrent!] }]));
    expect(uncached.get(1)!.concurrent).not.toBe(uncached.get(2)!.concurrent);
    expect(expected).toHaveLength(2);
    expect(new Set(expected.map(v => v.flexureAxis)).size).toBe(spatial ? 2 : 1);
    expect(expected.every(v => v.engineRecheck?.certified?.ok)).toBe(true);
    expect(run(raw.elementForces, model, uncached)).toEqual(expected);
    expect(run(raw.elementForces)).toEqual(expected);
    expect(() => run(raw.elementForces.slice(0, 1))).toThrow(expect.objectContaining({
      code: 'incomplete-concurrent-demand', diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 'missing-member', comboId: 0, elementId: 2 }),
      ]),
    }));
    const mislabeled = new Map(shared);
    mislabeled.set(2, demands);
    expect(() => run(raw.elementForces, model, mislabeled)).toThrow(expect.objectContaining({
      code: 'incomplete-concurrent-demand', diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 'missing-member', comboId: 1, elementId: 2 }),
      ]),
    }));
    for (const stationT of [0, 1]) {
      const partial = new Map(shared);
      partial.set(2, { ...shared.get(2)!, concurrent: demands.concurrent!.filter(d => d.stationT !== stationT) });
      expect(() => run(raw.elementForces, model, partial)).toThrow(expect.objectContaining({
        code: 'incomplete-concurrent-demand', diagnostics: expect.arrayContaining([
          expect.objectContaining({ code: 'missing-station', comboId: 1, elementId: 2, stationT }),
        ]),
      }));
    }
  });
}
