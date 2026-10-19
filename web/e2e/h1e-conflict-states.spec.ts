/**
 * The states H1-D could only cover from source, on the fixtures that actually produce them.
 *
 * ── What the three RC fixtures produce ─────────────────────────────
 *
 * Measured before writing a line of this, on unmodified production:
 *
 *   rc-design-qa-8      0 conflicts ·    0 markers · modelled 9
 *   rc-qa-diagnostic   68 conflicts ·   68 markers · modelled 23 · provisional 5
 *   pro-edificio-7p  1318 conflicts · 1310 markers · modelled 194 · provisional 6 · failed 6
 *
 * So H1-D's annotation — "conflicts and unreinforced: nothing to filter on rc-design-qa-8" — was
 * a fixture limitation and not a defect, and `rc-qa-diagnostic` lifts it at 4 s rather than the
 * 7-storey building's 20 s. `pro-edificio-7p` is used once, for the `failed` state that only it
 * has.
 *
 * ── What no fixture produces, and is therefore NOT covered here ────
 *
 *   `refused` / unreinforced members — zero in all three when this was written. No longer: since
 *   the design reads the bars' anchorage in the columns and designs a beam that declares no role
 *   in the lateral system as part of it (292b87f68), `rc-qa-diagnostic` refuses beams on its own
 *   (`what these fixtures now reach` below), and so does `rc-design-qa-8` (e5, e6).
 *   `doc-error` — all three build a document successfully.
 *   `ConflictInspector` WAS unreachable — it renders from a marker click in the WebGL scene,
 *   which raycasts. `__stabileoActions.selectConflict` now stands in for that click, and the
 *   last describe exercises the panel end to end. It found a focus defect on its first run.
 *
 * Each is stated in `docs/handoffs/h1e-fixture-coverage.md` with what it would take. None is
 * faked, and no engine or solver change was made to manufacture one.
 */

import { test, expect, designAll, loadModel, openDocumentsStage, openClassicDesign } from './fixtures';
import type { Page } from '@playwright/test';

type Hooks = {
  __stabileo: {
    detailingAssemblies(): Array<{ conflicts?: unknown[] }>;
    rebarSceneCensus(): { markers: number };
    rebarSceneBuilds(): number;
  };
};

async function generate(page: Page, model: string, opts: { beamsNotLateral?: boolean } = {}) {
  await loadModel(page, model);
  if (opts.beamsNotLateral) {
    // The beams declared not part of the lateral-force-resisting system, through the design data.
    await openClassicDesign(page);
    await page.getByTestId('pr-cmd-designData').click();
    await page.getByTestId('design-data-lateral-beams').selectOption('gravity');
  }
  await designAll(page);
  if (opts.beamsNotLateral) await page.getByTestId('pr-cmd-design').click();
  await page.getByTestId('detailing-disclosure').locator('> summary').click();
  const generate = page.getByTestId('cmd-generate-detailing');
  await expect(generate).toBeEnabled();
  await generate.click();
  await expect
    .poll(() => page.evaluate(() =>
      (window as unknown as Hooks).__stabileo.detailingAssemblies().length),
      { timeout: 180_000 })
    .toBeGreaterThan(0);
}

async function openViewer(page: Page) {
  await openDocumentsStage(page);
  const before = await page.evaluate(() =>
    (window as unknown as Hooks).__stabileo.rebarSceneBuilds());
  await page.getByTestId('doc-3d').click();
  await expect(page.getByTestId('rebar-workspace')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() =>
      (window as unknown as Hooks).__stabileo.rebarSceneBuilds()), { timeout: 240_000 })
    .toBeGreaterThan(before);
}

const markers = (page: Page) => page.evaluate(() =>
  (window as unknown as Hooks).__stabileo.rebarSceneCensus().markers);

test.describe('@slow conflicts, on a model that has them', () => {
  test.slow();
  test.use({ viewport: { width: 1280, height: 720 } });

  test('the conflicts layer draws them and hides them', async ({ pro: page }) => {
    await generate(page, 'rc-qa-diagnostic');
    await openViewer(page);

    /*
     * The assertion H1-D could not make. It annotated the control as "present, nothing to filter"
     * and asserted the PREMISE — `markers === 0` on `rc-design-qa-8` — precisely so that this
     * could replace it rather than the annotation being forgotten.
     */
    const drawn = await markers(page);
    expect(drawn, 'this model draws conflict markers').toBeGreaterThan(0);

    await page.getByTestId('rebar-layer-conflicts').click();
    await expect.poll(() => markers(page), { timeout: 10_000 }).toBe(0);

    await page.getByTestId('rebar-layer-conflicts').click();
    await expect.poll(() => markers(page), { timeout: 10_000 }).toBe(drawn);
    test.info().annotations.push(
      { type: 'coverage', description: `${drawn} conflict markers toggled off and back` });
  });

  test('the document reports them and refuses to claim more than a draft',
    async ({ pro: page }) => {
      await generate(page, 'rc-qa-diagnostic');
      await openDocumentsStage(page);
      const download = page.waitForEvent('download', { timeout: 30_000 });
      await page.getByTestId('doc-xlsx').click();
      await download;

      /*
       * `doc-conflicts` is a state H1-C never reached: on `rc-design-qa-8` there are none, so the
       * block never rendered and the readiness never fell below its best case.
       */
      const conflicts = page.getByTestId('doc-conflicts');
      await expect(conflicts).toBeVisible();
      expect((await conflicts.innerText()).trim()).toMatch(/\d+/);

      // And the readiness says draft, which is the honest consequence of unresolved conflicts.
      await expect(page.getByTestId('doc-readiness')).toContainText(/draft|borrador|rascunho/i);
    });

  test('a provisional member is marked as one in the rail', async ({ pro: page }) => {
    await generate(page, 'rc-qa-diagnostic');
    await openViewer(page);
    const provisional = page.locator('.st-provisional');
    expect(await provisional.count(), 'this model has provisional members').toBeGreaterThan(0);
    // Violet, and equal to what Three.js paints — the contract asserted in both directions by
    // `shared-status-tokens.test.ts`, here confirmed on a member that actually has the state.
    const dot = provisional.first().locator('.dot').first();
    if (await dot.count()) {
      const painted = await dot.evaluate((el) => getComputedStyle(el).backgroundColor);
      const scene = await page.evaluate(() => {
        const el = document.createElement('span');
        el.style.color = '#a066d3'; document.body.appendChild(el);
        const out = getComputedStyle(el).color; el.remove(); return out;
      });
      expect(painted, 'the provisional dot is the scene violet').toBe(scene);
    }
  });
});

test.describe('@slow the failed state, on the only model that reaches it', () => {
  test.slow();
  test.use({ viewport: { width: 1280, height: 720 } });

  test('the 7-storey building shows failed members alongside modelled ones',
    async ({ pro: page }) => {
      test.setTimeout(600_000);
      /*
       * Its beams declared not part of the lateral system. Undeclared, they are designed as part
       * of it (292b87f68), fy developed at the column face, and all 119 refuse on that anchorage
       * (SEARCH_EXHAUSTED): the failed members this state is read on were beams, so the rail
       * read refused 119 · modelled 84 · failed 0. Declared, 41 refuse and the failed state is
       * back beside the modelled ones (failed 1 · refused 41 · modelled 161, measured).
       */
      await generate(page, 'pro-edificio-7p', { beamsNotLateral: true });
      await openViewer(page);

      const failed = page.locator('.st-failed');
      expect(await failed.count(), 'only this fixture produces failed members')
        .toBeGreaterThan(0);
      // Its dot is the scene's conflicted red, by value.
      const dot = failed.first().locator('.dot').first();
      const painted = await dot.evaluate((el) => getComputedStyle(el).backgroundColor);
      const scene = await page.evaluate(() => {
        const el = document.createElement('span');
        el.style.color = '#e0444a'; document.body.appendChild(el);
        const out = getComputedStyle(el).color; el.remove(); return out;
      });
      expect(painted).toBe(scene);

      /*
       * And the state WORD beside it, which is what makes the colour support rather than the
       * signal — the rule `RebarStatusPanel` states for itself and that `floor-family-states`
       * asserts for the floor card.
       */
      const label = failed.first().locator('.st, .label').first();
      expect((await label.innerText()).trim().length).toBeGreaterThan(1);

      expect(await markers(page), 'and it draws its conflicts').toBeGreaterThan(0);
    });
});

test.describe('@slow what these fixtures now reach, and what they cannot', () => {
  test.slow();
  test.use({ viewport: { width: 1280, height: 720 } });

  /*
   * This was «no RC fixture produces a refused member», asserted as a premise so that the day a
   * fixture did produce one it would fail and the unreinforced filter and the `.unreinforced`
   * block would be exercised instead. That day came. Since the design reads the bars' anchorage
   * in the columns (3980d8402) and designs a beam that declares no role in the lateral system as
   * part of it, fy developed at the column face (292b87f68), `rc-qa-diagnostic` refused seven
   * beams — e13 to e18 and e20, SEARCH_EXHAUSTED on the anchorage of their top and bottom bars —
   * and e19 at the biaxial gate with nothing to propose (UNSUPPORTED). Before: 0 refused; after:
   * those eight, none with steel.
   *
   * Since the search stopped offering stirrups below Av,min (CIRSOC 201 §9.6.3.1, c16090225),
   * the options it retains per region reach 6 Ø12 top, 5 Ø12 bottom, Ø6 c/20–22,5 on e14 and
   * e18, which pass every check, anchorage included (worst 0,992). Their refusal listed
   * `optionsBeyondRetained` as not explored: a search that ran out (48 tried), never a proof.
   * The verifier only gained a row in that change. Now five SEARCH_EXHAUSTED (e13, e15–e17,
   * e20) and the same UNSUPPORTED e19.
   */
  test('rc-qa-diagnostic now refuses members, and the rail, the block and the filter say so',
    async ({ pro: page }) => {
      await generate(page, 'rc-qa-diagnostic');
      const counts = await page.evaluate(() => window.__stabileo.runCounts());
      expect([counts?.searchExhausted, counts?.unsupported], 'the refusals the engine reached').toEqual([5, 1]);
      await openViewer(page);
      expect(await page.locator('.st-refused').count(), 'the rail reports them').toBeGreaterThan(0);
      const block = page.getByTestId('rebar-unreinforced');
      await expect(block, 'and the block names them').toBeVisible();
      for (const id of [13, 15, 16, 17, 19, 20]) await expect(block).toContainText(String(id));

      // The filter is no longer unused: it takes their bare concrete out of the scene.
      type Census = { solids: Record<string, number> };
      const solids = () => page.evaluate(() =>
        (window.__stabileo as unknown as { rebarSceneCensus(): Census }).rebarSceneCensus().solids.beam ?? 0);
      const shown = await solids();
      await page.getByTestId('rebar-hide-unreinforced').check();
      await expect.poll(solids, { timeout: 60_000 }).toBeLessThan(shown);
    });

  test('the inspector is closed until a marker is chosen', async ({ pro: page }) => {
    await generate(page, 'rc-qa-diagnostic');
    await openViewer(page);
    expect(await markers(page), 'the markers are there to be chosen').toBeGreaterThan(0);
    await expect(page.getByTestId('rebar-conflict-warning'),
      'and nothing claims a conflict until one is').toHaveCount(0);
  });
});

/**
 * The conflict inspector, end to end.
 *
 * It renders from `selection.conflict`, which only a marker click sets — raycast against the
 * canvas, at a screen position no test can compute reliably. `__stabileoActions.selectConflict`
 * is the test mutator that stands in for that click: it resolves the SLOT through the scene's own
 * `conflictAt`, so what gets selected is what is actually drawn there, not an index into a list
 * the test rebuilt for itself.
 */
test.describe('@slow the conflict inspector', () => {
  test.slow();
  test.use({ viewport: { width: 1280, height: 720 } });

  async function selectFirstConflict(page: Page) {
    const ok = await page.evaluate(() => (window as unknown as {
      __stabileoActions: { selectConflict(slot?: number): boolean };
    }).__stabileoActions.selectConflict(0));
    expect(ok, 'slot 0 draws a conflict on this model').toBe(true);
  }

  test('the band, the ids and the two measurements', async ({ pro: page }) => {
    await generate(page, 'rc-qa-diagnostic');
    await openViewer(page);
    await selectFirstConflict(page);

    // The band that says this is not constructible — the sentence, not a colour.
    const band = page.getByTestId('rebar-conflict-warning');
    await expect(band).toBeVisible();
    expect((await band.innerText()).trim().length).toBeGreaterThan(20);

    // Both bars named separately, because "A/B are 14 mm apart" is a measurement and
    // "bar c12-4 in column 12" is a thing you can go and look at.
    for (const id of ['rebar-conflict-bar-a', 'rebar-conflict-bar-b']) {
      expect((await page.getByTestId(id).innerText()).trim().length,
        `${id} names a bar`).toBeGreaterThan(0);
    }
    expect(await page.getByTestId('rebar-conflict-bar-a').innerText())
      .not.toBe(await page.getByTestId('rebar-conflict-bar-b').innerText());

    // Measured against required, which is what makes it a verdict rather than an opinion.
    for (const id of ['rebar-conflict-measured', 'rebar-conflict-required']) {
      expect((await page.getByTestId(id).innerText()).trim()).toMatch(/-?[\d.,]+/);
    }
    await expect(page.getByTestId('rebar-conflict-class')).toBeVisible();
  });

  test('severity is carried by the text, not only by the hue', async ({ pro: page }) => {
    await generate(page, 'rc-qa-diagnostic');
    await openViewer(page);

    /*
     * `.head.overlap strong` takes `--st-danger` and the base head takes `--st-text`; the
     * distinction between interpenetration and a spacing shortfall is what those two levels
     * exist for. Whichever this slot is, the severity must be READABLE — the colour is support.
     */
    const seen = new Set<string>();
    for (let slot = 0; slot < 6; slot++) {
      const ok = await page.evaluate((s) => (window as unknown as {
        __stabileoActions: { selectConflict(slot?: number): boolean };
      }).__stabileoActions.selectConflict(s), slot);
      if (!ok) continue;
      const head = page.locator('.head').first();
      const text = (await head.innerText()).trim();
      expect(text.length, `slot ${slot} states its severity in words`).toBeGreaterThan(2);
      seen.add(text.split(/\s+/)[0]);
    }
    expect(seen.size, 'at least one severity was read').toBeGreaterThan(0);
    test.info().annotations.push(
      { type: 'coverage', description: `severities seen: ${[...seen].join(', ')}` });
  });

  test('centre and isolate both act, and neither loses the keyboard', async ({ pro: page }) => {
    await generate(page, 'rc-qa-diagnostic');
    await openViewer(page);
    await selectFirstConflict(page);

    const centre = page.getByTestId('rebar-conflict-centre');
    await expect(centre).toBeVisible();
    await centre.focus();
    await centre.click();
    expect(await page.evaluate(() => document.activeElement === document.body),
      'centring does not drop focus to the body').toBe(false);

    const isolate = page.getByTestId('rebar-conflict-isolate');
    await expect(isolate).toBeVisible();
    const censusBefore = await page.evaluate(() => JSON.stringify(
      (window as unknown as { __stabileo: { rebarSceneCensus(): unknown } })
        .__stabileo.rebarSceneCensus()));
    await isolate.click();

    // Isolating the pair changes the scene, and offers the way back.
    await expect(page.getByTestId('rebar-conflict-clear-isolation')).toBeVisible();
    expect(await page.evaluate(() => JSON.stringify(
      (window as unknown as { __stabileo: { rebarSceneCensus(): unknown } })
        .__stabileo.rebarSceneCensus())), 'the scene isolated the pair').not.toBe(censusBefore);
    expect(await page.evaluate(() => document.activeElement === document.body),
      'and isolating does not drop focus either').toBe(false);

    await page.getByTestId('rebar-conflict-clear-isolation').click();
    await expect(page.getByTestId('rebar-conflict-isolate'), 'and it comes back').toBeVisible();
  });

  test('Escape still leaves, with a conflict selected', async ({ pro: page }) => {
    await generate(page, 'rc-qa-diagnostic');
    await openViewer(page);
    await selectFirstConflict(page);
    await expect(page.getByTestId('rebar-conflict-warning')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('rebar-workspace')).toHaveCount(0);
    expect(await page.evaluate(() =>
      document.activeElement?.getAttribute('data-testid')), 'and returns to the opener')
      .toBe('doc-3d');
    await expect(page.getByTestId('documents-stage')).toBeVisible();
  });
});
