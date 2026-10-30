<script lang="ts">
  /**
   * One part of the plastic panel: closed by default, its title and a one-line
   * summary on the row, an optional (?) with the idea behind it, the body below.
   */
  import type { Snippet } from 'svelte';
  import { t } from '../../../lib/i18n';

  let { title, summary = '', help = '', testid, open = $bindable(false), children }: {
    title: string; summary?: string; help?: string; testid: string; open?: boolean; children: Snippet;
  } = $props();
  let showHelp = $state(false);
</script>

<details class="ps" bind:open data-testid={testid}>
  <summary>
    <span class="ps-title">{title}</span>
    {#if summary}<span class="ps-sum">{summary}</span>{/if}
  </summary>
  <div class="ps-body">
    {#if help}
      <button class="ps-help" class:on={showHelp} onclick={() => (showHelp = !showHelp)} aria-expanded={showHelp}
        title={t('course.plastic.whatIsIt')} data-testid={`${testid}-help`}>?</button>
      {#if showHelp}<p class="ps-helptext">{help}</p>{/if}
    {/if}
    {@render children()}
  </div>
</details>

<style>
  .ps { margin: 4px 0; border: 1px solid var(--st-hair); border-radius: 6px; background: color-mix(in srgb, var(--st-surface-2) 40%, transparent); }
  .ps > summary { cursor: pointer; padding: 5px 8px; display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 6px; list-style: none; }
  .ps > summary::-webkit-details-marker { display: none; }
  .ps > summary::before { content: '▸'; color: var(--st-text-3); font-size: 0.62rem; }
  .ps[open] > summary::before { content: '▾'; }
  .ps-title { font-size: 0.72rem; font-weight: 600; color: var(--st-text); }
  .ps-sum { font-size: 0.64rem; color: var(--st-text-3); font-variant-numeric: tabular-nums; min-width: 0; overflow-wrap: anywhere; }
  .ps-body { padding: 0 8px 8px; font-size: 0.68rem; line-height: 1.45; color: var(--st-text-2); }
  .ps-body::after { content: ''; display: block; clear: both; }
  .ps-help {
    float: right; margin: 0 0 4px 6px; width: 20px; height: 20px; border-radius: 50%; cursor: pointer;
    font-size: 0.66rem; font-weight: 700; border: 1px solid var(--st-hair-strong); background: var(--st-surface-2); color: var(--st-text-2);
  }
  .ps-help.on { background: var(--st-accent); border-color: var(--st-accent); color: #fff; }
  .ps-helptext {
    clear: both; margin: 0 0 6px; padding: 6px 8px; border-radius: 6px; font-size: 0.68rem; line-height: 1.45; color: var(--st-text);
    background: rgba(127, 212, 204, 0.08); border: 1px solid rgba(127, 212, 204, 0.3);
  }
  @media (pointer: coarse) { .ps > summary { min-height: 34px; align-items: center; } .ps-help { width: 28px; height: 28px; } }
</style>
