<script lang="ts">
  import { uiStore, modelStore, resultsStore } from '../lib/store';
  import { toDisplay, unitLabel } from '../lib/utils/units';
  import { t } from '../lib/i18n';

  function getToolName(tool: string): string {
    const keyMap: Record<string, string> = {
      select: 'status.toolSelect',
      node: 'status.toolNode',
      element: 'status.toolElement',
      support: 'status.toolSupport',
      load: 'status.toolLoad',
      pan: 'status.toolPan',
      influenceLine: 'status.toolInfluence',
    };
    return keyMap[tool] ? t(keyMap[tool]) : tool;
  }

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

  const hint = $derived.by(() => {
    const n = modelStore.nodes.size;
    const e = modelStore.elements.size;
    const s = modelStore.supports.size;
    const l = modelStore.model.loads.length;
    if (resultsStore.results) return { text: t('status.resolved'), color: '#4caf50' };
    // In Education mode, suppress step-by-step build guidance — exercises auto-load
    if (uiStore.appMode === 'educativo') return { text: '', color: 'transparent' };
    if (n === 0) return { text: t('status.hintCreateNodes'), color: '#888' };
    if (e === 0) return { text: t('status.hintConnectBars'), color: '#888' };
    if (s === 0) return { text: t('status.hintAddSupports'), color: '#888' };
    if (l === 0) return { text: t('status.hintAddLoads'), color: '#888' };
    return { text: t('status.hintReadyToSolve'), color: '#f0a500' };
  });
</script>

<div class="status-bar">
  <div class="status-item">
    <span class="status-label">{t('status.tool')}:</span>
    <span class="status-value">{getToolName(uiStore.currentTool)}</span>
  </div>
  <div class="status-item">
    <span class="status-label">{t('status.pos')}:</span>
    <span class="status-value">
      ({toDisplay(uiStore.worldX, 'length', uiStore.unitSystem).toFixed(2)}, {toDisplay(uiStore.worldY, 'length', uiStore.unitSystem).toFixed(2)}) {unitLabel('length', uiStore.unitSystem)}
    </span>
  </div>
  {#if uiStore.analysisMode !== '3d'}
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
  <div class="status-item">
    <span class="status-hint" style="color: {hint.color}">{hint.text}</span>
  </div>
</div>

<style>
  .status-bar {
    display: flex;
    gap: 1.5rem;
    padding: 0.35rem 1rem;
    font-size: 0.75rem;
  }

  .status-item {
    display: flex;
    gap: 0.35rem;
    white-space: nowrap;
  }

  .status-label {
    color: #888;
  }

  .status-value {
    color: #4ecdc4;
    font-family: monospace;
  }

  .status-hint {
    font-weight: 600;
    font-style: italic;
  }
</style>
