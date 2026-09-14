import { test, expect, loadModel } from './fixtures';

/**
 * The code-backed load generator, on the two halves that were not code-backed.
 *
 *  · The permanent load was five fixed rows carrying five fixed numbers, inside a
 *    dialog whose whole promise is that its numbers come from a regulation.
 *
 *  · The seismic coefficient came from `engine/auto-loads.ts`, which carries the
 *    2005-era model — Ca and Cv by SOIL rather than by spectral type, T3 fixed at 3 s
 *    where the 2018 table gives 3, 5, 8 and 13, and R built up from a ductility μ
 *    instead of read off Tabla 5.1.
 */
/**
 * Bind the seismic role first, THEN open the dialog.
 *
 * The dialog is modal and covers the ribbon, so the role cannot be bound from inside it
 * — which is the same reason `pending-review-in-loads` exists as the way back.
 */
async function openWithSeismic(page: import('@playwright/test').Page) {
  await loadModel(page, 'rc-design-qa-8');
  await page.getByTestId('pr-stage-design').click();
  await page.getByTestId('pr-cmd-design').click();
  await expect(page.getByTestId('design-toolbar')).toBeVisible();
  /* The roles live in a collapsed disclosure inside the design panel. */
  const d = page.locator('details').filter({ hasText: 'Project regulations' }).first();
  await d.locator('summary').first().click();
  await expect(page.getByTestId('project-regulations')).toBeVisible();
  await page.getByTestId('role-select-seismic').selectOption('inpres103-2018');
  await page.getByTestId('pending-review-in-loads').click();
  await page.getByRole('button', { name: /Auto-generate from code/i }).click();
  await page.getByTestId('al-enable-seismic').check();
}

async function openDialog(page: import('@playwright/test').Page) {
  await loadModel(page, 'rc-design-qa-8');
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-loads').click();
  await page.getByTestId('pro-auto-loads-btn').click();
  await expect(page.getByTestId('dead-picker')).toBeVisible();
}

test.describe('@smoke the permanent load comes from CIRSOC 101 Tabla 3.1', () => {
  test('a screed is a thickness of a material, not a number somebody typed', async ({ pro: page }) => {
    await openDialog(page);
    // The default build-up opens with 8 cm of cement screed at 18 kN/m³ = 1,44 kN/m².
    const first = page.getByTestId('dead-value').first();
    await expect(first).toContainText('1.440');

    // Change the thickness and the load follows, because it is being computed.
    await page.getByTestId('dead-thickness').first().fill('0.12');
    await expect(first).toContainText('2.160');
  });

  test('a row the table prints per m² needs no thickness at all', async ({ pro: page }) => {
    await openDialog(page);
    // Ceramic tile IS 0,28 kN/m² in Tabla 3.1 — there is nothing to multiply.
    await expect(page.getByTestId('dead-value').nth(1)).toContainText('0.280');
    await expect(page.getByTestId('dead-row').nth(1).getByTestId('dead-thickness')).toHaveCount(0);
  });

  test('a typed value is offered and marked as an assumption', async ({ pro: page }) => {
    await openDialog(page);
    await expect(page.getByTestId('dead-assumed')).toHaveCount(0);
    await page.getByTestId('dead-add-custom').click();
    await expect(page.getByTestId('dead-assumed')).toBeVisible();
  });

  test('§3.1.4 says when the partition allowance is missing', async ({ pro: page }) => {
    await openDialog(page);
    const check = page.getByTestId('dead-partition-check');
    // The default build-up carries one, on a 2 kN/m² dwelling.
    await expect(check).toContainText(/incluida|included|inclu/i);

    // Take it off and the article speaks up: what is missing shows as nothing at all.
    await page.getByTestId('dead-is-partition').last().uncheck();
    await expect(check).toContainText(/3\.1\.4/);
    await expect(check).toHaveClass(/warn/);
  });

  test('the total is the sum of the rows, to two decimals', async ({ pro: page }) => {
    await openDialog(page);
    // 1,440 + 0,280 + 0,05 + 0,55 = 2,32 kN/m².
    await expect(page.getByTestId('dead-total')).toContainText('2.32');
  });
});

test.describe('@smoke seismic comes from INPRES-CIRSOC 103 (2018)', () => {
  test('the controls are the 2018 ones, and the spectrum is shown', async ({ pro: page }) => {
    await openWithSeismic(page);

    /* A SITE class, not a soil: the 2018 spectrum is chosen by spectral type, and SF
       is a class with no row to read at all. */
    await expect(page.getByTestId('al-site')).toBeVisible();
    await expect(page.getByTestId('al-site').locator('option[value="SF"]')).toHaveCount(1);
    /* The Tabla 5.1 list, with R printed on each row — R divides the whole spectrum. */
    await expect(page.getByTestId('al-system')).toContainText(/R = 7/);
    /* And Tabla 3.3, which the old single "live participation" number could not express. */
    await expect(page.getByTestId('al-f1')).toBeVisible();

    /* The spectrum the zone and site imply, before anything is generated. */
    await expect(page.getByTestId('al-spectrum')).toContainText(/Ca =/);
  });

  test('zone 0 and site SF are refused with the clause that refuses them', async ({ pro: page }) => {
    await openWithSeismic(page);

    await page.getByTestId('al-site').selectOption('SF');
    await expect(page.getByTestId('al-spectrum-blocked')).toContainText(/2\.3\.2/);
    await page.getByTestId('al-site').selectOption('SD');
    await expect(page.getByTestId('al-spectrum')).toBeVisible();
  });

  test('the row Tabla 5.1 prints as a formula gives no R, and says so', async ({ pro: page }) => {
    await openWithSeismic(page);

    /* Row 1 is R = (3 + A/5)·z bounded by 5z ≤ R ≤ 7 — a calculation on the wall
       layout. Substituting either bound would invent the reader's coupling ratio. */
    await page.getByTestId('al-system').selectOption('rc_walls');
    await expect(page.getByTestId('al-no-r')).toBeVisible();
    /* Electing elastic behaviour is one way out: §5.1.2 gives R = 1,5 outright. */
    await page.getByTestId('al-elastic').check();
    await expect(page.getByTestId('al-no-r')).toHaveCount(0);
  });
});
