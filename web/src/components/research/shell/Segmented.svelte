<script lang="ts">
  /** A one-of-n choice (radiogroup with arrow keys), in the experiment pane's control style. */
  let {
    label,
    options,
    value = $bindable(),
    onchange,
  }: { label: string; options: { id: string; label: string; disabled?: boolean; title?: string }[]; value: string; onchange?: () => void } = $props();

  function pick(id: string) {
    value = id;
    onchange?.();
  }
  function onKey(e: KeyboardEvent, i: number) {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    for (let k = 1; k <= options.length; k++) {
      const o = options[(i + d * k + options.length * 2) % options.length];
      if (!o.disabled) {
        pick(o.id);
        ((e.currentTarget as HTMLElement).parentElement?.querySelector(`[data-id="${o.id}"]`) as HTMLElement | null)?.focus();
        return;
      }
    }
  }
</script>

<div class="rs-seg" role="radiogroup" aria-label={label}>
  <span class="rs-seg-label" aria-hidden="true">{label}</span>
  {#each options as o, i (o.id)}
    <button
      type="button"
      role="radio"
      data-id={o.id}
      aria-checked={value === o.id}
      tabindex={value === o.id ? 0 : -1}
      disabled={o.disabled}
      title={o.title}
      onclick={() => pick(o.id)}
      onkeydown={(e) => onKey(e, i)}>{o.label}</button
    >
  {/each}
</div>

<style>
  .rs-seg {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem;
  }
  .rs-seg-label {
    font: var(--rs-ui) var(--st-sans);
    color: var(--fg-2);
    min-width: 4.25rem;
  }
  button {
    font: 500 0.8125rem/1 var(--st-sans);
    min-height: 1.75rem;
    padding: 0 0.6rem;
    border-radius: var(--st-radius, 3px);
    border: 1px solid var(--rs-control-border);
    background: transparent;
    color: var(--fg-2);
    cursor: pointer;
  }
  button[aria-checked='true'] {
    background: var(--st-selected-bg);
    border-color: var(--st-selected);
    color: var(--st-text);
  }
  button:hover:not(:disabled) {
    color: var(--st-text);
  }
  button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
</style>
