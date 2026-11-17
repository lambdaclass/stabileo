import { afterEach, beforeAll, expect, it } from 'vitest';
import { modelStore, uiStore } from '../../store';
import { makeFrame, allChoices, planeSigns } from '../frame';
import { planeInputIn } from '../plane-input';
import { solveReference } from '../../engine/steps/reference';
import { initSolver } from '../../engine/wasm-solver';

beforeAll(async () => { await initSolver(); });
afterEach(() => modelStore.clear());

for (const global of [true, false]) for (const angle of [0, 30, -30, 90]) {
  it(`#2259 resolved ${global ? 'global' : 'local'} plane loads at ${angle} degrees preserve reflected physical reactions`, () => {
    uiStore.analysisMode = '2d';
    modelStore.clear();
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(4, 2);
    const e = modelStore.addElement(a, b);
    modelStore.addSupport(a, 'fixed');
    modelStore.addDistributedLoad(e, -7, -3, angle, global);
    modelStore.addPointLoadOnElement(e, 1, -5, { angle, isGlobal: global, my: 2 });
    const input = modelStore.buildSolverInput(false)!;
    for (const load of input.loads) {
      expect(load.data).not.toHaveProperty('isGlobal');
      expect(load.data).not.toHaveProperty('angle');
    }
    const base = solveReference(input)!;
    expect(base).not.toBeNull();
    for (const choice of allChoices()) {
      const frame = makeFrame(choice), p = planeSigns(frame);
      const actual = solveReference(planeInputIn(input, frame))!;
      expect(actual).not.toBeNull();
      for (const [id, r] of base.reactions) {
        const got = actual.reactions.get(id)!;
        expect(got.rx).toBeCloseTo(p.sx * r.rx, 12);
        expect(got.rz).toBeCloseTo(p.sz * r.rz, 12);
        expect(got.my).toBeCloseTo(p.sr * r.my, 12);
      }
    }
  });
}
