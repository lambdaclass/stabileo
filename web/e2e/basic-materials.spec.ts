/**
 * A material typed by hand in Basic: created from the catalogue's last tab, given to every
 * member, and solved with its own E.
 */
import { test, expect, type Page } from './fixtures';

async function openPortal(page: Page) {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 30_000 });
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
  for (const micro of [-5, 0]) {
    test(`saves and reopens a Basic material with alpha ${micro}`, async ({ page }) => {
      await openPortal(page);
      await page.getByTestId('rb-cmd-materials').click();
      const id = (await materials(page))[0]!.id;
      await page.getByTestId(`mat-edit-${id}`).click();
      await page.getByTestId('mat-form-extra-summary').click();
      await page.getByTestId('mat-form-alpha').fill('1000');
      await expect(page.getByTestId('mat-form-save')).toBeDisabled();
      await page.getByTestId('mat-form-alpha').fill(String(micro));
      await page.getByTestId('mat-form-save').click();
      const reopened = await page.evaluate(() => window.__stabileoActions.loadProject(JSON.parse(window.__stabileo.serializeProject())));
      expect(reopened).toBe(true);
      expect((await materials(page)).find(m => m.id === id)?.alpha).toBe(micro * 1e-6);
    });
  }

  test('a new material with half the E doubles every displacement', async ({ page }) => {
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
    await expect(page.locator('.preset-list')).toBeVisible();
    await expect(form).toHaveCount(0);
    await page.getByTestId('mat-invent-tab').click();
    await expect(form).toBeVisible();
    await expect(page.locator('.preset-list')).toHaveCount(0);
    await page.getByTestId('mat-form-name').fill('Half stiffness');
    await page.getByTestId('mat-form-name').dispatchEvent('keydown', { key: 'Escape', isComposing: true });
    await expect(page.getByTestId('mat-form-name')).toHaveValue('Half stiffness');
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

    await page.getByTestId(`mat-edit-${created.id}`).click();
    await expect(page.getByTestId('mat-invent-tab')).toHaveClass(/active/);
    await expect(page.getByTestId('mat-form-name')).toHaveValue('Half stiffness');
    await page.getByTestId('mat-form-cancel').click();
    await expect(form).toHaveCount(0);

    const count = (await materials(page)).length;
    await page.getByTestId('mat-new').click();
    await page.locator('.preset-item').first().click();
    await expect.poll(async () => (await materials(page)).length).toBe(count + 1);

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

for (const [width, height] of [[390, 844], [360, 740]] as const) {
  test.describe(`@smoke the material form on a ${width} px phone`, () => {
    test.use({ viewport: { width, height }, hasTouch: true, isMobile: true });

    test('the custom tab is in reach, every target is a finger wide, and it saves', async ({ page }) => {
      await openPortal(page);
      await page.getByTestId('rb-cmd-model').tap();
      await page.getByTestId('dt-tab-materials').tap();
      const rows = await page.locator('[data-testid^=mat-row-]').all();
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        const id = (await row.getAttribute('data-testid'))!.slice('mat-row-'.length);
        for (const action of ['edit', 'delete']) {
          const button = row.getByTestId(`mat-${action}-${id}`);
          await expect(button).toBeVisible();
          const bounds = (await button.boundingBox())!;
          expect(Math.min(bounds.width, bounds.height)).toBeGreaterThanOrEqual(44);
        }
      }

      await page.getByTestId('mat-new').tap();
      const tab = page.getByTestId('mat-invent-tab');
      await expect(tab).toBeVisible();
      const box = (await tab.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      await tab.tap();
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
      expect(layout.right).toBeLessThanOrEqual(width);
      expect(layout.pageWidth).toBeLessThanOrEqual(width);

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
}
