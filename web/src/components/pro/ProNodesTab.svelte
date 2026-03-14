<script lang="ts">
  import { modelStore, uiStore } from '../../lib/store';
  import { t } from '../../lib/i18n';

  interface NodeRow {
    id: number | null;  // null = unsaved new row
    x: string;
    y: string;
    z: string;
  }

  let rows = $state<NodeRow[]>([]);
  let pasteError = $state<string | null>(null);
  let selectedRowIdx = $state<number | null>(null);

  // Sync rows from modelStore on mount and when nodes change
  $effect(() => {
    const storeNodes = [...modelStore.nodes.values()];
    // Only sync if the store has nodes and rows are empty or stale
    if (storeNodes.length > 0 && rows.length === 0) {
      rows = storeNodes.map(n => ({
        id: n.id,
        x: String(n.x),
        y: String(n.y),
        z: String(n.z ?? 0),
      }));
    }
  });

  function parseNumber(s: string): number | null {
    // Accept both . and , as decimal separator
    const cleaned = s.trim().replace(',', '.');
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
  }

  function addEmptyRow() {
    rows = [...rows, { id: null, x: '', y: '', z: '0' }];
  }

  function commitRow(idx: number) {
    const row = rows[idx];
    const x = parseNumber(row.x);
    const y = parseNumber(row.y);
    const z = parseNumber(row.z);
    if (x === null || y === null || z === null) return;

    if (row.id === null) {
      // New node
      const realId = modelStore.addNode(x, y, z);
      rows[idx] = { ...rows[idx], id: realId };
    } else {
      // Update existing node
      modelStore.updateNode(row.id, x, y, z);
    }
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
    const newRows: NodeRow[] = [];
    const newNodeIds: number[] = [];

    for (let i = 0; i < lines.length; i++) {
      const parts = lines[i].split('\t').map(s => s.trim());
      if (parts.length < 2) {
        pasteError = t('pro.pasteRowError').replace('{n}', String(i + 1)).replace('{cols}', '2').replace('{names}', 'X, Y');
        return;
      }

      const x = parseNumber(parts[0]);
      const y = parseNumber(parts[1]);
      const z = parts.length >= 3 ? parseNumber(parts[2]) : 0;

      if (x === null || y === null) {
        pasteError = t('pro.pasteInvalidNum').replace('{n}', String(i + 1));
        return;
      }

      const realId = modelStore.addNode(x, y, z ?? 0);
      newNodeIds.push(realId);
      newRows.push({
        id: realId,
        x: String(x),
        y: String(y),
        z: String(z ?? 0),
      });
    }

    // Add new rows to the table
    rows = [...rows.filter(r => r.id !== null), ...newRows];
    pasteError = null;
  }

  function handleRowClick(idx: number) {
    selectedRowIdx = idx;
    const row = rows[idx];
    if (row.id !== null) {
      // Select node in viewport
      uiStore.selectedNodes = new Set([row.id]);
      uiStore.selectedElements = new Set();
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
    <div class="pro-nodes-actions">
      <button class="pro-btn" onclick={addEmptyRow}>{t('pro.addNode')}</button>
      <button class="pro-btn pro-btn-sm" onclick={commitAll} title={t('pro.apply')}>{t('pro.apply')}</button>
      <button class="pro-btn pro-btn-sm pro-btn-danger" onclick={clearAll} title={t('pro.clear')}>{t('pro.clear')}</button>
    </div>
  </div>

  {#if pasteError}
    <div class="pro-paste-error">{pasteError}</div>
  {/if}

  <div class="pro-paste-hint">
    {t('pro.pasteHintNodes')}
  </div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="pro-nodes-table-wrap" onpaste={handlePaste}>
    <table class="pro-nodes-table">
      <thead>
        <tr>
          <th class="col-id">ID</th>
          <th class="col-coord">X (m)</th>
          <th class="col-coord">Y (m)</th>
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
                onblur={() => commitRow(idx)}
                placeholder="0"
              />
            </td>
            <td class="col-coord">
              <input
                type="text"
                data-col="y"
                bind:value={row.y}
                onkeydown={(e) => handleKeydown(e, idx)}
                onblur={() => commitRow(idx)}
                placeholder="0"
              />
            </td>
            <td class="col-coord">
              <input
                type="text"
                data-col="z"
                bind:value={row.z}
                onkeydown={(e) => handleKeydown(e, idx)}
                onblur={() => commitRow(idx)}
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
    border-bottom: 1px solid #1a3050;
    flex-shrink: 0;
  }

  .pro-nodes-count {
    font-size: 0.82rem;
    color: #4ecdc4;
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
    color: #ccc;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    cursor: pointer;
  }

  .pro-btn:hover {
    background: #1a4a7a;
    color: #fff;
  }

  .pro-btn-sm {
    padding: 4px 10px;
    font-size: 0.72rem;
  }

  .pro-btn-danger {
    color: #ff8a9e;
    border-color: #5a2030;
  }

  .pro-btn-danger:hover {
    background: #4a1525;
    color: #ff6b6b;
  }

  .pro-paste-error {
    padding: 4px 10px;
    font-size: 0.7rem;
    color: #ff8a9e;
    background: rgba(233, 69, 96, 0.1);
    border-bottom: 1px solid #5a2030;
  }

  .pro-paste-hint {
    padding: 6px 12px;
    font-size: 0.72rem;
    color: #668;
    font-style: italic;
    border-bottom: 1px solid #1a2540;
    flex-shrink: 0;
  }

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
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    background: #0a1a30;
    border-bottom: 1px solid #1a4a7a;
  }

  .pro-nodes-table td {
    padding: 3px 4px;
    border-bottom: 1px solid #0f2030;
  }

  .pro-nodes-table tr:hover {
    background: rgba(78, 205, 196, 0.04);
  }

  .pro-nodes-table tr.selected {
    background: rgba(78, 205, 196, 0.1);
  }

  .pro-nodes-table tr.unsaved td {
    opacity: 0.6;
  }

  .col-id {
    width: 36px;
    color: #666;
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
    color: #ddd;
    font-size: 0.78rem;
    font-family: monospace;
  }

  .col-coord input:focus {
    background: #0f2840;
    border-color: #1a4a7a;
    outline: none;
  }

  .col-actions {
    width: 24px;
    text-align: center;
  }

  .pro-delete-btn {
    background: none;
    border: none;
    color: #555;
    font-size: 1rem;
    cursor: pointer;
    padding: 0 2px;
    line-height: 1;
  }

  .pro-delete-btn:hover {
    color: #ff6b6b;
  }

  .pro-empty {
    text-align: center;
    color: #555;
    font-style: italic;
    padding: 20px 10px !important;
  }
</style>
