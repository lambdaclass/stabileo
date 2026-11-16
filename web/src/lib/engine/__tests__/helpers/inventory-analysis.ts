import { solve, solvePDelta, solve3D, solvePDelta3D } from '../../wasm-solver';
import type { SolverInput, AnalysisResults } from '../../types';
import type { AnalysisResults3D, SolverInput3D } from '../../types-3d';
import type { AutoVerifyModelData } from '../../auto-verify';

export function inventoryAnalysis(model: AutoVerifyModelData, spatial: boolean, nonlinear: boolean, factor: number): AnalysisResults3D {
  const loaded = [2, 3];
  if (spatial) {
    const input: SolverInput3D = { ...model,
      elements: new Map([...model.elements].map(([id, e]) => [id, { ...e, type: 'frame', releaseMyStart: false, releaseMyEnd: false,
        releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }])),
      supports: new Map([1].map(nodeId => [nodeId, { nodeId, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }])),
      loads: loaded.map(nodeId => ({ type: 'nodal', data: { nodeId, fx: 0, fy: factor, fz: -10 * factor, mx: 0, my: 0, mz: 0 } })),
    } as unknown as SolverInput3D;
    return nonlinear ? solvePDelta3D(input).results : solve3D(input);
  }
  const input: SolverInput = {
    nodes: new Map([...model.nodes].map(([id, n]) => [id, { id, x: n.x, z: n.z ?? 0 }])),
    materials: model.materials, sections: model.sections,
    elements: new Map([...model.elements].map(([id, e]) => [id, { ...e, type: 'frame', hingeStart: false, hingeEnd: false }])),
    supports: new Map([1].map(nodeId => [nodeId, { id: nodeId, nodeId, type: 'fixed' }])),
    loads: loaded.map(nodeId => ({ type: 'nodal', data: { nodeId, fx: 0, fz: -10 * factor, my: 0 } })),
  } as unknown as SolverInput;
  const raw: AnalysisResults = nonlinear ? solvePDelta(input).results : solve(input);
  return { displacements: raw.displacements.map(d => ({ ...d, uy: 0, rx: 0, rz: 0 })),
    reactions: raw.reactions.map(r => ({ nodeId: r.nodeId, fx: r.rx, fz: r.rz, my: r.my, fy: 0, mx: 0, mz: 0 })),
    elementForces: raw.elementForces.map(e => ({ elementId: e.elementId, length: e.length, nStart: e.nStart, nEnd: e.nEnd,
      myStart: e.mStart, myEnd: e.mEnd, vzStart: e.vStart, vzEnd: e.vEnd,
      mzStart: 0, mzEnd: 0, vyStart: 0, vyEnd: 0, mxStart: 0, mxEnd: 0,
      qYI: 0, qYJ: 0, qZI: e.qI, qZJ: e.qJ, distributedLoadsY: [], distributedLoadsZ: e.distributedLoads,
      pointLoadsY: [], pointLoadsZ: e.pointLoads, releaseMyStart: false, releaseMyEnd: false,
      releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false,
    })) } as AnalysisResults3D;
}
