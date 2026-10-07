<script lang="ts">
  /**
   * The armed tool's name, its options and its hint — the strip the options
   * bar shows under the ribbon on a desktop, and the modelling sheet shows
   * between its tool buttons and its table on a phone (see ToolOptionsBar and
   * DataTable). One component, so the two places cannot drift apart.
   */
  import { t } from '../../lib/i18n';
  import { IL_QUANTITY_GROUPS } from '../../lib/influence-line-quantities';
  import { uiStore } from '../../lib/store/ui.svelte';
  import { editingKind } from '../../lib/store/selection-prune';
  import ToolNodeOptions from '../floating-tools/ToolNodeOptions.svelte';
  import ToolElementOptions from '../floating-tools/ToolElementOptions.svelte';
  import ToolSupportOptions from '../floating-tools/ToolSupportOptions.svelte';
  import ToolLoadOptions from '../floating-tools/ToolLoadOptions.svelte';
  import SelectedEntityPanel from '../floating-tools/SelectedEntityPanel.svelte';

  /*
   * `influenceLine` belongs here too. It is armed from Advanced analysis, not
   * from the ribbon, and its options — which reaction or internal force the
   * line is drawn for — used to live in the floating strip. With that strip
   * gone on desktop, arming it left no way to choose the quantity at all: a
   * working feature reachable but unusable.
   */
  const HAS_OPTIONS = ['select', 'node', 'element', 'support', 'load', 'influenceLine'];
  const showOptions = $derived(HAS_OPTIONS.includes(uiStore.currentTool));

  /*
   * ── Create, or edit ──────────────────────────────────────────────────
   * One row for supports and loads, in one of two modes. Armed from the
   * ribbon, it creates. With a support or a load selected (with the pointer,
   * or by a row of its table), it edits that one, in another colour, and its
   * ✓ goes back to creating. The edit used to open at the other end of the
   * bar while the create row stayed here, two answers to one question.
   */
  // Only a support or load the model still has: one deleted from its table or undone edits nothing.
  const editing = $derived(editingKind());
  const creating = $derived(!editing && (uiStore.currentTool === 'support' || uiStore.currentTool === 'load'));
</script>

{#if editing}
  <span class="tb-tool-name tb-editing" data-testid="tool-mode-edit">{t(editing === 'load' ? 'float.editLoad' : 'float.editSupport')}</span>
  <span class="tb-sep" aria-hidden="true"></span>
  <SelectedEntityPanel inBar />
{:else if showOptions}
  <span class="tb-tool-name" data-testid={creating ? 'tool-mode-create' : undefined}>{t(creating ? (uiStore.currentTool === 'load' ? 'float.createLoad' : 'float.createSupport') : `float.${uiStore.currentTool}`)}</span>
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

<style>
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

  /* Editing reads apart from creating at a glance: the warm accent of a change in progress. */
  .tb-tool-name.tb-editing { color: var(--st-amber-text, #d9a441); }

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

</style>
