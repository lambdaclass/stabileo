/** Keep App's changing preload dependency list out of the public entry bundle. */
export async function loadApplication() {
  return import('./App.svelte');
}
