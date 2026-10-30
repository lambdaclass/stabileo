import { test, expect } from '@playwright/test';

const expectations = {
  en: { title: 'Cite this', noSnapshot: 'This build has no permanent link yet; cite the commit below.', version: 'Experiment version', name: 'Phase-field fracture of a notched plate', reproduction: 'Reproduction of', engine: 'engine WASM SHA-256', experiment: 'experiment WASM SHA-256' },
  es: { title: 'Cómo citar', noSnapshot: 'Esta versión todavía no tiene enlace permanente propio; citá el commit de abajo.', version: 'Versión del experimento', name: 'Fractura por campo de fase de una placa entallada', reproduction: 'Reproducción de', engine: 'WASM del motor SHA-256', experiment: 'WASM del experimento SHA-256' },
  pt: { title: 'Como citar', noSnapshot: 'Esta versão ainda não tem link permanente próprio; cite o commit abaixo.', version: 'Versão do experimento', name: 'Fratura por campo de fase de uma placa entalhada', reproduction: 'Reprodução de', engine: 'WASM do motor SHA-256', experiment: 'WASM do experimento SHA-256' },
};

test.describe('@smoke research cite', () => {
  for (const [locale, strings] of Object.entries(expectations)) test(`${locale}: Cite this gives the commit, the hashes, the version and the DOI, as text and BibTeX`, async ({ page }) => {
    await page.route('**/@/', route => route.fulfill({ status: 404, body: '' }));
    await page.goto(`/${locale}/research/fracture/shauer-2025/`);
    const cite = page.locator('section.rs-citethis');
    await expect(cite.getByRole('heading', { name: strings.title })).toBeVisible();
    await expect(page.getByTestId('cite-permalink')).toContainText(strings.noSnapshot);
    await expect(cite).toContainText(strings.version);
    await expect(cite.getByRole('link', { name: 'doi:10.1016/j.advengsoft.2025.104013' })).toBeVisible();
    const text = await page.getByTestId('cite-text').textContent();
    expect(text).toMatch(/^Stabileo Research \(\d{4}\)\. /);
    expect(text).toContain(`${strings.name}, ${strings.version.toLocaleLowerCase(locale)} 1. ${strings.reproduction} `);
    const commit = await cite.locator('dd a code').textContent();
    expect(commit).toMatch(/^[0-9a-f]{12,40}$/);
    const hashes = await cite.locator('dd code[title]').evaluateAll(nodes => nodes.map(node => node.getAttribute('title')!));
    expect(hashes).toHaveLength(2);
    for (const hash of hashes) expect(hash).toMatch(/^[0-9a-f]{64}$/);
    for (const format of ['cite-text', 'cite-bibtex']) {
      const output = page.getByTestId(format);
      await expect(output).toContainText(`Stabileo commit ${commit}`);
      await expect(output).toContainText(`${strings.engine} ${hashes[0]}`);
      await expect(output).toContainText(`${strings.experiment} ${hashes[1]}`);
      await expect(output).toContainText('doi:10.1016/j.advengsoft.2025.104013');
    }
    await expect(page.getByTestId('cite-bibtex')).toContainText('@misc{stabileo-shauer-2025-v1,');
  });
});

test('@smoke Cite this selects the latest matching experiment version', async ({ page }) => {
  const entry = (short: string, version: number, date: string) => ({
    short, commit: short.repeat(5) + '00000', date, url: `/@${short}/`,
    research: ['/research/fracture/shauer-2025'],
    experimentVersions: { 'shauer-2025': { version, date, commit: null } },
    engineWasmSha256: 'a'.repeat(64), researchWasmSha256: { 'shauer-2025': 'b'.repeat(64) },
  });
  await page.route('**/@/', route => route.fulfill({ json: { snapshots: [
    entry('ccccccc', 2, '2026-11-03'), entry('bbbbbbb', 1, '2026-11-02'), entry('aaaaaaa', 1, '2026-11-01'),
  ] } }));
  await page.goto('/en/research/fracture/shauer-2025/');
  await expect(page.getByTestId('cite-permalink')).toContainText('/@bbbbbbb/');
  await expect(page.getByTestId('cite-text')).toContainText('experiment version 1');
  for (const format of ['cite-text', 'cite-bibtex']) {
    await expect(page.getByTestId(format)).toContainText(`Stabileo commit ${'bbbbbbb'.repeat(5)}00000`);
    await expect(page.getByTestId(format)).toContainText(`engine WASM SHA-256 ${'a'.repeat(64)}`);
    await expect(page.getByTestId(format)).toContainText(`experiment WASM SHA-256 ${'b'.repeat(64)}`);
    await expect(page.getByTestId(format)).toContainText('doi:10.1016/j.advengsoft.2025.104013');
  }
  await expect(page.getByTestId('cite-bibtex')).toContainText('@misc{stabileo-shauer-2025-v1,');
});
