<script lang="ts">
  /**
   * Renders a post's blocks.
   *
   * Every branch here maps a block kind to an element and prints `.t` as text.
   * Nothing is passed to `{@html}`, so a post cannot inject markup into the
   * page — see the note on the content model in src/lib/blog/types.ts.
   */
  import type { Block } from '../../lib/blog';
  import PostEmbed from './PostEmbed.svelte';

  let { blocks }: { blocks: Block[] } = $props();
</script>

{#each blocks as block}
  {#if block.k === 'h'}
    <h2 class="post-h">{block.t}</h2>
  {:else if block.k === 'p'}
    <p class="post-p">{block.t}</p>
  {:else if block.k === 'ul'}
    <ul class="post-list">
      {#each block.items as item}<li>{item}</li>{/each}
    </ul>
  {:else if block.k === 'ol'}
    <ol class="post-list post-list--num">
      {#each block.items as item}<li>{item}</li>{/each}
    </ol>
  {:else if block.k === 'quote'}
    <blockquote class="post-quote">{block.t}</blockquote>
  {:else if block.k === 'note'}
    <aside class="post-note">{block.t}</aside>
  {:else if block.k === 'embed'}
    <PostEmbed query={block.query} label={block.label} />
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
                  {#if i === 0}<th scope="row">{cell}</th>{:else}<td>{cell}</td>{/if}
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <figcaption>{block.caption}</figcaption>
    </figure>
  {/if}
{/each}
