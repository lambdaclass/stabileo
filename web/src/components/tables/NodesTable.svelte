<script lang="ts">
  import { selectRow, frameRow, focusRow, rowSelected } from '../../lib/actions/table-row-select';
  import { modelStore, uiStore, historyStore, resultsStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import { TWO_D_HORIZONTAL_AXIS_LABEL, TWO_D_VERTICAL_AXIS_LABEL } from '../../lib/geometry/coordinate-system';
  import { unitQ } from '../../lib/store/display-units.svelte';
  import UnitInput from '../UnitInput.svelte';

  const nodesArr = $derived([...modelStore.nodes.values()]);

  let newNodeX = $state(0);
  let newNodeY = $state(0);
  let newNodeZ = $state(0);

  // The fields show the chosen unit system (UnitInput), so these take SI metres.
  function updateNodeX(id: number, x: number) {
    if (!Number.isFinite(x)) return;
    const node = modelStore.getNode(id);
    if (!node || node.x === x) return;
    historyStore.pushState();
    modelStore.updateNode(id, x, node.y);
    resultsStore.clear();
  }

  function updateNodeY(id: number, y: number) {
    if (!Number.isFinite(y)) return;
    const node = modelStore.getNode(id);
    if (!node || node.y === y) return;
    historyStore.pushState();
    modelStore.updateNode(id, node.x, y);
    resultsStore.clear();
  }

  function updateNodeZ(id: number, z: number) {
    if (!Number.isFinite(z)) return;
    historyStore.pushState();
    modelStore.updateNodeZ(id, z);
    resultsStore.clear();
  }

  function deleteNode(id: number) {
    modelStore.removeNode(id);
  }

  function addNode() {
    // Welded, so a row typed on top of an existing node reuses it instead of
    // stacking a twin. No pushState: the mutation pushes its own undo step.
    if (uiStore.is3DWorkspace) {
      modelStore.addNodeWelded(newNodeX, newNodeY, newNodeZ);
    } else {
      modelStore.addNodeWelded(newNodeX, newNodeY);
    }
    resultsStore.clear();
  }
</script>

{#if nodesArr.length > 0}
  <table>
    <thead>
      <tr><th>ID</th><th>{TWO_D_HORIZONTAL_AXIS_LABEL} ({unitQ('length')})</th><th>{uiStore.is3DWorkspace ? 'Y' : TWO_D_VERTICAL_AXIS_LABEL} ({unitQ('length')})</th>{#if uiStore.is3DWorkspace}<th>Z ({unitQ('length')})</th>{/if}<th></th></tr>
    </thead>
    <tbody>
      {#each nodesArr as node}
        <tr class:row-sel={rowSelected('node', node.id)} onclick={(e) => selectRow(e, 'node', node.id)}
          ondblclick={(e) => frameRow(e, 'node', node.id)} onfocusin={(e) => focusRow(e, 'node', node.id)}>
          <td class="id-cell">{node.id}</td>
          <td><UnitInput value={node.x} qty="length" unit={false} step="0.001" onchange={(v) => updateNodeX(node.id, v)} /></td>
          <td><UnitInput value={node.y} qty="length" unit={false} step="0.001" onchange={(v) => updateNodeY(node.id, v)} /></td>
          {#if uiStore.is3DWorkspace}
            <td><UnitInput value={node.z ?? 0} qty="length" unit={false} step="0.001" onchange={(v) => updateNodeZ(node.id, v)} /></td>
          {/if}
          <td><button class="del" onclick={() => deleteNode(node.id)}>&#10005;</button></td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}
<div class="table-footer">
  <div class="add-row">
    <span class="add-label">{TWO_D_HORIZONTAL_AXIS_LABEL}:</span>
    <UnitInput value={newNodeX} qty="length" unit={false} step="0.5" inputClass="add-input" onchange={(v) => (newNodeX = v)} />
    <span class="add-label">{uiStore.is3DWorkspace ? 'Y' : TWO_D_VERTICAL_AXIS_LABEL}:</span>
    <UnitInput value={newNodeY} qty="length" unit={false} step="0.5" inputClass="add-input" onchange={(v) => (newNodeY = v)} />
    {#if uiStore.is3DWorkspace}
      <span class="add-label">Z:</span>
      <UnitInput value={newNodeZ} qty="length" unit={false} step="0.5" inputClass="add-input" onchange={(v) => (newNodeZ = v)} />
    {/if}
    <button class="add-btn" onclick={addNode}>{t('table.addNode')}</button>
  </div>
</div>

<style>
  tr.row-sel td { background: var(--st-selected-bg); }
  table {
    width: max-content;
    min-width: 100%;
    border-collapse: collapse;
  }

  th {
    text-align: left;
    padding: 0.25rem 0.35rem;
    color: var(--st-text-3);
    font-weight: 500;
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    border-bottom: 1px solid var(--st-surface-3);
    position: sticky;
    top: 0;
    background: var(--st-surface-2);
    white-space: nowrap;
  }

  td {
    padding: 0.2rem 0.35rem;
    border-bottom: 1px solid var(--st-bg);
    color: var(--st-text-2);
    white-space: nowrap;
  }

  .id-cell {
    color: var(--st-value);
    font-weight: 600;
  }

  /* The row fields live inside UnitInput, out of reach of a scoped selector. */
  td :global(input[type="number"]) {
    width: 55px;
    padding: 0.1rem 0.2rem;
    background: var(--st-surface-3);
    border: 1px solid var(--st-surface-3);
    border-radius: 3px;
    color: var(--st-text);
    font-size: 0.7rem;
  }

  .del {
    background: none;
    border: none;
    color: var(--st-text-3);
    cursor: pointer;
    font-size: 0.8rem;
    padding: 0.1rem 0.3rem;
  }
  .del:hover {
    color: var(--st-accent);
  }

  tr:hover {
    background: rgba(127, 212, 204, 0.05);
  }

  .table-footer {
    padding: 0.5rem;
    border-top: 1px solid var(--st-bg);
  }

  .add-row {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    flex-wrap: wrap;
  }

  .add-row .add-btn {
    width: auto;
    flex-shrink: 0;
  }

  .add-label {
    font-size: 0.7rem;
    color: var(--st-text-3);
    flex-shrink: 0;
  }

  .add-row :global(.add-input) {
    background: var(--st-surface-2);
    color: var(--st-text-2);
    border: 1px solid var(--st-surface-3);
    border-radius: 3px;
    padding: 0.2rem 0.3rem;
    font-size: 0.75rem;
    width: 60px;
  }

  .add-btn {
    width: 100%;
    padding: 0.4rem 0.5rem;
    background: var(--st-surface-3);
    border: 1px solid var(--st-surface-3);
    border-radius: 4px;
    color: var(--st-value);
    cursor: pointer;
    font-size: 0.8rem;
    transition: all 0.2s;
  }

  .add-btn:hover {
    background: var(--st-surface-3);
    color: white;
  }
</style>
