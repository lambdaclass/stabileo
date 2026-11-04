<script lang="ts">
  interface Chip { id: string; label: string; title?: string; disabled?: boolean }
  interface Props {
    chips: Chip[];
    value: string;
    label?: string;
    help?: string;
    testid?: string;
    onchange?: (id: string) => void;
  }

  let { chips, value = $bindable(), label, help, testid, onchange }: Props = $props();
</script>

<div class="ac-row" data-testid={testid}>
  {#if label}<span class="ac-label">{label}</span>{/if}
  <div class="ac-chips">
    {#each chips as c}
      <button class="ac-chip" class:active={c.id === value} class:disabled={c.disabled} title={c.title} data-chip={c.id}
        onclick={() => { if (c.disabled || c.id === value) return; value = c.id; onchange?.(c.id); }}>{c.label}</button>
    {/each}
  </div>
  {#if help}<span class="ac-help" title={help}>?</span>{/if}
</div>

<style>
  .ac-row { display: flex; align-items: center; gap: 6px; padding: 2px 0; min-height: 22px; }
  .ac-label { font-size: 0.65rem; color: var(--st-text-3); flex: none; min-width: 52px; }
  .ac-chips { display: flex; flex-wrap: wrap; gap: 2px; flex: 1; }
  .ac-chip {
    min-width: 20px;
    height: 18px;
    padding: 0 5px;
    font-size: 0.6rem;
    border: 1px solid var(--st-surface-3);
    border-radius: 3px;
    background: rgba(19, 33, 45, 0.8);
    color: var(--st-text-3);
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .ac-chip:hover { color: var(--st-text-2); }
  .ac-chip.active { color: var(--st-accent); border-color: var(--st-accent); background: rgba(229, 72, 42, 0.12); }
  .ac-chip.disabled { opacity: 0.3; pointer-events: none; }
  .ac-help { display: inline-flex; align-items: center; justify-content: center; width: 13px; height: 13px; border-radius: 50%; background: rgba(127, 212, 204, 0.12); color: var(--st-value); font-size: 0.5rem; font-weight: 700; cursor: help; flex-shrink: 0; border: 1px solid rgba(127, 212, 204, 0.25); opacity: 0.6; margin-left: auto; }
  .ac-help:hover { opacity: 1; }
</style>
