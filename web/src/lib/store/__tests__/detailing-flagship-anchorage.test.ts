/**
 * The 408-member flagship (`rc-design-frame`), designed and detailed: every bar end at an
 * interior support is spliced, run through or continued into the next span, and what the
 * design verified at each bar end in a support is what was built: no end is left unresolved.
 *
 * The floor's layout search does not close on this frame (132 of its 160 joints have no beam
 * layout clearing the column cage, `coordination.limiting.noLayoutClearsJoint`), and transitions
 * used to be planned only against the search's assignment — so not one lap was built and 1 362
 * bar ends stopped in a column with its depth to develop in. A splice does not depend on the bars
 * threading the column; that clash is the collision check's to report. Transitions are now
 * planned against each member's own layout where the search closed none, a row meeting a wider
 * row takes its nearest partners (`planSplice`), a bar fused through one support goes on to the
 * next one's splice, and a bar with no partner across the joint is continued until it develops.
 */
import { it, expect, beforeAll, describe } from 'vitest';
import { modelStore } from '../model.svelte';
import { uiStore } from '../ui.svelte';
import '../index';
import { designRunStore } from '../design-run.svelte';
import { verificationStore } from '../verification.svelte';
import { initSolver } from '../../engine/wasm-solver';
import { resultsStore } from '../results.svelte';
import { solveCombinations3D, validateAndSolve3D } from '../../engine/solver-service';
import type { BarPath } from '../../codes/cirsoc201/bar-geometry';
import { anchorageCoherence } from './anchorage-coherence';

beforeAll(async () => { await initSolver(); });

describe('the flagship frame: every interior support spliced, every end built as the design verified it', () => {
  let bars: BarPath[] = [];
  beforeAll(async () => {
    await modelStore.loadExample('rc-design-frame');
    uiStore.analysisMode = 'pro';
    const combo: any = solveCombinations3D(modelStore.model as never, modelStore.model.loadCases, modelStore.model.combinations, true, false);
    resultsStore.setResults3D(validateAndSolve3D(modelStore.model as never, true, false) as never);
    resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
    // The whole frame, whatever the machine: the user's 20 s cap (`DEFAULT_RUN_MS`) stops the run
    // on a slower runner with members not designed, and the assertions below are about all of them.
    // The engine's tests on this frame give `runDesign` the same 180 s.
    designRunStore.designAll({ maxRunMs: 180_000 });
    const summary = verificationStore.runSummary;
    if (!summary || summary.aborted || summary.notReached > 0) throw new Error(`design all left the frame incomplete: aborted ${summary?.aborted}, not reached ${summary?.notReached}`);
    bars = (modelStore.model.detailing?.assemblies ?? []).flatMap((a) => a.bars);
  }, 600_000);

  const ends = () => bars.flatMap((b) => (['start', 'end'] as const).flatMap((s) => (b.anchorage?.[s] ? [{ b, s, r: b.anchorage[s]! }] : [])));

  it('no end at an interior support is left unresolved or pending, and the supports are spliced', () => {
    const interior = ends().filter((e) => e.r.support === 'interior');
    expect(interior.filter((e) => e.r.solution === 'unresolved' || e.r.solution === 'pending').map((e) => `${e.b.id}:${e.s}`)).toEqual([]);
    for (const e of interior) expect(e.r.available, `${e.b.id}:${e.s}`).toBeGreaterThanOrEqual(e.r.required - 1e-9);
    expect(interior.filter((e) => e.r.solution === 'lap').length).toBeGreaterThan(500);
  });

  it('every bar end the detailing built is the end the design verified, and none is unresolved', () => {
    // 36 ends were left unresolved here, every one a Ø32 of beams 161–200 hooked into a 50×50
    // edge column (35,0–40,7 cm against ldh 58,9 cm): the design had passed bars the column could
    // not hold. It now checks each end as the detailing builds it (`end-support-anchorage.ts`) and
    // chose bars that anchor there; what it verified at each end is what was built.
    expect(ends().filter((e) => e.r.solution === 'unresolved').map((e) => `${e.b.id}:${e.s}`)).toEqual([]);
    const coherence = anchorageCoherence(bars);
    expect(coherence.mismatches).toEqual([]);
    expect(coherence.compared).toBe(ends().filter((e) => e.b.role === 'longitudinal').length);
    expect(coherence.atEnds).toBeGreaterThan(1000);
  });
});
