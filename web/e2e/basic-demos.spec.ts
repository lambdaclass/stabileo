/**
 * The guided walkthroughs, driven the way a reader drives them.
 *
 * ── Why this file exists ───────────────────────────────────────────
 *
 * The previous version of `/demo` broke silently. It pointed at eight anchors,
 * six of which stopped existing when the ribbon replaced the left toolbar, and
 * nothing said so — no test covered it, and a tour that spotlights an absent
 * element simply darkens the screen and carries on. It stayed broken for
 * however long it took a person to notice.
 *
 * So the checks here are the ones that catch that class of failure:
 *
 *   * every walkthrough in the menu can be STARTED and its first card appears;
 *   * every step's target exists while that step is showing;
 *   * a step that waits on the reader ADVANCES when the reader does the thing
 *     — which is where two of the three bugs found by hand actually lived;
 *   * nothing is left armed or half-built when a walkthrough ends.
 *
 * ── On `waitFor` ───────────────────────────────────────────────────
 *
 * Both hangs found during development were the same mistake in different
 * clothes: a condition that reads something the app cannot wake it for — the
 * size of a Map, the presence of a DOM node. The tests below that place nodes
 * and click a member are the ones that would catch it happening again, and
 * they are the reason this file drives the canvas rather than pressing Next.
 */

import { test, expect } from './fixtures';

type Page = import('@playwright/test').Page;

/** Every walkthrough the menu offers, and how many steps each should have. */
const DEMOS = [
  { id: 'basics-2d', steps: 7 },
  { id: 'basics-3d', steps: 6 },
  { id: 'modelling-2d', steps: 9 },
  { id: 'navigation', steps: 9 },
  { id: 'results', steps: 10 },
  { id: 'settings', steps: 7 },
  { id: 'kinematics', steps: 7 },
  { id: 'section-analysis', steps: 8 },
];

async function openBasic(page: Page) {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 60_000 });
  await expect
    .poll(() => page.evaluate(() => window.__stabileo.solverReady()), { timeout: 60_000 })
    .toBe(true);
}

/** Open Project → Tutorials and start one. */
async function startDemo(page: Page, id: string) {
  await page.getByTestId('hdr-project').click();
  await page.getByTestId('demo-menu-toggle').click();
  await page.getByTestId(`demo-${id}`).click();
  await expect(page.locator('.tour-card')).toBeVisible();
}

const stepId = (page: Page) => page.evaluate(() => window.__stabileo.tourStep()?.id ?? null);
const nextButton = (page: Page) =>
  page.locator('.tour-card button').filter({ hasText: /Siguiente|Next|→/ }).first();

/**
 * Press Next until the step actually changes.
 *
 * A step whose `onEnter` opens a panel moves the card while it is being
 * clicked — the card is positioned against its target, and the target's
 * geometry changes as the panel unfolds. One press can land where the button
 * was rather than where it is. Pressing again is what a reader does and is
 * cheaper than a sleep long enough to cover the animation on every run.
 */
async function advance(page: Page, want: string) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await nextButton(page).click({ timeout: 5_000 }).catch(() => {});
    try {
      await expect.poll(() => stepId(page), { timeout: 5_000 }).toBe(want);
      return;
    } catch { /* the card moved; press again */ }
  }
  expect(await stepId(page), `never reached ${want}`).toBe(want);
}

test.describe('@smoke the tutorials menu', () => {
  test('offers every walkthrough, with a duration on each', async ({ page }) => {
    await openBasic(page);
    await page.getByTestId('hdr-project').click();
    await page.getByTestId('demo-menu-toggle').click();

    for (const d of DEMOS) {
      await expect(page.getByTestId(`demo-${d.id}`), d.id).toBeVisible();
    }
    // The duration is what makes the list one somebody tries rather than
    // closes, so its absence is a defect and not a detail.
    const items = page.locator('.dm-item .dm-secs');
    expect(await items.count()).toBe(DEMOS.length);
    for (const text of await items.allInnerTexts()) {
      expect(text, 'every entry says how long it takes').toMatch(/^\d+s$/);
    }
  });
});

/**
 * Every step points at something that is on the screen.
 *
 * This is the check the old tour did not have, and its absence is the whole
 * reason it could rot: a spotlight aimed at a missing element looks like a
 * dark screen, not like an error.
 */
test.describe('@smoke every step has something to point at', () => {
  for (const demo of DEMOS) {
    test(`${demo.id}: targets exist all the way through`, async ({ page }) => {
      test.setTimeout(120_000);
      await openBasic(page);
      await startDemo(page, demo.id);

      const seen: string[] = [];
      for (let i = 0; i < 16; i++) {
        const info = await page.evaluate(() => window.__stabileo.tourStep());
        if (!info) break;
        seen.push(info.id);

        if (info.target && info.target !== 'none') {
          await expect(
            page.locator(info.target).first(),
            `${demo.id} / ${info.id} → ${info.target}`,
          ).toBeVisible();
        }

        const next = nextButton(page);
        if (!(await next.count())) break;   // waits on the reader; covered below
        await next.click();
        await page.waitForTimeout(700);
      }
      expect(seen.length, `${demo.id} produced steps`).toBeGreaterThan(0);
    });
  }
});

/**
 * The modelling walkthrough, done rather than skipped.
 *
 * It is the only one where the reader builds something, and every one of its
 * middle steps waits on a count. Both hangs found by hand were here or in a
 * step shaped like these.
 */
test.describe('@smoke drawing a beam', () => {
  /*
   * Retries, declared rather than hidden.
   *
   * Everything below is a click on a canvas whose layout moves between steps —
   * the demo loads a model, frames it, and floats a card over the drawing. The
   * walkthrough itself is deterministic and was verified as such: entering the
   * step arms the advance, and two nodes advance it, every time when run
   * alone. What is not deterministic is landing a synthetic click on a moving
   * target, and a retry is the honest way to say so.
   */
  test.describe.configure({ retries: 2 });
  test('each step advances when the reader does what it asks', async ({ page }) => {
    test.setTimeout(180_000);
    await openBasic(page);
    await startDemo(page, 'modelling-2d');
    await advance(page, 'nodes');

    /*
     * Measured before each gesture, not once: the walkthrough starts with the
     * Project panel open and frames the model as it goes, so a box captured at
     * the first step sends later clicks to where the canvas used to be.
     */
    const canvasBox = async () =>
      (await page.locator('canvas:not(.axis-gizmo)').first().boundingBox())!;
    const click = async (x: number, y: number) => {
      await page.mouse.click(x, y);
      await page.waitForTimeout(400);
    };

    /*
     * Retry the gesture only if it had NO effect.
     *
     * A canvas click can be swallowed while the viewport is still settling,
     * so a blind retry is tempting — and wrong: the first version repeated a
     * gesture that had already worked and left three nodes on a two-node
     * beam. What distinguishes "the click missed" from "the click landed and
     * the step has not caught up" is whether the model changed, so that is
     * what decides.
     */
    const modelSize = () =>
      page.evaluate(() => window.__stabileo.nodeCount()
        + window.__stabileo.elementIds().length
        + window.__stabileo.supportCount());

    const doUntil = async (want: string, gesture: () => Promise<void>) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const before = await modelSize();
        await gesture();
        try {
          await expect.poll(() => stepId(page), { timeout: 8_000 }).toBe(want);
          return;
        } catch {
          if ((await modelSize()) !== before) {
            // It landed. Give the step longer rather than drawing again.
            await expect.poll(() => stepId(page), { timeout: 15_000 }).toBe(want);
            return;
          }
        }
      }
      expect(await stepId(page), `never reached ${want}`).toBe(want);
    };

    // Two nodes. Placed by clicking, not by a hook: the point is that the
    // step notices.
    await doUntil('member', async () => {
      const box = await canvasBox();
      await click(box.x + box.width * 0.34, box.y + box.height * 0.55);
      await click(box.x + box.width * 0.64, box.y + box.height * 0.55);
    });

    /*
     * The nodes' screen positions rather than the coordinates just clicked:
     * snapping moves a node to the nearest grid intersection, which at a metre
     * spacing is up to half a grid square from the pointer.
     */
    const at = async (id: number) =>
      (await page.evaluate((n) => window.__stabileo.nodeScreenPos(n), id))!;
    const a = await at(1);
    const z = await at(2);

    await doUntil('supports', async () => { await click(a.x, a.y); await click(z.x, z.y); });
    await doUntil('load', async () => { await click(a.x, a.y); await click(z.x, z.y); });
    await doUntil('sections', async () => { await click((a.x + z.x) / 2, a.y); });

    // Properties come BEFORE the solve — model data, not an adjustment.
    await advance(page, 'materials');
    await advance(page, 'solve');

    await page.locator('.tour-card button').filter({ hasText: /Calcular|Solve/ }).first().click();
    await expect.poll(() => stepId(page), { timeout: 60_000 }).toBe('done');

    // A beam, standing, solved.
    expect(await page.evaluate(() => window.__stabileo.nodeCount())).toBe(2);
    expect(await page.evaluate(() => window.__stabileo.elementIds().length)).toBe(1);
    expect(await page.evaluate(() => window.__stabileo.supportCount())).toBe(2);
  });
});

/** A step that claims a result is on screen has to have switched to it. */
test.describe('@smoke the cards do not contradict the screen', () => {
  test('each result step shows the result it describes', async ({ page }) => {
    test.setTimeout(120_000);
    await openBasic(page);
    await startDemo(page, 'results');

    await nextButton(page).click();
    await page.locator('.tour-card button').filter({ hasText: /Calcular|Solve/ }).first().click();
    await expect.poll(() => stepId(page), { timeout: 60_000 }).toBe('deformed');

    const expected: Record<string, RegExp> = {
      deformed: /^deformed$/,
      axial: /^axial$/,
      shearZ: /^shear/,
      momentY: /^moment/,
      stress: /^colorMap$/,
    };

    for (let i = 0; i < 12; i++) {
      const id = await stepId(page);
      if (!id) break;
      const want = expected[id];
      if (want) {
        await expect
          .poll(() => page.evaluate(() => window.__stabileo.diagramType()), { timeout: 10_000 })
          .toMatch(want);
      }
      const next = nextButton(page);
      if (!(await next.count())) break;
      await next.click();
      await page.waitForTimeout(600);
    }
  });
});

/** The section walkthrough waits on a click that opens a panel. */
test.describe('@smoke the section walkthrough', () => {
  test('advances when the reader clicks the member', async ({ page }) => {
    test.setTimeout(150_000);
    await openBasic(page);
    await startDemo(page, 'section-analysis');

    await nextButton(page).click();
    await page.locator('.tour-card button').filter({ hasText: /Calcular|Solve/ }).first().click();
    await expect.poll(() => stepId(page), { timeout: 60_000 }).toBe('arm');
    await advance(page, 'pick');

    const box = (await page.locator('canvas:not(.axis-gizmo)').first().boundingBox())!;
    for (const fy of [0.5, 0.55, 0.45, 0.6]) {
      await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * fy);
      await page.waitForTimeout(700);
      if ((await stepId(page)) !== 'pick') break;
    }
    // It hung here: the condition read the DOM, which nothing re-evaluates.
    await expect.poll(() => stepId(page), { timeout: 15_000 }).toBe('sliders');
  });
});

/** A walkthrough that ends leaves the app usable, not mid-gesture. */
test.describe('@smoke walkthroughs clean up after themselves', () => {
  test('the first one leaves no tour open and no stray tool armed', async ({ page }) => {
    test.setTimeout(120_000);
    await openBasic(page);
    await startDemo(page, 'basics-2d');

    for (let i = 0; i < 12; i++) {
      const next = nextButton(page);
      if (await next.count()) { await next.click(); await page.waitForTimeout(600); continue; }
      const solve = page.locator('.tour-card button').filter({ hasText: /Calcular|Solve/ }).first();
      if (await solve.count()) { await solve.click(); await page.waitForTimeout(4000); continue; }
      break;
    }
    const finish = page.locator('.tour-card button').filter({ hasText: /Listo|Finalizar|Done|Cerrar/ }).first();
    if (await finish.count()) await finish.click();
    await page.waitForTimeout(500);

    // Whatever it ends on, it must not leave a drawing tool armed — a reader
    // who clicks the canvas next should not be placing a node by surprise.
    const tool = await page.evaluate(() => window.__stabileo.currentTool());
    expect(['pan', 'select'], `left armed: ${tool}`).toContain(tool);
  });
});
