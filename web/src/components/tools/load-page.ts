/** Keep the tools preload graph behind its own route boundary, like research. */
export async function loadToolsPage() {
  return (await import('./ToolsPage.svelte')).default;
}
