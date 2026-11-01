<script lang="ts">
  /** Independent on/off options (toggle buttons with aria-pressed and a check glyph). */
  let { label, items, onchange }: { label: string; items: { label: string; on: boolean; toggle: () => void; title?: string }[]; onchange?: () => void } = $props();
</script>

<div class="rs-tog" role="group" aria-label={label}>
  <span class="rs-tog-label" aria-hidden="true">{label}</span>
  {#each items as it (it.label)}
    <button type="button" aria-pressed={it.on} title={it.title} onclick={() => { it.toggle(); onchange?.(); }}>
      <span class="box" aria-hidden="true">{it.on ? '✓' : ''}</span>{it.label}
    </button>
  {/each}
</div>

<style>
  .rs-tog {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem;
  }
  .rs-tog-label {
    font: var(--rs-ui) var(--st-sans);
    color: var(--fg-2);
    min-width: 4.25rem;
  }
  button {
    font: 500 0.8125rem/1 var(--st-sans);
    min-height: 1.75rem;
    padding: 0 0.6rem 0 0.4rem;
    border-radius: var(--st-radius, 3px);
    border: 1px solid var(--rs-control-border);
    background: transparent;
    color: var(--fg-2);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  button[aria-pressed='true'] {
    background: var(--st-selected-bg);
    border-color: var(--st-selected);
    color: var(--st-text);
  }
  .box {
    width: 0.9rem;
    height: 0.9rem;
    border: 1px solid var(--rs-control-border);
    border-radius: 2px;
    font-size: 0.7rem;
    line-height: 0.9rem;
    text-align: center;
    color: var(--st-ok);
  }
</style>
