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
import './styles/mobile-sheet.css';
import 'katex/dist/katex.min.css';
import Root from './Root.svelte';
import { mount } from 'svelte';
import { routeKind, restoreRedirectedRoute } from './lib/public-route';
import { restoreMovedRoute } from './lib/legacy-routes';
import { i18n, ensurePublicLocale, warnLocaleLoadFailure } from './lib/i18n/store.svelte';
import { parsePublicPath } from './lib/i18n/public-routes';
import { accounts } from './lib/features';

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

async function bootstrap() {
  restoreRedirectedRoute();
  if (__PUBLIC_FEATURES__.tools || __PUBLIC_FEATURES__.diagramGame) restoreMovedRoute();
  if (__PUBLIC_FEATURES__.accounts && accounts()) void import('./lib/tracking/tracking').then(m => m.startTracking());
  const target = document.getElementById('app')!;
  window.addEventListener('stabileo-app-ready', installTestHooks, { once: true });
  if (routeKind().kind === 'app') {
    document.getElementById('prerender')?.remove();
    document.documentElement.classList.add('app-boot');
    return mount(Root, { target });
  }
  const startLocale = parsePublicPath(location.pathname).locale ?? i18n.locale;
  await ensurePublicLocale(startLocale).catch((err) => {
    warnLocaleLoadFailure(startLocale, err);
    window.addEventListener('online', () => void ensurePublicLocale(startLocale).catch(() => {}), { once: true });
  });
  return mount(Root, { target });
}

export default bootstrap();
