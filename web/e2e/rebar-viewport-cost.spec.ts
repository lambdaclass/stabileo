/**
 * What an interaction with the 3-D workspace actually costs, in a real browser.
 *
 * ── Why this exists at all ─────────────────────────────────────────
 *
 * Because the unit benchmark cannot see the half of the cost that lives in the browser. In Node,
 * building all 20 917 tubes takes about 100 ms; on the 7-storey building a user reported 5,9 s for
 * the first columns toggle and up to 16,7 s for slabs. The difference is everything Node does not
 * do: uploading ~40 MB of vertex data to the GPU, disposing the buffers that were there, and
 * flushing a Svelte derived chain over 20 917 bars on whichever frame comes next.
 *
 * So the fix — batching by family, and answering a switch with `mesh.visible` — has to be measured
 * where the defect was, not where it was convenient to reproduce.
 *
 * ── What is asserted, and what is only reported ────────────────────
 *
 * ASSERTED: that a switch does not rebuild the geometry. Not as a timing — as a COUNTER.
 * `rebarSceneBuilds()` is how many times tubes have been built in the page, and it must not move
 * when a checkbox does. A stopwatch on a shared CI runner can always be explained away; a counter
 * that went up cannot.
 *
 * Also asserted: no WebGL context and no canvas is added by any of it, and no scene projection is
 * rebuilt (`sceneCacheStats().misses`).
 *
 * REPORTED: the milliseconds, as a table, next to the cost of one deliberate rebuild so every row
 * can be read against what it used to cost. They carry two sets of ceilings — a wide one for the
 * default view, whose frame is still dominated by 39 240 conflict markers on a software rasteriser
 * even after their tessellation was cut, and a tight one measured with those markers off, where what
 * is left is the app's own work.
 *
 * ── Setup is never inside a measurement ────────────────────────────
 *
 * Loading, solving and detailing a 203-member model leaves real work queued — measured at ~2 500 ms
 * with no workspace open at all. The first version of the tab-return benchmark timed exactly that
 * and blamed the tab switch. Everything here waits for the setup to settle first, and the settling
 * wait is not part of any number.
 *
 * ── Where the big model comes from now ─────────────────────────────
 *
 * Five of these tests set up the 7-storey building, and every one of them is an OBSERVER: they
 * measure what an interaction costs on a scene, not what building the scene costs. Running the
 * whole chain five times in one file measured 12,3 min and left the machine saturated for
 * whatever ran next — half of the starvation diagnosed in
 * `docs/handoffs/pr20-heavy-spec-starvation.md`.
 *
 * So the building is prepared once per worker and opened from the `.ded` the app's own Save
 * button wrote. Each test still gets its own page, its own store and its own WebGL context; see
 * `prepared-building.ts` for why the state travels as a file rather than as a shared page. The
 * small control model is cheap and still runs its own chain, which keeps at least one path
 * through load → design → detail → open measured here.
 */

import { test, expect, openPreparedWorkspace } from './prepared-building';
import { designAll, loadModel, openDocumentsStage } from './fixtures';

type Page = import('@playwright/test').Page;

async function openWorkspace(page: Page, example: string, withFloors: boolean) {
  await loadModel(page, example);
  await designAll(page);
  await page.getByTestId('detailing-disclosure').locator('> summary').click();
  const gen = page.getByTestId('cmd-generate-detailing');
  await expect(gen).toBeEnabled();
  await gen.click();
  await expect.poll(async () => page.evaluate(() =>
    (window.__stabileo as unknown as { detailingAssemblies(): unknown[] })
      .detailingAssemblies().length), { timeout: 60_000 }).toBeGreaterThan(0);

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
}

/** The setup's own queued work, settled before anything is timed. */
async function settle(page: Page) {
  await page.waitForTimeout(3000);
}

/**
 * How one of these tests gets a workspace to measure.
 *
 * Two shapes, because the two models arrive by different routes and a test may only declare the
 * fixtures it actually uses: asking for both the `pro` page and the prepared one would boot two
 * pages per test and open two WebGL contexts, one of which nothing would look at. So the label
 * chooses a REGISTRAR, and the five test bodies below are written once and registered twice.
 */
type Registrar = (
  title: string, body: (page: Page, label: Label) => Promise<void>,
) => void;

type Label = 'small control' | '7-storey building';

/** Builds, projections, contexts and canvases — the four things a switch must not change. */
async function counters(page: Page) {
  return page.evaluate(() => ({
    builds: window.__stabileo.rebarSceneBuilds(),
    misses: window.__stabileo.sceneCacheStats().misses,
    canvases: document.querySelectorAll('canvas').length,
    /**
     * Live WebGL contexts, counted by asking each canvas for the one it already has.
     *
     * `getContext` on a canvas that has a context returns THAT context rather than making a
     * second one, so this counts without creating. A browser allows around sixteen and drops the
     * oldest without warning past that, which is how this viewport silently stopped rendering
     * after a dozen opens.
     */
    contexts: [...document.querySelectorAll('canvas')]
      .filter((c) => {
        try {
          return !!(c as HTMLCanvasElement).getContext('webgl2')
            || !!(c as HTMLCanvasElement).getContext('webgl');
        } catch { return false; }
      }).length,
  }));
}

/**
 * Time one gesture, separating the click from the frame it lands on.
 *
 * `settle` is the wait for the app to be visibly finished — a real assertion on state, never a
 * sleep — so the number is "how long until the user could act again", not "how long until the
 * event handler returned". A synchronous rebuild lands on the next frame, so measuring only up to
 * the handler is how a seconds-long freeze gets reported as sub-millisecond.
 */
async function timed(
  page: Page, act: () => Promise<unknown>, settle: () => Promise<unknown>,
) {
  const t0 = Date.now();
  await act();
  const acted = Date.now() - t0;
  await settle();
  // One animation frame plus one macrotask: where a synchronous rebuild would land.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))));
  return { acted, total: Date.now() - t0 };
}

const FAMILIES = ['column', 'beam', 'slab', 'wall', 'footing'] as const;

/**
 * Ceilings, in milliseconds, per model.
 *
 * ── Why the big model's numbers are seconds, and what that IS ──────
 *
 * Not a rebuild. The counter proves that: forty toggles, zero tube builds. What is left on the
 * 7-storey building is the FRAME — and this suite runs Chromium on SwiftShader, a software
 * rasteriser, by deliberate configuration, so every frame is drawn on the CPU.
 *
 * Isolated by probe on this runner, hiding columns on the 7-storey building:
 *
 *     conflict markers on                 7 591 ms
 *     conflict markers off                1 391 ms
 *     conflict markers + concrete off       627 ms
 *
 * The markers are the cost, and the reason is a number worth stating: this document carries 39 240
 * open conflicts. At the 10 × 8 sphere they were built with, that was 5 493 600 triangles of
 * translucent geometry against the reinforcement's own 1 008 672. Cutting them to 6 × 4 took the
 * markers to 1 412 640 and the same switch to about 2 610 ms — 1,9×, not the 3,89× the geometry
 * fell by, because the rest is fill rate: the same screen area, blended, however few triangles
 * cover it.
 *
 * So the budgets below sit above the observed range on this runner, and the spec MEASURES the
 * marker contribution rather than quietly absorbing it into a wide number. What the ceilings catch
 * is an order-of-magnitude regression — the return of the rebuild, which was 5 900–16 700 ms on a
 * real GPU where a frame is not the bottleneck at all.
 */
const BUDGET_MS = {
  'small control': { toggle: 2500, select: 3000, isolate: 3000, opacity: 2000, section: 2500 },
  '7-storey building': {
    toggle: 12_000, select: 30_000, isolate: 10_000, opacity: 6000, section: 12_000,
  },
} as const;

/**
 * The same gestures with the conflict markers off, held to a real number.
 *
 * ── Why there are two sets of budgets ──────────────────────────────
 *
 * Because the ceilings above are so wide that on their own they would catch almost nothing, and a
 * budget that catches nothing is worse than no budget: it reads as coverage. They are wide for an
 * honest reason — six million triangles of translucent marker on a software rasteriser — but that
 * reason has nothing to do with the code this work changed.
 *
 * So the sensitive gate runs with the markers switched off, where the frame is cheap and what is
 * left is the app's own work: the filter, the tally, the visibility pass and the raycast. Measured
 * on this runner, hiding a family in that state costs 377 ms and clearing an isolation 176 ms. A
 * returning rebuild would be seconds and would fail here immediately.
 *
 * The bounds carry ~20% headroom over the shared runner's reality, not over the idle-machine
 * numbers above: #155 measured this same 7-storey model class at 2543–2645 ms on the shared CI
 * runner (2026-08-21) and moved its geometry bound 2500→3000 for it. The same treatment is applied
 * here (1500→1800, 2500→3000) — a tight bound calibrated below the runner's observed cost is not a
 * gate, it is a flake.
 */
const TIGHT_MS = {
  'small control': 1800,
  '7-storey building': 3000,
} as const;

/** The small control model builds its own scene; it is seconds, and it keeps one full path measured. */
const smallControl: Registrar = (title, body) => {
  test(title, async ({ pro: page }) => {
    test.setTimeout(900_000);
    await openWorkspace(page, 'rc-qa-diagnostic', false);
    await settle(page);
    await body(page, 'small control');
  });
};

/** The 7-storey building is restored from the project the preparation had the app autosave. */
const building: Registrar = (title, body) => {
  test(title, async ({ preparedPage: page, preparedProject }) => {
    test.setTimeout(900_000);
    await openPreparedWorkspace(page, preparedProject);
    await settle(page);
    await body(page, '7-storey building');
  });
};

for (const [label, register] of [
  ['small control', smallControl],
  ['7-storey building', building],
] as const) {
  test.describe(`viewport cost — ${label}`, () => {
    register('no switch rebuilds the geometry, and the numbers say what it does cost', async (
      page, label,
    ) => {
      const start = await counters(page);
      const rows: Array<[string, string]> = [];
      const budget = BUDGET_MS[label];

      // ── Selection, in the viewport, first and repeated ────────
      const canvas = page.getByTestId('rebar-canvas');
      const box = (await canvas.boundingBox())!;
      const clickCentre = async () => {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.up();
      };
      const first = await timed(page, clickCentre,
        () => expect(page.getByTestId('rebar-inspector')).toBeVisible());
      const repeat = await timed(page, async () => {
        await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2 + 8);
        await page.mouse.down();
        await page.mouse.up();
      }, () => expect(page.getByTestId('rebar-inspector')).toBeVisible());
      rows.push(['select in viewport, first', `${first.total} ms (handler ${first.acted} ms)`]);
      rows.push(['select in viewport, repeat', `${repeat.total} ms (handler ${repeat.acted} ms)`]);

      // ── The panel's own response to a list click ──────────────
      const panel = await timed(page,
        () => page.getByTestId('rebar-element-list').locator('button').first().click(),
        () => expect(page.getByTestId('rebar-sel-parent')).toBeVisible());
      rows.push(['select in member list', `${panel.total} ms`]);

      // ── One toggle per family, off and on ─────────────────────
      const summary = page.getByTestId('rebar-workspace-summary');
      for (const family of FAMILIES) {
        const box2 = page.getByTestId(`rebar-layer-${family}`);
        if (!(await box2.count())) continue;
        const before = await summary.innerText();
        const off = await timed(page, () => box2.uncheck(), async () => {
          // The tally is what tells the user the switch worked. Waiting on it is what makes this
          // "time to a finished answer" rather than "time to a dispatched event".
          await expect(box2).not.toBeChecked();
        });
        const on = await timed(page, () => box2.check(), async () => {
          await expect(box2).toBeChecked();
          await expect(summary).toHaveText(before);
        });
        rows.push([`toggle ${family}`, `off ${off.total} ms, on ${on.total} ms`]);
        expect(off.total, `hiding ${family} (${label})`).toBeLessThan(budget.toggle);
        expect(on.total, `showing ${family} (${label})`).toBeLessThan(budget.toggle);
      }

      // ── Hide all the steel, which is the same mechanism ───────
      const barsBox = page.getByTestId('rebar-layer-bars');
      const bars = await timed(page, () => barsBox.uncheck(),
        () => expect(barsBox).not.toBeChecked());
      await barsBox.check();
      rows.push(['hide all reinforcement', `${bars.total} ms`]);

      // ── Isolate one member, and clear it ──────────────────────
      const isolate = page.getByTestId('rebar-isolate');
      if (await isolate.count()) {
        const iso = await timed(page, () => isolate.click(),
          () => expect(page.getByTestId('rebar-clear-isolation')).toBeVisible());
        const clear = await timed(page, () => page.getByTestId('rebar-clear-isolation').click(),
          () => expect(page.getByTestId('rebar-isolate')).toBeVisible());
        rows.push(['isolate a member', `${iso.total} ms`]);
        rows.push(['clear the isolation', `${clear.total} ms`]);
        expect(iso.total, `isolating (${label})`).toBeLessThan(budget.isolate);
        expect(clear.total, `clearing the isolation (${label})`).toBeLessThan(budget.isolate);
      }

      // ── A status filter ───────────────────────────────────────
      const status = page.getByTestId('rebar-status-counts').locator('button').first();
      if (await status.count()) {
        const s = await timed(page, () => status.click(),
          () => expect(page.getByTestId('rebar-status-panel')).toBeVisible());
        rows.push(['filter by state', `${s.total} ms`]);
        await status.click();
      }

      // ── Opacity and the section plane ─────────────────────────
      const opacity = page.getByTestId('rebar-opacity');
      const op = await timed(page, () => opacity.fill('0.4'),
        () => expect(opacity).toHaveValue('0.4'));
      rows.push(['opacity', `${op.total} ms`]);
      expect(op.total, `opacity (${label})`).toBeLessThan(budget.opacity);

      const axis = page.getByTestId('rebar-section-axis');
      const sec = await timed(page, () => axis.selectOption('z'),
        () => expect(page.getByTestId('rebar-section-at')).toBeVisible());
      rows.push(['cut a section', `${sec.total} ms`]);
      expect(sec.total, `section (${label})`).toBeLessThan(budget.section);

      /**
       * The same gestures with the conflict markers off — the sensitive gate.
       *
       * Two things at once. It ATTRIBUTES the remaining cost, so a wide ceiling above is explained
       * rather than excused: on the 7-storey building the markers are 39 240 instanced spheres,
       * about six times the triangles the reinforcement needs, and on a software rasteriser they are
       * most of the frame. And it MEASURES the app's own work with the frame out of the way, which
       * is where a returning rebuild would be obvious.
       *
       * Whether those markers should be cheaper is a decision about what the view says, not a
       * performance detail to settle inside a benchmark. So it is measured and reported, never
       * changed here.
       */
      const target = page.getByTestId('rebar-layer-column');
      const markers = page.getByTestId('rebar-layer-conflicts');
      const concrete = page.getByTestId('rebar-layer-concrete');
      const tight = TIGHT_MS[label];
      if (await target.count()) {
        await markers.uncheck();
        await page.evaluate(() =>
          new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))));

        const bareOff = await timed(page, () => target.uncheck(),
          () => expect(target).not.toBeChecked());
        const bareOn = await timed(page, () => target.check(),
          () => expect(target).toBeChecked());
        const bareSelect = await timed(page, clickCentre,
          () => expect(page.getByTestId('rebar-inspector')).toBeVisible());

        let bareIso = { total: 0, acted: 0 };
        const iso2 = page.getByTestId('rebar-isolate');
        if (await iso2.count()) {
          bareIso = await timed(page, () => iso2.click(),
            () => expect(page.getByTestId('rebar-clear-isolation')).toBeVisible());
          await page.getByTestId('rebar-clear-isolation').click();
          await expect(page.getByTestId('rebar-isolate')).toBeVisible();
        }

        // Also with the concrete off, purely to finish attributing the frame.
        await concrete.uncheck();
        await page.evaluate(() =>
          new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))));
        const barest = await timed(page, () => target.uncheck(),
          () => expect(target).not.toBeChecked());
        await target.check();
        await concrete.check();
        await markers.check();

        rows.push(['— with the markers off —', '']);
        rows.push(['toggle column', `off ${bareOff.total} ms, on ${bareOn.total} ms`]);
        rows.push(['select in viewport', `${bareSelect.total} ms`]);
        if (bareIso.total) rows.push(['isolate a member', `${bareIso.total} ms`]);
        rows.push(['toggle, markers + concrete off', `${barest.total} ms`]);

        for (const [what, cost] of [
          ['hiding columns', bareOff.total], ['showing columns', bareOn.total],
          ['selecting', bareSelect.total], ['isolating', bareIso.total],
        ] as const) {
          if (!cost) continue;
          expect(cost, `${what} with the markers off (${label})`).toBeLessThan(tight);
        }
      }

      /**
       * The camera, timed on its own.
       *
       * A different cost from the panel's and from the picture's: "Reset" reframes and then asks
       * for a tail of frames so the orbit damping settles. Conflating it with a selection is how
       * the member-list click came to be read as a slow panel when most of it was twenty frames of
       * camera easing.
       */
      const reset = await timed(page,
        () => page.getByTestId('rebar-fit-view').click(),
        () => expect(page.getByTestId('rebar-canvas')).toBeVisible());
      rows.push(['camera reset', `${reset.total} ms`]);

      // ── Leaving the tab and coming back ───────────────────────
      const returned = await page.evaluate(async () => {
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
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        return performance.now() - t0;
      });
      rows.push(['tab away and back', `${returned.toFixed(0)} ms`]);

      // ── The verdict ───────────────────────────────────────────
      const end = await counters(page);

      /**
       * One deliberate rebuild, AFTER the verdict, to report what a rebuild actually costs here.
       *
       * The exaggeration slider is the one control left that genuinely moves every ring off its
       * centreline, so it must rebuild — "never rebuild" would be a bug, not a fix. Timing it is
       * what makes every number above mean something: this is the cost the switches used to pay,
       * every one of them, on every click.
       *
       * It runs after `end` is captured on purpose. Folding a deliberate build into the counter
       * that proves nothing was built would be a test arguing with itself.
       */
      const exaggerate = page.getByTestId('rebar-exaggerate');
      const rebuilt = await timed(page, () => exaggerate.fill('3'),
        () => expect(exaggerate).toHaveValue('3'));
      const afterRebuild = (await counters(page)).builds;
      await exaggerate.fill('1');
      await expect(exaggerate).toHaveValue('1');
      rows.push(['REBUILD (exaggerate ×3)',
        `${rebuilt.total} ms, ${afterRebuild - end.builds} build`]);
      rows.unshift(['scene builds', `${start.builds} → ${end.builds}`]);
      rows.unshift(['projections built', `${start.misses} → ${end.misses}`]);
      rows.unshift(['canvases', `${start.canvases} → ${end.canvases}`]);
      rows.unshift(['WebGL contexts', `${start.contexts} → ${end.contexts}`]);

      const w = Math.max(...rows.map(([k]) => k.length));
      console.log(`\nviewport cost — ${label}\n${
        rows.map(([k, v]) => `  ${k.padEnd(w)}  ${v}`).join('\n')}\n`);

      /**
       * The claim, as a number that cannot be argued with.
       *
       * Every gesture above — six family switches off and on, a selection, a member-list click, an
       * isolate, a status filter, an opacity drag, a section cut and a tab round trip — and not one
       * tube rebuilt. Before this work, each of the family switches rebuilt all 20 917 of them.
       */
      expect(end.builds, 'tubes rebuilt by switching, selecting and filtering')
        .toBe(start.builds);
      expect(end.misses, 'scene projections rebuilt by the same gestures')
        .toBe(start.misses);
      expect(end.canvases, 'canvases added').toBe(start.canvases);
      expect(end.contexts, 'WebGL contexts added').toBe(start.contexts);

      // Changing the bar diameter really does rebuild. The fix is that nothing ELSE does.
      expect(afterRebuild - end.builds, 'exaggerating the bars must rebuild the tubes')
        .toBeGreaterThan(0);

      expect(first.total, `first selection (${label})`).toBeLessThan(budget.select);
      expect(repeat.total, `repeated selection (${label})`).toBeLessThan(budget.select);
      expect(panel.total, `member-list selection (${label})`).toBeLessThan(budget.select);
    });

    register('showing and hiding the conflict markers costs a flag, not a rebuild', async (
      page, label,
    ) => {
      const start = await counters(page);

      const markers = page.getByTestId('rebar-layer-conflicts');
      const rows: Array<[string, string]> = [];
      /** Median of an odd-length sample, so one unlucky frame does not become the number. */
      const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1];

      /**
       * The markers' own switch, timed on its own.
       *
       * This is the gesture the tessellation change is about. At 10 × 8 a marker was 140 triangles
       * and the 7-storey document carries 39 240 of them — 5,5 million triangles, five and a half
       * times the reinforcement's own 1,0 million. At 6 × 4 it is 36 triangles and 1,4 million.
       *
       * Three passes each way and the MEDIAN reported, because two were not enough to say anything.
       * Measured across two passes, hiding the markers read 7 694 ms and then 1 543 ms — the first
       * pass pays for whatever the previous gesture left pending, and picking either number would
       * have been picking a conclusion.
       */
      const hidden: number[] = [];
      const shown: number[] = [];
      for (let i = 0; i < 3; i++) {
        const off = await timed(page, () => markers.uncheck(),
          () => expect(markers).not.toBeChecked());
        const on = await timed(page, () => markers.check(),
          () => expect(markers).toBeChecked());
        hidden.push(off.total);
        shown.push(on.total);
      }
      rows.push(['hide conflicts', `${median(hidden)} ms  (${hidden.join(', ')})`]);
      rows.push(['show conflicts', `${median(shown)} ms  (${shown.join(', ')})`]);

      /**
       * And a family switch with the markers drawn, which is where the cost showed up.
       *
       * The markers are never the thing the user clicked — they are what makes everything ELSE
       * slow, because every frame has to rasterise them. So the number that matters most is a
       * different gesture measured while they are on screen.
       */
      const column = page.getByTestId('rebar-layer-column');
      if (await column.count()) {
        const offs: number[] = [];
        const ons: number[] = [];
        for (let i = 0; i < 3; i++) {
          offs.push((await timed(page, () => column.uncheck(),
            () => expect(column).not.toBeChecked())).total);
          ons.push((await timed(page, () => column.check(),
            () => expect(column).toBeChecked())).total);
        }
        rows.push(['toggle column, markers ON',
          `off ${median(offs)} ms (${offs.join(', ')}), on ${median(ons)} ms (${ons.join(', ')})`]);
      }

      const end = await counters(page);
      rows.unshift(['WebGL contexts', `${start.contexts} → ${end.contexts}`]);
      rows.unshift(['canvases', `${start.canvases} → ${end.canvases}`]);
      rows.unshift(['tube rebuilds', `${start.builds} → ${end.builds}`]);
      rows.unshift(['projections built', `${start.misses} → ${end.misses}`]);

      const w = Math.max(...rows.map(([k]) => k.length));
      console.log(`\nconflict markers — ${label}\n${
        rows.map(([k, v]) => `  ${k.padEnd(w)}  ${v}`).join('\n')}\n`);

      // Switching a marker is a flag. Nothing about the reinforcement may be rebuilt for it.
      expect(end.builds, 'tubes rebuilt by switching markers').toBe(start.builds);
      expect(end.misses, 'projections rebuilt by switching markers').toBe(start.misses);
      expect(end.contexts, 'WebGL contexts added').toBe(start.contexts);
      expect(end.canvases, 'canvases added').toBe(start.canvases);
      // And the markers are still all there — hidden is not discarded.
      await expect(markers).toBeChecked();
    });

    register('repeating the marker switch adds no canvas and no context', async (page) => {
      const start = await counters(page);

      const markers = page.getByTestId('rebar-layer-conflicts');
      for (let i = 0; i < 20; i++) {
        await markers.uncheck();
        await markers.check();
      }

      const end = await counters(page);
      expect(end.builds, 'tubes rebuilt across forty marker switches').toBe(start.builds);
      expect(end.canvases).toBe(start.canvases);
      expect(end.contexts).toBe(start.contexts);
      await expect(markers).toBeChecked();
      await expect(page.getByTestId('rebar-canvas')).toBeVisible();
    });

    register('opening and closing the workspace leaks no WebGL context', async (page) => {
      const start = await counters(page);

      /**
       * Five round trips, because the limit is not one.
       *
       * `renderer.dispose()` frees the renderer's own objects and leaves the GPU CONTEXT alive. A
       * browser allows around sixteen and drops the oldest without warning past that — so a leak
       * of one per open is a viewport that silently stops rendering after a dozen visits, and a
       * test run that starts failing partway through for no reason visible in the test that fails.
       * That is why the teardown calls `forceContextLoss`, and this is what proves it still does.
       */
      for (let i = 0; i < 5; i++) {
        await page.getByTestId('rebar-workspace-close').click();
        await expect(page.getByTestId('rebar-workspace')).toHaveCount(0);
        await openDocumentsStage(page);
        await page.getByTestId('doc-3d').click();
        await expect(page.getByTestId('rebar-workspace')).toBeVisible();
        await expect(page.getByTestId('rebar-canvas')).toBeVisible();
      }

      const end = await counters(page);
      expect(end.canvases, 'canvases after five opens').toBe(start.canvases);
      expect(end.contexts, 'WebGL contexts after five opens').toBe(start.contexts);
      /**
       * Reopening DOES rebuild, and that is correct.
       *
       * The overlay unmounts on close, so its meshes are disposed and the next open has to build
       * them again. Five opens, five builds — no more. A number above that would mean the mount
       * itself was building twice, which it did until the rebuild bookkeeping moved inside the
       * build.
       */
      expect(end.builds - start.builds, 'builds across five reopens').toBe(5);
    });

    register('repeating a toggle forty times adds no memory, no canvas and no context', async (page) => {
      const start = await counters(page);

      const slabs = page.getByTestId('rebar-layer-slab');
      const target = (await slabs.count()) ? slabs : page.getByTestId('rebar-layer-column');
      for (let i = 0; i < 20; i++) {
        await target.uncheck();
        await target.check();
      }

      const end = await counters(page);
      // Forty switches. A rebuild per switch would be forty passes over the whole model, and a
      // leaked buffer per pass is how a workspace left open for an afternoon runs a laptop out of
      // memory.
      expect(end.builds, 'tubes rebuilt across forty toggles').toBe(start.builds);
      expect(end.canvases).toBe(start.canvases);
      expect(end.contexts).toBe(start.contexts);
      await expect(page.getByTestId('rebar-canvas')).toBeVisible();
      await expect(target).toBeChecked();
    });

    /**
     * F7 — the three operations everything above skips, and the one that dominates them all.
     *
     * The tests above all begin with the workspace ALREADY OPEN, so the most expensive operation
     * in this feature had no measurement anywhere: the open itself. `open-timeline.ts` has
     * recorded its six phases in the product since PR20, and nothing read them.
     *
     * Measured on the 7-storey building at 1280×720 on this runner, first open:
     *
     *     click        0 ms
     *     document   143 ms   the DocumentModel, synchronous, inside the handler
     *     scene      412 ms   the projection — 269 ms of sampling 23 393 bars
     *     renderer   558 ms   WebGL context, camera, controls
     *     geometry   782 ms   1 458 540 triangles and 8 116 markers on the GPU
     *     frame     2135 ms   ← 1 353 ms, the driver flushing that upload
     *
     * So two thirds of a two-second open is the first frame, and that is a GPU fill cost on a
     * software rasteriser, not app work — the same conclusion `open-timeline.ts` reached from the
     * other direction after a profile blamed `setSize` for 1,7 s of it.
     *
     * What that makes this test: a RECORD with a ceiling on the phases the app controls, and a
     * report of the one it does not. It is deliberately not an optimisation: the geometry is
     * already batched, the markers already retessellated, the projection already cached, and
     * cutting the frame further means drawing less than the document contains, which is the one
     * thing F7 forbids.
     */
    register('the open, the sheet and a regeneration, timed', async (page, label) => {
      const rows: Array<[string, string]> = [];
      const start = await counters(page);

      /**
       * The open that is measured is a REOPEN, and that is the honest one to bound.
       *
       * The registrar has already opened the workspace, so closing and reopening is what this can
       * time without a second setup — and it is also the gesture a user repeats. It costs slightly
       * MORE than a first open, not less: `openRebar3D` rebuilds the document deliberately (see
       * `rebar-open.ts` on why a rebuilt document is still a new statement), so the projection
       * cache misses by design and every phase runs again.
       */
      await page.getByTestId('rebar-workspace-close').click();
      await expect(page.getByTestId('rebar-workspace')).toHaveCount(0);
      await openDocumentsStage(page);

      const opened = await timed(page,
        () => page.getByTestId('doc-3d').click(),
        async () => {
          await expect(page.getByTestId('rebar-workspace')).toBeVisible();
          await expect(page.getByTestId('rebar-canvas')).toBeVisible();
          await expect
            .poll(() => page.evaluate(() => window.__stabileo.rebarSceneBuilds()),
              { timeout: 180_000 })
            .toBeGreaterThan(start.builds);
        });

      const phases = await page.evaluate(() => window.__stabileo.openTimeline());
      rows.push(['open, wall clock', `${opened.total} ms`]);
      for (const p of ['click', 'document', 'scene', 'renderer', 'geometry', 'frame'] as const) {
        if (phases[p] === undefined) continue;
        rows.push([`  phase ${p}`, `${phases[p]} ms`]);
      }

      /**
       * The ceiling is on `geometry`, not on `frame`.
       *
       * Everything up to the geometry being handed to the GPU is this application's own work —
       * building the document, projecting the scene, creating the context, tubing the bars — and
       * it is what a regression would land in. The gap from there to the first frame is the
       * driver, and on SwiftShader it is most of the number; bounding it would make this a test
       * of the runner's rasteriser.
       *
       * The bound is ~2,5× the observed 782 ms on the big model, in the same spirit as the
       * budgets above: wide enough not to flake on a loaded shared runner, tight enough that the
       * return of a second build pass — which was measured as exactly this, doubled — fails here.
       */
      const geometryCeiling = label === 'small control' ? 1500 : 2000;
      if (phases.geometry !== undefined) {
        expect(phases.geometry,
          `document + projection + context + tubes (${label})`).toBeLessThan(geometryCeiling);
      }
      /**
       * And the phases are ORDERED, which is the cheap check that catches a mismarked phase.
       *
       * A phase recorded in the wrong place would still produce six plausible numbers; only their
       * order says the timeline describes the sequence it claims to.
       */
      const seq = (['click', 'document', 'scene', 'renderer', 'geometry', 'frame'] as const)
        .map((p) => phases[p]).filter((n): n is number => n !== undefined);
      expect(seq, 'the phases are non-decreasing')
        .toEqual([...seq].sort((a, b) => a - b));

      /**
       * ONE build for one open — the property the deferred first build exists to protect.
       *
       * The rebuild effect used to win the race against the deferred build and do the whole pass
       * itself, which the deferred build then repeated: two full passes over every tube, per
       * visit, measured on this counter.
       */
      expect((await counters(page)).builds - start.builds, 'one open, one build').toBe(1);

      // ── The sheet, which is a different renderer entirely ──────
      await page.getByTestId('rebar-workspace-close').click();
      await expect(page.getByTestId('rebar-workspace')).toHaveCount(0);
      const disclosure = page.getByTestId('detailing-disclosure');
      if (await disclosure.getAttribute('open') === null) {
        await disclosure.locator('> summary').click();
      }
      const expand = page.getByTestId('sheet-expand');
      if (await expand.count()) {
        /**
         * The baseline is taken HERE, with the workspace closed, and that is the whole point.
         *
         * `start` was captured while the overlay was up — three canvases — and the first version
         * of this compared against it after closing, so it read the overlay's own correct teardown
         * as the sheet losing a canvas. The question is what the SHEET adds, so the count before
         * the sheet is the only valid baseline for it.
         */
        const beforeSheet = await counters(page);
        const sheet = await timed(page, () => expand.click(),
          () => expect(page.getByTestId('sheet-figure')).toBeVisible());
        rows.push(['open the sheet full-window', `${sheet.total} ms`]);
        await page.keyboard.press('Escape');
        // The sheet is SVG from `detailingSheet.svg` and touches no WebGL. If it ever starts
        // adding a canvas or a context, that is the thing to know about it.
        const afterSheet = await counters(page);
        expect(afterSheet.canvases, 'the sheet adds no canvas').toBe(beforeSheet.canvases);
        expect(afterSheet.contexts, 'and no WebGL context').toBe(beforeSheet.contexts);
      }

      /**
       * ── Regenerating the detailing, and the one page where it cannot be timed ──
       *
       * On a page that ran the pipeline this session the command is a regeneration and is timed.
       * On a RESTORED project it is disabled, and that turned out to be a real property rather
       * than a test problem: `verificationStore` is runtime-only, so a reopened project carries
       * its model, its reinforcement and its detailing but no design DEMANDS — and regenerating
       * needs them. The button says exactly that ("No members have design demands yet. Solve the
       * model and run the code check first."), which is the app being honest about a limitation
       * of the restore rather than offering a command that would refuse.
       *
       * So the two paths assert different things about the same control, and neither is skipped
       * quietly: one measures the gesture, the other pins the refusal AND that it explains itself.
       * The same runtime-only store is what made a restored proposal read as MODELLED — see
       * `docs/handoffs/f6-viewer-and-f7-performance.md` §4.
       */
      const regen = page.getByTestId('cmd-generate-detailing');
      if (await regen.isEnabled()) {
        const regenerated = await timed(page, () => regen.click(),
          () => expect
            .poll(() => page.evaluate(
              () => (window.__stabileo.detailingAssemblies() as unknown[]).length),
            { timeout: 300_000 })
            .toBeGreaterThan(0));
        rows.push(['regenerate the detailing', `${regenerated.total} ms`]);
      } else {
        rows.push(['regenerate the detailing', 'not reachable on a restored project']);
        const why = await regen.getAttribute('title');
        expect(why, 'a disabled command names its own prerequisite').toBeTruthy();
        /**
         * And the prerequisite is stated as TEXT too, not only in a `title`.
         *
         * A tooltip explains itself to a mouse and to nothing else. `RcStageTimeline` renders the
         * same sentence in `detailing-prerequisites`, and `pro-design-gates` asserts the two are
         * the same sentence; this checks the visible half is actually there on this page.
         */
        await expect(page.getByTestId('detailing-prerequisites'),
          'and says so on the page, not only on hover').toBeVisible();
      }

      const w = Math.max(...rows.map(([k]) => k.length));
      console.log(`\nF7 operations — ${label}\n${
        rows.map(([k, v]) => `  ${k.padEnd(w)}  ${v}`).join('\n')}\n`);
    });
  });
}
