/**
 * «Design all» after a member is deleted designs again every member the design had answered for.
 *
 * Measured on qa-8 before: a first «design all» verified six members and refused two (e5, e6:
 * SEARCH_EXHAUSTED, no bars). Deleting e8 cleared every outcome and the kept refusals (they were
 * reached on the model before the deletion), and the second «design all» designed e5 and e6
 * alone (runCounts().total 2): the five with bars counted as designed, had no outcome, and the
 * detailing refused them as not verified. The selection played no part: it was empty.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { modelStore } from '../model.svelte';
import { resultsStore } from '../results.svelte';
import { verificationStore } from '../verification.svelte';
import { designRunStore } from '../design-run.svelte';
import { uiStore } from '../ui.svelte';
import * as wasmSolver from '../../engine/wasm-solver';
import '../index';

async function solve(): Promise<void> {
  const solved = await modelStore.solveCombinations3DParallel(true, false, true);
  const r = solved as { perCase: never; perCombo: never; envelope: never };
  resultsStore.setCombinationResults3D(r.perCase, r.perCombo, r.envelope);
}

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
}, 60_000);

describe('«design all» after a deletion', () => {
  it('designs every member left, the ones with bars included, and keeps a hand-edited one', async () => {
    await modelStore.loadExample('rc-design-qa-8');
    await solve();
    expect(designRunStore.designAll().ok).toBe(true);
    const ids = [...modelStore.elements.keys()].sort((a, b) => a - b);
    const victim = ids[ids.length - 1]!;
    const withBars = ids.filter((id) => id !== victim && !!modelStore.elements.get(id)?.reinforcement);
    expect(withBars.length, 'the premise: members designed with bars').toBeGreaterThan(2);
    // One of them edited by hand: «design all» leaves it to its author.
    const edited = withBars[0]!;
    designRunStore.markManual([edited]);

    uiStore.clearSelection();
    modelStore.removeElement(victim);
    await solve();
    expect(designRunStore.designAll().ok).toBe(true);

    const left = ids.filter((id) => id !== victim);
    const answered = left.filter((id) => verificationStore.outcomeFor(id) !== undefined);
    expect(answered).toEqual(left.filter((id) => id !== edited));
    expect(verificationStore.runSummary?.total).toBe(left.length - 1);
  }, 600_000);
});
