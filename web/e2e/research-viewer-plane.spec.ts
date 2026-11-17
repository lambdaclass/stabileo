import { test, expect, type Locator, type Page } from '@playwright/test';
import { standsUp, type ProjectedAxes } from '../src/components/viewport/scalar-field-plane';

const ELEVATION = [
  '/research/benchmarks/lee-frame-1968',
  '/research/stability/ferrari-sigmund-2025',
  '/research/optimization/andreassen-2011',
  '/research/form-finding/pastrana-2026',
  '/research/optimisation/fairclough-2026',
  '/research/benchmarks/mattiasson-elastica',
  '/research/benchmarks/shell-obstacle-course',
  '/research/benchmarks/newmark-1959',
  '/research/benchmarks/plastic-collapse',
  '/research/benchmarks/dadeppo-arch-1975',
  '/research/fracture/shauer-2025',
  '/research/metamaterials/grossman-2026',
  '/research/mechanics/biggins-2026',
  '/research/stability/feher-sipos-varkonyi-2026',
  '/research/mechanics/heyman-1966',
  '/research/mechanics/gay-neto-2014',
  '/research/benchmarks/cqc-1981',
  '/research/benchmarks/riks-crisfield',
];

async function axes(canvas: Locator, projection: 'plan' | 'orbit'): Promise<ProjectedAxes> {
  await expect(canvas).toHaveAttribute('data-projection', projection);
  const read = async (): Promise<ProjectedAxes | null> => JSON.parse(await canvas.getAttribute('data-axes') ?? 'null');
  await expect.poll(async () => Math.hypot(...((await read())?.y ?? [0, 0]))).toBeGreaterThan(1);
  return (await read())!;
}

async function firstViewer(page: Page) {
  const canvas = page.locator('.sfv-canvas canvas').first();
  await expect(canvas).toHaveAttribute('data-axes', /./, { timeout: 30_000 }); // slow-ok: a research page loads its viewer bundle and replay before drawing.
  return { canvas, toggle: page.locator('.sfv-wrap', { has: canvas }).locator('.sfv-mode').first() };
}

async function switchTo(canvas: Locator, toggle: Locator, projection: 'plan' | 'orbit') {
  await expect(async () => {
    if (await canvas.getAttribute('data-projection') !== projection) await toggle.click();
    await expect(canvas).toHaveAttribute('data-projection', projection, { timeout: 3_000 });
  }).toPass({ timeout: 20_000 });
}

async function expectStandsUp(page: Page) {
  const { canvas, toggle } = await firstViewer(page);
  await expect(canvas).toHaveAttribute('data-plane', 'elevation');
  const flat = await axes(canvas, 'plan');
  expect(Math.abs(flat.y[0])).toBeLessThan(0.5);
  expect(flat.y[1]).toBeLessThan(0);
  await switchTo(canvas, toggle, 'orbit');
  const oblique = await axes(canvas, 'orbit');
  expect(standsUp(flat, oblique), JSON.stringify({ flat, oblique })).toBe(true);
  await switchTo(canvas, toggle, 'plan');
}

for (const path of ELEVATION) {
  test(`@smoke research viewer: ${path} stands its elevation up in 3D`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`/en${path}/`);
    await expectStandsUp(page);
  });
}

test('@smoke research viewer: MacNeal–Harder draws its shell meshes in plan and its frames in elevation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/en/research/benchmarks/macneal-harder-1985/');
  const { canvas } = await firstViewer(page);
  await expect(canvas).toHaveAttribute('data-plane', 'plan');
  await page.locator('.mh-control select').selectOption('frame-shear-4-uz');
  await page.locator('.mh-control input[type="range"]').fill('20');
  await expect(canvas).toHaveAttribute('data-plane', 'elevation');
  await expectStandsUp(page);
});

test('@smoke research viewer: the Navier plate lies in plan and the gridshell switches between section and plan', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/en/research/benchmarks/navier-plate/');
  await expect((await firstViewer(page)).canvas).toHaveAttribute('data-plane', 'plan');
  await expect(page.locator('.sfv-canvas canvas[data-plane="elevation"]')).toHaveCount(0);
  await page.goto('/en/research/optimisation/fairclough-2026/');
  const { canvas } = await firstViewer(page);
  await expect(canvas).toHaveAttribute('data-plane', 'elevation');
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-plane', 'plan');
});

test('@smoke research viewer: the status bar shows a position only once the pointer has one', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/en/research/mechanics/heyman-1966/');
  const { canvas } = await firstViewer(page);
  const wrap = page.locator('.sfv-wrap', { has: canvas });
  await expect(wrap.locator('.sfv-status')).toBeVisible();
  await expect(wrap.locator('[data-testid="sfv-position"]')).toHaveCount(0);
  await expect(wrap.locator('.sfv-status')).not.toContainText('—');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
  await expect(wrap.locator('[data-testid="sfv-position"]')).toHaveText(/pos:\s*\(-?\d+\.\d{4}; -?\d+\.\d{4}\)/);
});
