/** Keep the tools preload graph behind its own route boundary, like research. */
export async function loadToolsPage(path = '/tools') {
  const [page] = await Promise.all([import('./ToolsPage.svelte'), import('./load-detail').then(m => m.loadToolDetail(path))]);
  return page.default;
}
