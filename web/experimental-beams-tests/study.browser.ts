import { test, expect } from '@playwright/test';

test('column and arch expose different critical points and export the actual study', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/experimental-beams.html');
  await page.getByRole('button', { name: 'Calcular', exact: true }).click();
  await expect(page.getByTestId('critical')).toContainText('Candidato a bifurcación');
  await expect(page.getByTestId('verdict')).toHaveText('Inestable');
  await page.getByRole('slider', { name: 'Estado', exact: true }).fill('0');
  await expect(page.getByTestId('verdict')).toHaveText('Estable');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar JSON' }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const saved = JSON.parse(Buffer.concat(chunks).toString());
  expect(saved.result.states).toHaveLength(12);
  expect(saved.result.critical.kind).toBe('bifurcationCandidate');
  expect(saved.request.imperfection).toBeNull();
  await page.getByLabel('Modelo', { exact: true }).selectOption('arch');
  await expect(page.getByTestId('critical')).toHaveCount(0);
  await page.getByRole('button', { name: 'Calcular', exact: true }).click();
  await expect(page.getByTestId('critical')).toContainText('Candidato a punto límite');
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/experimental-beam-arch.png', fullPage: true });
});

test('cancelling a pending worker cannot publish stale results', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/*.wasm', async route => { await pending; await route.abort(); });
  await page.goto('/experimental-beams.html');
  await page.getByRole('button', { name: 'Calcular', exact: true }).click();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  release();
  await expect(page.getByRole('alert')).toContainText('Cálculo cancelado');
  await expect(page.getByTestId('critical')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Descargar JSON' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Calcular', exact: true })).toBeEnabled();
});
