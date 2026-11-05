import { tick } from 'svelte';

/** Public pages scroll inside `.landing`, which a page keeps across its own routes (the research gallery and each paper). */
export async function resetPublicScroll() {
  await tick();
  const root = document.querySelector<HTMLElement>('#app .landing');
  let id = location.hash.slice(1);
  try { id = decodeURIComponent(id); } catch { /* a malformed escape is read literally */ }
  const target = id ? document.getElementById(id) : null;
  root?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  if (target && root?.contains(target)) target.scrollIntoView({ block: 'start', behavior: 'instant' });
}
