<script lang="ts">
  import { uiStore, modelStore } from '../lib/store';
  import { toDisplay, unitLabel } from '../lib/utils/units';
  import { t } from '../lib/i18n';
  import CadProvenancePanel from './CadProvenancePanel.svelte';

  let showProvenance = $state(false);

  function getSelectionText(): string {
    const nNodes = uiStore.selectedNodes.size;
    const nSups = uiStore.selectedSupports.size;
    const nLoads = uiStore.selectedLoads.size;
    // Separate frame/truss elements from shell elements in selectedElements.
    // Check shells first: if an ID exists in both plates/quads AND elements
    // (different entity types with overlapping numeric IDs), shells take priority
    // when the user is in shells selectMode; otherwise elements take priority.
    const shellMode = uiStore.selectMode === 'shells';
    let nElems = 0;
    let nShells = 0;
    for (const id of uiStore.selectedElements) {
      const isShell = modelStore.plates.has(id) || modelStore.quads.has(id);
      const isElem = modelStore.elements.has(id);
      if (isShell && isElem) {
        // Ambiguous — use selectMode to disambiguate
        if (shellMode) nShells++; else nElems++;
      } else if (isShell) {
        nShells++;
      } else if (isElem) {
        nElems++;
      }
    }
    if (nNodes === 0 && nElems === 0 && nShells === 0 && nSups === 0 && nLoads === 0) return '—';
    const parts: string[] = [];
    if (nNodes > 0) parts.push(`${nNodes} ${nNodes > 1 ? t('status.nodesPlural') : t('status.nodes')}`);
    if (nElems > 0) parts.push(`${nElems} ${nElems > 1 ? t('status.elemsPlural') : t('status.elems')}`);
    if (nShells > 0) parts.push(`${nShells} ${nShells > 1 ? t('status.shellsPlural') : t('status.shells')}`);
    if (nSups > 0) parts.push(`${nSups} ${nSups > 1 ? t('status.supportsPlural') : t('status.supports')}`);
    if (nLoads > 0) parts.push(`${nLoads} ${nLoads > 1 ? t('status.loadsPlural') : t('status.loads')}`);
    return parts.join(', ');
  }

  function getModelSummary(): string {
    const n = modelStore.nodes.size;
    const e = modelStore.elements.size;
    const s = modelStore.supports.size;
    const parts: string[] = [];
    if (n > 0) parts.push(`${n} ${n > 1 ? t('status.nodesPlural') : t('status.nodes')}`);
    if (e > 0) parts.push(`${e} ${e > 1 ? t('status.barsPlural') : t('status.bars')}`);
    if (s > 0) parts.push(`${s} ${s > 1 ? t('status.supportsPlural') : t('status.supports')}`);
    return parts.length > 0 ? parts.join(', ') : t('status.empty');
  }
</script>

<!--
  What is left after the ribbon took the rest.
  Tool and build guidance moved to the options bar under the ribbon, next to
  the work; repeating them down here was two places to read one fact. This
  keeps only what is genuinely unique to the bottom edge — where the cursor is,
  what scale is on screen, how big the model is, what is selected.
-->
<div class="status-bar">
  {#if modelStore.model.provenance?.status === 'cad-draft-unreviewed'}
    <button
      class="draft-badge"
      title={t('cad.badgeTooltipView')
        .replace('{file}', modelStore.model.provenance.fileName)
        .replace('{date}', modelStore.model.provenance.importedAtIso.slice(0, 10))}
      onclick={() => { showProvenance = true; }}
    >
      ⚠ {t('cad.draftBadge')}
    </button>
  {/if}
  <CadProvenancePanel open={showProvenance} onclose={() => { showProvenance = false; }} />
  <div class="status-item">
    <span class="status-label">{t('status.pos')}:</span>
    <span class="status-value">
      ({toDisplay(uiStore.worldX, 'length', uiStore.unitSystem).toFixed(2)}, {toDisplay(uiStore.worldY, 'length', uiStore.unitSystem).toFixed(2)}) {unitLabel('length', uiStore.unitSystem)}
    </span>
  </div>
  {#if !uiStore.is3DWorkspace}
    <div class="status-item">
      <span class="status-label">{t('status.zoom')}:</span>
      <span class="status-value">{Math.round(uiStore.zoom)} px/m</span>
    </div>
  {/if}
  <div class="status-item">
    <span class="status-label">{t('status.model')}:</span>
    <span class="status-value">{getModelSummary()}</span>
  </div>
  <div class="status-item">
    <span class="status-label">{t('status.selection')}:</span>
    <span class="status-value">{getSelectionText()}</span>
  </div>
  {#if uiStore.snapToGrid}
    <div class="status-item">
      <span class="status-label">{t('status.grid')}:</span>
      <span class="status-value">{toDisplay(uiStore.gridSize, 'length', uiStore.unitSystem).toFixed(2)} {unitLabel('length', uiStore.unitSystem)}</span>
    </div>
  {/if}
</div>

<style>
  .status-bar {
    display: flex;
    align-items: center;
    gap: 1.1rem;
    padding: 0.3rem 0.9rem;
    font-size: 0.72rem;
    font-family: var(--st-sans);
  }

  .draft-badge {
    background: transparent;
    border: 1px solid var(--st-warn);
    color: var(--st-warn);
    border-radius: 4px;
    font-size: 0.7rem;
    padding: 0.1rem 0.5rem;
    cursor: pointer;
  }
  .draft-badge:hover { background: var(--st-surface-3); }

  .status-item {
    display: flex;
    gap: 0.35rem;
    white-space: nowrap;
  }

  /*
     The label is a quiet caption and the value is the data, so they stop
     reading as equal weight. Values take the mono face for the same reason the
     ribbon's symbols do: they are numbers that change in place, and a
     proportional face makes them jitter.
  */
  .status-label {
    color: var(--st-text-3);
    font-size: 0.66rem;
    text-transform: lowercase;
    letter-spacing: 0.02em;
  }

  .status-value {
    font-family: var(--st-mono);
    /*
       Neutral. `--st-value` is the cyan reserved for a COMPUTED number — a
       force, a displacement — and spending it on the cursor position and the
       grid size made the quietest strip on screen the brightest, competing
       with results it has nothing to do with.
    */
    color: var(--st-text-2);
    font-family: monospace;
  }
</style>
