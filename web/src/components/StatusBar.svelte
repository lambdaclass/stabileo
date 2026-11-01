<script lang="ts">
  import '../styles/viewer-chrome.css';
  import { displayUnits } from '../lib/store/display-units.svelte';
  import { uiStore, modelStore } from '../lib/store';
  import { toDisplay, unitLabel } from '../lib/utils/units';
  import { t, i18n } from '../lib/i18n';
  import { APP_VERSION } from '../lib/build-info';
  import { RESULTS_CHANGED_IN, releaseNotesUrl } from '../lib/release/whats-new';
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
    // A shell clicked in the viewport is selected in its own channel, keyed "p{id}" / "q{id}".
    for (const key of uiStore.selectedShells) {
      const id = Number(key.slice(1));
      if (key[0] === 'p' ? modelStore.plates.has(id) : modelStore.quads.has(id)) nShells++;
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
  /** A length in the chosen units, with the reader's decimals for lengths (2 when unset). */
  function len(v: number): string {
    const d = displayUnits.decimals.length ?? 2;
    const s = toDisplay(v, 'length', uiStore.unitSystem).toFixed(d);
    return Number(s) === 0 ? (0).toFixed(d) : s;
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
      ({len(uiStore.worldX)}, {len(uiStore.worldY)}) {unitLabel('length', uiStore.unitSystem)}
    </span>
  </div>
  {#if !uiStore.is3DWorkspace}
    <div class="status-item">
      <span class="status-label">{t('status.zoom')}:</span>
      <span class="status-value">{uiStore.zoom >= 10 ? Math.round(uiStore.zoom) : +uiStore.zoom.toPrecision(2)} px/m</span>
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
      <span class="status-value">{len(uiStore.gridSize)} {unitLabel('length', uiStore.unitSystem)}</span>
    </div>
  {/if}
  <a
    class="status-version"
    href={releaseNotesUrl(i18n.locale, APP_VERSION === 'dev' ? RESULTS_CHANGED_IN : APP_VERSION)}
    target="_blank"
    rel="noopener noreferrer"
    title={t('whatsNew.notesLink')}
    data-testid="app-version"
  >v{APP_VERSION}</a>
</div>

<style>

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

  .status-version {
    margin-left: auto;
    color: var(--st-text-3);
    font-family: var(--st-mono);
    font-size: 0.66rem;
    text-decoration: none;
    white-space: nowrap;
  }
  .status-version:hover { color: var(--st-text); text-decoration: underline; }

</style>
