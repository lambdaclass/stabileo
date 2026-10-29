// FIRST, deliberately: the dev-only favicon swap must run before the dev server
// resolves the CSS and component graph, or the tab paints the production icon and
// flips seconds later. Eliminated from production builds — see the module.
import './dev-favicon';
import './styles/tokens.css';
// After the tokens, which it reads, and global because the rows it governs
// live in several components with scoped styles. See the file's own header.
import './styles/touch-density.css';
import './styles/pro-kit.css';
import './styles/panel-scrollbars.css';
import 'katex/dist/katex.min.css';
import Root from './Root.svelte';
import { mount } from 'svelte';
import { routeKind, restoreRedirectedRoute } from './lib/public-route';
import { i18n, ensureLocale } from './lib/i18n/store.svelte';

/*
 * The prerendered page steps aside as the application takes over.
 *
 * `scripts/prerender.ts` writes real HTML for every public route so a crawler
 * gets content and a 200 instead of the 404 this static host used to answer.
 * That markup lives in its own element rather than inside #app, because Svelte
 * would append to #app and the reader would briefly see the page twice.
 *
 * It is NOT hydrated. The markup was captured from a running browser, so it
 * carries none of the anchors hydration needs, and pretending otherwise would
 * produce a subtly wrong DOM. Removing it costs one paint and keeps the
 * rendered result the app's own — the prerender is a photograph for machines,
 * never a second implementation of the page.
 */
document.getElementById('prerender')?.remove();

// Browser-test hooks — BUILD-TIME GATED.
//
// `import.meta.env.VITE_E2E` is statically replaced by Vite, so in a normal
// `npm run build` this condition becomes `undefined === '1'` and the whole block —
// including the dynamic import — is eliminated. The production bundle therefore does
// not contain the hook module at all, and appending `?e2e=1` to a production URL
// cannot expose `window.__stabileo`.
//
// The hooks additionally require `?e2e=1` at runtime (see e2e-hooks.ts), so both gates
// must hold. Playwright's webServer sets VITE_E2E=1 for its build.
function installTestHooks() {
  if (import.meta.env.VITE_E2E === '1') {
    void import('./lib/utils/e2e-hooks').then((m) => m.installE2EHooks());
  }
}

/*
 * The application, or the public pages without it.
 *
 * An address that is the application's (`/app/…`, `?embed`, a shared model) mounts App.svelte
 * at once, as it always did, and the browser-test hooks with it. Any other address mounts
 * Root.svelte, which renders the landing and the blog without downloading the application
 * (3 MB of JavaScript and 3 MB of WASM they used to wait on) and loads it when asked.
 */
restoreRedirectedRoute();
const target = document.getElementById('app')!;
let app: ReturnType<typeof mount>;
if (routeKind().kind === 'app') {
  await ensureLocale(i18n.locale);
  const { default: App } = await import('./App.svelte');
  app = mount(App, { target });
  installTestHooks();
} else {
  app = mount(Root, { target });
  // From a public page the application loads in place (Root.svelte), and says so when it is up.
  window.addEventListener('stabileo-app-ready', installTestHooks, { once: true });
}

export default app;
