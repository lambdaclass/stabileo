import { beforeEach, expect, it } from 'vitest';
import { modelStore, uiStore } from '../../store';
import { historyStore } from '../../store/history.svelte';
import { centerlineInput } from '../../store/dynamic-input';
import * as wasm from '../wasm-solver';
import { validateAndSolve3D } from '../solver-service';
import { solveDetailed3D } from '../solver-detailed-3d';
import { solveForceMethod3D } from '../force-method/solve-3d';
import { runDirectAnalysis } from '../direct-analysis';
import { cableRefusal } from './sa-059-replay';

beforeEach(() => { modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro'; uiStore.includeSelfWeight = false; uiStore.axisConvention3D = 'rightHand'; });
function fixture(state: 'compression' | 'shortening' | 'unloaded' | 'tension' = 'compression') {
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3);
  const frame = modelStore.addElement(a, b, 'frame'), cable = modelStore.addElement(a, b, 'truss');
  modelStore.updateElement(cable, { behaviour: 'cable' });
  modelStore.addSupport(a, 'fixed3d');
  modelStore.addSupport(b, 'custom3d', undefined, { dofRestraints: { tx: true, ty: true, tz: state === 'shortening', rx: false, ry: false, rz: false }, ...(state === 'shortening' ? { dz: -0.00001 } : {}) });
  if (state === 'compression' || state === 'tension') modelStore.addNodalLoad3D(b, 0, 0, state === 'tension' ? 10 : -10, 0, 0, 0, 1);
  return { a, b, frame, cable };
}
it.skip.each(['compression', 'shortening', 'unloaded', 'tension'] as const)('preserves cable identity and refuses unsupported paths for %s', async (state) => {
  const { a, b, frame, cable } = fixture(state);
  const input = centerlineInput({ caseDisplacements: true });
  expect(input.elements.get(cable)!.type).toBe('cable');
  const paths: Array<[string, () => unknown]> = [
    ['P-Delta', () => wasm.solvePDelta3D(input)],
    ['corotational', () => wasm.solveCorotational3D(input, 50, 1e-6, 10)],
    ['Winkler', () => wasm.solveWinkler3D({ solver: input, foundationSprings: [{ elementId: frame, ky: 10000, kz: 10000 }] })],
    ['SSI', () => wasm.solveSSI3D({ solver: input, soilSprings: [{ nodeId: b, direction: 1, tributaryLength: 1, curve: { type: 'py_soft_clay', su: 50, gamma_eff: 18, d: 0.6, depth: 5, eps_50: 0.01, j: 0.5 } }] })],
    ['staged', () => wasm.solveStaged3D({ solver: input, stages: [{ name: 'one', elementsAdded: [frame, cable], elementsRemoved: [], supportsAdded: [a, b], loadIndices: state === 'compression' || state === 'tension' ? [0] : [] }] })],
    ['direct analysis', () => runDirectAnalysis(modelStore.model as never, modelStore.model.loadCases, [{ id: 1, name: 'D', factors: [{ caseId: 1, factor: 1 }] }], { includeSelfWeight: false })],
    ['stiffness teaching wizard', () => solveDetailed3D(input)],
    ['flexibility teaching wizard', () => solveForceMethod3D(input)],
  ];
  for (const [path, run] of paths) await cableRefusal(path, run, cable);
});
it.each(['compression', 'tension', 'unloaded'] as const)('automatic cable solve enforces the force split for %s', (state) => {
  const { frame, cable } = fixture(state);
  const r = validateAndSolve3D(modelStore.model as never, false, false);
  if (!r || typeof r === 'string') throw new Error(String(r));
  const cableForce = r.elementForces.find(f => f.elementId === cable)!;
  const frameForce = r.elementForces.find(f => f.elementId === frame)!;
  const load = state === 'compression' ? -10 : state === 'tension' ? 10 : 0;
  expect(cableForce.nStart + frameForce.nStart).toBeCloseTo(load, 9);
  expect(cableForce.nEnd + frameForce.nEnd).toBeCloseTo(load, 9);
  if (state === 'tension') {
    expect(cableForce.nStart).toBeGreaterThan(0);
    expect(cableForce.nStart).toBeCloseTo(5, 9);
    expect(frameForce.nStart).toBeCloseTo(5, 9);
  } else {
    expect(cableForce.nStart).toBe(0);
    expect(Math.abs(frameForce.nStart - load)).toBe(0);
  }
});
it('rethrows a non-JSON error without replacing it with a parse failure', async () => {
  const original = new Error('unexpected solver error');
  await expect(cableRefusal('unexpected', () => { throw original; }, 2)).rejects.toBe(original);
  const malformed = new Error('unexpected {broken JSON');
  await expect(cableRefusal('unexpected', () => { throw malformed; }, 2)).rejects.toBe(malformed);
});
