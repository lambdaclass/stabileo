import { test, expect } from '@playwright/test';

test('production engine benchmark results and editor handoff @smoke', async ({ page }) => {
  await page.goto('/research/benchmarks/macneal-harder-1985');
  await expect(page.getByTestId('benchmark-summary')).toContainText(/\d+\/12/, { timeout: 120_000 });
  await page.getByRole('tab', { name: /Results|Resultados/ }).click();
  await expect(page.getByTestId('frame-shear-1-uz')).toContainText(/0[.,]0036/);
  await expect(page.getByTestId('mitc4-trapezoidal-in').getByRole('link')).toHaveAttribute('href', /KNOWN_ISSUES.md#mh-mitc4-distortion/);
  await page.getByRole('button', { name: /Run again|Ejecutar de nuevo|Executar novamente/ }).click();
  await expect(page.getByTestId('benchmark-summary')).toContainText(/\d+\/12/);
  await page.getByRole('tab', { name: /Model|Modelo/, exact: true }).click();
  const opened = page.waitForEvent('popup');
  await page.getByRole('button', { name: /Open in Stabileo|Abrir en Stabileo|Abrir no Stabileo/, exact: true }).click();
  const editor = await opened;
  await expect(editor).toHaveURL(/\/app#data=/);
  await expect(editor.locator('canvas').first()).toBeVisible({ timeout: 120_000 });
});
