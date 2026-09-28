<script lang="ts">
  /**
   * Delete what is selected, on screen — for a phone, which has no Delete key.
   *
   * Present only while something is selected, so it costs nothing on a screen
   * that has no room to spare: the options bar already carries the selection
   * read-out, and the button sits beside it. It works with every way of
   * selecting (a tap, a drag, the tables), which a separate "select and
   * delete" mode would not. A deletion asks first, naming what it will take,
   * and stays undoable.
   */
  import { t } from '../../lib/i18n';
  import { uiStore } from '../../lib/store';
  import { selectionSummary, deleteSelection, type SelectionKind } from '../../lib/actions/delete-selection';

  const summary = $derived.by(() => {
    // Read the selection sets so this re-derives when they change.
    void uiStore.selectedElements; void uiStore.selectedNodes; void uiStore.selectedSupports;
    void uiStore.selectedLoads; void uiStore.selectedShells;
    return selectionSummary();
  });
  const total = $derived(summary.reduce((s, c) => s + c.n, 0));
  let confirming = $state(false);
  let btn: HTMLButtonElement | undefined = $state();
  /*
   * Fixed, from the button's own box: the options bar scrolls sideways
   * (overflow-x: auto), which would clip an absolutely positioned card.
   */
  let popStyle = $state('');
  function open() {
    const r = btn?.getBoundingClientRect();
    if (r) popStyle = `top:${Math.round(r.bottom + 6)}px;right:${Math.max(8, Math.round(window.innerWidth - r.right))}px`;
    confirming = true;
  }

  /* A new selection is a new question: never confirm a deletion of something else. */
  $effect(() => { void total; void summary; confirming = false; });

  const label = (kind: SelectionKind, n: number) =>
    t(`sel.kind.${kind}.${n === 1 ? 'one' : 'other'}`).replace('{n}', String(n));
  const described = $derived(summary.map((c) => label(c.kind, c.n)).join(', '));

  function confirm() {
    if (deleteSelection()) uiStore.toast(t('sel.deleted'), 'info');
    confirming = false;
  }
</script>

<svelte:window onkeydown={(e) => { if (confirming && e.key === 'Escape') confirming = false; }} />

{#if total > 0}
  <div class="sd-wrap">
    <button
      class="sd-btn"
      class:on={confirming}
      bind:this={btn}
      onclick={() => (confirming ? (confirming = false) : open())}
      title={t('sel.deleteTitle')}
      aria-label={t('sel.deleteTitle')}
      aria-expanded={confirming}
      data-testid="selection-delete"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span class="sd-count">{total}</span>
    </button>
    {#if confirming}
      <div class="sd-pop" style={popStyle} role="alertdialog" aria-label={t('sel.deleteConfirm')} data-testid="selection-delete-confirm">
        <p class="sd-q">{t('sel.deleteConfirm')}</p>
        <p class="sd-what">{described}</p>
        <div class="sd-actions">
          <button class="sd-cancel" onclick={() => (confirming = false)}>{t('sel.cancel')}</button>
          <button class="sd-go" onclick={confirm} data-testid="selection-delete-go">{t('sel.delete')}</button>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .sd-wrap { position: relative; display: inline-flex; flex-shrink: 0; }
  .sd-btn {
    display: inline-flex; align-items: center; gap: 4px;
    min-height: 28px; padding: 2px 8px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    color: var(--st-danger);
    cursor: pointer;
    font-size: 0.72rem;
  }
  .sd-btn:hover, .sd-btn.on { background: color-mix(in srgb, var(--st-danger) 14%, var(--st-surface-2)); }
  .sd-count { font-variant-numeric: tabular-nums; color: var(--st-text-2); }
  .sd-pop {
    position: fixed; z-index: 400;
    width: max-content; max-width: min(280px, 80vw);
    padding: 10px 12px;
    background: var(--st-surface-3, var(--st-surface-2));
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.35);
  }
  .sd-q { margin: 0 0 2px; font-size: 0.8rem; color: var(--st-text); font-weight: 600; }
  .sd-what { margin: 0 0 8px; font-size: 0.72rem; color: var(--st-text-2); }
  .sd-actions { display: flex; justify-content: flex-end; gap: 8px; }
  .sd-actions button {
    min-height: 32px; padding: 4px 12px;
    border-radius: var(--st-radius); cursor: pointer; font-size: 0.75rem;
    border: 1px solid var(--st-hair-strong);
  }
  .sd-cancel { background: transparent; color: var(--st-text-2); }
  .sd-go { background: var(--st-danger); border-color: var(--st-danger); color: #fff; }
  /* Touch: targets a thumb can hit (the handoff's 44 px rule). */
  @media (pointer: coarse) {
    .sd-btn { min-height: 40px; min-width: 44px; justify-content: center; }
    .sd-actions button { min-height: 44px; }
  }
</style>
