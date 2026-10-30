<script lang="ts">
  /**
   * Copy what is selected and paste what was copied, on screen, beside the delete button: a phone
   * has no Ctrl+C. Copy shows while something that copies is selected; paste once something was
   * copied, and starts the same placement as Ctrl+V.
   */
  import { t } from '../../lib/i18n';
  import { uiStore } from '../../lib/store';
  import { copySelection, paste } from '../../lib/store/model-clipboard';
  import { clipboardState } from '../../lib/store/clipboard-state.svelte';
  import { placementStore } from '../../lib/store/placement.svelte';
  import Icon from './Icon.svelte';

  let { floating = false }: { floating?: boolean } = $props();

  const copyable = $derived(
    uiStore.selectedNodes.size + uiStore.selectedElements.size + uiStore.selectedShells.size + uiStore.selectedPlates.size > 0,
  );
</script>

{#if copyable}
  <button class="sc-btn" class:floating onclick={() => copySelection()}
    title={t('sel.copyTitle')} aria-label={t('sel.copyTitle')} data-testid="selection-copy">
    <Icon name="copy" size={16} />
  </button>
{/if}
{#if clipboardState.filled}
  <button class="sc-btn" class:floating onclick={() => paste(false)} disabled={placementStore.active}
    title={t('sel.pasteTitle')} aria-label={t('sel.pasteTitle')} data-testid="selection-paste">
    <Icon name="paste" size={16} />
  </button>
{/if}

<style>
  .sc-btn {
    display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
    min-height: 28px; min-width: 32px; padding: 2px 8px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    cursor: pointer;
  }
  .sc-btn:hover:not(:disabled) { color: var(--st-text); border-color: var(--st-text-3); }
  .sc-btn:disabled { opacity: 0.45; cursor: default; }
  .sc-btn.floating {
    min-height: 40px; min-width: 40px; padding: 0 8px;
    background: color-mix(in srgb, var(--st-surface) 92%, transparent);
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.25);
  }
  @media (pointer: coarse) {
    .sc-btn { min-height: 40px; min-width: 44px; }
  }
</style>
