<script lang="ts">
  /**
   * /research: the experiments that run here first, then what is being built, then the
   * catalogue (research/papers.yaml, exported to papers.json and checked against Crossref in CI).
   */
  import catalog from '../../../../research/papers.json';
  import PublicLink from '../landing/PublicLink.svelte';
  import { isHttpUrl } from './urls';
  import FieldIcon from './FieldIcon.svelte';
  import { EXPERIMENTS, COMING_NEXT, SHOW_COMING_NEXT } from './experiments';
  import { rs, fieldName, statusName } from './i18n';

  type Paper = (typeof catalog.papers)[number];
  const ORDER = ['interactive', 'published-figures-compared', 'numerically-validated', 'implementation-in-progress', 'reference-reproduced', 'proposed'];
  const papers: Paper[] = [...catalog.papers].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || b.crossref.year - a.crossref.year);
  const byId = new Map(papers.map((p) => [p.id, p]));
  const run = EXPERIMENTS.map((e) => ({ e, p: byId.get(e.paperId)! })).filter((x) => x.p);
  const catalogue = papers.filter((p) => !EXPERIMENTS.some((e) => e.paperId === p.id));

  const fields = [...new Set(catalogue.map((p) => p.area))];
  const statuses = [...new Set(catalogue.map((p) => p.status))];
  let field = $state<string | null>(null);
  let status = $state<string | null>(null);
  const shown = $derived(catalogue.filter((p) => (!field || p.area === field) && (!status || p.status === status)));
  let thumbFailed = $state<Record<string, boolean>>({});

  const authors = (list: string[]) => (list.length > 3 ? `${list.slice(0, 3).join(', ')} et al.` : list.join(', '));
  const base = import.meta.env.BASE_URL;
  const s = $derived(rs());
</script>

<section class="sec sec--ink rs-g">
  <div class="wrap rs-g-col">
    <header class="rs-g-head">
      <h1>{s.researchTitle}</h1>
      <p class="rs-g-lead">
        {s.galleryLead}
      </p>
      <p class="rs-g-note"><strong>{s.notDesign}.</strong> {s.galleryDisclaimer} <a href="https://github.com/lambdaclass/stabileo/blob/main/research/CONTRIBUTING.md" rel="noreferrer" target="_blank">{"CONTRIBUTING.md"}</a>.</p>
    </header>

    <h2 class="rs-g-h2">{s.runIt}</h2>
    <ul class="rs-g-run">
      {#each run as { e, p } (e.paperId)}
        <li class="rs-g-runcard">
          <PublicLink to={e.path} class="rs-g-thumb" aria-label={e.paperId === "grossman-2026" ? s.springsTitle : s.shauerTitle}>
            {#if !thumbFailed[e.paperId]}
              <img src="{base}{e.thumbnail}" width="640" height="400" loading="lazy" decoding="async" alt={s[e.paperId === "grossman-2026" ? "springsAlt" : "damageAlt"]} onerror={() => (thumbFailed = { ...thumbFailed, [e.paperId]: true })} />
            {:else}
              <span class="rs-g-thumb-icon"><FieldIcon field={p.area} size={96} /></span>
            {/if}
          </PublicLink>
          <div class="rs-g-runbody">
            <div class="rs-g-meta"><span>{fieldName(p.area)}</span><span class="rs-g-status rs-g-{p.status}">{statusName(p.status)}</span></div>
            <h3><PublicLink to={e.path}>{e.paperId === "grossman-2026" ? s.springsTitle : s.shauerTitle}</PublicLink></h3>
            <p class="rs-g-hook">{e.paperId === "grossman-2026" ? s.springsHook : s.shauerHook}</p>
            <p class="rs-g-by">{p.crossref.title}. {authors(p.crossref.authors)}, <em>{p.crossref.venue}</em>, {p.crossref.year}.</p>
            <div class="rs-g-actions">
              <PublicLink to={e.path} class="btn btn-primary btn-sm">{s.readRun}</PublicLink>
              <a class="btn btn-ghost btn-sm" href="https://doi.org/{p.doi}" rel="noreferrer" target="_blank">{s.paper} ↗</a>
              {#if isHttpUrl(e.code)}<a class="btn btn-ghost btn-sm" href={e.code} rel="noreferrer" target="_blank">{s.code} ↗</a>{/if}
              {#if e.editor}<PublicLink to="{e.path}#edit" class="btn btn-ghost btn-sm">{s.editInStabileo}</PublicLink>{/if}
            </div>
          </div>
        </li>
      {/each}
    </ul>

    {#if SHOW_COMING_NEXT && COMING_NEXT.length}
      <h2 class="rs-g-h2">{s.comingNext}</h2>
      <ul class="rs-g-next">
        {#each COMING_NEXT as c (c.name)}
          <li><FieldIcon field={c.field} size={36} /><div><span class="rs-g-tag">{s.inProgress}</span><br /><strong>{c.name}</strong><br /><span class="rs-g-by">{c.note}</span></div></li>
        {/each}
      </ul>
    {/if}

    <h2 class="rs-g-h2">{s.catalog}</h2>
    <div class="rs-g-filters">
      <div role="group" aria-label={s.field}>
        <span class="rs-g-flabel">{s.field}</span>
        <button class:on={field === null} onclick={() => (field = null)}>{s.all}</button>
        {#each fields as f (f)}<button class:on={field === f} onclick={() => (field = f)}>{fieldName(f)}</button>{/each}
      </div>
      {#if statuses.length > 1}
        <div role="group" aria-label={s.status}>
          <span class="rs-g-flabel">{s.status}</span>
          <button class:on={status === null} onclick={() => (status = null)}>{s.all}</button>
          {#each statuses as st (st)}<button class:on={status === st} onclick={() => (status = st)}>{statusName(st)}</button>{/each}
        </div>
      {/if}
    </div>
    <ul class="rs-g-list">
      {#each shown as p (p.id)}
        <li class="rs-g-card">
          <FieldIcon field={p.area} size={28} />
          <div>
            <div class="rs-g-meta"><span>{fieldName(p.area)} · {p.crossref.year}</span><span class="rs-g-status rs-g-{p.status}">{statusName(p.status)}</span></div>
            <h3>{p.crossref.title}</h3>
            <p class="rs-g-by">{authors(p.crossref.authors)} · <em>{p.crossref.venue}</em> · <a href="https://doi.org/{p.doi}" rel="noreferrer" target="_blank">{"doi:"}{p.doi}</a></p>
            {#if p.summary && p.summary_source}
              <p class="rs-g-sum">{p.summary}</p>
              <p class="rs-g-by">{s.summaryIntro} {s.sourceLabel[p.summary_source as keyof typeof s.sourceLabel] ?? ''}.</p>
            {/if}
            {#if p.id === 'ferrari-2025'}
              <p><PublicLink to="/research/stability/ferrari-sigmund-2025">{s.ferrariTitle}</PublicLink></p>
            {/if}
            {#if p.code.length}
              <p class="rs-g-by">{s.code}: {#each p.code as c, i (c.url)}{i ? ', ' : ''}{#if isHttpUrl(c.url)}<a href={c.url} rel="noreferrer" target="_blank">{c.url.replace('https://github.com/', '')}</a>{:else}{c.url}{/if} ({c.license === 'none' ? s.noLicence : c.license}){/each}</p>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
    <p class="rs-g-suggest">
      <a href="https://github.com/lambdaclass/stabileo/issues/new?template=research-paper.yml&labels=research-paper" rel="noreferrer" target="_blank">{s.suggest}</a>
    </p>
  </div>
</section>

<style>
  .rs-g {
    padding-top: clamp(4.5rem, 8vw, 6rem);
    padding-bottom: 4rem;
  }
  .rs-g-col {
    max-width: 68rem;
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
    max-width: 52rem;
  }
  .rs-g-note {
    color: var(--fg-2);
    font-size: 0.95rem;
  }
  a {
    color: inherit;
  }
  .rs-g-h2 {
    font-family: var(--lp-display);
    color: var(--fg);
    font-size: 1.4rem;
    margin: 2.5rem 0 1rem;
  }
  ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .rs-g-runcard {
    display: grid;
    gap: 1.25rem;
    background: var(--card);
    border: 1px solid var(--card-hair);
    border-radius: 6px;
    overflow: hidden;
  }
  @media (min-width: 52rem) {
    .rs-g-runcard {
      grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
    }
  }
  .rs-g-runcard :global(.rs-g-thumb) {
    display: block;
    background: #0f1e2b;
    aspect-ratio: 16 / 10;
  }
  @media (min-width: 52rem) {
    .rs-g-runcard :global(.rs-g-thumb) {
      aspect-ratio: auto;
      height: 100%;
      min-height: 16rem;
    }
  }
  .rs-g-runcard img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .rs-g-thumb-icon {
    display: grid;
    place-items: center;
    height: 100%;
  }
  .rs-g-runbody {
    padding: 1.25rem 1.25rem 1.25rem 0.25rem;
    color: var(--fg);
  }
  @media (max-width: 52rem) {
    .rs-g-runbody {
      padding: 0 1.25rem 1.25rem;
    }
  }
  .rs-g-runbody h3 {
    font-family: var(--lp-display);
    font-size: 1.5rem;
    line-height: 1.2;
    margin: 0.4rem 0 0.6rem;
  }
  .rs-g-runbody h3 :global(a) {
    color: var(--fg);
    text-decoration: none;
    color: var(--fg);
  }
  .rs-g-runbody h3 :global(a:hover) {
    color: var(--lp-accent, #e5482a);
  }
  .rs-g-runbody h3 :global(a:hover) {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .rs-g-hook {
    font-size: 1rem;
  }
  .rs-g-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    margin-top: 1rem;
  }
  .rs-g-soon {
    font-size: 0.8rem;
    color: var(--fg-2);
  }
  .rs-g-meta {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    font: 500 var(--rs-micro) var(--lp-mono);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--fg-2);
  }
  .rs-g-status {
    border: 1px solid var(--hair);
    border-radius: 3px;
    padding: 0 0.4rem;
    white-space: nowrap;
  }
  .rs-g-numerically-validated,
  .rs-g-interactive,
  .rs-g-published-figures-compared {
    color: var(--ok);
    border-color: var(--ok);
  }
  .rs-g-next {
    display: grid;
    gap: 0.75rem;
  }
  @media (min-width: 52rem) {
    .rs-g-next {
      grid-template-columns: 1fr 1fr;
    }
  }
  .rs-g-next li {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    border: 1px dashed var(--hair);
    border-radius: 6px;
    padding: 0.75rem 1rem;
    color: var(--fg);
  }
  .rs-g-tag {
    white-space: nowrap;
    display: inline-block;
    font: 500 0.8125rem var(--st-sans);
    color: #d9a441;
    border: 1px solid #d9a441;
    border-radius: 3px;
    padding: 0 0.3rem;
  }
  .rs-g-filters {
    display: grid;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }
  .rs-g-filters div {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    align-items: center;
  }
  .rs-g-flabel {
    font: var(--rs-ui) var(--st-sans);
    color: var(--fg-2);
    min-width: 4rem;
  }
  .rs-g-filters button {
    font: 13px var(--lp-sans);
    border: 1px solid var(--hair);
    background: transparent;
    color: var(--fg);
    border-radius: 3px;
    padding: 0.25rem 0.55rem;
    cursor: pointer;
  }
  .rs-g-filters button.on {
    background: var(--fg);
    color: var(--bg);
  }
  .rs-g-list {
    display: grid;
    gap: 0;
  }
  .rs-g-card {
    display: grid;
    grid-template-columns: 28px 1fr;
    gap: 0.75rem;
    border-bottom: 1px solid var(--card-hair);
    padding: 0.6rem 0.25rem;
    color: var(--fg);
  }
  .rs-g-card h3 {
    font-size: 0.95rem;
    font-weight: 500;
    line-height: 1.35;
    margin: 0.2rem 0;
  }
  .rs-g-suggest {
    margin-top: 2rem;
    color: var(--fg-2);
  }
  .rs-g-by {
    color: var(--fg-2);
    font-size: 0.86rem;
    margin: 0.2rem 0;
  }
  .rs-g-sum {
    font-size: 0.92rem;
    margin: 0.4rem 0 0.2rem;
  }
</style>
