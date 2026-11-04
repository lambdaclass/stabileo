/**
 * PR15 review fix (B) — solve-generation stamp.
 *
 * `analysisRevision`'s only writer was `invalidateAnalysis()` (a structural
 * mutation), so `isBaselineStale`/`DisplayStatus 'stale'` could never fire from a
 * mere re-solve. Live hole: toggling a solve-affecting setting (self-weight,
 * axis convention) and re-solving publishes NEW forces via
 * `setResults3D`/`setCombinationResults3D` while the retained `contexts` (and the
 * provided-rebar verification memoised against them) stay put — the design table
 * and viewport verification colors keep showing numbers computed from the
 * PREVIOUS forces as if they were current.
 *
 * Fix: a solve-generation counter on verificationStore, bumped on every results
 * publish (wired from resultsStore, decoupled — see store/index.ts). Contexts are
 * stamped with the generation at build time (member-context.ts). A stamped
 * generation older than the current one reads as 'stale'.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore, resultsStore, verificationStore } from '../index';
import { commitManual } from '../rebar-edit';
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

/** Solve + publish + build/verify contexts — the app's real `computeDemands` path. */
function solveAndBuildContexts(selfWeight: boolean) {
  const md = modelData();
  const combo = solveCombinations3D(modelStore.model as never, modelStore.model.loadCases, modelStore.model.combinations, selfWeight, false);
  if (typeof combo === 'string' || !combo) throw new Error(`solve: ${combo}`);
  const res = validateAndSolve3D(modelStore.model as never, selfWeight, false);
  if (typeof res === 'string' || !res) throw new Error(`solve3D: ${res}`);
  resultsStore.setResults3D(res);
  resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
  const sd = computeStationDemands(combo.perCombo, modelStore.model.combinations, md as never);
  verificationStore.setDemandData(buildAllMemberContexts(md, {
    demands: sd.demands, stations: sd.stations,
    criticalSections: buildCriticalSectionMap(md),
    analysisRevision: verificationStore.analysisRevision,
    demandRevision: verificationStore.demandRevision + 1,
    solveGeneration: verificationStore.solveGeneration,
  }));
}

/** Re-solve and publish ONLY — mirrors what live-calc.ts does when a solve-affecting
 *  setting (self-weight, axis convention) changes: fresh forces are published, but
 *  contexts are NOT rebuilt (no computeDemands() call). */
function reSolveWithoutRebuildingContexts(selfWeight: boolean) {
  const combo = solveCombinations3D(modelStore.model as never, modelStore.model.loadCases, modelStore.model.combinations, selfWeight, false);
  if (typeof combo === 'string' || !combo) throw new Error(`solve: ${combo}`);
  const res = validateAndSolve3D(modelStore.model as never, selfWeight, false);
  if (typeof res === 'string' || !res) throw new Error(`solve3D: ${res}`);
  resultsStore.setResults3D(res);
  resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
}

function setup(): number[] {
  modelStore.clear();
  resultsStore.clear();
  verificationStore.clear();

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

  solveAndBuildContexts(true);
  return [...verificationStore.contexts.keys()].sort((a, b) => a - b);
}

describe('PR15 review fix (B) — solve-generation staleness', () => {
  let ids: number[] = [];
  let beam: number;
  beforeEach(() => {
    ids = setup();
    beam = ids.find(id => verificationStore.contextFor(id)!.elementType === 'beam')!;
    commitManual(beam, REBAR);
  });

  it('the happy path (solve → build contexts → verify) reads as current, never stale', () => {
    const status = verificationStore.getDisplayStatus(beam);
    expect(['ok', 'warn', 'fail']).toContain(status);
    expect(status).not.toBe('stale');
  });

  it('re-solving (e.g. a self-weight toggle) WITHOUT rebuilding contexts makes the member stale', () => {
    const before = verificationStore.getDisplayStatus(beam);
    expect(before).not.toBe('stale');

    // Simulate exactly what live-calc.ts does on an includeSelfWeight toggle:
    // publish fresh forces, but never call computeDemands() to rebuild contexts.
    reSolveWithoutRebuildingContexts(false);

    expect(verificationStore.getDisplayStatus(beam)).toBe('stale');
  });

  it('rebuilding contexts after the re-solve clears the staleness', () => {
    reSolveWithoutRebuildingContexts(false);
    expect(verificationStore.getDisplayStatus(beam)).toBe('stale');

    solveAndBuildContexts(false);
    // commitManual's transaction survives the earlier context rebuild's
    // invalidateAnalysis()? No — solveAndBuildContexts here does NOT go through
    // modelStore mutation, so reinforcement (a model.elements field) is untouched.
    const status = verificationStore.getDisplayStatus(beam);
    expect(['ok', 'warn', 'fail']).toContain(status);
    expect(status).not.toBe('stale');
  });

  /*
   * A structural mutation clears the analysis and every member context. This read «unavailable»
   * (not checked) here, which is what design then said of a member a person had designed: the
   * interaction contracts C12/C12b pinned it as a defect. The member is out of date, and says why
   * (`outOfDate`, reason `model`), until a new analysis gives it a context again.
   */
  it('a real model mutation (invalidateAnalysis) leaves a designed member out of date, saying the model changed', () => {
    reSolveWithoutRebuildingContexts(false);
    expect(verificationStore.getDisplayStatus(beam)).toBe('stale');

    modelStore.addNode(999, 999, 999); // structural mutation → invalidateAnalysis()

    expect(verificationStore.contexts.has(beam), 'the analysis is gone').toBe(false);
    expect(verificationStore.getDisplayStatus(beam)).toBe('stale');
    expect(verificationStore.outOfDate.has(beam)).toBe(true);
    expect(verificationStore.outOfDateReason).toBe('model');
  });

  it('a member nobody designed reads unavailable after a model change, not out of date', () => {
    const other = [...modelStore.elements.keys()].find((id) => id !== beam && !modelStore.elements.get(id)?.reinforcement);
    if (other === undefined) return;
    const listed = verificationStore.contexts.has(other);
    modelStore.addNode(998, 998, 998);
    expect(verificationStore.getDisplayStatus(other)).toBe('unavailable');
    // Still listed in design, «not checked», so the list does not lose part of the structure.
    expect(verificationStore.outOfDate.has(other)).toBe(false);
    expect(verificationStore.stillListed.has(other)).toBe(listed);
  });
});
