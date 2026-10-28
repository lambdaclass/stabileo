<script lang="ts">
  /** The catalogue (research/papers.yaml, exported to papers.json and checked against Crossref in CI). */
  import catalog from '../../../../research/papers.json';
  import PublicLink from '../landing/PublicLink.svelte';

  type Paper = (typeof catalog.papers)[number];
  const STATUS: Record<string, { label: string; meaning: string }> = {
    proposed: { label: 'Proposed', meaning: 'catalogued; metadata verified against Crossref' },
    'reference-reproduced': { label: 'Reference reproduced', meaning: 'the authors’ code ran here; its outputs are committed' },
    'implementation-in-progress': { label: 'Implementation in progress', meaning: 'a Stabileo implementation exists, not yet validated' },
    'numerically-validated': { label: 'Numerically validated', meaning: 'our implementation matches the reproduced reference within stated tolerances, in CI' },
    interactive: { label: 'Interactive', meaning: 'validated and runnable on this site' },
  };
  const AREAS: Record<string, string> = {
    fracture: 'Fracture and damage',
    'differentiable-fem': 'Differentiable FEM',
    optimization: 'Optimization',
    metamaterials: 'Metamaterials',
    constitutive: 'Constitutive models',
    'digital-twins': 'Digital twins',
    'numerical-methods': 'Numerical methods',
    seismic: 'Seismic and dynamics',
    shells: 'Shells and buckling',
  };
  /** Papers with a page of their own here. */
  const EXPERIMENTS: Record<string, string> = { 'shauer-2025': '/research/fracture/shauer-2025' };

  const papers: Paper[] = [...catalog.papers].sort(
    (a, b) => Object.keys(STATUS).indexOf(b.status) - Object.keys(STATUS).indexOf(a.status) || b.crossref.year - a.crossref.year,
  );
  const areas = [...new Set(papers.map((p) => p.area))];
  let area = $state<string | null>(null);
  const shown = $derived(area ? papers.filter((p) => p.area === area) : papers);

  function authors(list: string[]) {
    return list.length > 3 ? `${list.slice(0, 3).join(', ')} et al.` : list.join(', ');
  }
</script>

<section class="sec sec--ink rs-g-head">
  <div class="wrap rs-g-col">
    <h1>Stabileo Research</h1>
    <p class="rs-g-lead">
      Computational-mechanics papers you can run. Each entry is catalogued with metadata checked against Crossref; the ones marked below
      have been reproduced from the authors’ code, re-implemented in Rust and validated against that reference, and can be run here with
      your own parameters.
    </p>
    <p class="rs-g-note">
      Research, not design: nothing on these pages is an engineering result, and agreement with a reference code is not a certification.
      Contributions are welcome: see <a href="https://github.com/lambdaclass/stabileo/blob/main/research/CONTRIBUTING.md" rel="noreferrer" target="_blank">research/CONTRIBUTING.md</a>.
    </p>
  </div>
</section>

<section class="sec sec--paper rs-g-list">
  <div class="wrap rs-g-col">
    <div class="rs-g-filter" role="group" aria-label="Filter by area">
      <button class:on={area === null} onclick={() => (area = null)}>All ({papers.length})</button>
      {#each areas as a (a)}
        <button class:on={area === a} onclick={() => (area = a)}>{AREAS[a] ?? a} ({papers.filter((p) => p.area === a).length})</button>
      {/each}
    </div>
    <ul class="rs-g-cards">
      {#each shown as p (p.id)}
        <li class="rs-g-card">
          <div class="rs-g-meta">
            <span>{AREAS[p.area] ?? p.area}</span>
            <span class="rs-g-status rs-g-{p.status}" title={STATUS[p.status]?.meaning}>{STATUS[p.status]?.label ?? p.status}</span>
          </div>
          <h2>{p.crossref.title}</h2>
          <p class="rs-g-by">{authors(p.crossref.authors)} · {p.crossref.venue} · {p.crossref.year} · <a href="https://doi.org/{p.doi}" rel="noreferrer" target="_blank">doi:{p.doi}</a></p>
          {#if p.summary}
            <p>{p.summary}</p>
            <p class="rs-g-basis">Summary in our words, from: {p.summary_source}</p>
          {:else}
            <p class="rs-g-basis">Abstract not available.</p>
          {/if}
          {#if p.code.length}
            <p class="rs-g-code">
              Code:
              {#each p.code as c, i (c.url)}{i ? ', ' : ''}<a href={c.url} rel="noreferrer" target="_blank">{c.url.replace('https://github.com/', '')}</a> ({c.license === 'none' ? 'no license' : c.license}){/each}
            </p>
          {/if}
          {#if EXPERIMENTS[p.id]}
            <p><PublicLink to={EXPERIMENTS[p.id]} class="btn btn-primary btn-sm">Open the experiment</PublicLink></p>
          {/if}
        </li>
      {/each}
    </ul>
  </div>
</section>

<style>
  .rs-g-col {
    max-width: 60rem;
  }
  .rs-g-head {
    padding-top: clamp(5rem, 9vw, 6.5rem);
    padding-bottom: 2rem;
  }
  h1 {
    font-family: var(--lp-display);
    font-size: clamp(2.2rem, 5vw, 3.2rem);
    color: var(--fg);
    margin: 0 0 0.75rem;
  }
  .rs-g-lead {
    font-size: 1.1rem;
    color: var(--fg);
  }
  .rs-g-note {
    color: var(--fg-2);
    font-size: 0.95rem;
  }
  a {
    color: inherit;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .rs-g-list {
    padding-top: 2rem;
    padding-bottom: 4rem;
  }
  .rs-g-filter {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-bottom: 1.5rem;
  }
  .rs-g-filter button {
    font: 13px var(--lp-sans);
    border: 1px solid var(--hair);
    background: transparent;
    color: var(--fg);
    border-radius: 3px;
    padding: 0.3rem 0.6rem;
    cursor: pointer;
  }
  .rs-g-filter button.on {
    background: var(--fg);
    color: var(--bg);
  }
  .rs-g-cards {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 1rem;
  }
  .rs-g-card {
    background: var(--card);
    border: 1px solid var(--card-hair);
    border-radius: 3px;
    padding: 1rem 1.25rem;
    color: var(--fg);
  }
  .rs-g-card h2 {
    font-size: 1.15rem;
    line-height: 1.35;
    margin: 0.4rem 0;
  }
  .rs-g-meta {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    font: 12px var(--lp-mono);
    color: var(--fg-2);
  }
  .rs-g-status {
    border: 1px solid var(--hair);
    border-radius: 3px;
    padding: 0 0.4rem;
  }
  .rs-g-numerically-validated,
  .rs-g-interactive {
    color: var(--ok);
    border-color: var(--ok);
  }
  .rs-g-by,
  .rs-g-basis,
  .rs-g-code {
    color: var(--fg-2);
    font-size: 0.88rem;
  }
</style>
