/**
 * Every combination of selectable kinds, driven through the real app.
 *
 * ── Why this is separate from the unit audit ───────────────────────
 *
 * `box-select.test.ts` already proves the geometry over all fifteen
 * combinations, both gestures and both projections, and proves it by
 * property rather than by fifteen hand-written answers. What it cannot see is
 * the half where the original defect actually lived: the viewport deciding
 * whether to START a drag, reading the armed kinds out of the store, and
 * merging the result into the right selection sets. Three of the four filters
 * drew no rectangle at all, and no amount of geometry testing would have said
 * so.
 *
 * So this file asks the app the same questions the unit audit asks the module,
 * and asks them in both viewports because 2D canvas and 3D camera reach that
 * wiring by different paths.
 *
 * ── The properties ────────────────────────────────────────────────
 *
 *   * **Isolation** — nothing outside the armed kinds is ever selected. This
 *     is what keeps the highlight and the delete key in step.
 *   * **Window ⊆ crossing** — the same rectangle as a net takes at least what
 *     it takes as a frame.
 *   * **Reach** — every kind is genuinely selectable by a drag. Isolation
 *     alone is satisfied by a viewport that selects nothing at all, which is
 *     precisely the bug being guarded against.
 */

import { test, expect, loadModel } from './fixtures';

type Page = import('@playwright/test').Page;

const KINDS = ['elements', 'nodes', 'supports', 'loads'] as const;
type Kind = typeof KINDS[number];

/** The fifteen non-empty subsets, built rather than typed out. */
const PERMUTATIONS: Kind[][] = [];
for (let mask = 1; mask < 16; mask++) {
  PERMUTATIONS.push(KINDS.filter((_, i) => mask & (1 << i)));
}

/**
 * Each kind brings exactly itself.
 *
 * Members used to bring their end nodes along, so a highlighted bar would not
 * have unlit ends. But the selection is also what Delete removes: sweeping a
 * frame's members and pressing Delete took the nodes, and with them the
 * supports and nodal loads standing on them — a gesture that reads as "remove
 * these bars" wiped the model.
 */
const allowedFor = (kinds: Kind[]): Set<Kind> => new Set<Kind>(kinds);

/**
 * The canvas the model is drawn on.
 *
 * `canvas` alone is ambiguous: the 3D viewport also renders an 80 px axis
 * gizmo, and it comes FIRST in the document. A drag aimed at `.first()` lands
 * inside that little box and selects nothing — which reads exactly like a
 * viewport that cannot select, and cost a round of debugging the app before
 * the test was suspected.
 */
const modelCanvas = (page: Page) => page.locator('canvas:not(.axis-gizmo)').first();

async function openBasic(page: Page) {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 60_000 });
  await expect
    .poll(() => page.evaluate(() => window.__stabileo.solverReady()), { timeout: 60_000 })
    .toBe(true);
}

/** The pointer opens in pan, where a drag moves the view and selects nothing. */
async function armSelect(page: Page) {
  const btn = page.getByTestId('pointer-mode');
  if ((await btn.getAttribute('aria-pressed')) === 'true') await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
}

/**
 * Arm exactly these kinds, through the panel a user would use.
 *
 * Additions come before removals because the panel refuses to leave nothing
 * armed — a selection filter that selects nothing is not a state worth
 * having, so the last kind cannot be turned off. Removing first would hit
 * that floor and silently leave an extra kind on.
 *
 * The state is read from `aria-pressed`, which is the attribute the panel
 * actually publishes: `SelectionPanel` renders plain toggle BUTTONS rather
 * than radios-that-become-checkboxes, deliberately, because a radiogroup owes
 * a roving tabindex the list never implemented. This read was `aria-checked`
 * — always `null` on a button — and the two reads below therefore inverted
 * each other: the first click armed a kind and the second, seeing `null`
 * again, toggled it straight back off. The audit failed on the first
 * two-kind permutation, in both viewports, and had done so from the start:
 * this file carries no `@smoke` tag and CI's e2e job runs `--grep @smoke`,
 * so it had never run remotely. Assert on the attribute the component
 * documents, not on the one a checkbox would have had.
 */
async function armKinds(page: Page, kinds: Kind[]) {
  const multi = page.getByTestId('multi-kind');

  if (kinds.length === 1) {
    if (await multi.isChecked()) await multi.uncheck();
    await page.getByTestId(`select-mode-${kinds[0]}`).click();
  } else {
    if (!(await multi.isChecked())) await multi.check();
    for (const k of kinds) {
      const item = page.getByTestId(`select-mode-${k}`);
      if ((await item.getAttribute('aria-pressed')) !== 'true') await item.click();
    }
    for (const k of KINDS) {
      if (kinds.includes(k)) continue;
      const item = page.getByTestId(`select-mode-${k}`);
      if ((await item.getAttribute('aria-pressed')) === 'true') await item.click();
    }
  }

  const armed = await page.evaluate(() => window.__stabileo.armedKinds());
  expect([...armed].sort(), `armed kinds for ${kinds.join('+')}`).toEqual([...kinds].sort());
}

/**
 * Sweep most of the canvas.
 *
 * `window` runs left → right and takes what is wholly inside; `crossing` runs
 * right → left and takes whatever it touches. Same rectangle either way, which
 * is what makes the subset property meaningful.
 */
async function sweep(page: Page, gesture: 'window' | 'crossing') {
  const box = await modelCanvas(page).boundingBox();
  if (!box) throw new Error('no canvas');
  const left = box.x + box.width * 0.08, right = box.x + box.width * 0.92;
  const top = box.y + box.height * 0.08, bottom = box.y + box.height * 0.92;
  const [x1, x2] = gesture === 'window' ? [left, right] : [right, left];

  await page.evaluate(() => window.__stabileoActions.clearSelection());
  await page.mouse.move(x1, top);
  await page.mouse.down();
  // Two intermediate points is enough to be a drag rather than a click; more
  // only buys wall-clock, and this runs sixty times.
  await page.mouse.move((x1 + x2) / 2, (top + bottom) / 2);
  await page.mouse.move(x2, bottom);
  await page.mouse.up();
  return page.evaluate(() => window.__stabileo.selectionByKind());
}

/**
 * The whole audit, over whichever viewport the fixture puts on screen.
 *
 * One page for thirty drags: reloading between permutations would turn a
 * two-minute audit into a twenty-minute one and prove nothing extra, since
 * the selection is reset before every gesture anyway.
 */
function auditViewport(label: string, example: string, is3D: boolean) {
  test.describe(`${label}: every permutation of kinds`, () => {
    test(`${label} — isolation, subset and reach across all fifteen`, async ({ page }) => {
      // Thirty drags plus the panel work between them. Generous rather than
      // slow(): a timeout here would be read as a hung app, not as an audit
      // that needed more room.
      test.setTimeout(300_000);
      await openBasic(page);
      await loadModel(page, example);
      /*
       * Prove which viewport this is before auditing it. The axis gizmo is
       * rendered by the 3D viewport and by nothing else, so its presence is
       * the check that a "3D" run is not quietly a second pass over the 2D
       * canvas — which is a way for this file to double its runtime and halve
       * its coverage while staying green.
       */
      await expect(page.locator('canvas.axis-gizmo')).toHaveCount(is3D ? 1 : 0);
      await armSelect(page);
      // The panel stays open for the whole audit — reopening it per
      // permutation is fifteen clicks that test nothing.
      await page.getByTestId('rb-cmd-select').click();
      await expect(page.getByTestId('multi-kind')).toBeVisible();

      /** Union of everything any permutation managed to select, per kind. */
      const everReached: Record<Kind, Set<number>> = {
        elements: new Set(), nodes: new Set(), supports: new Set(), loads: new Set(),
      };

      for (const kinds of PERMUTATIONS) {
        await armKinds(page, kinds);
        const allowed = allowedFor(kinds);

        const win = await sweep(page, 'window');
        const cross = await sweep(page, 'crossing');
        const where = `${label} ${kinds.join('+')}`;

        for (const k of KINDS) {
          if (!allowed.has(k)) {
            expect(win[k], `${k} leaked into ${where} (window)`).toHaveLength(0);
            expect(cross[k], `${k} leaked into ${where} (crossing)`).toHaveLength(0);
            continue;
          }
          for (const id of win[k]) {
            expect(cross[k], `${k} ${id}: window took it, crossing did not — ${where}`).toContain(id);
          }
          for (const id of cross[k]) everReached[k].add(id);
        }
      }

      // Isolation is satisfied by selecting nothing at all — which was the bug.
      for (const k of KINDS) {
        expect(everReached[k].size, `${label}: no ${k} was ever selectable by a drag`).toBeGreaterThan(0);
      }
    });
  });
}

auditViewport('2D', 'two-story-frame', false);
auditViewport('3D', '3d-portal-frame', true);
