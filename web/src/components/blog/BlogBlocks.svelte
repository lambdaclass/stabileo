<script lang="ts">
  /**
   * Renders a post's blocks.
   *
   * Every branch here maps a block kind to an element and prints `.t` as text.
   * Nothing is passed to `{@html}`, so a post cannot inject markup into the
   * page — see the note on the content model in src/lib/blog/types.ts.
   */
  import { findPost, inLocale, type Block } from '../../lib/blog';
  import { publicI18n } from '../../lib/i18n/store.svelte';
  import PostEmbed from './PostEmbed.svelte';
  import PublicLink from '../landing/PublicLink.svelte';
  import { smartQuotes as q } from '../../lib/blog/typography';

  let { blocks }: { blocks: Block[] } = $props();
</script>

{#each blocks as block}
  {#if block.k === 'h'}
    <h2 class="post-h">{q(block.t)}</h2>
  {:else if block.k === 'p'}
    <p class="post-p">{q(block.t)}</p>
  {:else if block.k === 'ul'}
    <ul class="post-list">
      {#each block.items as item}<li>{q(item)}</li>{/each}
    </ul>
  {:else if block.k === 'ol'}
    <ol class="post-list post-list--num">
      {#each block.items as item}<li>{q(item)}</li>{/each}
    </ol>
  {:else if block.k === 'quote'}
    <blockquote class="post-quote">{q(block.t)}</blockquote>
  {:else if block.k === 'note'}
    <aside class="post-note">{q(block.t)}</aside>
  {:else if block.k === 'link'}
    {@const target = findPost(block.slug)}
    <!-- A slug that resolves to nothing renders nothing: the content test
         fails on it long before a reader could meet a dead link. -->
    {#if target}
      <aside class="post-link">
        <span class="post-link-lead">{q(block.t)}</span>
        <PublicLink to={`/blog/${target.slug}`} class="link-arrow">{inLocale(target.i18n, publicI18n.locale).title}</PublicLink>
      </aside>
    {/if}
  {:else if block.k === 'ext'}
    <aside class="post-link">
      <span class="post-link-lead">{q(block.t)}</span>
      <a href={block.href} class="link-arrow" rel="noopener" target="_blank">{block.label}</a>
    </aside>
  {:else if block.k === 'embed'}
    <PostEmbed query={block.query} mode={block.mode} label={block.label} />
  {:else if block.k === 'table'}
    <figure class="post-figure">
      <!-- The scroller, not the page, is what moves when a table is wider
           than a phone. -->
      <div class="post-table-scroll">
        <table class="post-table">
          <thead>
            <tr>{#each block.head as h}<th scope="col">{h}</th>{/each}</tr>
          </thead>
          <tbody>
            {#each block.rows as row}
              <tr>
                {#each row as cell, i}
                  <!-- Tables are set for numbers (monospace, right-aligned, one
                       line). A sentence in a cell wraps and reads as prose,
                       or a phone shows only its first words. -->
                  {#if i === 0}<th scope="row">{cell}</th>{:else}<td class:post-cell-text={cell.length > 24}>{q(cell)}</td>{/if}
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <figcaption>{q(block.caption)}</figcaption>
    </figure>
  {/if}
{/each}
