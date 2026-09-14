/**
 * A disabled command in PRO is a statement about the project, and it has to be readable.
 *
 * ── Why this file exists ───────────────────────────────────────────
 *
 * The control matrix (`docs/handoffs/pr20-pro-design-matrix.md`) went through every control on
 * the RC design surface and asked what a test actually touches. Three findings were cheap to
 * close and are closed here; the rest are listed there as pending.
 *
 *  1. **The two EMPTY STATES of the whole tab were untested.** `design-placeholder-solve` and
 *     `design-placeholder-demands` are the entire content of the design tab before anything has
 *     been computed, and nothing referenced either id. "The table is missing" and "the table says
 *     why it is missing" were indistinguishable to the suite.
 *
 *  2. **Every command's DISABLED state was untested.** Each spec that drives a command waits for
 *     it to be enabled first, so the suite proved the commands work and never that they refuse —
 *     and refusing with a reason is most of what this bar does. `detailing-prerequisites`, the
 *     visible sentence naming which members are in the way and how many, was referenced by
 *     nothing at all.
 *
 *  3. **The 1280×720 layout invariant was guarded by a comment.** `.rc-workflow` used to be
 *     `overflow: hidden`, and with the disclosures open the *Generar detallado* button sat at
 *     y = 874 on a 720 px window with `document.elementFromPoint` returning null at its centre:
 *     an ENABLED command outside every scroll path, where a real pointer event lands on nothing
 *     while a programmatic `.click()` still works. A user in that state clicks and the app does
 *     nothing, with no error and no explanation — and no test could have told them apart, because
 *     Playwright's own click bypasses the question by scrolling first.
 *
 * All three run on a fresh page or on the small QA model, so this file adds seconds, not minutes.
 */

import { test, expect, loadModel, solveModel, designAll } from './fixtures';

type Page = import('@playwright/test').Page;

/** The commands on the design bar, in the order the pipeline runs them. */
const COMMANDS = [
  'cmd-compute-demands', 'cmd-code-check', 'cmd-autodesign', 'cmd-design-all',
  'cmd-generate-detailing', 'cmd-open-3d',
] as const;

test.describe('@smoke a command that cannot run says so', () => {
  test('with nothing solved, the tab states what it needs instead of showing an empty table',
    async ({ pro: page }) => {
      // The design tab is active and the project is empty: this is what a PRO user sees first.
      await expect(page.getByTestId('design-placeholder-solve')).toBeVisible();
      await expect(page.getByTestId('design-table')).toHaveCount(0);

      // And the placeholder is a sentence, not an icon: the requirement is stated in words.
      const said = await page.getByTestId('design-placeholder-solve').innerText();
      expect(said.trim().length, 'the placeholder states the requirement in words')
        .toBeGreaterThan(10);

      for (const id of COMMANDS) {
        await expect(page.getByTestId(id), `${id} is disabled with nothing solved`).toBeDisabled();
      }
    });

  test('solved but not verified, the tab asks for the demands rather than for a solve',
    async ({ pro: page }) => {
      await loadModel(page, 'rc-design-qa-8');
      await solveModel(page);

      // The placeholder CHANGES. Both states exist and they are different sentences — which is
      // the whole point of having two of them.
      await expect(page.getByTestId('design-placeholder-solve')).toHaveCount(0);
      await expect(page.getByTestId('design-placeholder-demands')).toBeVisible();

      // Computing demands is now the one command that is available, which is what makes the
      // placeholder's instruction followable.
      await expect(page.getByTestId('cmd-compute-demands')).toBeEnabled();
      await expect(page.getByTestId('cmd-generate-detailing')).toBeDisabled();
    });

  test('the detailing command names the members in its way, on screen and in its tooltip',
    async ({ pro: page }) => {
      await loadModel(page, 'rc-design-qa-8');
      await solveModel(page);

      const generate = page.getByTestId('cmd-generate-detailing');
      await expect(generate).toBeDisabled();

      /**
       * The reason is VISIBLE, not only a tooltip.
       *
       * A `title` is announced by a screen reader and reachable by a mouse, and by nothing else:
       * a keyboard-only user hovering nothing would be left with a dead button. So the same
       * sentence is rendered as text, and this asserts that the two agree rather than that either
       * one exists.
       */
      const blockers = page.getByTestId('detailing-prerequisites');
      await expect(blockers).toBeVisible();
      // Whitespace collapsed on both sides: `innerText` normalises the markup's indentation and
      // the attribute does not, and the claim here is about the SENTENCE, not about its spacing.
      const flat = (s: string) => s.replace(/\s+/g, ' ').trim();
      const said = flat(await blockers.innerText());
      expect(said.length, 'the prerequisites are stated in words').toBeGreaterThan(10);
      expect(flat(await generate.getAttribute('title') ?? ''),
        'the tooltip and the visible sentence are the same sentence').toBe(said);
    });

  test('the 3-D command refuses with a reason until a document exists',
    async ({ pro: page }) => {
      const open3d = page.getByTestId('cmd-open-3d');
      await expect(open3d).toBeDisabled();
      // Disabled, not hidden — a command that vanishes teaches nobody what it needs.
      await expect(open3d).toBeVisible();
      expect((await open3d.getAttribute('title') ?? '').trim().length,
        'the blocked 3-D command states why').toBeGreaterThan(0);
      // The assembly count only appears when there is something to count.
      await expect(page.getByTestId('cmd-open-3d-count')).toHaveCount(0);
    });
});

// ─── The layout invariant, at the size it failed at ──────────────

test.describe('@smoke at 1280×720 no enabled command is out of reach', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  /** Whether a real pointer event at the element's own centre would land on the element. */
  async function hitTestable(page: Page, id: string): Promise<boolean> {
    const el = page.getByTestId(id);
    // The same scroll a user performs, and the same one Playwright would perform before a click.
    // With `overflow: hidden` there was no scroll path to perform, which is exactly the defect.
    await el.scrollIntoViewIfNeeded();
    return el.evaluate((node) => {
      const r = node.getBoundingClientRect();
      const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!at && (at === node || node.contains(at) || node.contains(at.parentElement));
    });
  }

  test('every enabled command is hit-testable with all three disclosures open',
    async ({ pro: page }) => {
      test.setTimeout(180_000);
      // A designed model, because the defect was an ENABLED button out of reach. A disabled one
      // that cannot be clicked is not the failure this guards.
      await loadModel(page, 'rc-design-qa-8');
      await designAll(page);

      for (const id of ['code-settings-disclosure', 'detailing-disclosure',
        'floor-families-disclosure']) {
        await page.getByTestId(id).locator('> summary').click();
        await expect(page.getByTestId(id)).toHaveAttribute('open', '');
      }

      /**
       * The toasts, waited out rather than ignored.
       *
       * The solve and the design each raise one, they sit above the panel, and at 1280×720 they
       * land squarely on the command row — the first run of this test failed on `cmd-design-all`
       * with a "3D analysis successful" notice over it. That is a real thing to look at, and it
       * is a DIFFERENT thing from the defect this test guards: a notice that covers a button for
       * three seconds is not a button outside every scroll path. Waiting for them to clear is a
       * wait on real state, and it keeps the two questions apart.
       */
      await expect.poll(() => page.locator('[class*=toast]').count(), { timeout: 60_000 }).toBe(0);

      const checked: string[] = [];
      for (const id of [...COMMANDS, 'floor-design-run',
        'batch-open', 'next-failing', 'review-changes']) {
        const el = page.getByTestId(id);
        if (await el.count() === 0) continue;
        if (await el.isDisabled()) continue;
        expect(await hitTestable(page, id),
          `${id} is enabled and a click at its own centre lands on it`).toBe(true);
        checked.push(id);
      }

      // A loop that checked nothing would pass. Name what it actually reached.
      // eslint-disable-next-line no-console
      console.log(`hit-tested at 1280×720: ${checked.join(', ')}`);
      expect(checked.length, 'at least the design commands were reachable to test')
        .toBeGreaterThan(2);
    });
});
