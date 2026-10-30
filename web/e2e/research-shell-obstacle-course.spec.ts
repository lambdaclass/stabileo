import { test, expect } from '@playwright/test';

test('shell refinement, failures and rerun @smoke', async ({ page }) => {
  await page.goto('/research/benchmarks/shell-obstacle-course');
  await expect(page.getByTestId('shell-summary')).toContainText(/\d\/3/, { timeout: 120_000 }); // slow-ok: The production WASM engine solves the curved-shell mesh convergence cases.
  await page.getByTestId('mesh-slider').fill('3');
  await expect(page.getByTestId('selected-result')).toContainText('16 × 16');
  await expect(page.getByTestId('selected-result')).toContainText(/0[.,]255/);
  await page.getByRole('tab', { name: /Results|Resultados/ }).click();
  await expect(page.getByTestId('roof-16').getByRole('link')).toHaveAttribute('href', /KNOWN_ISSUES.md#shell-obstacle-course/);
  await expect(page.getByTestId('hemisphere-16')).toContainText(/0[.,]185/);
  await page.getByRole('button', { name: /Run again|Ejecutar de nuevo|Executar novamente/ }).click();
  await expect(page.getByTestId('shell-summary')).toContainText(/\d\/3/, { timeout: 120_000 }); // slow-ok: Run again recomputes the curved-shell mesh convergence cases through WASM.
});

test('shell editor handoff @smoke', async ({ page }) => {
  await page.goto('/research/benchmarks/shell-obstacle-course');
  await page.getByTestId('mesh-slider').fill('3');
  await page.getByRole('tab', { name: /Model|Modelo/, exact: true }).click();
  const opened = page.waitForEvent('popup');
  await page.getByRole('button', { name: /Open in Stabileo|Abrir en Stabileo|Abrir no Stabileo/, exact: true }).click();
  const editor = await opened;
  await expect(editor).toHaveURL(/\/app#data=/);
  await expect(editor.locator('canvas').first()).toBeVisible();
});
