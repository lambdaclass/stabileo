<script lang="ts">
  /**
   * Stabileo Research: the gallery at /research and one page per runnable paper. Loaded as its own
   * chunk by Root.svelte; the experiment's WASM is fetched only when a simulation is started.
   */
  import { applyPageMeta, restorePageMeta } from '../../lib/page-meta';
  import { publicI18n } from '../../lib/i18n/store.svelte';
  import SiteHeader from '../site/SiteHeader.svelte';
  import LandingFooter from '../landing/LandingFooter.svelte';
  import PublicLink from '../landing/PublicLink.svelte';
  import Gallery from './Gallery.svelte';
  import MacnealPage from './macneal1985/MacnealPage.svelte';
  import ShauerPage from './shauer2025/ShauerPage.svelte';
  import '../landing/landing.css';
  import '../blog/blog.css';
  import './research.css';

  let { path }: { path: string } = $props();
  const route = $derived(path.replace(/\/+$/, '') || '/research');

  const PAGES: Record<string, { title: string; description: string }> = {
    '/research': {
      title: 'Stabileo Research — computational mechanics you can run',
      description:
        'A curated catalogue of recent computational-mechanics papers, with the ones Stabileo has reproduced, re-implemented and validated against the authors’ code, runnable in the browser.',
    },
    '/research/benchmarks/macneal-harder-1985': { title: 'MacNeal–Harder (1985) — Stabileo engine benchmarks', description: 'Live production-engine accuracy benchmarks with explicit references, tolerances and failures.' },
    '/research/fracture/shauer-2025': {
      title: 'Phase-field fracture of a notched plate (Shauer 2025) — Stabileo Research',
      description:
        'AT2 phase-field fracture run in the browser by a Rust re-implementation validated step by step against the author’s Python reference code.',
    },
  };

  $effect(() => {
    const meta = PAGES[route];
    if (meta) applyPageMeta({ title: meta.title, description: meta.description, locale: publicI18n.locale, path: route });
    return () => restorePageMeta();
  });
</script>

<div class="landing blog research">
  <SiteHeader current="research" />
  {#if route === '/research'}
    <Gallery />
  {:else if route === '/research/benchmarks/macneal-harder-1985'}
    <MacnealPage />
  {:else if route === '/research/fracture/shauer-2025'}
    <ShauerPage />
  {:else}
    <section class="sec sec--ink">
      <div class="wrap" style="padding-top: 7rem; padding-bottom: 4rem">
        <h1>No such research page</h1>
        <p><PublicLink to="/research">Back to Stabileo Research</PublicLink></p>
      </div>
    </section>
  {/if}
  <LandingFooter />
</div>

<style>
  .research :global(.nav) {
    background: var(--lp-ink);
  }
  .research {
    font-synthesis: none;
    font-variant-numeric: tabular-nums lining-nums;
  }
  .research :global(sub),
  .research :global(sup) {
    font-size: 0.75em;
    line-height: 0;
  }
</style>
