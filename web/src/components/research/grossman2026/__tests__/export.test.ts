import { afterEach, expect, it, vi } from 'vitest';
import { t } from '../../../../lib/i18n';
import { initSolver, solvePDelta } from '../../../../lib/engine/wasm-solver';
import { modelStore } from '../../../../lib/store/model.svelte';
import { uiStore } from '../../../../lib/store/ui.svelte';
import { compressSnapshot, decompressSnapshot, loadFromShareLink, loadFromURLHash, parseShareURL } from '../../../../lib/utils/url-sharing';
import { embeddedEditorUrl, fullEditorUrl, stripCompact, stripLabel } from '../open-in-stabileo';
import type { StripResult } from '../springs';

it('rejects prestress in both editor paths before encoding', async () => {
  const strip = { prestress_force: [0.1] } as StripResult;
  const label = { family: 'square', eta: 0, keep: 1, seed: 0, strain: 0.01 };
  expect(() => stripCompact(strip, 'prestressed')).toThrow('prestress');
  await expect(embeddedEditorUrl(strip, label)).rejects.toThrow('prestress');
  await expect(fullEditorUrl(strip, label)).rejects.toThrow('prestress');
});

it('keeps small strains and exact seeds in the saved label', () => {
  const text = stripLabel({ family: 'foam', eta: 0.25, keep: 0.875, seed: 12345678, strain: 0.0001 });
  expect(text).toContain('0.0001');
  expect(text).toContain('12,345,678');
  expect(text).toContain('0.875');
});


const strain = 0.01;
const settledStrip: StripResult = {
  nodes: [[0, 0], [0, 1], [1, 0]],
  bonds: [[0, 1], [0, 2], [1, 2]],
  held: [true, true, false],
  prescribed: [[0, 0], [0, strain], [0, 0]],
  displacement: [[0, 0], [0, strain], [0, strain]],
  force: [strain, 0, 0],
  prestress_force: [0, 0, 0],
  stiffness: [1, 1, 1],
  rest: [1, 1, Math.SQRT2],
  coordination: 2,
  gauge: [1, 1],
  poisson: null,
  relaxation: null,
};
const label = { family: 'square', eta: 0, keep: 1, seed: 0, strain };

afterEach(() => {
  vi.unstubAllGlobals();
  modelStore.clear();
  uiStore.drawPlane2D = 'xy';
});

it.skip.each([
  { mode: 'embed', open: 'hash', url: embeddedEditorUrl },
  { mode: 'data', open: 'hash', url: fullEditorUrl },
  { mode: 'embed', open: 'paste', url: embeddedEditorUrl },
  { mode: 'data', open: 'paste', url: fullEditorUrl },
])('known wrong result: #2588 — $mode via $open restores the spring strip in XY', async ({ mode, open, url }) => {
  await initSolver();
  const link = await url(settledStrip, label);
  uiStore.drawPlane2D = 'xz';
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
  vi.stubGlobal('queueMicrotask', (callback: () => void) => callback());
  if (open === 'hash') {
    vi.stubGlobal('location', { hash: link.slice(link.indexOf('#')), pathname: '/app/basic', search: '' });
    vi.stubGlobal('history', { replaceState: vi.fn() });
    expect(loadFromURLHash()).toBe(mode);
  } else {
    expect(loadFromShareLink(link)).toBe(true);
  }
  expect(uiStore.drawPlane2D).toBe('xy');
  expect(uiStore.analysisPlane2D).toBe('xy');

  const linear = modelStore.solve();
  const worker = await modelStore.solveAsync();
  const combined = modelStore.solveCombinations();
  const nonlinear = solvePDelta(modelStore.buildSolverInput()!);
  expect(linear).toMatchObject({ elementForces: expect.any(Array) });
  if (typeof linear !== 'object' || !linear) throw new Error(String(linear));
  for (const member of linear.elementForces) {
    expect(member.nStart / 1000).toBeCloseTo(settledStrip.force[member.elementId - 1]!, 10);
  }
  expect(linear.elementForces).toHaveLength(settledStrip.bonds.length);
  expect(worker).toMatchObject({ elementForces: linear.elementForces });
  expect(combined).toMatchObject({ perCase: expect.any(Map) });
  expect(nonlinear.converged).toBe(true);
  expect(nonlinear.results.elementForces.find(member => member.elementId === 1)?.nStart).toBe(linear.elementForces.find(member => member.elementId === 1)?.nStart);
});

it('asks for the plane of an unstamped spring strip with a transverse settlement', async () => {
  const link = await fullEditorUrl(settledStrip, label);
  const snapshot = decompressSnapshot(parseShareURL(link)!.compressed)!;
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
  vi.stubGlobal('queueMicrotask', (callback: () => void) => callback());
  expect(loadFromShareLink('#data=' + compressSnapshot({ ...snapshot, drawPlane2D: undefined }))).toBe(true);
  expect(uiStore.analysisPlane2D).toBeUndefined();
  expect(modelStore.solve()).toBe(t('svc.savedPlaneRequired'));
  expect(await modelStore.solveAsync()).toBe(t('svc.savedPlaneRequired'));
  expect(modelStore.solveCombinations()).toBe(t('svc.savedPlaneRequired'));
  expect(() => modelStore.buildSolverInput()).toThrow(t('svc.savedPlaneRequired'));
});
