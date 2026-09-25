<script lang="ts">
  import { t } from '../../lib/i18n';
  import { uiStore } from '../../lib/store/ui.svelte';
  import { modelStore } from '../../lib/store/model.svelte';
  import { resultsStore } from '../../lib/store/results.svelte';
  import SelectedEntityPanel from '../floating-tools/SelectedEntityPanel.svelte';
  import SelectionDeleteButton from './SelectionDeleteButton.svelte';
  import ToolOptions from './ToolOptions.svelte';

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
   * ── On a phone, only while something is selected ──────────────────
   * The armed tool's options live in the modelling sheet there, between its
   * tool buttons and its table (DataTable), next to what they configure; a
   * row of them under the ribbon cost the model a band of screen and read
   * as detached. What stays here is what a selection needs wherever you are:
   * its read-out and the delete button.
   */
  const phone = $derived(uiStore.isMobile);
  const hasSelection = $derived(
    uiStore.selectedNodes.size + uiStore.selectedElements.size + uiStore.selectedSupports.size
      + uiStore.selectedLoads.size + uiStore.selectedShells.size > 0,
  );
</script>

{#if !phone || hasSelection}
<div class="tool-bar" class:phone data-testid="tool-options-bar">
  {#if !phone}
    <div class="tb-opts" data-testid="tool-options">
      <ToolOptions />
    </div>
  {/if}

  <!--
    What is selected, restored. It lived in the floating strip, which desktop no
    longer renders, so selecting a member stopped showing its properties — the
    single most-used read-out in the app, silently gone.
  -->
  <div class="tb-selection"><SelectedEntityPanel /></div>
  <!-- Delete what is selected: present only while something is (a phone has no Delete key). -->
  <SelectionDeleteButton />

  {#if !phone}
    <div class="tb-state" data-testid="model-state" data-tone={state.tone}>
      <span class="tb-dot" data-tone={state.tone} aria-hidden="true"></span>
      <span class="tb-state-text">{t(state.key)}</span>
    </div>
  {/if}
</div>
{/if}

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

  .tb-selection { display: flex; align-items: center; flex: none; }
  .tool-bar.phone { justify-content: space-between; }
  .tool-bar.phone .tb-selection { flex: 1; min-width: 0; overflow-x: auto; }

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
