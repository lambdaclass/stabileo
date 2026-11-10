import { beforeEach, expect, it } from 'vitest';
import { modelStore, uiStore } from '../../store';
import { historyStore } from '../../store/history.svelte';
import { centerlineInput } from '../../store/dynamic-input';
import * as wasm from '../wasm-solver';
import { validateAndSolve3D } from '../solver-service';

beforeEach(() => { modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro'; uiStore.includeSelfWeight = false; uiStore.axisConvention3D = 'rightHand'; });
function fixture(shorten = false) {
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3);
  const frame = modelStore.addElement(a, b, 'frame'), cable = modelStore.addElement(a, b, 'truss');
  modelStore.updateElement(cable, { behaviour: 'cable' });
  modelStore.addSupport(a, 'fixed3d');
  modelStore.addSupport(b, 'custom3d', undefined, { dofRestraints: { tx: true, ty: true, tz: shorten, rx: false, ry: false, rz: false }, ...(shorten ? { dz: -0.00001 } : {}) });
  modelStore.addNodalLoad3D(b, 0, 0, -10, 0, 0, 0, 1);
  return { a, b, frame, cable };
}
it.each([false, true])('fixed store preserves cable identity and advanced solvers refuse it (shortening=%s)', (shorten) => {
  const { a, b, frame, cable } = fixture(shorten);
  const input = centerlineInput({ caseDisplacements: true });
  expect(input.elements.get(cable)!.type).toBe('cable');
  const paths: Array<[string, () => unknown]> = [
    ['P-Delta', () => wasm.solvePDelta3D(input)],
    ['corotational', () => wasm.solveCorotational3D(input, 50, 1e-6, 10)],
    ['Winkler', () => wasm.solveWinkler3D({ solver: input, foundationSprings: [{ elementId: frame, ky: 10000, kz: 10000 }] })],
    ['SSI', () => wasm.solveSSI3D({ solver: input, soilSprings: [{ nodeId: b, direction: 1, tributaryLength: 1, curve: { type: 'py_soft_clay', su: 50, gamma_eff: 18, d: 0.6, depth: 5, eps_50: 0.01, j: 0.5 } }] })],
    ['staged', () => wasm.solveStaged3D({ solver: input, stages: [{ name: 'one', elementsAdded: [frame, cable], elementsRemoved: [], supportsAdded: [a, b], loadIndices: [0] }] })],
  ];
  for (const [path, run] of paths) {
    let caught: unknown;
    try { run(); } catch (e) { caught = e; }
    expect(caught, path).toBeDefined();
    const raw = String((caught as Error)?.message ?? caught);
    const data = JSON.parse(raw.slice(raw.indexOf('{')));
    expect(data.structuredDiagnostics).toContainEqual(expect.objectContaining({ code: 'cable_analysis_required', elementIds: [cable] }));
    console.log(JSON.stringify({ path, shorten, diagnostics: data.structuredDiagnostics }));
  }
});
it('fixed automatic cable solve still returns a slack cable and the full frame force', () => {
  const { frame, cable } = fixture();
  const r: any = validateAndSolve3D(modelStore.model as never, false, false);
  expect(r.elementForces.find((f: any) => f.elementId === cable)!.nStart).toBe(0);
  expect(r.elementForces.find((f: any) => f.elementId === frame)!.nStart).toBe(-10);
  console.log(JSON.stringify({ path: 'fixed automatic cable control', elementForces: r.elementForces }));
});
