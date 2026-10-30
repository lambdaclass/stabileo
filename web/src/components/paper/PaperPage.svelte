<script lang="ts">
  /**
   * /paper: the JAIE 2026 paper in full, in English, set as its LaTeX article is (`lib/paper/`), with
   * that PDF and the Spanish original. Its own chunk (Root.svelte, App.svelte), so KaTeX is not
   * loaded by the landing or the blog.
   */
  import { applyPageMeta, restorePageMeta } from '../../lib/page-meta';
  import { publicI18n } from '../../lib/i18n/store.svelte';
  import SiteHeader from '../site/SiteHeader.svelte';
  import LandingFooter from '../landing/LandingFooter.svelte';
  import PaperText from './PaperText.svelte';
  import { PAPER, BODY, REFERENCES, LABELS, PDF_HREF, ORIGINAL_PDF_HREF } from '../../lib/paper/jaie-2026';
  import { ps } from './i18n';
  import katex from 'katex';
  import '../landing/landing.css';
  import './paper.css';

  const s = $derived(ps());
  $effect(() => {
    applyPageMeta({ title: s.metaTitle, description: s.metaDescription, locale: publicI18n.locale, path: '/paper' });
    return () => restorePageMeta();
  });
  const display = (tex: string) => katex.renderToString(tex, { displayMode: true, throwOnError: false, output: 'htmlAndMathml' });
  const url = (r: string) => r.match(/https?:\/\/\S+$/)?.[0];
</script>

<div class="landing paper-site">
  <SiteHeader current="paper" />
  <main class="pp-wrap">
    <div class="pp-bar">
      <p class="pp-venue">{s.venue}{#if s.language}<br /><span class="pp-lang">{s.language}</span>{/if}</p>
      <div class="pp-actions">
        <a class="pp-download" href={PDF_HREF} download data-testid="paper-download">{s.download}</a>
        <a class="pp-original" href={ORIGINAL_PDF_HREF} download data-testid="paper-original">{s.original}</a>
      </div>
    </div>

    <article class="pp-sheet" lang="en" data-testid="paper">
      <header class="pp-front">
        <h1 class="pp-title">{PAPER.title}<sup class="pp-thanks">*</sup></h1>
        <p class="pp-authors">
          {#each PAPER.authors as a, i (a.email)}{#if i > 0}{', '}{/if}<span class="pp-author">{a.name}<sup>{a.marks}</sup></span>{/each}
        </p>
        {#each PAPER.affiliations as [mark, name] (mark)}<p class="pp-affiliation"><sup>{mark}</sup>{name}</p>{/each}
        <p class="pp-emails">{#each PAPER.authors as a, i (a.email)}{#if i > 0}{', '}{/if}<a href="mailto:{a.email}">{a.email}</a>{/each}</p>
      </header>

      <section class="pp-abstract">
        <h2 class="pp-abstract-h">{LABELS.abstract}</h2>
        <p>{PAPER.abstract}</p>
        <p class="pp-keywords"><strong>{LABELS.keywords}</strong> {PAPER.keywords}</p>
      </section>

      {#each BODY as b, i (i)}
        {#if b.k === 'h1'}
          <h2 class="pp-h1" id="sec-{b.n}"><span class="pp-num">{b.n}</span><PaperText t={b.t} /></h2>
        {:else if b.k === 'h2'}
          <h3 class="pp-h2" id="sec-{b.n}"><span class="pp-num">{b.n}</span><PaperText t={b.t} /></h3>
        {:else if b.k === 'p'}
          <p><PaperText t={b.t} /></p>
        {:else if b.k === 'ol'}
          <ol class="pp-list">{#each b.items as item, j (j)}<li><PaperText t={item} /></li>{/each}</ol>
        {:else if b.k === 'eq'}
          <div class="pp-eq" id="eq-{b.n}">
            <div class="pp-eq-body">{@html display(b.tex)}</div>
            <span class="pp-eq-n">({b.n})</span>
          </div>
        {:else if b.k === 'table'}
          <figure class="pp-table" id="table-{b.n}">
            <figcaption><strong>{LABELS.table} {b.n}:</strong> <PaperText t={b.caption} /></figcaption>
            <div class="pp-table-scroll">
              <table>
                <thead><tr>{#each b.head as h, j (j)}<th><PaperText t={h} /></th>{/each}</tr></thead>
                <tbody>{#each b.rows as row, r (r)}<tr>{#each row as cell, j (j)}<td><PaperText t={cell} /></td>{/each}</tr>{/each}</tbody>
              </table>
            </div>
          </figure>
        {:else if b.k === 'figure'}
          <figure class="pp-figure" id="figure-{b.n}">
            <img src={b.src} width={b.width} height={b.height} alt={b.caption} loading="lazy" decoding="async" />
            <figcaption><strong>{LABELS.figure} {b.n}:</strong> <PaperText t={b.caption} /></figcaption>
          </figure>
        {/if}
      {/each}

      <h2 class="pp-h1 pp-unnumbered">{LABELS.references}</h2>
      <ol class="pp-refs">
        {#each REFERENCES as r, i (i)}
          {@const link = url(r)}
          <li id="ref-{i + 1}"><span class="pp-ref-n">[{i + 1}]</span><span>{#if link}{r.slice(0, r.length - link.length)}<a href={link} rel="noopener">{link}</a>{:else}{r}{/if}</span></li>
        {/each}
      </ol>

      <p class="pp-footnote"><sup>*</sup>{PAPER.note}</p>
    </article>
  </main>
  <LandingFooter />
</div>
