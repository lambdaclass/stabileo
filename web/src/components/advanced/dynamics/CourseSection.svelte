<script lang="ts">
  /**
   * One collapsible section of the Dynamic panel: closed, a title and a
   * one-line summary of what is set; open, its controls. The ? beside it says
   * what the section does, without opening it.
   */
  import type { Snippet } from 'svelte';
  import { t } from '../../../lib/i18n';

  let { title, summary = '', help = '', testid, children }: { title: string; summary?: string; help?: string; testid: string; children: Snippet } = $props();
  let open = $state(false);
  let showHelp = $state(false);
</script>

<section class="cs" class:open data-testid={testid}>
  <div class="cs-head">
    <button class="cs-toggle" onclick={() => (open = !open)} aria-expanded={open} data-testid={`${testid}-toggle`}>
      <span class="cs-caret">{open ? '▾' : '▸'}</span>
      <span class="cs-title">{title}</span>
      {#if summary && !open}<span class="cs-sum">{summary}</span>{/if}
    </button>
    {#if help}
      <button class="cs-help" class:on={showHelp} onclick={() => (showHelp = !showHelp)} aria-expanded={showHelp} title={t('steps.catalog.help')}>?</button>
    {/if}
  </div>
  {#if showHelp && help}<p class="cs-helptext">{help}</p>{/if}
  {#if open}<div class="cs-body">{@render children()}</div>{/if}
</section>

<style>
  .cs { border: 1px solid var(--st-hair); border-radius: var(--st-radius); background: color-mix(in srgb, var(--st-surface-2) 45%, transparent); }
  .cs + :global(.cs) { margin-top: 4px; }
  .cs-head { display: flex; align-items: center; gap: 4px; padding: 2px 4px 2px 0; }
  .cs-toggle {
    flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 5px; padding: 5px 6px; text-align: left;
    background: none; border: none; color: var(--st-text); cursor: pointer; font: inherit; font-size: 0.72rem;
  }
  .cs-caret { color: var(--st-text-3); font-size: 0.6rem; flex: none; }
  .cs-title { font-weight: 600; flex: none; max-width: 100%; }
  .cs-sum { color: var(--st-text-3); font-size: 0.66rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .cs-help {
    width: 20px; height: 20px; flex: none; border-radius: 50%; cursor: pointer; font-size: 0.66rem; font-weight: 700;
    border: 1px solid var(--st-hair-strong); background: var(--st-surface-2); color: var(--st-text-2);
  }
  .cs-help.on { background: var(--st-accent); border-color: var(--st-accent); color: #fff; }
  .cs-helptext { margin: 0 8px 6px; font-size: 0.68rem; line-height: 1.45; color: var(--st-text-2); }
  .cs-body { padding: 2px 8px 8px; display: flex; flex-direction: column; gap: 6px; font-size: 0.7rem; color: var(--st-text-2); }
  .cs-body :global(.cf-grid) { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px 8px; }
  .cs-body :global(.cf-field) { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .cs-body :global(.cf-field > span) { color: var(--st-text-3); font-size: 0.64rem; }
  .cs-body :global(.cf-field input), .cs-body :global(.cf-field select) {
    width: 100%; box-sizing: border-box; padding: 3px 5px; font: inherit; font-size: 0.72rem; color: var(--st-text);
    background: var(--st-surface-3); border: 1px solid var(--st-hair); border-radius: var(--st-radius);
  }
  .cs-body :global(.cf-field input:focus), .cs-body :global(.cf-field select:focus) { outline: none; border-color: var(--st-accent); }
  .cs-body :global(.cf-field input.bad) { border-color: #e5484d; }
  .cs-body :global(.cf-seg) { display: flex; gap: 2px; padding: 2px; border: 1px solid var(--st-hair); border-radius: 7px; background: var(--st-surface-2); }
  .cs-body :global(.cf-seg button) {
    flex: 1; padding: 4px 2px; border: none; border-radius: 5px; background: none; color: var(--st-text-3);
    font: inherit; font-size: 0.66rem; font-weight: 600; cursor: pointer;
  }
  .cs-body :global(.cf-seg button.on) { background: var(--st-surface-3); color: var(--st-text); box-shadow: inset 0 -2px 0 -1px var(--st-accent); }
  .cs-body :global(.cf-res) { font-size: 0.68rem; color: var(--st-text); font-variant-numeric: tabular-nums; line-height: 1.5; }
  .cs-body :global(.cf-hint) { margin: 0; font-size: 0.64rem; line-height: 1.4; color: var(--st-text-3); }
  .cs-body :global(.cf-err) { margin: 0; font-size: 0.66rem; line-height: 1.4; color: #e5484d; }
  .cs-body :global(.cf-check) { display: flex; align-items: center; gap: 5px; font-size: 0.68rem; color: var(--st-text-2); cursor: pointer; }
  .cs-body :global(.cf-primary) {
    align-self: stretch; padding: 5px 8px; border-radius: 4px; cursor: pointer; font: inherit; font-size: 0.72rem; font-weight: 600;
    background: var(--st-accent); border: 1px solid var(--st-accent); color: #fff;
  }
  .cs-body :global(.cf-link) { align-self: flex-start; padding: 0; border: none; background: none; color: var(--st-accent); font: inherit; font-size: 0.66rem; cursor: pointer; text-decoration: underline dotted; text-underline-offset: 2px; }
  .cs-body :global(.cf-table) { width: 100%; border-collapse: collapse; font-size: 0.66rem; font-variant-numeric: tabular-nums; }
  .cs-body :global(.cf-table th) { text-align: right; font-weight: 600; color: var(--st-text-3); padding: 2px 4px; border-bottom: 1px solid var(--st-hair-strong); }
  .cs-body :global(.cf-table td) { text-align: right; padding: 2px 4px; border-bottom: 1px solid var(--st-hair); color: var(--st-text); }
  .cs-body :global(.cf-table th:first-child), .cs-body :global(.cf-table td:first-child) { text-align: left; }
  .cs-body :global(.cf-caption) { margin: 0; font-size: 0.62rem; font-style: italic; color: var(--st-text-3); text-align: center; }
  .cs-body :global(.cf-plot) { border: 1px solid var(--st-hair); border-radius: var(--st-radius); padding: 2px; background: var(--st-surface-2); }
  @media (pointer: coarse) {
    .cs-help { width: 28px; height: 28px; }
    .cs-toggle { min-height: 34px; }
    .cs-body :global(.cf-field input), .cs-body :global(.cf-field select), .cs-body :global(.cf-seg button), .cs-body :global(.cf-primary) { min-height: 32px; }
  }
</style>
