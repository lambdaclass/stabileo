import { test, expect } from '@playwright/test';

test('Mattiasson live results, playback interaction and editor handoff @smoke', async ({ page }) => {
  await page.goto('/research/benchmarks/mattiasson-elastica');
  await expect(page.getByTestId('mattiasson-summary')).toContainText(/\d+\/4/, { timeout: 120_000 });
  const slider = page.getByRole('slider').first();
  await slider.fill('1');
  await expect(page.getByTestId('mattiasson-step')).toContainText('force-1');
  await page.waitForTimeout(900);
  await expect(slider).toHaveValue('1');
  await page.getByRole('tab', { name: /Results|Resultados/ }).click();
  await expect(page.getByTestId('force-1')).toContainText(/0[.,]056433/);
  await expect(page.getByTestId('force-1')).toContainText(/0[.,]05578272/);
  await expect(page.getByTestId('mattiasson-summary')).toContainText('3/4');
  await expect(page.getByTestId('force-1')).not.toContainText(/Not computed|Sin calcular|Não calculado/);
  await expect(page.getByTestId('force-10').getByRole('link')).toHaveAttribute('href', /KNOWN_ISSUES.md#mattiasson-reference-and-accuracy/);
  await page.getByRole('button', { name: /Run again|Ejecutar de nuevo|Executar novamente/ }).click();
  await expect(page.getByTestId('mattiasson-summary')).toContainText(/\d+\/4/, { timeout: 120_000 });
  await page.getByRole('tab', { name: /Model|Modelo/, exact: true }).click();
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: /Open in Stabileo|Abrir en Stabileo|Abrir no Stabileo/, exact: true }).click();
  const editor = await popup;
  await expect(editor).toHaveURL(/\/app#data=/);
  await expect(editor.locator('canvas').first()).toBeVisible({ timeout: 120_000 });
});
