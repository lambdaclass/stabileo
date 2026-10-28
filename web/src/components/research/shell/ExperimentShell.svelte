<script lang="ts">
  /**
   * The page of one runnable paper: a header, then two panes. Left, the article (our words: what
   * the paper shows, the model, how we reproduced it, the comparison, limitations, Cite this).
   * Right, sticky, the app: Stabileo's viewer, the controls, the step player, the plots. On narrow
   * screens the article comes first and the app follows. Badges come from the catalogue, whose
   * statuses CI derives from evidence files.
   */
  import type { Snippet } from 'svelte';
  import catalog from '../../../../../research/papers.json';
  import PublicLink from '../../landing/PublicLink.svelte';
  import { fieldName, statusName, rs } from '../i18n';
  import { provideExperiment, type ExperimentActions } from './context';
  import CiteThis from './CiteThis.svelte';

  type Props = {
    paperId: string;
    name: string;
    lead: string;
    /** Passed / total of the validation checks, when the experiment has them. */
    checks?: { passed: number; total: number } | null;
    actions: ExperimentActions;
    /** Where the implementation lives, for Cite this and the source link. */
    sourcePath: string;
    article: Snippet;
    app: Snippet;
  };
  let { paperId, name, lead, checks = null, actions, sourcePath, article, app }: Props = $props();
  provideExperiment(actions);

  const paper = catalog.papers.find((p) => p.id === paperId)!;
  const s = $derived(rs());
  const authors = paper.crossref.authors.join(', ');
</script>

<section class="sec sec--ink rs-shell">
  <div class="wrap rs-shell-wrap">
    <header class="rs-shell-head">
      <p class="rs-crumb"><PublicLink to="/research">{s.research}</PublicLink> / {fieldName(paper.area)}</p>
      <h1>{name}</h1>
      <p class="rs-cite">
        After {authors}, “{paper.crossref.title}”, <em>{paper.crossref.venue}</em> ({paper.crossref.year}),
        <a href="https://doi.org/{paper.doi}" rel="noreferrer" target="_blank">doi:{paper.doi}</a>.
      </p>
      <ul class="rs-badges">
        <li class="ok">{statusName(paper.status)}{checks ? `: ${checks.passed}/${checks.total} ${s.checksPass}` : ''}</li>
        {#if !paper.reproduced_published_results}<li>{s.notCompared}</li>{/if}
        <li class="warn">{s.notDesign}</li>
      </ul>
      <p class="rs-lead">{lead}</p>
    </header>
    <div class="rs-shell-grid">
      <article class="rs-shell-article">
        {@render article()}
        <CiteThis {paperId} {name} path="/research/{paper.area}/{paperId}" {sourcePath} />
      </article>
      <aside class="rs-shell-app" aria-label="The experiment">
        {@render app()}
      </aside>
    </div>
  </div>
</section>

<style>
  .rs-shell {
    padding-top: clamp(4.5rem, 8vw, 6rem);
    padding-bottom: 3rem;
  }
  .rs-shell-wrap {
    max-width: 96rem;
  }
  .rs-shell-head {
    max-width: 60rem;
    margin-bottom: 1.5rem;
  }
  .rs-shell-head h1 {
    font-family: var(--lp-display);
    font-size: clamp(2rem, 4.5vw, 3rem);
    line-height: 1.1;
    margin: 0.25rem 0 0.75rem;
    color: var(--fg);
  }
  .rs-crumb,
  .rs-cite {
    color: var(--fg-2);
    font-size: 0.95rem;
  }
  .rs-crumb :global(a),
  .rs-cite a {
    color: inherit;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .rs-badges {
    list-style: none;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 1rem 0;
  }
  .rs-badges li {
    font: 12px var(--lp-mono);
    border: 1px solid var(--hair);
    border-radius: 3px;
    padding: 0.25rem 0.5rem;
    color: var(--fg-2);
  }
  .rs-badges li.ok {
    color: var(--ok);
    border-color: var(--ok);
  }
  .rs-badges li.warn {
    color: #d9a441;
    border-color: #d9a441;
  }
  .rs-lead {
    color: var(--fg);
    font-size: 1.05rem;
  }
  .rs-shell-grid {
    display: grid;
    gap: 2rem;
  }
  @media (min-width: 70rem) {
    .rs-shell-grid {
      grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
      align-items: start;
    }
    .rs-shell-app {
      position: sticky;
      top: calc(var(--lp-nav-h, 3.6rem) + 0.75rem);
      max-height: calc(100vh - var(--lp-nav-h, 3.6rem) - 1.5rem);
      overflow-y: auto;
      overscroll-behavior: contain;
    }
  }
  .rs-shell-article {
    color: var(--fg);
    max-width: 46rem;
  }
  .rs-shell-article :global(h2) {
    font-family: var(--lp-display);
    color: var(--fg);
    font-size: 1.4rem;
    margin: 2rem 0 0.75rem;
    scroll-margin-top: calc(var(--lp-nav-h, 3.6rem) + 1rem);
  }
  .rs-shell-article :global(h2:first-child) {
    margin-top: 0;
  }
  .rs-shell-article :global(p),
  .rs-shell-article :global(li) {
    line-height: 1.65;
  }
  .rs-shell-article :global(a) {
    color: inherit;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
</style>
