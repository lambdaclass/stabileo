/**
 * PR18 — the visible foundations workflow.
 *
 * Deliberately NOT written like `floor-design.spec.ts`, which fabricates a
 * `DetailingAssembly` as a JSON literal and injects it through `seedDetailing`. That proves
 * PR17's assembly UI renders a value of that shape; it proves nothing about PR18 producing
 * one, and an injected store is not acceptance evidence.
 *
 * Everything below goes through controls a user can reach: the fixture arrives by the normal
 * example path, the solve is the toolbar's own solve, and every footing and soil value is
 * typed into the real input. The only assertion is on what the production run produced.
 */

import { test, expect, loadModel, solveModel, computeDemands } from './fixtures';
import type { Page } from '@playwright/test';

const QA = 'rc-design-qa-8';

/** Open the RC Design tab and expand the slabs/walls/foundations disclosure. */
async function openFloorFamilies(page: Page) {
  await page.evaluate(() => window.__stabileoActions.openDesignTab());
  const disclosure = page.getByTestId('floor-families-disclosure');
  await expect(disclosure).toBeVisible();
  // `details` opens by clicking its summary — the same gesture a user makes.
  await disclosure.locator('summary').first().click();
  await expect(page.getByTestId('floor-families')).toBeVisible();
}

async function openFoundations(page: Page) {
  await openFloorFamilies(page);
  await page.getByTestId('floor-family-foundations').click();
  await expect(page.getByTestId('foundations-panel')).toBeVisible();
}

/** Add a footing on the first supported node offered by the real select. */
async function addFooting(page: Page): Promise<void> {
  const select = page.getByTestId('footing-add-node');
  await expect(select).toBeVisible();
  const first = await select.locator('option:not([value=""])').first().getAttribute('value');
  expect(first, 'the fixture must offer a supported node').not.toBeNull();
  await select.selectOption(first!);
  await expect(page.getByTestId('footing-editor')).toBeVisible();
}

/**
 * Point the footing at its column and its stratum through the editor's own dropdowns.
 *
 * Both are explicit rather than relying on the creation-time default: a footing created
 * before any stratum exists correctly gets `soilProfileId: null`, and the realistic fix is
 * the one a user performs — choosing it in the panel.
 */
async function attachColumnAndSoil(page: Page) {
  const column = page.getByTestId('footing-column');
  const firstColumn = await column.locator('option:not([value=""])').first().getAttribute('value');
  expect(firstColumn, 'the supported node must have a column on it').not.toBeNull();
  await column.selectOption(firstColumn!);

  const soil = page.getByTestId('footing-soil');
  const firstSoil = await soil.locator('option:not([value=""])').first().getAttribute('value');
  expect(firstSoil, 'a stratum must exist to found on').not.toBeNull();
  await soil.selectOption(firstSoil!);
}

/** Type a complete, valid footing geometry through the real inputs. */
async function dimensionFooting(page: Page) {
  for (const [id, value] of [
    ['footing-B', '2.0'], ['footing-L', '2.0'], ['footing-thickness', '0.5'],
    ['footing-cover', '0.05'], ['footing-elevation', '-1.2'],
  ] as const) {
    const input = page.getByTestId(id);
    await input.fill(value);
    await input.blur();
  }
}

/** Add a stratum and state its allowable bearing pressure. */
async function addStatedSoil(page: Page, kPa = '250') {
  await page.getByTestId('soil-add').click();
  const bearing = page.locator('[data-testid^="soil-"][data-testid$="-bearing"]').first();
  await expect(bearing).toBeVisible();
  await bearing.fill(kPa);
  await bearing.blur();
}

test.describe('@smoke foundations — the visible workflow', () => {
  test('F-A the foundations editor is reachable from RC Design', async ({ pro: page }) => {
    await loadModel(page, QA);
    await openFoundations(page);

    // The point of the panel: before it existed, `checkFooting` had no reachable caller.
    await expect(page.getByTestId('footing-empty')).toBeVisible();
    await expect(page.getByTestId('soil-empty')).toBeVisible();
  });

  test('F-B a new footing is INCOMPLETE and says exactly why', async ({ pro: page }) => {
    await loadModel(page, QA);
    await openFoundations(page);
    await addFooting(page);

    // B and L start at zero on purpose. A plausible default would silently pass a bearing
    // check nobody performed.
    await expect(page.getByTestId('footing-1-incomplete')).toBeVisible();
    const issues = page.getByTestId('footing-issues');
    await expect(issues).toBeVisible();
    await expect(issues).toContainText('B');
  });

  test('F-B2 designing floors with an undimensioned footing does not crash the panel',
    async ({ pro: page }) => {
      /**
       * The workflow that crashed, driven the way Bauti drove it — with one honest limitation.
       *
       * A footing arrives at B = L = 0, so `validateFooting` raises TWO blocking issues with the
       * same i18n key — `footing.issue.planDimension` with `axis: 'B'` and with `axis: 'L'` — and
       * the footing run carries both into its unsupported list. `FloorFamiliesPanel` keyed that
       * list on `r.key`, and Svelte refused it:
       *
       *     each_key_duplicate: Keyed each block has duplicate key
       *     `footing.issue.planDimension` at indexes 0 and 1
       *
       * ── What this test can and cannot prove ────────────────────
       *
       * It CANNOT reproduce that throw. Svelte emits the duplicate-key guard only in dev builds —
       * `EachBlock.js` gates it on `if (dev && node.metadata.keyed)` — and Playwright serves a
       * production `vite build`, so the check is compiled out. Verified: this test passes with and
       * without the fix. Bauti hit it on the dev server, which is what port 4003 runs.
       *
       * The executable regression therefore lives in `message-list-keys.test.ts`, which pins the
       * superseded key strategy as colliding on this exact list.
       *
       * What this DOES prove is the other half, and it is the half a user cares about: the
       * workflow completes and BOTH records are on screen, in both panels, with their own axis
       * visible. A fix that deduplicated the list to silence the error would pass the unit test
       * and fail here.
       */
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });

      await loadModel(page, QA);
      await solveModel(page);
      await computeDemands(page);
      await openFoundations(page);
      await addFooting(page);

      // Both plan-dimension issues are on screen, and they are distinguishable.
      const issues = page.getByTestId('footing-issues');
      await expect(issues).toBeVisible();
      // The two rows, matched on the RENDERED SENTENCE rather than on a bare letter: 'B' and 'L'
      // appear incidentally in almost any prose, and an assertion that loose passes against a
      // panel showing one row. `plan dimension B is 0 m` cannot.
      const planRows = issues.locator('li', { hasText: /plan dimension [BL] is/ });
      await expect(planRows).toHaveCount(2);
      await expect(issues.locator('li', { hasText: 'plan dimension B is' })).toHaveCount(1);
      await expect(issues.locator('li', { hasText: 'plan dimension L is' })).toHaveCount(1);

      // The gesture that threw: "Design and detail floors". The panel is already open — clicking
      // the disclosure summary again would toggle it shut, which is what a first version of this
      // test did to itself.
      await page.getByTestId('floor-design-run').click();

      // The footing is reported NOT verified, with BOTH reasons rendered rather than one.
      const notVerified = page.getByTestId('floor-footings-not-verified');
      await expect(notVerified).toBeVisible();
      // BOTH reasons, as two distinct rows. This is the list that threw: it is keyed per message
      // and one footing legitimately contributes two entries with the same key.
      // `li li`, not `li`: the outer row is the footing and the inner ones are its reasons, so an
      // unscoped match counts the ancestor too.
      const reasonRows = notVerified.locator('li li');
      await expect(reasonRows.filter({ hasText: 'plan dimension B is' })).toHaveCount(1);
      await expect(reasonRows.filter({ hasText: 'plan dimension L is' })).toHaveCount(1);

      // Kept for what it is worth: a production build throws no duplicate-key error by
      // construction, but any OTHER runtime error on this path would still surface here.
      expect(errors, `no runtime errors: ${errors.join(' | ')}`).toEqual([]);
    });

  test('F-C a stratum states no bearing pressure until the engineer gives one', async ({ pro: page }) => {
    await loadModel(page, QA);
    await openFoundations(page);
    await page.getByTestId('soil-add').click();

    const issues = page.locator('[data-testid^="soil-"][data-testid$="-issues"]').first();
    await expect(issues).toBeVisible();
    // No regulation supplies this value, so nothing may be prefilled.
    await expect(issues).toContainText('bearing');
  });

  test('F-D a complete footing is verified by the production run', async ({ pro: page }) => {
    await loadModel(page, QA);
    await solveModel(page);
    await computeDemands(page);
    await openFoundations(page);
    // Ground first, then the footing: that is the order the data depends on, and a footing
    // created before any stratum exists correctly has none.
    await addStatedSoil(page);
    await addFooting(page);
    await dimensionFooting(page);
    await attachColumnAndSoil(page);

    // The command, not a hook.
    await page.getByTestId('floor-design-run').click();

    const summary = page.getByTestId('floor-foundations-summary');
    await expect(summary).toBeVisible();
    // "1 of 1 footing(s) verified" — asserted exactly. A bare '1' would also match
    // "0 of 1", which is how the first version of this test passed while verifying nothing.
    await expect(summary).toContainText('1 of 1');
    await expect(page.getByTestId('floor-footings-not-verified')).toHaveCount(0);
  });

  test('F-E a footing with no stated soil is reported NOT verified, with the reason', async ({ pro: page }) => {
    await loadModel(page, QA);
    await solveModel(page);
    await computeDemands(page);
    await openFoundations(page);
    await addFooting(page);
    await dimensionFooting(page);
    // No stratum added at all — the gate must refuse rather than assume a pressure.
    await page.getByTestId('floor-design-run').click();

    const notVerified = page.getByTestId('floor-footings-not-verified');
    await expect(notVerified).toBeVisible();
    await expect(notVerified).toContainText('soil');
    // And the count is visible on the closed summary too.
    await expect(page.getByTestId('floor-not-verified-count')).toBeVisible();
  });

  test('F-F assumptions are recorded and shown apart from problems', async ({ pro: page }) => {
    await loadModel(page, QA);
    await solveModel(page);
    await computeDemands(page);
    await openFoundations(page);
    await addStatedSoil(page);
    await addFooting(page);
    await dimensionFooting(page);
    await attachColumnAndSoil(page);
    await page.getByTestId('floor-design-run').click();

    // An assumption is not a problem: listing it among the problems would train the reader
    // to dismiss it, so it has its own section.
    const assumptions = page.getByTestId('floor-footing-assumptions');
    await expect(assumptions).toBeVisible();
    await assumptions.locator('summary').click();
    await expect(assumptions).toContainText('service');
  });

  /*
   * Persistence is deliberately NOT asserted here. There is no snapshot/restore test hook,
   * and adding one only to observe it would be testing the hook. The seam every persistence
   * path shares — `snapshot()`/`restore()` — is covered by 14 unit tests in
   * `footing-persistence.test.ts`, including the .ded JSON round trip and the URL share,
   * which is stronger and non-flaky.
   */

  /**
   * PR18-A: the bottom mat is a preference the user can see and change, and a design they can
   * read. Both go through the real controls — the whole point is that the Ø16 which used to be
   * a private store constant is now on screen.
   */
  test('F-H the bottom-mat diameters are visible and editable', async ({ pro: page }) => {
    await loadModel(page, QA);
    await openFoundations(page);

    const prefs = page.getByTestId('footing-mat-prefs');
    await expect(prefs).toBeVisible();
    const x = page.getByTestId('footing-mat-dia-x');
    const y = page.getByTestId('footing-mat-dia-y');
    // The migration default, on screen rather than buried in a module.
    await expect(x).toHaveValue('16');
    await expect(y).toHaveValue('16');
    // And it is a control, not a caption.
    await x.selectOption('20');
    await expect(x).toHaveValue('20');
    // The spacing policy is stated too, so the project records that its spacings came from the
    // code rather than from a hand entry.
    await expect(page.getByTestId('footing-mat-spacing-policy')).toHaveValue('AUTO_CODE_COMPLIANT');

    // ── PR18-B: which perpendicular mat goes down ───────────────
    //
    // A real decision worth a full bar diameter of effective depth, that no clause makes. It is
    // therefore the engineer's, and it is a control rather than an assumption — with AUTO as a
    // stated delegation rather than as an absence.
    const order = page.getByTestId('footing-mat-layer-order');
    await expect(order).toBeVisible();
    await expect(order).toHaveValue('AUTO');
    for (const v of ['X_BELOW_Y', 'Y_BELOW_X', 'AUTO']) {
      await order.selectOption(v);
      await expect(order).toHaveValue(v);
    }
  });

  /**
   * Changing the order must not leave the previous mat on screen as though it were current.
   *
   * Real bar positions, real elevations and real marks belonging to a design the project no
   * longer specifies is the one failure the whole revision graph exists to prevent — and it only
   * became possible in PR18-B, because until the run held BARS a superseded schedule beside a
   * retired document was a visible inconsistency a reader could reason about.
   */
  test('F-J changing the layer order supersedes the physical mat on screen', async ({ pro: page }) => {
    await loadModel(page, QA);
    await solveModel(page);
    await computeDemands(page);
    await openFoundations(page);
    await addStatedSoil(page);
    await addFooting(page);
    await dimensionFooting(page);
    await attachColumnAndSoil(page);
    await page.getByTestId('floor-design-run').click();

    await expect(page.getByTestId('footing-mat-geometry-status')).toBeVisible();
    await expect(page.getByTestId('footing-mat-superseded')).toHaveCount(0);

    await page.getByTestId('footing-mat-layer-order').selectOption('Y_BELOW_X');

    // Superseded, and the old geometry is no longer presented at all.
    await expect(page.getByTestId('footing-mat-superseded')).toBeVisible();
    await expect(page.getByTestId('footing-mat-schedule')).toHaveCount(0);
    await expect(page.getByTestId('footing-mat-geometry-status')).toHaveCount(0);
    // It is NOT regenerated automatically: the remedy is the explicit command, named.
    await expect(page.getByTestId('footing-mat-superseded'))
      .toContainText(/re-run|volver a ejecutar/i);

    // Running it again produces the newly requested arrangement.
    await page.getByTestId('floor-design-run').click();
    await expect(page.getByTestId('footing-mat-superseded')).toHaveCount(0);
    await expect(page.getByTestId('footing-mat-layer-order-resolved'))
      .toContainText(/Y below X|Y debajo de X/i);
  });

  test('F-I the designed mat is shown, and so is the PHYSICAL mat it produced', async ({ pro: page }) => {
    await loadModel(page, QA);
    await solveModel(page);
    await computeDemands(page);
    await openFoundations(page);
    await addStatedSoil(page);
    await addFooting(page);
    await dimensionFooting(page);
    await attachColumnAndSoil(page);

    // Before the run there is nothing to show, and the panel says so instead of showing zeroes.
    await expect(page.getByTestId('footing-mat-no-run')).toBeVisible();

    await page.getByTestId('floor-design-run').click();

    // Both directions, each with its own numbers.
    for (const axis of ['X', 'Y'] as const) {
      const dir = page.getByTestId(`footing-mat-${axis}`);
      await expect(dir).toBeVisible();
      await expect(page.getByTestId(`footing-mat-${axis}-status`)).toContainText(/designed|dimensionada/i);
      // The two As figures a reviewer needs in order to know which requirement governs.
      await expect(dir).toContainText(/As flexure|As flexión/i);
      await expect(dir).toContainText(/As minimum|As mínima/i);
      await expect(page.getByTestId(`footing-mat-${axis}-regions`)).toBeVisible();
    }

    // What DESIGNED does and does not mean, once, in a sentence — and then answered by the
    // statuses below rather than repeated as a flat claim. PR18-A printed four such claims;
    // three of them (geometry, layer order, anchorage) are now false, so they are gone and
    // their real statuses stand in their place.
    await expect(page.getByTestId('footing-mat-designed-means')).toBeVisible();
    await expect(page.getByTestId('footing-mat-geometry-pending')).toHaveCount(0);
    await expect(page.getByTestId('footing-mat-layer-order-pending')).toHaveCount(0);
    await expect(page.getByTestId('footing-mat-anchorage-pending')).toHaveCount(0);

    // Both layer depths, so the conservative envelope reads as a choice rather than as the
    // only depth there is.
    await expect(page.getByTestId('footing-mat-X'))
      .toContainText(/d if lower \/ upper|d si inferior \/ superior/i);

    // ── The physical mat ────────────────────────────────────────
    const physical = page.getByTestId('footing-mat-physical');
    await expect(physical).toBeVisible();
    // The resolved layer order, WHY it was resolved that way, and what the other arrangement
    // would have cost — an automatic selection whose reason is invisible is unreviewable.
    await expect(page.getByTestId('footing-mat-layer-order-resolved'))
      .toContainText(/below|debajo/i);
    await expect(page.getByTestId('footing-mat-layer-order-reason')).not.toBeEmpty();
    const arrangements = page.getByTestId('footing-mat-arrangements');
    await expect(arrangements).toBeVisible();
    await expect(arrangements.locator('tbody tr')).toHaveCount(2);

    // Geometry MODELLED, with real elevations and a schedule that reconciles with the bars.
    await expect(page.getByTestId('footing-mat-geometry-status'))
      .toContainText(/modelled|modelada/i);
    await expect(page.getByTestId('footing-mat-elevations')).toBeVisible();
    await expect(page.getByTestId('footing-mat-schedule')).toBeVisible();
    await expect(page.getByTestId('footing-mat-reconciliation'))
      .toContainText(/reconcile|reconcilian/i);
    // Marks, so the schedule row names the same steel a bender receives.
    await expect(page.getByTestId('footing-mat-schedule')).toContainText(/F\d+/);

    // Anchorage, measured from the generated endpoints, per direction and per side.
    await expect(page.getByTestId('footing-mat-anchorage-status')).toBeVisible();
    for (const axis of ['X', 'Y'] as const) {
      const a = page.getByTestId(`footing-mat-anchorage-${axis}`);
      await expect(a).toBeVisible();
      await expect(a).toContainText(/ld required|ld requerida/i);
      await expect(a).toContainText(/low|bajo/i);
    }

    // The limitations that survive, still prominent. Top steel was never evaluated, and it must
    // not be inferable only from its absence.
    await expect(page.getByTestId('footing-mat-top-not-evaluated-physical')).toBeVisible();

    // The physical-geometry memo is citable.
    const steps = page.getByTestId('footing-mat-geometry-steps');
    await steps.locator('summary').click();
    await expect(steps).toContainText(/25\.2\.1/);

    // The clause chain is citable from the panel.
    const clauses = page.getByTestId('footing-mat-clauses');
    await clauses.locator('summary').click();
    for (const c of ['13.3.3.2', '7.6.1', '7.7.2.3', '24.3.2', '25.2.1']) {
      await expect(clauses).toContainText(c);
    }
  });

  test('F-K the export panel says the JSON is not a drawing and names the tool',
    async ({ pro: page }) => {
      /**
       * The QA blocker: a user downloaded the handoff JSON and nothing anywhere said what to do with
       * it. The CAD viewer reads `.step`/`.glb`/`.stl`/`.3mf`/`.dxf` and robot descriptions — never
       * `.json` — so a handoff dropped in its catalogue is invisible. The explanation belongs at the
       * moment of download, which is this panel.
       *
       * Lives in THIS spec rather than beside the other CAD-handoff journeys: those open the
       * committed project through the Básico file input and are sensitive to the autosaved state a
       * preceding run leaves behind, so adding an eleventh project load to that describe block broke
       * every test in it. Measured, not guessed.
       */
      await loadModel(page, QA);
      await openFoundations(page);
      await addFooting(page);
      await dimensionFooting(page);

      const notADrawing = page.getByTestId('footing-cad-not-a-drawing');
      await expect(notADrawing).toBeVisible();
      await expect(notADrawing).toContainText(/semantic/i);
      await expect(notADrawing).toContainText(/no CAD program opens it directly/i);

      const nextStep = page.getByTestId('footing-cad-next-step');
      await expect(nextStep).toBeVisible();
      // Every output named, including the one the viewer cannot show.
      for (const output of ['STEP', 'GLB', 'IFC4', 'cad-review.json']) {
        await expect(nextStep).toContainText(output);
      }

      // A visible action that needs no command and no port knowledge.
      const open = page.getByTestId('footing-cad-open-tool');
      await expect(open).toBeVisible();
      await expect(open).toContainText(/RC CAD handoff/i);
      await expect(page.getByTestId('footing-cad-tool-at')).toContainText('127.0.0.1:4179');

      // And the scope sentence no longer claims the mats are excluded — V2 carries them.
      await expect(page.getByText(/Does NOT include top reinforcement/i)).toBeVisible();
    });

  test('F-G the panel offers no second regulation selector', async ({ pro: page }) => {
    await loadModel(page, QA);
    await openFoundations(page);

    // Project Regulations is the ONE seismic/concrete code source. The floor panel displays
    // the resolved code and must not offer a way to change it.
    const code = page.getByTestId('floor-design-code');
    await expect(code).toBeVisible();
    await expect(code.locator('select')).toHaveCount(0);
  });
});
