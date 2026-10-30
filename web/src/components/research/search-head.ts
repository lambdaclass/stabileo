/** On SPA navigation, read build-only metadata from the destination HTML, never a JS catalog. */
export async function loadSearchHead(href: string, signal: AbortSignal) {
  if (document.querySelector(`script[data-search-path="${href}"]`)) return;
  try {
    const response = await fetch(href, { signal });
    if (!response.ok) return;
    const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
    if (signal.aborted || !parsed.querySelector(`script[data-search-path="${href}"]`)) return;
    const selectors = 'title, meta[name="description"], meta[property^="og:"], meta[name^="twitter:"], link[rel="canonical"], link[hreflang], script[type="application/ld+json"]';
    document.head.querySelectorAll(selectors).forEach(el => el.remove());
    parsed.head.querySelectorAll(selectors).forEach(el => document.head.appendChild(document.importNode(el, true)));
  } catch (error) {
    if (!signal.aborted) console.warn('Could not load page metadata', error);
  }
}
