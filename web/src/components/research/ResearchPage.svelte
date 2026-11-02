<script lang="ts">
  import BigginsPage from './biggins2026/BigginsPage.svelte';
  import { rs } from './i18n';
  /**
   * Stabileo Research: the gallery at /research and one page per runnable paper. Loaded as its own
   * chunk by Root.svelte; the experiment's WASM is fetched only when a simulation is started.
   */
  import { applyPageMeta, restorePageMeta } from '../../lib/page-meta';
  import { publicI18n, type PublicLocale } from '../../lib/i18n/store.svelte';
  import { EXPERIMENTS } from './experiments';
  import { paperHead } from './head.svelte';
  import { RESEARCH_GALLERY, researchLocales } from './locales';
  import { galleryGraph, paperMeta } from './meta';
  import SiteHeader from '../site/SiteHeader.svelte';
  import LandingFooter from '../landing/LandingFooter.svelte';
  import PublicLink from '../landing/PublicLink.svelte';
  import Gallery from './Gallery.svelte';
  import TopoptPage from './andreassen2011/TopoptPage.svelte';
  import MattiassonPage from './mattiasson1981/MattiassonPage.svelte';
  import ShellPage from './shell1985/ShellPage.svelte';
  import MacnealPage from './macneal1985/MacnealPage.svelte';
  import ShauerPage from './shauer2025/ShauerPage.svelte';
  import FerrariPage from './ferrari2025/FerrariPage.svelte';
  import FormPage from './pastrana2026/FormPage.svelte';
  import FaircloughPage from './fairclough2026/FaircloughPage.svelte';
  import NewmarkPage from './newmark1959/NewmarkPage.svelte';
  import CqcPage from './cqc1981/CqcPage.svelte';
  import PlasticPage from './plastic-collapse/PlasticPage.svelte';
  import NavierPage from './navier1823/NavierPage.svelte';
  import LeePage from './lee1968/LeePage.svelte';
  import ArchPage from './dadeppo1975/ArchPage.svelte';
  import SpringsPage from './grossman2026/SpringsPage.svelte';
  import RiksCrisfieldPage from './riksCrisfield/RiksCrisfieldPage.svelte';
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
      applyPageMeta({ title: `${strings.researchTitle} — Stabileo Research`, description: strings.galleryLead, locale, path: route, written: researchLocales(route) as readonly PublicLocale[], graph: galleryGraph(locale, labels) });
    } else if (head && paperPath === route) {
      applyPageMeta({ ...paperMeta(head, locale, labels), locale });
    }
    return () => restorePageMeta();
  });
  const s = $derived(rs());
</script>

<div class="landing blog research">
  <SiteHeader current="research" />
  {#if route === '/research'}
    <Gallery />
  {:else if route === '/research/optimization/andreassen-2011'}
  <TopoptPage />
  {:else if route === '/research/benchmarks/mattiasson-elastica'}
    <MattiassonPage />
  {:else if route === '/research/benchmarks/shell-obstacle-course'}
    <ShellPage />
  {:else if route === '/research/benchmarks/macneal-harder-1985'}
    <MacnealPage />
  {:else if route === '/research/fracture/shauer-2025'}
    <ShauerPage />
  {:else if route === '/research/metamaterials/grossman-2026'}
    <SpringsPage />
  {:else if route === '/research/stability/ferrari-sigmund-2025'}
    <FerrariPage />
  {:else if route === '/research/form-finding/pastrana-2026'}
    <FormPage />
  {:else if route === '/research/mechanics/biggins-2026'}
    <BigginsPage />
  {:else if route === '/research/optimisation/fairclough-2026'}
    <FaircloughPage />
  {:else if route === '/research/benchmarks/newmark-1959'}
    <NewmarkPage />
  {:else if route === '/research/benchmarks/cqc-1981'}
    <CqcPage />
  {:else if route === '/research/benchmarks/plastic-collapse'}
    <PlasticPage />
  {:else if route === '/research/benchmarks/navier-plate'}
    <NavierPage />
  {:else if route === '/research/benchmarks/lee-frame-1968'}
    <LeePage />
  {:else if route === '/research/benchmarks/dadeppo-arch-1975'}
    <ArchPage />
  {:else if route === '/research/benchmarks/riks-crisfield'}
    <RiksCrisfieldPage />
  {:else}
    <section class="sec sec--ink">
      <div class="wrap" style="padding-top: 7rem; padding-bottom: 4rem">
        <h1>{s.missingPage}</h1>
        <p><PublicLink to="/research">{s.backToResearch}</PublicLink></p>
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
