/**
 * The eight switches in the 3-D rail, clicked in a real browser, asserted against the SCENE.
 *
 * ── The defect this suite exists for ───────────────────────────────
 *
 * Every switch in the rail stopped working, in silence, and the whole test suite stayed green.
 *
 * The cause was one line in `RebarViewport3D`. Its visibility effect was
 * `built?.setVisibility({ filter, ... })`, and `a?.b(c)` never evaluates `c` when `a` is
 * nullish — which `built` is on that effect's first run, because the first geometry build is
 * deferred by two frames so the browser can paint. A Svelte effect subscribes to what it
 * actually read; that one read nothing and never ran again. The store changed, the derived
 * filter recomputed, the tally beside the canvas updated, and `mesh.visible` was never touched.
 *
 * ── Why the existing specs could not catch it ──────────────────────
 *
 * Because they asserted the TALLY. `rebar-3d.spec.ts` unchecks a family and checks that the
 * family's row disappears from `rebar-tally` — and the tally is derived in Svelte from
 * `filterScene`, on the near side of the break. It was updating perfectly. Every assertion in
 * this file goes through `rebarSceneCensus()`, which is read off `mesh.visible` and the drawn
 * ranges, on the far side.
 *
 * ── Why the walk is one test per model ─────────────────────────────
 *
 * Setting up the 7-storey building — load, solve, design, detail, floor-design, project, build
 * 20 917 tubes — is minutes of real work, and Playwright gives each test a fresh page. Eight
 * switches in eight tests would pay for that eight times to assert eight numbers. So the
 * building gets ONE test that walks every control and reports its counts, and the small model
 * carries the cases that need their own page: reopening, reloading, isolation, picking.
 */

import { test, expect, designAll, loadModel, SOLID_FAMILIES, openDocumentsStage } from './fixtures';
import type { RebarSceneCensus } from './fixtures';

type Page = import('@playwright/test').Page;

/** The small control model, and the whole building. */
const SMALL = 'rc-qa-diagnostic';
const BUILDING = 'pro-edificio-7p';

async function assemblyCount(page: Page): Promise<number> {
  return page.evaluate(() => (window.__stabileo as unknown as
    { detailingAssemblies(): unknown[] }).detailingAssemblies().length);
}

/**
 * Load, design, detail and open the workspace — all through the UI, as `rebar-3d.spec.ts` does.
 *
 * Waits on the BUILD COUNTER rather than on the "building" status: on a small model the build
 * takes two frames and that status may never be painted at all, so waiting for it to disappear
 * would pass on an element that was never there.
 */
async function openWorkspace(page: Page, example: string, withFloors = false) {
  await loadModel(page, example);
  await designAll(page);
  await page.getByTestId('detailing-disclosure').locator('> summary').click();
  const generate = page.getByTestId('cmd-generate-detailing');
  await expect(generate).toBeEnabled();
  await generate.click();
  await expect.poll(() => assemblyCount(page), { timeout: 60_000 }).toBeGreaterThan(0);

  if (withFloors) {
    await page.getByTestId('floor-families-disclosure').locator('> summary').click();
    const floors = page.getByTestId('floor-design-run');
    await expect(floors).toBeEnabled();
    await floors.click();
    await expect(page.getByTestId('floor-families')).toBeVisible();
  }

  const before = await page.evaluate(() => window.__stabileo.rebarSceneBuilds());
  await openDocumentsStage(page);
  await page.getByTestId('doc-3d').click();
  await expect(page.getByTestId('rebar-workspace')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__stabileo.rebarSceneBuilds()), { timeout: 180_000 })
    .toBeGreaterThan(before);
  /**
   * The same budget as the build it confirms.
   *
   * This poll inherits `expect.timeout` — ten seconds — and sits immediately after one with a
   * hundred and eighty. Two halves of one wait, two orders of magnitude apart: the expensive
   * half is allowed to take three minutes and the cheap confirmation right after it is not
   * allowed to be late once. On a machine that has just spent ten minutes on the cost spec, it
   * was late once, and the failure read as "the scene never appeared" when the scene was there.
   *
   * The counter and the live handle are set on the same line of `rebuild()`, so this is only
   * ever waiting for a round trip, not for work. Matching the budgets removes a way to fail
   * that says nothing about the app.
   */
  await expect
    .poll(() => page.evaluate(() => window.__stabileo.rebarSceneCensus() !== null),
      { timeout: 60_000 })
    .toBe(true);
}

/** What the renderer is drawing, right now. */
async function census(page: Page): Promise<RebarSceneCensus> {
  const c = await page.evaluate(() => window.__stabileo.rebarSceneCensus());
  expect(c, 'a workspace is open and rendering').not.toBeNull();
  return c!;
}

/**
 * Click a switch and wait for the SCENE to agree with it.
 *
 * Waiting on the census rather than on the checkbox is the whole point: the checkbox flipping
 * is what already worked. `expect.poll` because the effect flushes on a microtask and the frame
 * it schedules is not synchronous with the click.
 */
async function setSwitch(page: Page, testId: string, on: boolean) {
  const box = page.getByTestId(testId);
  if (on) await box.check(); else await box.uncheck();
  await expect(box, `${testId} is ${on ? 'checked' : 'unchecked'}`)
    .toBeChecked({ checked: on });
}

/** Poll until the drawn census satisfies a predicate, then return it. */
async function censusWhen(
  page: Page, ok: (c: RebarSceneCensus) => boolean, why: string,
): Promise<RebarSceneCensus> {
  await expect
    .poll(async () => ok(await census(page)), { timeout: 60_000, message: why })
    .toBe(true);
  return census(page);
}

/** Everything except the named families, so "nothing else moved" is one assertion. */
function others(counts: Record<string, number>, except: readonly string[]) {
  return Object.fromEntries(Object.entries(counts).filter(([k]) => !except.includes(k)));
}

const total = (counts: Record<string, number>) =>
  Object.values(counts).reduce((a, b) => a + b, 0);

/** Builds, canvases and live GL contexts — the three things a switch must not change. */
async function counters(page: Page) {
  return page.evaluate(() => ({
    builds: window.__stabileo.rebarSceneBuilds(),
    canvases: window.__stabileo.canvasCount(),
    /**
     * Live contexts, counted by asking each canvas for the one it already has.
     *
     * `getContext` on a canvas that has a context returns THAT context rather than making a
     * second one, so this counts without creating. A browser allows around sixteen and drops
     * the oldest without warning past that.
     */
    contexts: [...document.querySelectorAll('canvas')].filter((c) =>
      !!(c as HTMLCanvasElement).getContext('webgl2')
      || !!(c as HTMLCanvasElement).getContext('webgl')).length,
  }));
}

// ─── The small model: one page each, for the cases that need one ─

test.describe('a family switch reaches the scene', () => {
  test('the census the renderer reports covers every family the rail switches',
    async ({ pro: page }) => {
      await openWorkspace(page, SMALL);
      const c = await census(page);
      // The spec's own family list against the renderer's. A family added on one side and not
      // the other is a switch that governs nothing, which is how this all started.
      expect(Object.keys(c.solids).sort()).toEqual([...SOLID_FAMILIES].sort());
      expect(Object.keys(c.bars).sort())
        .toEqual([...SOLID_FAMILIES, 'unknown'].sort());
      expect(c.triangles, 'something is actually on screen').toBeGreaterThan(0);
    });

  test('turning a family off removes its steel and its concrete from the scene',
    async ({ pro: page }) => {
      await openWorkspace(page, SMALL);
      const before = await census(page);
      // Whichever families this model actually has. Asserting on a family with nothing in it
      // would pass without proving anything.
      const present = SOLID_FAMILIES.filter((f) => before.solids[f] > 0 || before.bars[f] > 0);
      expect(present.length, 'the control model has families to switch').toBeGreaterThan(1);

      for (const family of present) {
        await setSwitch(page, `rebar-layer-${family}`, false);
        const off = await censusWhen(
          page, (c) => c.bars[family] === 0 && c.solids[family] === 0,
          `${family} leaves the scene`);
        // And nothing else moved. This is the assertion the spec states family by family.
        expect(others(off.bars, [family]), `${family} off: other families' steel`)
          .toEqual(others(before.bars, [family]));
        expect(others(off.solids, [family]), `${family} off: other families' concrete`)
          .toEqual(others(before.solids, [family]));

        await setSwitch(page, `rebar-layer-${family}`, true);
        const on = await censusWhen(
          page, (c) => c.bars[family] === before.bars[family],
          `${family} comes back`);
        expect(on, `${family} restored exactly`).toEqual(before);
      }
    });

  test('reinforcement and concrete are independent switches', async ({ pro: page }) => {
    await openWorkspace(page, SMALL);
    const before = await census(page);
    expect(total(before.bars), 'the model has steel').toBeGreaterThan(0);
    expect(total(before.solids), 'the model has concrete').toBeGreaterThan(0);

    await setSwitch(page, 'rebar-layer-bars', false);
    const noBars = await censusWhen(page, (c) => total(c.bars) === 0, 'all steel leaves');
    // "Hide reinforcement" hides reinforcement. It does not hide the building.
    expect(noBars.solids, 'the concrete stays').toEqual(before.solids);
    await setSwitch(page, 'rebar-layer-bars', true);
    await censusWhen(page, (c) => total(c.bars) === total(before.bars), 'the steel comes back');

    await setSwitch(page, 'rebar-layer-concrete', false);
    const noConcrete = await censusWhen(
      page, (c) => total(c.solids) === 0, 'all concrete leaves');
    expect(noConcrete.bars, 'the steel stays').toEqual(before.bars);
    await setSwitch(page, 'rebar-layer-concrete', true);
    expect(await censusWhen(
      page, (c) => total(c.solids) === total(before.solids), 'the concrete comes back'))
      .toEqual(before);
  });

  test('the conflict markers switch off and back on without touching anything else',
    async ({ pro: page }) => {
      await openWorkspace(page, SMALL);
      const before = await census(page);
      // Reported rather than asserted here: this control model may coordinate to a clean
      // document, and a zero-marker scene would make this test pass without proving anything.
      // The assertion that the switch has real markers to hide is on the building below, which
      // carries 39 240 of them.
      console.log('conflict markers on the control model:', before.markers);
      await setSwitch(page, 'rebar-layer-conflicts', false);
      const off = await censusWhen(page, (c) => c.markers === 0, 'the markers leave');
      expect(off.bars, 'the steel is untouched').toEqual(before.bars);
      expect(off.solids, 'the concrete is untouched').toEqual(before.solids);
      // Switching a marker off is a VIEW operation: the conflicts are still in the document,
      // and the panel that counts them must still count them.
      expect(await assemblyCount(page)).toBeGreaterThan(0);

      await setSwitch(page, 'rebar-layer-conflicts', true);
      expect(await censusWhen(
        page, (c) => c.markers === before.markers, 'the markers come back'))
        .toEqual(before);
    });

  test('none of it rebuilds the geometry, adds a canvas or leaks a context',
    async ({ pro: page }) => {
      await openWorkspace(page, SMALL);
      const before = await counters(page);
      // Every switch, including the families this model does not contain: an inert switch must
      // be inert all the way down, not merely inert in the picture.
      for (const family of SOLID_FAMILIES) {
        await setSwitch(page, `rebar-layer-${family}`, false);
        await setSwitch(page, `rebar-layer-${family}`, true);
      }
      for (const id of ['rebar-layer-bars', 'rebar-layer-concrete', 'rebar-layer-conflicts']) {
        await setSwitch(page, id, false);
        await setSwitch(page, id, true);
      }
      // A counter that did not move cannot be explained away as a fast machine. Visibility is a
      // flag on a mesh, and eighteen clicks must cost eighteen flags.
      expect(await counters(page), 'eighteen switch clicks changed nothing structural')
        .toEqual(before);
    });
});

test.describe('the rail survives what is put above it', () => {
  test('every section stays on screen on a short window, banners and all',
    async ({ pro: page }) => {
      /**
       * The regression: a section that did not scroll out of view, it CEASED TO EXIST.
       *
       * The rail is a flex column with `overflow-y: auto`, and the status panel carried a
       * `min-height: 0` left over from when its member list scrolled on its own. That made it
       * the one item in the column that could be crushed to zero, and the last one, so it
       * absorbed every pixel the sections above it would not give up. Adding a second banner
       * over the body took about 40 px off the rail and, at 1280 × 720, the whole panel — state
       * counts, causes, member list — collapsed to nothing, with the rail's scrollbar reporting
       * nothing to scroll.
       *
       * `rc-qa-diagnostic` is chosen because it raises BOTH banners at once, which is the
       * tallest the header ever gets and therefore the worst case for the rail below it.
       */
      await page.setViewportSize({ width: 1280, height: 720 });
      await openWorkspace(page, SMALL);
      await expect(page.getByTestId('rebar-provisional-banner')).toBeVisible();
      await expect(page.getByTestId('rebar-torsion-banner')).toBeVisible();

      // Every section of the rail, top to bottom, with a real box.
      for (const id of ['rebar-tally', 'rebar-status-panel', 'rebar-layer-column']) {
        await expect(page.getByTestId(id), `${id} has a box`).toBeVisible();
      }
      const panel = await page.getByTestId('rebar-status-panel').boundingBox();
      expect(panel!.height, 'the status panel is not crushed to a line').toBeGreaterThan(40);

      // And it survives the click that made it worst: filtering by state expands a cause
      // paragraph above the member list, which is more height for the column to find.
      await page.getByTestId('rebar-status-counts').locator('button').first().click();
      await expect(page.getByTestId('rebar-status-panel')).toBeVisible();
      const after = await page.getByTestId('rebar-status-panel').boundingBox();
      expect(after!.height, 'still not crushed after a status filter').toBeGreaterThan(40);
    });
});

// ─── Isolation, selection and picking ────────────────────────────

test.describe('the switches compose with everything else', () => {
  test('isolating a member cannot bring back a family the user switched off',
    async ({ pro: page }) => {
      await openWorkspace(page, SMALL);
      const before = await census(page);
      const family = SOLID_FAMILIES.find((f) => before.solids[f] > 0)!;

      await setSwitch(page, `rebar-layer-${family}`, false);
      await censusWhen(page, (c) => c.solids[family] === 0, `${family} is off`);

      await page.getByTestId('rebar-element-list').locator('button').first().click();
      await page.getByTestId('rebar-isolate').click();
      // The user turned that family off. Nothing but the user turning it back on may undo it.
      const isolated = await censusWhen(
        page, (c) => c.triangles < before.triangles, 'the isolation narrowed the scene');
      expect(isolated.solids[family], `${family} stays off through an isolate`).toBe(0);

      await page.getByTestId('rebar-clear-isolation').click();
      const cleared = await censusWhen(
        page, (c) => c.bars[family] === 0, 'clearing the isolation does not re-enable a family');
      expect(cleared.solids[family]).toBe(0);

      // And switching it back on restores it, which is the other half of the promise.
      await setSwitch(page, `rebar-layer-${family}`, true);
      expect(await censusWhen(
        page, (c) => c.solids[family] === before.solids[family], `${family} comes back`))
        .toEqual(before);
    });

  test('selection and picking survive a family going off and coming back',
    async ({ pro: page }) => {
      await openWorkspace(page, SMALL);
      const list = page.getByTestId('rebar-element-list').locator('button');
      await list.first().click();
      const parent = await page.getByTestId('rebar-sel-parent').innerText();
      await expect(page.getByTestId('rebar-inspector')).not.toHaveAttribute('data-focused', '');

      const before = await census(page);
      const family = SOLID_FAMILIES.find((f) => before.bars[f] > 0)!;
      await setSwitch(page, `rebar-layer-${family}`, false);
      await censusWhen(page, (c) => c.bars[family] === 0, `${family} is off`);
      await setSwitch(page, `rebar-layer-${family}`, true);
      await censusWhen(page, (c) => c.bars[family] === before.bars[family], `${family} is back`);

      // The identity the inspector reports must not have moved. A picking map re-expressed
      // wrongly after a compaction does not look wrong — it reports the neighbouring bar.
      await expect(page.getByTestId('rebar-sel-parent')).toHaveText(parent);
      const after = await census(page);
      expect(after.pickable, 'everything drawn is selectable again').toBe(before.pickable);
    });
});

// ─── Closing, reopening, reloading ───────────────────────────────

test.describe('what the switches survive', () => {
  test('closing and reopening restores both the switches and the scene',
    async ({ pro: page }) => {
      await openWorkspace(page, SMALL);
      const before = await census(page);
      const family = SOLID_FAMILIES.find((f) => before.solids[f] > 0)!;
      await setSwitch(page, `rebar-layer-${family}`, false);
      await setSwitch(page, 'rebar-layer-conflicts', false);
      const hidden = await censusWhen(
        page, (c) => c.solids[family] === 0, `${family} is off`);

      await page.getByTestId('rebar-workspace-close').click();
      await expect(page.getByTestId('rebar-workspace')).toHaveCount(0);
      // A closed workspace answers "no scene" rather than a stale one.
      expect(await page.evaluate(() => window.__stabileo.rebarSceneCensus())).toBeNull();

      await page.getByTestId('rebar-open-workspace').click();
      await expect(page.getByTestId('rebar-workspace')).toBeVisible();
      await expect(page.getByTestId(`rebar-layer-${family}`)).not.toBeChecked();
      await expect(page.getByTestId('rebar-layer-conflicts')).not.toBeChecked();
      // The switches came back, and so did the SCENE they describe. Reopening with the boxes
      // unchecked and every family drawn would be the same defect wearing the other hat.
      expect(await censusWhen(
        page, (c) => c.solids[family] === 0, 'the reopened scene matches the switches'))
        .toEqual(hidden);
    });

  test('a reload starts the workspace with everything on, as the policy says',
    async ({ pro: page }) => {
      // Two full passes through load-solve-design-detail, either side of a reload.
      test.setTimeout(300_000);
      /**
       * The documented policy, asserted rather than assumed.
       *
       * `rebar-workspace.svelte.ts` states it: closing keeps the switches, reloading resets
       * them. Nothing here is persisted, deliberately — the autosave restores the user's
       * PROJECT, and a restore that also brought back "columns hidden" would hand a returning
       * user an incomplete picture of their own building with nothing on screen to say so.
       */
      await openWorkspace(page, SMALL);
      const opened = await census(page);
      const family = SOLID_FAMILIES.find((f) => opened.solids[f] > 0)!;
      await setSwitch(page, 'rebar-layer-bars', false);
      await setSwitch(page, `rebar-layer-${family}`, false);
      await page.evaluate(() => window.__stabileoActions.autosaveNow());

      await page.reload();
      await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 60_000 });
      // No workspace, so no scene: the overlay does not survive a reload either.
      expect(await page.evaluate(() => window.__stabileo.rebarSceneCensus())).toBeNull();

      const banner = page.getByTestId('autosave-prompt');
      await expect(banner, 'the saved project is offered back').toBeVisible({ timeout: 30_000 });
      await banner.locator('button.restore').click();
      await expect
        .poll(() => page.evaluate(() => window.__stabileo.elementIds().length),
          { timeout: 30_000 })
        .toBeGreaterThan(0);

      /**
       * Solve and design again before regenerating the detailing.
       *
       * A restore hands back the MODEL, not the analysis: the demands and the code check are
       * derived state and are not persisted, so `cmd-generate-detailing` comes back disabled
       * with "Solve the model and run the code check first" until they exist. This is the same
       * sequence `project-restore.spec.ts` walks, and getting it wrong here is what made this
       * test fail on a disabled button rather than on anything about the switches.
       *
       * The detailing document is not persisted either, so it is regenerated. What is under
       * test is only the switch positions afterwards.
       */
      await page.evaluate(() => window.__stabileoActions.openDesignTab());
      await designAll(page);
      await page.getByTestId('detailing-disclosure').locator('> summary').click();
      const generate = page.getByTestId('cmd-generate-detailing');
      await expect(generate).toBeEnabled({ timeout: 60_000 });
      await generate.click();
      await expect.poll(() => assemblyCount(page), { timeout: 60_000 }).toBeGreaterThan(0);
      await openDocumentsStage(page);
      await page.getByTestId('doc-3d').click();
      await expect(page.getByTestId('rebar-workspace')).toBeVisible();

      await expect(page.getByTestId('rebar-layer-bars'), 'reinforcement is back on')
        .toBeChecked();
      await expect(page.getByTestId(`rebar-layer-${family}`), `${family} is back on`)
        .toBeChecked();
      const c = await censusWhen(page, (x) => x.triangles > 0, 'the restored scene is drawn');
      expect(total(c.bars), 'a default open shows every bar the document contains')
        .toBeGreaterThan(0);
    });
});

// ─── The whole building, in one pass ─────────────────────────────

test.describe('@slow every switch, on a seven-storey building', () => {
  test('walks all eight controls and reports the counts per family',
    async ({ pro: page }) => {
      // Load, solve, design, detail, floor-design, project and 20 917 tubes. The default
      // per-test budget is for journeys, not for a whole structure.
      test.setTimeout(900_000);
      await openWorkspace(page, BUILDING, true);

      const before = await census(page);
      const startCounters = await counters(page);
      console.log('scene as opened:', JSON.stringify(before));

      expect(total(before.bars), 'the building has steel').toBeGreaterThan(10_000);
      expect(before.markers, 'the building has open conflicts to mark').toBeGreaterThan(0);

      const present = SOLID_FAMILIES.filter((f) => before.solids[f] > 0 || before.bars[f] > 0);
      const absent = SOLID_FAMILIES.filter((f) => !present.includes(f));
      console.log('families present:', present.join(', '), '| absent:', absent.join(', '));
      // This building has columns, beams, slabs and walls, and no foundations at all.
      expect(present).toContain('column');
      expect(present).toContain('slab');

      for (const family of present) {
        await setSwitch(page, `rebar-layer-${family}`, false);
        const off = await censusWhen(
          page, (c) => c.bars[family] === 0 && c.solids[family] === 0,
          `${family} leaves the scene`);
        console.log(`${family} off:`, JSON.stringify({
          bars: off.bars, solids: off.solids, markers: off.markers,
        }));
        expect(others(off.bars, [family]), `${family} off: other families' steel`)
          .toEqual(others(before.bars, [family]));
        expect(others(off.solids, [family]), `${family} off: other families' concrete`)
          .toEqual(others(before.solids, [family]));
        expect(off.triangles, `${family} off draws less`).toBeLessThan(before.triangles);

        await setSwitch(page, `rebar-layer-${family}`, true);
        expect(await censusWhen(
          page, (c) => c.bars[family] === before.bars[family], `${family} comes back`),
        `${family} restored exactly`).toEqual(before);
      }

      for (const family of absent) {
        // A family the model does not contain: its switch must be inert, not destructive.
        await expect(page.getByTestId(`rebar-layer-empty-${family}`)).toBeVisible();
        await setSwitch(page, `rebar-layer-${family}`, false);
        const off = await censusWhen(
          page, (c) => c.triangles === before.triangles,
          `switching the empty ${family} changes nothing`);
        expect(off, `the empty ${family} switch is inert`).toEqual(before);
        await setSwitch(page, `rebar-layer-${family}`, true);
      }

      await setSwitch(page, 'rebar-layer-bars', false);
      const noBars = await censusWhen(page, (c) => total(c.bars) === 0, 'all steel leaves');
      expect(noBars.solids, 'the concrete stays').toEqual(before.solids);
      await setSwitch(page, 'rebar-layer-bars', true);
      await censusWhen(page, (c) => total(c.bars) === total(before.bars), 'the steel returns');

      await setSwitch(page, 'rebar-layer-concrete', false);
      const noConcrete = await censusWhen(
        page, (c) => total(c.solids) === 0, 'all concrete leaves');
      expect(noConcrete.bars, 'the steel stays').toEqual(before.bars);
      await setSwitch(page, 'rebar-layer-concrete', true);
      await censusWhen(page, (c) => total(c.solids) === total(before.solids),
        'the concrete returns');

      await setSwitch(page, 'rebar-layer-conflicts', false);
      const noMarkers = await censusWhen(page, (c) => c.markers === 0, 'the markers leave');
      expect(noMarkers.bars, 'the steel is untouched').toEqual(before.bars);
      await setSwitch(page, 'rebar-layer-conflicts', true);
      const back = await censusWhen(
        page, (c) => c.markers === before.markers, 'the markers return');

      expect(back, 'the whole walk ends where it started').toEqual(before);
      // Twenty-plus switch clicks over 20 917 tubes: not one rebuild, not one extra canvas,
      // not one extra GL context.
      expect(await counters(page), 'the walk cost flags, not geometry').toEqual(startCounters);
    });
});
