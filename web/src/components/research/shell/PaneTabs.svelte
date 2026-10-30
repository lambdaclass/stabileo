<script lang="ts">
  import { rs } from '../i18n';
  /**
   * The experiment pane's tabs (WAI-ARIA tabs: roving focus, arrow keys). Content lives one tab click away (overflowing panels may scroll on short windows); article links switch tabs through the
   * experiment context (`showTab`), and the tab they open is briefly highlighted.
   */
  let {
    tabs,
    active = $bindable(),
    flash = null,
    oninteract,
  }: { tabs: { id: string; label: string }[]; active: string; flash?: string | null; oninteract?: () => void } = $props();

  function onKey(e: KeyboardEvent, i: number) {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = tabs[(i + d + tabs.length) % tabs.length];
    oninteract?.();
    active = next.id;
    (document.getElementById(`rs-tab-${next.id}`) as HTMLElement | null)?.focus();
  }
  const strings = $derived(rs());
</script>

<div class="rs-tabs" role="tablist" aria-label={strings.experiment}>
  {#each tabs as t, i (t.id)}
    <button
      id="rs-tab-{t.id}"
      role="tab"
      type="button"
      aria-selected={active === t.id}
      aria-controls="rs-panel-{t.id}"
      tabindex={active === t.id ? 0 : -1}
      class:flash={flash === t.id}
      onclick={() => { oninteract?.(); active = t.id; }}
      onkeydown={(e) => onKey(e, i)}>{t.label}</button
    >
  {/each}
</div>

<style>
  .rs-tabs {
    display: flex;
    gap: 0.25rem;
    border-bottom: 1px solid var(--hair);
  }
  .rs-tabs button {
    font: 500 var(--rs-ui, 0.875rem) / 1 var(--st-sans, sans-serif);
    color: var(--fg-2);
    background: none;
    border: 0;
    border-bottom: 2px solid transparent;
    padding: 0.6rem 0.75rem;
    min-height: 2.25rem;
    cursor: pointer;
  }
  .rs-tabs button[aria-selected='true'] {
    color: var(--fg);
    border-bottom-color: var(--st-accent, #e5482a);
  }
  .rs-tabs button:hover {
    color: var(--fg);
  }
  .rs-tabs button.flash {
    animation: rs-flash 1.2s ease-out;
  }
  @keyframes rs-flash {
    0% {
      background: var(--st-selected-bg, rgba(229, 72, 42, 0.14));
    }
    100% {
      background: transparent;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .rs-tabs button.flash {
      animation: none;
      outline: 2px solid var(--st-accent);
    }
  }
</style>
