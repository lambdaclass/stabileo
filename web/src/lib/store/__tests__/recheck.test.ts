import { describe, it, expect, beforeEach, vi } from 'vitest';
import { recheckStore, createRecheckStore } from '../recheck.svelte';
import { RESULTS_VERSION } from '../../provenance/registry';
import { resultsStore } from '../results.svelte';
import '../index';

const STEEL = { id: 1, name: 'F-24', e: 200000, nu: 0.3, rho: 78.5, fy: 235 };
const steelTruss = () => ({
  analysisMode: 'pro',
  materials: [[1, STEEL]],
  elements: [[1, { id: 1, type: 'truss', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, releaseI: {}, releaseJ: {} }]],
  supports: [[1, { nodeId: 1, type: 'pinned3d' }]],
  loads: [],
  loadCases: [{ id: 1, type: 'D' }],
}) as never;

describe('recheckStore', () => {
  beforeEach(() => recheckStore.reset());

  it('a new project belongs to this build: no notice, nothing stale', async () => {
    expect(recheckStore.noticeOpen).toBe(false);
    expect(recheckStore.stale).toBe(false);
    expect(recheckStore.capture()?.resultsVersion).toBe(RESULTS_VERSION);
  });

  it('an unstamped project opens with the notice; acknowledging leaves it stale until solved', async () => {
    recheckStore.openProject(steelTruss(), 'pro');
    await vi.waitFor(() => expect(recheckStore.pending).toBe(false));
    expect(recheckStore.noticeOpen).toBe(true);
    expect(recheckStore.stale).toBe(true);
    expect(recheckStore.assessment?.changes.some((c) => c.id === 'cirsoc301-tension-needs-connection')).toBe(true);

    recheckStore.acknowledge();
    expect(recheckStore.noticeOpen).toBe(false);
    expect(recheckStore.stale).toBe(true);

    recheckStore.noteSolved('linear');
    expect(recheckStore.stale).toBe(false);
    const stamp = recheckStore.capture()!;
    expect(stamp.resultsVersion).toBe(RESULTS_VERSION);
    expect(stamp.analyses).toEqual(['linear']);
  });

  it('keeps the notice up when live calc re-solves before it was read', async () => {
    recheckStore.openProject(steelTruss(), 'pro');
    await vi.waitFor(() => expect(recheckStore.pending).toBe(false));
    recheckStore.noteSolved('linear');
    expect(recheckStore.stale).toBe(false);
    expect(recheckStore.noticeOpen).toBe(true);
  });

  it('carries one identity between tabs: reopening the captured snapshot after acknowledging does not ask again', async () => {
    recheckStore.openProject(steelTruss(), 'pro');
    await vi.waitFor(() => expect(recheckStore.pending).toBe(false));
    recheckStore.acknowledge();
    const carried = { ...(steelTruss() as object), solvedWith: recheckStore.capture() };
    recheckStore.reset();
    recheckStore.openProject(carried as never, 'pro');
    await vi.waitFor(() => expect(recheckStore.pending).toBe(false));
    expect(recheckStore.noticeOpen).toBe(false);
    expect(recheckStore.stale).toBe(true);
  });

  it('a project stamped with this version opens silently', async () => {
    recheckStore.noteSolved('modal');
    const snap = { ...(steelTruss() as object), solvedWith: recheckStore.capture() };
    recheckStore.openProject(snap as never, 'pro');
    await vi.waitFor(() => expect(recheckStore.pending).toBe(false));
    expect(recheckStore.noticeOpen).toBe(false);
    expect(recheckStore.stale).toBe(false);
  });

  it('a malformed stamp reads as none (the conservative reading)', async () => {
    recheckStore.openProject({ ...(steelTruss() as object), solvedWith: { resultsVersion: 'x' } } as never, 'pro');
    await vi.waitFor(() => expect(recheckStore.pending).toBe(false));
    expect(recheckStore.noticeOpen).toBe(true);
  });
});

describe('what ends the stale state', () => {
  beforeEach(() => recheckStore.reset());

  it('a modal run alone does not: the static results are still the older version\'s', async () => {
    recheckStore.openProject(steelTruss(), 'pro');
    await vi.waitFor(() => expect(recheckStore.pending).toBe(false));
    recheckStore.noteSolved('modal');
    expect(recheckStore.stale).toBe(true);
    recheckStore.noteSolved('linear');
    expect(recheckStore.stale).toBe(false);
  });

  it('a P-Δ run with no second-order equilibrium does not', async () => {
    recheckStore.openProject(steelTruss(), 'pro');
    await vi.waitFor(() => expect(recheckStore.pending).toBe(false));
    const unconverged = { converged: false, isStable: false, iterations: 50, b2Factor: Infinity, results: { displacements: [], reactions: [], elementForces: [] } };
    resultsStore.setPDeltaWithoutEquilibrium(unconverged as never, true);
    expect(recheckStore.stale).toBe(true);
    expect(recheckStore.capture()?.analyses).toEqual([]);
  });
});

describe('lazy assessment', () => {
  it('does not load history for current or newer projects', () => {
    const load = vi.fn(() => import('../../provenance/applicability'));
    const store = createRecheckStore(load);
    store.openProject({ solvedWith: store.capture() });
    expect(load).not.toHaveBeenCalled();
    expect(store.noticeOpen).toBe(false);
    store.openProject({ solvedWith: { ...store.capture(), resultsVersion: RESULTS_VERSION + 1 } });
    expect(load).not.toHaveBeenCalled();
    expect(store.solvedWithNewer).toBe(true);
  });

  it('keeps failed loads pending and retries without losing the notice after a solve', async () => {
    const load = vi.fn(() => import('../../provenance/applicability'));
    load.mockRejectedValueOnce(new Error('offline'));
    const store = createRecheckStore(load);
    store.openProject(steelTruss(), 'pro');
    store.acknowledge();
    expect(store.noticeOpen).toBe(true);
    expect(store.stale).toBe(true);
    await vi.waitFor(() => expect(store.loadFailed).toBe(true));
    store.noteSolved('linear');
    await store.retry();
    expect(store.pending).toBe(false);
    expect(store.noticeOpen).toBe(true);
    expect(store.stale).toBe(false);
  });

  it.each(['reset', 'switch'])('ignores a delayed assessment after %s', async action => {
    const module = await import('../../provenance/applicability');
    let finish!: (value: typeof module) => void;
    const store = createRecheckStore(() => new Promise(resolve => { finish = resolve; }));
    const current = store.capture();
    store.openProject(steelTruss(), 'pro');
    if (action === 'reset') store.reset();
    else store.openProject({ solvedWith: current });
    finish(module);
    await Promise.resolve();
    expect(store.pending).toBe(false);
    expect(store.noticeOpen).toBe(false);
    expect(store.assessment?.changes ?? []).toEqual([]);
  });

  it('assesses the opening snapshot even if the caller mutates it while loading', async () => {
    const module = await import('../../provenance/applicability');
    let finish!: (value: typeof module) => void;
    const store = createRecheckStore(() => new Promise(resolve => { finish = resolve; }));
    const snapshot = { ...steelTruss() as object } as { elements: unknown[] };
    store.openProject(snapshot as never, 'pro');
    snapshot.elements = [];
    finish(module);
    await vi.waitFor(() => expect(store.pending).toBe(false));
    expect(store.assessment?.changes.some(c => c.id === 'cirsoc301-tension-needs-connection')).toBe(true);
  });
});

it('preserves original changes after failed download, automatic solve and save/reload in Basic', async () => {
  const store = createRecheckStore(() => Promise.reject(new Error('offline')));
  const old = { ...steelTruss() as object, analysisMode: '2d' };
  store.openProject(old, '2d');
  const original = store.captureNotice();
  expect(original).toBeDefined();
  await vi.waitFor(() => expect(store.loadFailed).toBe(true));
  store.noteSolved('linear');
  store.acknowledge();
  const saved = JSON.stringify({ ...old, solvedWith: store.capture(), pendingRecheckNotice: store.captureNotice() });
  const restored = createRecheckStore();
  restored.openProject(JSON.parse(saved), '2d');
  expect(restored.noticeOpen).toBe(true);
  expect(restored.capture()?.resultsVersion).toBe(RESULTS_VERSION);
  await vi.waitFor(() => expect(restored.pending).toBe(false));
  expect(restored.assessment?.solvedVersion).toBe(0);
  expect(restored.assessment?.changes.map(c => c.id)).toContain('cirsoc301-tension-needs-connection');
  expect(restored.captureNotice()).toEqual(original);
  expect(restored.noticeOpen).toBe(true);
  restored.acknowledge();
  expect(restored.captureNotice()).toBeUndefined();
  expect(restored.noticeOpen).toBe(false);
});
