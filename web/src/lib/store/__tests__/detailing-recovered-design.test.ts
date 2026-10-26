import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { modelStore } from '..';
import { detailingStore } from '../detailing.svelte';
import { verificationStore } from '../verification.svelte';
import { regulationsStore } from '../regulations.svelte';
import { recordRefusals, storedRefusal } from '../design-refusals';
import { setLocked } from '../design-decisions';
import * as feedback from '../../engine/detailing/design-feedback-loop';
import { tallyRunSummary, type MemberDesignOutcome } from '../../engine/design/outcome';
import { syntheticBeamContext } from '../../engine/design/__tests__/helpers';

beforeEach(() => { modelStore.clear(); verificationStore.clear(); detailingStore.clear(); });
afterEach(() => { vi.restoreAllMocks(); detailingStore.clear(); verificationStore.clear(); modelStore.clear(); });

// Exercise the publication boundary with a controlled loop result. The search's physical
// acceptance gates have their own tests; here the real model, decisions and summaries must
// retain the result the loop accepted, even when the member had no prior accepted bars.
function recovery() {
  const a = modelStore.addNode(0, 0, 3), b = modelStore.addNode(6, 0, 3), c = modelStore.addNode(12, 0, 3);
  const id = modelStore.addElement(a, b, 'frame'), other = modelStore.addElement(b, c, 'frame');
  const ctx = syntheticBeamContext({ elementId: id });
  const accepted = { elementId: id, elementType: 'beam', codeId: 'cirsoc', codeVersion: '2025',
    outcome: 'VERIFIED', accepted: { regions: {
      bottomSpan: { count: 4, diameter: 16 }, topStart: { count: 4, diameter: 16 }, topEnd: { count: 4, diameter: 16 },
    } }, searchStats: { candidatesTried: 1, verifierCalls: 1 },
  } as MemberDesignOutcome;
  const refused: MemberDesignOutcome = { ...accepted, outcome: 'SEARCH_EXHAUSTED',
    accepted: undefined, certificate: undefined };
  const untouched = { ...refused, elementId: other };
  verificationStore.setDemandData(new Map([[id, ctx], [other, syntheticBeamContext({ elementId: other })]]));
  verificationStore.setDesignOutcomes(tallyRunSummary('cirsoc', '2025', [refused, untouched], 123, true, 4));
  recordRefusals([refused, untouched]);
  vi.spyOn(regulationsStore, 'concreteDesignCode').mockReturnValue('cirsoc');
  const loop = vi.spyOn(feedback, 'runDesignFeedbackLoop').mockImplementation(input => ({
    outcomes: new Map(input.outcomes).set(id, accepted), iterations: [],
    result: { assemblies: [], reverification: [{ elementId: id, status: 'ok' }] },
    physicalSearch: { changed: [id] },
  } as never));
  return { id, other, accepted, refused, untouched, loop };
}

it('persists a recovered design, recounts outcomes and retires only its saved refusal', () => {
  const { id, other, accepted, untouched, loop } = recovery();
  const transaction = vi.spyOn(modelStore, 'reinforcementTransaction');
  expect(detailingStore.generate(), detailingStore.lastError ?? '').not.toBeNull();
  expect(modelStore.elements.get(id)!.reinforcement).toEqual(accepted.accepted);
  expect(modelStore.designDecisions!.proposals[String(id)]).toEqual(accepted.accepted);
  expect(verificationStore.outcomeFor(id)).toEqual(accepted);
  expect(verificationStore.outcomeFor(other)).toEqual(untouched);
  expect(verificationStore.runSummary).toMatchObject({ total: 2, verified: 1, searchExhausted: 1,
    wallMs: 123, aborted: true, notReached: 4 });
  expect(storedRefusal(id)).toBeUndefined();
  expect(storedRefusal(other)).toEqual(untouched);
  expect(transaction).toHaveBeenCalledTimes(1);
  // A subsequent generation sees the recovered assignment and need not write it again.
  expect(detailingStore.generate()).not.toBeNull();
  expect(loop.mock.calls[1][0].outcomes.get(id)).toEqual(accepted);
  expect(transaction).toHaveBeenCalledTimes(1);
});

it('retains an accepted recovery after session outcomes are cleared', () => {
  const { id, other, accepted, untouched } = recovery();
  expect(detailingStore.generate()).not.toBeNull();
  const snapshot = modelStore.snapshot();
  verificationStore.clear();
  modelStore.restore(snapshot);
  expect(modelStore.elements.get(id)!.reinforcement).toEqual(accepted.accepted);
  expect(modelStore.designDecisions!.proposals[String(id)]).toEqual(accepted.accepted);
  expect(storedRefusal(id)).toBeUndefined();
  expect(storedRefusal(other)).toEqual(untouched);
});

it('can publish a recovery when only saved refusals remain after reopening', () => {
  const { id, other, accepted, untouched } = recovery();
  verificationStore.setDesignOutcomes(null);
  expect(verificationStore.outcomeFor(id)!.outcome).toBe('SEARCH_EXHAUSTED');
  expect(detailingStore.generate(), detailingStore.lastError ?? '').not.toBeNull();
  expect(modelStore.elements.get(id)!.reinforcement).toEqual(accepted.accepted);
  expect(verificationStore.outcomeFor(id)).toEqual(accepted);
  expect(verificationStore.outcomeFor(other)).toEqual(untouched);
  expect(verificationStore.runSummary).toMatchObject({ total: 2, verified: 1, searchExhausted: 1 });
  expect(storedRefusal(id)).toBeUndefined();
  expect(storedRefusal(other)).toEqual(untouched);
});

it('keeps a locked refused member unchanged at publication', () => {
  const { id, refused } = recovery();
  setLocked([id], true);
  const transaction = vi.spyOn(modelStore, 'reinforcementTransaction');
  expect(detailingStore.generate()).not.toBeNull();
  expect(modelStore.elements.get(id)!.reinforcement).toBeUndefined();
  expect(verificationStore.outcomeFor(id)).toEqual(refused);
  expect(verificationStore.runSummary!.searchExhausted).toBe(2);
  expect(transaction).not.toHaveBeenCalled();
});

it('preserves saved refusals outside a partial session summary', () => {
  const { id, other, accepted, refused, untouched } = recovery();
  verificationStore.setDesignOutcomes(tallyRunSummary('cirsoc', '2025', [refused], 123, false, 0));
  expect(detailingStore.generate(), detailingStore.lastError ?? '').not.toBeNull();
  expect(verificationStore.outcomeFor(id)).toEqual(accepted);
  expect(verificationStore.outcomeFor(other)).toEqual(untouched);
  expect(storedRefusal(other)).toEqual(untouched);
  expect(verificationStore.runSummary).toMatchObject({ total: 2, verified: 1, searchExhausted: 1 });
});

it('does not publish a refused candidate merely because a trace reports a change', () => {
  const { id, accepted, refused, loop } = recovery();
  loop.mockImplementation(input => ({ outcomes: new Map(input.outcomes).set(id, {
    ...refused, provisional: { candidate: accepted.accepted! },
  } as MemberDesignOutcome), iterations: [], result: { assemblies: [], reverification: [] },
  physicalSearch: { changed: [id] } } as never));
  const transaction = vi.spyOn(modelStore, 'reinforcementTransaction');
  expect(detailingStore.generate()).not.toBeNull();
  expect(modelStore.elements.get(id)!.reinforcement).toBeUndefined();
  expect(verificationStore.outcomeFor(id)).toEqual(refused);
  expect(transaction).not.toHaveBeenCalled();
});
