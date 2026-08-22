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
 *   `ConflictInspector` — reachable only by clicking a conflict MARKER in the WebGL scene,
 *   which raycasts. There is no `selectConflict` hook in `e2e-hooks.ts`.
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

  test('the conflict inspector needs a marker click, which raycasts', async ({ pro: page }) => {
    await generate(page, 'rc-qa-diagnostic');
    await openViewer(page);
    /*
     * `ConflictInspector` renders from `selection.conflict`, which `rebarWorkspace.selectConflict`
     * sets — and the only UI route to that is clicking a marker in the WebGL scene, which is
     * raycast against the canvas. There is no `selectConflict` in `e2e-hooks.ts`, so this panel
     * cannot be reached deterministically from a test.
     *
     * Asserted as ABSENT with the reason, rather than left silently uncovered. Adding the hook is
     * the one-line fix, proposed in the handoff.
     */
    expect(await markers(page), 'the markers are there to be clicked').toBeGreaterThan(0);
    await expect(page.getByTestId('rebar-conflict-warning'),
      'and the inspector is not reachable without clicking one').toHaveCount(0);
  });
});
