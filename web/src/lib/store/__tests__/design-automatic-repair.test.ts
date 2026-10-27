import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { modelStore, resultsStore, uiStore } from '..';
import { designRunStore } from '../design-run.svelte';
import { detailingStore } from '../detailing.svelte';
import { verificationStore } from '../verification.svelte';
import { setLocked } from '../design-decisions';
import { designWithResizing } from '../design-resize';
import { finalReport } from '../design-desk';
import * as feedback from '../../engine/detailing/design-feedback-loop';
import { DESIGN_PHYSICAL_SEARCH_BUDGET } from '../../engine/detailing/physical-design-search';
import { rebarHash } from '../../engine/design/rebar-hash';
import { solveCombinations3D, validateAndSolve3D } from '../../engine/solver-service';

beforeEach(async () => {
  modelStore.clear(); resultsStore.clear(); verificationStore.clear(); detailingStore.clear();
  designRunStore.resetMarks();
  await modelStore.loadExample('rc-design-qa-8');
  modelStore.model.detailingAuto = true;
  uiStore.analysisMode = 'pro';
  const combo = solveCombinations3D(modelStore.model as never, modelStore.model.loadCases, modelStore.model.combinations, true, false);
  const solved = validateAndSolve3D(modelStore.model as never, true, false);
  if (!combo || typeof combo === 'string' || !solved || typeof solved === 'string') throw new Error('fixture solve failed');
  resultsStore.setResults3D(solved);
  resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
});
afterEach(() => vi.restoreAllMocks());

it('runs one bounded physical search from the ordinary design command, but not on regeneration', () => {
  const loop = vi.spyOn(feedback, 'runDesignFeedbackLoop');
  expect(designRunStore.designAll().ok).toBe(true);
  expect(loop).toHaveBeenCalledTimes(1);
  expect(loop.mock.calls[0][0].physicalSearch).toEqual(DESIGN_PHYSICAL_SEARCH_BUDGET);
  expect([...loop.mock.calls[0][0].lockedMembers!]).toEqual([]);
  expect(detailingStore.lastFeedbackLoop!.physicalSearch!.stats.detailingRuns)
    .toBeLessThanOrEqual(DESIGN_PHYSICAL_SEARCH_BUDGET.maxDetailingRuns);
  expect(detailingStore.generate()).not.toBeNull();
  expect(loop.mock.calls[1][0].physicalSearch).toBeUndefined();
});

it('repairs only the actual sizing scope, keeping locks, manual edits and unselected neighbours', () => {
  expect(designRunStore.designAll().ok).toBe(true);
  setLocked([1], true);
  designRunStore.markManual([7]);
  const before = new Map([...modelStore.elements].map(([id, e]) => [id, rebarHash(e.reinforcement)]));
  const loop = vi.spyOn(feedback, 'runDesignFeedbackLoop');
  expect(designRunStore.autoDesign([1, 2, 7]).ok).toBe(true);
  const input = loop.mock.calls[0][0];
  expect([...input.lockedMembers!].sort((a, b) => a - b)).toEqual([1, 3, 4, 5, 6, 7, 8]);
  for (const [id, hash] of before) if (id !== 2)
    expect(rebarHash(modelStore.elements.get(id)!.reinforcement), `untouched ${id}`).toBe(hash);
});

it('respects family selection and runs detailing exactly once for the workspace command', () => {
  expect(designRunStore.designAll().ok).toBe(true);
  const beams = new Map([...modelStore.elements].filter(([id]) => verificationStore.contextFor(id)?.elementType === 'beam')
    .map(([id, e]) => [id, rebarHash(e.reinforcement)]));
  modelStore.model.detailingAuto = false;
  const loop = vi.spyOn(feedback, 'runDesignFeedbackLoop');
  expect(designRunStore.designFamilies(['column'], { verifierId: 'scope-test' }).ok).toBe(true);
  expect(loop).toHaveBeenCalledTimes(1);
  for (const [id, hash] of beams) {
    expect(loop.mock.calls[0][0].lockedMembers!.has(id)).toBe(true);
    expect(rebarHash(modelStore.elements.get(id)!.reinforcement)).toBe(hash);
  }
  expect(detailingStore.lastRun!.assemblies.length).toBeGreaterThan(0);
  expect(detailingStore.lastRun!.assemblies.every(a => a.provenance.verifierId === 'scope-test')).toBe(true);
});

it('does not repair unreached members after the nominal sizing budget stops the run', () => {
  expect(designRunStore.designAll().ok).toBe(true);
  const loop = vi.spyOn(feedback, 'runDesignFeedbackLoop');
  expect(designRunStore.autoDesign([...verificationStore.contexts.keys()], { maxRunMs: 0 }).ok).toBe(true);
  expect(verificationStore.runSummary!.aborted).toBe(true);
  expect(verificationStore.runSummary!.notReached).toBe(8);
  expect([...loop.mock.calls[0][0].lockedMembers!].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  expect(detailingStore.lastFeedbackLoop!.physicalSearch!.changed).toEqual([]);
});

it('keeps automatic detailing opt-out and an explicitly empty repair scope', () => {
  modelStore.model.detailingAuto = false;
  const loop = vi.spyOn(feedback, 'runDesignFeedbackLoop');
  expect(designRunStore.designAll().ok).toBe(true);
  expect(loop).not.toHaveBeenCalled();
  expect(detailingStore.generate({ physicalSearch: DESIGN_PHYSICAL_SEARCH_BUDGET, repairMemberIds: [] })).not.toBeNull();
  expect([...loop.mock.calls[0][0].lockedMembers!].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  expect(detailingStore.lastFeedbackLoop!.physicalSearch!.changed).toEqual([]);
});

it('repairs once after the final resize, and never after cancellation', async () => {
  const loop = vi.spyOn(feedback, 'runDesignFeedbackLoop');
  const run = await designWithResizing({ families: ['column', 'beam'], edited: 'keep', steel: false });
  expect(run.rounds).toBe(4);
  expect(loop.mock.calls.filter(([input]) => input.physicalSearch)).toHaveLength(1);
  expect(loop.mock.lastCall![0].physicalSearch).toEqual(DESIGN_PHYSICAL_SEARCH_BUDGET);
  expect(run.report.levels).toEqual(finalReport());

  // A fresh fixture still needs growth; cancellation must not start the deferred search.
  await modelStore.loadExample('rc-design-qa-8');
  modelStore.model.detailingAuto = true;
  resultsStore.clear(); verificationStore.clear(); detailingStore.clear(); designRunStore.resetMarks();
  const combo = solveCombinations3D(modelStore.model as never, modelStore.model.loadCases, modelStore.model.combinations, true, false);
  if (!combo || typeof combo === 'string') throw new Error('fixture solve failed');
  resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
  loop.mockClear();
  const cancelled = await designWithResizing({ families: ['column', 'beam'], edited: 'keep', steel: false }, { cancelled: () => true });
  expect(cancelled.stopped).toBe('cancelled');
  expect(loop.mock.calls.filter(([input]) => input.physicalSearch)).toHaveLength(0);
}, 60_000);

it('stops growth and the deferred repair when the nominal pass exhausts its time budget', async () => {
  const loop = vi.spyOn(feedback, 'runDesignFeedbackLoop');
  const run = await designWithResizing({ families: ['column', 'beam'], edited: 'keep', steel: false, maxRunMs: 0 });
  expect(verificationStore.runSummary!.aborted).toBe(true);
  expect(verificationStore.runSummary!.notReached).toBe(8);
  expect(run.stopped).toBe('blocked');
  expect(run.rounds).toBe(0);
  expect(run.changes).toEqual([]);
  expect(loop.mock.calls.filter(([input]) => input.physicalSearch)).toHaveLength(0);
});
