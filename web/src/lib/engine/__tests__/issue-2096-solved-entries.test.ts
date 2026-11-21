import { completeResultDemands } from '../result-demand-gate';
import { extractGoverningDemands } from '../station-design-forces';
import { expect, it, afterEach, vi } from 'vitest';
import * as wasmSolver from '../wasm-solver';
import * as stationBuffer from '../station-buffer';
import { solve, solvePDelta, solve3D, solvePDelta3D } from '../wasm-solver';
import type { AnalysisResults, SolverInput } from '../types';
import type { AnalysisResults3D, SolverInput3D } from '../types-3d';
import { computeStationDemands, setCompactStationTransfer, runUnifiedVerification, runCirsocDesign } from '../verification-service';
import { autoVerifyFromResults, type AutoVerifyModelData } from '../auto-verify';
import { memberContexts, runOtherCode } from '../design/other-codes/run';
import { AISC360, EC3 } from '../design/other-codes/steel-codes';
import { ACI318, EC2 } from '../design/other-codes/concrete-codes';
import { AISI_S100 } from '../design/other-codes/cfs-code';
import { buildAllMemberContexts } from '../design/member-context';
import { applySpanContexts, designSpans, mergeSpanStations } from '../design/design-spans';

const model = {
  elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1 }]]),
  nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0, y: 0, z: 4 }]]),
  sections: new Map([[1, { id: 1, name: 'RC', b: 0.4, h: 0.4, a: 0.16, iy: 0.4 ** 4 / 12, iz: 0.4 ** 4 / 12, j: 0.001 }]]),
  materials: new Map([[1, { id: 1, name: 'H30', fc: 30, fy: 30, e: 25000, nu: 0.2 }]]),
  supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }]]),
} satisfies AutoVerifyModelData;
afterEach(() => { setCompactStationTransfer(true); vi.restoreAllMocks(); });
const issue2403 = process.env.RUN_KNOWN_WRONG === '2403' ? it : it.skip;
for (const spatial of [false, true]) for (const nonlinear of [false, true]) for (const compact of [false, true]) {
  const solveModel = (source = model) => {
    const loadedNode = Math.max(...source.nodes.keys());
    const solver: SolverInput3D = { ...source,
      elements: new Map([...source.elements].map(([id, e]) => [id, { ...e, type: 'frame' as const, releaseMyStart: false, releaseMyEnd: false,
        releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }])),
      supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
      loads: [{ type: 'nodal', data: { nodeId: loadedNode, fx: 1, fy: spatial ? 1 : 0, fz: -10, mx: 0, my: 0, mz: 0 } }],
    };
    setCompactStationTransfer(compact);
    if (spatial) return nonlinear ? solvePDelta3D(solver).results : solve3D(solver);
    const planar: SolverInput = { nodes: new Map([...source.nodes].map(([id, n]) => [id, { id, x: n.x, z: n.z }])),
      materials: source.materials, sections: source.sections,
      elements: new Map([...source.elements].map(([id, e]) => [id, { ...e, type: 'frame', hingeStart: false, hingeEnd: false }])),
      supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }]]),
      loads: [{ type: 'nodal', data: { nodeId: loadedNode, fx: 1, fz: -10, my: 0 } }] };
    const raw: AnalysisResults = nonlinear ? solvePDelta(planar).results : solve(planar);
    return { ...raw,
      displacements: raw.displacements.map(d => ({ ...d, uy: 0, rx: 0, rz: 0 })),
      reactions: raw.reactions.map(r => ({ nodeId: r.nodeId, fx: r.rx, fz: r.rz, my: r.my, fy: 0, mx: 0, mz: 0 })),
      elementForces: raw.elementForces.map(e => ({
        elementId: e.elementId, length: e.length, nStart: e.nStart, nEnd: e.nEnd,
        myStart: e.mStart, myEnd: e.mEnd, vzStart: e.vStart, vzEnd: e.vEnd,
        mzStart: 0, mzEnd: 0, vyStart: 0, vyEnd: 0, mxStart: 0, mxEnd: 0,
        qYI: 0, qYJ: 0, qZI: e.qI, qZJ: e.qJ, distributedLoadsY: [], distributedLoadsZ: e.distributedLoads,
        pointLoadsY: [], pointLoadsZ: e.pointLoads, releaseMyStart: false, releaseMyEnd: false,
        releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false,
      })) } as unknown as AnalysisResults3D;
  };
  const combinations = [{ id: 1, name: 'C1', factors: [] }, { id: 2, name: 'C2', factors: [] }];
  const label = `spatial=${spatial} nonlinear=${nonlinear} compact=${compact}`;
  it(`known wrong result: #2096 round3 dispatch preserves per-combination stations ${label}`, () => {
    const raw = solveModel();
    const data = computeStationDemands(new Map([[1, raw], [2, raw]]), combinations, model);
    const source = data.stations.get(1)!;
    const extra = source.stationTs.find(t => t > 0 && t < 1)!;
    const demands = extractGoverningDemands({ ...source, inventory: undefined, stationTs: [0, 1], comboResults: source.comboResults.map(c => ({ ...c,
      stations: c.stations.filter(s => s.t === 0 || s.t === 1 || c.comboId === 1 && s.t === extra),
    })) });
    const supplied = new Map([[1, demands]]);
    const governing = new Map([[1, { momentY: { comboId: 1, comboName: 'C1', value: 0 }, momentZ: undefined }]]);
    const expected = autoVerifyFromResults(raw, model, null, undefined, supplied).concrete;
    expect(expected).toHaveLength(1);
    expect(autoVerifyFromResults(raw, model, governing, undefined, supplied).concrete).toEqual(expected);
    expect(runUnifiedVerification(raw, model, governing, supplied)).toEqual(expected);
    expect(runCirsocDesign(raw, model, supplied, new Map(), governing).concrete).toEqual(expected);
    const contexts = memberContexts(model as never, new Map([[1, raw], [2, raw]]), combinations);
    contexts[0] = { ...contexts[0]!, demands: demands.demands, tuples: [...demands.concurrent!], stationTs: [0, 1] };
    for (const adapter of [AISC360, EC3, ACI318, EC2, AISI_S100]) expect(runOtherCode(adapter, contexts).rows).toHaveLength(1);
  });
  it(`known wrong result: #2096 round7 converted extra station cannot disappear ${label}`, () => {
    const raw = solveModel();
    const data = computeStationDemands(new Map([[1, raw], [2, raw]]), combinations, model);
    const source = data.stations.get(1)!;
    const extra = source.stationTs.find(t => t > 0 && t < 1)!;
    expect(extra).toBeGreaterThan(0);
    expect(extra).toBeLessThan(1);
    const demands = extractGoverningDemands({ ...source, inventory: undefined, stationTs: [0, 1], comboResults: source.comboResults.map(c => ({ ...c,
      stations: c.stations.filter(s => s.t === 0 || s.t === 1 || c.comboId === 1 && s.t === extra),
    })) });
    expect(completeResultDemands(raw, [1], new Map([[1, demands]])).values).toHaveLength(5);
    const partial = { ...demands, concurrent: demands.concurrent!.filter(d => !(d.comboId === 1 && d.stationT === extra)) };
    expect(() => completeResultDemands(raw, [1], new Map([[1, partial]]))).toThrow(expect.objectContaining({
      code: 'incomplete-concurrent-demand', diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 'missing-station', elementId: 1, comboId: 1, stationT: extra }),
      ]),
    }));
  });
  issue2403(`known wrong result: #2403 refuses a missing design-span station after a solve ${label}`, () => {
    const spanModel = {
      ...model,
      nodes: new Map([1, 2, 3].map(id => [id, { id, x: 2 * (id - 1), y: 0, z: 0 }])),
      elements: new Map([1, 2].map(id => [id, { ...model.elements.get(1)!, id, nodeI: id, nodeJ: id + 1 }])),
    };
    const raw = solveModel(spanModel);
    const data = computeStationDemands(new Map([[1, raw], [2, raw]]), combinations, spanModel);
    const [span] = designSpans(spanModel, () => true);
    expect(span?.elements).toEqual([1, 2]);
    const complete = mergeSpanStations(spanModel, span!, id => data.stations.get(id))!;
    expect(complete.stationTs).toContain(0.75);
    expect(extractGoverningDemands(complete).concurrent).toEqual(expect.arrayContaining([
      expect.objectContaining({ comboId: 2, stationT: 0.75 }),
    ]));

    const source = data.stations.get(2)!;
    data.stations.set(2, { ...source, comboResults: source.comboResults.map(c => c.comboId === 2
      ? { ...c, stations: c.stations.filter(s => s.t !== 0.5) } : c) });
    expect(() => {
      const merged = mergeSpanStations(spanModel, span!, id => data.stations.get(id))!;
      extractGoverningDemands(merged);
    }).toThrow(expect.objectContaining({ code: 'incomplete-concurrent-demand' }));
  });
  for (const entry of ['auto', 'unified', 'design'] as const) it(`known wrong result: #2096 complete grouped span reaches ${entry} ${label}`, () => {
    const spanModel = { ...model,
      sections: new Map([...model.sections].map(([id, s]) => [id, { ...s, rotation: 0 }])),
      nodes: new Map([1, 2, 3].map(id => [id, { id, x: 2 * (id - 1), y: 0, z: 0 }])),
      elements: new Map([1, 2].map(id => [id, { ...model.elements.get(1)!, id, nodeI: id, nodeJ: id + 1 }])),
    };
    const raw = solveModel(spanModel);
    const data = computeStationDemands(new Map([[1, raw], [2, raw]]), combinations, spanModel);
    const contexts = buildAllMemberContexts(spanModel, data);
    const spans = applySpanContexts(contexts, spanModel, [{ key: 'span-1', representative: 1,
      elements: [1, 2], reversed: [false, false], lengths: [2, 2], offsets: [0, 2], length: 4, start: 1, end: 3 }]);
    expect(spans).toHaveLength(1);
    const demands = new Map([...contexts].map(([id, c]) => [id, c.demands!]));
    const run = (input: typeof demands) => ({
      auto: () => autoVerifyFromResults(raw, spanModel, null, undefined, input).concrete,
      unified: () => runUnifiedVerification(raw, spanModel, null, input),
      design: () => runCirsocDesign(raw, spanModel, input, new Map(), null).concrete,
    })[entry]();
    expect(run(demands).map(v => v.elementId)).toEqual([1, 2]);
    for (const [id, c] of contexts) {
      expect(c.demands!.elementId).toBe(id);
      expect(c.stations!.elementId).toBe(id);
      expect(c.demands!.concurrent).toBe(contexts.get(1)!.demands!.concurrent);
    }
    const partial = new Map(demands);
    partial.set(2, { ...demands.get(2)!, concurrent: demands.get(2)!.concurrent!.filter(d => d.stationT !== 1) });
    expect(() => run(partial)).toThrow(expect.objectContaining({
      code: 'incomplete-concurrent-demand', diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 'missing-station', elementId: 2, comboId: 1, stationT: 1 }),
      ]),
    }));
  });
  for (const missing of ['combination', 'member', 'start', 'interior', 'end', 'combined'] as const) {
    it(`known wrong result: #2096 all design dispatchers refuse ${missing} ${label}`, () => {
      const raw = solveModel();
      const perCombo = new Map([[1, raw], [2, raw]]);
      const data = computeStationDemands(perCombo, combinations, model);
      const d = data.demands.get(1)!;
      const t = missing === 'start' ? 0 : missing === 'end' ? 1 : data.stations.get(1)!.stationTs[Math.floor(data.stations.get(1)!.stationTs.length / 2)]!;
      const code = missing === 'combination' ? 'missing-combination' : missing === 'member' ? 'missing-member' : 'missing-station';
      const diag = missing === 'combination' ? { code, comboId: 2 } : missing === 'member' ? { code, elementId: 1 } : { code, elementId: 1, comboId: 1, stationT: t };
      if (missing === 'member') raw.elementForces = [];
      else data.demands.set(1, { ...d, concurrent: d.concurrent!.filter(s => missing === 'combination' ? s.comboId !== 2
        : missing === 'combined' ? s.comboId !== 2 && s.stationT !== t : s.stationT !== t) });
      const check = (run: () => unknown) => {
        let error: unknown;
        try { run(); } catch (e) { error = e; }
        expect(error).toMatchObject({ code: 'incomplete-concurrent-demand', diagnostics: expect.arrayContaining([expect.objectContaining(diag)]) });
      };
      for (const run of [() => autoVerifyFromResults(raw, model, null, undefined, data.demands),
        () => runUnifiedVerification(raw, model, null, data.demands),
        () => runCirsocDesign(raw, model, data.demands, new Map(), null)]) check(run);
      if (missing === 'member') {
        check(() => computeStationDemands(perCombo, combinations, model));
        check(() => memberContexts(model as never, perCombo, combinations));
      } else {
        const ctx = memberContexts(model as never, perCombo, combinations)[0]!;
        ctx.tuples = [...data.demands.get(1)!.concurrent!];
        for (const adapter of [AISC360, EC3, ACI318, EC2, AISI_S100]) {
          const run = vi.spyOn(adapter, 'run');
          check(() => runOtherCode(adapter, [ctx]));
          expect(run).not.toHaveBeenCalled();
        }
      }
    });
  }
  for (const t of [0, 0.3, 0.5, 1]) it(`known wrong result: #2096 station transfer cannot shrink the requested grid at ${t} ${label}`, () => {
    const raw = solveModel();
    if (compact) {
      const decode = stationBuffer.decodeStationBuffer;
      vi.spyOn(stationBuffer, 'decodeStationBuffer').mockImplementation((buffer, names) => decode(buffer, names).map(s => ({ ...s,
        stationTs: s.stationTs.filter(x => x !== t), comboResults: s.comboResults.map(c => ({ ...c, stations: c.stations.filter(x => x.t !== t) })),
      })));
    } else {
      const extract = wasmSolver.extractBeamStationsGrouped3D;
      vi.spyOn(wasmSolver, 'extractBeamStationsGrouped3D').mockImplementation(input => {
        const output = extract(input);
        return { ...output, members: output.members.map(m => ({ ...m, stations: m.stations.filter(s => s.t !== t) })) };
      });
    }
    expect(() => computeStationDemands(new Map([[1, raw], [2, raw]]), combinations, model)).toThrow(expect.objectContaining({
      code: 'incomplete-concurrent-demand', diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'missing-station', comboId: 1, elementId: 1, stationT: t })]),
    }));
  });

}
