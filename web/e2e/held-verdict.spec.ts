/**
 * A favourable LOCAL check is never shown as the member's or the project's approval, on the
 * surfaces only the browser draws: the desk's piece panel, its verification detail, the overview
 * chips and the project's verdict, and the viewport's colour and label.
 *
 * The store-level proof is `store/__tests__/held-verdict-surfaces.test.ts`; this reads the same
 * rule where it is painted. qa-seismic with its chapter-18 checks run: every member they cover
 * runs them only as a substitute (ACI 318-19 ch. 18 for INPRES-CIRSOC 103 II), so its verdict is
 * held while its section's local checks pass. The 408-member frame: the members no layout
 * threads and anchors are refused, held by the refusal, and the others read their verdict.
 */
import { test, expect, loadModel, designAll, openDeskStage, deskTab, openClassicDesign, designPlace } from './fixtures';

test.use({ viewport: { width: 1440, height: 900 } });

type Verdict = { status: string; local: string; holds: string[]; assumptions: string[] };
const verdictOf = (page: import('@playwright/test').Page, id: number) =>
  page.evaluate((x) => (window as unknown as { __stabileo: { memberVerdict(id: number): Verdict } }).__stabileo.memberVerdict(x), id);
const visualOf = (page: import('@playwright/test').Page, id: number) =>
  page.evaluate((x) => (window as unknown as { __stabileo: { verificationVisual(id: number): { color: number; label: string | null } } }).__stabileo.verificationVisual(x), id);
/** `verificationColor` for a ratio ≤ 1: a pass. */
const PASS_COLOURS = [0x22cc66, 0x88cc22, 0xbfcc11, 0xddaa00];

test.describe('held verdicts in the browser', () => {
  test('seismic substitutes: the piece panel, the detail, the viewport and the overview read the hold', async ({ pro: page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await loadModel(page, 'rc-design-qa-seismic');
    await designAll(page);
    await openDeskStage(page);
    await deskTab(page, 'seismic');
    const ed = page.getByTestId('seismic-editor');
    await ed.getByTestId('seismic-run').click();
    await expect(ed.getByTestId('seismic-summary')).toBeVisible();

    // A member whose section's local checks pass and that the substitute holds.
    const ids = await page.evaluate(() => window.__stabileo.elementIds());
    let target = -1;
    for (const id of ids) {
      const v = await verdictOf(page, id);
      if ((v.local === 'ok' || v.local === 'warn') && v.holds.includes('seismic')) { target = id; break; }
    }
    expect(target, 'a member held by its seismic substitutes').toBeGreaterThan(0);
    const v = await verdictOf(page, target);
    expect(['ok', 'warn']).not.toContain(v.status);

    // The viewport: grey, never a pass colour; the label keeps the local ratio behind ⊘.
    const vis = await visualOf(page, target);
    expect(PASS_COLOURS).not.toContain(vis.color);
    if (vis.label !== null) expect(vis.label).toMatch(/⊘/);

    // The piece panel: the headline is the verdict with its reason; the ratio says it is local.
    await page.getByTestId(`desk-row-${target}`).click();
    const status = page.getByTestId('desk-status');
    await expect(status).toHaveAttribute('data-status', v.status);
    await expect(status).not.toHaveText(/^(Verified|Verifican)\b/);
    await expect(status).toContainText(/local η|η local/);
    await expect(page.getByTestId('desk-status-holds')).toContainText(/substitute|sustituto/);

    // The verification detail: the member's verdict is the panel's headline (said once, QA of
    // 20-oct), the local status beside it; the detail's rows labelled as local checks.
    await expect(status).toHaveAttribute('data-local', v.local);
    await expect(page.getByTestId(`member-verdict-${target}`)).toHaveCount(0);
    await expect(page.getByTestId(`local-checks-title-${target}`)).toBeVisible();
    const rows = page.getByTestId(`checks-${target}`).locator('[data-testid="status-badge"]');
    expect(await rows.count()).toBeGreaterThan(0);
    for (const b of await rows.all()) await expect(b).toHaveAttribute('data-scope', 'local');
    await expect(page.getByTestId(`checks-${target}`).locator('[data-testid="status-badge"][data-status="ok"]').first())
      .toHaveAttribute('title', /Local check met|Cumple la comprobación local/);

    // The overview: the verified count is the verdicts', the held local passes said apart, and
    // the project's verdict held with its reasons.
    await designPlace(page, 'prepare');
    const counts = await page.evaluate(() => window.__stabileo.counts());
    await expect(page.getByTestId('summary-count-verified')).toContainText(String(counts.ok));
    await expect(page.getByTestId('summary-count-held')).toContainText(String((counts as unknown as { held: number }).held));
    await expect(page.getByTestId('project-verdict')).toHaveAttribute('data-state', 'held');
    await expect(page.getByTestId('project-verdict-reasons')).toContainText(/substitute|sustituto/);
    expect(errors).toEqual([]);
  });

  test('the 408-member frame: a refused member reads held by its refusal, a verified one reads ok', async ({ pro: page }) => {
    test.setTimeout(240_000);
    await loadModel(page, 'rc-design-frame');
    const run = await designAll(page);
    await openDeskStage(page);
    const verdicts = await page.evaluate(() => {
      const h = window.__stabileo as unknown as { elementIds(): number[]; memberVerdict(id: number): Verdict };
      return h.elementIds().map((id) => [id, h.memberVerdict(id)] as const);
    });
    const refused = verdicts.filter(([, x]) => x.holds.includes('refused')).map(([id]) => id);
    const free = verdicts.filter(([, x]) => x.holds.length === 0 && x.status === 'ok').map(([id]) => id);
    // The refusals are the run's exhausted searches, 36 as B9 counts them; 62 verify with nothing
    // holding them (B9's «ok»). qa-8 had two refusals until the verifier took the compression
    // acting with each moment, and now verifies every beam (B10), so it shows no refusal to read.
    expect(refused).toHaveLength(run.searchExhausted);
    expect(refused).toHaveLength(36);
    expect(free).toHaveLength(62);

    await page.getByTestId(`desk-row-${refused[0]}`).click();
    await expect(page.getByTestId('desk-status')).not.toHaveAttribute('data-status', /^(ok|warn)$/);
    await expect(page.getByTestId('desk-status-holds')).toContainText(/refused|rechazó/);

    await page.getByTestId(`desk-row-${free[0]}`).click();
    await expect(page.getByTestId('desk-status')).toHaveAttribute('data-status', 'ok');
    await expect(page.getByTestId('desk-status-holds')).toHaveCount(0);

    await designPlace(page, 'prepare');
    await expect(page.getByTestId('summary-count-verified')).toContainText('6');
    await expect(page.getByTestId('project-verdict')).toHaveAttribute('data-state', 'held');
  });
});
