import { test, expect } from '@playwright/test';

/**
 * Cite this on a research page of the plain site (src/components/research/shell/CiteThis.svelte).
 * The preview server has no snapshot index (/@/), so the page says no permanent version exists yet
 * and cites the commit; the snapshot build's own suite (snapshot-e2e/) covers the permanent link.
 */
test.describe('@smoke research cite', () => {
  test('Cite this gives the commit, the hashes, the version and the DOI, as text and BibTeX', async ({ page }) => {
    await page.goto('/en/research/fracture/shauer-2025/');
    const cite = page.locator('section.rs-citethis');
    await expect(cite.getByRole('heading', { name: 'Cite this' })).toBeVisible();
    await expect(page.getByTestId('cite-permalink')).toContainText('No permanent version of this experiment exists yet');
    await expect(cite).toContainText('Experiment version');
    await expect(cite.getByRole('link', { name: 'doi:10.1016/j.advengsoft.2025.104013' })).toBeVisible();
    const text = await page.getByTestId('cite-text').textContent();
    expect(text).toMatch(/^Stabileo Research \(\d{4}\)\. Phase-field fracture of a notched plate, experiment version 1\. Reproduction of /);
    expect(text).toMatch(/Stabileo commit [0-9a-f]{7,}/);
    expect(text).toMatch(/engine WASM SHA-256 [0-9a-f]{64}/);
    expect(text).toMatch(/experiment WASM SHA-256 [0-9a-f]{64}/);
    await expect(page.getByTestId('cite-bibtex')).toContainText('@misc{stabileo-shauer-2025-v1,');
  });
});
