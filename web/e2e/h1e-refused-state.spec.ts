/**
 * A member the design REFUSES, produced rather than fabricated.
 *
 * ── Why a fixture had to be built at all ───────────────────────────
 *
 * None of the three RC examples reached `REFUSED` when this was written. Measured then:
 * `rc-design-qa-8` designed to `VERIFIED` ×8, `rc-qa-diagnostic` to `VERIFIED` ×22 +
 * `PROVISIONAL_BIAXIAL` ×8, and `pro-edificio-7p` to `VERIFIED` ×198 + `PROVISIONAL_BIAXIAL` ×10.
 * So the state, its filter and the unreinforced block had never been exercised in a browser.
 * Since the design reads the anchorage and the members' role in the lateral system, all three
 * refuse members of their own (`h1e-conflict-states.spec.ts`); this fixture is still the one
 * whose refusal is a starved section, with the remedy that goes with it.
 *
 * ── How this one is made, and what it is NOT ───────────────────────
 *
 * `__stabileoActions.updateSection` shrinks ONE section — `RC Beam 300×550`, section id 3, down
 * to 90 × 120 mm — and the design runs again. What follows is the real engine's verdict:
 * `SECTION_INADEQUATE` on the four beams, alongside `VERIFIED` on the four columns, which use
 * another section.
 *
 * It starved the COLUMNS (section 2) until the design read the bars' anchorage in them
 * (3980d8402): a beam framing into a 9 cm column cannot anchor its bars there, so starving the
 * columns now refuses the beams too and leaves nothing verified (before: SEARCH_EXHAUSTED on the
 * columns, VERIFIED on the beams; after: SECTION_INADEQUATE ×4 and SEARCH_EXHAUSTED ×4, VERIFIED
 * 0, and no member to detail). Starving the beams keeps both halves this spec needs: a refusal
 * the engine reaches on its own, beside members that verify. And the beams read
 * SECTION_INADEQUATE, not SEARCH_EXHAUSTED, since an exhausted search is no longer called
 * inadequate without a proof (292b87f68): a 9 × 12 cm beam carries a proof, a code bound no
 * reinforcement lifts.
 *
 * The beams declare that they are NOT part of the lateral-force-resisting system, through the
 * design data panel, before anything is designed. Undeclared, they are designed as part of it
 * (292b87f68) and two of the untouched fixture's beams, e5 and e6, refuse on the anchorage of
 * their bottom bars, fy developed at the column face. Two things break with that: the premise
 * that the untouched fixture refuses nothing, and the second design run, which designs only the
 * members with no bars when there are any, so it would retry e5 and e6 and leave the starved
 * beams e7 and e8 with their old bars, checked but not designed. Declared, the untouched fixture
 * verifies all eight, every member carries bars, and the second run designs all of them.
 *
 * Nothing writes a state. The engine enumerates the whole code-permitted reinforcement envelope
 * for a member that cannot carry its demand, finds nothing that verifies, and proves why.
 *
 * Section 3 is the beams' (1 is unused by the designed members, 2 the columns'). 90 × 120 mm and
 * not 50 × 60: the whole-model shrink took the design past a ten-minute budget, because the
 * search enumerates a far larger envelope when nothing fits at all.
 */

import { test, expect, designAll, loadModel, openDocumentsStage, designPlace } from './fixtures';
import type { Page } from '@playwright/test';

type Hooks = {
  __stabileo: { detailingAssemblies(): unknown[]; rebarSceneBuilds(): number };
  __stabileoActions: { updateSection(id: number, data: unknown): void };
};

/** The section the beams use (id 3), too small for their demand. */
const STARVED_SECTION = 3;
const STARVED = { b: 0.09, h: 0.12 };
/** The outcome a starved beam reaches: refused, with the code bound that proves it. */
const REFUSAL = 'SECTION_INADEQUATE';

/** The beams declared not part of the lateral-force-resisting system, through the design data. */
async function beamsNotLateral(page: Page) {
  await designPlace(page, 'designData');
  await page.getByTestId('design-data-lateral-beams').selectOption('gravity');
}

async function withRefusedMembers(page: Page) {
  await loadModel(page, 'rc-design-qa-8');
  await beamsNotLateral(page);
  await designAll(page);
  await page.evaluate(([id, d]) => {
    (window as unknown as Hooks).__stabileoActions.updateSection(id as number, d);
  }, [STARVED_SECTION, STARVED] as const);
  await designAll(page);
  await designPlace(page, 'list');
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

  test('the engine refuses on its own', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await beamsNotLateral(page);
    await designAll(page);
    await designPlace(page, 'list');
    const before = await outcomes(page);
    expect(before.VERIFIED, 'the untouched fixture verifies everything').toBeGreaterThan(0);
    expect((before.SEARCH_EXHAUSTED ?? 0) + (before.SECTION_INADEQUATE ?? 0), 'and refuses nothing').toBe(0);

    await page.evaluate(([id, d]) => {
      (window as unknown as Hooks).__stabileoActions.updateSection(id as number, d);
    }, [STARVED_SECTION, STARVED] as const);
    await designAll(page);
    await designPlace(page, 'list');

    const after = await outcomes(page);
    expect(after[REFUSAL] ?? 0, 'a starved beam is refused').toBeGreaterThan(0);
    // Both halves: the refusal is real AND it is not total. A run that refused everything would
    // be a broken model, not a refused member.
    expect(after.VERIFIED ?? 0, 'the members on other sections still verify').toBeGreaterThan(0);
  });

  test('the rail says REFUSED, and gives the remedy the refusal calls for',
    async ({ pro: page }) => {
      await withRefusedMembers(page);
      await designPlace(page, 'detailing');
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
      await designPlace(page, 'detailing');
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
       * The measurable consequence of a refusal, and the one that matters on screen: the refused
       * members keep their concrete and lose their steel. The starved members are the beams now
       * (see the header: starved columns refuse the beams framing into them too): 0 beam bars,
       * with their four solids still drawn.
       */
      const c = await page.evaluate(() => (window as unknown as {
        __stabileo: { rebarSceneCensus(): { bars: Record<string, number>;
          solids: Record<string, number> } };
      }).__stabileo.rebarSceneCensus());
      expect(c.bars.beam, 'a refused beam carries no steel').toBe(0);
      expect(c.solids.beam, 'and still shows its concrete').toBeGreaterThan(0);

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
      const row = page.locator(`[data-outcome="${REFUSAL}"]`).first();
      await expect(row).toBeVisible();
      const text = (await row.innerText()).toLowerCase();
      for (const claim of ['verified', 'verificado', 'certified', 'certificado']) {
        expect(text, `a refused member must not read "${claim}"`).not.toContain(claim);
      }
    });

  test('the drawing is offered, and is not offered as construction documentation',
    async ({ pro: page }) => {
      await withRefusedMembers(page);
      await designPlace(page, 'detailing');

      /*
       * The two halves of the rule, on the one fixture in the suite that reaches the state it
       * is about. Four beams are SECTION_INADEQUATE and four columns verify, so `runDetailing`
       * draws four members of the eight-member frame.
       *
       * The command stays ENABLED — that is not an oversight, it is the point. Detailing a
       * partly designed frame is how the effect of the refused members on the rest of the cage
       * becomes visible, and disabling the button would take away the tool used to converge the
       * design rather than converge it. The assertion above at line 96 already relies on this.
       *
       * What is withheld is the claim. The strip says so before the run, and
       * `selectedScopeDetailed` — the sixteenth constructibility condition — withholds it in the
       * gate afterwards, which is what stops the document reaching ISSUED. The refused beams ARE
       * in the scope here: the default selection is the frame pair, so the refusal is inside
       * what this run claims to cover, which is precisely when it must block.
       */
      await expect(page.getByTestId('cmd-generate-detailing')).toBeEnabled();

      const notice = page.getByTestId('detailing-convergence');
      await expect(notice).toBeVisible();
      await expect(notice).toHaveAttribute('data-state', 'incomplete');
      await expect(notice).toContainText('Not construction documentation');

      // And the shortfall names the members and their remedy. "Change the section" is the only
      // move that helps a refused column, and it is the one a bare count would not suggest.
      const gaps = page.getByTestId('detailing-convergence-gaps');
      await expect(gaps).toBeVisible();
      await expect(gaps).toContainText('change the section');
      expect((await gaps.innerText()).match(/\d+/), 'the gap counts its members').not.toBeNull();
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
      expect(after[REFUSAL] ?? 0).toBeGreaterThan(0);
      expect(after.VERIFIED ?? 0).toBeGreaterThan(0);
      test.info().annotations.push(
        { type: 'coverage', description: `outcomes: ${JSON.stringify(after)}` });
    });
});
