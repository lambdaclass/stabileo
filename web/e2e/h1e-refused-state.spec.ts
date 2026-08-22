/**
 * A member the design REFUSES, produced rather than fabricated.
 *
 * ── Why a fixture had to be built at all ───────────────────────────
 *
 * None of the three RC examples reaches `REFUSED`. Measured: `rc-design-qa-8` designs to
 * `VERIFIED` ×8, `rc-qa-diagnostic` to `VERIFIED` ×22 + `PROVISIONAL_BIAXIAL` ×8, and
 * `pro-edificio-7p` to `VERIFIED` ×198 + `PROVISIONAL_BIAXIAL` ×10. So the state, its filter and
 * the unreinforced block had never been exercised in a browser.
 *
 * ── How this one is made, and what it is NOT ───────────────────────
 *
 * `__stabileoActions.updateSection` shrinks ONE section — `RC Col 400×400`, section id 2, down to
 * 90 × 120 mm — and the design runs again. What follows is the real engine's verdict:
 * `SEARCH_EXHAUSTED` ×8, alongside `VERIFIED` ×4 on the members that use other sections.
 *
 * This fixture is what found that `REFUSED` was unreachable: `FAILED` was tested first and a
 * refused member also fails verification, so the rail said `failed 5 · refused 0` while the
 * design table said `SEARCH_EXHAUSTED` ×8. The classifier now lets an outcome that already
 * explains its own failure through, and these assert the corrected behaviour.
 *
 * Nothing writes a state. The engine enumerates the whole code-permitted reinforcement envelope
 * for a column that cannot carry its demand, finds nothing that verifies, and says so — which is
 * exactly what `candidate-search.ts` documents as the honest distinction between "exhausted" and
 * "infeasible".
 *
 * Section 2 and not section 1: id 1 is unused by the designed members, and shrinking it changes
 * nothing. Found by walking the ids, and worth recording so the next person does not repeat it.
 * 90 × 120 mm and not 50 × 60: the whole-model shrink took the design past a ten-minute budget,
 * because the search enumerates a far larger envelope when nothing fits at all.
 */

import { test, expect, designAll, loadModel, openDocumentsStage } from './fixtures';
import type { Page } from '@playwright/test';

type Hooks = {
  __stabileo: { detailingAssemblies(): unknown[]; rebarSceneBuilds(): number };
  __stabileoActions: { updateSection(id: number, data: unknown): void };
};

/** The section the columns use, too small for their demand. */
const STARVED = { b: 0.09, h: 0.12 };

async function withRefusedMembers(page: Page) {
  await loadModel(page, 'rc-design-qa-8');
  await designAll(page);
  await page.evaluate((d) => {
    (window as unknown as Hooks).__stabileoActions.updateSection(2, d);
  }, STARVED);
  await designAll(page);
  await page.getByTestId('pr-stage-design').click();
  await page.getByTestId('pr-cmd-design').click();
}

const outcomes = (page: Page) => page.evaluate(() => {
  const m: Record<string, number> = {};
  for (const el of document.querySelectorAll('[data-outcome]')) {
    const o = el.getAttribute('data-outcome') || '(none)';
    m[o] = (m[o] ?? 0) + 1;
  }
  return m;
});

test.describe('@slow the design refuses, and the app says so', () => {
  test.slow();
  test.use({ viewport: { width: 1280, height: 720 } });

  test('the engine reaches SEARCH_EXHAUSTED on its own', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await designAll(page);
    await page.getByTestId('pr-stage-design').click();
    await page.getByTestId('pr-cmd-design').click();
    const before = await outcomes(page);
    expect(before.VERIFIED, 'the untouched fixture verifies everything').toBeGreaterThan(0);
    expect(before.SEARCH_EXHAUSTED ?? 0, 'and refuses nothing').toBe(0);

    await page.evaluate((d) => {
      (window as unknown as Hooks).__stabileoActions.updateSection(2, d);
    }, STARVED);
    await designAll(page);
    await page.getByTestId('pr-stage-design').click();
    await page.getByTestId('pr-cmd-design').click();

    const after = await outcomes(page);
    expect(after.SEARCH_EXHAUSTED ?? 0, 'a starved column is refused').toBeGreaterThan(0);
    // Both halves: the refusal is real AND it is not total. A run that refused everything would
    // be a broken model, not a refused member.
    expect(after.VERIFIED ?? 0, 'the members on other sections still verify').toBeGreaterThan(0);
  });

  test('the rail says REFUSED, and gives the remedy the refusal calls for',
    async ({ pro: page }) => {
      await withRefusedMembers(page);
      await page.getByTestId('detailing-disclosure').locator('> summary').click();
      const generate = page.getByTestId('cmd-generate-detailing');
      await expect(generate).toBeEnabled();
      await generate.click();
      await expect
        .poll(() => page.evaluate(() =>
          (window as unknown as Hooks).__stabileo.detailingAssemblies().length),
          { timeout: 120_000 })
        .toBeGreaterThan(0);
      await openDocumentsStage(page);
      const builds = await page.evaluate(() =>
        (window as unknown as Hooks).__stabileo.rebarSceneBuilds());
      await page.getByTestId('doc-3d').click();
      await expect(page.getByTestId('rebar-workspace')).toBeVisible();
      await expect
        .poll(() => page.evaluate(() =>
          (window as unknown as Hooks).__stabileo.rebarSceneBuilds()), { timeout: 240_000 })
        .toBeGreaterThan(builds);

      /**
       * What this fixture was built to reach, and could not until the classifier was corrected.
       *
       * `FAILED` used to preempt every refusal, because a refused member also fails verification.
       * It now preempts only when the outcome does not already name the reason. The two states
       * mean different remedies — change the section, versus change the reinforcement — so the
       * rail was sending the reader to a fix that could not work.
       */
      const refused = page.locator('.st-refused');
      expect(await refused.count(), 'the refusal is reported as one').toBeGreaterThan(0);

      const row = refused.first();
      const text = (await row.locator('.st, .label').first().innerText()).trim();
      expect(text.length, 'the state is a word, not only a colour').toBeGreaterThan(1);
      expect(text.toLowerCase(), 'and it does not claim success')
        .not.toMatch(/verified|verificado|modelled|modelado/);

      /*
       * The glyph, by value against the scene: `unreinforced: 0xd4762a`. A refused member carries
       * no steel, so this is the colour the viewport paints its concrete with, and the rail must
       * agree — the mirror `shared-status-tokens.test.ts` asserts in both directions, here on a
       * member that actually has the state.
       */
      const painted = await row.locator('.dot').first()
        .evaluate((el) => getComputedStyle(el).backgroundColor);
      const scene = await page.evaluate(() => {
        const el = document.createElement('span');
        el.style.color = '#d4762a'; document.body.appendChild(el);
        const out = getComputedStyle(el).color; el.remove(); return out;
      });
      expect(painted, 'the refused dot is the unreinforced orange, not the conflicted red')
        .toBe(scene);
    });

  test('the member loses its steel, and the unreinforced block names it',
    async ({ pro: page }) => {
      await withRefusedMembers(page);
      await page.getByTestId('detailing-disclosure').locator('> summary').click();
      const generate = page.getByTestId('cmd-generate-detailing');
      await expect(generate).toBeEnabled();
      await generate.click();
      await expect
        .poll(() => page.evaluate(() =>
          (window as unknown as Hooks).__stabileo.detailingAssemblies().length),
          { timeout: 120_000 })
        .toBeGreaterThan(0);
      await openDocumentsStage(page);
      const builds = await page.evaluate(() =>
        (window as unknown as Hooks).__stabileo.rebarSceneBuilds());
      await page.getByTestId('doc-3d').click();
      await expect(page.getByTestId('rebar-workspace')).toBeVisible();
      await expect
        .poll(() => page.evaluate(() =>
          (window as unknown as Hooks).__stabileo.rebarSceneBuilds()), { timeout: 240_000 })
        .toBeGreaterThan(builds);

      /*
       * The measurable consequence of a refusal, and the one that matters on screen: the columns
       * keep their concrete and lose their steel. Census before the shrink was 200 column bars;
       * after it is 0, with the four solids still drawn.
       */
      const c = await page.evaluate(() => (window as unknown as {
        __stabileo: { rebarSceneCensus(): { bars: Record<string, number>;
          solids: Record<string, number> } };
      }).__stabileo.rebarSceneCensus());
      expect(c.bars.column, 'a refused column carries no steel').toBe(0);
      expect(c.solids.column, 'and still shows its concrete').toBeGreaterThan(0);

      /*
       * `RebarScenePanel`'s `.unreinforced` block. H1-D asserted it ABSENT with the premise
       * `refused === 0`; this is the other side of that assertion, and the reason it was written
       * as a premise rather than an annotation. It lives in the WORKSPACE — checking for it in
       * the design panel, as a first version did, finds nothing and proves nothing.
       */
      const block = page.locator('.unreinforced');
      expect(await block.count(), 'the block that names them').toBeGreaterThan(0);
      expect((await block.first().innerText()).trim().length,
        'and it explains rather than listing ids').toBeGreaterThan(20);
    });
});

test.describe('@slow a refusal is never dressed as a result', () => {
  test.slow();
  test.use({ viewport: { width: 1280, height: 720 } });

  test('the refused member carries no certificate and no verified badge',
    async ({ pro: page }) => {
      await withRefusedMembers(page);
      /*
       * The standing rule of this branch, on the state most tempting to soften: a member the
       * design could not solve must not appear anywhere as checked. Read on the ROW that carries
       * the refusal, not on the panel — other members on other sections verify correctly and
       * their badges are true.
       */
      const row = page.locator('[data-outcome="SEARCH_EXHAUSTED"]').first();
      await expect(row).toBeVisible();
      const text = (await row.innerText()).toLowerCase();
      for (const claim of ['verified', 'verificado', 'certified', 'certificado']) {
        expect(text, `a refused member must not read "${claim}"`).not.toContain(claim);
      }
    });

  test('and the counts separate it from a failure and from a verified member',
    async ({ pro: page }) => {
      await withRefusedMembers(page);
      const after = await outcomes(page);
      /*
       * REFUSED and FAILED are different things — "the design ran and could not find a passing
       * arrangement" against "the verification ran and the member does not pass" — and both are
       * different from VERIFIED. A census that merged any two would hide which question to ask
       * next: change the section, or change the reinforcement.
       */
      expect(Object.keys(after).length, 'more than one outcome on screen')
        .toBeGreaterThan(1);
      expect(after.SEARCH_EXHAUSTED ?? 0).toBeGreaterThan(0);
      expect(after.VERIFIED ?? 0).toBeGreaterThan(0);
      test.info().annotations.push(
        { type: 'coverage', description: `outcomes: ${JSON.stringify(after)}` });
    });
});
