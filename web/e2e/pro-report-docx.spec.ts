import { readFileSync } from 'node:fs';
import { strFromU8, unzipSync } from 'fflate';
import type { Page } from '@playwright/test';
import { test, expect, loadModel, solveModel } from './fixtures';

const LOGO = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAICAYAAADwdn+XAAAAH0lEQVR42mNkYPhfz0AEYBxVSF+FjP///2dgYGBgAAB+qAf/1xH4twAAAABJRU5ErkJggg==', 'base64');

async function download(page: Page, format: 'html' | 'docx') {
  await page.getByTestId('pp-export-report').click();
  const dialog = page.getByTestId('pro-report-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId(`rpt-format-${format}`).click();
  const wait = page.waitForEvent('download');
  await dialog.getByTestId('rpt-pdf').click();
  const dl = await wait;
  return { name: dl.suggestedFilename(), bytes: readFileSync((await dl.path())!) };
}

test.describe('@slow the calculation report in Word', () => {
  test.describe.configure({ timeout: 240_000 });

  test('carries the same tables, figures and choices as the report, with its letterhead, header and page numbers', async ({ pro: page }) => {
    await loadModel(page, 'mat-foundation');
    await solveModel(page);
    await page.getByTestId('pr-project').click();

    await page.getByTestId('pp-export-report').click();
    const dialog = page.getByTestId('pro-report-dialog');
    await dialog.getByTestId('rpt-project').locator('summary').click();
    await dialog.getByTestId('rpt-logo-file').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: LOGO });
    await dialog.getByPlaceholder(/Company name|Nombre de la empresa/).fill('Estudio Sur');
    await dialog.getByPlaceholder(/Company name|Nombre de la empresa/).press('Tab');
    await dialog.getByTestId('rpt-mode-reactions').selectOption('table');
    await dialog.getByTestId('rpt-mode-displacements').selectOption('figure');
    await page.keyboard.press('Escape');

    const html = (await download(page, 'html')).bytes.toString('utf8');
    const docx = await download(page, 'docx');
    expect(docx.name).toMatch(/\.docx$/);
    const z = unzipSync(new Uint8Array(docx.bytes));
    const doc = strFromU8(z['word/document.xml']!);

    expect((doc.match(/<w:tbl>/g) ?? []).length).toBe((html.match(/<table\b/g) ?? []).length);
    const captions = [...html.matchAll(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/g)].map((m) => m[1]!.replace(/<[^>]+>/g, '').trim());
    expect(captions.length).toBeGreaterThan(1);
    expect(Object.keys(z).filter((k) => k.startsWith('word/media/'))).toHaveLength(captions.length + 1);
    for (const c of captions) expect(doc).toContain(c.replace(/&amp;/g, '&amp;'));
    expect(doc).toContain('Estudio Sur');
    expect(doc).toContain('<w:vertAlign w:val="subscript"/>');
    expect(strFromU8(z['word/header1.xml']!)).toMatch(/Stabileo \S+ · /);
    const footer = strFromU8(z['word/footer1.xml']!);
    expect(footer).toContain(' PAGE ');
    expect(footer).toContain(' NUMPAGES ');
    expect(doc).toContain('<w:titlePg/>');
    expect(doc.match(/<w:t xml:space="preserve">(Procedencia|Provenance)<\/w:t>/g) ?? [], 'the provenance block, once').toHaveLength(1);
    // Design is off: the cover does not claim a design check the report does not carry.
    expect(doc).not.toMatch(/Verificación según CIRSOC|Verification per CIRSOC/);
  });
});
