<script lang="ts">
  import SiteHeader from './components/site/SiteHeader.svelte';
  import EditorPending from './components/site/EditorPending.svelte';
  import PublicPending from './components/site/PublicPending.svelte';
  import { loadPublicPage, idlePrefetchPublicPages, resetPublicScroll, manualPublicScrollRestoration } from './lib/public-navigation';
  import { tick } from 'svelte';
  import { parsePublicPath, publicHref } from './lib/i18n/public-routes';
  import { publicI18n, setLocale, ensureLocale, ensurePublicLocale, i18n } from './lib/i18n/store.svelte';
  import { routeKind } from './lib/public-route';
  import { restoreMovedRoute } from './lib/legacy-routes';
  import { modeToPath } from './lib/app-mode';

  function adoptLocaleFromPath() {
    const { locale } = parsePublicPath(location.pathname);
    if (locale && locale !== publicI18n.locale) setLocale(locale);
  }
  if (routeKind().kind !== 'app') adoptLocaleFromPath();

  let current = $state(routeKind());
  // A page served by the fallback carries the landing's head, whose structured data would describe the landing until this page's chunk states its own.
  if (!document.querySelector(`link[hreflang][href*="${location.pathname}"]`)) document.querySelector('[type$=json]')?.remove();
  /** Once loaded, the application owns the page. */
  let app = $state<typeof import('./App.svelte').default | null>(null);

  let pages = $state<Partial<Record<'research' | 'tools' | 'examples' | 'game' | 'paper' | 'blog' | 'register' | 'landing', import('svelte').Component<{ path: string }>>>>({});
  let revision = 0;
  let failed = $state(false);
  $effect(() => { if (!app && current.kind !== 'landing' && current.kind !== 'app') return idlePrefetchPublicPages(); });
  $effect(() => { if (!app && current.kind !== 'app') return manualPublicScrollRestoration(); });

  async function loadApp() {
    const [, loader] = await Promise.all([ensureLocale(i18n.locale), import('./load-app')]);
    return loader.loadApplication();
  }

  function onEditorIntent() {
    if (!app) void loadApp().catch(() => {});
  }

  async function sync(afterActivation = false) {
    const token = ++revision;
    if (__PUBLIC_FEATURES__.tools || __PUBLIC_FEATURES__.diagramGame) restoreMovedRoute();
    if (location.pathname.startsWith('/hu/')) {
      const { restoreUnpublishedResearchRoute } = await import('./lib/research-fallback');
      if (token !== revision) return;
      restoreUnpublishedResearchRoute();
    }
    const next = routeKind();
    const hash = location.hash;
    try {
      if (next.kind === 'app') {
        if (afterActivation) {
          await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          if (token !== revision) return;
        }
        current = next;
        failed = false;
        await tick();
        const application = await loadApp();
        if (token !== revision) return;
        app = application.default;
        await tick();
        window.dispatchEvent(new CustomEvent('stabileo-app-ready'));
        return;
      }
      const [page] = await Promise.all([loadPublicPage(location.href), ensurePublicLocale(parsePublicPath(location.pathname).locale ?? publicI18n.locale).catch((err) => { if (token > 1) throw err; })]);
      if (token !== revision) return;
      failed = false;
      if (page) pages[next.kind] = page;
      adoptLocaleFromPath();
      current = next;
      await tick();
      if (token === revision) resetPublicScroll(hash);
    } catch (error) {
      console.error('Navigation failed', error);
      if (token !== revision) return;
      if (next.kind !== 'app' && token > 1) { location.reload(); return; }
      current = next;
      failed = true;
      document.getElementById('prerender')?.remove();
      if (next.kind !== 'app') window.addEventListener('online', () => void sync(), { once: true });
    }
  }
  $effect(() => { void sync(); });

  // Until the application is up, the public pages' own navigation comes through here
  // (`landing-utils.ts`); App.svelte listens for the same events once it is mounted.
  function onNavigate(e: Event) {
    if (app) return;
    const path = (e as CustomEvent<string>).detail;
    if (typeof path !== 'string') return;
    history.pushState(null, '', publicHref(path, publicI18n.locale));
    sync();
  }
  function onEnterApp() {
    if (app) return;
    // App.svelte decides its mode from the address, so the address goes first: the one App's own
    // enterApp() pushes from a public page.
    if (routeKind().kind !== 'app') {
      const e2e = new URLSearchParams(location.search).get('e2e') === '1' ? '?e2e=1' : '';
      history.pushState(null, '', modeToPath('basico') + e2e);
    }
    void sync(true);
  }
  function onPopState() {
    if (!app) sync();
  }
  $effect(() => {
    window.addEventListener('stabileo-navigate', onNavigate);
    window.addEventListener('stabileo-enter-app', onEnterApp);
    window.addEventListener('stabileo-prefetch-app', onEditorIntent);
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('stabileo-navigate', onNavigate);
      window.removeEventListener('stabileo-enter-app', onEnterApp);
      window.removeEventListener('stabileo-prefetch-app', onEditorIntent);
      window.removeEventListener('popstate', onPopState);
    };
  });
</script>

{#if !app && current.kind !== 'app' && !(__PUBLIC_FEATURES__.accounts && current.kind === 'register')}
  <SiteHeader path={current.path} />
{/if}

{#if app}
  {@const App = app}
  <App />
{:else if current.kind === 'app'}
  <EditorPending {failed} />
{:else if current.kind === 'research' || current.kind === 'tools' || current.kind === 'examples' || (__PUBLIC_FEATURES__.diagramGame && current.kind === 'game') || current.kind === 'paper' || current.kind === 'blog' || (__PUBLIC_FEATURES__.accounts && current.kind === 'register')}
  {@const Page = pages[current.kind]}
  {#if Page}<Page path={current.path} />{:else}<PublicPending kind={current.kind} {failed} />{/if}
{:else if current.kind === 'landing' && pages.landing}
  {@const Landing = pages.landing}
  <Landing path={current.path} />
{:else if failed}
  <PublicPending kind={current.kind} failed />
{/if}
