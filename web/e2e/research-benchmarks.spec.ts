import { test, expect, type Page } from '@playwright/test';
import data from '../../engine/tests/benchmarks/macneal_harder.json' with { type: 'json' };

const PAGE = '/en/research/benchmarks/macneal-harder-1985/';
const VERDICT: Record<string, string> = {
  'mitc4-regular-out': 'marginal',
  'mitc4-regular-in': 'pass',
  'mitc4-trapezoidal-out': 'documented',
  'mitc4-trapezoidal-in': 'documented',
  'mitc4-parallelogram-out': 'documented',
  'mitc4-parallelogram-in': 'documented',
};

async function waitForResults(page: Page) {
  await expect(page.getByTestId('summary-shell')).toHaveText('Shell cases (paper reference): 2/6 within 2%', { timeout: 40_000 });
  await expect(page.getByTestId('summary-frame')).toHaveText('Frame adaptations (analytical reference): 6/6 within 2%');
}

test('production engine benchmark results, signs, verdicts and rerun @smoke', async ({ page }) => {
  await page.goto(PAGE);
  await waitForResults(page);
  await page.getByRole('tab', { name: 'Results', exact: true }).click();
  const region = page.getByRole('region', { name: 'Benchmark results' });
  await expect(region.locator('caption')).toHaveText('Signed results in global axes: m for displacements, rad for rotations.');
  await expect(region.getByTestId('group-shell').getByRole('columnheader', { name: 'Shell cases (paper reference)' })).toBeVisible();
  await expect(region.getByTestId('group-frame').locator('tr[data-testid]')).toHaveCount(6);
  await expect(region.getByTestId('group-shell').locator('tr[data-testid]')).toHaveCount(6);
  for (const c of data.cases) {
    const row = page.getByTestId(c.id);
    const computed = Number((await row.getByTestId('computed').innerText()).replace(/[−–]/g, '-').replace(/,/g, ''));
    expect(Math.sign(computed), c.id).toBe(Math.sign(c.reference));
    const bounds = c.nativeBounds as { pinnedValue?: number };
    if (bounds.pinnedValue !== undefined) expect(Math.abs(computed / bounds.pinnedValue - 1), c.id).toBeLessThan(1e-6);
    else expect(Math.abs(computed / c.reference - 1), c.id).toBeLessThan(0.02);
    await expect(row.getByTestId('verdict'), c.id).toHaveAttribute('data-verdict', VERDICT[c.id] ?? 'pass');
    await expect(row.getByTestId('quantity')).toHaveText(`${c.measurement.component} (${c.measurement.component.startsWith('r') ? 'rad' : 'm'})`);
    await expect(row.getByTestId('verdict').getByRole('link')).toHaveCount('knownIssue' in c ? 1 : 0);
  }
  await expect(page.getByTestId('frame-shear-1-uz').getByTestId('computed')).toHaveText('-0.0036');
  await expect(page.getByTestId('frame-shear-1-uz').getByTestId('reference')).toHaveText('-0.0036');
  await expect(page.getByTestId('frame-moment-4-ry').getByTestId('computed')).toHaveText('0.003');
  await expect(page.getByTestId('mitc4-trapezoidal-in').getByRole('link', { name: 'Fail · documented limitation' })).toHaveAttribute('href', /KNOWN_ISSUES.md#mh-mitc4-distortion/);
  await expect(page.getByTestId('mitc4-regular-out').getByTestId('verdict')).toHaveText('Pass (marginal)');
  await expect(page.getByTestId('mitc4-regular-out').getByTestId('error')).toHaveText('1.9936');
  await expect(page.getByTestId('mitc4-trapezoidal-in').getByTestId('error')).toHaveText('92.1896');
  await expect(page.getByTestId('frame-shear-1-uz').getByTestId('error')).toHaveText('< 0.0001');
  await page.getByRole('tab', { name: 'Model', exact: true }).click();
  await page.getByRole('button', { name: 'Run again', exact: true }).click();
  await waitForResults(page);
});

test('production engine benchmark editor handoff @smoke', async ({ page }) => {
  await page.goto(PAGE);
  await page.getByRole('tab', { name: 'Model', exact: true }).click();
  const opened = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Open in Stabileo', exact: true }).click();
  const editor = await opened;
  await expect(editor).toHaveURL(/\/app#data=/);
  await expect(editor.locator('canvas').first()).toBeVisible();
});

test('benchmark keyboard focus, camera menu and viewer navigation @smoke', async ({ page }) => {
  await page.goto(PAGE);
  await waitForResults(page);
  await page.getByRole('tab', { name: 'Results', exact: true }).click();
  await page.getByTestId('frame-moment-4-ry').getByRole('button').click();
  await expect(page.getByRole('tab', { name: 'Model', exact: true })).toBeFocused();
  await expect(page.getByRole('combobox', { name: 'Case' })).toHaveValue('frame-moment-4-ry');
  const trigger = page.getByRole('button', { name: 'View options' });
  await trigger.click();
  await expect(page.getByRole('button', { name: 'Zoom to extents' }).first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
  const viewer = page.getByRole('application', { name: /Translation magnitude/ });
  await expect(viewer).toHaveAttribute('title', /arrow keys pan/);
  await viewer.focus();
  const zoom = page.locator('.sfv-status .status-value').nth(1);
  const before = await zoom.innerText();
  await page.keyboard.press('+');
  await expect(zoom).not.toHaveText(before);
  await expect(page.locator('.axis-gizmo')).toHaveAttribute('aria-hidden', 'true');
});

test('benchmark page in German is translated, tagged and has no raw keys @smoke', async ({ page }) => {
  await page.goto('/de/research/benchmarks/macneal-harder-1985/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('MacNeal–Harder (1985): Benchmarks der Rechenengine');
  await expect(page.getByRole('heading', { level: 1 })).toHaveAttribute('lang', 'de');
  await expect(page.getByTestId('summary-shell')).toHaveText('Schalenfälle (Referenz aus dem Artikel): 2/6 innerhalb von 2 %', { timeout: 40_000 });
  await expect(page.locator('.mh-article')).toHaveAttribute('lang', 'de');
  expect(await page.locator('body').innerText()).not.toContain('scalarViewer.');
  expect(await page.locator('[aria-label^="scalarViewer."], [title^="scalarViewer."]').count()).toBe(0);
});

for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 810, height: 1080 }]) {
  test(`benchmark page fits, keeps the viewer on screen and meets touch sizes at ${viewport.width}×${viewport.height} @smoke`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto(PAGE);
    await waitForResults(page);
    const viewer = (await page.locator('.benchmark-pane .sfv-wrap').boundingBox())!;
    expect(viewer.y + 120).toBeLessThanOrEqual(viewport.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    const article = (await page.locator('.rs-shell-article').boundingBox())!;
    for (const code of await page.locator('.mh-article code').all()) {
      const box = (await code.boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(article.x + article.width + 1);
    }
    const pane = page.locator('.benchmark-pane');
    const small = await pane.evaluate((root) => {
      const out: string[] = [];
      for (const el of root.querySelectorAll<HTMLElement>('button, select, input, [role="tab"]')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || el.closest('[hidden]') || el.classList.contains('cam-backdrop')) continue;
        if (r.height < 44 || (r.width < 44 && el.tagName !== 'INPUT')) out.push(`${el.tagName}.${el.className} ${r.width}x${r.height}`);
      }
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement!;
        if (!n.textContent!.trim() || el.closest('[hidden]') || el.getClientRects().length === 0) continue;
        const size = parseFloat(getComputedStyle(el).fontSize);
        if (size < 12) out.push(`text "${n.textContent!.trim().slice(0, 20)}" ${size}px`);
      }
      return out;
    });
    expect(small).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`macneal-${viewport.width}x${viewport.height}.png`) });
    await page.getByRole('tab', { name: 'Results', exact: true }).click();
    const region = page.getByRole('region', { name: 'Benchmark results' });
    await expect(region).toHaveAttribute('tabindex', '0');
    for (const link of await region.getByRole('link').all()) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({ path: testInfo.outputPath(`macneal-results-${viewport.width}x${viewport.height}.png`) });
  });
}
