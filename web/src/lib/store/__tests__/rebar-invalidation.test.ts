/**
 * PR15 — reinforcement-edit contract.
 *
 * The reported regression was `verificationStore.clear()` after every committed rebar
 * edit: it emptied the design table AND destroyed the data the live provided-rebar
 * verification needs. These tests pin the replacement contract:
 *
 *   - a rebar edit keeps demand data and the code-check baseline intact
 *   - edited members re-verify immediately from retained demand
 *   - unaffected members are cache HITS (object identity preserved)
 *   - NO structural solve, NO modelVersion bump
 *   - one transaction = one undo step, restoring every member
 *   - real model edits still invalidate everything
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { modelStore, resultsStore, verificationStore, historyStore } from '../index';
import { designRunStore } from '../design-run.svelte';
import { commitManual, commitManualBatch, revertReinforcement, setRegionLayers } from '../rebar-edit';
import qa8 from '../../templates/fixtures/rc-design-qa-8.json';
import { solveCombinations3D, validateAndSolve3D } from '../../engine/solver-service';
import { computeStationDemands } from '../../engine/verification-service';
import { buildAllMemberContexts, buildCriticalSectionMap, type ContextModelData } from '../../engine/design/member-context';
import * as wasmSolver from '../../engine/wasm-solver';
import type { ProvidedReinforcement } from '../model.svelte';

beforeAll(async () => {
  // history.svelte.ts wires modelStore._setHistoryPush from a queueMicrotask.
  await new Promise(r => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

const REBAR: ProvidedReinforcement = {
  regions: {
    bottomSpanLayers: [{ count: 4, diameter: 20, row: 0 }],
    bottomSpan: { count: 4, diameter: 20 },
    topStartLayers: [{ count: 3, diameter: 20, row: 0 }],
    topStart: { count: 3, diameter: 20 },
    topEndLayers: [{ count: 3, diameter: 20, row: 0 }],
    topEnd: { count: 3, diameter: 20 },
    stirrupsSupport: { diameter: 8, legs: 2, spacing: 0.10 },
    stirrupsSpan: { diameter: 8, legs: 2, spacing: 0.15 },
  },
};

function modelData(): ContextModelData {
  return {
    nodes: modelStore.nodes as never, elements: modelStore.elements as never,
    sections: modelStore.sections as never, materials: modelStore.materials as never,
    supports: modelStore.supports as never,
  };
}

/** Load the QA fixture, solve, and publish demands — the app's real setup path. */
function setup() {
  modelStore.clear();
  resultsStore.clear();
  verificationStore.clear();
  historyStore.clear();
  designRunStore.resetMarks();

  modelStore.restore({
    nodes: qa8.nodes.map((n: any) => [n.id, n]) as never,
    materials: qa8.materials.map((m: any) => [m.id, m]) as never,
    sections: qa8.sections.map((s: any) => [s.id, s]) as never,
    elements: qa8.elements.map((e: any) => [e.id, e]) as never,
    supports: qa8.supports.map((s: any) => [s.id, s]) as never,
    loads: qa8.loads as never,
    loadCases: qa8.loadCases as never,
    combinations: qa8.combinations as never,
    nextId: { node: 100, material: 10, section: 10, element: 100, support: 10, load: 100 },
  } as never);

  const md = modelData();
  const combo = solveCombinations3D(modelStore.model as never, modelStore.model.loadCases, modelStore.model.combinations, true, false);
  if (typeof combo === 'string' || !combo) throw new Error(`solve: ${combo}`);
  const res = validateAndSolve3D(modelStore.model as never, true, false);
  if (typeof res === 'string' || !res) throw new Error(`solve3D: ${res}`);
  // Order matters: setResults3D() resets the per-combo maps (fresh-solve semantics),
  // so the combination results must be published AFTER it — same order as the app.
  resultsStore.setResults3D(res);
  resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
  const sd = computeStationDemands(combo.perCombo, modelStore.model.combinations, md as never);
  verificationStore.setDemandData(buildAllMemberContexts(md, {
    demands: sd.demands, stations: sd.stations,
    criticalSections: buildCriticalSectionMap(md),
    analysisRevision: verificationStore.analysisRevision,
    demandRevision: verificationStore.demandRevision + 1,
  }));
  return [...verificationStore.contexts.keys()].sort((a, b) => a - b);
}

describe('reinforcement edits preserve analysis state', () => {
  let ids: number[] = [];
  beforeEach(() => { ids = setup(); });

  it('1. a manual edit keeps demand data and the design context intact', () => {
    const before = verificationStore.contexts.size;
    expect(before).toBe(8);
    commitManual(ids[0], REBAR);
    expect(verificationStore.contexts.size).toBe(before);
    expect(verificationStore.hasDemandFor(ids[0])).toBe(true);
    expect(resultsStore.results3D).not.toBeNull();
    expect(resultsStore.perCombo3D.size).toBeGreaterThan(0);
  });

  it('2. an edited member re-verifies immediately from retained demand', () => {
    const beam = ids.find(id => verificationStore.contextFor(id)!.elementType === 'beam')!;
    expect(verificationStore.providedFor(beam)).toBeNull();      // no rebar yet
    commitManual(beam, REBAR);
    const v1 = verificationStore.providedFor(beam);
    expect(v1).not.toBeNull();
    expect(v1!.strengthCheckCount).toBeGreaterThan(0);
    // Weaken it and confirm the numbers move.
    setRegionLayers(beam, 'bottomSpanLayers', [{ count: 2, diameter: 10, row: 0 }]);
    const v2 = verificationStore.providedFor(beam)!;
    expect(v2).not.toBe(v1);
    expect(v2.worstUtilization).toBeGreaterThan(v1!.worstUtilization);
  });

  it('3. unaffected members are cache hits (identity preserved)', () => {
    const beams = ids.filter(id => verificationStore.contextFor(id)!.elementType === 'beam');
    commitManualBatch(beams.map(id => [id, REBAR] as [number, ProvidedReinforcement]));
    const snapshot = new Map(beams.map(id => [id, verificationStore.providedFor(id)]));
    // Edit exactly one member.
    setRegionLayers(beams[0], 'bottomSpanLayers', [{ count: 5, diameter: 20, row: 0 }]);
    for (const id of beams.slice(1)) {
      expect(verificationStore.providedFor(id), `element ${id} must be a cache hit`).toBe(snapshot.get(id));
    }
    expect(verificationStore.providedFor(beams[0])).not.toBe(snapshot.get(beams[0]));
  });

  it('4. NO structural solve and NO modelVersion bump on a reinforcement-only edit', () => {
    const spy3d = vi.spyOn(wasmSolver, 'solve3D');
    const spyStations = vi.spyOn(wasmSolver, 'extractBeamStationsGrouped3D');
    const versionBefore = modelStore.modelVersion;
    const analysisBefore = verificationStore.analysisRevision;
    const demandBefore = verificationStore.demandRevision;
    const comboBefore = resultsStore.perCombo3D.size;

    commitManual(ids[0], REBAR);
    setRegionLayers(ids[0], 'bottomSpanLayers', [{ count: 6, diameter: 20, row: 0 }]);

    expect(spy3d).not.toHaveBeenCalled();
    expect(spyStations).not.toHaveBeenCalled();
    expect(modelStore.modelVersion).toBe(versionBefore);
    expect(verificationStore.analysisRevision).toBe(analysisBefore);
    expect(verificationStore.demandRevision).toBe(demandBefore);
    expect(resultsStore.perCombo3D.size).toBe(comboBefore);
    spy3d.mockRestore();
    spyStations.mockRestore();
  });

  it('5. several edits can be made before any re-verification command runs', () => {
    const beams = ids.filter(id => verificationStore.contextFor(id)!.elementType === 'beam');
    const written = commitManualBatch(beams.map(id => [id, REBAR] as [number, ProvidedReinforcement]));
    expect(written.size).toBe(beams.length);
    for (const id of beams) expect(verificationStore.providedFor(id)).not.toBeNull();
    expect(resultsStore.results3D).not.toBeNull();
  });

  it('6. one transaction = ONE undo step, restoring every member', () => {
    const beams = ids.filter(id => verificationStore.contextFor(id)!.elementType === 'beam');
    const undoBefore = historyStore.undoCount;
    commitManualBatch(beams.map(id => [id, REBAR] as [number, ProvidedReinforcement]));
    expect(historyStore.undoCount).toBe(undoBefore + 1);
    for (const id of beams) expect(modelStore.elements.get(id)!.reinforcement).toBeTruthy();

    historyStore.undo();
    for (const id of beams) expect(modelStore.elements.get(id)!.reinforcement).toBeUndefined();
    historyStore.redo();
    for (const id of beams) expect(modelStore.elements.get(id)!.reinforcement).toBeTruthy();
  });

  it('7. reinforcement survives snapshot → restore (undo/redo/tab-switch/save-load)', () => {
    commitManual(ids[0], REBAR);
    const snap = modelStore.snapshot();
    const roundTripped = (snap.elements.find(([k]) => k === ids[0]) as never as [number, { reinforcement?: unknown }])[1];
    expect(roundTripped.reinforcement).toBeTruthy();
    modelStore.restore(snap);
    expect(modelStore.elements.get(ids[0])!.reinforcement).toBeTruthy();
  });

  it('8. undo does NOT alias the live reinforcement object (snapshot corruption guard)', () => {
    commitManual(ids[0], REBAR);
    const snap = modelStore.snapshot();
    const snapEntry = (snap.elements.find(([k]) => k === ids[0]) as never as [number, any])[1];
    const snapCount = snapEntry.reinforcement.regions.bottomSpanLayers[0].count;
    // A subsequent edit must not reach into the snapshot.
    setRegionLayers(ids[0], 'bottomSpanLayers', [{ count: 9, diameter: 20, row: 0 }]);
    expect(snapEntry.reinforcement.regions.bottomSpanLayers[0].count).toBe(snapCount);
  });

  it('9. revert clears reinforcement in one step and drops the edited mark', () => {
    commitManual(ids[0], REBAR);
    expect(designRunStore.manualOverrides.has(ids[0])).toBe(true);
    revertReinforcement([ids[0]]);
    expect(modelStore.elements.get(ids[0])!.reinforcement).toBeUndefined();
    expect(designRunStore.manualOverrides.has(ids[0])).toBe(false);
  });

  it('10. display status is provided-first: weakening rebar turns the member red', () => {
    const beam = ids.find(id => verificationStore.contextFor(id)!.elementType === 'beam')!;
    expect(verificationStore.getDisplayStatus(beam)).toBe('unavailable');   // no rebar
    commitManual(beam, REBAR);
    const good = verificationStore.getDisplayStatus(beam);
    expect(['ok', 'warn']).toContain(good);
    setRegionLayers(beam, 'bottomSpanLayers', [{ count: 2, diameter: 10, row: 0 }]);
    expect(verificationStore.getDisplayStatus(beam)).toBe('fail');
    // The viewport reads the same source.
    expect(verificationStore.getStatus(beam)).toBe('fail');
    expect(verificationStore.getMaxRatio(beam)).toBeGreaterThan(1);
  });

  it('11. summary counts never fold non-passing states into the pass count', () => {
    const beams = ids.filter(id => verificationStore.contextFor(id)!.elementType === 'beam');
    commitManualBatch(beams.map(id => [id, REBAR] as [number, ProvidedReinforcement]));
    const c = verificationStore.providedSummary;
    expect(c.total).toBe(8);
    expect(c.withReinforcement).toBe(beams.length);
    expect(c.ok + c.warn + c.fail + c.unavailable + c.stale).toBe(c.total);
    expect(c.unavailable).toBeGreaterThan(0);      // the columns have no rebar
  });

  it('12. missing reinforcement in a loaded region is an explicit FAILURE, not a skip', () => {
    const beam = ids.find(id => verificationStore.contextFor(id)!.elementType === 'beam')!;
    // Bottom steel only — the supports carry hogging moment and have nothing.
    commitManual(beam, {
      regions: {
        bottomSpanLayers: [{ count: 4, diameter: 20, row: 0 }],
        bottomSpan: { count: 4, diameter: 20 },
        stirrupsSupport: { diameter: 8, legs: 2, spacing: 0.10 },
        stirrupsSpan: { diameter: 8, legs: 2, spacing: 0.15 },
      },
    });
    const v = verificationStore.providedFor(beam)!;
    const missing = v.checks.filter(c => c.missingReinforcement);
    expect(missing.length).toBeGreaterThan(0);
    for (const m of missing) expect(m.status).toBe('fail');
    expect(v.overallStatus).toBe('fail');
  });
});

describe('real model edits still invalidate force-dependent state', () => {
  beforeEach(() => { setup(); });

  it('a node edit advances the analysis revision and drops demand + baseline', () => {
    const before = verificationStore.analysisRevision;
    expect(verificationStore.hasDemandData).toBe(true);
    modelStore.addNode(99, 99, 99);
    expect(verificationStore.analysisRevision).toBeGreaterThan(before);
    expect(verificationStore.hasDemandData).toBe(false);
    expect(verificationStore.hasResults).toBe(false);
    expect(resultsStore.results3D).toBeNull();
  });

  it('a section change invalidates too (the mandatory re-solve after section advice)', () => {
    const before = verificationStore.analysisRevision;
    modelStore.updateSection(2, { b: 0.4, h: 0.7 });
    expect(verificationStore.analysisRevision).toBeGreaterThan(before);
    expect(verificationStore.hasDemandData).toBe(false);
  });

  it('restore() (import / AI replacement / tab switch) invalidates but keeps rebar', () => {
    const ids = [...verificationStore.contexts.keys()];
    commitManual(ids[0], REBAR);
    const snap = modelStore.snapshot();
    const before = verificationStore.analysisRevision;
    modelStore.restore(snap);
    expect(verificationStore.analysisRevision).toBeGreaterThan(before);
    expect(verificationStore.hasDemandData).toBe(false);
    expect(modelStore.elements.get(ids[0])!.reinforcement).toBeTruthy();
  });
});
