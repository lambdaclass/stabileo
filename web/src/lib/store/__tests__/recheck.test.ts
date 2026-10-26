import { describe, it, expect, beforeEach } from 'vitest';
import { recheckStore } from '../recheck.svelte';
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

  it('a new project belongs to this build: no notice, nothing stale', () => {
    expect(recheckStore.noticeOpen).toBe(false);
    expect(recheckStore.stale).toBe(false);
    expect(recheckStore.capture()?.resultsVersion).toBe(RESULTS_VERSION);
  });

  it('an unstamped project opens with the notice; acknowledging leaves it stale until solved', () => {
    recheckStore.openProject(steelTruss(), 'pro');
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

  it('keeps the notice up when live calc re-solves before it was read', () => {
    recheckStore.openProject(steelTruss(), 'pro');
    recheckStore.noteSolved('linear');
    expect(recheckStore.stale).toBe(false);
    expect(recheckStore.noticeOpen).toBe(true);
  });

  it('carries one identity between tabs: reopening the captured snapshot after acknowledging does not ask again', () => {
    recheckStore.openProject(steelTruss(), 'pro');
    recheckStore.acknowledge();
    const carried = { ...(steelTruss() as object), solvedWith: recheckStore.capture() };
    recheckStore.reset();
    recheckStore.openProject(carried as never, 'pro');
    expect(recheckStore.noticeOpen).toBe(false);
    expect(recheckStore.stale).toBe(true);
  });

  it('a project stamped with this version opens silently', () => {
    recheckStore.noteSolved('modal');
    const snap = { ...(steelTruss() as object), solvedWith: recheckStore.capture() };
    recheckStore.openProject(snap as never, 'pro');
    expect(recheckStore.noticeOpen).toBe(false);
    expect(recheckStore.stale).toBe(false);
  });

  it('a malformed stamp reads as none (the conservative reading)', () => {
    recheckStore.openProject({ ...(steelTruss() as object), solvedWith: { resultsVersion: 'x' } } as never, 'pro');
    expect(recheckStore.noticeOpen).toBe(true);
  });
});

describe('what ends the stale state', () => {
  beforeEach(() => recheckStore.reset());

  it('a modal run alone does not: the static results are still the older version\'s', () => {
    recheckStore.openProject(steelTruss(), 'pro');
    recheckStore.noteSolved('modal');
    expect(recheckStore.stale).toBe(true);
    recheckStore.noteSolved('linear');
    expect(recheckStore.stale).toBe(false);
  });

  it('a P-Δ run with no second-order equilibrium does not', () => {
    recheckStore.openProject(steelTruss(), 'pro');
    const unconverged = { converged: false, isStable: false, iterations: 50, b2Factor: Infinity, results: { displacements: [], reactions: [], elementForces: [] } };
    resultsStore.setPDeltaWithoutEquilibrium(unconverged as never, true);
    expect(recheckStore.stale).toBe(true);
    expect(recheckStore.capture()?.analyses).toEqual([]);
  });
});
