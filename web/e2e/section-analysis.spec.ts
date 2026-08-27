/**
 * The section-analysis panel, exercised as a user drives it.
 *
 * ── Why this file exists ───────────────────────────────────────────
 *
 * Everything this panel gained recently — a draggable application point, a
 * stress map, a maximised view, tensors, torsion, the step-by-step derivations
 * — was verified by hand and then not covered by anything. The unit tests that
 * do exist read the SOURCE and assert that certain lines are present, which
 * guards against a line being deleted and against nothing else. A regression in
 * the drag maths, the coordinate inversion, the overlay geometry or the toggle
 * wiring would have gone straight through.
 *
 * That is the highest-risk surface in the whole feature, because it is the part
 * built out of SVG, pointer events and measured layout — none of which a type
 * checker or a source-reading test can see.
 *
 * ── The line this file draws ───────────────────────────────────────
 *
 * Hooks load a model and solve it: that is putting the app in a starting
 * position, which is what hooks are for. Nothing below creates a stress query,
 * moves a marker, opens a section or toggles an overlay by writing state. Every
 * one of those is a click or a drag, because those are the thing under test.
 */

import { test, expect, loadModel } from './fixtures';

type Page = import('@playwright/test').Page;

/**
 * Boot Basic with the hooks and the REAL solver.
 *
 * The `pro` fixture does this for PRO; Basic needs its own, and skipping the
 * solver-ready wait is why a first version of this file timed out on every
 * test: the model loaded against the Vite stub and never produced results.
 */
async function openBasic(page: Page) {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 60_000 });
  await expect
    .poll(() => page.evaluate(() => window.__stabileo.solverReady()), {
      timeout: 60_000,
      message: 'real WASM solver must be initialised (not the Vite stub)',
    })
    .toBe(true);
}

/** Load, solve, and arm the analysis — the position, not the subject. */
async function armSectionAnalysis(page: Page) {
  await loadModel(page, 'simply-supported');
  // Solve by pressing the button rather than through the hook: in Basic the
  // toolbar command is the path a user takes, and the hook's solve counter did
  // not advance here at all.
  await page.getByRole('button', { name: 'Solve', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__stabileo.hasResults?.() ?? true), { timeout: 60_000 })
    .toBeTruthy();
  await page.getByRole('button', { name: 'Advanced', exact: true }).click();
  await page.getByRole('button', { name: 'Section Analysis', exact: true }).click();
}

/**
 * Click the model to place the query — the gesture, not a hook.
 *
 * Where the beam lands on the canvas depends on the viewport and the auto-fit,
 * so a single hard-coded point is a flake waiting to happen. This sweeps a few
 * plausible spots along the span, which is what a user does anyway when the
 * first click misses the member.
 */
async function queryAtMidspan(page: Page) {
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('no canvas');
  const panel = page.locator('.ssp-panel');
  for (const [fx, fy] of [[0.45, 0.5], [0.4, 0.45], [0.5, 0.55], [0.35, 0.5], [0.55, 0.5], [0.45, 0.4]]) {
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    try {
      await expect(panel).toBeVisible({ timeout: 3000 });
      return;
    } catch { /* try the next spot */ }
  }
  throw new Error('could not place a stress query anywhere on the member');
}

/** The section drawing's box, for aiming drags at it. */
async function svgBox(page: Page) {
  const b = await page.locator('.ssp-cross-svg').boundingBox();
  if (!b) throw new Error('no section svg');
  return b;
}

test.describe('arming the analysis', () => {
  test('the hint appears while armed and goes when the model is clicked @smoke', async ({ page }) => {
    await openBasic(page);
    await armSectionAnalysis(page);

    // The mode is invisible without this — that was the original complaint.
    await expect(page.locator('.sph')).toBeVisible();
    await queryAtMidspan(page);
    await expect(page.locator('.sph')).toBeHidden();
  });

  test('closing returns the pointer to selection instead of stranding it', async ({ page }) => {
    await openBasic(page);
    await armSectionAnalysis(page);
    await queryAtMidspan(page);

    await page.locator('.ssp-close').first().click();
    await expect(page.locator('.ssp-panel')).toHaveCount(0);
    /*
     * Stress mode has no visible control of its own, so being left in it is
     * unrecoverable.
     *
     * Checked on the STATE rather than on a lit button. It used to look for a
     * ribbon command called "Select" and assert its highlight, and there is no
     * such command any more: the pointer mode moved onto the model, and what
     * the ribbon now calls Selection is the panel that chooses which KINDS get
     * picked up. Reading the armed kinds asks the question the test means —
     * "is the pointer back to selecting things" — and does not care where the
     * control that sets it happens to live.
     */
    await expect
      .poll(() => page.evaluate(() => window.__stabileo.armedKinds()))
      .not.toContain('stress');
  });
});

test.describe('the drawing overlays', () => {
  test('the stress map paints the section and the toggle turns it off again', async ({ page }) => {
    await openBasic(page);
    await armSectionAnalysis(page);
    await queryAtMidspan(page);

    const map = page.locator('.ssp-toggle-map');
    await expect(map).toBeVisible();
    await map.click();
    // The map is a gradient fill, so its presence is the gradient's.
    await expect(page.locator('.ssp-cross-svg #ssp-stress-map')).toHaveCount(1);
    await map.click();
    await expect(page.locator('.ssp-cross-svg #ssp-stress-map')).toHaveCount(0);
  });

  test('the eccentric point drags, and the induced moments follow it', async ({ page }) => {
    await openBasic(page);
    await armSectionAnalysis(page);
    await queryAtMidspan(page);

    await page.locator('.ssp-toggle-ecc').click();
    await expect(page.locator('.ssp-ecc')).toBeVisible();

    // A load of our own, so there is something for the eccentricity to act on:
    // mid-span of this beam carries no axial force at all.
    await page.locator('.ssp-ecc-tab').nth(1).click();
    const n = page.locator('.ssp-ecc-field input').first();
    await n.fill('300');
    await n.dispatchEvent('input');

    const readout = () => page.locator('.ssp-ecc').innerText();
    const before = await readout();

    // Drag the marker up the section. This is the whole feature: the pointer
    // maths, the coordinate inversion and the reactive chain behind it.
    const box = await svgBox(page);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.25, { steps: 10 });
    await page.mouse.up();

    await expect.poll(readout).not.toBe(before);
    // Moving along the depth with an axial force present MUST produce My.
    await expect(page.locator('.ssp-ecc')).not.toContainText(/ΔMy \/ ΔMz\s*0 \/ 0/);
  });

  test('the point returns to the centroid when centred', async ({ page }) => {
    await openBasic(page);
    await armSectionAnalysis(page);
    await queryAtMidspan(page);
    await page.locator('.ssp-toggle-ecc').click();

    const box = await svgBox(page);
    await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.3);
    await page.locator('.ssp-ecc-reset').click();
    await expect(page.locator('.ssp-ecc')).toContainText(/y\s*0\s*·\s*z\s*0\s*mm/);
  });
});

test.describe('the maximised view', () => {
  test('fills the canvas area, clears the panel, and Escape returns @slow', async ({ page }) => {
    await openBasic(page);
    await armSectionAnalysis(page);
    await queryAtMidspan(page);

    const small = (await svgBox(page)).width;
    await page.locator('.ssp-toggle-max').click();
    await expect(page.locator('.ssp-cross-wrap.maximized')).toBeVisible();

    const big = (await svgBox(page)).width;
    expect(big).toBeGreaterThan(small * 2);

    // The panel holds the controls for the figure on display, so covering it
    // would be backwards — this is the geometry that guarantees it does not.
    const overlay = await page.locator('.ssp-cross-wrap.maximized').boundingBox();
    const panel = await page.locator('.basic-panel, .ssp-panel').first().boundingBox();
    expect(overlay!.x + overlay!.width).toBeLessThanOrEqual(panel!.x + 2);

    // And the panel is still operable underneath.
    await page.locator('.ssp-section-toggle').filter({ hasText: /TENSORS|TENSORES/i }).first().click();
    await expect(page.locator('.ssp-matrix').first()).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('.ssp-cross-wrap.maximized')).toHaveCount(0);
  });

  test('line weight is scaled down, not left proportional to the viewBox @slow', async ({ page }) => {
    await openBasic(page);
    await armSectionAnalysis(page);
    await queryAtMidspan(page);

    const outlineWidth = () => page.evaluate(() => {
      const path = document.querySelector('.ssp-cross-svg path[stroke-width]');
      return path ? parseFloat(path.getAttribute('stroke-width')!) : 0;
    });
    const normal = await outlineWidth();
    await page.locator('.ssp-toggle-max').click();
    const maximised = await outlineWidth();
    // Strokes are in viewBox units, so without this the outline would grow with
    // the figure and read as a heavy band.
    expect(maximised).toBeLessThan(normal);
  });
});

test.describe('the analytical sections', () => {
  test('tensors, torsion and the derivations all open with real content', async ({ page }) => {
    await openBasic(page);
    await armSectionAnalysis(page);
    await queryAtMidspan(page);

    // Tensors sit ABOVE Mohr deliberately: the circle is a construction on the
    // state, so the state comes first. Order is part of the design.
    const titles = await page.evaluate(() =>
      [...document.querySelectorAll('.ssp-panel .ssp-section-toggle')].map((el) =>
        (el as HTMLElement).innerText.replace(/\s+/g, ' ').trim().toUpperCase()));
    const idx = (re: RegExp) => titles.findIndex((t) => re.test(t));
    expect(idx(/TENSOR/)).toBeGreaterThan(-1);
    expect(idx(/MOHR/)).toBeGreaterThan(idx(/TENSOR/));

    await page.locator('.ssp-section-toggle').filter({ hasText: /TENSORS|TENSORES/i }).first().click();
    // Two 3x3 matrices: stress and strain.
    await expect(page.locator('.ssp-matrix')).toHaveCount(2);

    await page.locator('.ssp-section-toggle').filter({ hasText: /CENTROID|BARICENTRO/i }).first().click();
    // The working is a table of parts, not a bare answer.
    await expect(page.locator('.tw-table .tw-row').first()).toBeVisible();
    await expect(page.locator('.tw-total')).toBeVisible();

    await page.locator('.ssp-section-toggle').filter({ hasText: /SHEAR CENTRE|CENTRO DE CORTE/i }).first().click();
    // A named rule, not a number with no argument behind it.
    await expect(page.locator('.tw-rule-badge')).toBeVisible();
  });
});
