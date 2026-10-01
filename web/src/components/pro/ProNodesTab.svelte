<script lang="ts">
  import { modelStore, uiStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import DrawInModelButton from './DrawInModelButton.svelte';
  import { TWO_D_VERTICAL_AXIS_LABEL } from '../../lib/geometry/coordinate-system';
  import { findCoincidentNode } from '../../lib/engine/mesh-weld';
  import { mergeNodesInto } from '../../lib/model/edit/cleanup';

  interface NodeRow {
    id: number | null;  // null = unsaved new row
    x: string;
    y: string;
    z: string;
  }

  let rows = $state<NodeRow[]>([]);
  let pasteError = $state<string | null>(null);
  let selectedRowIdx = $state<number | null>(null);

  // Sync rows from modelStore on mount and when nodes change.
  // Preserve unsaved rows (id === null) so Add → type → commit works.
  $effect(() => {
    const storeNodes = [...modelStore.nodes.values()];
    const savedRows = rows.filter(r => r.id !== null);
    const unsavedRows = rows.filter(r => r.id === null);
    const storeIds = storeNodes.map(n => n.id).join(',');
    const rowIds = savedRows.map(r => r.id).join(',');
    if (storeIds !== rowIds || storeNodes.length !== savedRows.length) {
      rows = [
        ...storeNodes.map(n => ({
          id: n.id,
          x: String(n.x),
          y: String(n.y),
          z: String(n.z ?? 0),
        })),
        ...unsavedRows,
      ];
    }
  });

  function parseNumber(s: string): number | null {
    // Accept both . and , as decimal separator
    const cleaned = s.trim().replace(',', '.');
    if (cleaned === '') return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }

  function addEmptyRow() {
    rows = [...rows, { id: null, x: '', y: '', z: '' }];
  }

  function commitRow(idx: number) {
    const row = rows[idx];
    if (!row) return;
    const x = parseNumber(row.x);
    const y = parseNumber(row.y);
    const z = row.z.trim() === '' ? 0 : parseNumber(row.z);
    if (x === null || y === null || z === null) return;

    if (row.id === null) {
      // New node — or the one already at these coordinates: a twin in the same
      // place looks joined and analyses as a cut.
      const realId = modelStore.addNodeWelded(x, y, z);
      rows[idx] = { ...rows[idx], id: realId };
    } else {
      // Update existing node. `updateNode` pushes no undo of its own — its callers are expected
      // to — so without the batch this edit could not be undone. Moved onto another node, it
      // becomes that node: left as a twin in the same place it would look joined and analyse
      // as a cut, the defect the welds exist to prevent.
      const id = row.id;
      const onto = findCoincidentNode([...modelStore.nodes.values()].filter((n) => n.id !== id), x, y, z);
      if (onto !== null) {
        modelStore.batch(() => { modelStore.updateNode(id, x, y, z); mergeNodesInto(new Map([[id, onto]])); });
      } else {
        modelStore.batch(() => modelStore.updateNode(id, x, y, z));
      }
    }
  }

  function handleBlur(e: FocusEvent, idx: number) {
    // A new row's blank Z is not an intentional zero while the user is still
    // moving between its fields. Weld only on leaving the row's fields or pressing Enter/Apply.
    // Its fields, not the row: Tab from Z lands on the row's own × button, which has no blur of
    // its own, and a row that waited for focus to leave the whole <tr> was never committed.
    const rowElement = (e.currentTarget as HTMLElement).closest('tr');
    if (rows[idx]?.id === null && e.relatedTarget instanceof HTMLInputElement && rowElement?.contains(e.relatedTarget)) return;
    commitRow(idx);
  }

  function deleteRow(idx: number) {
    const row = rows[idx];
    if (row.id !== null) {
      modelStore.removeNode(row.id);
    }
    rows = rows.filter((_, i) => i !== idx);
  }

  function handleKeydown(e: KeyboardEvent, idx: number) {
    if (e.key === 'Enter') {
      commitRow(idx);
      // If last row, add a new one
      if (idx === rows.length - 1) {
        addEmptyRow();
        // Focus the X input of the new row after a tick
        setTimeout(() => {
          const inputs = document.querySelectorAll('.pro-nodes-table input[data-col="x"]');
          const lastInput = inputs[inputs.length - 1] as HTMLInputElement;
          lastInput?.focus();
        }, 10);
      }
    }
  }

  function handlePaste(e: ClipboardEvent) {
    const text = e.clipboardData?.getData('text');
    if (!text) return;

    // Check if it looks like tabular data (has tabs or multiple lines)
    if (!text.includes('\t') && !text.includes('\n')) return;

    e.preventDefault();
    pasteError = null;

    const lines = text.trim().split('\n').filter(l => l.trim());
    const points: Array<[number, number, number]> = [];
    // Validate before mutating, so an invalid row cannot leave a partial import.
    for (let i = 0; i < lines.length; i++) {
      const parts = lines[i].split('\t').map(s => s.trim());
      if (parts.length < 2) {
        pasteError = t('pro.pasteRowError').replace('{n}', String(i + 1)).replace('{cols}', '2').replace('{names}', 'X, Y');
        return;
      }
      const x = parseNumber(parts[0]);
      const y = parseNumber(parts[1]);
      const z = parts.length < 3 || parts[2] === '' ? 0 : parseNumber(parts[2]);
      if (x === null || y === null || z === null) {
        pasteError = t('pro.pasteInvalidNum').replace('{n}', String(i + 1));
        return;
      }
      points.push([x, y, z]);
    }

    // The effect reads the canonical coordinates of reused nodes, once per id. One undo step,
    // and none when every row is a node already there.
    if (points.length) modelStore.addNodesWelded(points);
  }

  function handleRowClick(idx: number) {
    selectedRowIdx = idx;
    const row = rows[idx];
    if (row.id !== null) {
      uiStore.selectMode = 'nodes';
      uiStore.setSelection(new Set([row.id]), new Set());
    }
  }

  // Listen for node selection from viewport → highlight row
  $effect(() => {
    if (uiStore.selectedNodes.size === 1) {
      const nodeId = [...uiStore.selectedNodes][0];
      const idx = rows.findIndex(r => r.id === nodeId);
      if (idx >= 0) selectedRowIdx = idx;
    }
  });

  function commitAll() {
    for (let i = 0; i < rows.length; i++) {
      commitRow(i);
    }
  }

  function clearAll() {
    for (const row of rows) {
      if (row.id !== null) modelStore.removeNode(row.id);
    }
    rows = [];
  }

  const nodeCount = $derived(rows.filter(r => r.id !== null).length);
</script>

<div class="pro-nodes">
  <div class="pro-nodes-header">
    <span class="pro-nodes-count">{t('pro.nNodes').replace('{n}', String(nodeCount))}</span>
    <!--
      ── Two different verbs, two different places ──────────────────────
      "Draw a node" puts the pointer to work in the MODEL, so it sits at the
      top with the other things you do to this kind of entity. "+ Node" adds
      a ROW to the table, so it belongs to the table — which is where Basic
      has always kept it. They were side by side and both read as "make a
      node", leaving the reader to discover which one used the mouse.
    -->
    <div class="pro-nodes-actions">
      <DrawInModelButton tool="node" label={t('pro.oneNode')} icon="node" testid="draw-node" />
      <button class="pro-btn pro-btn-sm" onclick={commitAll} title={t('pro.apply')} data-testid="pro-apply-nodes">{t('pro.apply')}</button>
      <button class="pro-btn pro-btn-sm pro-btn-danger" onclick={clearAll} title={t('pro.clear')}>{t('pro.clear')}</button>
    </div>
  </div>

  {#if pasteError}
    <div class="pro-paste-error">{pasteError}</div>
  {/if}

  <!--
    The paste tip is gone. Pasting X, Y, Z from a spreadsheet still works —
    `handlePaste` is untouched — but a permanent line of instruction above a
    table is read once and then occupies the panel forever.
  -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="pro-nodes-table-wrap" onpaste={handlePaste}>
    <table class="pro-nodes-table">
      <thead>
        <tr>
          <th class="col-id">ID</th>
          <th class="col-coord">X (m)</th>
          <th class="col-coord">{uiStore.is3DWorkspace ? 'Y' : TWO_D_VERTICAL_AXIS_LABEL} (m)</th>
          <th class="col-coord">Z (m)</th>
          <th class="col-actions"></th>
        </tr>
      </thead>
      <tbody>
        {#each rows as row, idx}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <tr
            class:selected={selectedRowIdx === idx}
            class:unsaved={row.id === null}
            onclick={() => handleRowClick(idx)}
          >
            <td class="col-id">{row.id ?? '—'}</td>
            <td class="col-coord">
              <input
                type="text"
                data-col="x"
                bind:value={row.x}
                onkeydown={(e) => handleKeydown(e, idx)}
                onblur={(e) => handleBlur(e, idx)}
                placeholder="0"
              />
            </td>
            <td class="col-coord">
              <input
                type="text"
                data-col="y"
                bind:value={row.y}
                onkeydown={(e) => handleKeydown(e, idx)}
                onblur={(e) => handleBlur(e, idx)}
                placeholder="0"
              />
            </td>
            <td class="col-coord">
              <input
                type="text"
                data-col="z"
                bind:value={row.z}
                onkeydown={(e) => handleKeydown(e, idx)}
                onblur={(e) => handleBlur(e, idx)}
                placeholder="0"
              />
            </td>
            <td class="col-actions">
              <button class="pro-delete-btn" onclick={() => deleteRow(idx)} title={t('pro.delete')}>×</button>
            </td>
          </tr>
        {/each}
        {#if rows.length === 0}
          <tr>
            <td colspan="5" class="pro-empty">{t('pro.emptyNodes')}</td>
          </tr>
        {/if}
      </tbody>
    </table>
    <!-- Adding a ROW belongs to the table, which is where Basic keeps it. -->
    <div class="pro-table-footer">
      <button class="pro-btn pro-btn-sm" onclick={addEmptyRow} data-testid="pro-add-node">{t('pro.addNode')}</button>
    </div>
  </div>
</div>

<style>
  .pro-nodes {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .pro-nodes-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 10px;
    border-bottom: 1px solid var(--st-surface-3);
    flex-shrink: 0;
  }

  .pro-nodes-count {
    font-size: 0.82rem;
    color: var(--st-value);
    font-weight: 600;
  }

  .pro-nodes-actions {
    display: flex;
    gap: 6px;
  }

  .pro-btn {
    padding: 5px 12px;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--st-text-2);
    background: var(--st-surface-3);
    border: 1px solid var(--st-surface-3);
    border-radius: 4px;
    cursor: pointer;
  }

  .pro-btn:hover {
    background: var(--st-surface-3);
    color: var(--st-text);
  }

  .pro-btn-sm {
    padding: 4px 10px;
    font-size: 0.72rem;
  }

  .pro-btn-danger {
    color: var(--st-danger);
    border-color: var(--st-hair-strong);
  }

  .pro-btn-danger:hover {
    background: var(--st-surface-2);
    color: var(--st-danger);
  }

  .pro-paste-error {
    padding: 4px 10px;
    font-size: 0.7rem;
    color: var(--st-danger);
    background: rgba(229, 72, 42, 0.1);
    border-bottom: 1px solid var(--st-hair-strong);
  }

  .pro-paste-hint {
    padding: 6px 12px;
    font-size: 0.72rem;
    color: var(--st-text-3);
    font-style: italic;
    border-bottom: 1px solid var(--st-surface-3);
    flex-shrink: 0;
  }

  .pro-table-footer { padding: 6px 10px; border-top: 1px solid var(--st-surface-3); }

  .pro-nodes-table-wrap {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .pro-nodes-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.75rem;
  }

  .pro-nodes-table thead {
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .pro-nodes-table th {
    padding: 6px 8px;
    text-align: left;
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--st-text-3);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    background: var(--st-surface);
    border-bottom: 1px solid var(--st-surface-3);
  }

  .pro-nodes-table td {
    padding: 3px 4px;
    border-bottom: 1px solid var(--st-surface-2);
  }

  .pro-nodes-table tbody tr {
    cursor: pointer;
    transition: background 0.1s;
  }

  .pro-nodes-table tbody tr:hover {
    background: rgba(127, 212, 204, 0.08);
  }

  .pro-nodes-table tr.selected {
    background: rgba(127, 212, 204, 0.18);
    box-shadow: inset 3px 0 0 var(--st-value);
  }

  .pro-nodes-table tr.unsaved td {
    opacity: 0.6;
  }

  .col-id {
    width: 36px;
    color: var(--st-text-3);
    font-family: monospace;
    font-size: 0.7rem;
    text-align: center;
  }

  .col-coord {
    width: auto;
  }

  .col-coord input {
    width: 100%;
    padding: 4px 6px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 3px;
    color: var(--st-text);
    font-size: 0.78rem;
    font-family: monospace;
  }

  .col-coord input:focus {
    background: var(--st-surface-3);
    border-color: var(--st-surface-3);
    outline: none;
  }

  .col-actions {
    width: 24px;
    text-align: center;
  }

  .pro-delete-btn {
    background: none;
    border:  none;
    color: var(--st-text-3);
    font-size: 1rem;
    cursor: pointer;
    padding: 0 2px;
    line-height: 1;
  }

  .pro-delete-btn:hover {
    color: var(--st-danger);
  }

  .pro-empty {
    text-align: center;
    color: var(--st-text-3);
    font-style: italic;
    padding: 20px 10px !important;
  }
</style>
