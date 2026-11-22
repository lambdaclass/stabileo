/**
 * A material typed by hand in Basic: created from the Materials tab, given to every member,
 * and solved with its own E.
 */
import { test, expect, type Page } from './fixtures';

async function openPortal(page: Page) {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 60_000 });
  await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
}

type Mat = { id: number; name: string; e: number; nu: number; rho: number; alpha?: number };

function materials(page: Page): Promise<Mat[]> {
  return page.evaluate(() => (window.__stabileo.entityData('setting', 'materials') as Array<[number, Mat]>).map(([, m]) => m));
}

async function displacements(page: Page) {
  await page.evaluate(() => window.__stabileoActions.solve());
  return page.evaluate(() => window.__stabileo.nodeIds().map((id) => window.__stabileo.nodeDisplacement(id)!));
}

test.describe('@smoke materials typed by hand in Basic', () => {
  test('a new material with half the E doubles every displacement', async ({ page }) => {
    test.setTimeout(120_000);
    await openPortal(page);
    const members = await page.evaluate(() => window.__stabileo.elementIds());
    const used = await page.evaluate((ids) =>
      [...new Set(ids.map((id) => (window.__stabileo.entityData('element', id) as { materialId: number }).materialId))], members);
    const original = (await materials(page)).filter((m) => used.includes(m.id));
    expect(original).toHaveLength(1);
    const before = await displacements(page);
    const peak = Math.max(...before.map((d) => Math.abs(d.ux)));
    expect(peak).toBeGreaterThan(0);

    await page.getByTestId('rb-cmd-materials').click();
    await page.getByTestId('mat-new').click();
    const form = page.getByTestId('mat-form');
    await expect(form).toBeVisible();
    await page.getByTestId('mat-form-name').fill('Half stiffness');
    await page.getByTestId('mat-form-e').fill('0');
    await expect(page.getByTestId('mat-form-problem')).toBeVisible();
    await expect(page.getByTestId('mat-form-save')).toBeDisabled();
    await page.getByTestId('mat-form-e').fill(String(original[0]!.e / 2));
    await page.getByTestId('mat-form-nu').fill(String(original[0]!.nu));
    await page.getByTestId('mat-form-rho').fill(String(original[0]!.rho));
    await expect(page.getByTestId('mat-form-problem')).toHaveCount(0);
    await page.getByTestId('mat-form-save').click();
    await expect(form).toHaveCount(0);

    const created = (await materials(page)).find((m) => m.name === 'Half stiffness')!;
    expect(created.e).toBeCloseTo(original[0]!.e / 2, 6);
    await expect(page.getByTestId(`mat-row-${created.id}`)).toBeVisible();

    await page.getByTestId('mat-delete-' + original[0]!.id).click();
    await expect(page.locator('.toast').first()).toBeVisible();
    await expect(page.getByTestId(`mat-row-${original[0]!.id}`)).toBeVisible();

    await page.getByTestId('dt-tab-elements').click();
    for (const id of members) await page.getByTestId(`elem-material-${id}`).selectOption(String(created.id));
    const after = await displacements(page);
    for (const [i, d] of after.entries()) {
      expect(d.ux).toBeCloseTo(2 * before[i]!.ux, 9);
      expect(d.uz).toBeCloseTo(2 * before[i]!.uz, 9);
    }
  });
});

test.describe('@smoke the material form on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('fits the sheet, every target is a finger wide, and it saves', async ({ page }) => {
    test.setTimeout(120_000);
    await openPortal(page);
    await page.getByTestId('rb-cmd-model').tap();
    await page.getByTestId('dt-tab-materials').tap();
    const rowButtons = await page.locator('[data-testid^=mat-row-] button').evaluateAll((els) =>
      els.map((e) => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height); }));
    expect(Math.min(...rowButtons)).toBeGreaterThanOrEqual(44);

    await page.getByTestId('mat-new').tap();
    const form = page.getByTestId('mat-form');
    await expect(form).toBeVisible();
    await page.getByTestId('mat-form-extra').locator('summary').tap();
    await expect(page.getByTestId('mat-form-fy')).toBeVisible();

    const layout = await form.evaluate((el) => {
      const targets = [...el.querySelectorAll('input, button, summary')].map((t) => t.getBoundingClientRect());
      const right = Math.max(...[...el.querySelectorAll('*')].map((t) => t.getBoundingClientRect().right));
      return {
        smallest: Math.min(...targets.map((r) => r.height)),
        right,
        pageWidth: document.documentElement.scrollWidth,
      };
    });
    expect(layout.smallest).toBeGreaterThanOrEqual(44);
    expect(layout.right).toBeLessThanOrEqual(390);
    expect(layout.pageWidth).toBeLessThanOrEqual(390);

    await page.getByTestId('mat-form-name').fill('Timber');
    await page.getByTestId('mat-form-e').fill('12000');
    await page.getByTestId('mat-form-alpha').fill('5');
    await expect(page.getByTestId('mat-form-extra-summary')).toContainText('α 5');
    await page.getByTestId('mat-form-save').tap();
    await expect(form).toHaveCount(0);
    const timber = (await materials(page)).find((m) => m.name === 'Timber');
    expect(timber).toMatchObject({ e: 12000 });
    expect(timber!.alpha).toBeCloseTo(5e-6, 12);
    await expect(page.getByTestId(`mat-row-${timber!.id}`)).toBeVisible();
  });
});
