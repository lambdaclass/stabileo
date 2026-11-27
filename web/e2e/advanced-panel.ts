import type { Page } from '@playwright/test';
import { advFunction } from '../src/lib/advanced/catalog';

/** Basic's Advanced panel showing its list of functions (opened from the ribbon when it is not). */
export async function openAdvancedList(page: Page, how: 'click' | 'tap' = 'click'): Promise<void> {
  const launcher = page.getByTestId('adv-launcher');
  if (await launcher.isVisible()) return;
  const panel = page.locator('[data-testid="basic-panel"][data-panel="advanced"]');
  if (!(await panel.isVisible())) await page.getByTestId('rb-cmd-advanced')[how]();
  const back = page.getByTestId('adv-close');
  const catalogBack = page.getByTestId('steps-catalog-back');
  await launcher.or(back).or(catalogBack).first().waitFor();
  if (await back.isVisible()) await back[how]();
  else if (await catalogBack.isVisible()) await catalogBack[how]();
  await launcher.waitFor();
}

/** Start one advanced function from the list, opening its group first; `id` is its catalog id. */
export async function openAdvancedFunction(page: Page, id: string, how: 'click' | 'tap' = 'click'): Promise<void> {
  await openAdvancedList(page, how);
  const card = page.getByTestId(`adv-fn-${id}`);
  if (!(await card.isVisible())) {
    const group = advFunction(id)?.group;
    if (!group) throw new Error(`no advanced function '${id}'`);
    await page.getByTestId(`adv-group-toggle-${group}`)[how]();
  }
  await card[how]();
}

/** The explained step-by-step catalog, opened from the Advanced list. */
export async function openStepsCatalog(page: Page, how: 'click' | 'tap' = 'click'): Promise<void> {
  if (await page.getByTestId('steps-catalog').isVisible()) return;
  await openAdvancedFunction(page, 'steps', how);
  await page.getByTestId('steps-catalog').waitFor();
}

/** Every group of the step-by-step catalog unfolded, so each method's controls are on screen. */
export async function expandStepsCatalog(page: Page, how: 'click' | 'tap' = 'click'): Promise<void> {
  const closed = page.locator('[data-testid^=steps-group-toggle-][aria-expanded=false]');
  for (let n = await closed.count(); n > 0; n--) await closed.first()[how]();
}

/** One method's row in the catalog, its group unfolded. */
export async function revealStepsMethod(page: Page, method: string): Promise<void> {
  if (await page.getByTestId(`steps-method-${method}`).isVisible()) return;
  await expandStepsCatalog(page);
}
