import { afterEach, expect, it, vi } from 'vitest';
import { compressSnapshot, decompressSnapshot, loadFromShareLink, loadFromURLHash } from '../../../lib/utils/url-sharing';
import { modelStore } from '../../../lib/store/model.svelte';
import { uiStore } from '../../../lib/store/ui.svelte';
import { t } from '../../../lib/i18n';
import { solve, solveBuckling, solvePDelta, initSolver } from '../../../lib/engine/wasm-solver';
import { restrainedComponents } from '../../../lib/engine/force-method/primary';
import { editorUrl } from '../share';
import { buildModel, EXAMPLE, TOOL_IDS, workedExamples } from '../calculators';

afterEach(() => modelStore.clear());
for (const id of TOOL_IDS) it(`imports ${id} into the editor with the same forces and displacements`, async () => {
  await initSolver();
  for (const p of workedExamples(id)) {
    const original = buildModel(id, { ...p, e: EXAMPLE.e / 2 });
    const snapshot = decompressSnapshot(editorUrl(original, id).split('#data=')[1]);
    expect(snapshot).not.toBeNull();
    modelStore.restore(snapshot!);
    const imported = modelStore.buildSolverInput(false)!;
    expect(imported).not.toBeNull();
    expect([...imported.materials.values()][0].e).toBe(EXAMPLE.e / 2);
    const a = solve(original), b = solve(imported);
    expect(b.displacements).toEqual(a.displacements);
    expect(b.reactions).toEqual(a.reactions);
    if (id === 'column-buckling') expect(solveBuckling(imported, 1).modes[0].loadFactor).toBe(solveBuckling(original, 1).modes[0].loadFactor);
  }
});

import { BATCH_IDS, batchModel, DEFAULT_BATCH } from '../batch';
import { solveModal } from '../../../lib/engine/wasm-solver';
for (const id of BATCH_IDS) it(`imports ${id} preserving member type, loads, supports and mass`, async () => {
  await initSolver();
  const original = batchModel(id, DEFAULT_BATCH);
  const options = id === 'beam-natural-frequency' ? { massPerLength: DEFAULT_BATCH.mass } : undefined;
  const snapshot = decompressSnapshot(editorUrl(original, id, options).split('#data=')[1]);
  modelStore.restore(snapshot!);
  const imported = modelStore.buildSolverInput(false)!;
  expect([...imported.elements.values()].map(e => e.type)).toEqual([...original.elements.values()].map(e => e.type));
  expect(solve(imported).displacements).toEqual(solve(original).displacements);
  expect(solve(imported).reactions).toEqual(solve(original).reactions);
  if (options) {
    const material = [...modelStore.materials.values()][0];
    const density = material.rho! * 1000 / 9.81;
    expect(density * DEFAULT_BATCH.area).toBeCloseTo(DEFAULT_BATCH.mass, 10);
    expect(solveModal(imported, new Map([[1, density]]), 3).modes.map((m: any) => m.frequency)).toEqual(solveModal(original, new Map([[1, DEFAULT_BATCH.mass / DEFAULT_BATCH.area]]), 3).modes.map((m: any) => m.frequency));
  }
});


it('preserves an explicitly requested E2E gate across the shared-model handoff', () => {
  try {
    const model = batchModel('continuous-beam', DEFAULT_BATCH);
    vi.stubGlobal('location', { search: '?e2e=1' });
    expect(editorUrl(model, 'beam')).toMatch(/^\/app\/basic\?e2e=1#data=2\./);
    vi.stubGlobal('location', { search: '' });
    expect(editorUrl(model, 'beam')).toMatch(/^\/app\/basic#data=2\./);
  } finally { vi.unstubAllGlobals(); }
});

import { calculateBatch } from '../batch-solve';

it('keeps a hostile tool name as inert text', () => {
  const name = '<img src=x onerror="alert(1)">';
  const snapshot = decompressSnapshot(editorUrl(batchModel('truss-2d', DEFAULT_BATCH), name).split('#data=')[1]);
  expect(snapshot!.name).toBe(name);
  modelStore.restore(snapshot!);
  expect(modelStore.model.name).toBe(name);
});

it('imports the calculated influence-line model with its critical axle', async () => {
  const result = await calculateBatch('influence-line', DEFAULT_BATCH);
  modelStore.restore(decompressSnapshot(editorUrl(result.model, 'influence').split('#data=')[1])!);
  const imported = modelStore.buildSolverInput(false)!;
  expect(imported.loads).toHaveLength(1);
  expect(solve(imported).reactions).toEqual(result.linear.reactions);
});

it('#2588 opens the column tool’s guided support', () => {
  const p = workedExamples('column-buckling').find(example => example.k === 0.5)!;
  const original = buildModel('column-buckling', p);
  const snapshot = decompressSnapshot(editorUrl(original, 'column-buckling').split('#data=')[1])!;
  modelStore.restore(snapshot);
  const imported = modelStore.buildSolverInput(false)!;
  const guided = [...imported.supports.values()].find(support => support.type === 'guidedX')!;
  expect(guided).toBeDefined();
  expect(restrainedComponents(guided)).toEqual([false, true, true]);
  expect(modelStore.buildSolverInput3D()!.supports.get(guided.nodeId)).toMatchObject({
    rx: false, ry: true, rz: true, rrx: true, rry: true, rrz: true,
  });
  expect(solve(imported).displacements).toEqual(solve(original).displacements);
});

const shareEntries = ['paste', 'data', 'embed'] as const;

function openToolLink(entry: typeof shareEntries[number], payload: string) {
  const hash = `#${entry === 'embed' ? 'embed' : 'data'}=${payload}`;
  try {
    vi.stubGlobal('location', { hash, pathname: '/app/basic', search: '' });
    vi.stubGlobal('history', { replaceState: vi.fn() });
    vi.stubGlobal('window', { dispatchEvent: vi.fn() });
    vi.stubGlobal('queueMicrotask', (callback: () => void) => callback());
    if (entry === 'paste') expect(loadFromShareLink(hash)).toBe(true);
    else expect(loadFromURLHash()).toBe(entry);
  } finally {
    vi.unstubAllGlobals();
  }
}

it.each(shareEntries)('known wrong result: #2588 — %s restores the calculator’s XY plane', async entry => {
  await initSolver();
  const original = buildModel('column-buckling', { ...EXAMPLE, k: 0.5 });
  const payload = editorUrl(original, 'column-buckling').split('#data=')[1];
  uiStore.drawPlane2D = 'xz';
  openToolLink(entry, payload);
  expect(uiStore.drawPlane2D).toBe('xy');
  expect(uiStore.analysisPlane2D).toBe('xy');

  const imported = modelStore.buildSolverInput(false)!;
  const linear = solve(original);
  const importedLinear = solve(imported);
  expect(importedLinear.displacements).toEqual(linear.displacements);
  expect(importedLinear.reactions).toEqual(linear.reactions);
  const nonlinear = solvePDelta(original).results;
  const importedNonlinear = solvePDelta(imported).results;
  expect(importedNonlinear.displacements).toEqual(nonlinear.displacements);
  expect(importedNonlinear.reactions).toEqual(nonlinear.reactions);
});

it.each(shareEntries)('%s still asks for the drawing plane of an unstamped guided column', async entry => {
  await initSolver();
  const original = buildModel('column-buckling', { ...EXAMPLE, k: 0.5 });
  const payload = editorUrl(original, 'column-buckling').split('#data=')[1];
  const snapshot = decompressSnapshot(payload)!;
  uiStore.drawPlane2D = 'xz';
  openToolLink(entry, compressSnapshot({ ...snapshot, drawPlane2D: undefined }));
  expect(uiStore.analysisPlane2D).toBeUndefined();
  expect(modelStore.solve()).toBe(t('svc.savedPlaneRequired'));
  expect(await modelStore.solveAsync()).toBe(t('svc.savedPlaneRequired'));
  expect(modelStore.solveCombinations()).toBe(t('svc.savedPlaneRequired'));
  expect(() => modelStore.buildSolverInput()).toThrow(t('svc.savedPlaneRequired'));

  uiStore.drawPlane2D = 'xy';
  const linear = solve(original);
  const selected = solve(modelStore.buildSolverInput(false)!);
  expect(selected.displacements).toEqual(linear.displacements);
  expect(selected.reactions).toEqual(linear.reactions);
});
