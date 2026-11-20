import { afterEach, expect, it } from 'vitest';
import { drawnBeamReinforcement } from '../../design-contract/reinforcement';
import { getDesignCode } from '../../engine/design/code-adapter';
import { membersFromLine } from '../../engine/design/beam-line';
import type { MemberContext } from '../../engine/design/member-context';
import { extractGoverningDemands, type ElementStationResult } from '../../engine/station-design-forces';
import { computeStationDemands } from '../../engine/verification-service';
import { solve, solve3D, solvePDelta, solvePDelta3D } from '../../engine/wasm-solver';
import type { SolverInput } from '../../engine/types';
import type { AnalysisResults3D, SolverInput3D } from '../../engine/types-3d';
import { regulationsStore } from '../regulations.svelte';
import { verificationStore } from '../verification.svelte';
import '../index';

const L = 8;
const section = { id: 1, name: 'RC beam', b: 0.3, h: 0.37 };
const material = { fc: 25, fy: 420, cover: 0.025, stirrupDia: 8,
  maxAggregateSize: { value: 20, origin: 'project' as const, refs: [] } };
const member = { id: 1, L, tStart: 0.25, tEnd: 0.25, faceStart: 0, faceEnd: 0 };
const i = { id: 1, x: 0, y: 0, z: 0 };
const j = { id: 2, x: L, y: 0, z: 0 };
const element = { id: 1, type: 'frame' as const, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1 };
const shape = { ...section, a: section.b * section.h, iy: section.b * section.h ** 3 / 12,
  iz: section.h * section.b ** 3 / 12, j: 0.001 };
const model = {
  nodes: new Map([[i.id, i], [j.id, j]]),
  elements: new Map([[1, element]]),
  sections: new Map([[1, shape]]),
  materials: new Map([[1, { id: 1, name: 'H25', fc: material.fc, fy: material.fy, e: 25000, nu: 0.2 }]]),
  supports: new Map([[i.id, { id: i.id, nodeId: i.id, type: 'fixed' as const }]]),
};
const loss = { bottomRaise: 0, topLower: 0, depthTolerance: 0.001 };

function reinforcement(topTo: number) {
  return membersFromLine({
    version: 1, members: [1], lengths: [L],
    bars: [
      { id: 'top', face: 'top', row: 0, role: 'main', count: 4, diameter: 16, from: 0, to: topTo },
      { id: 'bottom', face: 'bottom', row: 0, role: 'main', count: 4, diameter: 16, from: 0, to: L },
    ],
    stirrups: [{ id: 'hoops', from: 0, to: L, diameter: 8, legs: 4, spacing: 0.06 }],
  }, [member]).get(1)!;
}

function context(stations: ElementStationResult, extracted: boolean): MemberContext {
  return {
    elementId: 1, elementType: 'beam', materialFamily: 'concrete', L, section, material,
    modelData: { ...model, elements: new Map() },
    demands: extracted ? extractGoverningDemands(stations) : undefined, stations: extracted ? undefined : stations,
    criticalSections: undefined, slenderDeltaNs: 1, slenderDeltaS: 1, orientationSuspect: false, codeEdition: '2025',
    analysisRevision: 0, demandRevision: 0, solveGeneration: 0, blocking: [],
    axes: { flexure: 'My', shear: 'Vz', secondaryFlexure: 'Mz', secondaryShear: 'Vy', bFlex: section.b,
      hFlex: section.h, biaxial: false, sagCategory: 'My+', hogCategory: 'My-', basis: 'stress-proxy', secondaryRatio: 0 },
  };
}

afterEach(() => {
  verificationStore._setReinforcementProvider(() => undefined);
  verificationStore.clear();
});

const finalDepth = process.env.RUN_KNOWN_WRONG === '2398' ? it : it.skip;

for (const extracted of [false, true]) {
  finalDepth(`known wrong result: #2398 final depth uses the override bar extent (extracted=${extracted})`, () => {
    const stations: ElementStationResult = { elementId: 1, length: L, stationTs: [0.5], comboResults: [{
      comboId: 1, comboName: 'C1', stations: [{ t: 0.5, x: L / 2, my: 0, mz: 0, n: 0, vy: 0, vz: 0, torsion: 6 }],
    }] };
    const ctx = context(stations, extracted);
    verificationStore.setDemandData(new Map([[1, ctx]]));
    const saved = reinforcement(L);
    const short = { ...saved, [drawnBeamReinforcement]: reinforcement(L / 2 - 1e-6)[drawnBeamReinforcement] };
    const regional = { regions: saved.regions };
    const adapter = getDesignCode(regulationsStore.concreteDesignCode()!)!;
    const checked = adapter.verify({ ...ctx, finalGeometry: loss }, short);
    expect(checked.checks).toContainEqual(expect.objectContaining({ description: 'diag.rcTorsionCutoff', status: 'fail' }));
    verificationStore._setReinforcementProvider(() => saved);
    expect(verificationStore.reverifyAtFinalDepth(1, loss)).toBe('ok');
    expect(verificationStore.reverifyAtFinalDepth(1, loss, regional)).toBe('ok');
    expect(verificationStore.reverifyAtFinalDepth(1, loss, short)).toBe('fail');
  });
}

function solveCantilever(spatial: boolean, nonlinear: boolean): AnalysisResults3D {
  if (spatial) {
    const input: SolverInput3D = {
      ...model,
      elements: new Map([[1, { ...element, releaseMyStart: false, releaseMyEnd: false,
        releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }]]),
      supports: new Map([[i.id, { nodeId: i.id, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
      loads: [{ type: 'nodal', data: { nodeId: j.id, fx: 0, fy: 0, fz: -1, mx: 0, my: 0, mz: 0 } }],
    };
    return nonlinear ? solvePDelta3D(input).results : solve3D(input);
  }
  const input: SolverInput = {
    ...model,
    nodes: new Map([i, j].map(({ id, x, z }) => [id, { id, x, z }])),
    elements: new Map([[1, { ...element, hingeStart: false, hingeEnd: false }]]),
    sections: new Map([[1, { ...shape, iz: shape.iy }]]),
    loads: [{ type: 'nodal', data: { nodeId: j.id, fx: 0, fz: -1, my: 0 } }],
  };
  const raw = nonlinear ? solvePDelta(input).results : solve(input);
  return {
    displacements: [],
    reactions: [],
    elementForces: raw.elementForces.map(e => ({
      elementId: e.elementId, length: e.length, nStart: e.nStart, nEnd: e.nEnd,
      myStart: e.mStart, myEnd: e.mEnd, vzStart: e.vStart, vzEnd: e.vEnd,
      mzStart: 0, mzEnd: 0, vyStart: 0, vyEnd: 0, mxStart: 0, mxEnd: 0,
      qYI: 0, qYJ: 0, qZI: e.qI, qZJ: e.qJ, distributedLoadsY: [], distributedLoadsZ: e.distributedLoads,
      pointLoadsY: [], pointLoadsZ: e.pointLoads, releaseMyStart: e.hingeStart, releaseMyEnd: e.hingeEnd,
      releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false,
    })),
  };
}

for (const spatial of [false, true]) for (const nonlinear of [false, true]) {
  finalDepth(`known wrong result: #2398 final depth uses the solved drawing extent (spatial=${spatial}, nonlinear=${nonlinear})`, () => {
    const raw = solveCantilever(spatial, nonlinear);
    const stations = computeStationDemands(new Map([[1, raw]]), [{ id: 1, name: 'C1', factors: [] }], model).stations.get(1)!;
    const full = reinforcement(L);
    const short = { ...full, [drawnBeamReinforcement]: reinforcement(L / 4)[drawnBeamReinforcement] };
    const regional = { regions: full.regions };
    const adapter = getDesignCode(regulationsStore.concreteDesignCode()!)!;
    for (const extracted of [false, true]) {
      const ctx = context(stations, extracted);
      verificationStore.setDemandData(new Map([[1, ctx]]));
      expect(adapter.verify({ ...ctx, finalGeometry: loss }, short).checks)
        .toContainEqual(expect.objectContaining({ description: 'diag.rcDrawnBarExtent', status: 'fail' }));
      verificationStore._setReinforcementProvider(() => full);
      expect(verificationStore.reverifyAtFinalDepth(1, loss, regional)).toBe('ok');
      expect.soft(verificationStore.reverifyAtFinalDepth(1, loss, short)).toBe('fail');
      verificationStore._setReinforcementProvider(() => short);
      expect(verificationStore.reverifyAtFinalDepth(1, loss, regional)).toBe('fail');
      expect.soft(verificationStore.reverifyAtFinalDepth(1, loss, full)).toBe('ok');
    }
  });
}
