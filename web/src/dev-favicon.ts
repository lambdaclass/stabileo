/*
 * The yellow triangle, so a tab on the dev server is never mistaken for production.
 *
 * ── Why a build-time flag ──
 *
 * This used to be an inline script in index.html testing `location.hostname`, and
 * `scripts/prerender.ts` drives the BUILT app from a local HTTP server: the script
 * fired, the capture of `document.head` happened afterwards, and all nineteen
 * prerendered pages shipped `/favicon-dev.svg` to stabileo.com.
 *
 * `import.meta.env.DEV` is statically replaced by Vite, so this whole block is
 * eliminated from `npm run build`. Nothing that does not exist in the bundle can be
 * photographed by a browser driving it — which is the property
 * `no-dev-assets-in-build.test.ts` asserts, against a real build.
 *
 * ── What "dev" means here, precisely ──
 *
 * DEV is true for `npm run dev` and false for anything built, INCLUDING
 * `npm run preview` and Playwright's preview server. A preview tab is a production
 * bundle and shows the production mark; that is the honest reading, since preview
 * exists to show you what ships. Only the dev server gets the yellow triangle.
 *
 * ── Why the icon is inlined ──
 *
 * As a file under `public/` it was copied verbatim into `dist/` and deployed — live
 * at stabileo.com/favicon-dev.svg — which is exactly the "nothing local-only in the
 * build" rule this module exists to serve. Inlined, there is no artifact to leak:
 * the data URI lives inside the branch that DEV eliminates.
 *
 * Imported FIRST by main.ts, before the CSS and App imports. ES module imports are
 * hoisted and run in order, so this executes before the dev server has to resolve
 * hundreds of unbundled modules — otherwise the tab paints the production icon and
 * visibly flips to yellow seconds later.
 */

const DEV_ICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
      '<polygon points="16,2 30,28 2,28" fill="#ffd700" stroke="#e6a800" ' +
      'stroke-width="2" stroke-linejoin="round"/>' +
      '</svg>',
  );

if (import.meta.env.DEV) {
  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (icon) icon.href = DEV_ICON;
}
