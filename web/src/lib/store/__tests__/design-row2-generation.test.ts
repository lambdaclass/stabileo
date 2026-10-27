import { afterEach, expect, it, vi } from 'vitest';
import { modelStore, resultsStore, uiStore } from '..';
import { verificationStore } from '../verification.svelte';
import { detailingStore } from '../detailing.svelte';
import { designRunStore } from '../design-run.svelte';
import { designWithResizing } from '../design-resize';
import { currentFrameDesignQuality } from './design-quality-fixture';
import { solveCombinations3D, validateAndSolve3D } from '../../engine/solver-service';
import { COLLISION_CHORD_TOLERANCE, minSurfaceClearance } from '../../engine/detailing/collision';

afterEach(() => vi.restoreAllMocks());

it('closes crowded beam cages and crossing bottom hooks during ordinary sizing and regeneration', async () => {
  modelStore.clear(); resultsStore.clear(); verificationStore.clear(); detailingStore.clear();
  designRunStore.resetMarks();
  await modelStore.loadExample('rc-design-qa-row2');
  uiStore.analysisMode = 'pro';
  modelStore.reinforcementTransaction(api => {
    for (const id of modelStore.elements.keys()) api.setReinforcement(id, undefined);
  });
  const combo = solveCombinations3D(modelStore.model as never, modelStore.model.loadCases, modelStore.model.combinations, true, false);
  const solved = validateAndSolve3D(modelStore.model as never, true, false);
  if (!combo || typeof combo === 'string' || !solved || typeof solved === 'string') throw new Error('fixture solve failed');
  resultsStore.setResults3D(solved);
  resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
  const generate = detailingStore.generate;
  let totalBuilds = 0, totalSearches = 0;
  vi.spyOn(detailingStore, 'generate').mockImplementation(options => {
    const result = generate(options);
    const stats = detailingStore.lastFeedbackLoop?.physicalSearch?.stats;
    totalBuilds += stats?.detailingRuns ?? 0;
    totalSearches += stats?.memberSearches ?? 0;
    return result;
  });
  await designWithResizing({ families: ['column', 'beam'], edited: 'keep', steel: false });

  const quality = currentFrameDesignQuality();
  expect(quality.verifiedIds).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  expect(quality.output.blockingConflicts).toBe(0);
  expect(quality.output.open).toEqual({});
  expect(quality.output.aborted).toBe(false);
  expect(quality.output.notReached).toBe(0);
  expect(quality.output.exhausted).toBe(0);
  expect(quality.output.passingWithBlockingConflicts).toEqual([]);
  expect(quality.output.passingWithoutFinalVerification).toEqual([]);
  // The formerly colliding bar still spans the same 2.87 m. It threads the bends;
  // it is neither shortened nor hidden by a different conflict classification.
  const bars = new Map(detailingStore.lastRun!.assemblies.flatMap(a => a.bars).map(b => [b.id, b]));
  const cut = bars.get('e7-bot-cut-0')!;
  expect(cut.cuttingLength).toBeCloseTo(2.87, 8);
  for (const id of ['e5-bot-cont-0', 'e5-bot-cont-2', 'e6-bot-cont-1']) {
    const hooked = bars.get(id)!;
    expect(hooked.startTreatment.kind).toBe('hook');
    expect(hooked.endTreatment.kind).toBe('hook');
    expect(minSurfaceClearance(cut, hooked).clearance, id).toBeGreaterThanOrEqual(-COLLISION_CHORD_TOLERANCE);
  }
  const selfConflicts = detailingStore.lastRun!.assemblies.flatMap(a => a.conflicts).filter(c =>
    c.severity !== 'marginal' && new Set(c.elementIds).size === 1
    && verificationStore.contextFor(c.elementIds[0])?.elementType === 'beam');
  expect(selfConflicts).toEqual([]);
  expect(totalBuilds).toBeLessThanOrEqual(4);
  expect(totalSearches).toBeLessThanOrEqual(64);
  expect(detailingStore.generate()).not.toBeNull();
  expect(currentFrameDesignQuality()).toEqual(quality);
  expect(detailingStore.lastFeedbackLoop?.physicalSearch).toBeUndefined();
}, 60_000);
