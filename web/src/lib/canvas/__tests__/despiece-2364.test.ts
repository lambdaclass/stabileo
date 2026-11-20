import { afterEach, expect, it, vi } from 'vitest';
import { featuresForMode } from '../../../../config/public-features.mjs';
import { axesStore } from '../../axes/axes.svelte';
import { allChoices, DEFAULT_AXES, makeFrame, planeSigns } from '../../axes/frame';
import { solvePDelta } from '../../engine/wasm-solver';
import { modelStore, resultsStore, uiStore } from '../../store';
import { inspectMember, inspectNode } from '../draw-despiece';
import { freeBodyActions2D } from '../free-body-2d';

afterEach(() => {
  vi.unstubAllGlobals();
  axesStore.reset();
});

function cantilever(vertical: boolean, reversed: boolean, nonlinear: boolean, axialOnly = false) {
  uiStore.analysisMode = '2d';
  modelStore.clear();
  const x = vertical ? 0 : 4;
  const z = vertical ? 4 : 0;
  const fx = axialOnly ? 10 : vertical ? 10 : 0;
  const fz = vertical || axialOnly ? 0 : -10;
  const couple = axialOnly ? 0 : 3;
  const fixed = modelStore.addNode(0, 0);
  const tip = modelStore.addNode(x, z);
  const element = modelStore.addElement(reversed ? tip : fixed, reversed ? fixed : tip, 'frame');
  modelStore.addSupport(fixed, 'fixed');
  modelStore.addNodalLoad(tip, fx, fz, couple);
  if (nonlinear) {
    const result = solvePDelta(modelStore.buildSolverInput(false)!);
    expect(result.converged).toBe(true);
    expect(result.isStable).toBe(true);
    resultsStore.setPDeltaResult(result);
  } else {
    const result = modelStore.solve();
    if (!result || typeof result === 'string') throw new Error(`Solve refused: ${result}`);
    resultsStore.setResults(result);
  }
  return {
    fixed, tip, element, x, z, fx, fz, couple,
    args: {
      elements: [{ id: element, nodeI: reversed ? tip : fixed, nodeJ: reversed ? fixed : tip }],
      getNode: (id: number) => modelStore.nodes.get(id),
      getElementForces: (id: number) => resultsStore.getElementForces(id),
      basis: 'global' as const,
    },
  };
}

const cases = (['production', 'test'] as const).flatMap(mode =>
  [false, true].flatMap(nonlinear =>
    [false, true].flatMap(vertical =>
      [false, true].map(reversed => ({ mode, nonlinear, vertical, reversed })),
    ),
  ),
);

it.each(cases)(
  '#2364 global end actions balance and match glyphs ($mode, nonlinear=$nonlinear, vertical=$vertical, reversed=$reversed)',
  ({ mode, nonlinear, vertical, reversed }) => {
    vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode(mode));
    const { element, fixed, tip, x, z, fx, fz, couple, args } = cantilever(vertical, reversed, nonlinear);

    for (const choice of mode === 'test' ? allChoices() : [DEFAULT_AXES]) {
      axesStore.choice = choice;
      const { h, v, n, sx, sz, sr } = planeSigns(makeFrame(choice));
      const [i, j] = inspectMember(args, element)!.ends;
      const [hi, zi, mi] = i.components;
      const [hj, zj, mj] = j.components;
      const span = reversed ? -1 : 1;
      expect(hi.value + hj.value).toBeCloseTo(0, 6);
      expect(zi.value + zj.value).toBeCloseTo(0, 6);
      expect(mi.value + mj.value + span * (sx * x * zj.value - sz * z * hj.value)).toBeCloseTo(0, 6);

      const atFixed = inspectNode(args, fixed).actions[0];
      const atTip = inspectNode(args, tip).actions[0];
      expect(atFixed).toEqual(reversed ? j : i);
      expect(atTip).toEqual(reversed ? i : j);
      expect(atFixed.components[2].value).toBeCloseTo(-sr * (x * fz - z * fx + couple), 6);
      expect(atTip.components[0].value).toBeCloseTo(sx * fx, 6);
      expect(atTip.components[1].value).toBeCloseTo(sz * fz, 6);
      expect(atTip.components[2].value).toBeCloseTo(sr * couple, 6);
      expect(atFixed.components.map(c => c.label)).toEqual([
        `F${h.toLowerCase()}`, `F${v.toLowerCase()}`, mode === 'test' ? `M${n.toLowerCase()}` : 'M',
      ]);

      const drawn = freeBodyActions2D({ ...args, reactions: new Map(), resultant: false, showReactions: false });
      for (const side of ['member', 'node'] as const) {
        const moment = drawn.ends.find(e => e.nodeId === fixed && e.side === side)!.actions.find(a => a.kind === 'moment')!;
        expect(moment.magnitude * (moment.ccw ? 1 : -1)).toBeCloseTo((side === 'member' ? -1 : 1) * (x * fz - z * fx + couple), 6);
      }
    }
  },
);

it.each(['production', 'test'] as const)('keeps a pure axial cantilever in equilibrium (%s)', (mode) => {
  vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode(mode));
  const { element, fixed, fx, args } = cantilever(false, true, false, true);
  const fixedEnd = inspectMember(args, element)!.ends.find(e => e.nodeId === fixed)!;
  const [horizontal, vertical, moment] = fixedEnd.components;
  expect(horizontal.value).toBeCloseTo(-fx, 6);
  expect(vertical.value).toBeCloseTo(0, 6);
  expect(moment.value).toBeCloseTo(0, 6);
});
