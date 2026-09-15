/**
 * The share link is the other portable artefact, and nothing was watching it.
 *
 * ── Why this file exists ───────────────────────────────────────────
 *
 * `ded-roundtrip.spec.ts` proves the FILE survives a whole building. The link
 * had no equivalent, and the gap showed: a reader tried to share the 3D
 * industrial shed, was told the link "may not work in all browsers", and did
 * not send it. The link was fine. The warning was a constant — 2000
 * characters, the old Internet Explorer address-bar limit — applied to a
 * payload that never goes near an address bar's limits and never reaches a
 * server at all, because it rides in the fragment.
 *
 * Raising a threshold on the strength of one measurement is how the next
 * person lowers it again on the strength of one anecdote. So the measurement
 * lives here instead of in a commit message.
 *
 * ── What it asserts ────────────────────────────────────────────────
 *
 * The whole path a reader walks, not the compression underneath it: the model
 * is loaded, the link is copied FROM THE BUTTON, and the assertions are made
 * on a second page that has only ever seen that string. `url-sharing.test.ts`
 * covers the encoding; it re-implements the pure functions inline because the
 * module reaches for the stores, which means it cannot catch anything the
 * stores do. This can.
 *
 * The shed is the case worth pinning: 232 nodes, 633 members, 242 loads, three
 * load cases and four combinations, and a link around 10 700 characters — five
 * times the threshold that used to warn about it.
 */

import { test, expect, loadModel } from './fixtures';

type Page = import('@playwright/test').Page;

/** The example the report was about. */
const SHED = '3d-nave-industrial';

const census = (page: Page) => page.evaluate(() => window.__stabileo.modelCensus());

test.describe('@smoke a share link carries the whole model', () => {
  test('the 3D shed survives being copied and opened elsewhere', async ({ page, context }) => {
    test.setTimeout(180_000);

    await page.goto('/app/basic?e2e=1');
    await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 60_000 });
    await loadModel(page, SHED);

    const before = await census(page);
    /*
     * Asserted, not assumed. If the fixture ever shrinks, every count below
     * still matches and this file quietly stops testing a large model — which
     * is the only size the report was ever about.
     */
    expect(before.nodes, 'the shed should be a big model, or this proves nothing')
      .toBeGreaterThan(200);
    expect(before.loads).toBeGreaterThan(200);
    expect(before.combinations).toBeGreaterThan(0);

    // Copied the way a reader copies it: Project → the share-link button.
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByTestId('hdr-project').click();
    await page.getByTestId('project-share-link').click();

    const url = await page.evaluate(() => navigator.clipboard.readText());
    expect(url, 'the button must put a data link on the clipboard').toContain('#data=');
    expect(
      url.length,
      'a model this size makes a link far past any threshold worth warning about',
    ).toBeGreaterThan(8_000);

    /*
     * A second page, which has never held this model — the recipient. It gets
     * the string and nothing else, so anything that survives here survived the
     * link rather than the session.
     */
    const recipient = await context.newPage();
    const pageErrors: string[] = [];
    recipient.on('pageerror', (e) => pageErrors.push(String(e)));

    await recipient.goto(url.includes('?') ? url : url.replace('#', '?e2e=1#'), {
      waitUntil: 'networkidle',
      timeout: 90_000,
    });
    await recipient.waitForFunction(() => !!window.__stabileo, null, { timeout: 60_000 });
    await expect
      .poll(() => recipient.evaluate(() => window.__stabileo.modelCensus().nodes), {
        message: 'the recipient never received a model',
        timeout: 30_000,
      })
      .toBeGreaterThan(0);

    expect(await census(recipient), 'every kind has to arrive, not just the geometry')
      .toEqual(before);
    expect(pageErrors, 'opening a long link must not throw').toEqual([]);
  });
});
