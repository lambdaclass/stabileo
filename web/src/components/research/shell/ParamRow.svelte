<script lang="ts">
  /** One parameter: its name and symbol, the field, the unit, and its allowed range below. */
  import type { Snippet } from 'svelte';
  let { id, name, unit = '', hint = '', invalid = false, symbol, children }: { id: string; name: string; unit?: string; hint?: string; invalid?: boolean; symbol?: Snippet; children: Snippet } = $props();
</script>

<div class="rs-param" aria-invalid={invalid}>
  <label for={id}><span class="rs-param-name">{name}</span>{#if symbol} {@render symbol()}{/if}</label>
  <div class="rs-param-field">{@render children()}</div>
  <span class="rs-param-unit">{unit}</span>
  {#if hint}<p id="{id}-hint" class="rs-param-hint">{invalid ? `Must be ${hint}` : hint}</p>{/if}
</div>

<style>
  .rs-param {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 8rem 4.5rem;
    column-gap: 0.5rem;
    align-items: center;
    padding: 0.2rem 0;
  }
  label {
    font: var(--rs-ui) var(--st-sans);
    color: var(--fg);
  }
  .rs-param-field :global(input),
  .rs-param-field :global(select) {
    width: 100%;
  }
  .rs-param-unit {
    color: var(--fg-2);
    font-size: var(--rs-small);
  }
  .rs-param-hint {
    grid-column: 2 / 4;
    font-size: 0.8125rem;
    color: var(--fg-2);
    margin: 0.125rem 0 0;
  }
  .rs-param[aria-invalid='true'] .rs-param-hint {
    color: var(--st-warn);
  }
</style>
