<script lang="ts">
  /**
   * The editor's question after an edit left two things touching without a
   * connection: a card over the drawing with the two answers. Enter accepts
   * (KeyboardShortcuts, where Enter otherwise solves). Esc is left to what it
   * already does, ending a chain of members, so it never answers by accident.
   */
  import { connectionPrompt } from '../lib/store/connection-prompt.svelte';

  const q = $derived(connectionPrompt.current);
</script>

{#if q}
  {#key q.id}
    <div class="cp-card" role="alertdialog" aria-live="polite" data-testid="connection-prompt">
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
  @keyframes cp-in { from { opacity: 0; transform: translate(-50%, -4px); } to { opacity: 1; transform: translate(-50%, 0); } }
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
