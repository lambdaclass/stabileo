import { test, expect, solveModel, bootPro } from '../../e2e/fixtures';
import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT = process.env.BLOG_SHOTS_OUT ?? 'e2e/.artifacts/blog-shots';
mkdirSync(OUT, { recursive: true });

test.use({ recheckNotice: 'assert' });

async function english(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('stabileo-lang', 'en');
      localStorage.setItem('stabileo-lang-manual', '1');
    } catch { /* private mode */ }
  });
}

async function settle(page: Page, ms = 1500) {
  await page.evaluate(() => window.dispatchEvent(new Event('stabileo-zoom-to-fit')));
  await page.waitForTimeout(ms);
}

const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${name}.png` });

const NO_RELEASE = { tx: false, ry: false, rz: false, my: false, mz: false, t: false };

const RC_PORTAL = {
  name: 'RC portal frame',
  materials: [{ id: 1, name: 'H-21', e: 21538, nu: 0.2, rho: 25, fy: 21 }],
  sections: [
    { id: 1, name: 'H.A. 30×30', a: 0.09, iz: 0.000675, iy: 0.000675, b: 0.3, h: 0.3, shape: 'rect' },
    { id: 2, name: 'H.A. 25×40', a: 0.1, iz: 0.0005208, iy: 0.0013333, b: 0.25, h: 0.4, shape: 'rect' },
  ],
  nodes: [
    { id: 1, x: 0, y: 0, z: 0 },
    { id: 2, x: 0, y: 4, z: 0 },
    { id: 3, x: 6, y: 4, z: 0 },
    { id: 4, x: 6, y: 0, z: 0 },
  ],
  elements: [
    { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 },
    { id: 2, type: 'frame', nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 2 },
    { id: 3, type: 'frame', nodeI: 4, nodeJ: 3, materialId: 1, sectionId: 1 },
  ],
  supports: [{ id: 1, nodeId: 1, type: 'fixed' }, { id: 2, nodeId: 4, type: 'fixed' }],
  loads: [{ type: 'distributed', data: { id: 1, elementId: 2, qI: -30, qJ: -30, caseId: 1 } }],
  plates: [],
  quads: [],
  constraints: [],
  loadCases: [{ id: 1, type: 'D', name: 'Dead Load' }],
  combinations: [],
};

function oldConcreteFrame() {
  const CONCRETE = { id: 1, name: 'H-25', e: 30000, nu: 0.2, rho: 25, fy: 25 };
  return {
    version: '2.0',
    name: 'Concrete frame saved in September',
    timestamp: '2026-09-01T12:00:00.000Z',
    analysisMode: 'pro',
    snapshot: {
      localAxisConvention: 'zUpStrongAxis',
      nodes: [[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0, y: 0, z: 3 }], [3, { id: 3, x: 5, y: 0, z: 3 }], [4, { id: 4, x: 5, y: 0, z: 0 }]],
      materials: [[1, CONCRETE]],
      sections: [[1, { id: 1, name: 'H.A. 30×50', a: 0.15, iz: 0.003125, iy: 0.001125, j: 0.0028, b: 0.3, h: 0.5, shape: 'rect' }]],
      elements: [
        [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, releaseI: NO_RELEASE, releaseJ: NO_RELEASE }],
        [2, { id: 2, type: 'frame', nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1, releaseI: NO_RELEASE, releaseJ: NO_RELEASE }],
        [3, { id: 3, type: 'frame', nodeI: 4, nodeJ: 3, materialId: 1, sectionId: 1, releaseI: NO_RELEASE, releaseJ: NO_RELEASE }],
      ],
      supports: [[1, { id: 1, nodeId: 1, type: 'fixed3d' }], [2, { id: 2, nodeId: 4, type: 'fixed3d' }]],
      loads: [{ type: 'distributed3d', data: { id: 1, elementId: 2, qYI: 0, qYJ: 0, qZI: -20, qZJ: -20, caseId: 1 } }],
      loadCases: [{ id: 1, type: 'D', name: 'Dead Load' }],
      combinations: [],
      nextId: { node: 5, material: 2, section: 2, element: 4, support: 3, load: 2, loadCase: 2, combination: 1 },
    },
  };
}

test('determinism boundary: the RC portal frame and its moment diagram', async ({ page }) => {
  await english(page);
  await page.goto('/app/basic?e2e=1');
  await page.evaluate((m) => window.__stabileoActions.loadModelData(m), RC_PORTAL);
  await solveModel(page);
  await page.getByTestId('rb-cmd-moment').first().click();
  await settle(page);
  await shot(page, 'blog-determinism-portal');
});

test('certificates: a solved portal frame with its checks open', async ({ page }) => {
  await english(page);
  await page.goto('/app/basic?e2e=1');
  await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
  await page.evaluate(() => window.__stabileoActions.solve());
  await page.getByTestId('rb-cmd-deformed').first().click();
  await expect(page.getByTestId('result-checks-toggle')).toContainText('certified', { timeout: 60_000 });
  await page.getByTestId('result-checks-toggle').click();
  await expect(page.getByTestId('certificate-e2e')).toContainText('Checked end to end', { timeout: 60_000 });
  await page.getByTestId('certificate-e2e').scrollIntoViewIfNeeded();
  await settle(page);
  await shot(page, 'blog-certificate');
});

for (const [name, path] of [
  ['blog-hidden-mechanism', '/app/basic?e2e=1&example=hidden-mechanism&kin=1'],
  ['blog-torsion-tube', '/app/basic?e2e=1&example=torsion-tube&inspect=1&open=torsion'],
] as const) {
  test(`embed state: ${name}`, async ({ page }) => {
    await english(page);
    await page.goto(path);
    await page.waitForTimeout(6000);
    await shot(page, name);
  });
}

test('CIRSOC 201: the beam in PRO design', async ({ page }) => {
  await english(page);
  await page.addInitScript(() => { try { localStorage.setItem('stabileo-design-in-pro', '1'); } catch { /* private mode */ } });
  await page.goto('/app/pro?e2e=1&example=rc-beam-flexure&proTab=design');
  await page.waitForTimeout(6000);
  await solveModel(page);
  await page.evaluate(() => window.__stabileoActions.designAll());
  await page.waitForTimeout(6000);
  await shot(page, 'blog-cirsoc-201-beam');
});

test('bars or finite elements: the deep beam as a shell', async ({ page }) => {
  await english(page);
  await page.goto('/app/pro?e2e=1&example=deep-beam-shell');
  await page.waitForTimeout(4000);
  await solveModel(page);
  await page.evaluate(() => window.__stabileoActions.openProTab('analyze'));
  await page.waitForTimeout(4000);
  await shot(page, 'blog-deep-beam-shell');
});

test('re-check notice on a project solved before a results change', async ({ page }) => {
  await bootPro(page);
  expect(await page.evaluate((f) => window.__stabileoActions.loadProject(f), oldConcreteFrame())).toBe(true);
  await expect(page.getByTestId('recheck-notice')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('recheck-ack')).toBeEnabled({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  await shot(page, 'blog-recheck-notice');
  await page.getByTestId('recheck-ack').check();
  await page.getByTestId('recheck-later').click();
  await expect(page.getByTestId('recheck-stale-banner')).toBeVisible();
  await page.waitForTimeout(1000);
  await shot(page, 'blog-recheck-stale');
});

test('reproduce dialog', async ({ page }) => {
  await english(page);
  await page.goto('/app/basic?e2e=1');
  await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
  await solveModel(page);
  await page.getByTestId('hdr-project').click();
  const link = page.getByTestId('open-reproduce');
  await link.scrollIntoViewIfNeeded();
  await link.click();
  await expect(page.getByTestId('reproduce-dialog')).toBeVisible();
  await page.waitForTimeout(1000);
  await shot(page, 'blog-reproduce');
});

for (const [name, path] of [
  ['blog-research', '/en/research/'],
  ['blog-tools', '/en/tools/'],
  ['blog-research-mattiasson', '/en/research/benchmarks/mattiasson-elastica/'],
] as const) {
  test(`public page: ${name}`, async ({ page }) => {
    await english(page);
    await page.goto(path);
    await page.waitForTimeout(6000);
    await shot(page, name);
  });
}
