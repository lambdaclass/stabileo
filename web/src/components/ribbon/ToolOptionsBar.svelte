<script lang="ts">
  import { t } from '../../lib/i18n';
  import { IL_QUANTITY_GROUPS } from '../../lib/influence-line-quantities';
  import { uiStore } from '../../lib/store/ui.svelte';
  import { modelStore } from '../../lib/store/model.svelte';
  import { resultsStore } from '../../lib/store/results.svelte';
  import ToolNodeOptions from '../floating-tools/ToolNodeOptions.svelte';
  import ToolElementOptions from '../floating-tools/ToolElementOptions.svelte';
  import ToolSupportOptions from '../floating-tools/ToolSupportOptions.svelte';
  import ToolLoadOptions from '../floating-tools/ToolLoadOptions.svelte';
  import SelectedEntityPanel from '../floating-tools/SelectedEntityPanel.svelte';

  /**
   * Contextual options for the armed tool, directly under the ribbon.
   *
   * ── Why here and not in the side panel ────────────────────────────────
   *
   * These option components were written as horizontal strips: chips and
   * checkboxes in a row, separated by thin rules. Putting them in a 300 px
   * vertical panel did not just look bad, it fought their layout — and it also
   * broke the connection to the button that summoned them, which sat at the top
   * of the window while its options appeared at the far right.
   *
   * Photoshop, Paint and Word all solve this the same way: a slim options bar
   * immediately below the toolbar, changing with the selected tool. The
   * proximity IS the explanation — you press a tool and its settings appear
   * directly beneath it, so nothing has to tell you they are related.
   *
   * The right panel keeps what genuinely needs area and persists across tools:
   * results, advanced analysis, examples, project, settings.
   *
   * ── Model state ───────────────────────────────────────────────────────
   *
   * The bar always renders, even for tools with no options, because it carries
   * the model's state on its right edge — see below.
   */

  /**
   * The build progression, lifted out of the bottom status bar.
   *
   * This guidance already existed and was already translated — it sat at the
   * very bottom of the window, the furthest possible point from where the work
   * happens, so nobody read it. Same logic, same strings, next to the tools.
   *
   * There is deliberately no "results are stale" state: the store carries no
   * flag for it, and an indicator that cannot actually detect the condition is
   * worse than none, because it teaches the user to trust a light that lies.
   */
  const state = $derived.by(() => {
    if (resultsStore.results != null || resultsStore.results3D != null) {
      return { key: 'status.resolved', tone: 'ok' };
    }
    const n = modelStore.nodes.size;
    if (n === 0) return { key: 'status.hintCreateNodes', tone: 'idle' };
    if (modelStore.elements.size === 0) return { key: 'status.hintConnectBars', tone: 'idle' };
    if (modelStore.supports.size === 0) return { key: 'status.hintAddSupports', tone: 'idle' };
    if (modelStore.model.loads.length === 0) return { key: 'status.hintAddLoads', tone: 'idle' };
    return { key: 'status.hintReadyToSolve', tone: 'warn' };
  });

  /*
   * `influenceLine` belongs here too. It is armed from Advanced analysis, not
   * from the ribbon, and its options — which reaction or internal force the
   * line is drawn for — used to live in the floating strip. With that strip
   * gone on desktop, arming it left no way to choose the quantity at all: a
   * working feature reachable but unusable.
   */
  const HAS_OPTIONS = ['select', 'node', 'element', 'support', 'load', 'influenceLine'];
  const showOptions = $derived(HAS_OPTIONS.includes(uiStore.currentTool));
</script>

<div class="tool-bar" data-testid="tool-options-bar">
  <div class="tb-opts" data-testid="tool-options">
    {#if showOptions}
      <span class="tb-tool-name">{t(`float.${uiStore.currentTool}`)}</span>
      <span class="tb-sep" aria-hidden="true"></span>
      <!--
        No select options here any more: they live in the Selection panel, so
        there is one control for one setting rather than two that can disagree.
      -->
      {#if uiStore.currentTool === 'node'}
        <ToolNodeOptions />
      {:else if uiStore.currentTool === 'element'}
        <ToolElementOptions />
      {:else if uiStore.currentTool === 'support'}
        <ToolSupportOptions />
      {:else if uiStore.currentTool === 'load'}
        <ToolLoadOptions />
      {:else if uiStore.currentTool === 'influenceLine'}
        {#each IL_QUANTITY_GROUPS as group, gi}
          {#if gi > 0}<span class="tb-sep" aria-hidden="true"></span>{/if}
          <span class="tb-group-label">{t(group.labelKey)}</span>
          {#each group.quantities as q}
            <button class="tb-btn" class:on={uiStore.ilQuantity === q.id} onclick={() => (uiStore.ilQuantity = q.id)}>{t(q.labelKey)}</button>
          {/each}
        {/each}
      {/if}
    {:else}
      <span class="tb-hint">{t('float.' + uiStore.currentTool)}</span>
    {/if}
  </div>

  <!--
    What is selected, restored. It lived in the floating strip, which desktop no
    longer renders, so selecting a member stopped showing its properties — the
    single most-used read-out in the app, silently gone.
  -->
  <div class="tb-selection"><SelectedEntityPanel /></div>

  <div class="tb-state" data-testid="model-state" data-tone={state.tone}>
    <span class="tb-dot" data-tone={state.tone} aria-hidden="true"></span>
    <span class="tb-state-text">{t(state.key)}</span>
  </div>
</div>

<style>
  .tool-bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-height: 34px;
    padding: 0.2rem 0.6rem;
    background: var(--st-surface-2);
    border-bottom: 1px solid var(--st-hair);
    font-family: var(--st-sans);
    font-size: 0.82rem;
    color: var(--st-text-2);
    flex: none;
  }

  .tb-opts {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: thin;
    flex: 1;
    min-width: 0;
  }

  /*
     The tool's name leads the bar so the strip is self-explaining: these
     controls belong to THAT tool, not to the document.
  */
  .tb-tool-name {
    font-family: var(--st-mono);
    font-size: 0.68rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--st-accent);
    white-space: nowrap;
    flex: none;
  }

  .tb-sep {
    width: 1px;
    height: 16px;
    background: var(--st-hair);
    flex: none;
  }

  .tb-hint { color: var(--st-text-3); font-size: 0.78rem; }

  .tb-group-label {
    font-size: 0.7rem;
    color: var(--st-text-3);
    white-space: nowrap;
    flex: none;
  }

  .tb-btn {
    background: none;
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    font-size: 0.75rem;
    padding: 0.2rem 0.45rem;
    cursor: pointer;
    white-space: nowrap;
    flex: none;
  }

  .tb-btn:hover { background: var(--st-surface-3); color: var(--st-text); }
  .tb-btn.on { color: var(--st-accent); border-color: var(--st-accent); }

  .tb-selection { display: flex; align-items: center; flex: none; }

  /* ── Model state ──────────────────────────────────────────────────── */

  .tb-state {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex: none;
    font-family: var(--st-mono);
    font-size: 0.7rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .tb-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex: none;
  }

  .tb-dot[data-tone='ok'] { background: var(--st-ok); }
  .tb-dot[data-tone='warn'] { background: var(--st-warn); }
  .tb-dot[data-tone='idle'] { background: var(--st-text-3); }

  .tb-state[data-tone='ok'] .tb-state-text { color: var(--st-ok); }
  .tb-state[data-tone='warn'] .tb-state-text { color: var(--st-warn); }
  .tb-state[data-tone='idle'] .tb-state-text { color: var(--st-text-3); }

  @media (max-width: 900px) {
    .tb-state-text { display: none; }
  }
</style>
