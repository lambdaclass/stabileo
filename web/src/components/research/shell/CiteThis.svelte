<script lang="ts">
  /**
   * "Cite this" for one experiment (research/DESIGN.md §5): the permanent link to the exact build
   * (/@<commit>/), the commit, the engine's and the experiment's WASM hashes, our experiment
   * version and the paper's DOI, copied as plain text or BibTeX.
   *
   * Part of the experiment shell: `<CiteThis paperId name path sourcePath />` at the end of the
   * article. Everything else it reads by itself: the catalogue (papers.json), the experiment's
   * versions (research/<field>/<id>/versions.json), the build (virtual:research-build) and the
   * host's snapshot index (/@/).
   */
  import { onMount } from 'svelte';
  import catalog from '../../../../../research/papers.json';
  import { engineWasmSha256, researchWasmSha256 } from 'virtual:research-build';
  import { publicI18n } from '../../../lib/i18n/store.svelte';
  import { BUILD_COMMIT, REPO, THIS_SNAPSHOT, permalinkUrl, pickSnapshot, siteOrigin, snapshotIndex, type Permalink } from './permalink';
  import { citeStrings } from './cite-i18n';
  import { citation, type CitationInput } from './citation';

  type Props = {
    paperId: string;
    /** The experiment's name, as its page titles it. */
    name: string;
    /** `/research/<field>/<id>` */
    path: string;
    /** Where the implementation lives in the repository (`research/<field>/<id>`). */
    sourcePath: string;
  };
  let { paperId, name, path, sourcePath }: Props = $props();

  type Version = { version: number; date: string; commit: string | null; changes: string };
  const VERSIONS = import.meta.glob<{ versions: Version[] }>('../../../../../research/*/*/versions.json', { eager: true, import: 'default' });

  const paper = $derived(catalog.papers.find((p) => p.id === paperId));
  const versions = $derived(
    Object.entries(VERSIONS).find(([file]) => file.endsWith(`/${paperId}/versions.json`))?.[1].versions ?? [],
  );
  const version = $derived(versions.at(-1) ?? null);
  const s = $derived(citeStrings(publicI18n.locale));

  /** undefined while the index loads; null when no snapshot holds the page yet. */
  let link = $state<Permalink | null | undefined>(undefined);
  onMount(() => {
    void snapshotIndex().then((entries) => (link = pickSnapshot(entries, path)));
  });

  const url = $derived(link ? permalinkUrl(link.snapshot, path, publicI18n.locale) : null);
  const commit = $derived(link?.current || !link ? BUILD_COMMIT : link.snapshot.commit);
  const input = $derived<CitationInput | null>(
    paper
      ? {
          id: paperId,
          name,
          version: version?.version ?? null,
          year: (link?.snapshot.date || version?.date || new Date().toISOString()).slice(0, 4),
          url: url ?? siteOrigin() + path + '/',
          commit,
          engineWasmSha256: link && !link.current ? null : engineWasmSha256,
          experimentWasmSha256: link && !link.current ? null : researchWasmSha256[paperId] ?? null,
          paper: { authors: paper.crossref.authors, title: paper.crossref.title, venue: paper.crossref.venue, year: paper.crossref.year, doi: paper.doi },
        }
      : null,
  );
  const text = $derived(input ? citation(input, 'text') : '');
  const bibtex = $derived(input ? citation(input, 'bibtex') : '');

  let copied = $state<'' | 'text' | 'bibtex' | 'link'>('');
  async function copy(what: 'text' | 'bibtex' | 'link') {
    const value = what === 'text' ? text : what === 'bibtex' ? bibtex : (url ?? '');
    try {
      await navigator.clipboard.writeText(value);
      copied = what;
      setTimeout(() => (copied = ''), 2000);
    } catch {
      copied = '';
    }
  }
  const short = (h: string | null) => (h ? `${h.slice(0, 16)}…` : s.notBuilt);
</script>

<section class="rs-citethis" aria-labelledby="cite">
  <h2 id="cite">{s.title}</h2>
  {#if input}
    <dl class="rs-cite-facts">
      <dt>{s.permalink}</dt>
      <dd data-testid="cite-permalink">
        {#if link === undefined}
          {s.looking}
        {:else if url}
          <a href={url}>{url}</a>
          <button type="button" class="rs-cite-copy" onclick={() => copy('link')}>{copied === 'link' ? s.copied : s.copyLink}</button>
          {#if link && !link.current}<p class="rs-cite-note">{s.olderSnapshot(link.snapshot.short)}</p>{/if}
          {#if THIS_SNAPSHOT}<p class="rs-cite-note">{s.thisIsSnapshot}</p>{/if}
        {:else}
          {s.noSnapshot}
        {/if}
      </dd>
      <dt>{s.commit}</dt>
      <dd><a href="{REPO}/tree/{commit}/{sourcePath}" rel="noreferrer" target="_blank"><code>{commit}</code></a></dd>
      <dt>{s.engineWasm}</dt>
      <dd><code title={input.engineWasmSha256 ?? ''}>{input.engineWasmSha256 ? short(input.engineWasmSha256) : link && !link.current ? s.inSnapshot : s.notBuilt}</code></dd>
      <dt>{s.experimentWasm}</dt>
      <dd><code title={input.experimentWasmSha256 ?? ''}>{input.experimentWasmSha256 ? short(input.experimentWasmSha256) : link && !link.current ? s.inSnapshot : s.notBuilt}</code></dd>
      <dt>{s.version}</dt>
      <dd>{#if version}{version.version} ({version.date}){version.commit ? '' : `, ${s.unreleased}`}{:else}{s.noVersion}{/if}</dd>
      <dt>{s.paper}</dt>
      <dd><a href="https://doi.org/{input.paper.doi}" rel="noreferrer" target="_blank">doi:{input.paper.doi}</a></dd>
    </dl>
    <div class="rs-cite-formats">
      <figure>
        <figcaption>{s.plainText} <button type="button" class="rs-cite-copy" onclick={() => copy('text')}>{copied === 'text' ? s.copied : s.copy}</button></figcaption>
        <pre data-testid="cite-text">{text}</pre>
      </figure>
      <figure>
        <figcaption>BibTeX <button type="button" class="rs-cite-copy" onclick={() => copy('bibtex')}>{copied === 'bibtex' ? s.copied : s.copy}</button></figcaption>
        <pre data-testid="cite-bibtex">{bibtex}</pre>
      </figure>
    </div>
    <p class="rs-cite-note">{s.footnote}</p>
  {/if}
</section>

<style>
  .rs-citethis h2 {
    margin-top: 2.5rem;
  }
  .rs-cite-facts {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: 0.4rem 1rem;
    margin: 1rem 0;
    font-size: 0.95rem;
  }
  .rs-cite-facts dt {
    color: var(--fg-2, #8fa3b3);
  }
  .rs-cite-facts dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .rs-cite-facts a,
  .rs-citethis a {
    color: inherit;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .rs-citethis code,
  .rs-citethis pre {
    font-family: var(--lp-mono, ui-monospace, monospace);
    font-size: 0.85rem;
  }
  .rs-cite-formats {
    display: grid;
    gap: 1rem;
  }
  .rs-cite-formats figure {
    margin: 0;
  }
  .rs-cite-formats figcaption {
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: var(--fg-2, #8fa3b3);
    font-size: 0.85rem;
    margin-bottom: 0.25rem;
  }
  .rs-cite-formats pre {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    margin: 0;
    padding: 0.75rem;
    border: 1px solid var(--hair, #2a3a48);
    border-radius: 4px;
  }
  .rs-cite-copy {
    font: 12px var(--lp-mono, ui-monospace, monospace);
    color: inherit;
    background: transparent;
    border: 1px solid var(--hair, #2a3a48);
    border-radius: 3px;
    padding: 0.2rem 0.5rem;
    margin-left: 0.5rem;
    cursor: pointer;
    min-height: 1.75rem;
  }
  .rs-cite-copy:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px;
  }
  .rs-cite-note {
    color: var(--fg-2, #8fa3b3);
    font-size: 0.85rem;
    margin: 0.25rem 0 0;
  }
  @media (max-width: 40rem) {
    .rs-cite-facts {
      grid-template-columns: minmax(0, 1fr);
    }
    .rs-cite-facts dd {
      margin-bottom: 0.5rem;
    }
  }
</style>
