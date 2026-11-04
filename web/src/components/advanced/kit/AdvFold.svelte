<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    summary?: string;
    help?: string;
    open?: boolean;
    testid?: string;
    children: Snippet;
  }

  let { title, summary, help, open = $bindable(false), testid, children }: Props = $props();
  let showHelp = $state(false);
</script>

<div class="af" data-testid={testid}>
<div class="af-head">
  <button class="af-toggle" class:open onclick={() => (open = !open)} data-testid={testid ? `${testid}-toggle` : undefined} aria-expanded={open}>
    <span class="af-chevron">{open ? '▾' : '▸'}</span>
    <span class="af-title">{title}</span>
    {#if summary && !open}<span class="af-summary">{summary}</span>{/if}
  </button>
  {#if help}<button class="af-help" class:on={showHelp} title={help} aria-expanded={showHelp} onclick={() => (showHelp = !showHelp)} data-testid={testid ? `${testid}-help` : undefined}>?</button>{/if}
</div>
{#if help && showHelp}<p class="af-helptext">{help}</p>{/if}
{#if open}
  <div class="af-body">{@render children()}</div>
{/if}
</div>

<style>
  .af-head { display: flex; align-items: center; gap: 4px; border-bottom: 1px solid rgba(26, 74, 122, 0.3); }
  .af-toggle {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    padding: 3px 0;
    background: none;
    border: none;
    color: var(--st-text-3);
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    cursor: pointer;
    text-align: left;
  }
  .af-toggle:hover, .af-toggle.open { color: var(--st-text-2); }
  .af-chevron { font-size: 0.6rem; width: 10px; flex: none; }
  .af-title { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .af-summary {
    flex: 1 1 0;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-transform: none;
    letter-spacing: 0;
    font-family: 'Courier New', monospace;
    font-size: 0.64rem;
    color: var(--st-text-3);
    text-align: right;
  }
  .af-help {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 13px;
    height: 13px;
    padding: 0;
    border-radius: 50%;
    background: rgba(127, 212, 204, 0.12);
    color: var(--st-value);
    font-size: 0.5rem;
    font-weight: 700;
    cursor: help;
    flex-shrink: 0;
    border: 1px solid rgba(127, 212, 204, 0.25);
    opacity: 0.6;
    text-transform: none;
  }
  .af-help:hover, .af-help.on { opacity: 1; }
  .af-helptext { margin: 4px 0 6px; padding: 5px 7px; border-left: 2px solid rgba(127, 212, 204, 0.4); font-size: 0.66rem; line-height: 1.45; color: var(--st-text-2); }
  @media (pointer: coarse) { .af-toggle { min-height: 32px; } .af-help { width: 22px; height: 22px; font-size: 0.62rem; } }
  .af-body { padding: 5px 0 8px; font-size: 0.72rem; color: var(--st-text-2); }

  .af-body :global(.cf-grid) { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px 8px; }
  .af-body :global(.cf-field) { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .af-body :global(.cf-field > span) { color: var(--st-text-3); font-size: 0.64rem; }
  .af-body :global(.cf-field input), .af-body :global(.cf-field select) {
    width: 100%; box-sizing: border-box; padding: 3px 5px; font: inherit; font-size: 0.72rem; color: var(--st-text);
    background: var(--st-surface-3); border: 1px solid var(--st-hair); border-radius: var(--st-radius);
  }
  .af-body :global(.cf-field input:focus), .af-body :global(.cf-field select:focus) { outline: none; border-color: var(--st-accent); }
  .af-body :global(.cf-field input.bad) { border-color: #e5484d; }
  .af-body :global(.cf-seg) { display: flex; flex-wrap: wrap; gap: 2px; }
  .af-body :global(.cf-seg button) {
    height: 18px; padding: 0 6px; border: 1px solid var(--st-surface-3); border-radius: 3px; background: rgba(19, 33, 45, 0.8);
    color: var(--st-text-3); font: inherit; font-size: 0.6rem; cursor: pointer; white-space: nowrap;
  }
  .af-body :global(.cf-seg button:disabled) { opacity: 0.35; cursor: default; }
  .af-body :global(.cf-seg button.on) { color: var(--st-accent); border-color: var(--st-accent); background: rgba(229, 72, 42, 0.12); }
  .af-body :global(.cf-res) { font-size: 0.68rem; color: var(--st-text); font-variant-numeric: tabular-nums; line-height: 1.5; }
  .af-body :global(.cf-hint) { margin: 0; font-size: 0.64rem; line-height: 1.4; color: var(--st-text-3); }
  .af-body :global(.cf-err) { margin: 0; font-size: 0.66rem; line-height: 1.4; color: #e5484d; }
  .af-body :global(.cf-check) { display: flex; align-items: center; gap: 5px; font-size: 0.68rem; color: var(--st-text-2); cursor: pointer; }
  .af-body :global(.cf-primary) {
    align-self: flex-start; padding: 2px 9px; border-radius: 3px; cursor: pointer; font: inherit; font-size: 0.66rem;
    background: rgba(229, 72, 42, 0.12); border: 1px solid var(--st-accent); color: var(--st-accent);
  }
  .af-body :global(.cf-link) { align-self: flex-start; padding: 2px 7px; border: 1px solid var(--st-surface-3); border-radius: 3px; background: none; color: var(--st-value); font: inherit; font-size: 0.65rem; cursor: pointer; }
  .af-body :global(.cf-link:hover) { border-color: var(--st-value); }
  .af-body :global(.cf-table) { width: 100%; border-collapse: collapse; font-size: 0.66rem; font-variant-numeric: tabular-nums; }
  .af-body :global(.cf-table th) { text-align: right; font-weight: 600; color: var(--st-text-3); padding: 2px 4px; border-bottom: 1px solid var(--st-hair-strong); }
  .af-body :global(.cf-table td) { text-align: right; padding: 2px 4px; border-bottom: 1px solid var(--st-hair); color: var(--st-text); }
  .af-body :global(.cf-table th:first-child), .af-body :global(.cf-table td:first-child) { text-align: left; }
  .af-body :global(.cf-caption) { margin: 0; font-size: 0.62rem; font-style: italic; color: var(--st-text-3); text-align: center; }
  .af-body :global(.cf-plot) { border: 1px solid var(--st-hair); border-radius: var(--st-radius); padding: 2px; background: var(--st-surface-2); }
  @media (pointer: coarse) {
    .af-body :global(.cf-field input), .af-body :global(.cf-field select), .af-body :global(.cf-seg button), .af-body :global(.cf-primary) { min-height: 32px; }
  }
</style>
