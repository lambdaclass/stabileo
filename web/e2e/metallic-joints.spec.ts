/**
 * Metallic joints: four sub-sections that say what they compute and what they do not.
 *
 * ── What these are for ────────────────────────────────────────────
 *
 * The panel used to be four ad-hoc blocks over a joint list that contained every joint in the
 * model — including reinforced-concrete ones, which were offered a bolt diameter and an Fexx.
 * The arithmetic was never wrong; it was being offered for joints that have no bolts in them.
 *
 * So the assertions here are about SCOPE and HONESTY, not about arithmetic: which joints are
 * offered, which are refused, what a mixed joint says about itself, and whether the five
 * confirmed gaps are on screen with enough detail to act on. `connection-design.test`-style
 * numeric checks are not here, because the module has no verified numbers to pin — that is
 * itself one of the five gaps.
 */

import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 720 } });

async function openJoints(page: Page) {
  await page.getByTestId('pr-stage-design').click();
  await page.getByTestId('pr-cmd-connections').click();
  await expect(page.getByTestId('conn-sec-joints')).toBeVisible();
}

/** Open one of the four sub-sections by its header, as a user does. */
async function openSection(page: Page, testid: string) {
  const section = page.getByTestId(testid);
  if (await section.getAttribute('open') === null) await section.locator('summary').click();
  await expect(section).toHaveAttribute('open', '');
}

/** Replace the concrete fixture with a generated steel truss. */
async function generateSteel(page: Page) {
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-generators').click();
  await page.getByTestId('gen-generate').click();
  await expect(page.getByTestId('gen-result')).toBeVisible();
}

test.describe('@smoke joint detection is scoped to metallic participation', () => {
  test('a purely concrete model offers no joints, and says why rather than showing an empty list',
    async ({ pro: page }) => {
      // A 7-storey reinforced-concrete building: every joint in it is concrete, so the
      // correct answer is none — not "here are 200 joints, pick one". The bare PRO page is
      // an EMPTY model, where "zero joints, blocked" would pass vacuously.
      await page.evaluate(async () => { await window.__stabileoActions.loadExample('pro-edificio-7p'); });
      await openJoints(page);
      await expect(page.getByTestId('conn-sec-joints')).toHaveAttribute('data-state', 'blocked');
      /*
       * Asserted on what the sentence has to SAY, not on the sentence.
       *
       * M1 wrote «no joint with any metallic member»; M2 replaced it with one that also names
       * the count — «The model has 84 joint(s), and none can be shown: no member meeting them is
       * classified as metallic». Better, and it broke a match on the old wording the moment M1
       * and M2 were merged. What matters is that the panel explains the absence by the metallic
       * classification instead of rendering an empty list, and that it does not claim the model
       * has no joints when it has 84.
       */
      const purpose = page.getByTestId('conn-sec-joints-purpose');
      await expect(purpose).toContainText(/metallic/i);
      await expect(purpose).toContainText(/none|no member|no joint/i);
      await expect(page.getByTestId('conn-joint-count')).toHaveText('0');
    });

  test('and it reports how many it removed, so a short list is never a silent one',
    async ({ pro: page }) => {
      // A concrete building, so there ARE joints to exclude. The bare fixture has an empty
      // model, and nothing hidden is nothing to report — which is correct, and not what this
      // is about.
      await page.evaluate(async () => { await window.__stabileoActions.loadExample('pro-edificio-7p'); });
      await openJoints(page);
      const note = page.getByTestId('conn-filtered-note');
      await expect(note).toBeVisible();
      await expect(note).toContainText(/only computes steel connections/i);
    });

  test('a generated steel model does offer its joints', async ({ pro: page }) => {
    await generateSteel(page);
    await openJoints(page);
    await expect(page.getByTestId('conn-sec-joints')).toHaveAttribute('data-state', 'done');
    const count = Number(await page.getByTestId('conn-joint-count').innerText());
    expect(count).toBeGreaterThan(0);
  });

  test('explains what a joint IS, because the detection is geometric and that matters',
    async ({ pro: page }) => {
      await openJoints(page);
      const what = page.getByTestId('conn-joints-what');
      await expect(what).toContainText(/two or more members/i);
      // The limitation of the detection, stated where the detection is described.
      await expect(what).toContainText(/does not read end releases/i);
    });

  test('a selected joint names the members meeting there, split by material',
    async ({ pro: page }) => {
      await generateSteel(page);
      await openJoints(page);
      await page.locator('.conn-joint-row').first().click();
      const members = page.getByTestId('conn-joint-members');
      await expect(members).toBeVisible();
      await expect(page.getByTestId('conn-members-metallic')).toContainText(/E\d+/);
      await expect(page.getByTestId('conn-members-metallic')).toContainText(/metallic/i);
    });
});

test.describe('@smoke bolts and welds are gated, explained and never certified', () => {
  test('both are blocked until a joint is picked, and say so', async ({ pro: page }) => {
    await generateSteel(page);
    await openJoints(page);
    await expect(page.getByTestId('conn-sec-bolts')).toHaveAttribute('data-state', 'blocked');
    await expect(page.getByTestId('conn-sec-welds')).toHaveAttribute('data-state', 'blocked');
    await expect(page.getByTestId('conn-sec-bolts-purpose')).toContainText(/pick a joint/i);
  });

  test('bolts declare the grades they support, and where the table comes from',
    async ({ pro: page }) => {
      await generateSteel(page);
      await openJoints(page);
      await page.locator('.conn-joint-row').first().click();
      await openSection(page, 'conn-sec-bolts');
      const grades = page.getByTestId('conn-bolt-grades');
      await expect(grades).toContainText('4.6');
      await expect(grades).toContainText('10.9');
      await expect(grades).toContainText(/J.3.2/);
    });

  test('welds explain the leg, Fexx and what the plate thickness is used for',
    async ({ pro: page }) => {
      await generateSteel(page);
      await openJoints(page);
      await page.locator('.conn-joint-row').first().click();
      await openSection(page, 'conn-sec-welds');
      const explain = page.getByTestId('conn-weld-explain');
      await expect(explain).toContainText(/0.707/);
      await expect(explain).toContainText(/Fexx/);
      // The honest limit: thickness bounds the weld size and nothing else.
      await expect(explain).toContainText(/only for the minimum and maximum/i);
    });

  test('each calculating section repeats that it is not certifiable', async ({ pro: page }) => {
    await generateSteel(page);
    await openJoints(page);
    await page.locator('.conn-joint-row').first().click();
    await openSection(page, 'conn-sec-bolts');
    await openSection(page, 'conn-sec-welds');
    for (const id of ['conn-bolts-experimental', 'conn-welds-experimental']) {
      await expect(page.getByTestId(id), id).toContainText(/not a certifiable verification/i);
    }
  });

  test('the FvExcl warning appears for the grades the table cannot serve, and only those',
    async ({ pro: page }) => {
      await generateSteel(page);
      await openJoints(page);
      await page.locator('.conn-joint-row').first().click();
      await openSection(page, 'conn-sec-bolts');
      const grade = page.locator('select.conn-sel').first();

      // 8.8 has a threads-excluded value, so the checkbox does what it says.
      await grade.selectOption('8.8');
      await expect(page.getByTestId('conn-fvexcl-warning')).toHaveCount(0);

      // 4.6 does not, and the fallback is silent — which is why it is warned about HERE,
      // beside the result, and not only in the gap list at the bottom.
      await grade.selectOption('4.6');
      const warn = page.getByTestId('conn-fvexcl-warning');
      await expect(warn).toBeVisible();
      await expect(warn).toContainText(/4.6/);
      await expect(warn).toContainText(/does not change this result/i);
    });
});

test.describe('@smoke the five gaps are on screen, with enough to act on', () => {
  const GAPS = ['baseMetal', 'boltGeometry', 'torsion', 'aluminium', 'fvExcl'] as const;

  test('all five are listed', async ({ pro: page }) => {
    await openJoints(page);
    await openSection(page, 'conn-sec-gaps');
    for (const id of GAPS) {
      await expect(page.getByTestId(`conn-gap-${id}`), id).toBeAttached();
    }
    await expect(page.getByTestId('conn-sec-gaps-badge')).toHaveText('5');
  });

  test('each answers the same four questions', async ({ pro: page }) => {
    await openJoints(page);
    await openSection(page, 'conn-sec-gaps');
    for (const id of GAPS) {
      // The three prose facets have to be sentences, not labels: "missing: geometry" would
      // satisfy a non-empty check and tell a reader nothing. `affects` is deliberately short
      // — "Yes" is the whole answer — so it is only required to be present.
      for (const facet of ['exists', 'missing', 'scope']) {
        const el = page.getByTestId(`conn-gap-${id}-${facet}`);
        await expect(el, `${id}.${facet}`).toBeAttached();
        expect((await el.innerText()).trim().length, `${id}.${facet} is a sentence`).toBeGreaterThan(30);
      }
      const affects = page.getByTestId(`conn-gap-${id}-affects`);
      await expect(affects, `${id}.affects`).toBeAttached();
      expect((await affects.innerText()).trim().length, `${id}.affects answered`).toBeGreaterThan(0);
    }
  });

  test('torsion is marked as NOT affecting the result, and the others as affecting it',
    async ({ pro: page }) => {
      // The distinction this list exists to make: a number computed and not drawn is not the
      // same thing as a limit state nothing computes.
      await openJoints(page);
      await expect(page.getByTestId('conn-gap-torsion')).toHaveAttribute('data-affects', 'false');
      await expect(page.getByTestId('conn-gap-torsion-affects')).toContainText(/no —/i);
      for (const id of ['baseMetal', 'boltGeometry', 'aluminium', 'fvExcl']) {
        await expect(page.getByTestId(`conn-gap-${id}`), id).toHaveAttribute('data-affects', 'true');
      }
    });

  test('base metal rupture says the weld can pass while the plate is the weak link',
    async ({ pro: page }) => {
      await openJoints(page);
      await expect(page.getByTestId('conn-gap-baseMetal-missing')).toContainText(/not its Fu/i);
      await expect(page.getByTestId('conn-gap-baseMetal')).toContainText(/weak link/i);
    });

  test('bolt geometry says the reported capacity is a ceiling', async ({ pro: page }) => {
    await openJoints(page);
    await expect(page.getByTestId('conn-gap-boltGeometry-exists')).toContainText(/multiplied by the declared count/i);
    await expect(page.getByTestId('conn-gap-boltGeometry-scope')).toContainText(/eccentric/i);
  });

  test('aluminium says why it is out, and that the tables would be wrong for it anyway',
    async ({ pro: page }) => {
      await openJoints(page);
      await expect(page.getByTestId('conn-gap-aluminium-missing')).toContainText(/isSteel/);
      await expect(page.getByTestId('conn-gap-aluminium')).toContainText(/would be wrong/i);
    });

  test('the list closes with the same statement the banner opens with', async ({ pro: page }) => {
    await openJoints(page);
    await expect(page.getByTestId('conn-gaps-not-certifiable'))
      .toContainText(/not a certifiable verification/i);
  });
});

test.describe('nothing here is presented as verified', () => {
  test('no sub-section ever reads VERIFIED, approved, certified or ready to build',
    async ({ pro: page }) => {
      await generateSteel(page);
      await openJoints(page);
      await page.locator('.conn-joint-row').first().click();
      await openSection(page, 'conn-sec-bolts');
      await openSection(page, 'conn-sec-welds');
      await openSection(page, 'conn-sec-gaps');
      const text = await page.locator('.conn-tab').innerText();
      expect(text).not.toMatch(/\bVERIFIED\b/);
      expect(text).not.toMatch(/\bapproved\b/i);
      expect(text).not.toMatch(/\bcertified\b/i);
      expect(text).not.toMatch(/ready to build/i);
    });

  test('the section states are carried by a word, not only by a colour', async ({ pro: page }) => {
    // `StageSection` prints a glyph AND a word. A state legible only as a hue is not legible.
    await openJoints(page);
    await expect(page.getByTestId('conn-sec-joints-state')).not.toHaveText('');
    await expect(page.getByTestId('conn-sec-gaps-state')).not.toHaveText('');
  });
});

for (const [locale, words] of [
  ['es', { joints: /detecci.n de nudos/i, gaps: /limitaciones/i, notCert: /no constituye verificaci.n certificable/i }],
  ['pt', { joints: /detec..o de n.s/i, gaps: /limita..es/i, notCert: /n.o constitui verifica..o certific.vel/i }],
] as const) {
  test.describe(`the four sub-sections keep their meaning in ${locale}`, () => {
    test.use({ appLocale: locale, viewport: { width: 1280, height: 720 } });

    test('titles and the not-certifiable statement are translated', async ({ pro: page }) => {
      await openJoints(page);
      await expect(page.getByTestId('conn-sec-joints')).toContainText(words.joints);
      await expect(page.getByTestId('conn-sec-gaps')).toContainText(words.gaps);
      await expect(page.getByTestId('conn-gaps-not-certifiable')).toContainText(words.notCert);
    });

    test('the five gaps are translated too, not left in English', async ({ pro: page }) => {
      await openJoints(page);
      for (const id of ['baseMetal', 'boltGeometry', 'torsion', 'aluminium', 'fvExcl']) {
        const el = page.getByTestId(`conn-gap-${id}-exists`);
        await expect(el, id).toBeAttached();
        // The English strings all begin "The " or "One " — a cheap, specific tripwire for a
        // key that fell back rather than being translated.
        expect((await el.innerText()).trim(), id).not.toMatch(/^(The|One) /);
      }
    });
  });
}
