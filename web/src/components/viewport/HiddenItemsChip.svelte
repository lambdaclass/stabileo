<script lang="ts">
  /**
   * Over the drawing while part of the model is hidden (context menu › Hide
   * the selection / Show only the selection): says so, and brings it back.
   * Without it a hidden member looks deleted. PRO has the same button in its
   * View panel, so this is Basic's.
   */
  import { uiStore } from '../../lib/store';
  import { viewVisibility } from '../../lib/store/view-state.svelte';
  import { t } from '../../lib/i18n';
</script>

{#if viewVisibility.active && uiStore.analysisMode !== 'pro'}
  <div class="hidden-chip" data-testid="hidden-items-chip">
    <span>{t('view.partHidden')}</span>
    <button onclick={() => viewVisibility.showAll()} data-testid="hidden-items-show-all">{t('view.showAll')}</button>
  </div>
{/if}

<style>
  .hidden-chip {
    position: absolute;
    left: 50%;
    bottom: 12px;
    transform: translateX(-50%);
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 6px 4px 10px;
    font-size: 0.75rem;
    color: var(--st-text-2);
    background: var(--st-surface);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
    white-space: nowrap;
  }
  .hidden-chip button {
    padding: 3px 9px;
    font-size: 0.72rem;
    border-radius: 4px;
    border: 1px solid var(--st-hair-strong);
    background: var(--st-surface-2);
    color: var(--st-text);
    cursor: pointer;
  }
  .hidden-chip button:hover { background: var(--st-surface-3); }
</style>
