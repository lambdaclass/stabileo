<script lang="ts">
  import { modelStore, uiStore } from '../../lib/store';
  import { t } from '../../lib/i18n';

  interface ElemRow {
    id: number | null;
    nodeI: string;
    nodeJ: string;
    materialId: number;
    sectionId: number;
    hingeI: boolean;
    hingeJ: boolean;
  }

  let rows = $state<ElemRow[]>([]);
  let pasteError = $state<string | null>(null);
  let selectedRowIdx = $state<number | null>(null);
  let drawMode = $state(false);
  let drawNodeI = $state<number | null>(null);

  // Sync rows from store on mount
  $effect(() => {
    const storeElems = [...modelStore.elements.values()];
    if (storeElems.length > 0 && rows.length === 0) {
      rows = storeElems.map(e => ({
        id: e.id,
        nodeI: String(e.nodeI),
        nodeJ: String(e.nodeJ),
        materialId: e.materialId,
        sectionId: e.sectionId,
        hingeI: e.hingeStart ?? false,
        hingeJ: e.hingeEnd ?? false,
      }));
    }
  });

  // Listen for node clicks in draw mode
  $effect(() => {
    if (!drawMode) {
      drawNodeI = null;
      return;
    }
    // When a node is selected in the viewport, use it for drawing
    if (uiStore.selectedNodes.size === 1) {
      const nodeId = [...uiStore.selectedNodes][0];
      if (drawNodeI === null) {
        drawNodeI = nodeId;
      } else if (nodeId !== drawNodeI) {
        // Create element
        const eid = modelStore.addElement(drawNodeI, nodeId);
        rows = [...rows, {
          id: eid,
          nodeI: String(drawNodeI),
          nodeJ: String(nodeId),
          materialId: 1,
          sectionId: 1,
          hingeI: false,
          hingeJ: false,
        }];
        // Chain: nodeJ becomes next nodeI
        drawNodeI = nodeId;
        uiStore.selectedNodes = new Set();
      }
    }
  });

  // Listen for element selection from viewport
  $effect(() => {
    if (uiStore.selectedElements.size === 1) {
      const elemId = [...uiStore.selectedElements][0];
      const idx = rows.findIndex(r => r.id === elemId);
      if (idx >= 0) selectedRowIdx = idx;
    }
  });

  function addEmptyRow() {
    rows = [...rows, { id: null, nodeI: '', nodeJ: '', materialId: 1, sectionId: 1, hingeI: false, hingeJ: false }];
  }

  function commitRow(idx: number) {
    const row = rows[idx];
    const ni = parseInt(row.nodeI);
    const nj = parseInt(row.nodeJ);
    if (isNaN(ni) || isNaN(nj) || ni === nj) return;
    if (!modelStore.nodes.has(ni) || !modelStore.nodes.has(nj)) return;

    if (row.id === null) {
      const eid = modelStore.addElement(ni, nj);
      modelStore.updateElementMaterial(eid, row.materialId);
      modelStore.updateElementSection(eid, row.sectionId);
      if (row.hingeI) modelStore.toggleHinge(eid, 'start');
      if (row.hingeJ) modelStore.toggleHinge(eid, 'end');
      rows[idx] = { ...rows[idx], id: eid };
    } else {
      // Update existing element properties
      const elem = modelStore.elements.get(row.id);
      if (!elem) return;
      modelStore.updateElementMaterial(row.id, row.materialId);
      modelStore.updateElementSection(row.id, row.sectionId);
      // Sync hinges
      if ((elem.hingeStart ?? false) !== row.hingeI) modelStore.toggleHinge(row.id, 'start');
      if ((elem.hingeEnd ?? false) !== row.hingeJ) modelStore.toggleHinge(row.id, 'end');
    }
  }

  function deleteRow(idx: number) {
    const row = rows[idx];
    if (row.id !== null) modelStore.removeElement(row.id);
    rows = rows.filter((_, i) => i !== idx);
  }

  function handleKeydown(e: KeyboardEvent, idx: number) {
    if (e.key === 'Enter') {
      commitRow(idx);
      if (idx === rows.length - 1) {
        addEmptyRow();
        setTimeout(() => {
          const inputs = document.querySelectorAll('.pro-elems-table input[data-col="ni"]');
          const lastInput = inputs[inputs.length - 1] as HTMLInputElement;
          lastInput?.focus();
        }, 10);
      }
    }
  }

  function handlePaste(e: ClipboardEvent) {
    const text = e.clipboardData?.getData('text');
    if (!text) return;
    if (!text.includes('\t') && !text.includes('\n')) return;

    e.preventDefault();
    pasteError = null;

    const lines = text.trim().split('\n').filter(l => l.trim());
    for (let i = 0; i < lines.length; i++) {
      const parts = lines[i].split('\t').map(s => s.trim());
      if (parts.length < 2) {
        pasteError = t('pro.pasteRowError').replace('{n}', String(i + 1)).replace('{cols}', '2').replace('{names}', t('pro.thNodeI') + ', ' + t('pro.thNodeJ'));
        return;
      }
      const ni = parseInt(parts[0]);
      const nj = parseInt(parts[1]);
      if (isNaN(ni) || isNaN(nj)) {
        pasteError = t('pro.pasteInvalidNodeIds').replace('{n}', String(i + 1));
        return;
      }
      if (!modelStore.nodes.has(ni) || !modelStore.nodes.has(nj)) {
        pasteError = t('pro.pasteNodeNotExist').replace('{n}', String(i + 1)).replace('{ni}', String(ni)).replace('{nj}', String(nj));
        return;
      }
      const eid = modelStore.addElement(ni, nj);
      rows = [...rows, {
        id: eid,
        nodeI: String(ni),
        nodeJ: String(nj),
        materialId: 1,
        sectionId: 1,
        hingeI: false,
        hingeJ: false,
      }];
    }
  }

  function handleRowClick(idx: number) {
    selectedRowIdx = idx;
    const row = rows[idx];
    if (row.id !== null) {
      uiStore.selectedElements = new Set([row.id]);
      uiStore.selectedNodes = new Set();
    }
  }

  function toggleDrawMode() {
    drawMode = !drawMode;
    if (drawMode) {
      drawNodeI = null;
      uiStore.selectedNodes = new Set();
      uiStore.selectedElements = new Set();
    }
  }

  // Available materials and sections
  const materials = $derived([...modelStore.materials.values()]);
  const sections = $derived([...modelStore.sections.values()]);
  const elemCount = $derived(rows.filter(r => r.id !== null).length);
</script>

<div class="pro-elems">
  <div class="pro-elems-header">
    <span class="pro-elems-count">{t('pro.nElements').replace('{n}', String(elemCount))}</span>
    <div class="pro-elems-actions">
      <button class="pro-btn" onclick={addEmptyRow}>{t('pro.addElement')}</button>
      <button class="pro-btn" class:pro-btn-active={drawMode} onclick={toggleDrawMode}>
        {drawMode ? t('pro.stopDrawing') : t('pro.draw')}
      </button>
    </div>
  </div>

  {#if drawMode}
    <div class="pro-draw-status">
      {#if drawNodeI === null}
        {t('pro.drawClickNodeI')}
      {:else}
        {@html t('pro.drawNodeISelected').replace('{id}', String(drawNodeI))}
      {/if}
    </div>
  {/if}

  {#if pasteError}
    <div class="pro-paste-error">{pasteError}</div>
  {/if}

  <div class="pro-paste-hint">
    {t('pro.pasteHintElems')}
  </div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="pro-elems-table-wrap" onpaste={handlePaste}>
    <table class="pro-elems-table">
      <thead>
        <tr>
          <th class="col-id">ID</th>
          <th class="col-node">{t('pro.thNodeI')}</th>
          <th class="col-node">{t('pro.thNodeJ')}</th>
          <th class="col-mat">{t('pro.thMaterial')}</th>
          <th class="col-sec">{t('pro.thSection')}</th>
          <th class="col-hinge">{t('pro.thHingeI')}</th>
          <th class="col-hinge">{t('pro.thHingeJ')}</th>
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
            <td class="col-node">
              <input type="text" data-col="ni" bind:value={row.nodeI}
                onkeydown={(e) => handleKeydown(e, idx)}
                onblur={() => commitRow(idx)} placeholder="—" />
            </td>
            <td class="col-node">
              <input type="text" data-col="nj" bind:value={row.nodeJ}
                onkeydown={(e) => handleKeydown(e, idx)}
                onblur={() => commitRow(idx)} placeholder="—" />
            </td>
            <td class="col-mat">
              <select value={String(row.materialId)} onchange={(e) => {
                row.materialId = parseInt(e.currentTarget.value);
                if (row.id !== null) commitRow(idx);
              }}>
                {#each materials as m}
                  <option value={String(m.id)}>{m.name}</option>
                {/each}
              </select>
            </td>
            <td class="col-sec">
              <select value={String(row.sectionId)} onchange={(e) => {
                row.sectionId = parseInt(e.currentTarget.value);
                if (row.id !== null) commitRow(idx);
              }}>
                {#each sections as s}
                  <option value={String(s.id)}>{s.name}</option>
                {/each}
              </select>
            </td>
            <td class="col-hinge">
              <button class="hinge-btn" class:hinged={row.hingeI} onclick={() => {
                row.hingeI = !row.hingeI;
                if (row.id !== null) commitRow(idx);
              }}>{row.hingeI ? t('pro.hingeArt') : t('pro.hingeEmp')}</button>
            </td>
            <td class="col-hinge">
              <button class="hinge-btn" class:hinged={row.hingeJ} onclick={() => {
                row.hingeJ = !row.hingeJ;
                if (row.id !== null) commitRow(idx);
              }}>{row.hingeJ ? t('pro.hingeArt') : t('pro.hingeEmp')}</button>
            </td>
            <td class="col-actions">
              <button class="pro-delete-btn" onclick={() => deleteRow(idx)}>×</button>
            </td>
          </tr>
        {/each}
        {#if rows.length === 0}
          <tr>
            <td colspan="8" class="pro-empty">{t('pro.emptyElements')}</td>
          </tr>
        {/if}
      </tbody>
    </table>
  </div>
</div>

<style>
  .pro-elems {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .pro-elems-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 10px;
    border-bottom: 1px solid #1a3050;
    flex-shrink: 0;
  }

  .pro-elems-count {
    font-size: 0.82rem;
    color: #4ecdc4;
    font-weight: 600;
  }

  .pro-elems-actions {
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

  .pro-btn:hover { background: #1a4a7a; color: #fff; }

  .pro-btn-active {
    background: #e94560 !important;
    border-color: #ff6b6b !important;
    color: #fff !important;
  }

  .pro-draw-status {
    padding: 8px 12px;
    font-size: 0.78rem;
    color: #4ecdc4;
    background: rgba(78, 205, 196, 0.08);
    border-bottom: 1px solid #1a3050;
  }

  .pro-draw-status strong {
    color: #fff;
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

  .pro-elems-table-wrap {
    flex: 1;
    overflow: auto;
  }

  .pro-elems-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.78rem;
    table-layout: fixed;
  }

  .pro-elems-table thead {
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .pro-elems-table th {
    padding: 6px 4px;
    text-align: left;
    font-size: 0.68rem;
    font-weight: 600;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    background: #0a1a30;
    border-bottom: 1px solid #1a4a7a;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .pro-elems-table td {
    padding: 3px 3px;
    border-bottom: 1px solid #0f2030;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .pro-elems-table tr:hover { background: rgba(78, 205, 196, 0.04); }
  .pro-elems-table tr.selected { background: rgba(78, 205, 196, 0.1); }
  .pro-elems-table tr.unsaved td { opacity: 0.6; }

  .col-id {
    width: 32px;
    color: #666;
    font-family: monospace;
    font-size: 0.75rem;
    text-align: center;
  }

  .col-node { width: 50px; }
  .col-node input {
    width: 100%;
    padding: 4px 5px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 3px;
    color: #ddd;
    font-size: 0.78rem;
    font-family: monospace;
  }
  .col-node input:focus {
    background: #0f2840;
    border-color: #1a4a7a;
    outline: none;
  }

  .col-mat, .col-sec { width: auto; }
  .col-mat select, .col-sec select {
    width: 100%;
    padding: 3px 3px;
    background: #0f2840;
    border: 1px solid transparent;
    border-radius: 3px;
    color: #ccc;
    font-size: 0.72rem;
    cursor: pointer;
  }
  .col-mat select:focus, .col-sec select:focus {
    border-color: #1a4a7a;
    outline: none;
  }

  .col-hinge { width: 40px; text-align: center; }

  .hinge-btn {
    padding: 3px 6px;
    font-size: 0.68rem;
    font-weight: 600;
    border: 1px solid #1a3050;
    border-radius: 3px;
    cursor: pointer;
    background: #0f2840;
    color: #888;
    min-width: 34px;
  }

  .hinge-btn.hinged {
    background: #4a3010;
    border-color: #8a6020;
    color: #f0a500;
  }

  .col-actions { width: 20px; text-align: center; }

  .pro-delete-btn {
    background: none;
    border: none;
    color: #555;
    font-size: 1rem;
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }
  .pro-delete-btn:hover { color: #ff6b6b; }

  .pro-empty {
    text-align: center;
    color: #555;
    font-style: italic;
    padding: 20px 10px !important;
  }
</style>
