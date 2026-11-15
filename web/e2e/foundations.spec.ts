/**
 * PR18 — the visible foundations workflow.
 *
 * Deliberately NOT written like `floor-design.spec.ts`, which fabricates a
 * `DetailingAssembly` as a JSON literal and injects it through `seedDetailing`. That proves
 * PR17's assembly UI renders a value of that shape; it proves nothing about PR18 producing
 * one, and an injected store is not acceptance evidence.
 *
 * Everything below goes through controls a user can reach: the fixture arrives by the normal
 * example path, and every footing and soil value is typed into the real input.
 */

import { test, expect, loadModel, ribbonCmd } from './fixtures';
import type { Page } from '@playwright/test';

const QA = 'rc-design-qa-8';

/** The foundations editor, from the model's foundations tool under «More tools». */
async function openFoundations(page: Page) {
  await page.getByTestId('pr-stage-model').click();
  await ribbonCmd(page, 'foundations');
  await expect(page.getByTestId('foundation-model-panel')).toBeVisible();
  const editor = page.locator('details.fd-editor');
  if (await editor.getAttribute('open') === null) await editor.locator('> summary').click();
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

test.describe('@smoke foundations — the visible workflow', () => {
  test('F-A the foundations editor is reachable from the model', async ({ pro: page }) => {
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

  test('F-C a stratum states no bearing pressure until the engineer gives one', async ({ pro: page }) => {
    await loadModel(page, QA);
    await openFoundations(page);
    await page.getByTestId('soil-add').click();

    const issues = page.locator('[data-testid^="soil-"][data-testid$="-issues"]').first();
    await expect(issues).toBeVisible();
    // No regulation supplies this value, so nothing may be prefilled.
    await expect(issues).toContainText('bearing');
  });

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
});
