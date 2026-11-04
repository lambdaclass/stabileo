/**
 * The re-check's re-run keeps three things apart (`actions/recheck.ts`,
 * docs/results-changes/2026-10-design-chain.md):
 *   - re-running the analysis, which a project with design off gets, and nothing else;
 *   - checking the saved design again, which only design on runs;
 *   - a design that was not checked again, which stays out of date and never reads current.
 *
 * On a real model (qa-8, the real WASM solver): a beam with bars is checked, then the project is
 * re-run with design off. Its verdict must read «stale», not the pass it had, and no code check
 * runs behind the switch.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

vi.mock('../../engine/live-calc', () => ({ runGlobalSolve: vi.fn() }));

import { modelStore, resultsStore, verificationStore, uiStore } from '../../store';
import { commitManual } from '../../store/rebar-edit';
import { designRunStore } from '../../store/design-run.svelte';
import { recheckStore } from '../../store/recheck.svelte';
import { rerunAnalysisAndDesign } from '../recheck';
import { runGlobalSolve } from '../../engine/live-calc';
import qa8 from '../../templates/fixtures/rc-design-qa-8.json';
import { solveCombinations3D, validateAndSolve3D } from '../../engine/solver-service';
import { computeStationDemands } from '../../engine/verification-service';
import { buildAllMemberContexts, buildCriticalSectionMap, type ContextModelData } from '../../engine/design/member-context';
import * as wasmSolver from '../../engine/wasm-solver';
import type { ProvidedReinforcement } from '../../store/model.svelte';

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

const modelData = (): ContextModelData => ({
  nodes: modelStore.nodes as never, elements: modelStore.elements as never,
  sections: modelStore.sections as never, materials: modelStore.materials as never,
  supports: modelStore.supports as never,
});

/** Solve and publish, as the manual solve does: new forces, and no design run with them. */
function solveAndPublish() {
  const combo = solveCombinations3D(modelStore.model as never, modelStore.model.loadCases, modelStore.model.combinations, true, false);
  if (typeof combo === 'string' || !combo) throw new Error(`solve: ${combo}`);
  const res = validateAndSolve3D(modelStore.model as never, true, false);
  if (typeof res === 'string' || !res) throw new Error(`solve3D: ${res}`);
  resultsStore.setResults3D(res);
  resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
  return combo;
}

/** The design's code check over the provided bars: what design on adds to a re-run. */
function checkDesign(combo: ReturnType<typeof solveAndPublish>) {
  const md = modelData();
  const sd = computeStationDemands(combo.perCombo, modelStore.model.combinations, md as never);
  verificationStore.setDemandData(buildAllMemberContexts(md, {
    demands: sd.demands, stations: sd.stations,
    criticalSections: buildCriticalSectionMap(md),
    analysisRevision: verificationStore.analysisRevision,
    demandRevision: verificationStore.demandRevision + 1,
    solveGeneration: verificationStore.solveGeneration,
  }));
}

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

describe('the re-check re-run keeps a design that was not checked again out of date', () => {
  let beam = 0;
  const runCodeCheck = vi.spyOn(designRunStore, 'runCodeCheck').mockImplementation(() => undefined as never);

  beforeEach(() => {
    runCodeCheck.mockClear();
    modelStore.clear();
    resultsStore.clear();
    verificationStore.clear();
    modelStore.restore({
      nodes: qa8.nodes.map((n: { id: number }) => [n.id, n]) as never,
      materials: qa8.materials.map((m: { id: number }) => [m.id, m]) as never,
      sections: qa8.sections.map((s: { id: number }) => [s.id, s]) as never,
      elements: qa8.elements.map((e: { id: number }) => [e.id, e]) as never,
      supports: qa8.supports.map((s: { id: number }) => [s.id, s]) as never,
      loads: qa8.loads as never,
      loadCases: qa8.loadCases as never,
      combinations: qa8.combinations as never,
      nextId: { node: 100, material: 10, section: 10, element: 100, support: 10, load: 100 },
    } as never);
    checkDesign(solveAndPublish());
    beam = [...verificationStore.contexts.keys()].find((id) => verificationStore.contextFor(id)!.elementType === 'beam')!;
    commitManual(beam, REBAR);
    uiStore.analysisMode = 'pro';
    vi.mocked(runGlobalSolve).mockImplementation(async () => { solveAndPublish(); return { ok: true, combinationsLeftOut: null } as never; });
    vi.spyOn(recheckStore, 'stale', 'get').mockReturnValue(false);
  });

  it('checked before the re-run, the beam reads a verdict of the current analysis', () => {
    expect(['ok', 'warn', 'fail']).toContain(verificationStore.getDisplayStatus(beam));
  });

  it('design off: the re-run solves, runs no code check, and leaves the beam out of date', async () => {
    uiStore.designInPro = false;
    expect((await rerunAnalysisAndDesign()).ok).toBe(true);
    expect(runGlobalSolve).toHaveBeenCalled();
    expect(runCodeCheck).not.toHaveBeenCalled();
    expect(verificationStore.getDisplayStatus(beam)).toBe('stale');
    // The bars themselves are kept: nothing of the saved design is dropped by the re-run.
    expect(modelStore.elements.get(beam)?.reinforcement).toBeTruthy();
  });

  it('design on: the re-run asks for the code check, and a checked design reads current again', async () => {
    uiStore.designInPro = true;
    expect((await rerunAnalysisAndDesign()).ok).toBe(true);
    expect(runCodeCheck).toHaveBeenCalledTimes(1);
    // The spy stands in for the check; running it for real brings the verdict back to current.
    checkDesign(solveAndPublish());
    expect(['ok', 'warn', 'fail']).toContain(verificationStore.getDisplayStatus(beam));
  });
});
