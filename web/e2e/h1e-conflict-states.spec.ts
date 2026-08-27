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
 *   `refused` / unreinforced members — zero in all three.
 *   `doc-error` — all three build a document successfully.
 *   `ConflictInspector` WAS unreachable — it renders from a marker click in the WebGL scene,
 *   which raycasts. `__stabileoActions.selectConflict` now stands in for that click, and the
 *   last describe exercises the panel end to end. It found a focus defect on its first run.
 *
 * Each is stated in `docs/handoffs/h1e-fixture-coverage.md` with what it would take. None is
 * faked, and no engine or solver change was made to manufacture one.
 */

import { test, expect, designAll, loadModel, openDocumentsStage } from './fixtures';
import type { Page } from '@playwright/test';

type Hooks = {
  __stabileo: {
    detailingAssemblies(): Array<{ conflicts?: unknown[] }>;
    rebarSceneCensus(): { markers: number };
    rebarSceneBuilds(): number;
  };
};

async function generate(page: Page, model: string) {
  await loadModel(page, model);
  await designAll(page);
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
      await generate(page, 'pro-edificio-7p');
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

test.describe('@slow what these fixtures cannot reach', () => {
  test.slow();
  test.use({ viewport: { width: 1280, height: 720 } });

  test('no RC fixture produces a refused member, and the premise is asserted',
    async ({ pro: page }) => {
      await generate(page, 'rc-qa-diagnostic');
      await openViewer(page);
      /*
       * `refused` is zero on all three RC fixtures. Asserted rather than annotated, so that the
       * day a fixture DOES produce one this fails and the unreinforced filter and the
       * `.unreinforced` block get exercised instead of staying source-only.
       */
      expect(await page.locator('.st-refused').count(), 'still no refused member').toBe(0);
      expect(await page.locator('.unreinforced').count(), 'and no unreinforced block').toBe(0);
      // The controls are still offered, which is correct — they are not dead, they are unused.
      await expect(page.getByTestId('rebar-hide-unreinforced')).toBeAttached();
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
