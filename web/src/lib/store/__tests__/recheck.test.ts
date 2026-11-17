import { describe, it, expect, beforeEach, vi } from 'vitest';
import { recheckStore, createRecheckStore } from '../recheck.svelte';
import { RESULTS_VERSION } from '../../provenance/registry';
import { RESULT_CHANGES, RESULT_CHANGES as CURRENT_RESULT_CHANGES } from '../../provenance/full-registry';
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

  it('keeps telling a project solved in this build that its loads came from an older generator, until they are generated again', async () => {
    const chronology = ['gravity-physical-regions', 'gravity-member-loading', 'gravity-torque-projection-and-carriers', 'gravity-stations-and-edits', 'snow-panel-geometry', 'gravity-density-extrema', 'gravity-moment-support', 'concentrated-live-actions', 'gravity-profile-cancellation-residuals', 'gravity-profile-intensity-limit'];
    const headroomVersion = RESULT_CHANGES.changes.find(c => c.id === 'generated-area-loads-headroom')!.resultsVersion;
    const historicalRegistry = { ...RESULT_CHANGES, changes: RESULT_CHANGES.changes.map(c => chronology.includes(c.id) ? { ...c, resultsVersion: headroomVersion + 1 + chronology.indexOf(c.id) } : c) };
    const recheckStore = createRecheckStore(async () => {
      const module = await import('../../provenance/applicability');
      return { ...module, assessProject: (...args: Parameters<typeof module.assessProject>) => module.assessProject(args[0], args[1], args[2], historicalRegistry, args[4], args[5]) };
    });
    const generated = (resultsVersion?: number) => ({
      ...(steelTruss() as object),
      loads: [{ type: 'distributed3d', data: { caseId: 1, generatedBy: 'cirsoc-101' } }],
      designData: { loadBasis: resultsVersion === undefined ? {} : { resultsVersion } },
      solvedWith: { ...recheckStore.capture()!, analyses: ['linear'] },
    }) as never;
    recheckStore.openProject(generated(), 'pro');
    await vi.waitFor(() => expect(recheckStore.pending).toBe(false));
    expect(recheckStore.noticeOpen).toBe(true);
    expect(recheckStore.assessment?.changes.map((c) => c.id)).toContain('generated-area-loads-headroom');
    recheckStore.acknowledge();
    recheckStore.noteSolved('linear');
    const solved = { ...(generated() as object), solvedWith: recheckStore.capture() };
    recheckStore.reset();
    recheckStore.openProject(solved as never, 'pro');
    await vi.waitFor(() => expect(recheckStore.pending).toBe(false));
    expect(recheckStore.noticeOpen).toBe(true);
    expect(recheckStore.assessment?.changes.map((c) => c.id)).toEqual(['generated-area-loads-headroom', 'gravity-physical-regions', 'gravity-member-loading', 'gravity-torque-projection-and-carriers', 'gravity-stations-and-edits', 'snow-panel-geometry', 'gravity-density-extrema', 'gravity-moment-support', 'concentrated-live-actions', 'gravity-profile-cancellation-residuals', 'gravity-profile-intensity-limit']);
    recheckStore.reset();
    recheckStore.openProject({ ...solved, designData: { loadBasis: { resultsVersion: RESULTS_VERSION } } } as never, 'pro');
    await vi.waitFor(() => expect(recheckStore.pending).toBe(false));
    expect(recheckStore.noticeOpen).toBe(false);
    recheckStore.reset();
    const headroom = RESULT_CHANGES.changes.find((c) => c.id === 'generated-area-loads-headroom')!.resultsVersion;
    recheckStore.openProject(generated(headroom - 1), 'pro');
    await vi.waitFor(() => expect(recheckStore.pending).toBe(false));
    expect(recheckStore.assessment?.changes.map((c) => c.id)).toContain('generated-area-loads-headroom');
    recheckStore.reset();
    recheckStore.openProject(generated(headroom), 'pro');
    await vi.waitFor(() => expect(recheckStore.pending).toBe(false));
    expect(recheckStore.noticeOpen).toBe(true);
    expect(recheckStore.assessment?.changes.map(c => c.id)).toEqual(['gravity-physical-regions', 'gravity-member-loading', 'gravity-torque-projection-and-carriers', 'gravity-stations-and-edits', 'snow-panel-geometry', 'gravity-density-extrema', 'gravity-moment-support', 'concentrated-live-actions', 'gravity-profile-cancellation-residuals', 'gravity-profile-intensity-limit']);
    recheckStore.reset();
    const previousGravity = historicalRegistry.changes.find(c => c.id === 'gravity-torque-projection-and-carriers')!.resultsVersion;
    recheckStore.openProject(generated(previousGravity), 'pro');
    await vi.waitFor(() => expect(recheckStore.pending).toBe(false));
    expect(recheckStore.noticeOpen).toBe(true);
    expect(recheckStore.assessment?.changes.map(c => c.id)).toEqual(['gravity-stations-and-edits', 'snow-panel-geometry', 'gravity-density-extrema', 'gravity-moment-support', 'concentrated-live-actions', 'gravity-profile-cancellation-residuals', 'gravity-profile-intensity-limit']);
    recheckStore.reset();
    const gravity = historicalRegistry.changes.find(c => c.id === 'gravity-stations-and-edits')!.resultsVersion;
    recheckStore.openProject(generated(gravity), 'pro');
    await vi.waitFor(() => expect(recheckStore.pending).toBe(false));
    expect(recheckStore.assessment?.changes.map(c => c.id)).toEqual(['snow-panel-geometry', 'gravity-density-extrema', 'gravity-moment-support', 'concentrated-live-actions', 'gravity-profile-cancellation-residuals', 'gravity-profile-intensity-limit']);
    expect(recheckStore.noticeOpen).toBe(true);
    recheckStore.reset();
    const { designData: _basis, ...unstamped } = generated() as unknown as Record<string, unknown>;
    recheckStore.openProject(unstamped as never, 'pro');
    await vi.waitFor(() => expect(recheckStore.pending).toBe(false));
    expect(recheckStore.assessment?.changes.map((c) => c.id)).toContain('generated-area-loads-headroom');
  });

  it('keeps the exact gravity notices when the branch changes land in one results version', async () => {
    const ids = ['concentrated-live-actions', 'gravity-density-extrema', 'gravity-member-loading', 'gravity-moment-support', 'gravity-physical-regions', 'gravity-stations-and-edits', 'gravity-torque-projection-and-carriers', 'gravity-profile-cancellation-residuals', 'gravity-profile-intensity-limit'];
    const shared = RESULTS_VERSION;
    const registry = { ...RESULT_CHANGES, changes: RESULT_CHANGES.changes.map(c => ids.includes(c.id) ? { ...c, resultsVersion: shared } : c) };
    const store = createRecheckStore(async () => {
      const module = await import('../../provenance/applicability');
      return { ...module, assessProject: (...args: Parameters<typeof module.assessProject>) => module.assessProject(args[0], args[1], args[2], registry, args[4], args[5]) };
    });
    const project = { ...(steelTruss() as object), loads: [{ type: 'distributed3d', data: { caseId: 1, generatedBy: 'cirsoc-101' } }], designData: { loadBasis: { resultsVersion: shared - 1 } }, solvedWith: store.capture() };
    store.openProject(project as never, 'pro');
    await vi.waitFor(() => expect(store.pending).toBe(false));
    expect(store.assessment?.changes.map(c => c.id)).toEqual(ids);
    store.noteSolved('linear');
    store.openProject({ ...project, solvedWith: store.capture() } as never, 'pro');
    await vi.waitFor(() => expect(store.pending).toBe(false));
    expect(store.assessment?.changes.map(c => c.id)).toEqual(ids);
    store.openProject({ ...project, designData: { loadBasis: { resultsVersion: shared } }, solvedWith: store.capture() } as never, 'pro');
    await vi.waitFor(() => expect(store.pending).toBe(false));
    expect(store.assessment?.changes.map(c => c.id)).toEqual([]);
  });

  it.each(['2d', '3d', 'pro'])('#2144 keeps the exact snow regeneration notices after re-solving in %s', async mode => {
    const snapshot = {
      analysisMode: mode,
      loadCases: [{ id: 1, type: 'S' }],
      loads: [{ type: 'distributed', data: { caseId: 1, generatedBy: 'load-plan' } }],
      designData: { loadBasis: { resultsVersion: 0 } },
      solvedWith: recheckStore.capture(),
    };
    const expected = [
      'snow-combination-provenance', 'snow-combination-validation', 'snow-companion-basis', 'snow-pair-coverage',
      'concentrated-live-actions', 'generated-area-loads-headroom', 'gravity-density-extrema', 'gravity-member-loading', 'gravity-moment-support', 'gravity-physical-regions', 'gravity-profile-cancellation-residuals', 'gravity-profile-intensity-limit', 'gravity-stations-and-edits', 'gravity-torque-projection-and-carriers', 'snow-crossing-profile', 'snow-drift-coverage', 'snow-fallback-runs',
      'snow-flat-frame', 'snow-local-boundaries', 'snow-member-loading', 'snow-orientation-factors', 'snow-panel-geometry', 'snow-quadratic-intensity',
      'snow-ridge-mesh', 'snow-ridge-orientations', 'snow-roof-connectivity',
      'snow-roof-rotation', 'snow-roof-step', 'snow-selected-subsets', 'snow-surface-regions', 'snow-surface-support',
    ].sort();
    recheckStore.openProject(snapshot, mode);
    await vi.waitFor(() => expect(recheckStore.pending).toBe(false));
    expect(recheckStore.assessment?.changes.map(c => c.id).sort()).toEqual(expected);
    recheckStore.acknowledge();
    for (const analysis of ['linear', 'pdelta', 'plastic'] as const) {
      recheckStore.noteSolved(analysis);
      const saved = { ...snapshot, solvedWith: recheckStore.capture() };
      recheckStore.reset();
      recheckStore.openProject(saved, mode);
      await vi.waitFor(() => expect(recheckStore.pending).toBe(false));
      expect(recheckStore.assessment?.changes.map(c => c.id).sort()).toEqual(expected);
      expect(recheckStore.noticeOpen).toBe(true);
    }
    recheckStore.reset();
    recheckStore.openProject({ ...snapshot, designData: { loadBasis: { resultsVersion: RESULTS_VERSION } } }, mode);
    await vi.waitFor(() => expect(recheckStore.pending).toBe(false));
    expect(recheckStore.assessment?.changes.map(c => c.id)).toEqual([]);
    expect(recheckStore.noticeOpen).toBe(false);
  });

  it.each(['2d', '3d', 'pro'])('keeps the exact wind regeneration notices after re-solving in %s', async mode => {
    for (const type of ['W', 'Wa']) {
      const snapshot = { analysisMode: mode, loadCases: [{ id: 1, type }], loads: [{ type: 'distributed', data: { caseId: 1, generatedBy: 'load-plan' } }], designData: { loadBasis: { resultsVersion: 0 } }, solvedWith: recheckStore.capture() };
      const expected = ['concentrated-live-actions', 'generated-area-loads-headroom', 'gravity-density-extrema', 'gravity-member-loading', 'gravity-moment-support', 'gravity-physical-regions', 'gravity-profile-cancellation-residuals', 'gravity-profile-intensity-limit', 'gravity-stations-and-edits', 'gravity-torque-projection-and-carriers', 'snow-panel-geometry', 'wind-apex-torque', 'wind-band-width-and-shares', 'wind-carriers-and-continuous-width', 'wind-member-pressure-transfer', 'wind-physical-apex', 'wind-physical-pressure-field', 'wind-plan-couple-and-sign-face', 'wind-pressure-work-moments', 'wind-triangular-and-sign-minimum', 'wind-triangular-centroid'];
      recheckStore.openProject(snapshot, mode);
      await vi.waitFor(() => expect(recheckStore.pending).toBe(false));
      expect(recheckStore.assessment?.changes.map(c => c.id).sort()).toEqual(expected);
      recheckStore.acknowledge();
      for (const analysis of ['linear', 'pdelta', 'plastic'] as const) {
        recheckStore.noteSolved(analysis);
        const saved = { ...snapshot, solvedWith: recheckStore.capture() };
        recheckStore.reset();
        recheckStore.openProject(saved, mode);
        await vi.waitFor(() => expect(recheckStore.pending).toBe(false));
        expect(recheckStore.assessment?.changes.map(c => c.id).sort()).toEqual(expected);
        expect(recheckStore.noticeOpen).toBe(true);
      }
      recheckStore.reset();
      recheckStore.openProject({ ...snapshot, designData: { loadBasis: { resultsVersion: RESULTS_VERSION } } }, mode);
      await vi.waitFor(() => expect(recheckStore.pending).toBe(false));
      expect(recheckStore.assessment?.changes.map(c => c.id)).toEqual([]);
      expect(recheckStore.noticeOpen).toBe(false);
    }
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
  it('uses the latest solve for the newer-build warning despite an old unread notice', async () => {
    const store = createRecheckStore();
    const stamp = store.capture()!;
    store.openProject({
      ...steelTruss() as object,
      solvedWith: { ...stamp, id: 'newer-solve', resultsVersion: RESULTS_VERSION + 1, analyses: ['linear'] },
      pendingRecheckNotice: {
        stamp: { ...stamp, id: 'old-unread-notice', resultsVersion: 0 },
        features: ['steelCirsoc301', 'steelTensionWithoutConnection'],
      },
    }, 'pro');
    expect(store.pending).toBe(true);
    expect(store.solvedWithNewer).toBe(true);
    await vi.waitFor(() => expect(store.pending).toBe(false));
    expect(store.assessment?.newer).toBe(true);
    expect(store.noticeOpen).toBe(true);
    expect(store.solvedWithNewer).toBe(true);
    store.acknowledge();
    expect(store.noticeOpen).toBe(false);
    expect(store.solvedWithNewer).toBe(true);
    store.noteSolved('linear');
    expect(store.solvedWithNewer).toBe(false);
  });

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


describe('edited projects with older provenance', () => {
  const frame = () => ({
    analysisMode: 'pro',
    materials: [[1, STEEL]],
    elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1 }]],
  }) as import('../../provenance/model-features').FeatureSnapshot;
  const oldStamp = () => {
    const { recorded: _recorded, ...stamp } = createRecheckStore().capture()!;
    return { ...stamp, resultsVersion: 4, analyses: ['linear' as const] };
  };

  it.each(['delayed', 'rejected'] as const)('keeps distinct opening results stale during %s loading', async loading => {
    const module = await import('../../provenance/applicability');
    let finish!: (value: typeof module) => void;
    const store = createRecheckStore(() => loading === 'rejected'
      ? Promise.reject(new Error('offline'))
      : new Promise(resolve => { finish = resolve; }));
    store.openProject({
      ...frame(), solidShells: [[1, {}]], solvedWith: { ...oldStamp(), id: 'opening-solve' },
      pendingRecheckNotice: { stamp: { ...oldStamp(), id: 'unread-notice', resultsVersion: 0 }, features: ['frameMembers'] },
    }, 'pro');
    expect(store.pending).toBe(true);
    expect(store.stale).toBe(true);
    if (loading === 'rejected') {
      await vi.waitFor(() => expect(store.loadFailed).toBe(true));
      expect(store.stale).toBe(true);
    } else {
      finish(module);
      await vi.waitFor(() => expect(store.pending).toBe(false));
      expect(store.stale).toBe(true);
    }
    store.noteSolved('linear');
    expect(store.stale).toBe(false);
    expect(store.noticeOpen).toBe(true);
  });

  it('retains new shells after rejected loading, automatic solve and save/reload', async () => {
    const store = createRecheckStore(() => Promise.reject(new Error('offline')));
    const snapshot: import('../../provenance/model-features').FeatureSnapshot = { ...frame(), solidShells: [[1, {}]] };
    const original = { ...oldStamp(), id: 'unread-notice', resultsVersion: 0 };
    store.openProject({
      ...snapshot, solvedWith: { ...oldStamp(), id: 'opening-solve' },
      pendingRecheckNotice: { stamp: original, features: ['steelCirsoc301', 'steelTensionWithoutConnection'] },
    }, 'pro');
    expect(store.captureNotice()?.features).toContain('shells');
    await vi.waitFor(() => expect(store.loadFailed).toBe(true));
    store.noteSolved('linear');
    store.acknowledge(); // A failed load cannot acknowledge unread changes.
    const saved = JSON.stringify({ ...snapshot, solvedWith: store.capture(), pendingRecheckNotice: store.captureNotice() });
    const restored = createRecheckStore();
    restored.openProject(JSON.parse(saved), 'pro');
    expect(restored.stale).toBe(false);
    await vi.waitFor(() => expect(restored.pending).toBe(false));
    expect(restored.assessment?.changes.map(c => c.id)).toEqual(expect.arrayContaining([
      'solid-shell-local-stress-axes', 'cirsoc301-tension-needs-connection',
    ]));
    expect(restored.captureNotice()?.stamp).toEqual(original);
    expect(restored.noticeOpen).toBe(true);
    restored.acknowledge();
    expect(restored.captureNotice()).toBeUndefined();
  });

  it('a saved project without a linear result opens without the linear stability notice', async () => {
    const store = createRecheckStore();
    const stamp = store.capture()!;
    expect(stamp.analyses).toEqual([]);
    store.openProject({ ...frame(), solvedWith: stamp }, 'pro');
    await vi.waitFor(() => expect(store.pending).toBe(false));
    expect(store.assessment?.changes.map(c => c.id) ?? []).toEqual([]);
    expect(store.noticeOpen).toBe(false);
    expect(store.stale).toBe(false);
  });

  it('known wrong result: #1952: opening ordinary linear frames excludes staged path corrections', async () => {
    for (const analysisMode of ['2d', '3d', 'pro']) {
      const store = createRecheckStore();
      store.openProject({ ...frame(), analysisMode, solvedWith: { ...oldStamp(), resultsVersion: 30 } }, analysisMode);
      await vi.waitFor(() => expect(store.pending).toBe(false));
      expect(store.assessment?.changes.map(c => c.id)).not.toContain('staged-history-forces-unavailable');
      expect(store.noticeOpen).toBe(true);
      expect(store.stale).toBe(true);
    }
  });

  describe.each([false, true])('SSI notice registered: %s', (includeSSI) => {
    const RESULT_CHANGES = includeSSI ? CURRENT_RESULT_CHANGES : { ...CURRENT_RESULT_CHANGES, changes: CURRENT_RESULT_CHANGES.changes.filter(c => c.id !== 'ssi-support-reactions') };
  it('#2080 a frame solved before the containment diagnostics opens with exactly that notice and the ones after it', async () => {
    const module = await import('../../provenance/applicability');
    const precedingRegistry = {
      ...RESULT_CHANGES,
      changes: RESULT_CHANGES.changes.filter(c => c.id !== 'kinematic-translation-motion'),
    };
    const store = createRecheckStore(async () => ({
      ...module,
      assessProject: (...args: Parameters<typeof module.assessProject>) =>
        module.assessProject(args[0], args[1], args[2], precedingRegistry, args[4], args[5]),
    }));
    const combined = createRecheckStore();
    const snapshot: import('../../provenance/model-features').FeatureSnapshot & { solvedWith: unknown } = {
      ...frame(),
      materials: [[1, { id: 1, name: 'H30', e: 25000, fy: 30 }], [2, { ...STEEL, id: 2 }]],
      elements: [...frame().elements!, [2, { id: 2, type: 'frame', nodeI: 2, nodeJ: 3, materialId: 2 }]],
      solvedWith: { ...oldStamp(), resultsVersion: 30 },
    };
    store.openProject(snapshot, 'pro');
    combined.openProject(snapshot, 'pro');
    await vi.waitFor(() => expect(store.pending || combined.pending).toBe(false));
    if (includeSSI) {
    expect(combined.assessment?.changes.map(c => c.id).sort()).toEqual([
      ...store.assessment!.changes.map(c => c.id), 'kinematic-translation-motion',
    ].sort());
    } else {
    expect(combined.assessment?.changes.map(c => c.id).sort()).toEqual([
      ...store.assessment!.changes.map(c => c.id), 'kinematic-translation-motion', 'ssi-support-reactions',
    ].sort());
    }
    expect(combined.noticeOpen).toBe(true);
    expect(combined.stale).toBe(true);
    if (includeSSI) {
    expect(store.assessment?.changes.map(c => c.id).sort()).toEqual(['active-combination-completeness', 'complete-concurrent-demands', 'concurrent-check-demands', 'concurrent-depth-and-load-context', 'concurrent-design-demands', 'concurrent-secondary-slenderness', 'concurrent-torsion-reinforcement', 'fail-closed-ratios', 'fixed-reinforcement-practical-maximum', 'flange-spans-and-behaviour', 'gravity-governing-moment-extrema', 'harmonic-modal-or-direct-per-frequency', 'harmonic-modal-residual-checked', 'harmonic-omitted-modes', 'linear-pin-coupling', 'linear-second-order-warning', 'linear-small-displacement-warning', 'linear-span-rotation-warning', 'linear-stability-refusals', 'material-nonlinear-3d-orphan-dofs', 'member-diagram-reference-coordinates', 'member-recovery-round4', 'nonlinear-continuation-and-curve-reactions', 'nonlinear-equilibrium-arithmetic', 'nonlinear-physical-convergence', 'nonlinear-reference-and-initial-shaft-stiffness', 'nonlinear-supported-and-soil-equilibrium', 'plastic-3d-member-without-capacity-refused', 'provided-torsion-stirrups', 'safety-containment-diagnostics', 'shared-demand-completeness', 'shared-span-axis-and-torsion-provision', 'soft-rotation-not-orphan', 'span-check-shear-thermal', 'ssi-support-reactions', 'steel-cb-combination', 'steel-station-coordinates-and-shear', 'time-history-reaction-availability', 'time-history-withheld-reaction-estimates', 'torsion-secondary-shear']);
    } else {
    expect(store.assessment?.changes.map(c => c.id).sort()).toEqual(['active-combination-completeness', 'complete-concurrent-demands', 'concurrent-check-demands', 'concurrent-depth-and-load-context', 'concurrent-design-demands', 'concurrent-secondary-slenderness', 'concurrent-torsion-reinforcement', 'fail-closed-ratios', 'fixed-reinforcement-practical-maximum', 'flange-spans-and-behaviour', 'gravity-governing-moment-extrema', 'harmonic-modal-or-direct-per-frequency', 'harmonic-modal-residual-checked', 'harmonic-omitted-modes', 'linear-pin-coupling', 'linear-second-order-warning', 'linear-small-displacement-warning', 'linear-span-rotation-warning', 'linear-stability-refusals', 'material-nonlinear-3d-orphan-dofs', 'member-diagram-reference-coordinates', 'member-recovery-round4', 'nonlinear-continuation-and-curve-reactions', 'nonlinear-equilibrium-arithmetic', 'nonlinear-physical-convergence', 'nonlinear-reference-and-initial-shaft-stiffness', 'nonlinear-supported-and-soil-equilibrium', 'plastic-3d-member-without-capacity-refused', 'provided-torsion-stirrups', 'safety-containment-diagnostics', 'shared-demand-completeness', 'shared-span-axis-and-torsion-provision', 'soft-rotation-not-orphan', 'span-check-shear-thermal', 'steel-cb-combination', 'steel-station-coordinates-and-shear', 'time-history-reaction-availability', 'time-history-withheld-reaction-estimates', 'torsion-secondary-shear']);
    }
    expect(store.noticeOpen).toBe(true);
    expect(store.stale).toBe(true);
  });
  });

  const openingNoticeIds = (registry = RESULT_CHANGES) => [
    'modal-repeated-eigenspace-completeness', 'static-modal-runtime-self-checks',
    'safety-containment-diagnostics', 'harmonic-modal-residual-checked',
    'linear-small-displacement-warning', 'harmonic-modal-or-direct-per-frequency',
    'connector-arm-mechanism-3d-refused', 'harmonic-omitted-modes', 'linear-stability-refusals', 'linear-pin-coupling', 'nonlinear-equilibrium-arithmetic', 'nonlinear-physical-convergence', 'nonlinear-supported-and-soil-equilibrium', 'nonlinear-continuation-and-curve-reactions', 'nonlinear-reference-and-initial-shaft-stiffness',
    ...(registry.changes.some(c => c.id === 'ssi-support-reactions') ? ['ssi-support-reactions'] : []),
  ].map(id => registry.changes.find(c => c.id === id)!)
    .sort((a, b) => a.resultsVersion - b.resultsVersion || a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map(c => c.id);

  describe.each([false, true])('SSI notice registered: %s', (includeSSI) => {
    const RESULT_CHANGES = includeSSI ? CURRENT_RESULT_CHANGES : { ...CURRENT_RESULT_CHANGES, changes: CURRENT_RESULT_CHANGES.changes.filter(c => c.id !== 'ssi-support-reactions') };
  it.each([false, true])('#1753: connector-only opening notices follow main-first merge order (shared pending version: %s)', async (sharedVersion) => {
    const module = await import('../../provenance/applicability');
    const mergedRegistry = {
      ...RESULT_CHANGES,
      currentResultsVersion: RESULT_CHANGES.currentResultsVersion + 2,
      changes: RESULT_CHANGES.changes.map(c => sharedVersion && c.prs.includes(1940)
        ? { ...c, resultsVersion: RESULT_CHANGES.currentResultsVersion }
        : c.id === 'linear-stability-refusals'
        ? { ...c, resultsVersion: RESULT_CHANGES.currentResultsVersion + 1 }
        : c.id === 'linear-pin-coupling'
          ? { ...c, resultsVersion: RESULT_CHANGES.currentResultsVersion + 2 } : c),
    };
    const store = createRecheckStore(async () => ({
      ...module,
      assessProject: (...args: Parameters<typeof module.assessProject>) =>
        module.assessProject(args[0], args[1], args[2], mergedRegistry, args[4], args[5]),
    }));
    const snapshot = { ...frame(), elements: [], connectors: [[1, { kShear: 0 }]], regulations: { roles: { steel: { adapterId: 'eurocode3' } } } } as ReturnType<typeof frame>;
    store.openProject({ ...snapshot, solvedWith: oldStamp() }, 'pro');
    await vi.waitFor(() => expect(store.pending).toBe(false));
    const received = store.assessment?.changes.map(c => c.id);
    const expected = openingNoticeIds(mergedRegistry);
    const tail = ['connector-arm-mechanism-3d-refused', 'harmonic-omitted-modes', 'nonlinear-equilibrium-arithmetic', 'nonlinear-physical-convergence', 'nonlinear-supported-and-soil-equilibrium', 'nonlinear-continuation-and-curve-reactions', 'nonlinear-reference-and-initial-shaft-stiffness']
      .map(id => mergedRegistry.changes.find(c => c.id === id)!)
      .sort((a, b) => a.resultsVersion - b.resultsVersion || a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
      .map(c => c.id);
    if (includeSSI) {
      const combinedTail = [...tail, 'ssi-support-reactions']
        .map(id => mergedRegistry.changes.find(c => c.id === id)!)
        .sort((a, b) => a.resultsVersion - b.resultsVersion || a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
        .map(c => c.id);
      expect(expected.slice(-10)).toEqual([...combinedTail, 'linear-stability-refusals', 'linear-pin-coupling']);
    } else {
    expect(expected.slice(-9)).toEqual([...tail, 'linear-stability-refusals', 'linear-pin-coupling']);
    }
    expect(received, JSON.stringify({ expected, received }, null, 2)).toEqual(expected);
  });
  });

  it('clears an acknowledged linear notice before adding shells, saving and reopening without a solve', async () => {
    const store = createRecheckStore();
    const snapshot = { ...frame(), elements: [], connectors: [[1, { kShear: 0 }]], regulations: { roles: { steel: { adapterId: 'eurocode3' } } } } as ReturnType<typeof frame>;
    store.openProject({ ...snapshot, solvedWith: oldStamp() }, 'pro');
    await vi.waitFor(() => expect(store.pending).toBe(false));
    expect(store.assessment?.changes.map(c => c.id)).toEqual(openingNoticeIds());
    expect(store.noticeOpen).toBe(true);
    expect(store.stale).toBe(true);
    store.acknowledge();
    expect(store.noticeOpen).toBe(false);
    expect(store.captureNotice()).toBeUndefined();
    expect(store.stale).toBe(true);

    snapshot.solidShells = [[1, {}]];
    const saved = JSON.stringify({ ...snapshot, solvedWith: store.capture(), pendingRecheckNotice: store.captureNotice() });
    const restored = createRecheckStore();
    restored.openProject(JSON.parse(saved), 'pro');
    await vi.waitFor(() => expect(restored.pending).toBe(false));
    expect(restored.assessment?.changes.map(c => c.id)).toEqual(expect.arrayContaining([
      'solid-shell-local-stress-axes', 'safety-containment-diagnostics',
    ]));
    expect(restored.noticeOpen).toBe(true);
    expect(restored.stale).toBe(true);
  });

  it.each([false, true])('assesses new shells independently of a saved notice (unread changes: %s)', async unread => {
    const original = { ...oldStamp(), resultsVersion: unread ? 0 : 4 };
    const store = createRecheckStore();
    store.openProject({
      ...frame(), solidShells: [[1, {}]], solvedWith: oldStamp(),
      pendingRecheckNotice: { stamp: original, features: unread ? ['steelCirsoc301', 'steelTensionWithoutConnection'] : ['frameMembers'] },
    }, 'pro');
    await vi.waitFor(() => expect(store.pending).toBe(false));
    const ids = store.assessment!.changes.map(c => c.id);
    expect(ids).toContain('solid-shell-local-stress-axes');
    if (unread) expect(ids).toContain('cirsoc301-tension-needs-connection');
    expect(new Set(ids).size).toBe(ids.length);
    expect(store.noticeOpen).toBe(true);
    expect(store.stale).toBe(true);
    expect(store.captureNotice()?.features).toContain('shells');
    store.noteSolved('linear');
    expect(store.stale).toBe(false);
    expect(store.noticeOpen).toBe(true);
  });
});
