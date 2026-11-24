/** Keep the tools preload graph behind its own route boundary, like research. */
import { tools } from '../../lib/features';

export async function loadToolsPage(path = '/tools') {
  if (!__PUBLIC_FEATURES__.tools || !tools()) {
    const [page] = await Promise.all([import('./MainToolsPage.svelte'), import('./load-main-detail').then(m => m.loadToolDetail(path))]);
    return page.default;
  }
  const [page] = await Promise.all([import('./ToolsPage.svelte'), import('./load-detail').then(m => m.loadToolDetail(path))]);
  return page.default;
}
