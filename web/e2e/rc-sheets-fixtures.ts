import { solveModel as solve } from './fixtures';
import type { Page } from '@playwright/test';
export { test, expect, loadModel, ribbonCmd } from './fixtures';

export async function solveModel(page: Page): Promise<void> {
  await solve(page);
  await page.evaluate(() => window.__stabileoActions.recognizePhysicalElements());
}
