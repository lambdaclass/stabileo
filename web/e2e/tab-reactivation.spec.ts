/**
 * What returning from another browser tab actually costs.
 *
 * ── Why this is measured and not just asserted ─────────────────────
 *
 * The viewport used to rebuild every tube whenever the scene OBJECT changed, and `filterScene`
 * returns a fresh object on every recompute. Any reactive touch rebuilt 20 917 tubes. Coming
 * back from another tab was the worst case: `requestAnimationFrame` is suspended while hidden,
 * Svelte flushes every pending effect the instant it returns, and the user got a frozen camera
 * and dead controls for about three seconds.
 *
 * `sceneSignature` fixed the cause. This measures the result, because a fix to a latency
 * problem that nobody timed is a hope.
 *
 * ── The limitation, stated ─────────────────────────────────────────
 *
 * Playwright cannot reproduce Chrome's real background throttling: a page driven by CDP is
 * never truly backgrounded, and `page.emulateMedia` does not touch the visibility state. So
 * this dispatches `visibilitychange` directly. That exercises every listener and every effect
 * flush the real transition triggers — which is where the cost was — but it does NOT reproduce
 * the timer clamping or the rAF suspension that precede them. The numbers here are therefore a
 * FLOOR on the real-world improvement, not a simulation of it.
 */
import { test, expect, designAll, loadModel, openDocumentsStage } from './fixtures';

type Page = import('@playwright/test').Page;

async function openWorkspace(page: Page, example: string, withFloors = false) {
  await loadModel(page, example);
  await designAll(page);
  await page.getByTestId('detailing-disclosure').locator('> summary').click();
  const gen = page.getByTestId('cmd-generate-detailing');
  await expect(gen).toBeEnabled();
  await gen.click();
  await expect.poll(async () => page.evaluate(() =>
    (window.__stabileo as unknown as { detailingAssemblies(): unknown[] })
      .detailingAssemblies().length), { timeout: 30_000 }).toBeGreaterThan(0);
  if (withFloors) {
    await page.getByTestId('floor-families-disclosure').locator('> summary').click();
    const f = page.getByTestId('floor-design-run');
    await expect(f).toBeEnabled();
    await f.click();
    await expect(page.getByTestId('floor-families')).toBeVisible();
  }
  await openDocumentsStage(page);
  await page.getByTestId('doc-3d').click();
  await expect(page.getByTestId('rebar-workspace')).toBeVisible();
  /**
   * Let the setup settle before anything is timed.
   *
   * Loading a 203-member model, solving it and detailing it leaves real work queued — measured
   * at ~2 500 ms of it immediately after `loadModel`, with no workspace open at all. A
   * benchmark that reactivates on top of that queue times its own setup and blames the tab
   * switch: the first run of this file reported 2 439 ms and the cost was never the return.
   */
  await page.waitForTimeout(3000);
}

/** Drive the tab hidden and back, and time what the user would wait for. */
async function reactivate(page: Page) {
  return page.evaluate(async () => {
    const fire = (state: string) => {
      Object.defineProperty(document, 'visibilityState',
        { configurable: true, get: () => state });
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event(state === 'hidden' ? 'blur' : 'focus'));
    };
    fire('hidden');
    await new Promise((r) => setTimeout(r, 120));

    const t0 = performance.now();
    fire('visible');
    // One frame plus one macrotask is where a synchronous rebuild would land.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const afterFrame = performance.now() - t0;
    await new Promise((r) => setTimeout(r, 0));
    return { afterFrame, canvases: document.querySelectorAll('canvas').length };
  });
}

/** How long the side panel takes to answer a click. */
async function panelResponse(page: Page): Promise<number> {
  const t0 = Date.now();
  await page.getByTestId('rebar-element-list').locator('button').first().click();
  await expect(page.getByTestId('rebar-sel-parent')).toBeVisible();
  return Date.now() - t0;
}

/**
 * Budgets in milliseconds to the first frame after returning, per model.
 *
 * ── The history, because the numbers only mean something with it ───
 *
 * Three separate costs were confused with each other here, and each was fixed by a different
 * change:
 *
 *   · re-tubing 20 917 bars whenever the scene OBJECT changed — fixed by `sceneSignature`;
 *   · re-PROJECTING the document on every reactive touch, ~2,4 s of `samplePath` — fixed by
 *     `cachedSceneModel`;
 *   · re-tubing them again to answer a LAYER SWITCH, because a filtered scene is a different
 *     scene — fixed by batching the merge per family and switching `mesh.visible`.
 *
 * ── Why the big model's ceiling is STILL 9 000 ms ──────────────────
 *
 * Because the measurement has not moved, and lowering the number without the measurement moving
 * is how a gate stops meaning anything. Measured after the third fix: 2 356 ms on this building,
 * against a recorded spread of 2 405, 2 512 and 6 355 ms before it. The ceiling was chosen for
 * that spread and the spread is unchanged.
 *
 * What is left is not a rebuild — the assertion below proves that outright — it is ONE FRAME.
 * This suite draws on SwiftShader, a software rasteriser, and the 7-storey document carries
 * 39 240 open conflicts, each a 10 × 8 sphere: about 6,3 million triangles of translucent marker,
 * six times the reinforcement's own 1,0 million. Reactivation flushes the pending effects and the
 * frame they land on has to rasterise all of it on the CPU. That frame is expensive for a reason
 * this code does not reach, and `rebar-viewport-cost.spec.ts` measures the same switch with the
 * markers off — 490 ms against 6 131 — so the attribution is on the record rather than assumed.
 *
 * So the millisecond ceiling stays where the data puts it, and the REAL gate is the build counter
 * added below: whatever the frame costs, not one tube may be rebuilt on the way back. A stopwatch
 * on a shared runner can always be explained away; a counter that went up cannot.
 *
 * The measurements are printed, so a future change to these numbers can be argued from data
 * rather than from memory. The first version of this file reactivated on top of an unsettled
 * setup and timed its own `loadModel` — ~2 500 ms with no workspace open at all — and concluded
 * the tab switch was the problem.
 */
const REACTIVATION_BUDGET_MS = { 'small control': 600, '7-storey building': 9000 } as const;

/**
 * Milliseconds for the side panel to answer a click, per model.
 *
 * Not a tab-switch cost: the same click costs the same with the tab never hidden. Selecting a
 * member recomputes the filter, the summary and the piece counts over every bar — 20 917 of them
 * on this building, measured at about 5 ms — and then asks the camera to fly to the member, which
 * is where any remaining frames are spent.
 *
 * This one HAS moved, so its ceiling moves with it: 1 527 ms measured against a 9 000 ms
 * placeholder set while the rebuild was still in the path. 6 000 ms leaves room for a contended
 * run and would still catch the rebuild coming back.
 */
const PANEL_BUDGET_MS = { 'small control': 4000, '7-storey building': 6000 } as const;

for (const [label, example, floors] of [
  ['small control', 'rc-qa-diagnostic', false],
  ['7-storey building', 'pro-edificio-7p', true],
] as const) {
  test.describe(`returning to the tab — ${label}`, () => {
    test('the workspace answers immediately and keeps its state', async ({ pro: page }) => {
      test.setTimeout(300_000);
      await openWorkspace(page, example, floors);

      // Set a state a rebuild would destroy, and a selection to compare against.
      await page.getByTestId('rebar-layer-footing').uncheck();
      await page.getByTestId('rebar-element-list').locator('button').first().click();
      const before = await page.getByTestId('rebar-sel-parent').innerText();
      const canvasesBefore = await page.evaluate(() => document.querySelectorAll('canvas').length);

      const buildsBefore = await page.evaluate(() => window.__stabileo.rebarSceneBuilds());
      const { afterFrame, canvases } = await reactivate(page);
      const buildsAfter = await page.evaluate(() => window.__stabileo.rebarSceneBuilds());

      // Held to this model's own budget, and printed so the next person to touch the number can
      // argue from data.
      console.log(`\n${label}: first frame after returning ${afterFrame.toFixed(0)} ms, `
        + `tube builds ${buildsBefore} → ${buildsAfter}\n`);
      expect(afterFrame, `first frame after returning (${label})`)
        .toBeLessThan(REACTIVATION_BUDGET_MS[label]);
      /**
       * And not one tube rebuilt on the way back.
       *
       * This is the property, where the millisecond count is only evidence for it. Returning from
       * a hidden tab is where Svelte flushes every pending effect at once, so it is the single
       * most likely place for a rebuild to reappear unnoticed.
       */
      expect(buildsAfter, `tubes rebuilt by returning to the tab (${label})`).toBe(buildsBefore);

      // No new WebGL context: a leaked one per reactivation is how the viewport silently
      // stops rendering after a dozen visits.
      expect(canvases).toBe(canvasesBefore);

      // Nothing the user had set is lost.
      await expect(page.getByTestId('rebar-layer-footing')).not.toBeChecked();
      await expect(page.getByTestId('rebar-sel-parent')).toHaveText(before);

      /**
       * The panel's own response, timed separately from the frame.
       *
       * These are different costs and conflating them hid which one was real: the same click costs
       * the same with the tab never hidden, so it was never a tab-switch cost at all. Kept as its
       * own number and its own ceiling for that reason.
       */
      const panel = await panelResponse(page);
      console.log(`${label}: panel response ${panel} ms\n`);
      expect(panel, `panel response (${label})`).toBeLessThan(PANEL_BUDGET_MS[label]);
    });

    test('repeated switching does not accumulate contexts', async ({ pro: page }) => {
      test.setTimeout(300_000);
      await openWorkspace(page, example, floors);
      const start = await page.evaluate(() => document.querySelectorAll('canvas').length);
      for (let i = 0; i < 5; i++) await reactivate(page);
      // Five round trips. A context or a canvas per trip is the leak this catches.
      expect(await page.evaluate(() => document.querySelectorAll('canvas').length)).toBe(start);
      await expect(page.getByTestId('rebar-canvas')).toBeVisible();
    });
  });
}
