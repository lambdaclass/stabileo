import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { modelStore, historyStore, uiStore } from '../../../store';
import { splitAtNodes, CUT_TOL } from '../cut-members';
import { splitElementLoads } from '../member-split';
import { buildSolverInput2D, buildSolverInput3D } from '../../../engine/solver-service';
import { initSolver, solve, solve3D, solvePDelta, solvePDelta3D } from '../../../engine/wasm-solver';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { modelStore.clear(); historyStore.clear(); });

describe.skip('known wrong result: #2223 — unloaded member cuts', () => {
  for (const dimension of [2, 3]) for (const entry of ['direct', 'nodes'] as const) {
    it(`${dimension}D ${entry} connects a reused mesh node without remapping unrelated loads`, () => {
      uiStore.analysisMode = dimension === 2 ? '2d' : 'pro';
      const a = modelStore.addNode(0, 1, ...(dimension === 3 ? [0] : []));
      const b = modelStore.addNode(6, 1, ...(dimension === 3 ? [0] : []));
      const e = modelStore.addElement(a, b, 'frame');
      modelStore.addSupport(a, dimension === 2 ? 'fixed' : 'fixed3d');
      const at = modelStore.addNode(0.3527582651648433, 1.0000912705421996, ...(dimension === 3 ? [0] : []));
      modelStore.model.loads = [dimension === 2
        ? { type: 'nodal', data: { id: 1, nodeId: b, fx: 0, fy: -2, mz: 0 } }
        : { type: 'nodal3d', data: { id: 1, nodeId: b, fx: 0, fy: 0, fz: -2, mx: 0, my: 0, mz: 0 } }];
      const loads = JSON.parse(JSON.stringify(modelStore.loads));
      if (entry === 'direct') expect(modelStore.splitMember(e, [0.3527582651648433 / 6], { reuseNodeTol: CUT_TOL })!.nodeIds).toEqual([at]);
      else expect(splitAtNodes([e], [at]).cut).toHaveLength(1);
      expect(modelStore.elements.size).toBe(2);
      expect([...modelStore.elements.values()].filter(e => e.nodeI === at || e.nodeJ === at)).toHaveLength(2);
      expect(modelStore.loads).toEqual(loads);
      for (const nonlinear of [false, true]) {
        if (dimension === 2) {
          const input = buildSolverInput2D(modelStore.model, false)!;
          const result = nonlinear ? solvePDelta(input).linearResults : solve(input);
          expect(result.reactions.find(r => r.nodeId === a)!.rz).toBeCloseTo(2, 10);
          expect(Math.abs(result.reactions.find(r => r.nodeId === a)!.my)).toBeCloseTo(2 * 6, 10);
        } else {
          const input = buildSolverInput3D(modelStore.model, false)!;
          const result = nonlinear ? solvePDelta3D(input).linearResults : solve3D(input);
          expect(result.reactions.find(r => r.nodeId === a)!.fz).toBeCloseTo(2, 10);
          expect(Math.abs(result.reactions.find(r => r.nodeId === a)!.my)).toBeCloseTo(2 * 6, 10);
        }
      }
    });
  }

  for (const dimension of [2, 3]) for (const offset of [0, 0.0000912705421996]) {
    it(`${dimension}D offset=${offset} validates loaded cuts before committing`, () => {
      uiStore.analysisMode = dimension === 2 ? '2d' : 'pro';
      const a = modelStore.addNode(0, 1, ...(dimension === 3 ? [0] : []));
      const b = modelStore.addNode(6, 1, ...(dimension === 3 ? [0] : []));
      const e = modelStore.addElement(a, b, 'frame');
      modelStore.addNode(3, 1 + offset, ...(dimension === 3 ? [0] : []));
      modelStore.model.loads = [dimension === 2
        ? { type: 'distributed', data: { id: 1, elementId: e, qI: -2, qJ: -4 } }
        : { type: 'distributed3d', data: { id: 1, elementId: e, qYI: 0, qYJ: 0, qZI: -2, qZJ: -4 } }];
      const before = JSON.stringify(modelStore.snapshot());
      const cut = () => modelStore.splitMember(e, [0.5], { reuseNodeTol: CUT_TOL });
      if (offset !== 0) {
        expect(cut).toThrow(/geometry leaves the source line/);
        expect(JSON.stringify(modelStore.snapshot())).toBe(before);
      } else {
        expect(cut()!.segmentIds).toHaveLength(2);
        expect(modelStore.loads).toHaveLength(2);
        const ends = modelStore.loads.map(l => l.data as { qI?: number; qJ?: number; qZI?: number; qZJ?: number });
        expect(ends.map(d => [d.qI ?? d.qZI, d.qJ ?? d.qZJ])).toEqual([[-2, -3], [-3, -4]]);
      }
    });
  }

  it('does not request load geometry when only another member has loads', () => {
    const load = { type: 'distributed' as const, data: { id: 1, elementId: 2, qI: -2, qJ: -4 } };
    const geometry = () => { throw new Error('unneeded geometry'); };
    expect(splitElementLoads([load], 1, geometry as never, [3, 4], () => 2, [3, 3])).toEqual({ kept: [load], added: [] });
    expect(() => splitElementLoads([load], 2, geometry as never, [3, 4], () => 2, [3, 3])).toThrow('unneeded geometry');
  });
});
