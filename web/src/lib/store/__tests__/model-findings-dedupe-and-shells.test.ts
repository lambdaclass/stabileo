/**
 * A gate finding `checkModel` also makes is reported once, and a shell finding
 * selects the shell.
 *
 * `checkModel` and the engine name the same finding differently
 * (`MODEL_COINCIDENT_NODES` with an i18n key, `near_duplicate_nodes` with a
 * sentence), so comparing code and message never matched and coincident nodes
 * were listed twice. And frames, plates and quads number independently, so a
 * diagnostic about Quad 1 read as frame 1 selected the wrong member.
 */
import { sameFinding } from '../../engine/model-findings';
import { describe, it, expect, beforeAll } from 'vitest';
import { initSolver, solve3D, solve } from '../../engine/wasm-solver';
import { checkModel } from '../../engine/model-diagnostics';
import { resultsStore } from '../results.svelte';
import { uiStore } from '../ui.svelte';
import type { SolverDiagnostic } from '../../engine/types';
import type { SolverInput3D } from '../../engine/types-3d';

/** ProDiagnosticsTab's merge, as it reads now. */
function mergeLikePanel(autoModelDiags: SolverDiagnostic[], fromGates: SolverDiagnostic[]): SolverDiagnostic[] {
  const merged = [...autoModelDiags];
  for (const sd of fromGates) {
    if (!merged.some((d) => sameFinding(d, sd))) merged.push(sd);
  }
  return merged;
}

const frame = (id: number, nodeI: number, nodeJ: number) => ({
  id, type: 'frame' as const, nodeI, nodeJ, materialId: 1, sectionId: 1,
  releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false,
  releaseTStart: false, releaseTEnd: false,
});
const fixed = (nodeId: number) => ({ nodeId, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true });

function input3D(nodes: [number, number, number, number][], elems: [number, number, number][], sup: number[]): SolverInput3D {
  return {
    nodes: new Map(nodes.map(([id, x, y, z]) => [id, { id, x, y, z }])),
    materials: new Map([[1, { id: 1, e: 200_000, nu: 0.3, rho: 78.5 }]]),
    sections: new Map([[1, { id: 1, a: 0.005, iy: 1e-5, iz: 1e-5, j: 1e-6 }]]),
    elements: new Map(elems.map(([id, i, j]) => [id, frame(id, i, j)])),
    supports: new Map(sup.map((n) => [n, fixed(n)])),
    loads: [{ type: 'nodal', data: { id: 1, nodeId: 2, fx: 0, fy: 0, fz: -10, mx: 0, my: 0, mz: 0 } }],
  } as unknown as SolverInput3D;
}

/** The same model as checkModel's ModelData (what the panel passes). */
function asModel(inp: SolverInput3D) {
  return {
    nodes: inp.nodes as any,
    elements: inp.elements as any,
    materials: inp.materials as any,
    sections: inp.sections as any,
    supports: new Map([...inp.supports.values()].map((s, i) => [i + 1, { id: i + 1, nodeId: s.nodeId, type: 'fixed3d' }])) as any,
    loads: [{ type: 'nodal3d', data: { id: 1, nodeId: 2, caseId: 1 } }],
    loadCases: [{ id: 1, name: 'D', type: 'D' }],
    plates: inp.plates as any,
    quads: inp.quads as any,
  };
}

beforeAll(async () => { await initSolver(); });

describe('checkModel vs engine gate dedupe', () => {
  it('an unsupported isolated node never produces results (engine throws; solver-service rejects earlier)', () => {
    const inp = input3D([[1, 0, 0, 0], [2, 5, 0, 0], [3, 0, 5, 0]], [[1, 1, 2]], [1]);
    expect(() => solve3D(inp)).toThrow(/Singular/);
  });

  it('control: a rigidLink-only node is NOT flagged disconnected by the gate (no false positive)', () => {
    const inp = input3D([[1, 0, 0, 0], [2, 5, 0, 0], [3, 5, 1, 0]], [[1, 1, 2]], [1]);
    inp.constraints = [{ type: 'rigidLink', masterNode: 2, slaveNode: 3, dofs: [0, 1, 2, 3, 4, 5] } as any];
    const res = solve3D(inp);
    resultsStore.setResults3D(res);
    const gates = resultsStore.structuredDiagnostics3D;
    expect(gates.filter((d) => d.code === 'disconnected_node')).toEqual([]);
  });

  it('solver-path/residual entries are not double-listed via solverDiagnostics + structuredDiagnostics', () => {
    const inp = input3D([[1, 0, 0, 0], [2, 5, 0, 0]], [[1, 1, 2]], [1]);
    const res = solve3D(inp);
    resultsStore.setResults3D(res);
    const solverMsgs = resultsStore.solverDiagnostics3D.map((d) => d.message);
    const gateMsgs = resultsStore.structuredDiagnostics3D.map((d) => d.message);
    expect(gateMsgs.filter((m) => solverMsgs.includes(m))).toEqual([]);
  });

  it('coincident nodes are reported once, not twice (3D)', () => {
    // 1-2 and 3-4; nodes 2 and 3 coincide at (5,0,0)
    const inp = input3D([[1, 0, 0, 0], [2, 5, 0, 0], [3, 5, 0, 0], [4, 10, 0, 0]], [[1, 1, 2], [2, 3, 4]], [1, 4]);
    const js = checkModel(asModel(inp));
    const res = solve3D(inp);
    resultsStore.setResults3D(res);
    const gates = resultsStore.structuredDiagnostics3D;
    const merged = mergeLikePanel(js, gates);
    const aboutPair = merged.filter((d) => JSON.stringify([...(d.nodeIds ?? [])].sort()) === '[2,3]');
    expect(aboutPair.length).toBe(1);
  });

  it('a gate finding checkModel also made is recognised as the same one', () => {
    const js: SolverDiagnostic = { severity: 'warning', code: 'MODEL_COINCIDENT_NODES', message: 'diag.model.coincidentNodes', nodeIds: [2, 3], source: 'model' };
    const gate: SolverDiagnostic = { severity: 'warning', code: 'near_duplicate_nodes', message: 'Nodes 3 and 2 are near-duplicates', nodeIds: [3, 2], source: 'model' };
    expect(sameFinding(js, gate)).toBe(true);
    // Not a different pair, and not a different finding about the same nodes.
    expect(sameFinding(js, { ...gate, nodeIds: [3, 4] })).toBe(false);
    expect(sameFinding(js, { ...gate, code: 'disconnected_node' })).toBe(false);
  });

  it('2D: coincident nodes are reported once too', () => {
    const inp2d: any = {
      nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 5, z: 0 }], [3, { id: 3, x: 5, z: 0 }], [4, { id: 4, x: 10, z: 0 }]]),
      materials: new Map([[1, { id: 1, e: 200_000, nu: 0.3 }]]),
      sections: new Map([[1, { id: 1, a: 0.005, iz: 1e-5 }]]),
      elements: new Map([
        [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
        [2, { id: 2, type: 'frame', nodeI: 3, nodeJ: 4, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }]]),
      supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }], [2, { id: 2, nodeId: 4, type: 'fixed' }]]),
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fz: -10, my: 0 } }],
    };
    const res: any = solve(inp2d);
    resultsStore.setResults(res);
    const gates = resultsStore.structuredDiagnostics;
    const js = checkModel({
      nodes: new Map([[1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: 5, y: 0 }], [3, { id: 3, x: 5, y: 0 }], [4, { id: 4, x: 10, y: 0 }]]) as any,
      elements: inp2d.elements, materials: inp2d.materials, sections: inp2d.sections,
      supports: inp2d.supports, loads: [{ type: 'nodal', data: { id: 1, nodeId: 2, caseId: 1 } }],
      loadCases: [{ id: 1, name: 'D', type: 'D' }],
    });
    const merged = mergeLikePanel(js, gates);
    expect(merged.filter((d) => JSON.stringify([...(d.nodeIds ?? [])].sort()) === '[2,3]').length).toBe(1);
  });
});

describe('shell ids in elementIds', () => {
  it('a quad/plate gate diagnostic is distinguishable from a frame one, and does not select the frame with the same id', () => {
    // frame 1 (cantilever 1-2); quad 1 at 30:1 aspect; plate 1 at 40:1 aspect. All shell nodes fixed.
    const inp = input3D(
      [[1, 0, 0, 0], [2, 5, 0, 0],
       [10, 0, 10, 0], [11, 30, 10, 0], [12, 30, 11, 0], [13, 0, 11, 0],
       [20, 0, 20, 0], [21, 40, 20, 0], [22, 0, 21, 0]],
      [[1, 1, 2]], [1, 10, 11, 12, 13, 20, 21, 22]);
    inp.quads = new Map([[1, { id: 1, nodes: [10, 11, 12, 13], materialId: 1, thickness: 0.1 }]]);
    inp.plates = new Map([[1, { id: 1, nodes: [20, 21, 22], materialId: 1, thickness: 0.1 }]]);
    const res: any = solve3D(inp);
    const raw = (res.structuredDiagnostics ?? []).filter((d: any) => /^(Quad|Plate)/.test(d.message));
    expect(raw.length).toBeGreaterThan(0);
    resultsStore.setResults3D(res);
    // What the panels get: shell findings select shells, never a frame element.
    const shellDiags = resultsStore.structuredDiagnostics3D.filter((d) => /^(Quad|Plate)/.test(d.message));
    expect(shellDiags.length).toBe(raw.length);
    for (const d of shellDiags) {
      expect(d.elementIds, d.message).toBeUndefined();
      expect(d.shellKeys?.[0], d.message).toBe(d.message.startsWith('Quad') ? 'q1' : 'p1');
    }

    // (a) the diagnostic must carry something beyond a bare number that says which entity kind it is
    for (const d of raw) {
      const keys = Object.keys(d).filter((k) => !['code', 'severity', 'message', 'elementIds', 'nodeIds', 'dofIndices', 'phase', 'value', 'threshold'].includes(k));
      expect(keys, `no entity-kind field on ${d.message}`).not.toEqual([]);
    }
  });

  it('clicking a quad diagnostic selects the quad, not the frame with the same id', () => {
    const quadDiag = resultsStore.structuredDiagnostics3D.find((d) => d.message.startsWith('Quad 1'))!;
    expect(quadDiag).toBeTruthy();
    expect(quadDiag.elementIds).toBeUndefined();
    // ProDiagnosticsTab.handleClick, shell branch, as it reads now:
    uiStore.setSelection(new Set(), new Set(), false, new Set(quadDiag.shellKeys));
    expect([...uiStore.selectedShells]).toEqual(['q1']);
    expect([...uiStore.selectedElements]).toEqual([]);
  });
});
