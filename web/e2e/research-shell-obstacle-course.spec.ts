import { test, expect } from '@playwright/test';

test('shell refinement, failures, a built mesh and rerun @smoke', async ({ page }) => {
  await page.goto('/research/benchmarks/shell-obstacle-course');
  await expect(page.getByTestId('shell-summary')).toContainText(/1\/3/, { timeout: 120_000 }); // slow-ok: The production WASM engine solves the curved-shell mesh convergence cases.
  await expect(page.getByTestId('selected-result')).toContainText('16 × 16');
  await expect(page.getByTestId('selected-result')).toContainText(/0[.,]302/);
  await expect(page.getByTestId('mesh-source')).toContainText('Engine-owned case file');
  await page.getByTestId('mesh-slider').fill('3');
  await expect(page.getByTestId('mesh-source')).toContainText('Built in this browser for N = 5');
  await expect(page.getByTestId('selected-result')).toContainText('5 × 5');
  await expect(page.getByTestId('selected-result')).toContainText('Reference: −0.3024 · Stabileo: −0.3101265 · Error (%): 2.555 · Fail', { timeout: 60_000 }); // slow-ok: one live 5×5 MITC4 solve through WASM.
  await page.getByTestId('try-cylinder-20').click();
  await expect(page.getByTestId('selected-result')).toContainText('20 × 20');
  await expect(page.getByTestId('selected-result')).toContainText('Reference: −1.8248 × 10⁻⁵ · Stabileo: −1.749518 × 10⁻⁵ · Error (%): 4.125 · Fail', { timeout: 60_000 }); // slow-ok: one live 20×20 MITC4 solve through WASM.
  await expect(page.getByTestId('validation-checks').locator('tbody tr')).toHaveCount(9);
  await page.getByRole('tab', { name: /Results/ }).click();
  await expect(page.getByTestId('cylinder-16').getByRole('link')).toHaveAttribute('href', /KNOWN_ISSUES.md#shell-obstacle-course/);
  await expect(page.getByTestId('hemisphere-16').locator('td').nth(1)).toHaveText(/withheld by the engine/i);
  await expect(page.getByTestId('hemisphere-16').getByRole('link')).toHaveAttribute('href', /issues\/798$/);
  await page.getByRole('tab', { name: 'Model', exact: true }).click();
  const selected = page.getByTestId('selected-result');
  await selected.evaluate(el => {
    new MutationObserver(() => {
      if (el.textContent?.includes('Not computed')) el.setAttribute('data-rerun-pending', 'true');
    }).observe(el, { childList: true, subtree: true, characterData: true });
  });
  await page.getByRole('button', { name: 'Run again' }).click();
  await expect(selected).toHaveAttribute('data-rerun-pending', 'true');
  await expect(selected).toContainText('Stabileo: −1.749518 × 10⁻⁵');
  await expect(page.getByTestId('shell-summary')).toContainText(/1\/3/, { timeout: 120_000 }); // slow-ok: Run again recomputes the curved-shell mesh convergence cases through WASM.
});

test('shell page in Spanish @smoke', async ({ page }) => {
  await page.goto('/es/research/benchmarks/shell-obstacle-course');
  await expect(page.getByTestId('shell-summary')).toContainText(/1\/3/, { timeout: 120_000 }); // slow-ok: The production WASM engine solves the curved-shell mesh convergence cases.
  await expect(page.getByRole('heading', { name: 'La pista de obstáculos' })).toBeVisible();
  await expect(page.getByTestId('mesh-source')).toContainText('Archivo de casos del motor');
  await expect(page.getByTestId('selected-result')).toContainText(/0,302/);
});

test('shell editor handoff @smoke', async ({ page }) => {
  await page.goto('/research/benchmarks/shell-obstacle-course');
  await page.getByRole('tab', { name: 'Model', exact: true }).click();
  const opened = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Open in Stabileo', exact: true }).click();
  const editor = await opened;
  await expect(editor).toHaveURL(/\/app#data=/);
  await expect(editor.locator('canvas').first()).toBeVisible();
});
