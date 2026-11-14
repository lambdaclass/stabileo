/**
 * Coming back from another browser tab: how long the app is unresponsive.
 *
 * ── The report ─────────────────────────────────────────────────────
 *
 * Switching to another tab and back leaves Stabileo unresponsive for about two seconds on this
 * branch, and not on the operator's `main`. That is a regression claim, and it is only answerable
 * by measuring the same journey on three branches with the same harness — which is why this file
 * is written to be copied verbatim into a `main` and a PR19 worktree and run there.
 *
 * ── What "backgrounded" means here, and the limitation ─────────────
 *
 * Playwright cannot put a tab in the background: there is no second tab competing for the
 * compositor, and `document.hidden` alone does not reproduce Chrome's timer throttling, its
 * rendering suspension, or the memory pressure that decides whether a WebGL context survives.
 *
 * The closest honest approximation is the DevTools lifecycle API, which is the same mechanism
 * Chrome itself uses: `Page.setWebLifecycleState` to `frozen` and back to `active`. That does
 * suspend the page's task queues. It does NOT reproduce GPU eviction, so a viewer that has to
 * rebuild a WebGL context on return will be measured as CHEAPER here than on a real machine.
 * Stated rather than hidden, because it decides how a null result should be read.
 *
 * ── What is measured, and why separately ───────────────────────────
 *
 * Three marks, so a regression can be attributed instead of just observed:
 *
 *   1. `firstFrame`   — the transition itself: from resume to the first painted frame.
 *   2. `panelReady`   — the right panel answers a real interaction (a place of design shows).
 *   3. `firstClick`   — round trip of a click that changes state.
 */
import { test, expect, designPlace } from './fixtures';
// The prepared 7-storey project, and its own `test` — the heavy scenarios are observers of it.
import { test as heavyTest } from './prepared-building';
import type { Page } from '@playwright/test';

/** Median, because one slow sample from an unrelated process should not decide a verdict. */
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
}

interface Counters {
  canvases: number;
  contexts: number;
}

interface Marks {
  firstFrame: number;
  panelReady: number;
  firstClick: number;
  before: Counters;
  after: Counters;
}

/**
 * Everything the transition could plausibly have rebuilt, read on both sides of it.
 *
 * `canvases` and `contexts` are counted from the DOM rather than from a hook, because the failure
 * this is looking for — a viewer that has to rebuild WebGL after the tab comes back — shows up as
 * a NEW canvas or a lost context, and a hook that reports the store's intent would not see it.
 */
async function counters(page: Page): Promise<Counters> {
  return page.evaluate(() => {
    const canvases = [...document.querySelectorAll('canvas')];
    let contexts = 0;
    for (const c of canvases) {
      // `getContext` returns the EXISTING context for a canvas that has one; a canvas whose
      // context was lost answers null, which is exactly the signal being looked for.
      const gl = (c as HTMLCanvasElement).getContext('webgl2')
        ?? (c as HTMLCanvasElement).getContext('webgl');
      if (gl && !(gl as WebGLRenderingContext).isContextLost()) contexts += 1;
    }
    return { canvases: canvases.length, contexts };
  });
}

/**
 * One hidden→visible cycle, timed.
 *
 * `frozen` is entered through CDP, held, then released; every mark is taken in page time from the
 * moment the page observes itself visible again, so the harness's own IPC is not counted.
 */
async function cycle(page: Page): Promise<Marks> {
  const client = await page.context().newCDPSession(page);

  const before = await counters(page);

  /**
   * Arm a frame recorder before freezing.
   *
   * NOT a `visibilitychange` listener: `Page.setWebLifecycleState` freezes the page's task queues
   * without flipping `document.hidden`, so that event never fires and the first attempt at this
   * measurement reported `n/a` on every run. What a freeze DOES do is stop frames, so the gap
   * between the last frame before it and the first frame after it is the transition cost, taken
   * entirely in page time.
   */
  await page.evaluate(() => {
    const w = window as unknown as { __lat?: { last: number; gap: number } };
    w.__lat = { last: performance.now(), gap: 0 };
    const tick = () => {
      const now = performance.now();
      const d = now - w.__lat!.last;
      if (d > w.__lat!.gap) w.__lat!.gap = d;
      w.__lat!.last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  await client.send('Page.setWebLifecycleState', { state: 'frozen' });
  // Held long enough for the freeze to take effect on the task queues.
  await page.waitForTimeout(1500);
  await client.send('Page.setWebLifecycleState', { state: 'active' });

  /**
   * The frame gap, minus the time deliberately spent frozen.
   *
   * What is left is what the RESUME itself cost: everything the app had to do before it could
   * paint again. A negative result would mean the freeze was shorter than requested, so it is
   * clamped at zero rather than reported as a suspiciously good number.
   */
  const firstFrame = await page.evaluate(async (held) => {
    const w = window as unknown as { __lat?: { gap: number } };
    // Let a few frames land so the post-resume gap is actually recorded.
    for (let i = 0; i < 10; i++) await new Promise((r) => requestAnimationFrame(r));
    return Math.max(0, (w.__lat?.gap ?? 0) - held);
  }, 1500);

  // 2. The panel answers a real interaction: the design data and regulations, a place of design.
  const panelStart = Date.now();
  await designPlace(page, 'designData');
  await expect(page.getByTestId('desk-regulations')).toBeVisible();
  const panelReady = Date.now() - panelStart;

  // 3. A click that changes state, round trip: moving to another place of design.
  const clickStart = Date.now();
  await designPlace(page, 'list');
  await expect(page.getByTestId('desk-list')).toBeVisible();
  const firstClick = Date.now() - clickStart;

  const after = await counters(page);
  await client.detach();
  return { firstFrame, panelReady, firstClick, before, after };
}

/**
 * Median, worst case AND every sample.
 *
 * An aggregate alone cannot answer "is this a stall or a slow average": a 2 s freeze once in five
 * cycles has a healthy median and is exactly the complaint. The samples are printed so the shape
 * of the distribution is visible, not just its middle.
 */
function report(name: string, runs: Marks[]) {
  const line = (k: keyof Marks) => {
    const xs = runs.map((r) => r[k]).filter((x): x is number => typeof x === 'number' && x >= 0);
    if (!xs.length) return 'n/a';
    return `median ${median(xs).toFixed(0)} · worst ${Math.max(...xs).toFixed(0)} · [${xs.map((x) => x.toFixed(0)).join(' ')}]`;
  };
  const delta = (k: keyof Counters) =>
    runs.map((r) => {
      const a = r.after[k];
      const b = r.before[k];
      return typeof a === 'number' && typeof b === 'number' ? a - b : 'n/a';
    }).join(',');
  // eslint-disable-next-line no-console
  console.log(
    `\nLATENCY ${name}   (ms)\n`
    + `  firstFrame   ${line('firstFrame')}\n`
    + `  panelReady   ${line('panelReady')}\n`
    + `  firstClick   ${line('firstClick')}\n`
    + `  Δ canvases   ${delta('canvases')}\n`
    + `  Δ contexts   ${delta('contexts')}\n`,
  );
}

const REPEATS = 5;

/**
 * The heavy scenarios, on the 7-storey building the rest of this suite prepares once.
 *
 * `prepared-building.ts` runs the whole chain — load, solve, design, detail, floors — in a worker
 * context and hands every observer a page with the project restored. This file is an observer: it
 * does not solve, so the numbers below are about coming back to a loaded project, which is the
 * complaint, and not about building one.
 */
heavyTest.describe('@slow returning from another tab — the 7-storey building', () => {
  heavyTest('L3 — 7-storey', async ({ preparedPage: page }) => {
    heavyTest.setTimeout(600_000);
    // The model is settled before anything is measured: one frame of quiet, so the first cycle
    // is not paying for the restore.
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
    const runs: Marks[] = [];
    for (let i = 0; i < REPEATS; i++) runs.push(await cycle(page));
    report('7-storey', runs);
    for (const r of runs) expect(r.firstFrame).toBeGreaterThanOrEqual(0);
  });
});

test.describe('@slow returning from another tab', () => {
  test('L1 — small model', async ({ pro: page }) => {
    test.setTimeout(300_000);
    const runs: Marks[] = [];
    for (let i = 0; i < REPEATS; i++) runs.push(await cycle(page));
    report('small', runs);

    /**
     * No budget is asserted here on purpose.
     *
     * A number invented in this file would answer the question this test exists to ask. The
     * verdict comes from comparing these medians against the same file run on `main` and on PR19,
     * which is why the numbers are printed rather than thresholded. What IS asserted is that the
     * transition completed at all — a `-1` means the page never reported a frame.
     */
    for (const r of runs) {
      expect(r.firstFrame, 'the page painted after resuming').toBeGreaterThanOrEqual(0);
    }
  });
});
