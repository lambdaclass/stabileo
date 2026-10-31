<script lang="ts">
  import { topoptStrings } from './andreassen2011/i18n';
  import { archStrings } from './biggins2026/strings';
  import BigginsPage from './biggins2026/BigginsPage.svelte';
  import { rs } from './i18n';
  import { cqcStrings } from './cqc1981/strings';
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
  import TopoptPage from './andreassen2011/TopoptPage.svelte';
  import MattiassonPage from './mattiasson1981/MattiassonPage.svelte';
  import ShellPage from './shell1985/ShellPage.svelte';
  import MacnealPage from './macneal1985/MacnealPage.svelte';
  import { pageLocale as macnealLocale, strings as macnealStrings } from './macneal1985/i18n';
  import '../viewport/scalar-viewer-i18n';
  import ShauerPage from './shauer2025/ShauerPage.svelte';
  import FerrariPage from './ferrari2025/FerrariPage.svelte';
  import FormPage from './pastrana2026/FormPage.svelte';
  import FaircloughPage from './fairclough2026/FaircloughPage.svelte';
  import { fs } from './fairclough2026/i18n';
  import NewmarkPage from './newmark1959/NewmarkPage.svelte';
  import { strings as newmarkStrings } from './newmark1959/i18n';
  import CqcPage from './cqc1981/CqcPage.svelte';
  import PlasticPage from './plastic-collapse/PlasticPage.svelte';
  import { ps } from './plastic-collapse/i18n';
  import NavierPage from './navier1823/NavierPage.svelte';
  import { navierStrings } from './navier1823/strings';
  import LeePage from './lee1968/LeePage.svelte';
  import ArchPage from './dadeppo1975/ArchPage.svelte';
  import { archStrings as archStringsFor } from './dadeppo1975/i18n';
  import SpringsPage from './grossman2026/SpringsPage.svelte';
  import RiksCrisfieldPage from './riksCrisfield/RiksCrisfieldPage.svelte';
  import '../landing/landing.css';
  import '../blog/blog.css';
  import './research.css';

  let { path }: { path: string } = $props();
  const route = $derived(path.replace(/\/+$/, '') || '/research');

  const PAGES: Record<string, { title: string; description: string }> = {
    '/research/benchmarks/lee-frame-1968': { title: 'Lee frame (1968) — Stabileo Research', description: 'First version: pinned Lee frame with the production arc-length solver. Provisional reference.' },
    '/research': {
      title: 'Stabileo Research — research in structural engineering',
      description:
        'Classic and recent papers, benchmarks and methods you can run and check in Stabileo, the structural engineering software with AI. Each page states what is reproduced and how it was checked.',
    },
    '/research/benchmarks/mattiasson-elastica': { title: 'Mattiasson elastica — Stabileo engine benchmarks', description: 'Production corotational cantilever compared with independent elliptic-integral references and a one-radian circular arc.' },
    '/research/benchmarks/shell-obstacle-course': { title: 'Shell obstacle course — Stabileo Research', description: 'Live shell mesh refinement, accuracy references and failures in the production engine.' },
    '/research/fracture/shauer-2025': {
      title: 'Phase-field fracture of a notched plate (Shauer 2025) — Stabileo Research',
      description:
        'AT2 phase-field fracture run in the browser by a Rust re-implementation validated step by step against the author’s Python reference code.',
    },
    '/research/metamaterials/grossman-2026': {
      title: 'Auxetic spring networks (Grossman & Boudaoud 2026) — Stabileo Research',
      description:
        'Spring networks solved in the browser as trusses: the auxetic transition of a disordered lattice, a re-entrant honeycomb and ordered lattices, compared with the paper’s published values.',
    },
    '/research/benchmarks/riks-crisfield': {
      title: 'Arc-length benchmarks: Riks and Crisfield — Stabileo Research',
      description:
        'Stabileo’s production arc-length solver follows two two-bar frames past the upper limit point in the browser, checked against analytical equilibrium and native Rust results.',
    },
  };

  $effect(() => {
    const meta = route === '/research/benchmarks/cqc-1981' ? { title: cqcStrings().metaTitle, description: cqcStrings().metaDescription } : route === '/research' ? { title: rs().researchTitle, description: rs().galleryLead } : route === '/research/optimization/andreassen-2011' ? { title: topoptStrings(publicI18n.locale).title, description: topoptStrings(publicI18n.locale).lead } : route === '/research/stability/ferrari-sigmund-2025' ? { title: rs().ferrariTitle, description: rs().ferrariLead } : route === '/research/form-finding/pastrana-2026' ? { title: rs().formTitle, description: rs().formLead } : route === '/research/mechanics/biggins-2026' ? { title: archStrings().title, description: archStrings().lead } : route === '/research/optimisation/fairclough-2026' ? {title:fs().title,description:fs().lead} : route === '/research/benchmarks/dadeppo-arch-1975' ? { title: `${archStringsFor(publicI18n.locale).title} — Stabileo Research`, description: archStringsFor(publicI18n.locale).hook } : route === '/research/benchmarks/navier-plate' ? { title: `${navierStrings(publicI18n.locale).title} — Stabileo Research`, description: navierStrings(publicI18n.locale).lead } : route === '/research/benchmarks/newmark-1959' ? { title: newmarkStrings().metaTitle, description: newmarkStrings().metaDescription } : route === '/research/benchmarks/macneal-harder-1985' ? { title: macnealStrings[macnealLocale(publicI18n.locale)].metaTitle, description: macnealStrings[macnealLocale(publicI18n.locale)].metaDescription } : route === '/research/benchmarks/plastic-collapse' ? { title: ps().metaTitle, description: ps().metaDescription } : PAGES[route];
    if (meta) applyPageMeta({ title: meta.title, description: meta.description, locale: publicI18n.locale, path: route });
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
    font-size: max(12px, 0.75em);
    line-height: 0;
  }
</style>
