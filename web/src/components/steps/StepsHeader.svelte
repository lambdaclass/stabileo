<script lang="ts">
  /**
   * The row every step-by-step view opens with, the same one a running
   * advanced function shows: "← Back" to where it was opened from, and the
   * name of what is open. The panel's own ✕ is the only close.
   */
  import type { Snippet } from 'svelte';

  let { backLabel, backTitle, onBack, name, backTestid, actions }: {
    backLabel: string; backTitle: string; onBack: () => void; name: string; backTestid?: string; actions?: Snippet;
  } = $props();
</script>

<div class="sh">
  <button class="sh-back" onclick={onBack} title={backTitle} aria-label={backTitle} data-testid={backTestid}>← {backLabel}</button>
  <span class="sh-name">{name}</span>
  {#if actions}<span class="sh-actions">{@render actions()}</span>{/if}
</div>

<style>
  /* The same measures as the running header in ToolbarAdvanced (.adv-running). */
  .sh {
    display: flex; align-items: center; gap: 0.5rem; flex: none;
    padding: 0.35rem 0.65rem 0.45rem; border-bottom: 1px solid var(--st-hair);
  }
  .sh-back {
    flex: none; background: none; border: 1px solid var(--st-hair-strong); color: var(--st-text-2);
    font-family: inherit; font-size: 0.66rem; line-height: 1; padding: 0.28rem 0.5rem; cursor: pointer;
    border-radius: var(--st-radius);
  }
  .sh-back:hover { border-color: var(--st-accent); color: var(--st-accent); }
  .sh-name {
    font-family: var(--st-mono); font-size: 0.68rem; letter-spacing: 0.11em; text-transform: uppercase;
    color: var(--st-accent); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .sh-actions { margin-left: auto; display: flex; gap: 0.3rem; flex: none; }
  .sh-actions :global(button) {
    background: none; border: 1px solid var(--st-hair-strong); color: var(--st-text-2); font-family: inherit;
    font-size: 0.66rem; line-height: 1; padding: 0.28rem 0.5rem; cursor: pointer; border-radius: var(--st-radius);
  }
  .sh-actions :global(button:hover:not(:disabled)) { border-color: var(--st-accent); color: var(--st-accent); }
  .sh-actions :global(button.on) { border-color: var(--st-accent); color: var(--st-accent); }
  .sh-actions :global(button:disabled) { opacity: 0.35; cursor: default; }
  @media (pointer: coarse) { .sh-back, .sh-actions :global(button) { min-height: 32px; } }
</style>
