<script lang="ts">
  import { loadedResearchDetails } from './load-detail';
  import { rs } from './i18n';
  /**
   * Stabileo Research: the gallery at /research and one page per runnable paper. Loaded as its own
   * chunk by Root.svelte; the experiment's WASM is fetched only when a simulation is started.
   */
  import { applyPageMeta, restorePageMeta } from '../../lib/page-meta';
  import { publicI18n, type PublicLocale } from '../../lib/i18n/store.svelte';
  import { EXPERIMENTS } from './experiments';
  import { paperHead } from './head.svelte';
  import { RESEARCH_GALLERY } from './locales';
  import { publishedLocales } from '../../lib/i18n/published';
  import { galleryGraph, paperMeta } from './meta';
  import LandingFooter from '../landing/LandingFooter.svelte';
  import PublicLink from '../landing/PublicLink.svelte';
  import Gallery from './Gallery.svelte';
  import RelatedLinks from './RelatedLinks.svelte';
  import '../viewport/scalar-viewer-i18n';
  import '../landing/landing.css';
  import '../blog/blog.css';
  import './research.css';

  let { path }: { path: string } = $props();
  const route = $derived(path.replace(/\/+$/, '') || '/research');

  $effect(() => {
    const locale = publicI18n.locale;
    const strings = rs();
    const labels = { research: strings.research, researchTitle: strings.researchTitle };
    const head = paperHead.current;
    const paperPath = head ? EXPERIMENTS.find((e) => e.paperId === head.paperId)?.path : undefined;
    if (route === RESEARCH_GALLERY) {
      applyPageMeta({ title: `${strings.researchTitle} — Stabileo Research`, description: strings.galleryLead, locale, path: route, written: publishedLocales(route) as readonly PublicLocale[], graph: galleryGraph(locale, labels) });
    } else if (head && paperPath === route) {
      applyPageMeta({ ...paperMeta(head, locale, labels), locale });
    }
    return () => restorePageMeta();
  });
  const s = $derived(rs());
</script>

<div class="landing blog research">
  {#if route === '/research'}
    <Gallery />
  {:else if loadedResearchDetails[route]}
    {@const Detail = loadedResearchDetails[route]}
    <Detail />
  {:else}
    <section class="sec sec--ink">
      <div class="wrap" style="padding-top: 7rem; padding-bottom: 4rem">
        <h1>{s.missingPage}</h1>
        <p><PublicLink to="/research">{s.backToResearch}</PublicLink></p>
      </div>
    </section>
  {/if}
  {#if route !== '/research' && EXPERIMENTS.some((e) => e.path === route)}<RelatedLinks path={route} />{/if}
  <LandingFooter />
</div>

<style>
  .research {
    font-synthesis: none;
    font-variant-numeric: tabular-nums lining-nums;
  }
  .research :global(sub),
  .research :global(sup) {
    font-size: max(12px, 0.75em);
    line-height: 0;
  }
</style>
