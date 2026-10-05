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

    /*
     * And the way the published site actually opens it. `/app/basic` is no file on the host, so
     * 404.html bounces it to `/?route=…`; that bounce used to fold the fragment into the query,
     * where the host answered 414 to any link past about 8 000 characters, this one included.
     * The preview server here serves `/app/basic` directly, which is why nothing caught it.
     */
    const bounced = await context.newPage();
    const hash = url.slice(url.indexOf('#'));
    await bounced.goto(`/?route=${encodeURIComponent('/app/basic?e2e=1')}${hash}`, { waitUntil: 'networkidle', timeout: 90_000 });
    // Back on the app's own address (the app then reads the fragment and clears it).
    await expect(bounced).toHaveURL(/\/app\/basic\?e2e=1/, { timeout: 30_000 });
    await bounced.waitForFunction(() => !!window.__stabileo, null, { timeout: 60_000 });
    await expect.poll(() => bounced.evaluate(() => window.__stabileo.modelCensus().nodes), { timeout: 30_000 })
      .toBe(before.nodes);
  });

  test('a model too large for a link has the button blocked, and says to send the file', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/app/basic?e2e=1');
    await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 60_000 });
    // A 3D lattice of 1 600 nodes at irregular coordinates: far past the ceiling once compressed.
    const N = 1600;
    const nodes = Array.from({ length: N }, (_, k) => [k + 1, { id: k + 1, x: (k % 40) * 1.37 + (k % 7) * 0.013, y: Math.floor(k / 40) * 1.91 + (k % 11) * 0.017, z: (k % 13) * 0.29 }]);
    const elements = Array.from({ length: N - 1 }, (_, k) => [k + 1, {
      id: k + 1, type: 'frame', nodeI: k + 1, nodeJ: k + 2, materialId: 1, sectionId: 1,
      releaseI: { my: false, mz: false, t: false }, releaseJ: { my: false, mz: false, t: false },
    }]);
    const ok = await page.evaluate((f) => window.__stabileoActions.loadProject(f), {
      version: '2.0', name: 'big', timestamp: '2026-01-01T00:00:00.000Z', analysisMode: '3d',
      snapshot: {
        name: 'big', localAxisConvention: 'zUpStrongAxis', nodes, elements,
        materials: [[1, { id: 1, name: 'Acero A36', e: 200000, nu: 0.3, rho: 78.5, fy: 250 }]],
        sections: [[1, { id: 1, name: 'IPN 300', a: 0.0069, iy: 9.8e-05, iz: 4.51e-06, j: 4.666e-07, b: 0.125, h: 0.3, shape: 'I', tw: 0.0108, tf: 0.0162 }]],
        supports: [[1, { id: 1, nodeId: 1, type: 'fixed3d' }]], loads: [], loadCases: [{ id: 1, type: 'D', name: 'Dead Load' }], combinations: [],
        nextId: { node: N + 1, material: 2, section: 2, element: N, support: 2, load: 1, loadCase: 2, combination: 1, plate: 1, quad: 1, group: 1, connector: 1, footing: 1, soilProfile: 1 },
      },
    });
    expect(ok).toBe(true);
    await page.getByTestId('hdr-project').click();
    await expect(page.getByTestId('project-share-link')).toBeDisabled({ timeout: 10_000 });
    await expect(page.getByTestId('project-share-link-wrap')).toHaveAttribute('title', /\.ded/);
  });
});
