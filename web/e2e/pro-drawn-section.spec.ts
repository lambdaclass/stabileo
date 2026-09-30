/**
 * PRO 10/10: a section drawn from parts, from the sections tab. The properties are pinned in the
 * unit suites; this checks that the editor is reachable, that its controls drive the drawing, and
 * that what is applied is what reopens.
 */
import { test, expect, PRO_URL } from './fixtures';
import type { Page } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 800 } });

const sections = async (page: Page) =>
  ((await page.evaluate(() => window.__stabileo.entityData('setting', 'sections'))) as Array<[number, any]>).map(([, s]) => s);

async function openDraw(page: Page) {
  await page.goto(PRO_URL);
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-sections').click();
  await page.getByTestId('pro-open-section-modal').click();
  await page.getByTestId('section-division-build').click();
  await page.getByTestId('build-mode-draw').click();
  await expect(page.getByTestId('drawn-editor')).toBeVisible();
}

test.describe('@smoke PRO drawn sections', () => {
  test('a welded I with a cover plate attached on top, applied and reopened', async ({ page }) => {
    await openDraw(page);
    await expect(page.getByTestId('drawn-part-shape')).toHaveCount(3);
    await expect(page.getByTestId('drawn-prop-a')).toBeVisible();
    await expect(page.getByTestId('drawn-centroid')).toBeVisible();
    await expect(page.getByTestId('drawn-shear-centre')).toBeVisible();
    const a0 = await page.getByTestId('drawn-prop-a').locator('td').first().textContent();

    await page.getByTestId('drawn-add-rect').click();
    await expect(page.getByTestId('drawn-part-shape')).toHaveCount(4);
    await page.getByTestId('drawn-b').fill('300');
    await page.getByTestId('drawn-b').blur();
    await page.getByTestId('drawn-attach-target').selectOption('1');
    await page.getByTestId('drawn-attach-side').selectOption('top');
    await page.getByTestId('drawn-attach').click();
    await expect(page.getByTestId('drawn-issues')).toHaveCount(0);
    await expect(page.getByTestId('drawn-prop-a').locator('td').first()).not.toHaveText(a0!);

    await page.getByTestId('drawn-name').fill('I 500 + PL');
    await page.getByTestId('section-apply').click();
    const list = await sections(page);
    const sec = list.find((s: any) => s.name === 'I 500 + PL');
    expect(sec.drawn.parts).toHaveLength(4);
    const stored = await page.evaluate((id) => window.__stabileo.entityData('section', id), sec.id) as any;
    expect(stored.canonical.kind).toBe('geometry-backed');

    await page.getByTestId(`pro-sec-edit-drawn-${sec.id}`).click();
    await expect(page.getByTestId('drawn-part-shape')).toHaveCount(4);
    await expect(page.getByTestId('drawn-name')).toHaveValue('I 500 + PL');
  });

  test('a hole outside the section is flagged and Apply is refused', async ({ page }) => {
    await openDraw(page);
    await page.getByTestId('drawn-add-hole').click();
    await page.getByTestId('drawn-y').fill('2000');
    await page.getByTestId('drawn-y').blur();
    await expect(page.getByTestId('drawn-issues')).toBeVisible();
    await expect(page.getByTestId('section-apply')).toBeDisabled();
  });

  test('a DXF outline comes in as a part with its hole', async ({ page }) => {
    await openDraw(page);
    const line = (x1: number, y1: number, x2: number, y2: number) => `0\nLINE\n8\n0\n10\n${x1}\n20\n${y1}\n30\n0\n11\n${x2}\n21\n${y2}\n31\n0`;
    const box = (a: number, b: number, c: number, d: number) => [line(a, b, c, b), line(c, b, c, d), line(c, d, a, d), line(a, d, a, b)].join('\n');
    const text = `0\nSECTION\n2\nENTITIES\n${box(0, 0, 200, 300)}\n${box(10, 10, 190, 290)}\n0\nENDSEC\n0\nEOF`;
    await page.getByTestId('drawn-dxf').setInputFiles({ name: 'tube.dxf', mimeType: 'application/dxf', buffer: Buffer.from(text) });
    await expect(page.getByTestId('drawn-import-note')).toContainText('2');
    await expect(page.getByTestId('drawn-part-shape')).toHaveCount(2);
    // 200 × 300 less 180 × 280 mm.
    await expect(page.getByTestId('drawn-prop-a').locator('td').first()).toHaveText('96');
  });
});
