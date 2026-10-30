/** Keep public experiment routing and preload lists outside the application entry. */
export async function loadExperimentPage() {
  return (await import('./ExperimentPage.svelte')).default;
}
