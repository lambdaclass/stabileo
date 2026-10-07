<script lang="ts">
  /**
   * A foldable group of a generator's form: Shape, Frames, Roof, Sections and material, Where.
   *
   * Folded, it still says what it holds (`summary`), so a reader who has settled the frames can
   * fold them and keep reading their span and spacing in the heading. Sections start folded, so a
   * form opens as its list of headings (`gen-help.svelte.ts`). The fields of a folded section stay
   * in the DOM: only their drawing is held back.
   */
  import type { Snippet } from 'svelte';
  import { sectionOpen, setSectionOpen } from './gen-help.svelte';

  interface Props {
    id: string;
    title: string;
    /** What the section holds, shown in its heading while it is folded. */
    summary?: string;
    children: Snippet;
  }
  let { id, title, summary = '', children }: Props = $props();
</script>

<details
  class="gs"
  open={sectionOpen(id)}
  ontoggle={(e) => setSectionOpen(id, e.currentTarget.open)}
  data-testid="gen-sec-{id}"
>
  <summary class="gs-head">
    <span class="gs-title">{title}</span>
    {#if summary}<span class="gs-sum" data-testid="gen-sec-sum-{id}">{summary}</span>{/if}
  </summary>
  <div class="gs-body">{@render children()}</div>
</details>

<style>
  .gs { border-bottom: 1px solid var(--st-hair); }
  .gs-head {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 7px 0 6px;
    cursor: pointer;
    list-style: none;
    user-select: none;
  }
  .gs-head::-webkit-details-marker { display: none; }
  .gs-head::before {
    content: '';
    flex-shrink: 0;
    align-self: center;
    width: 0;
    height: 0;
    border-left: 4px solid var(--st-text-3);
    border-top: 3.5px solid transparent;
    border-bottom: 3.5px solid transparent;
    transition: transform 0.12s ease;
  }
  .gs[open] > .gs-head::before { transform: rotate(90deg); }
  .gs-title {
    font-family: var(--st-mono);
    font-size: 0.64rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--st-text-2);
    white-space: nowrap;
  }
  .gs-head:hover .gs-title { color: var(--st-text); }
  .gs-sum {
    min-width: 0;
    margin-left: auto;
    font-size: 0.66rem;
    color: var(--st-text-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* Open, the fields say it themselves. */
  .gs[open] .gs-sum { display: none; }
  .gs-head:focus-visible { outline: 2px solid var(--st-value); outline-offset: 1px; }
  .gs-body { display: flex; flex-direction: column; gap: 5px; padding: 2px 0 10px; }
</style>
