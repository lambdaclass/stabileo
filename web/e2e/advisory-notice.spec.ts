import { test, expect, bootPro } from './fixtures';

test.use({ recheckNotice: 'assert' });

const rel = { tx: false, ry: false, rz: false, my: false, mz: false, t: false };

function shearProject() {
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
      await page.getByTestId('recheck-ack').check();
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
