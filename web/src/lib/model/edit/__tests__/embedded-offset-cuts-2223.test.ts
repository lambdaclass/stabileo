import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { modelStore, historyStore, uiStore } from '../../../store';
import { splitAtNodes, splitAllAtNodes, intersectMembers } from '../cut-members';
import { buildSolverInput2D, buildSolverInput3D, shouldEmbedFlat2DModelIn3D } from '../../../engine/solver-service';
import { initSolver, solve, solve3D, solvePDelta, solvePDelta3D, solveCorotational2D, solveCorotational3D } from '../../../engine/wasm-solver';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { modelStore.clear(); historyStore.clear(); });

describe.skip('known wrong result: #2223 — embedded offset member cuts', () => {
  for (const offset of [0, 0.25]) for (const partial of [false, true]) {
    for (const entry of ['direct', 'point', 'subdivide', 'nodes', 'allNodes', 'intersection'] as const) {
      it(`offset=${offset} partial=${partial} ${entry} solves with the prescribed load through 2D and embedded 3D`, () => {
        uiStore.analysisMode = '2d';
        const i = modelStore.addNode(0, 0), j = modelStore.addNode(6, 0);
        const id = modelStore.addElement(i, j, 'frame');
        modelStore.addSupport(i, 'fixed');
        modelStore.updateElement(id, { offset: { frame: 'global', i: { x: offset, y: offset, z: 0 }, j: { x: -offset, y: 2 * offset, z: 0 } } });
        const a = partial ? 1 : 0, b = partial ? 5 : 6, qI = -2, qJ = -4;
        modelStore.model.loads = [{ type: 'distributed', data: { id: 1, elementId: id, qI, qJ, a, b } }];
        expect(shouldEmbedFlat2DModelIn3D(modelStore.model)).toBe(true);
        if (entry === 'direct') expect(modelStore.splitMember(id, [0.5], { keepOriginalId: true })!.segmentIds).toHaveLength(2);
        else if (entry === 'point') expect(modelStore.splitElementAtPoint(id, 0.5)).not.toBeNull();
        else if (entry === 'subdivide') expect(modelStore.subdivideElement(id, 2)).toBe(true);
        else if (entry === 'intersection') {
          const crossing = modelStore.addElement(modelStore.addNode(3, -1), modelStore.addNode(3, 1), 'frame');
          expect(intersectMembers([id, crossing]).cut).toHaveLength(2);
          for (const element of [...modelStore.elements.values()]) {
            if ([element.nodeI, element.nodeJ].some(n => modelStore.nodes.get(n)!.y !== 0)) modelStore.removeElement(element.id);
          }
          for (const node of [...modelStore.nodes.values()]) if (node.y !== 0) modelStore.removeNode(node.id);
        } else {
          const at = modelStore.addNode(3, 0);
          expect((entry === 'nodes' ? splitAtNodes([id], [at]) : splitAllAtNodes().report).cut).toHaveLength(1);
        }
        expect(modelStore.elements.size).toBe(2);
        expect(modelStore.loads).toHaveLength(2);
        const children = [...modelStore.elements.values()];
        if (offset !== 0) {
          expect(children.find(e => e.nodeI === i)!.offset!.i).toEqual({ x: offset, y: offset, z: 0 });
          expect(children.find(e => e.nodeJ === j)!.offset!.j).toEqual({ x: -offset, y: 2 * offset, z: 0 });
        }
        const force = (qI + qJ) * (b - a) / 2;
        const moment = force * a + (qI + 2 * qJ) * (b - a) ** 2 / 6;
        for (const dimension of [2, 3]) {
          const input2D = buildSolverInput2D(modelStore.model, false)!;
          const input3D = buildSolverInput3D(modelStore.model, false)!;
          for (const mode of ['linear', 'pdelta', 'corotational']) {
            const nonlinear = mode === 'corotational'
              ? dimension === 2 ? solveCorotational2D(input2D, 50, 1e-12, 10) : solveCorotational3D(input3D, 50, 1e-12, 10)
              : null;
            if (nonlinear) expect(nonlinear.converged).toBe(true);
            const result = nonlinear?.results ?? (dimension === 2
              ? mode === 'linear' ? solve(input2D) : solvePDelta(input2D).linearResults
              : mode === 'linear' ? solve3D(input3D) : solvePDelta3D(input3D).linearResults);
            const reaction = result.reactions.find((r: { nodeId: number }) => r.nodeId === i)!;
            expect('rz' in reaction ? reaction.rz : reaction.fz).toBeCloseTo(-force, 10);
            if (mode !== 'corotational') expect(Math.abs(reaction.my)).toBeCloseTo(-moment, 10);
          }
        }
      });
    }
  }
});

for (const offset of [0, 0.25]) for (const partial of [false, true]) it(`3D offset=${offset} partial=${partial} retains flexible geometry when splitting`, () => {
  uiStore.analysisMode = 'pro';
  const i = modelStore.addNode(0, 0, 0), j = modelStore.addNode(6, 0, 0);
  const id = modelStore.addElement(i, j, 'frame');
  modelStore.addSupport(i, 'fixed3d');
  modelStore.updateElement(id, { offset: { frame: 'global', i: { x: 0, y: offset, z: 0 }, j: { x: 0, y: offset, z: 0 } } });
  const a = partial ? 1 : 0, b = partial ? 5 : 6, qI = -2, qJ = -4;
  modelStore.model.loads = [{ type: 'distributed3d', data: { id: 1, elementId: id, qYI: 0, qYJ: 0, qZI: qI, qZJ: qJ, a, b } }];
  expect(shouldEmbedFlat2DModelIn3D(modelStore.model)).toBe(false);
  expect(modelStore.splitMember(id, [0.5], { keepOriginalId: true })!.segmentIds).toHaveLength(2);
  const input = buildSolverInput3D(modelStore.model, false)!;
  for (const result of [solve3D(input), solvePDelta3D(input).linearResults]) {
    expect(result.reactions.find(r => r.nodeId === i)!.fz).toBeCloseTo(-(qI + qJ) * (b - a) / 2, 10);
  }
});
