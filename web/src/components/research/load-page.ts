/**
 * Keep the research dependency list inside a research-only chunk. Importing ResearchPage
 * directly from Root/App lets Vite embed its transitive preload list in those product
 * chunks; each paper can then grow them even though its data is loaded lazily.
 * This entry has no static imports, so the product only knows this one lazy chunk.
 */
export async function loadResearchPage(path = '/research') {
  const [page] = await Promise.all([import('./ResearchPage.svelte'), import('./load-detail').then(m => m.loadResearchDetail(path))]);
  return page.default;
}
