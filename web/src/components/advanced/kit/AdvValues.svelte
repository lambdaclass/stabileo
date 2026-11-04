<script lang="ts">
  interface Item { label: string; value: string; tone?: 'accent' | 'ok' | 'warn' }
  interface Props { items: Item[]; help?: string; testid?: string }

  let { items, help, testid }: Props = $props();
</script>

<div class="av-row" data-testid={testid}>
  {#each items as it}
    <div class="av-cell">
      <span class="av-label">{it.label}</span>
      <span class="av-value" class:accent={it.tone === 'accent'} class:ok={it.tone === 'ok'} class:warn={it.tone === 'warn'}>{it.value}</span>
    </div>
  {/each}
  {#if help}<span class="av-help" title={help}>?</span>{/if}
</div>

<style>
  .av-row { display: flex; gap: 6px; margin-bottom: 8px; padding: 4px 0; border-bottom: 1px solid rgba(26, 74, 122, 0.4); align-items: center; flex-wrap: wrap; }
  .av-cell { flex: 1; text-align: center; min-width: 55px; }
  .av-label { display: block; font-size: 0.65rem; color: var(--st-text-3); }
  .av-value { display: block; font-family: 'Courier New', monospace; font-size: 0.72rem; color: var(--st-text); }
  .av-value.accent { color: var(--st-accent); }
  .av-value.ok { color: var(--st-success, #4caf50); }
  .av-value.warn { color: var(--st-warning, #e0a030); }
  .av-help { display: inline-flex; align-items: center; justify-content: center; width: 13px; height: 13px; border-radius: 50%; background: rgba(127, 212, 204, 0.12); color: var(--st-value); font-size: 0.5rem; font-weight: 700; cursor: help; flex-shrink: 0; border: 1px solid rgba(127, 212, 204, 0.25); opacity: 0.6; }
  .av-help:hover { opacity: 1; }
</style>
