export async function loadDiagramGamePage() {
  return (await import('./DiagramGamePage.svelte')).default;
}
