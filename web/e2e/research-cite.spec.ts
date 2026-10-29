import { test, expect } from '@playwright/test';

import { citeStrings } from '../src/components/research/shell/cite-i18n';

test.describe('@smoke research cite', () => {
  for (const locale of ['en', 'es', 'pt']) test(`${locale}: Cite this gives the commit, the hashes, the version and the DOI, as text and BibTeX`, async ({ page }) => {
    const strings = citeStrings(locale);
    await page.route('**/@/', route => route.fulfill({ status: 404, body: '' }));
    await page.goto(`/${locale}/research/fracture/shauer-2025/`);
    const cite = page.locator('section.rs-citethis');
    await expect(cite.getByRole('heading', { name: strings.title })).toBeVisible();
    await expect(page.getByTestId('cite-permalink')).toContainText(strings.noSnapshot);
    await expect(cite).toContainText(strings.version);
    await expect(cite.getByRole('link', { name: 'doi:10.1016/j.advengsoft.2025.104013' })).toBeVisible();
    const text = await page.getByTestId('cite-text').textContent();
    expect(text).toMatch(/^Stabileo Research \(\d{4}\)\. Phase-field fracture of a notched plate, experiment version 1\. Reproduction of /);
    expect(text).toMatch(/Stabileo commit [0-9a-f]{7,}/);
    expect(text).toMatch(/engine WASM SHA-256 [0-9a-f]{64}/);
    expect(text).toMatch(/experiment WASM SHA-256 [0-9a-f]{64}/);
    await expect(page.getByTestId('cite-bibtex')).toContainText('@misc{stabileo-shauer-2025-v1,');
  });
});
