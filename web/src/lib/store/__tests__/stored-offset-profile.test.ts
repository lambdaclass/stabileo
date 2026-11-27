import { afterEach, beforeAll, expect, it } from 'vitest';
import { runGlobalSolve } from '../../engine/live-calc';
import { initSolver } from '../../engine/wasm-solver';
import type { ModelSnapshot } from '../history.svelte';
import { modelStore, resultsStore, uiStore } from '../index';
import { preparePlatesForAnalysis, preparePlatesForAnalysisAsync } from '../physical-plates';
import saved from './fixtures/adopted-frame.json';

const sheets = Boolean(__PUBLIC_FEATURES__.proRcSheets);
beforeAll(async () => { await initSolver(); });
afterEach(() => {
  modelStore.clear();
  resultsStore.clear();
  uiStore.analysisMode = '3d';
});

function open(rule: boolean, storedDepth?: number, method: 'linear' | 'pdelta' = 'linear') {
  const project = structuredClone(saved) as unknown as ModelSnapshot;
  if (rule) project.designData = { ...project.designData, placement: { reference: 'slabTop' } };
  project.analysis = { ...project.analysis, perCombination: method };
  modelStore.clear();
  resultsStore.clear();
  uiStore.includeSelfWeight = false;
  modelStore.restore(project);
  if (storedDepth !== undefined) {
    const point = { x: 0, y: 0, z: storedDepth };
    for (const id of [4, 5]) modelStore.setElementOffset(id, { frame: 'global', i: point, j: point });
  }
}

function halfDepth() {
  const beam = modelStore.elements.get(4)!;
  return modelStore.sections.get(beam.sectionId)!.h! / 2;
}

it.skip.each([preparePlatesForAnalysis, preparePlatesForAnalysisAsync])('known wrong result: uses the stored geometry when preparing a reopened frame in this build (%#)', async prepare => {
  for (const materialized of [false, true]) {
    open(true);
    const depth = halfDepth();
    const stored = materialized ? -depth / 2 : undefined;
    open(true, stored);
    expect((await prepare()).ok).toBe(true);
    for (const id of [4, 5]) {
      const offset = modelStore.elements.get(id)!.offset;
      expect(offset?.i?.z).toBe(sheets ? -depth : stored);
      expect(offset?.j?.z).toBe(sheets ? -depth : stored);
    }
    expect(modelStore.snapshot().designData?.placement).toEqual({ reference: 'slabTop' });
  }
});

it.skip.each([['pro', 'linear'], ['pro', 'pdelta'], ['3d', 'linear'], ['3d', 'pdelta']] as const)(
  'known wrong result: calculates the reopened %s frame using the geometry selected by its profile (%s)', async (mode, method) => {
    uiStore.analysisMode = mode;
    async function solve(rule: boolean, offset?: number) {
      open(rule, offset, method);
      expect((await runGlobalSolve()).ok).toBe(true);
      const displacements = resultsStore.results3D!.displacements;
      expect(displacements.find(d => d.nodeId === 5)!.uz).toBeLessThan(0);
      return structuredClone(displacements);
    }
    const bare = await solve(false);
    const positioned = await solve(false, -halfDepth());
    expect(positioned).not.toEqual(bare);
    expect(await solve(true)).toEqual(sheets ? positioned : bare);
    expect(await solve(true, -halfDepth())).toEqual(positioned);
  },
);
