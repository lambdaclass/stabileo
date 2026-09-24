<script lang="ts">
  import { modelStore, uiStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import DrawInModelButton from './DrawInModelButton.svelte';
  import NextMemberPicker from './NextMemberPicker.svelte';
  import { nextMember } from '../../lib/store/next-member.svelte';
  import { arcThroughThree, chordError, buildArc, NODE_MERGE_TOL } from '../../lib/model/curved-member';
  import MemberOffsetEditor from '../property/MemberOffsetEditor.svelte';

  const is3DMode = $derived(uiStore.analysisMode === '3d' || uiStore.analysisMode === 'pro');

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
  /*
   * Drawing is the POINTER's state, not this panel's.
   *
   * The panel kept its own `drawMode` flag beside `uiStore.currentTool`, so
   * two things claimed to know whether a member was being drawn — and the
   * pointer box over the model, which reads the store, could say Select
   * while this panel said it was waiting for a first node. One of them was
   * always going to be wrong; the store is the one the viewport obeys.
   */
  const drawMode = $derived(uiStore.currentTool === 'element');

  // ── Curved members ───────────────────────────────────────────────
  let showArc = $state(false);
  let arcStart = $state('');
  let arcThrough = $state('');
  let arcEnd = $state('');
  let arcSegments = $state(8);
  let arcError = $state<string | null>(null);

  /** The three picked nodes as points, or null while the form is incomplete. */
  const arcPts = $derived.by(() => {
    const ids = [arcStart, arcThrough, arcEnd].map((v) => Number(v));
    if (ids.some((n) => !Number.isFinite(n) || n <= 0)) return null;
    const ns = ids.map((id) => modelStore.nodes.get(id));
    if (ns.some((n) => !n)) return null;
    return ns.map((n) => ({ x: n!.x, y: n!.y ?? 0, z: (n! as { z?: number }).z ?? 0 }));
  });

  const arcGeo = $derived(arcPts ? arcThroughThree(arcPts[0], arcPts[1], arcPts[2]) : null);
  const arcChordError = $derived(arcGeo ? chordError(arcGeo, arcSegments) : 0);

  /**
   * Draw the curve.
   *
   * The ends REUSE the nodes they were picked from — two nodes in the same
   * place analyse as two nodes, so an arch that created its own springing
   * points would be a structure cut where it looks joined, with no visible
   * symptom and a solve that succeeds.
   */
  function createArc() {
    arcError = null;
    if (!arcPts || !arcGeo) { arcError = t('pro.arcNeedsThree'); return; }
    const startId = Number(arcStart);
    const endId = Number(arcEnd);
    const arcId = Date.now();
    const made = buildArc(
      { start: arcPts[0], through: arcPts[1], end: arcPts[2], segments: arcSegments },
      {
        addNode: (x, y, z) => modelStore.addNode(x, y, z),
        /* The arc passes through the middle point by construction, so an even
           segment count lands a generated point exactly on the node that was
           picked to define it. Two nodes in one place analyse as two nodes. */
        nodeAt: (x, y, z) => {
          for (const [id, n] of modelStore.nodes) {
            const nz = (n as { z?: number }).z ?? 0;
            if (Math.hypot(n.x - x, (n.y ?? 0) - y, nz - z) <= NODE_MERGE_TOL) return id;
          }
          return null;
        },
        addElement: (i, j) => modelStore.addElement(i, j),
        tag: (elementId, tag) => {
          const el = modelStore.elements.get(elementId);
          if (el) modelStore.updateElement(elementId, { arc: { id: tag.arcId, spec: tag.spec } } as never);
        },
      },
      arcId, startId, endId,
    );
    if (made.length === 0) arcError = t('pro.arcFailed');
  }
  let drawNodeI = $state<number | null>(null);

  // Sync rows from store on mount. Preserve unsaved rows (id === null).
  $effect(() => {
    const storeElems = [...modelStore.elements.values()];
    const savedRows = rows.filter(r => r.id !== null);
    const unsavedRows = rows.filter(r => r.id === null);
    const storeIds = storeElems.map(e => e.id).join(',');
    const rowIds = savedRows.map(r => r.id).join(',');
    if (storeIds !== rowIds || storeElems.length !== savedRows.length) {
      rows = [
        ...storeElems.map(e => ({
          id: e.id,
          nodeI: String(e.nodeI),
          nodeJ: String(e.nodeJ),
          materialId: e.materialId,
          sectionId: e.sectionId,
          hingeI: e.releaseI?.mz === true,
          hingeJ: e.releaseJ?.mz === true,
        })),
        ...unsavedRows,
      ];
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
        const eid = nextMember.add(drawNodeI, nodeId);
        const made = modelStore.elements.get(eid)!;
        rows = [...rows, {
          id: eid,
          nodeI: String(drawNodeI),
          nodeJ: String(nodeId),
          materialId: made.materialId,
          sectionId: made.sectionId,
          hingeI: false,
          hingeJ: false,
        }];
        // Chain: nodeJ becomes next nodeI
        drawNodeI = nodeId;
        uiStore.setSelection(new Set(), new Set());
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
    rows = [...rows, { id: null, nodeI: '', nodeJ: '', materialId: nextMember.materialId ?? 1, sectionId: nextMember.sectionId ?? 1, hingeI: false, hingeJ: false }];
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
      if ((elem.releaseI?.mz === true) !== row.hingeI) modelStore.toggleHinge(row.id, 'start');
      if ((elem.releaseJ?.mz === true) !== row.hingeJ) modelStore.toggleHinge(row.id, 'end');
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
      const eid = nextMember.add(ni, nj);
      const made = modelStore.elements.get(eid)!;
      rows = [...rows, {
        id: eid,
        nodeI: String(ni),
        nodeJ: String(nj),
        materialId: made.materialId,
        sectionId: made.sectionId,
        hingeI: false,
        hingeJ: false,
      }];
    }
  }

  function handleRowClick(idx: number) {
    selectedRowIdx = idx;
    const row = rows[idx];
    if (row.id !== null) {
      uiStore.selectMode = 'elements';
      uiStore.setSelection(new Set(), new Set([row.id]), true); // manual row click
    }
  }

  // Available materials and sections
  const materials = $derived([...modelStore.materials.values()]);
  const sections = $derived([...modelStore.sections.values()]);
  const elemCount = $derived(rows.filter(r => r.id !== null).length);

</script>

<div class="pro-elems">
  <NextMemberPicker />
  {#if uiStore.selectedElements.size > 0}
    <div style="padding: 6px 10px;"><MemberOffsetEditor /></div>
  {/if}
  <div class="pro-elems-header">
    <span class="pro-elems-count">{t('pro.nElements').replace('{n}', String(elemCount))}</span>
    <!-- "Draw a member" works the MODEL; "+ Member" adds a table row, and
         belongs to the table, which is where Basic keeps it. -->
    <div class="pro-elems-actions">
      <DrawInModelButton tool="element" label={t('pro.oneElement')} icon="element" testid="draw-element" />
      <button class="pro-btn" class:pro-btn-active={showArc} onclick={() => (showArc = !showArc)}
              data-testid="pro-arc-toggle">{t('pro.curvedMember')}</button>
    </div>
  </div>


  <!--
    ── A curved member, as an arc through three points ────────────────
    The solver has straight frame elements and no curved beam, so the arc is
    MATERIALISED as a chain of them — what every commercial package does, and
    what lets diagrams, verification, detailing and the results tables keep
    working unchanged, because they all already understand straight members.

    Three points because that is what an engineer has: the two ends and a
    point the curve must pass through. Two points and a radius is the same
    arc stated differently and leaves which way round it goes ambiguous,
    which is precisely what the middle point settles.

    The segment count is a choice with a number attached: the panel says how
    far the chain falls inside the true arc, in metres, so "is twelve enough"
    stops being a feeling.
  -->
  {#if showArc}
    <div class="pro-arc" data-testid="pro-arc-form">
      <!--
        Three labelled fields, each under its own caption.
        ────────────────────────────────────────────────
        They were six controls on one line — label, box, label, box, label,
        box — which reads as one long sentence with three blanks in it and
        gives no clue that a NODE ID goes in each. Stacked with a caption
        over each field and a placeholder that says what kind of thing it
        wants, the three ends of an arc are three things rather than a row of
        empty boxes.
      -->
      <div class="pro-arc-fields">
        {#each [
          { label: t('pro.arcStart'), get: () => arcStart, set: (v: string) => (arcStart = v), tid: 'arc-start' },
          { label: t('pro.arcThrough'), get: () => arcThrough, set: (v: string) => (arcThrough = v), tid: 'arc-through' },
          { label: t('pro.arcEnd'), get: () => arcEnd, set: (v: string) => (arcEnd = v), tid: 'arc-end' },
        ] as f (f.tid)}
          <label class="pro-arc-field">
            <span>{f.label}</span>
            <input
              type="text" inputmode="numeric"
              placeholder={t('pro.arcNodePh')}
              value={f.get()}
              oninput={(e) => f.set(e.currentTarget.value)}
              data-testid={f.tid}
            />
          </label>
        {/each}
      </div>
      <div class="pro-arc-row">
        <label>{t('pro.arcSegments')}</label>
        <input type="number" min="1" max="64" bind:value={arcSegments} data-testid="arc-segments" />
        {#if arcGeo}
          <span class="pro-arc-note" data-testid="arc-note">
            R = {arcGeo.radius.toFixed(3)} m · L = {arcGeo.length.toFixed(3)} m ·
            {tp('pro.arcError', { mm: (arcChordError * 1000).toFixed(1) })}
          </span>
        {/if}
      </div>
      {#if arcError}<div class="pro-arc-err" data-testid="arc-error">{arcError}</div>{/if}
      <div class="pro-arc-row">
        <button class="pro-btn pro-btn-accent" onclick={createArc} data-testid="arc-create"
                disabled={!arcGeo}>{t('pro.arcCreate')}</button>
      </div>
    </div>
  {/if}

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
          <th class="col-hinge" title={is3DMode ? t('prop.hinge3DDisclosure') : ''}>{t('pro.thHingeI')}{is3DMode ? ` ${t('prop.hinges3DSuffix')}` : ''}</th>
          <th class="col-hinge" title={is3DMode ? t('prop.hinge3DDisclosure') : ''}>{t('pro.thHingeJ')}{is3DMode ? ` ${t('prop.hinges3DSuffix')}` : ''}</th>
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
    <div class="pro-table-footer">
      <button class="pro-btn pro-btn-sm" onclick={addEmptyRow} data-testid="pro-add-element">{t('pro.addElement')}</button>
    </div>
  </div>

  <!--
    The second curved-member form is gone.
    ─────────────────────────────────────
    There were two, and neither knew about the other: this one, folded away
    at the very bottom under a disclosure, and the one at the top of the
    panel. Two forms for one operation is two places to fix a defect and two
    answers to "how many segments did that use". The one that stays is the
    one beside the members it creates, and it states the geometry it found
    and how far the chords fall inside the arc.
  -->
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
    border-bottom: 1px solid var(--st-surface-3);
    flex-shrink: 0;
  }

  .pro-elems-count {
    font-size: 0.82rem;
    color: var(--st-value);
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
    color: var(--st-text-2);
    background: var(--st-surface-3);
    border: 1px solid var(--st-surface-3);
    border-radius: 4px;
    cursor: pointer;
  }

  .pro-btn:hover { background: var(--st-surface-3); color: var(--st-text); }

  .pro-btn-active {
    background: var(--st-accent) !important;
    border-color: var(--st-danger) !important;
    color: var(--st-text) !important;
  }

  .pro-draw-status {
    padding: 8px 12px;
    font-size: 0.78rem;
    color: var(--st-value);
    background: rgba(127, 212, 204, 0.08);
    border-bottom: 1px solid var(--st-surface-3);
  }

  .pro-draw-status strong {
    color: var(--st-text);
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
    color: var(--st-text-3);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    background: var(--st-surface);
    border-bottom: 1px solid var(--st-surface-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .pro-elems-table td {
    padding: 3px 3px;
    border-bottom: 1px solid var(--st-surface-2);
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .pro-elems-table tbody tr { cursor: pointer; transition: background 0.1s; }
  .pro-arc {
    padding: 8px 10px;
    border-bottom: 1px solid var(--st-surface-3);
    background: var(--st-surface-2);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .pro-table-footer { padding: 6px 10px; border-top: 1px solid var(--st-surface-3); }

  .pro-arc-fields { display: flex; gap: 8px; }
  .pro-arc-field { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
  .pro-arc-field span { font-size: 0.66rem; color: var(--st-text-3); }
  .pro-arc-field input { width: 100%; }

  .pro-arc-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .pro-arc-row label { font-size: 0.7rem; color: var(--st-text-3); }
  .pro-arc-row input { width: 58px; }
  .pro-arc-note { font-size: 0.68rem; color: var(--st-text-3); }
  .pro-arc-err { font-size: 0.7rem; color: var(--st-danger); }

  .pro-elems-table tbody tr:hover { background: rgba(127, 212, 204, 0.08); }
  .pro-elems-table tr.selected { background: rgba(127, 212, 204, 0.18); box-shadow: inset 3px 0 0 var(--st-value); }
  .pro-elems-table tr.unsaved td { opacity: 0.6; }

  .col-id {
    width: 32px;
    color: var(--st-text-3);
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
    color: var(--st-text);
    font-size: 0.78rem;
    font-family: monospace;
  }
  .col-node input:focus {
    background: var(--st-surface-3);
    border-color: var(--st-surface-3);
    outline: none;
  }

  .col-mat, .col-sec { width: auto; }
  .col-mat select, .col-sec select {
    width: 100%;
    padding: 3px 3px;
    background: var(--st-surface-3);
    border: 1px solid transparent;
    border-radius: 3px;
    color: var(--st-text-2);
    font-size: 0.72rem;
    cursor: pointer;
  }
  .col-mat select:focus, .col-sec select:focus {
    border-color: var(--st-surface-3);
    outline: none;
  }

  .col-hinge { width: 40px; text-align: center; }

  .hinge-btn {
    padding: 3px 6px;
    font-size: 0.68rem;
    font-weight: 600;
    border: 1px solid var(--st-surface-3);
    border-radius: 3px;
    cursor: pointer;
    background: var(--st-surface-3);
    color: var(--st-text-3);
    min-width: 34px;
  }

  .hinge-btn.hinged {
    background: var(--st-surface-2);
    border-color: var(--st-warn);
    color: var(--st-warn);
  }

  .col-actions { width: 20px; text-align: center; }

  .pro-delete-btn {
    background: none;
    border:  none;
    color: var(--st-text-3);
    font-size: 1rem;
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }
  .pro-delete-btn:hover { color: var(--st-danger); }

  .pro-empty {
    text-align: center;
    color: var(--st-text-3);
    font-style: italic;
    padding: 20px 10px !important;
  }
</style>
