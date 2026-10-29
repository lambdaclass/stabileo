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
  import { fieldName, rs } from '../i18n';
  import { provideExperiment, type ExperimentActions, type Check } from './context';
  import VerificationSummary from './VerificationSummary.svelte';
  import { BUILD_COMMIT } from '../../../lib/build-info';
  import { publicI18n } from '../../../lib/i18n/store.svelte';

  type Props = {
    paperId: string;
    name: string;
    lead: string;
    /** Passed / total of the validation checks, when the experiment has them. */
    checks?: { passed: number; total: number } | null;
    /** What the experiment is checked against; defaults from `checks` and the catalogue. */
    verification?: { reference: Check; published: Check } | null;
    referenceLabel?: string | null;
    actions: ExperimentActions;
    /** Where the implementation lives, for Cite this and the source link. */
    sourcePath: string;
    article: Snippet;
    app: Snippet;
  };
  let { paperId, name, lead, checks = null, verification = null, referenceLabel = null, actions, sourcePath, article, app }: Props = $props();
  provideExperiment(actions);

  const paper = catalog.papers.find((p) => p.id === paperId)!;
  const commit = BUILD_COMMIT;
  const s = $derived(rs());
  const authors = paper.crossref.authors.join(', ');

</script>

<section class="sec sec--ink rs-shell">
  <div class="wrap rs-shell-wrap">
    <header class="rs-shell-head">
      <p class="rs-crumb"><PublicLink to="/research">{s.research}</PublicLink> / {fieldName(paper.area)}</p>
      <h1 lang="en">{name}</h1>
      <p class="rs-cite">
        After {authors}, “{paper.crossref.title}”, <em>{paper.crossref.venue}</em> ({paper.crossref.year}),
        <a href="https://doi.org/{paper.doi}" rel="noreferrer" target="_blank">doi:{paper.doi}</a>.
      </p>
      <VerificationSummary
        reference={verification?.reference ?? (checks ? { kind: 'checks', passed: checks.passed, total: checks.total, href: '#checks' } : { kind: 'none', why: '' })}
        published={verification?.published ?? { kind: 'none', why: s.notComparedWhy }}
        {referenceLabel}
      />
      <p class="rs-lead" lang="en">{lead}</p>
    </header>
    <div class="rs-shell-grid">
      <article class="rs-shell-article rs-prose" lang="en">
        {#if publicI18n.locale !== 'en'}<p class="rs-only-en" lang={publicI18n.locale}>{s.onlyEnglish}</p>{/if}
        {@render article()}
        <h2 id="cite">Cite this</h2>
        <p class="rs-citebox">
          Stabileo Research, “{name}”, reproduction of {authors} ({paper.crossref.year}), doi:{paper.doi}.
          Implementation: <a href="https://github.com/lambdaclass/stabileo/tree/{commit}/{sourcePath}" rel="noreferrer" target="_blank">{sourcePath} at commit {commit}</a>.
          Engine: the Stabileo engine at the same commit. Permanent links to this exact build are planned.
        </p>
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
    --lp-gut: clamp(1rem, 3vw, 2.5rem);
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
  .rs-cite a,
  .rs-citebox a {
    color: inherit;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .rs-lead {
    color: var(--fg);
    font-size: 1.05rem;
  }
  /* Below 70rem the experiment comes first, right after the lead, and the article follows. */
  .rs-shell-grid {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }
  .rs-shell-app {
    order: -1;
  }
  .rs-shell-article,
  .rs-shell-app {
    min-width: 0;
  }
  @media (min-width: 70rem) {
    .rs-shell-grid {
      display: grid;
      grid-template-columns: minmax(30rem, 38rem) minmax(28rem, 1fr);
      column-gap: 3rem;
      align-items: start;
    }
    /* One scroll for the page: the pane is sticky, exactly a viewport tall, and never scrolls on
       its own; tabs organise content, with panel overflow scrolling as a short-window fallback. */
    .rs-shell-app {
      order: 0;
      position: sticky;
      top: calc(var(--lp-nav-h, 3.6rem) + 0.75rem);
      height: calc(100dvh - var(--lp-nav-h, 3.6rem) - 1.5rem);
      overflow: hidden;
    }
  }
  :global(.research .mobile-sticky) {
    display: none;
  }
  .rs-shell-article {
    max-width: var(--rs-measure);
  }
  .rs-shell-article :global(a) {
    color: inherit;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .rs-only-en {
    color: var(--fg-2);
    font-size: var(--rs-small);
    border-left: 2px solid var(--hair);
    padding-left: 0.75rem;
  }
  .rs-citebox {
    font: var(--rs-small)/1.6 var(--st-sans);
    color: var(--fg-2);
    border: 1px solid var(--hair);
    border-radius: 4px;
    padding: 0.75rem 1rem;
  }
</style>
