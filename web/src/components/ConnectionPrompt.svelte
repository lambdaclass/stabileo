<script lang="ts">
  /**
   * The editor's question after an edit left two things touching without a
   * connection: a card over the drawing with the two answers. Enter accepts
   * (KeyboardShortcuts, where Enter otherwise solves). Esc is left to what it
   * already does, ending a chain of members, so it never answers by accident.
   */
  import { connectionPrompt } from '../lib/store/connection-prompt.svelte';
  import { t } from '../lib/i18n';

  const q = $derived(connectionPrompt.current);
  const count = $derived(connectionPrompt.count);
  const at = $derived(connectionPrompt.index);
</script>

{#if q}
  {#key q.id}
    <div class="cp-card" role="alertdialog" aria-live="polite" data-testid="connection-prompt">
      {#if count > 1}
        <!-- More than one question waiting: step through them, one at a time. -->
        <div class="cp-nav" data-testid="connection-nav">
          <button class="cp-arrow" onclick={() => connectionPrompt.previous()} aria-label={t('connect.previous')} title={t('connect.previous')} data-testid="connection-prev">‹</button>
          <span class="cp-pos" data-testid="connection-pos">{at + 1} / {count}</span>
          <button class="cp-arrow" onclick={() => connectionPrompt.next()} aria-label={t('connect.next')} title={t('connect.next')} data-testid="connection-next">›</button>
        </div>
      {/if}
      <p class="cp-msg">{q.message}</p>
      <div class="cp-actions">
        <button class="cp-btn cp-accept" onclick={() => connectionPrompt.accept()} data-testid="connection-accept">{q.accept}</button>
        <button class="cp-btn" onclick={() => connectionPrompt.decline()} data-testid="connection-decline">{q.decline}</button>
      </div>
    </div>
  {/key}
{/if}

<style>
  .cp-card {
    position: absolute;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 30;
    max-width: min(92%, 440px);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
    padding: 8px 10px 8px 12px;
    background: var(--st-surface);
    border: 1px solid var(--st-amber-text, #d9a441);
    border-radius: var(--st-radius);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
    animation: cp-in 0.14s ease-out;
  }
  /* A narrow screen: clear of the pointer and fit buttons on the right. */
  @media (max-width: 600px) {
    /* Compact: every pixel of it is drawing area a tap cannot reach. */
    .cp-card {
      left: 8px; right: 52px; transform: none; max-width: none; animation: none;
      gap: 4px 8px; padding: 5px 6px 5px 8px;
    }
    .cp-msg { font-size: 0.72rem; flex-basis: 100%; order: -1; }
    .cp-btn { padding: 2px 8px; font-size: 0.7rem; min-height: 30px; }
    .cp-actions { margin-left: auto; }
  }
  @keyframes cp-in { from { opacity: 0; transform: translate(-50%, -4px); } to { opacity: 1; transform: translate(-50%, 0); } }
  .cp-nav {
    display: flex; align-items: center; gap: 2px; flex: none;
    font-size: 0.72rem; color: var(--st-text-2);
    font-variant-numeric: tabular-nums;
  }
  .cp-arrow {
    width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center;
    border: 1px solid var(--st-hair-strong); border-radius: 4px;
    background: var(--st-surface-2); color: var(--st-text-2);
    font-size: 1rem; line-height: 1; cursor: pointer;
  }
  .cp-arrow:hover { color: var(--st-text); background: var(--st-surface-3); }
  .cp-pos { min-width: 3.2em; text-align: center; }
  @media (pointer: coarse) { .cp-arrow { width: 32px; height: 30px; } }
  .cp-msg {
    margin: 0;
    flex: 1 1 14rem;
    font-size: 0.8rem;
    color: var(--st-text);
  }
  .cp-actions { display: flex; gap: 6px; flex: none; }
  .cp-btn {
    padding: 4px 10px;
    font-size: 0.75rem;
    border-radius: 4px;
    border: 1px solid var(--st-hair-strong);
    background: var(--st-surface-2);
    color: var(--st-text-2);
    cursor: pointer;
    white-space: nowrap;
  }
  .cp-btn:hover { color: var(--st-text); background: var(--st-surface-3); }
  .cp-accept {
    background: var(--st-accent);
    border-color: var(--st-accent);
    color: white;
  }
  .cp-accept:hover { background: var(--st-accent); color: white; filter: brightness(1.08); }
</style>
