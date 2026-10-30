<script lang="ts">
  import { archStrings } from './biggins2026/strings';
  import { loadedResearchDetails } from './load-detail';
  import { rs } from './i18n';
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
  import { fs } from './fairclough2026/i18n';
  import '../landing/landing.css';
  import '../blog/blog.css';
  import './research.css';

  let { path }: { path: string } = $props();
  const route = $derived(path.replace(/\/+$/, '') || '/research');

  const PAGES: Record<string, { title: string; description: string }> = {
    '/research/benchmarks/newmark-1959': { title: 'Newmark (1959) — Stabileo Research', description: 'First version: production Newmark average acceleration against the exact SDOF step response.' },
    '/research/benchmarks/cqc-1981': { title: 'SRSS vs CQC (1981) — Stabileo Research', description: 'First version: closely spaced building modes compared with a closed-form reference.' },
    '/research/benchmarks/plastic-collapse': { title: 'Classic plastic collapse — Stabileo Research', description: 'First version: a portal frame compared with beam, sway and combined mechanism hand calculations.' },
    '/research/benchmarks/navier-plate': { title: 'Navier plate — Stabileo Research', description: 'First version: a simply supported plate compared with the Navier Fourier series.' },
    '/research/benchmarks/lee-frame-1968': { title: 'Lee frame (1968) — Stabileo Research', description: 'First version: pinned Lee frame with the production arc-length solver. Provisional reference, zero reviews.' },
    '/research/benchmarks/dadeppo-arch-1975': { title: 'DaDeppo–Schmidt deep arch (1975) — Stabileo Research', description: 'First version: a clamped–hinged circular arch traced by the production arc-length solver.' },
    '/research': {
      title: 'Stabileo Research — computational mechanics you can run',
      description:
        'A curated catalogue of recent computational-mechanics papers, with the ones Stabileo has reproduced, re-implemented and validated against the authors’ code, runnable in the browser.',
    },
    '/research/optimization/andreassen-2011': { title: 'MBB topology optimization — Stabileo Research', description: 'SIMP topology optimization against the authors’ 88-line reference code.' },
    '/research/benchmarks/mattiasson-elastica': { title: 'Mattiasson elastica — Stabileo engine benchmarks', description: 'Production corotational cantilever with provisional references and explicit failures.' },
    '/research/benchmarks/shell-obstacle-course': { title: 'Shell obstacle course — Stabileo Research', description: 'Live shell mesh refinement, accuracy references and failures in the production engine.' },
    '/research/benchmarks/macneal-harder-1985': { title: 'MacNeal–Harder (1985) — Stabileo engine benchmarks', description: 'Live production-engine accuracy benchmarks with explicit references, tolerances and failures.' },
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
      title: 'Arc-length snap-through: Riks and Crisfield — Stabileo Research',
      description:
        'Stabileo’s production arc-length solver traces two-bar snap-through paths in the browser, checked against closed-form equilibrium and native Rust results.',
    },
  };

  $effect(() => {
    const meta = route === '/research/stability/ferrari-sigmund-2025' ? { title: rs().ferrariTitle, description: rs().ferrariLead } : route === '/research/form-finding/pastrana-2026' ? { title: rs().formTitle, description: rs().formLead } : route === '/research/mechanics/biggins-2026' ? { title: archStrings().title, description: archStrings().lead } : route === '/research/optimisation/fairclough-2026' ? {title:fs().title,description:fs().lead} : PAGES[route];
    if (meta) applyPageMeta({ title: meta.title, description: meta.description, locale: publicI18n.locale, path: route });
    return () => restorePageMeta();
  });
  const s = $derived(rs());
</script>

<div class="landing blog research">
  <SiteHeader current="research" />
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
