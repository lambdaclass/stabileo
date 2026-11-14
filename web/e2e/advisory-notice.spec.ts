import { test, expect, bootPro } from './fixtures';
import { readRegistry } from '../scripts/result-changes/registry.mjs';

test.use({ recheckNotice: 'assert' });

const rel = { tx: false, ry: false, rz: false, my: false, mz: false, t: false };

function shearProject(solvedWith?: object) {
  return {
    version: '2.0',
    name: 'Old Timoshenko frame',
    timestamp: '2026-09-01T12:00:00.000Z',
    analysisMode: 'pro',
    snapshot: {
      localAxisConvention: 'zUpStrongAxis',
      nodes: [[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 4, y: 0, z: 0 }], [3, { id: 3, x: 2, y: 0, z: 2 }]],
      materials: [[1, { id: 1, name: 'F-24', e: 200000, nu: 0.3, rho: 78.5, fy: 235 }]],
      sections: [[1, { id: 1, name: 'S', a: 0.01, iz: 1e-4, iy: 1e-4, j: 1e-5, b: 0.2, h: 0.3, shearAreas: { basis: 'declared', asY: 0.008, asZ: 0.008 } }]],
      elements: [
        [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 3, materialId: 1, sectionId: 1, releaseI: rel, releaseJ: rel }],
        [2, { id: 2, type: 'frame', nodeI: 3, nodeJ: 2, materialId: 1, sectionId: 1, releaseI: rel, releaseJ: rel }],
      ],
      supports: [[1, { id: 1, nodeId: 1, type: 'fixed3d' }], [2, { id: 2, nodeId: 2, type: 'fixed3d' }]],
      loads: [{ type: 'nodal3d', data: { id: 1, nodeId: 3, fx: 0, fy: 0, fz: -20, mx: 0, my: 0, mz: 0, caseId: 1 } }],
      loadCases: [{ id: 1, type: 'D', name: 'Dead Load' }],
      combinations: [],
      nextId: { node: 4, material: 2, section: 2, element: 3, support: 3, load: 2, loadCase: 2, combination: 1 },
      ...(solvedWith ? { solvedWith } : {}),
    },
  };
}

for (const [label, viewport] of [['phone', { width: 390, height: 844 }], ['tablet', { width: 820, height: 1180 }]] as const) {
  test.describe(label, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test(`@smoke on a ${label} a model solved before a wrong-result fix keeps the advisory on screen until it is solved again`, async ({ page }) => {
      await bootPro(page);
      expect(await page.evaluate((f) => window.__stabileoActions.loadProject(f), shearProject())).toBe(true);
      const notice = page.getByTestId('recheck-notice');
      await expect(notice.locator('[data-advisory-id="issue-1569"]')).toBeVisible();
      await page.getByTestId('recheck-later').click();
      await expect(notice).toBeHidden();

      const banner = page.getByTestId('recheck-stale-banner');
      await expect(banner).toHaveAttribute('role', 'alert');
      await expect(page.getByTestId('recheck-advisory-banner')).toContainText('#1569');
      const layout = await banner.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const button = el.querySelector('[data-testid="recheck-banner-rerun"]')!.getBoundingClientRect();
        const onTop = el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
        return { left: r.left, right: r.right, pageOverflow: document.documentElement.scrollWidth - window.innerWidth, buttonHeight: button.height, onTop };
      });
      await page.screenshot({ path: test.info().outputPath(`${label}.png`) });
      expect(layout.left).toBeGreaterThanOrEqual(0);
      expect(layout.right).toBeLessThanOrEqual(viewport.width);
      expect(layout.pageOverflow).toBeLessThanOrEqual(0);
      expect(layout.buttonHeight).toBeGreaterThanOrEqual(44);
      expect(layout.onTop, 'the advisory is not hidden under the design desk or any other panel').toBe(true);

      await page.getByTestId('recheck-banner-rerun').click();
      await expect(banner).toBeHidden({ timeout: 45_000 });
      await expect(page.getByTestId('recheck-advisory-banner')).toHaveCount(0);
    });
  });
}

test('a static solve leaves the harmonic advisory up, and running harmonic analysis again clears it', async ({ page }) => {
  const harmonicFrom = readRegistry().changes.find((c: { id: string }) => c.id === 'harmonic-modal-residual-checked')!.resultsVersion;
  await bootPro(page);
  const project = shearProject({ id: 'e2e-harmonic', resultsVersion: harmonicFrom, analyses: ['harmonic', 'linear'] });
  expect(await page.evaluate((f) => window.__stabileoActions.loadProject(f), project)).toBe(true);
  const notice = page.getByTestId('recheck-notice');
  await expect(notice.locator('[data-advisory-id="SA-2026-046"]')).toContainText('may be affected');
  await page.getByTestId('recheck-later').click();
  await expect(notice).toBeHidden();

  const advisory = page.getByTestId('recheck-advisory-banner');
  await page.getByTestId('recheck-banner-rerun').click();
  await expect(advisory).not.toContainText('#1569', { timeout: 45_000 });
  await expect(advisory).toContainText('SA-2026-046');
  await expect(page.getByTestId('recheck-banner-rerun')).toHaveCount(0);
  await page.getByTestId('recheck-banner-details').click();
  await expect(notice.locator('[data-advisory-id="SA-2026-046"]')).toBeVisible();
  await expect(notice.locator('[data-advisory-id="issue-1569"]')).toHaveCount(0);
  await page.getByTestId('recheck-close').click();
  await expect(notice).toBeHidden();
  const solved = await page.evaluate(() => JSON.parse(window.__stabileo.serializeProject()).snapshot.solvedWith.analyses);
  expect(solved).toContain('linear');
  expect(solved).not.toContain('harmonic');

  for (const viewport of [{ width: 390, height: 844 }, { width: 820, height: 1180 }]) {
    await page.setViewportSize(viewport);
    const layout = await page.getByTestId('recheck-stale-banner').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, pageOverflow: document.documentElement.scrollWidth - window.innerWidth };
    });
    expect(layout.left).toBeGreaterThanOrEqual(0);
    expect(layout.right).toBeLessThanOrEqual(viewport.width);
    expect(layout.pageOverflow).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.getByTestId('pr-stage-analyse').click();
  await page.getByTestId('pr-cmd-advanced').click();
  await page.getByTestId('adv-chip-harmonic').click();
  await page.getByTestId('adv-run-harmonic').click();
  await expect(page.getByTestId('recheck-stale-banner')).toBeHidden({ timeout: 45_000 });
  const stamp = await page.evaluate(() => JSON.parse(window.__stabileo.serializeProject()).snapshot.solvedWith);
  expect(stamp.analyses).toEqual(expect.arrayContaining(['harmonic', 'linear']));
  expect(stamp.recorded).toContain('harmonic');
});

function slabProject(solvedWith: object, imposed: boolean) {
  return {
    version: '2.0',
    name: 'Old slab',
    timestamp: '2026-10-20T12:00:00.000Z',
    analysisMode: 'pro',
    snapshot: {
      localAxisConvention: 'zUpStrongAxis',
      nodes: [[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 2, y: 0, z: 0 }], [3, { id: 3, x: 2, y: 2, z: 0 }], [4, { id: 4, x: 0, y: 2, z: 0 }]],
      materials: [[1, { id: 1, name: 'H-25', e: 25000, nu: 0.2, rho: 25 }]],
      sections: [],
      elements: [],
      quads: [[1, { id: 1, nodes: [1, 2, 3, 4], materialId: 1, thickness: 0.2 }]],
      supports: [[1, { id: 1, nodeId: 1, type: 'fixed3d' }], [2, { id: 2, nodeId: 2, type: 'fixed3d' }], [3, { id: 3, nodeId: 3, type: 'pinned3d' }]],
      loads: [
        { type: 'nodal3d', data: { id: 1, nodeId: 4, fx: 0, fy: 0, fz: -10, mx: 0, my: 0, mz: 0, caseId: 2 } },
        ...(imposed ? [{ type: 'displacement3d', data: { id: 2, nodeId: 3, dz: -0.01, caseId: 1 } }] : []),
      ],
      loadCases: [{ id: 1, type: 'D', name: 'Dead Load' }, { id: 2, type: 'L', name: 'Live Load' }],
      combinations: [{ id: 1, name: '1.2 D + 1.6 L', factors: [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.6 }] }],
      nextId: { node: 5, material: 2, section: 1, element: 1, support: 4, load: 3, loadCase: 3, combination: 2, quad: 2 },
      solvedWith,
    },
  };
}

const shellFix = () => readRegistry().changes.find((c: { id: string }) => c.id === 'combined-shell-stresses')!.resultsVersion;

for (const [label, viewport] of [['phone', { width: 390, height: 844 }], ['tablet', { width: 820, height: 1180 }]] as const) {
  test.describe(`${label}, shell stresses of an imposed-displacement case`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    for (const imposed of [true, false]) {
      test(`@smoke on a ${label} a shell model ${imposed ? 'with' : 'without'} an imposed displacement, solved before #1676, is ${imposed ? '' : 'maybe '}affected until solved again`, async ({ page }) => {
        await bootPro(page);
        const project = slabProject({ id: `e2e-shells-${imposed}`, resultsVersion: shellFix() - 1, analyses: ['linear'] }, imposed);
        expect(await page.evaluate((f) => window.__stabileoActions.loadProject(f), project)).toBe(true);
        const notice = page.getByTestId('recheck-notice');
        const item = notice.locator('[data-advisory-id="SA-2026-047"]');
        await expect(item).toBeVisible();
        if (imposed) await expect(item).not.toContainText('may be affected');
        else await expect(item).toContainText('may be affected');
        await page.getByTestId('recheck-later').click();
        await expect(notice).toBeHidden();

        const banner = page.getByTestId('recheck-stale-banner');
        await expect(banner).toHaveAttribute('role', 'alert');
        const advisory = page.getByTestId('recheck-advisory-banner');
        await expect(advisory).toContainText('SA-2026-047');
        if (imposed) await expect(advisory).not.toContainText('may be affected');
        else await expect(advisory).toContainText('a load case that imposed a support displacement');
        const layout = await banner.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const button = el.querySelector('[data-testid="recheck-banner-rerun"]')!.getBoundingClientRect();
          const onTop = el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
          return { left: r.left, right: r.right, pageOverflow: document.documentElement.scrollWidth - window.innerWidth, buttonHeight: button.height, onTop };
        });
        await page.screenshot({ path: test.info().outputPath(`${label}-shells-${imposed}.png`) });
        expect(layout.left).toBeGreaterThanOrEqual(0);
        expect(layout.right).toBeLessThanOrEqual(viewport.width);
        expect(layout.pageOverflow).toBeLessThanOrEqual(0);
        expect(layout.buttonHeight).toBeGreaterThanOrEqual(44);
        expect(layout.onTop).toBe(true);

        await page.getByTestId('recheck-banner-rerun').click();
        await expect(banner).toBeHidden({ timeout: 45_000 });
        await expect(advisory).toHaveCount(0);
      });
    }
  });
}
