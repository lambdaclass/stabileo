<script lang="ts">
  import { tick } from 'svelte';
  import LazySelect from '../tables/LazySelect.svelte';
  import { progressiveRows } from '../../lib/utils/progressive-rows.svelte';
  import { modelStore, uiStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import DrawInModelButton from './DrawInModelButton.svelte';
  import NextMemberFields from './NextMemberFields.svelte';
  import BatchEditBar from './BatchEditBar.svelte';
  import { nextMember } from '../../lib/store/next-member.svelte';
  import WriteInPanelButton from './WriteInPanelButton.svelte';
  import WriteCard from './WriteCard.svelte';
  import { drawState } from '../../lib/store/draw-state.svelte';
  import { memberSpecifications } from '../../lib/pro/specification-list';
  import { arcThroughThree, chordError, buildArc, NODE_MERGE_TOL } from '../../lib/model/curved-member';


  interface ElemRow {
    id: number | null;
    nodeI: string;
    nodeJ: string;
    materialId: number;
    sectionId: number;
  }

  let rows = $state<ElemRow[]>([]);
  let pasteError = $state<string | null>(null);

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
    // The whole arc, nodes, members and tags, is one undo step.
    let made!: ReturnType<typeof buildArc>;
    modelStore.batch(() => { made = buildArc(
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
    ); });
    if (made.length === 0) arcError = t('pro.arcFailed');
  }

  /** What each member is told beyond geometry, section and material (`specification-list.ts`). */
  const specsOf = (id: number) => {
    const e = modelStore.elements.get(id);
    return e ? memberSpecifications(e, t, modelStore.model) : [];
  };
  /** The axial behaviour reads as its value (Truss, Cable); the rest by what they are. */
  const specLabel = (x: { what: string; value: string }) => (x.what === t('spec.members.axial') ? x.value : x.what);
  /** Specifications › Members on this member, or on the whole selection when `keep`. */
  function openSpec(id: number, keep = false) {
    uiStore.specSection = 'members';
    uiStore.proActiveTab = 'specifications';
    if (!keep) uiStore.setSelection(new Set(), new Set([id]));
  }

  /*
   * Sync rows from the store on mount and whenever a member is added, removed or changed
   * elsewhere. Preserve unsaved rows (id === null). The rows used to be rebuilt only when the ids
   * changed, so a section set in the quick editor or Specifications was written back to the old
   * one the next time a cell of its row lost the focus.
   */
  let synced = '';
  $effect(() => {
    const storeElems = [...modelStore.elements.values()];
    const unsavedRows = rows.filter(r => r.id === null);
    const signature = storeElems.map(e => `${e.id}:${e.nodeI}:${e.nodeJ}:${e.materialId}:${e.sectionId}`).join('|');
    if (signature !== synced) {
      synced = signature;
      rows = [
        ...storeElems.map(e => ({
          id: e.id,
          nodeI: String(e.nodeI),
          nodeJ: String(e.nodeJ),
          materialId: e.materialId,
          sectionId: e.sectionId,
        })),
        ...unsavedRows,
      ];
    }
  });

  /* Drawing members is the viewport's, with the step shown in the drawing bar (`drawState`).
     This panel used to build members of its own from the selected node at the same time, so a
     third click joined a stale first node to the new one. */

  /*
   * The table shows the model's selection, wherever it was made and whenever the panel opens:
   * every selected member's row is lit, and the first is scrolled into view.
   */
  let tableWrap = $state<HTMLElement | null>(null);
  /*
   * Rows drawn in batches (`progressive-rows.svelte.ts`): a building of 4,000 members held the main
   * thread for most of a second when this tab opened. A row the selection asks for is drawn first.
   */
  // Forty a frame: a member's row is a dozen controls, and a hundred took 60–90 ms a frame.
  const batches = progressiveRows(() => rows, 30, 40);
  $effect(() => {
    const sel = uiStore.selectedElements;
    if (sel.size === 0 || !tableWrap) return;
    const first = [...sel].find((id) => modelStore.elements.has(id));
    if (first === undefined) return;
    const at = rows.findIndex((r) => r.id === first);
    if (at >= 0) batches.reach(at);
    void tick().then(() => tableWrap?.querySelector(`tr[data-elem="${first}"]`)?.scrollIntoView({ block: 'nearest' }));
  });

  // ── Group editing over a selection of more than one member ──
  const selectedIds = $derived([...uiStore.selectedElements].filter((id) => modelStore.elements.has(id)));
  const sameOf = (f: (e: { materialId: number; sectionId: number }) => number) => {
    const v = selectedIds.map((id) => f(modelStore.elements.get(id)!));
    return v.length && v.every((x) => x === v[0]) ? String(v[0]) : '';
  };
  function batchSet(patch: { materialId?: number; sectionId?: number }) {
    modelStore.batch(() => {
      for (const id of selectedIds) {
        if (patch.materialId !== undefined) modelStore.updateElementMaterial(id, patch.materialId);
        if (patch.sectionId !== undefined) modelStore.updateElementSection(id, patch.sectionId);
      }
    });
  }

  function addEmptyRow() {
    rows = [...rows, { id: null, nodeI: '', nodeJ: '', materialId: nextMember.resolvedMaterialId, sectionId: nextMember.resolvedSectionId }];
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
      rows[idx] = { ...rows[idx], id: eid };
    } else {
      // Only what changed is written; node I and J re-connect the member, as one undo step.
      const id = row.id;
      const elem = modelStore.elements.get(id);
      if (!elem) return;
      if (elem.nodeI !== ni || elem.nodeJ !== nj) modelStore.batch(() => modelStore.updateElement(id, { nodeI: ni, nodeJ: nj }));
      if (elem.materialId !== row.materialId) modelStore.updateElementMaterial(id, row.materialId);
      if (elem.sectionId !== row.sectionId) modelStore.updateElementSection(id, row.sectionId);
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
      }];
    }
  }

  /** A row click selects that member; with Shift, Ctrl or Cmd it adds or removes it. */
  function handleRowClick(idx: number, e?: MouseEvent) {
    const row = rows[idx];
    if (row.id === null) return;
    uiStore.selectMode = 'elements';
    const add = !!(e && (e.shiftKey || e.ctrlKey || e.metaKey));
    const next = add ? new Set(uiStore.selectedElements) : new Set<number>();
    if (add && next.has(row.id)) next.delete(row.id); else next.add(row.id);
    uiStore.setSelection(new Set(), next, true); // manual row click
  }

  /** A double click on a row frames that member in the model (the Alt+Z of the selection); not on a cell being edited. */
  function handleRowDblClick(idx: number, e: MouseEvent) {
    if ((e.target as HTMLElement).closest('input, select, button, textarea')) return;
    const id = rows[idx]?.id;
    if (id === null || id === undefined) return;
    // The member double-clicked is selected, also when the clicks before it took it out of a set.
    if (!uiStore.selectedElements.has(id)) { uiStore.selectMode = 'elements'; uiStore.setSelection(new Set(), new Set([id]), true); }
    window.dispatchEvent(new CustomEvent('stabileo-zoom-to-selection'));
  }

  // Available materials and sections
  const materials = $derived([...modelStore.materials.values()]);
  const sections = $derived([...modelStore.sections.values()]);
  const elemCount = $derived(rows.filter(r => r.id !== null).length);


  // ── Write a member: its two end nodes, Enter, the next one ──
  let wI = $state(''), wJ = $state('');
  let wError = $state<string | null>(null);
  function writeMember() {
    const i = Number(wI), j = Number(wJ);
    if (!modelStore.nodes.has(i) || !modelStore.nodes.has(j)) { wError = t('pro.errNodesExist'); return; }
    if (i === j) { wError = t('pro.errNodesDistinct'); return; }
    wError = null;
    const id = nextMember.add(i, j);
    uiStore.selectElement(id, false);
    uiStore.toast(t('viewport3d.elementCreated').replace('{id}', String(id)), 'success');
    // The next member most often starts where this one ended.
    wI = String(j); wJ = '';
  }
</script>

<div class="pro-elems">
  <!-- What the selected members are told beyond geometry, section and material is edited in
       one place, Specifications › Members; this opens it on them. Its place is kept while it is
       hidden: appearing on the first click of a double click, it moved the table under the
       pointer and the second click landed on the row above. -->
  {#if selectedIds.length === 1}
    <button class="pro-elems-spec" onclick={() => { uiStore.specSection = 'members'; uiStore.proActiveTab = 'specifications'; }} data-testid="elems-open-spec">
      {t('spec.openForSelection').replace('{n}', String(uiStore.selectedElements.size))}
    </button>
  {:else}
    <button class="pro-elems-spec pro-elems-spec-slot" tabindex="-1" aria-hidden="true" disabled>&nbsp;</button>
  {/if}
  <div class="pro-elems-header">
    <span class="pro-elems-count">{t('pro.nElements').replace('{n}', String(elemCount))}</span>
    <!-- "Draw" works the MODEL; "Write" takes the two node ids. Both make the member the
         fields in their card or bar describe (`NextMemberFields`). -->
    <div class="pro-elems-actions">
      <DrawInModelButton tool="element" label={t('pro.oneElement')} icon="element" testid="draw-element" />
      <WriteInPanelButton kind="element" label={t('pro.oneElement')} testid="write-element" />
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

  {#if drawState.writing === 'element'}
    <WriteCard title={`${t('pro.writeIn')} ${t('pro.oneElement')}`} submitLabel={`${t('pro.add')} ${t('pro.oneElement')}`} onsubmit={writeMember} error={wError} testid="write-element-card">
      <label>{t('pro.thNodeI')} <input class="wc-num" inputmode="numeric" bind:value={wI} placeholder="ID" data-testid="write-element-i" /></label>
      <label>{t('pro.thNodeJ')} <input class="wc-num" inputmode="numeric" bind:value={wJ} placeholder="ID" data-testid="write-element-j" /></label>
      <NextMemberFields />
    </WriteCard>
  {/if}

  {#if pasteError}
    <div class="pro-paste-error">{pasteError}</div>
  {/if}

  {#if selectedIds.length > 1}
    <BatchEditBar count={selectedIds.length} labelKey="batch.members" testid="elems-batch">
      <label>{t('pro.thMaterial')}
        <select value={sameOf((e) => e.materialId)} onchange={(e) => batchSet({ materialId: Number(e.currentTarget.value) })} data-testid="batch-material">
          {#if sameOf((e) => e.materialId) === ''}<option value="" disabled>{t('behaviour.mixed')}</option>{/if}
          {#each materials as m (m.id)}<option value={String(m.id)}>{m.name}</option>{/each}
        </select>
      </label>
      <label>{t('pro.thSection')}
        <select value={sameOf((e) => e.sectionId)} onchange={(e) => batchSet({ sectionId: Number(e.currentTarget.value) })} data-testid="batch-section">
          {#if sameOf((e) => e.sectionId) === ''}<option value="" disabled>{t('behaviour.mixed')}</option>{/if}
          {#each sections as sec (sec.id)}<option value={String(sec.id)}>{sec.name}</option>{/each}
        </select>
      </label>
      <button class="pk-btn" onclick={() => openSpec(selectedIds[0]!, true)} data-testid="batch-spec">{t('pro.thSpec')}…</button>
    </BatchEditBar>
  {/if}

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="pro-elems-table-wrap" bind:this={tableWrap} onpaste={handlePaste}>
    <table class="pro-elems-table">
      <thead>
        <tr>
          <th class="col-id">ID</th>
          <th class="col-name">{t('pro.thName')}</th>
          <th class="col-node">{t('pro.thNodeI')}</th>
          <th class="col-node">{t('pro.thNodeJ')}</th>
          <th class="col-mat">{t('pro.thMaterial')}</th>
          <th class="col-sec">{t('pro.thSection')}</th>
          <th class="col-spec" title={t('pro.thSpecHint')}>{t('pro.thSpec')}</th>
          <th class="col-actions"></th>
        </tr>
      </thead>
      <tbody>
        <!-- Keyed by the row itself: unkeyed, every batch re-read every row drawn before it. -->
        {#each batches.rows as row, idx (row)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <tr
            class:selected={row.id !== null && uiStore.selectedElements.has(row.id)}
            class:unsaved={row.id === null}
            data-elem={row.id ?? ''}
            onmousedown={(e) => { if ((e.shiftKey || e.metaKey || e.ctrlKey) && !(e.target instanceof HTMLInputElement)) e.preventDefault(); }}
            onclick={(e) => handleRowClick(idx, e)}
            ondblclick={(e) => handleRowDblClick(idx, e)}
          >
            <td class="col-id">{row.id ?? '—'}</td>
            <td class="col-name">
              {#if row.id !== null}
                {@const id = row.id}
                <!-- Kept on the model, edited here; one undo step that leaves the results standing. -->
                <input type="text" data-col="name" value={modelStore.elements.get(id)?.name ?? ''} placeholder={t('pro.namePlaceholder')}
                  onkeydown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
                  onchange={(e) => modelStore.renameElement(id, e.currentTarget.value)} data-testid="elem-name-{id}" />
              {/if}
            </td>
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
              <!-- The list is built when the select is used: a select per row repeated it thousands of times. -->
              <LazySelect value={row.materialId} label={materials.find((m) => m.id === row.materialId)?.name ?? String(row.materialId)}
                options={() => materials.map((m) => ({ value: m.id, label: m.name }))}
                onchange={(v) => { row.materialId = parseInt(v); if (row.id !== null) commitRow(idx); }} />
            </td>
            <td class="col-sec">
              <LazySelect value={row.sectionId} label={sections.find((x) => x.id === row.sectionId)?.name ?? String(row.sectionId)}
                options={() => sections.map((x) => ({ value: x.id, label: x.name }))}
                onchange={(v) => { row.sectionId = parseInt(v); if (row.id !== null) commitRow(idx); }} />
            </td>
            <td class="col-spec">
              {#if row.id !== null}
                <!-- What the member is told beyond this row, and the way to its one editor. -->
                {@const specs = specsOf(row.id)}
                <button class="spec-btn" class:set={specs.length > 0} title={specs.length ? specs.map((x) => `${x.what}: ${x.value}`).join('\n') : t('pro.specOpen')}
                  onclick={(e) => { e.stopPropagation(); openSpec(row.id!); }} data-testid="elem-spec-{row.id}">
                  {specs.length ? specs.map(specLabel).join(' · ') : '—'}
                </button>
              {/if}
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
  .pro-elems-spec { margin: 6px 10px; align-self: flex-start; font-size: 0.66rem; }
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

  .pro-paste-error {
    padding: 4px 10px;
    font-size: 0.7rem;
    color: var(--st-danger);
    background: rgba(229, 72, 42, 0.1);
    border-bottom: 1px solid var(--st-hair-strong);
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
  .pro-elems-table tr.selected { background: var(--st-selected-bg); box-shadow: inset 3px 0 0 var(--st-selected, var(--st-accent)); }
  .pro-elems-table tr.unsaved td { opacity: 0.6; }

  .col-id {
    width: 32px;
    color: var(--st-text-3);
    font-family: monospace;
    font-size: 0.75rem;
    text-align: center;
  }

  .col-node { width: 50px; }
  .col-name { width: 18%; }
  .col-node input, .col-name input {
    width: 100%;
    padding: 4px 5px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 3px;
    color: var(--st-text);
    font-size: 0.78rem;
    font-family: monospace;
  }
  .col-name input { font-family: inherit; }
  .col-node input:focus, .col-name input:focus {
    background: var(--st-surface-3);
    border-color: var(--st-surface-3);
    outline: none;
  }

  .col-mat, .col-sec { width: auto; }
  .col-mat :global(select), .col-sec :global(select) {
    width: 100%;
    padding: 3px 3px;
    background: var(--st-surface-3);
    border: 1px solid transparent;
    border-radius: 3px;
    color: var(--st-text-2);
    font-size: 0.72rem;
    cursor: pointer;
  }
  .col-mat :global(select:focus), .col-sec :global(select:focus) {
    border-color: var(--st-surface-3);
    outline: none;
  }

  .col-spec { max-width: 9rem; }
  .spec-btn {
    max-width: 100%; padding: 2px 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    background: none; border: 1px solid transparent; border-radius: var(--st-radius);
    color: var(--st-text-3); font-size: 0.68rem; cursor: pointer; text-align: left;
  }
  .spec-btn.set { color: var(--st-warn); border-color: var(--st-hair-strong); }
  .spec-btn:hover { color: var(--st-text); border-color: var(--st-accent); }

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
  .pro-elems-spec-slot { visibility: hidden; pointer-events: none; }
</style>
