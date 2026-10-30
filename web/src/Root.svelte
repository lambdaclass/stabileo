<script lang="ts">
  /**
   * The public pages without the application.
   *
   * The landing, the blog and the standing pages used to be rendered by App.svelte, so every
   * visit to them downloaded and ran the whole application (about 3 MB of JavaScript) and the
   * engine (3 MB of WASM) before the page could settle: Lighthouse measured 6 s of blocked main
   * thread and, on the blog, 19 s to the largest paint. They need none of it.
   *
   * Here they render on their own. An address that is the application's on arrival never gets
   * here: main.ts mounts App.svelte directly, as it always did. From a public page, the
   * application is loaded on the first route that needs it (the landing's "enter the app", a
   * link to /app); from then on App.svelte owns every route, public ones included, as before.
   */
  import SiteHeader from './components/site/SiteHeader.svelte';
  import PublicPending from './components/site/PublicPending.svelte';
  import { loadPublicPage, idlePrefetchPublicPages, resetPublicScroll, manualPublicScrollRestoration } from './lib/public-navigation';
  import { tick } from 'svelte';
  import LandingPage from './components/LandingPage.svelte';
  import { parsePublicPath, publicHref } from './lib/i18n/public-routes';
  import { publicI18n, setLocale, ensureLocale, i18n } from './lib/i18n/store.svelte';
  import { routeKind } from './lib/public-route';
  import { modeToPath } from './lib/app-mode';

  function adoptLocaleFromPath() {
    const { locale } = parsePublicPath(location.pathname);
    if (locale && locale !== publicI18n.locale) setLocale(locale);
  }
  adoptLocaleFromPath();

  let current = $state(routeKind());
  /** Once loaded, the application owns the page. */
  let app = $state<typeof import('./App.svelte').default | null>(null);
  let loading: Promise<void> | null = null;

  let pages = $state<Partial<Record<'research' | 'tools' | 'paper' | 'blog', import('svelte').Component<{ path: string }>>>>({});
  let revision = 0;
  $effect(() => idlePrefetchPublicPages());
  $effect(manualPublicScrollRestoration);

  function loadApp() {
    // A lazily loaded language must be registered before the application's modules run: some name things as they load.
    loading ??= ensureLocale(i18n.locale).then(() => import('./load-app').then(m => m.loadApplication())).then(async (m) => {
      app = m.default;
      // Tell main.ts the application is up: it installs the browser-test hooks then (in an
      // e2e build only), so that "the hooks are there" still means "the application is up".
      await tick();
      window.dispatchEvent(new CustomEvent('stabileo-app-ready'));
    });
    return loading;
  }

  async function sync() {
    const token = ++revision;
    const next = routeKind();
    const hash = location.hash;
    try {
      if (next.kind === 'app') { await loadApp(); return; }
      const page = await loadPublicPage(location.href);
      if (token !== revision) return;
      if (page && (next.kind === 'research' || next.kind === 'tools' || next.kind === 'paper' || next.kind === 'blog')) pages[next.kind] = page;
      adoptLocaleFromPath();
      current = next;
      await tick();
      if (token === revision) resetPublicScroll(hash);
    } catch (error) {
      // Keep the rendered page usable after a failed chunk request.
      console.error('Public navigation failed', error);
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
    sync();
  }
  function onPopState() {
    if (!app) sync();
  }
  $effect(() => {
    window.addEventListener('stabileo-navigate', onNavigate);
    window.addEventListener('stabileo-enter-app', onEnterApp);
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('stabileo-navigate', onNavigate);
      window.removeEventListener('stabileo-enter-app', onEnterApp);
      window.removeEventListener('popstate', onPopState);
    };
  });
</script>

{#if !app && current.kind !== 'app'}
  <SiteHeader path={current.path} />
{/if}

{#if app}
  {@const App = app}
  <App />
{:else if current.kind === 'research' || current.kind === 'tools' || current.kind === 'paper' || current.kind === 'blog'}
  {@const Page = pages[current.kind]}
  {#if Page}<Page path={current.path} />{:else}<PublicPending kind={current.kind} />{/if}
{:else if current.kind === 'landing'}
  <LandingPage />
{/if}
