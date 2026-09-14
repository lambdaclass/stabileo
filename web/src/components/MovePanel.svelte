<script lang="ts">
  /**
   * Move what — the view, or the model.
   *
   * ── Why this is a panel and not two ribbon buttons ─────────────────
   *
   * Pan and Select were taken out of the ribbon for a good reason: every
   * other command there opens a panel, so the highlight means "this is what
   * the panel is showing", and a pointer mode shows nothing. After a solve, a
   * lit diagram and a lit Select both claimed to be the current activity.
   *
   * This command does open a panel, so the rule holds. And it has something
   * to say: moving the VIEW and moving the MODEL are different acts that
   * share one gesture, and the difference is worth one deliberate click
   * rather than being discovered.
   *
   * ── The gesture this replaces ──────────────────────────────────────
   *
   * Repositioning a node lived inside the NODE tool's create-mode: arm Node,
   * drag an existing node and it moves; miss it by half a metre and you have
   * placed a new one. One gesture, two outcomes, chosen by whether the press
   * landed on something — and nothing on screen said so. In `moveNodes` a
   * press that is not on a node does nothing at all.
   */
  import { uiStore } from '../lib/store';
  import { t } from '../lib/i18n';

  const mode = $derived(uiStore.currentTool === 'moveNodes' ? 'nodes' : 'view');

  function pick(next: 'view' | 'nodes') {
    /*
     * Remembered on the store, not inferred from the pointer: the choice has
     * to survive going somewhere else and coming back. See `moveMode`.
     */
    uiStore.moveMode = next;
    uiStore.currentTool = next === 'nodes' ? 'moveNodes' : 'pan';
  }
</script>

<div class="mv" data-testid="move-panel">
  <p class="mv-lead">{t('move.lead')}</p>

  <button
    class="mv-opt"
    class:on={mode === 'view'}
    onclick={() => pick('view')}
    data-testid="move-view"
  >
    <span class="mv-glyph" aria-hidden="true">✥</span>
    <span>
      <strong>{t('move.view')}</strong>
      <em>{t('move.viewWhat')}</em>
    </span>
  </button>

  <button
    class="mv-opt"
    class:on={mode === 'nodes'}
    onclick={() => pick('nodes')}
    data-testid="move-nodes"
  >
    <span class="mv-glyph" aria-hidden="true">⊹</span>
    <span>
      <strong>{t('move.nodes')}</strong>
      <em>{t('move.nodesWhat')}</em>
    </span>
  </button>

  {#if mode === 'nodes'}
    <!--
      Said here rather than left to be discovered: a reader dragging a node
      needs to know the bars follow, and that a miss does nothing.
    -->
    <p class="mv-note">{t('move.nodesNote')}</p>
  {/if}
</div>

<style>
  .mv {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.72rem;
  }

  .mv-lead {
    margin: 0;
    color: var(--st-text-2);
  }

  .mv-opt {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    width: 100%;
    padding: 0.45rem 0.5rem;
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius);
    background: var(--st-surface-2);
    color: var(--st-text-2);
    text-align: left;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
  }

  .mv-opt:hover { border-color: var(--st-hair-strong); }

  .mv-opt.on {
    border-color: var(--st-accent);
    background: var(--st-selected-bg);
  }

  .mv-glyph {
    font-size: 0.95rem;
    line-height: 1.1;
    color: var(--st-text-3);
  }

  .mv-opt.on .mv-glyph { color: var(--st-accent); }

  .mv-opt strong {
    display: block;
    color: var(--st-text);
    font-weight: 600;
  }

  .mv-opt em {
    display: block;
    font-style: normal;
    color: var(--st-text-3);
    line-height: 1.4;
  }

  .mv-note {
    margin: 0;
    font-size: 0.65rem;
    line-height: 1.45;
    color: var(--st-text-3);
  }
</style>
