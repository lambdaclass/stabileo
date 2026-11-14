export async function loadExamplesPage() {
  return (await import('./ExamplesPage.svelte')).default;
}
