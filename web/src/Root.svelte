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
  import { tick } from 'svelte';
  import LandingPage from './components/LandingPage.svelte';
  import BlogPage from './components/blog/BlogPage.svelte';
  import { parsePublicPath, publicHref } from './lib/i18n/public-routes';
  import { publicI18n, setLocale, ensureLocale, i18n } from './lib/i18n/store.svelte';
  import { routeKind } from './lib/public-route';
  import { modeToPath } from './lib/app-mode';

  /** The page this address is (`lib/public-route.ts`, which main.ts reads too). */
  const route = () => routeKind();

  function adoptLocaleFromPath() {
    const { locale } = parsePublicPath(location.pathname);
    if (locale && locale !== publicI18n.locale) setLocale(locale);
  }
  adoptLocaleFromPath();

  let current = $state(route());
  /** Once loaded, the application owns the page. */
  let app = $state<typeof import('./App.svelte').default | null>(null);
  let loading: Promise<void> | null = null;

  /** Stabileo Research is its own chunk: the landing and the blog never download it. */
  let research = $state<typeof import('./components/research/ResearchPage.svelte').default | null>(null);
  $effect(() => {
    if (current.kind === 'research' && !research) {
      void import('./components/research/load-page')
        .then((m) => m.loadResearchPage())
        .then((page) => (research = page));
    }
  });

  /** The paper, with KaTeX, is its own chunk too. */
  let paper = $state<typeof import('./components/paper/PaperPage.svelte').default | null>(null);
  $effect(() => {
    if (current.kind === 'paper' && !paper) {
      void import('./components/paper/PaperPage.svelte').then((m) => (paper = m.default));
    }
  });

  function loadApp() {
    // A lazily loaded language must be registered before the application's modules run: some name things as they load.
    loading ??= ensureLocale(i18n.locale).then(() => import('./App.svelte')).then(async (m) => {
      app = m.default;
      // Tell main.ts the application is up: it installs the browser-test hooks then (in an
      // e2e build only), so that "the hooks are there" still means "the application is up".
      await tick();
      window.dispatchEvent(new CustomEvent('stabileo-app-ready'));
    });
    return loading;
  }

  function sync() {
    adoptLocaleFromPath();
    current = route();
    if (current.kind === 'app') void loadApp();
  }
  if (route().kind === 'app') void loadApp();

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
    if (route().kind !== 'app') history.pushState(null, '', modeToPath('basico'));
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

{#if app}
  {@const App = app}
  <App />
{:else if current.kind === 'blog'}
  <BlogPage path={current.path} />
{:else if current.kind === 'research'}
  {#if research}
    {@const Research = research}
    <Research path={current.path} />
  {/if}
{:else if current.kind === 'paper'}
  {#if paper}
    {@const Paper = paper}
    <Paper />
  {/if}
{:else if current.kind === 'landing'}
  <LandingPage />
{/if}
