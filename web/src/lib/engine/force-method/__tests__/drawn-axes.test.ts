/**
 * The flexibility wizard shows plane bars in their drawn axes, like the rest
 * of the app: the same beam reads the same whichever end was drawn first.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { historyStore, modelStore, uiStore } from '../../../store';
import { solveForceMethod } from '../solve';
import { forceMethodToDrawnAxes } from '../drawn-axes';

beforeEach(() => { historyStore.clear(); uiStore.analysisMode = '2d'; modelStore.clear(); });

function propped(rightToLeft: boolean) {
  historyStore.clear(); modelStore.clear();
  const a = modelStore.addNode(0, 0), b = modelStore.addNode(6, 0);
  const e = rightToLeft ? modelStore.addElement(b, a) : modelStore.addElement(a, b);
  modelStore.addSupport(a, 'fixed'); modelStore.addSupport(b, 'rollerX');
  modelStore.addDistributedLoad(e, -10, -10, 0, true);
  return forceMethodToDrawnAxes(solveForceMethod(modelStore.buildSolverInput(false)!));
}

describe('forceMethodToDrawnAxes', () => {
  it('a propped cantilever reads the same moment at the wall, drawn either way', () => {
    const l = propped(false), r = propped(true);
    const wallL = l.final.bars[0].ends.mStart;          // the wall is I
    const wallR = r.final.bars[0].ends.mEnd;            // the wall is J
    expect(Math.abs(wallL)).toBeCloseTo(45, 4);         // qL²/8
    expect(wallR).toBeCloseTo(wallL, 6);
    // The coefficients are products of two diagrams: unchanged.
    expect(r.delta[0][0]).toBeCloseTo(l.delta[0][0], 9);
    expect(r.verification.ok).toBe(true);
  });
});
