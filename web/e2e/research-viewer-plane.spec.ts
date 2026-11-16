import { test, expect, type Locator, type Page } from '@playwright/test';

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

type Axis = [number, number];

async function yAxis(canvas: Locator, projection: 'plan' | 'orbit'): Promise<Axis> {
  await expect(canvas).toHaveAttribute('data-projection', projection);
  await expect.poll(async () => JSON.parse(await canvas.getAttribute('data-y-axis') ?? 'null')).not.toBeNull();
  return JSON.parse((await canvas.getAttribute('data-y-axis'))!);
}

async function firstViewer(page: Page, plane: 'plan' | 'elevation') {
  const canvas = page.locator(`.sfv-canvas canvas[data-plane="${plane}"]`).first();
  await expect(canvas).toBeVisible({ timeout: 30_000 }); // slow-ok: a research page loads its viewer bundle and replay before drawing.
  return { canvas, toggle: page.locator('.sfv-wrap', { has: canvas }).locator('.sfv-mode').first() };
}

async function standsUp(page: Page) {
  const { canvas, toggle } = await firstViewer(page, 'elevation');
  const [dx2, dy2] = await yAxis(canvas, 'plan');
  expect(Math.abs(dx2)).toBeLessThan(0.5);
  expect(dy2).toBeLessThan(0);
  await toggle.click();
  const [dx3, dy3] = await yAxis(canvas, 'orbit');
  expect(Math.abs(dx3)).toBeLessThan(0.1 * Math.abs(dy3));
  expect(dy3 / dy2).toBeGreaterThan(0.75);
  await toggle.click();
  await yAxis(canvas, 'plan');
}

for (const path of ELEVATION) {
  test(`@smoke research viewer: ${path} stands its elevation up in 3D`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`/en${path}/`);
    await standsUp(page);
  });
}

test('@smoke research viewer: MacNeal–Harder draws its shell meshes in plan and its frames in elevation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/en/research/benchmarks/macneal-harder-1985/');
  const { canvas } = await firstViewer(page, 'plan');
  await page.locator('.mh-control select').selectOption('frame-shear-4-uz');
  await expect(canvas).toHaveAttribute('data-plane', 'elevation');
  await standsUp(page);
});

test('@smoke research viewer: the Navier plate lies in plan and the gridshell switches between section and plan', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/en/research/benchmarks/navier-plate/');
  await firstViewer(page, 'plan');
  await expect(page.locator('.sfv-canvas canvas[data-plane="elevation"]')).toHaveCount(0);
  await page.goto('/en/research/optimisation/fairclough-2026/');
  const { canvas } = await firstViewer(page, 'elevation');
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-plane', 'plan');
});
