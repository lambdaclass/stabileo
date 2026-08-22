/**
 * The 3-D reinforcement workspace, through visible controls only.
 *
 * ── What the QA pass found, and what these assert ──────────────────
 *
 * The viewer worked and was unusable: a canvas a few hundred pixels wide, because it was
 * nested inside a sidebar whose width is a fixed pixel value. So the first assertions here
 * are about SIZE — a viewer that renders correctly in a slot nobody can inspect through is a
 * feature that does not exist — and the rest are about whether the inspection it now affords
 * actually works: layers, selection, focus, and every state stated rather than hidden.
 *
 * ── Why its own file ───────────────────────────────────────────────
 *
 * These journeys load committed projects through the same path the document journeys use, and
 * an eleventh project load in one describe block has already broken all nine tests in another
 * spec through leftover autosaved state.
 *
 * ── One journey, and observers ─────────────────────────────────────
 *
 * Four tests here used to pay a complete 7-storey setup each — load, solve, design, detail,
 * floor-design, build ~21 000 tubes — and the last of them ran on a machine that had been at
 * full tilt for minutes. That is the starvation diagnosed in
 * `docs/handoffs/pr20-heavy-spec-starvation.md`: the file failed when run whole and passed when
 * the failing test was run alone.
 *
 * Exactly one of them is about the JOURNEY, and it still performs every step of it — including
 * the solve, which is the operation that degrades under load. The other three only OBSERVE a
 * prepared workspace, so they restore the project `prepared-building.ts` had the app autosave
 * once, on a page of their own. See that file for why the prepared state travels in the browser
 * rather than through the test process, and why a page of one's own is not a shared page.
 */

import { designAll, loadModel, openDocumentsStage } from './fixtures';
import {
  test, expect, openPreparedWorkspace, readTally, readPieces,
} from './prepared-building';

type Page = import('@playwright/test').Page;
type Json = Record<string, unknown>;

function assemblies(page: Page): Promise<Json[]> {
  return page.evaluate(() =>
    (window.__stabileo as unknown as { detailingAssemblies(): Json[] }).detailingAssemblies());
}

/**
 * Load, solve, design, coordinate, and open the workspace — all through the UI.
 *
 * `withFloors` runs the SECOND detailing command as well. Beams and columns come from
 * `cmd-generate-detailing`; slabs, walls and footings come from `floor-design-run` in its own
 * disclosure, and a caller who wants the whole structure has to run both. That is the app's
 * real shape, and a helper that hid it would let a test claim coverage of families the user
 * never generated.
 */
async function openWorkspace(
  page: Page, example = 'rc-design-qa-8', withFloors = false,
) {
  await loadModel(page, example);
  await designAll(page);
  await page.getByTestId('detailing-disclosure').locator('> summary').click();
  const generate = page.getByTestId('cmd-generate-detailing');
  await expect(generate).toBeEnabled();
  await generate.click();
  await expect.poll(async () => (await assemblies(page)).length, { timeout: 30_000 })
    .toBeGreaterThan(0);

  if (withFloors) {
    await page.getByTestId('floor-families-disclosure').locator('> summary').click();
    const floors = page.getByTestId('floor-design-run');
    await expect(floors).toBeEnabled();
    await floors.click();
    await expect(page.getByTestId('floor-families')).toBeVisible();
  }

  const buildsBefore = await page.evaluate(() => window.__stabileo.rebarSceneBuilds());
  await openDocumentsStage(page);
  await page.getByTestId('doc-3d').click();
  await expect(page.getByTestId('rebar-workspace')).toBeVisible();
  /**
   * Visible is no longer the same thing as settled.
   *
   * The workspace now paints BEFORE it builds its geometry — that is what stops the "3-D"
   * click looking dead on a model whose floors have been designed — so `toBeVisible` returns
   * while the build is still to come, and anything the caller does in that window competes
   * with it. The phone-layout test caught this exactly: it resized the viewport between the
   * paint and the build, the window `resize` handler then ran AFTER the click that followed
   * it, and the rail toggle appeared not to toggle.
   *
   * Waited on the BUILD COUNTER, not on the "building" status: on a small model the build
   * takes two frames and that status may never be painted at all, so `toBeHidden` would pass
   * on an element that was never there and guarantee nothing. The counter moves exactly once
   * per build, whatever the model's size.
   *
   * This restores what `openWorkspace` has always meant to its callers: an open workspace with
   * its scene in it. Tests that want to observe the build itself do not use this helper.
   */
  await expect
    .poll(() => page.evaluate(() => window.__stabileo.rebarSceneBuilds()), { timeout: 120_000 })
    .toBeGreaterThan(buildsBefore);
}

/** How much of the window the workspace covers, as a fraction of its area. */
async function coverage(page: Page): Promise<number> {
  const box = await page.getByTestId('rebar-workspace').boundingBox();
  const win = page.viewportSize()!;
  if (!box) return 0;
  return (box.width * box.height) / (win.width * win.height);
}

// ─── The size problem this pass exists for ───────────────────────

test.describe('the workspace is the workspace, not a corner of one', () => {
  test('it covers essentially the whole window', async ({ pro: page }) => {
    await openWorkspace(page);
    // The sidebar this used to live in is a few hundred pixels wide on a 1600 px viewport —
    // well under a fifth of it. Anything below 0,9 here means it is still nested in something.
    expect(await coverage(page)).toBeGreaterThan(0.9);
    await expect(page.getByTestId('rebar-canvas')).toBeVisible();
  });

  test('the canvas itself is large, not just the frame around it', async ({ pro: page }) => {
    await openWorkspace(page);
    const canvas = await page.getByTestId('rebar-canvas').boundingBox();
    const win = page.viewportSize()!;
    expect(canvas!.width).toBeGreaterThan(win.width * 0.5);
    expect(canvas!.height).toBeGreaterThan(win.height * 0.4);
  });

  test('it closes and the model is still there', async ({ pro: page }) => {
    await openWorkspace(page);
    const before = await page.evaluate(() => window.__stabileo.elementIds());
    await page.getByTestId('rebar-workspace-close').click();
    await expect(page.getByTestId('rebar-workspace')).toHaveCount(0);
    // Closing is a VIEW operation. The project must be identical either side of it.
    expect(await page.evaluate(() => window.__stabileo.elementIds())).toEqual(before);
    expect((await assemblies(page)).length).toBeGreaterThan(0);
  });

  test('it reopens with the layers the user left set', async ({ pro: page }) => {
    await openWorkspace(page);
    await page.getByTestId('rebar-layer-bars').uncheck();
    await page.getByTestId('rebar-workspace-close').click();
    await page.getByTestId('rebar-open-workspace').click();
    await expect(page.getByTestId('rebar-workspace')).toBeVisible();
    // Stepping out to check something and coming back must not cost the whole setup.
    await expect(page.getByTestId('rebar-layer-bars')).not.toBeChecked();
  });

  test('on a phone the rail folds away and the canvas keeps the screen',
    async ({ pro: page }) => {
      /**
       * Opened at desktop size and then resized, deliberately.
       *
       * Reaching the RC workflow on a 390 px screen goes through the PRO drawer, which is a
       * different navigation problem and not what this test is about. Resizing after the
       * workspace is open exercises exactly the thing under test — whether the workspace
       * itself is usable at that size.
       */
      await openWorkspace(page);
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.getByTestId('rebar-workspace')).toBeVisible();
      expect(await coverage(page)).toBeGreaterThan(0.9);
      // The rail becomes a sheet over the canvas, reachable in one tap.
      const toggle = page.getByTestId('rebar-rail-toggle');
      await expect(toggle).toBeVisible();
      const canvas = await page.getByTestId('rebar-canvas').boundingBox();
      expect(canvas!.width).toBeGreaterThan(300);

      /**
       * Wait for the FOLD before touching the toggle.
       *
       * Crossing the breakpoint folds the rail away — `onResize` sets `railOpen = wide`, and
       * on a 390 px window that is false. Reading `aria-expanded` before that handler has run
       * captures the desktop value, and the click that follows then races it: the state settles
       * to closed and the click reopens it, so the attribute ends where it started and the
       * toggle looks broken when it is not. (Deferring the first geometry build made the race
       * land on the losing side every time, which is how it was found.)
       *
       * Asserting the fold rather than sleeping through it also makes this test do what its
       * name says: the rail folding away on a phone was in the title and in none of the
       * assertions.
       */
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');

      /**
       * Assert the toggle TOGGLES, not that it opens.
       *
       * The direction is still read rather than assumed, so this stays a statement about the
       * control and not about the state it happens to start in.
       */
      const before = await toggle.getAttribute('aria-expanded');
      await toggle.click();
      await expect(toggle).not.toHaveAttribute('aria-expanded', before ?? '');
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', before ?? '');
    });
});

// ─── Layers ──────────────────────────────────────────────────────

test.describe('every family is a layer of one model', () => {
  test('reinforcement can be hidden and shown without losing the concrete',
    async ({ pro: page }) => {
      await openWorkspace(page);
      const before = await page.getByTestId('rebar-workspace-summary').innerText();
      await page.getByTestId('rebar-layer-bars').uncheck();
      // "Hide reinforcement" hides reinforcement. It does not hide the building.
      await expect(page.getByTestId('rebar-workspace-summary')).not.toHaveText(before);
      await expect(page.getByTestId('rebar-canvas')).toBeVisible();
      await page.getByTestId('rebar-layer-bars').check();
      await expect(page.getByTestId('rebar-workspace-summary')).toHaveText(before);
    });

  test('foundations are a switch on the same model, not a separate route',
    async ({ pro: page }) => {
      await openWorkspace(page);
      const footings = page.getByTestId('rebar-layer-footing');
      await expect(footings).toBeVisible();
      await expect(footings).toBeChecked();
      await footings.uncheck();
      await expect(footings).not.toBeChecked();
      await footings.check();
      // The point of the switch: a footing and the column it carries are in one picture, so
      // "do these two agree" is a question the user can actually ask.
      await expect(page.getByTestId('rebar-layer-column')).toBeChecked();
    });

  test('concrete opacity does not break selection or identity', async ({ pro: page }) => {
    await openWorkspace(page);
    await page.getByTestId('rebar-element-list').locator('button').first().click();
    const parent = await page.getByTestId('rebar-sel-parent').innerText();
    // Turn the concrete right up; the selection and the ids it reports must not move.
    await page.getByTestId('rebar-opacity').fill('2');
    await expect(page.getByTestId('rebar-sel-parent')).toHaveText(parent);
  });

  test('a section can be cut and removed again', async ({ pro: page }) => {
    await openWorkspace(page);
    await page.getByTestId('rebar-section-axis').selectOption('z');
    await expect(page.getByTestId('rebar-section-at')).toBeVisible();
    await page.getByTestId('rebar-section-axis').selectOption('');
    await expect(page.getByTestId('rebar-section-at')).toHaveCount(0);
  });
});

// ─── Selection and navigation ────────────────────────────────────

test.describe('inspection', () => {
  test('picking a member from the list selects it and centres the camera',
    async ({ pro: page }) => {
      await openWorkspace(page);
      const first = page.getByTestId('rebar-element-list').locator('button').first();
      const label = await first.innerText();
      await first.click();
      // `data-focused` is set from the RETURN of the focus call, so it says the camera
      // actually moved rather than that a move was requested.
      await expect(page.getByTestId('rebar-inspector')).not.toHaveAttribute('data-focused', '');
      await expect(page.getByTestId('rebar-sel-parent')).toBeVisible();
      expect(label).toMatch(/\d/);
    });

  test('going back returns to the member looked at before', async ({ pro: page }) => {
    await openWorkspace(page);
    const list = page.getByTestId('rebar-element-list').locator('button');
    await list.nth(0).click();
    const firstParent = await page.getByTestId('rebar-sel-parent').innerText();
    await list.nth(1).click();
    await expect(page.getByTestId('rebar-sel-parent')).not.toHaveText(firstParent);
    await page.getByTestId('rebar-back').click();
    await expect(page.getByTestId('rebar-sel-parent')).toHaveText(firstParent);
  });

  test('a member can be isolated and the whole model brought back',
    async ({ pro: page }) => {
      await openWorkspace(page);
      const before = await page.getByTestId('rebar-workspace-summary').innerText();
      await page.getByTestId('rebar-element-list').locator('button').first().click();
      await page.getByTestId('rebar-isolate').click();
      await expect(page.getByTestId('rebar-workspace-summary')).not.toHaveText(before);
      await page.getByTestId('rebar-clear-isolation').click();
      await expect(page.getByTestId('rebar-workspace-summary')).toHaveText(before);
    });
});

// ─── Honest states ───────────────────────────────────────────────

test.describe('nothing is hidden because it has no steel', () => {
  test('every state present has a row with its own count', async ({ pro: page }) => {
    await openWorkspace(page, 'rc-qa-diagnostic');
    const counts = page.getByTestId('rebar-status-counts');
    await expect(counts).toBeVisible();
    // This fixture has four beams the verifier refuses to certify about their secondary
    // axis. They carry a PROVISIONAL proposal — a state of their own, not folded into
    // MODELLED, not folded into a generic "not ready", and not absent.
    await expect(page.getByTestId('rebar-status-PROVISIONAL')).toBeVisible();
    await expect(page.getByTestId('rebar-status-MODELLED')).toBeVisible();
  });

  test('filtering to the provisional state lists exactly those members',
    async ({ pro: page }) => {
      await openWorkspace(page, 'rc-qa-diagnostic');
      await page.getByTestId('rebar-status-PROVISIONAL').click();
      const rows = page.getByTestId('rebar-element-list').locator('button');
      await expect(rows).toHaveCount(4);
      // And they can still be selected and looked at — carrying a proposal does not make a
      // member unreachable, which was the original defect.
      await rows.first().click();
      await expect(page.getByTestId('rebar-sel-status'))
        .toContainText(/Propuesta provisional|Provisional proposal/);
    });

  test('the sidebar states the same counts without opening the workspace',
    async ({ pro: page }) => {
      await openWorkspace(page, 'rc-qa-diagnostic');
      await page.getByTestId('rebar-workspace-close').click();
      // A user who never opens the overlay must still be told. Closing it cannot re-hide the
      // members the whole change exists to surface.
      await expect(page.getByTestId('rebar-panel-state-PROVISIONAL')).toBeVisible();
      // `rebar-unreinforced` is now EMPTY on this fixture, and that is the improvement: the
      // four beams have steel. What the sidebar must still say is that the steel is a
      // proposal — the workspace banner is not on screen, because the workspace is closed.
      await expect(page.getByTestId('rebar-panel-state-PROVISIONAL')).toContainText('4');
    });
});

// ─── The scene is complete, not merely populated ─────────────────

test.describe('the workspace shows every family the detailing produced', () => {
  /**
   * The regression this guards, in the UI.
   *
   * A 7-storey building rendered 12 705 bars and looked full while every column tie in the
   * model was missing — 8 251 pieces that were described as a spacing schedule and never
   * built. "Lots of bars" and "all the bars" are indistinguishable by eye, so the counts are
   * on screen and this asserts them there.
   */
  test('a whole building reports columns, beams, slabs and walls with their steel',
    async ({ pro: page }) => {
      // A 203-member building: solve, design, detail and then build a scene of ~21 000 bars.
      // The default per-test budget is for journeys, not for a whole structure.
      test.setTimeout(240_000);
      await openWorkspace(page, 'pro-edificio-7p', true);
      const tally = page.getByTestId('rebar-tally');
      await expect(tally).toBeVisible();

      const num = async (family: string) =>
        (await tally.getByTestId(`rebar-tally-${family}`).innerText())
          .split(/\s+/).map(Number).filter((n) => !Number.isNaN(n));

      // Columns: concrete, longitudinals AND ties. The third number was zero.
      const col = await num('column');
      expect(col[0], 'column solids').toBeGreaterThan(50);
      expect(col[1], 'column longitudinals').toBeGreaterThan(500);
      expect(col[2], 'column ties').toBeGreaterThan(1000);

      // Beams, slabs and walls all present as concrete; slabs and walls with their bars.
      expect((await num('beam'))[0], 'beam solids').toBeGreaterThan(50);
      expect((await num('slab'))[1], 'slab bars').toBeGreaterThan(1000);
      expect((await num('wall'))[1], 'wall bars').toBeGreaterThan(50);
    });

  /**
   * The assertion that keeps the shared preparation honest.
   *
   * Every observer below restores a project the app autosaved after the whole chain, instead of
   * running the chain itself. That is only sound if the save/restore round trip loses nothing —
   * so it is asserted here, against the tally, the piece kinds and the mesh census recorded while
   * the LIVE scene was on screen, rather than assumed for the rest of the file.
   *
   * The census is the strong half: it is read off `mesh.visible` and the drawn ranges, not off
   * the filter the tally is derived from. A restore that produced the right numbers in the panel
   * and a smaller scene would pass on the tally alone and fail here.
   */
  test('the saved project reopens as the scene the design produced',
    async ({ preparedPage: page, preparedProject }) => {
      test.setTimeout(240_000);
      await openPreparedWorkspace(page, preparedProject);

      expect(await readTally(page), 'the family tally survives the round trip')
        .toEqual(preparedProject.tally);
      expect(await readPieces(page), 'the piece kinds survive the round trip')
        .toEqual(preparedProject.pieces);
      expect(await page.evaluate(() => window.__stabileo.rebarSceneCensus()),
        'the meshes drawn survive the round trip').toEqual(preparedProject.census);
    });

  test('a model whose beams design shows beam steel too', async ({ pro: page }) => {
    // The 7-storey model cannot prove this — its beams are refused by the verifier, so beam
    // steel does not exist to be shown. This one distinguishes "the view drops beam bars"
    // from "the design produced none".
    await openWorkspace(page, 'rc-qa-diagnostic');
    const beam = (await page.getByTestId('rebar-tally').getByTestId('rebar-tally-beam')
      .innerText()).split(/\s+/).map(Number).filter((n) => !Number.isNaN(n));
    expect(beam[1], 'beam longitudinals').toBeGreaterThan(0);
    expect(beam[2], 'beam stirrups').toBeGreaterThan(0);
  });
});

// ─── Toggles, states and naming ──────────────────────────────────

test.describe('a layer switch takes its own family and nothing else', () => {
  test('turning columns off removes their STEEL as well as their concrete',
    async ({ preparedPage: page, preparedProject }) => {
      test.setTimeout(240_000);
      await openPreparedWorkspace(page, preparedProject);
      const tally = page.getByTestId('rebar-tally');
      const nums = async (family: string) =>
        (await tally.getByTestId(`rebar-tally-${family}`).innerText())
          .split(/\s+/).map(Number).filter((n) => !Number.isNaN(n));

      const slabsBefore = await nums('slab');
      await page.getByTestId('rebar-layer-column').uncheck();
      // The column row disappears entirely — concrete AND bars. Leaving 9 311 column bars
      // floating with no column round them is what "the toggles do not work" meant.
      await expect(tally.getByTestId('rebar-tally-column')).toHaveCount(0);
      // And no other family moved.
      expect(await nums('slab')).toEqual(slabsBefore);

      await page.getByTestId('rebar-layer-column').check();
      await expect(tally.getByTestId('rebar-tally-column')).toBeVisible();
    });

  test('a family the model does not contain says so on its switch',
    async ({ preparedPage: page, preparedProject }) => {
      test.setTimeout(240_000);
      await openPreparedWorkspace(page, preparedProject);
      // This building has no footings at all. A switch that looks identical to a working one
      // is how "no foundations in this model" reads as "the viewer lost them".
      await expect(page.getByTestId('rebar-layer-empty-footing')).toBeVisible();
      await expect(page.getByTestId('rebar-empty-families')).toBeVisible();
      await expect(page.getByTestId('rebar-tally-footing')).toHaveCount(0);
    });
});

test.describe('the cage is legible and the refusals are explained', () => {
  test('closed ties, crossties and joint ties are counted apart',
    async ({ preparedPage: page, preparedProject }) => {
      test.setTimeout(240_000);
      await openPreparedWorkspace(page, preparedProject);
      const pieces = page.getByTestId('rebar-pieces');
      await expect(pieces).toBeVisible();
      // `role` calls all 8 212 of them "transverse"; a hoop and a single-leg crosstie are
      // different pieces and the view has to say which is which.
      await expect(pieces.getByTestId('rebar-piece-closedTie')).toBeVisible();
      await expect(pieces.getByTestId('rebar-piece-crosstie')).toBeVisible();
    });

  test('a provisional member states its reason in words', async ({ pro: page }) => {
    await openWorkspace(page, 'rc-qa-diagnostic');
    await page.getByTestId('rebar-status-PROVISIONAL').click();
    await page.getByTestId('rebar-element-list').locator('button').first().click();
    const reason = page.getByTestId('rebar-sel-reason');
    await expect(reason).toBeVisible();
    // Not the state name — the design's own sentence, with the ratio that caused it.
    await expect(reason).toContainText('%');
    await expect(reason).toContainText(/eje|axis/i);
  });
});

// ─── Cleanliness ─────────────────────────────────────────────────

test.describe('the workspace is quiet', () => {
  test('opening, filtering and selecting logs no Svelte error', async ({ pro: page }) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));

    await openWorkspace(page, 'rc-qa-diagnostic');
    await page.getByTestId('rebar-layer-footing').uncheck();
    await page.getByTestId('rebar-layer-bars').uncheck();
    await page.getByTestId('rebar-layer-bars').check();
    await page.getByTestId('rebar-status-MODELLED').click();
    await page.getByTestId('rebar-element-list').locator('button').first().click();
    await page.getByTestId('rebar-section-axis').selectOption('z');
    await page.getByTestId('rebar-workspace-close').click();

    // Svelte's dev-mode guards (each_key_duplicate, state_unsafe_mutation, effect_update_depth)
    // all report through console.error, so this catches the class rather than one instance.
    expect(errors.filter((e) => /svelte|each_key|effect_update|state_unsafe/i.test(e)))
      .toEqual([]);
  });
});

// ─── The drawings still come out ─────────────────────────────────

test.describe('the drawings exported from the panel have content', () => {
  test('the DXF carries geometry and states whether it may be built from',
    async ({ pro: page }) => {
      await openWorkspace(page);
      await page.getByTestId('rebar-workspace-close').click();
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 30_000 }),
        page.getByTestId('rebar-export').click(),
      ]);
      expect(download.suggestedFilename()).toMatch(/\.dxf$/);
      const stream = await download.createReadStream();
      const chunks: Buffer[] = [];
      for await (const c of stream) chunks.push(c as Buffer);
      const dxf = Buffer.concat(chunks).toString('utf8');

      expect(dxf).toContain('ENTITIES');
      expect(dxf).toContain('EOF');
      const ordinates = dxf.split('\n').filter((l) => l.trim() === '10').length;
      expect(ordinates, 'the DXF has no coordinates in it').toBeGreaterThan(20);
      expect(dxf).toMatch(/NOT FOR CONSTRUCTION|ISSUED FOR CONSTRUCTION|FOR REVIEW/);
    });
});
