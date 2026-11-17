/**
 * The four steps at the top of the Design stage, from the readings the concrete pipeline resolves
 * and the desk's list: each step's state, what it waits on, and the count it shows.
 */
import { describe, it, expect } from 'vitest';
import { designSteps, type SizeCounts } from '../design-steps';
import type { RcFlowReadings } from '../../flow/rc-stages';

const NOTHING: RcFlowReadings = {
  hasModel: false, solved: false, analysisStale: false, codeChosen: false, hasDemands: false,
  designApplicable: 0, designProposed: 0, designVerified: 0, designUnresolved: 0,
  detailed: false, documented: false,
};
const r = (o: Partial<RcFlowReadings>): RcFlowReadings => ({ ...NOTHING, ...o });
const size = (o: Partial<SizeCounts> = {}): SizeCounts => ({ total: 0, fail: 0, stale: 0, unchecked: 0, ...o });
const state = (s: ReturnType<typeof designSteps>, id: string) => s.find((x) => x.id === id)!;

describe('the design steps', () => {
  it('an empty project prepares, and nothing after it can start', () => {
    const s = designSteps(NOTHING, size());
    expect(state(s, 'prepare').state).toBe('current');
    expect(state(s, 'prepare').todoKey).toBe('design.stage.needModel');
    expect(state(s, 'size').state).toBe('blocked');
    expect(state(s, 'detail').state).toBe('blocked');
    expect(state(s, 'document').state).toBe('optional');
  });

  it('a solved model with a code is prepared; sizing is then the step in hand', () => {
    const s = designSteps(r({ hasModel: true, solved: true, codeChosen: true, hasDemands: true, designApplicable: 4 }), size({ total: 4, unchecked: 4 }));
    expect(state(s, 'prepare').state).toBe('complete');
    expect(state(s, 'size').state).toBe('current');
    expect(state(s, 'size').todoKey).toBe('desk.step.todo.unchecked');
  });

  it('members out of date keep sizing unfinished, say why, and are counted', () => {
    const s = designSteps(r({ hasModel: true, solved: true, codeChosen: true, hasDemands: true, designApplicable: 4, designProposed: 4 }), size({ total: 4, stale: 3 }));
    expect(state(s, 'size').state).toBe('current');
    expect(state(s, 'size').todoKey).toBe('desk.step.todo.stale');
    expect(state(s, 'size').count).toBe(3);
  });

  it('every member verifying finishes sizing; open conflicts keep detailing unfinished', () => {
    const base = { hasModel: true, solved: true, codeChosen: true, hasDemands: true, designApplicable: 4, designProposed: 4, designVerified: 4 };
    const s = designSteps(r({ ...base, detailed: true, detailingConflicts: 2 }), size({ total: 4 }));
    expect(state(s, 'size').state).toBe('complete');
    expect(state(s, 'detail').state).toBe('current');
    expect(state(s, 'detail').todoKey).toBe('desk.step.todo.conflicts');
    expect(state(s, 'detail').count).toBe(2);
  });

  it('a solved concrete frame without demands yet has detailing ahead of it, not optional', () => {
    const s = designSteps(r({ hasModel: true, solved: true, codeChosen: true }), size(), { hasConcrete: true });
    expect(state(s, 'detail').state).toBe('pending');
  });

  it('a model with no concrete to design has nothing to detail: the step is not one it has to take', () => {
    const s = designSteps(r({ hasModel: true, solved: true, codeChosen: true, hasDemands: true }), size({ total: 8 }), { hasConcrete: false });
    expect(state(s, 'size').state).toBe('complete');
    expect(state(s, 'detail').state).toBe('optional');
  });
});
