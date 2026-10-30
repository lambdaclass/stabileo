/**
 * Keep the research dependency list inside a research-only chunk. Importing ResearchPage
 * directly from Root/App lets Vite embed its transitive preload list in those product
 * chunks; each paper can then grow them even though its data is loaded lazily.
 * This entry has no static imports, so the product only knows this one lazy chunk.
 */
export async function loadResearchPage() {
  return (await import('./ResearchPage.svelte')).default;
}
