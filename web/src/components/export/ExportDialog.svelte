<script lang="ts">
  /**
   * The frame the export dialogs share: a modal card with a title, its sections and its
   * actions. Escape and a click outside close it.
   */
  import type { Snippet } from 'svelte';
  import { t } from '../../lib/i18n';
  import { modelIsEmpty } from '../../lib/export/empty-model';

  let { open = $bindable(false), title, testid, width = 460, children, actions }: {
    open: boolean;
    title: string;
    testid?: string;
    /** px; PRO's dialogs, with more to choose, are wider. */
    width?: number;
    children: Snippet;
    actions: Snippet;
  } = $props();

  function onKey(e: KeyboardEvent) {
    if (open && e.key === 'Escape') open = false;
  }
</script>

<svelte:window onkeydown={onKey} />

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <div class="xd-overlay" onclick={() => (open = false)}>
    <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
    <div class="xd" role="dialog" aria-modal="true" aria-label={title} data-testid={testid} style:width={`min(${width}px, 100%)`} onclick={(e) => e.stopPropagation()}>
      <h3>{title}</h3>
      {#if modelIsEmpty()}<p class="xd-empty" data-testid="export-empty-note">{t('export.emptyModelNote')}</p>{/if}
      <div class="xd-body">{@render children()}</div>
      <div class="xd-actions">{@render actions()}</div>
    </div>
  </div>
{/if}

<style>
  .xd-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }
  .xd {
    background: var(--st-surface);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius-lg);
    box-shadow: 0 18px 40px -12px rgba(0, 0, 0, 0.6);
    padding: 16px 18px;
    width: min(460px, 100%);
    max-height: calc(100vh - 32px);
    display: flex;
    flex-direction: column;
    gap: 12px;
    color: var(--st-text);
  }
  h3 { margin: 0; font-size: 0.95rem; font-weight: 600; }
  .xd-empty {
    margin: 0;
    padding: 6px 10px;
    border: 1px solid var(--st-warn);
    background: var(--st-warn-bg);
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    font-size: 0.76rem;
  }
  .xd-body { display: flex; flex-direction: column; gap: 6px; overflow-y: auto; min-height: 0; }
  .xd-actions { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
  .xd-actions :global(button) {
    padding: 6px 14px;
    border-radius: var(--st-radius);
    border: 1px solid var(--st-hair-strong);
    background: var(--st-surface-2);
    color: var(--st-text-2);
    font-size: 0.8rem;
    cursor: pointer;
  }
  .xd-actions :global(button:hover:not(:disabled)) { color: var(--st-text); border-color: var(--st-text-3); }
  .xd-actions :global(button.primary) { background: var(--st-accent); border-color: var(--st-accent); color: var(--st-text-on-accent); font-weight: 600; }
  .xd-actions :global(button.primary:hover:not(:disabled)) { background: var(--st-accent-hover); color: var(--st-text-on-accent); }
  .xd-actions :global(button:disabled) { opacity: 0.45; cursor: not-allowed; }
</style>
