import { expect, type Page } from '@playwright/test';

/*
 * The Generators panel opens on a gallery of cards; a card opens that generator's form, and a
 * generated structure goes into the model as a paste does, never replacing it.
 */

/** Open one generator's form from the gallery (going back to it first if a form is open). */
export async function pickGenerator(page: Page, id: string): Promise<void> {
  const back = page.getByTestId('gen-back');
  if (await back.isVisible()) await back.click();
  await page.getByTestId(`gen-card-${id}`).click();
  await expect(page.getByTestId('gen-current')).toBeVisible();
  await openGenSections(page);
}

/**
 * Open every section of the form. They start folded (only their headings show), and the specs
 * reach the fields inside them.
 */
export async function openGenSections(page: Page): Promise<void> {
  const closed = page.locator('details[data-testid^="gen-sec-"]:not([open]) > summary');
  while (await closed.count() > 0) await closed.first().click();
}

/** Insert the structure as generated, at typed coordinates (the origin by default). */
export async function insertGenerated(page: Page, at: [number, number, number] = [0, 0, 0]): Promise<void> {
  await page.getByTestId('gen-out-atPoint').check();
  await page.getByTestId('gen-x').fill(String(at[0]));
  await page.getByTestId('gen-y').fill(String(at[1]));
  await page.getByTestId('gen-z').fill(String(at[2]));
  await page.getByTestId('gen-preview-point').click();
  await page.getByTestId('gen-insert').click();
  await expect(page.getByTestId('gen-out-result')).toBeVisible();
}

/** The action that places the structure: what was "Generate". */
export const placeButton = (page: Page) => page.getByTestId('gen-place-mouse');
