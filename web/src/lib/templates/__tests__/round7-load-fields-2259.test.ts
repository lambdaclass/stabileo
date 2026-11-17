import { afterEach, beforeAll, expect, it } from 'vitest';
import { loadFixture, type JSONModel } from '../load-fixture';
import { modelStore, uiStore } from '../../store';
import { initSolver } from '../../engine/wasm-solver';
import { solveReference } from '../../engine/steps/reference';

beforeAll(async () => { await initSolver(); });
afterEach(() => modelStore.clear());

const fixture = (loads: JSONModel['loads']): JSONModel => ({
  name: 'load-field round trip', materials: [], sections: [],
  nodes: [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 4, y: 0, z: 0 }],
  elements: [{ id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }],
  supports: [{ id: 1, nodeId: 1, type: 'fixed' }], loads,
  plates: [], quads: [], constraints: [],
  loadCases: [{ id: 1, name: 'D', type: 'D' }, { id: 2, name: 'L', type: 'L' }], combinations: [],
});

it.skip('known wrong result: #2259 the shared fixture loader preserves a partial plane load and its reaction', () => {
  uiStore.analysisMode = '2d'; modelStore.clear();
  const a = 0.5, b = 1.5, q = -2;
  loadFixture(fixture([{ type: 'distributed', data: { elementId: 1, qI: q, qJ: q, a, b } }]), modelStore.fixtureApi() as never);
  const result = solveReference(modelStore.buildSolverInput(false)!)!;
  expect(result).not.toBeNull();
  expect(result.reactions.get(1)!.rz).toBeCloseTo(-q * (b - a), 12);
  expect(modelStore.loads[0]!.data).toMatchObject({ a, b });
});

it.skip('known wrong result: #2259 the shared fixture loader preserves thermal case membership', () => {
  uiStore.analysisMode = '2d'; modelStore.clear();
  loadFixture(fixture([{ type: 'thermal', data: { elementId: 1, dtUniform: 2, dtGradient: 3, caseId: 2 } }]), modelStore.fixtureApi() as never);
  expect(modelStore.loads[0]!.data).toMatchObject({ dtUniform: 2, dtGradient: 3, caseId: 2 });
});
