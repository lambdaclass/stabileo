import type { Component } from 'svelte';
import { routeKind } from './public-route';

type Page = Component<{ path: string }>;
const pending = new Map<string, Promise<Page | null>>();

/** Shared by hover, idle warming and both routers. Failed requests can be retried. */
export function loadPublicPage(path: string): Promise<Page | null> {
  const url = new URL(path, 'https://stabileo.com');
  const route = routeKind(url);
  const key = route.path;
  if (!pending.has(key)) {
    const loading = route.kind === 'research'
      ? import('../components/research/load-page').then(m => m.loadResearchPage(key))
      : route.kind === 'tools'
        ? import('../components/tools/load-page').then(m => m.loadToolsPage(key))
        : route.kind === 'blog'
          ? import('../components/blog/BlogPage.svelte').then(m => m.default)
        : route.kind === 'paper'
          ? import('../components/paper/PaperPage.svelte').then(m => m.default)
          : Promise.resolve(null);
    pending.set(key, loading.catch(error => { pending.delete(key); throw error; }));
  }
  return pending.get(key)!;
}

function saveData() {
  return typeof navigator !== 'undefined' && (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
}
export function prefetchPublicPage(path: string) {
  if (!saveData()) void loadPublicPage(path).catch(() => {});
}

/** Svelte action: retains normal anchor semantics and never waits for navigation. */
export function prefetchPublicLink(node: HTMLAnchorElement, path: string) {
  const warm = () => prefetchPublicPage(path);
  const events = ['pointerenter', 'focus', 'touchstart'] as const;
  for (const event of events) node.addEventListener(event, warm, { passive: true });
  return {
    update(next: string) { path = next; },
    destroy() { for (const event of events) node.removeEventListener(event, warm); },
  };
}

export function idlePrefetchPublicPages() {
  if (typeof window === 'undefined' || saveData()) return;
  const warm = () => { prefetchPublicPage('/research'); prefetchPublicPage('/tools'); };
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(warm);
    return () => window.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(warm, 1500);
  return () => window.clearTimeout(id);
}

/** Run after Svelte's DOM commit. Public pages scroll inside .landing. */
export function resetPublicScroll(hash = '') {
  const root = document.querySelector<HTMLElement>('.landing');
  root?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  if (hash) {
    let id = hash.slice(1);
    try { id = decodeURIComponent(id); } catch { /* Treat malformed escapes literally. */ }
    const target = document.getElementById(id);
    if (target && root?.contains(target)) target.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
}

/** Prevent native history restoration from overriding the inner-container reset. */
export function manualPublicScrollRestoration() {
  const previous = history.scrollRestoration;
  history.scrollRestoration = 'manual';
  return () => { history.scrollRestoration = previous; };
}
