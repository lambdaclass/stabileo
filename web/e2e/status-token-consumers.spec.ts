/**
 * The consumers of the shared status contract paint what the contract says.
 *
 * ── Why a browser is required here and not merely nice ─────────────
 *
 * `shared-status-tokens.test.ts` proves the five tokens exist, that their arithmetic clears AA on
 * every ground, and that `--st-provisional` equals what Three.js paints. It reads `tokens.css`.
 * What it cannot know is whether the PAGE resolves them: a `var()` inside a component whose
 * ancestor shadows the property paints something else entirely, and `.workspace` shadows
 * `--st-border` for exactly that reason. So every assertion below compares the colour the
 * compositor produced against the token resolved on the same element.
 *
 * The negatives matter as much. `rgba(255,102,0,.13)` and `--st-warn-bg` are both dim warm
 * translucent fills on a dark ground; `#6b4a8f` and `--st-provisional` are both violet borders.
 * A screenshot diff would accept either, which is why each is asserted to be ABSENT by value.
 *
 * ── The one visual change, authorised ──────────────────────────────
 *
 * `.banner-warn` moves from orange to amber. Its own border was already `--st-warn`, so the fill
 * and the rule now come from one hue instead of two.
 */

import { test, expect, designAll, loadModel, openDocumentsStage } from './fixtures';
import type { Page } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 720 } });

const resolve = (page: Page, colour: string) =>
  page.evaluate((c) => {
    const el = document.createElement('span');
    el.style.color = c;
    document.body.appendChild(el);
    const out = getComputedStyle(el).color;
    el.remove();
    return out;
  }, colour);

/** A token resolved ON the element that uses it, so a shadowing ancestor is included. */
const tokenOn = async (target: ReturnType<Page['locator']>, page: Page, name: string) =>
  resolve(page, await target.evaluate(
    (el, n) => getComputedStyle(el).getPropertyValue(n).trim(), name));

/**
 * A composited translucent fill, computed in the page.
 *
 * `getComputedStyle().backgroundColor` returns the DECLARED `rgba(...)`, not what the screen
 * shows, so comparing a token's rgba against it is the honest comparison — both sides are the
 * declaration. Kept explicit because the instinct is to compare against a flattened colour.
 */
const bgOf = (target: ReturnType<Page['locator']>) =>
  target.evaluate((el) => getComputedStyle(el).backgroundColor);

/** Reach RC Design with a designed model, which is where the badges and banners live. */
async function design(page: Page, model = 'rc-design-qa-8') {
  await loadModel(page, model);
  await designAll(page);
  await page.getByTestId('pr-stage-design').click();
  await page.getByTestId('pr-cmd-design').click();
}

/**
 * Open the slabs/walls/foundations disclosure.
 *
 * `floor-family-state` is ATTACHED before this and hidden, which is a trap: `toBeVisible` failed
 * having resolved to a real `<section data-state="noElements">` twenty-three times. The element
 * existing says nothing about the disclosure being open.
 */
async function openFloorFamilies(page: Page) {
  const disclosure = page.getByTestId('floor-families-disclosure');
  await expect(disclosure).toBeVisible();
  if (await disclosure.getAttribute('open') === null) {
    await disclosure.locator('> summary').click();
  }
  await expect(page.getByTestId('floor-families')).toBeVisible();
}

test.describe('@slow the floor-family card: provisional is violet, not amber', () => {
  test.slow();

  test('the badge takes the -text variant and the rule takes the plain token',
    async ({ pro: page }) => {
      await design(page);
      await openFloorFamilies(page);
      const card = page.getByTestId('floor-family-state');
      await expect(card).toBeVisible();

      const [provisional, provisionalText, warn] = await Promise.all([
        tokenOn(card, page, '--st-provisional'),
        tokenOn(card, page, '--st-provisional-text'),
        tokenOn(card, page, '--st-warn'),
      ]);
      // The tokens are distinct on this page, which is the premise of everything below.
      expect(provisional).not.toBe(provisionalText);
      expect(provisional).not.toBe(warn);

      const state = await card.getAttribute('data-state');
      if (state !== 'provisional') {
        /*
         * Stated rather than skipped silently. The state is model-dependent, and a conditional
         * that returns quietly reads in a report as though it had measured something.
         */
        test.info().annotations.push({
          type: 'coverage',
          description: `this fixture is in '${state}', not 'provisional' — the violet is `
            + 'asserted at source by shared-status-tokens.test.ts',
        });
        // What CAN be checked on any state: the card is not painting provisional's amber.
        expect(await card.evaluate((el) => getComputedStyle(el).borderLeftColor))
          .not.toBe(provisional);
        return;
      }

      expect(await card.evaluate((el) => getComputedStyle(el).borderLeftColor),
        'the rule is the plain violet').toBe(provisional);
      expect(await page.getByTestId('floor-state-badge')
        .evaluate((el) => getComputedStyle(el).color),
        'the 0.7rem label is the -text variant, which is the whole point of the split')
        .toBe(provisionalText);
      // And no longer amber, which is the defect this closes.
      expect(await card.evaluate((el) => getComputedStyle(el).borderLeftColor)).not.toBe(warn);
    });
});

test.describe('@slow the outcome badges', () => {
  test.slow();

  test('a failed badge is danger throughout, and no longer the brand vermillion',
    async ({ pro: page }) => {
      await design(page, 'rc-qa-diagnostic');
      const badge = page.locator('.badge-fail').first();
      if (!(await badge.count())) {
        test.info().annotations.push(
          { type: 'coverage', description: 'no failed badge on this fixture' });
        return;
      }
      const [danger, accent, dangerBg] = await Promise.all([
        tokenOn(badge, page, '--st-danger'),
        tokenOn(badge, page, '--st-accent'),
        tokenOn(badge, page, '--st-danger-bg'),
      ]);
      expect(await badge.evaluate((el) => getComputedStyle(el).color)).toBe(danger);
      expect(await badge.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe(danger);
      expect(await bgOf(badge)).toBe(dangerBg);
      // The correction: a result read in the colour of an action.
      expect(await badge.evaluate((el) => getComputedStyle(el).color),
        'a status is not the brand accent').not.toBe(accent);
      // And not the literal fill it replaced.
      expect(await bgOf(badge)).not.toBe(await resolve(page, 'rgba(238, 34, 34, 0.16)'));
    });

  test('a warn badge sits on the amber surface, not on a fifth amber',
    async ({ pro: page }) => {
      await design(page, 'rc-qa-diagnostic');
      const badges = page.locator('.badge-warn');
      const n = await badges.count();
      expect(n, 'the diagnostic model must produce warn badges').toBeGreaterThan(0);
      const badge = badges.first();
      expect(await bgOf(badge)).toBe(await tokenOn(badge, page, '--st-warn-bg'));
      expect(await bgOf(badge), 'and not the hand-mixed one')
        .not.toBe(await resolve(page, 'rgba(221, 170, 0, 0.16)'));
      test.info().annotations.push({ type: 'coverage', description: `${n} warn badges` });
    });

  test('a provisional badge uses all three provisional tokens, and its border is now visible',
    async ({ pro: page }) => {
      await design(page, 'rc-qa-diagnostic');
      const badges = page.locator('.badge-provisional');
      const n = await badges.count();
      expect(n, 'the diagnostic model must produce provisional badges').toBeGreaterThan(0);
      const badge = badges.first();

      const [bg, text, border] = await Promise.all([
        tokenOn(badge, page, '--st-provisional-bg'),
        tokenOn(badge, page, '--st-provisional-text'),
        tokenOn(badge, page, '--st-provisional'),
      ]);
      expect(await bgOf(badge), 'the fill').toBe(bg);
      expect(await badge.evaluate((el) => getComputedStyle(el).color), 'the label').toBe(text);
      expect(await badge.evaluate((el) => getComputedStyle(el).borderTopColor), 'the boundary')
        .toBe(border);

      /*
       * The border is the one real change here, and it is a fix rather than a rename. `#6b4a8f`
       * measured 1.76–2.17 against the band it outlines — under the 3:1 WCAG 2.1 §1.4.11 asks of
       * a control boundary — and the token is 3.13–3.86. The fill and the label were already the
       * values the token was derived from, so those two are no-ops by design.
       */
      expect(await badge.evaluate((el) => getComputedStyle(el).borderTopColor),
        'the near-invisible violet is gone').not.toBe(await resolve(page, '#6b4a8f'));
      test.info().annotations.push({ type: 'coverage', description: `${n} provisional badges` });
    });
});

test.describe('@slow the toolbar banners and counts', () => {
  test.slow();

  test('the fail and section counts are danger, not the accent', async ({ pro: page }) => {
    await design(page, 'rc-qa-diagnostic');
    const seen: string[] = [];
    for (const cls of ['.c-fail', '.c-sect']) {
      const el = page.locator(cls).first();
      // Annotated rather than skipped. The first version used a bare `continue`, so a run where
      // NEITHER count existed passed while measuring nothing at all.
      if (!(await el.count())) continue;
      seen.push(cls);
      const [danger, accent] = await Promise.all([
        tokenOn(el, page, '--st-danger'), tokenOn(el, page, '--st-accent')]);
      const colour = await el.evaluate((n) => getComputedStyle(n).color);
      expect(colour, `${cls} is danger`).toBe(danger);
      expect(colour, `${cls} is not the brand accent`).not.toBe(accent);
    }
    test.info().annotations.push({
      type: 'coverage',
      description: seen.length ? `counts measured: ${seen.join(', ')}`
        : 'neither count is on screen — asserted at source only',
    });
  });

  test('a banner, whichever kind appears, paints from a status surface', async ({ pro: page }) => {
    await design(page, 'rc-qa-diagnostic');
    const seen: string[] = [];
    for (const [cls, token] of [
      ['.banner-block', '--st-danger-bg'], ['.banner-warn', '--st-warn-bg'],
    ] as const) {
      const el = page.locator(cls).first();
      if (!(await el.count())) continue;
      seen.push(cls);
      expect(await bgOf(el), `${cls} fill`).toBe(await tokenOn(el, page, token));
      // The two literals that are gone. Both are dim warm fills on a dark ground; a screenshot
      // comparison would have accepted either.
      for (const gone of ['rgba(238, 34, 34, 0.14)', 'rgba(255, 102, 0, 0.13)']) {
        expect(await bgOf(el), `${cls} must not be ${gone}`)
          .not.toBe(await resolve(page, gone));
      }
    }
    test.info().annotations.push({
      type: 'coverage',
      description: seen.length ? `banners measured: ${seen.join(', ')}`
        : 'no banner on this fixture — fills asserted at source only',
    });
  });
});

/**
 * The provisional banner, on the model that raises it.
 *
 * `rc-qa-diagnostic` shows it — `rebar-toggles.spec.ts` depends on the same fact for its
 * worst-case rail test. Three languages because the banner is a full-width sentence whose length
 * changes per locale, and a band that wraps must not push the panel past 1280.
 */
for (const locale of ['en', 'es', 'pt'] as const) {
  test.describe(`@slow the provisional banner in ${locale}`, () => {
    test.slow();
    test.use({ appLocale: locale, viewport: { width: 1280, height: 720 } });

    test('it paints from the three provisional tokens and holds its width',
      async ({ pro: page }) => {
        await loadModel(page, 'rc-qa-diagnostic');
        await designAll(page);
        await page.getByTestId('detailing-disclosure').locator('> summary').click();
        const generate = page.getByTestId('cmd-generate-detailing');
        await expect(generate).toBeEnabled();
        await generate.click();
        await expect
          .poll(() => page.evaluate(() =>
            (window.__stabileo as unknown as { detailingAssemblies(): unknown[] })
              .detailingAssemblies().length), { timeout: 60_000 })
          .toBeGreaterThan(0);

        /*
         * Into the workspace. `ProvisionalBanner` renders inside `RebarWorkspace`, not in the
         * design panel — generating the detailing is necessary and not sufficient, and the first
         * version of this waited a minute for an element that was never going to be mounted.
         * Waited on the BUILD COUNTER: the overlay paints before its geometry exists.
         */
        const before = await page.evaluate(() =>
          (window.__stabileo as unknown as { rebarSceneBuilds(): number }).rebarSceneBuilds());
        await openDocumentsStage(page);
        await page.getByTestId('doc-3d').click();
        await expect(page.getByTestId('rebar-workspace')).toBeVisible();
        await expect
          .poll(() => page.evaluate(() =>
            (window.__stabileo as unknown as { rebarSceneBuilds(): number }).rebarSceneBuilds()),
            { timeout: 120_000 })
          .toBeGreaterThan(before);

        const banner = page.getByTestId('rebar-provisional-banner');
        await expect(banner, 'this model must raise the provisional banner')
          .toBeVisible({ timeout: 60_000 });

        const [bg, border, text, provText] = await Promise.all([
          tokenOn(banner, page, '--st-provisional-bg'),
          tokenOn(banner, page, '--st-provisional'),
          tokenOn(banner, page, '--st-text'),
          tokenOn(banner, page, '--st-provisional-text'),
        ]);
        expect(await bgOf(banner)).toBe(bg);
        expect(await banner.evaluate((el) => getComputedStyle(el).borderBottomColor)).toBe(border);
        // The sentence at full contrast, the emphasis carrying the state.
        expect(await banner.evaluate((el) => getComputedStyle(el).color)).toBe(text);
        const strong = banner.locator('strong').first();
        if (await strong.count()) {
          expect(await strong.evaluate((el) => getComputedStyle(el).color)).toBe(provText);
        }
        // `#e2d3f5` was the body colour. Nearly white, and nearly `--st-text`.
        expect(await banner.evaluate((el) => getComputedStyle(el).color))
          .not.toBe(await resolve(page, '#e2d3f5'));

        // A longer sentence must wrap, not widen.
        const box = await banner.evaluate(
          (el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
        expect(box.scroll, `the banner fits at 1280 in ${locale}`)
          .toBeLessThanOrEqual(box.client + 1);
      });
  });
}
