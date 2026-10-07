<script lang="ts">
  /**
   * One parameter of a generator: its name against its box, as in the Add load card.
   *
   * The names sit in one column and the boxes in the next, so every box of a section starts at
   * the same x whatever its name says. A checkbox takes the box column with its name beside it.
   *
   * The explanation (`hint`) is not drawn here. It is kept beside the field, out of sight, under
   * `hintId`, which the field's `aria-describedby` points at; the help line above the preview shows
   * it for the field under the pointer or in focus (`gen-help.svelte.ts`).
   */
  import type { Snippet } from 'svelte';
  import { genHelp } from './gen-help.svelte';

  interface Props {
    name: string;
    hint?: string;
    hintId?: string;
    /** A checkbox: the box in the box column, its name after it. */
    check?: boolean;
    /** `div` for a row of several controls (radios, X Y Z), each with its own name. */
    as?: 'label' | 'div';
    children: Snippet;
  }
  let { name, hint, hintId, check = false, as = 'label', children }: Props = $props();

  const help = $derived(hint ? { name, text: hint } : null);
</script>

<div
  class="gr"
  class:gr-check={check}
  role="group"
  onmouseenter={() => (genHelp.hover = help)}
  onmouseleave={() => (genHelp.hover = null)}
  onfocusin={() => (genHelp.focus = help)}
>
  <svelte:element this={as} class="gr-label">
    {#if check}
      <span class="gr-cell">{@render children()}<span class="gr-check-name">{name}</span></span>
    {:else}
      <span class="gr-name">{name}</span>
      <span class="gr-cell">{@render children()}</span>
    {/if}
  </svelte:element>
  {#if hint && hintId}<span class="gr-hint" id={hintId}>{hint}</span>{/if}
</div>

<style>
  .gr {
    display: grid;
    grid-template-columns: var(--gr-l, 8.5rem) minmax(0, 1fr);
    gap: 8px;
    align-items: center;
    position: relative;
    min-height: 22px;
  }
  /* The label lays its two spans on the row's grid; the row keeps the hint out of the name. */
  .gr-label { display: contents; }
  .gr-name {
    grid-column: 1;
    text-align: right;
    font-size: 0.7rem;
    line-height: 1.15;
    color: var(--st-text-2);
    overflow-wrap: break-word;
    hyphens: auto;
  }
  .gr-cell {
    grid-column: 2;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    min-width: 0;
    font-size: 0.7rem;
    color: var(--st-text-2);
  }
  .gr-check .gr-cell { gap: 6px; }
  .gr-check-name { color: var(--st-text); }
  .gr:hover .gr-name { color: var(--st-text); }

  /* Kept for the screen reader the field points it at, drawn in the help line instead. */
  .gr-hint {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* One width for every number, one for every list and every choice. */
  .gr-cell :global(input[type='number']),
  .gr-cell :global(input[inputmode='decimal']),
  .gr-cell :global(input[type='text']),
  .gr-cell :global(select) {
    box-sizing: border-box;
    background: var(--st-bg);
    color: var(--st-text);
    border: 1px solid var(--st-hair-strong);
    border-radius: 3px;
    padding: 3px 5px;
    font-size: 0.72rem;
    font-family: var(--st-mono);
  }
  .gr-cell :global(input[type='number']),
  .gr-cell :global(input[inputmode='decimal']) { width: 5.5rem; text-align: right; }
  .gr-cell :global(input[type='text']:not([inputmode='decimal'])) { width: 9.5rem; }
  .gr-cell :global(select) { width: auto; min-width: 9rem; max-width: 100%; font-family: inherit; }
  .gr-cell :global(input[type='checkbox']) { margin: 0; }
  .gr-cell :global(input:focus-visible), .gr-cell :global(select:focus-visible) {
    outline: 2px solid var(--st-value);
    outline-offset: 1px;
  }
</style>
