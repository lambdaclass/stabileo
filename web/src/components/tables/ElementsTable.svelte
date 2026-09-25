<script lang="ts">
  import { modelStore, historyStore, resultsStore, uiStore } from '../../lib/store';
  import PairingNote from '../property/PairingNote.svelte';
  import { isUnusualPairing } from '../../lib/data/structural-grades';
  import { t } from '../../lib/i18n';
  import EndConditionSelect from '../EndConditionSelect.svelte';
  import type { Release } from '../../lib/store/model.svelte';

  const is3DMode = $derived(uiStore.analysisMode === '3d' || uiStore.analysisMode === 'pro');

  /*
   * ── Everything about a member, editable here ─────────────────────
   * Type, end nodes and end conditions were read-only text (the ends a ○/—
   * that toggled a plain hinge on click), so a slide, a hinge + slide or a
   * member's sense could only be set on the canvas. Each is a control now,
   * the ends the same one the member card uses.
   */
  function setType(id: number, type: 'frame' | 'truss') {
    historyStore.pushState({ notifyMutation: false });
    modelStore.updateElement(id, { type });
  }

  function setEnd(id: number, end: 'i' | 'j', r: Release) {
    historyStore.pushState({ notifyMutation: false });
    modelStore.updateElement(id, end === 'i' ? { releaseI: r } : { releaseJ: r });
  }

  /**
   * A new end node. Choosing the other end's node for it is asking for the
   * member the other way round, which is a reversal (loads and ends follow),
   * not a zero-length member.
   */
  function setNode(id: number, end: 'i' | 'j', nodeId: number) {
    const el = modelStore.elements.get(id);
    if (!el || !modelStore.getNode(nodeId)) return;
    const other = end === 'i' ? el.nodeJ : el.nodeI;
    if (nodeId === (end === 'i' ? el.nodeI : el.nodeJ)) return;
    if (nodeId === other) { modelStore.reverseElement(id); return; }
    historyStore.pushState({ notifyMutation: false });
    modelStore.updateElement(id, end === 'i' ? { nodeI: nodeId } : { nodeJ: nodeId });
  }

  const nodesArr = $derived([...modelStore.nodes.values()]);
  const elementsArr = $derived([...modelStore.elements.values()]);
  const materialsArr = $derived([...modelStore.materials.values()]);
  const sectionsArr = $derived([...modelStore.sections.values()]);

  let newElemNodeI = $state(0);
  let newElemNodeJ = $state(0);
  let newElemType = $state<'frame' | 'truss'>('frame');

  function deleteElement(id: number) {
    modelStore.removeElement(id);
  }

  function changeElementMaterial(elemId: number, val: string) {
    const matId = parseInt(val);
    if (isNaN(matId)) return;
    modelStore.updateElementMaterial(elemId, matId);
  }

  function changeElementSection(elemId: number, val: string) {
    const secId = parseInt(val);
    if (isNaN(secId)) return;
    modelStore.updateElementSection(elemId, secId);
  }

  function addElement() {
    if (!modelStore.getNode(newElemNodeI) || !modelStore.getNode(newElemNodeJ)) return;
    if (newElemNodeI === newElemNodeJ) return;
    historyStore.pushState();
    modelStore.addElement(newElemNodeI, newElemNodeJ, newElemType);
    resultsStore.clear();
  }

  /**
   * Members whose section and material depart from every recorded practice.
   *
   * Computed once for the table rather than asked per row, so the notes can be
   * rendered together below it — and so a model with none renders nothing at
   * all, which is the common case.
   */
  const unusualPairings = $derived(
    elementsArr.flatMap((elem) => {
      const secOf = modelStore.sections.get(elem.sectionId);
      const matOf = modelStore.materials.get(elem.materialId);
      const family = secOf?.profileFamily;
      const gradeId = matOf?.gradeId;
      return isUnusualPairing(family ?? '', gradeId) === true
        ? [{ elemId: elem.id, family, gradeId }]
        : [];
    }),
  );
</script>

<table>
  <thead>
    <tr><th>ID</th><th>{t('table.type')}</th><th>{t('table.nodeI')}</th><th>{t('table.nodeJ')}</th><th>{t('prop.material')}</th><th>{t('table.sectionHeader')}</th><th title={is3DMode ? t('prop.hinge3DDisclosure') : ''}>{t('table.hingeI')}{is3DMode ? ` ${t('prop.hinges3DSuffix')}` : ''}</th><th title={is3DMode ? t('prop.hinge3DDisclosure') : ''}>{t('table.hingeJ')}{is3DMode ? ` ${t('prop.hinges3DSuffix')}` : ''}</th><th>L (m)</th><th></th></tr>
  </thead>
  <tbody>
    {#each elementsArr as elem}
      <tr>
        <td class="id-cell">{elem.id}</td>
        <td>
          <select value={elem.type} onchange={(e) => setType(elem.id, e.currentTarget.value as 'frame' | 'truss')} data-testid="elem-type-{elem.id}">
            <option value="frame">{t('table.frame')}</option>
            <option value="truss">{t('table.truss')}</option>
          </select>
        </td>
        <td>
          <select class="node-sel" value={elem.nodeI} onchange={(e) => setNode(elem.id, 'i', Number(e.currentTarget.value))} data-testid="elem-node-i-{elem.id}">
            {#each nodesArr as n (n.id)}<option value={n.id}>{n.id}</option>{/each}
          </select>
        </td>
        <td>
          <select class="node-sel" value={elem.nodeJ} onchange={(e) => setNode(elem.id, 'j', Number(e.currentTarget.value))} data-testid="elem-node-j-{elem.id}">
            {#each nodesArr as n (n.id)}<option value={n.id}>{n.id}</option>{/each}
          </select>
          <button class="flip" title={t('editor.reverseHint')} aria-label={t('editor.reverse')}
            onclick={() => modelStore.reverseElement(elem.id)} data-testid="elem-reverse-{elem.id}">⇄</button>
        </td>
        <td>
          <select value={String(elem.materialId)} onchange={(e) => changeElementMaterial(elem.id, e.currentTarget.value)} data-testid="elem-material-{elem.id}">
            {#each materialsArr as mat}
              <option value={String(mat.id)}>{mat.name}</option>
            {/each}
          </select>
        </td>
        <td>
          <select value={String(elem.sectionId)} onchange={(e) => changeElementSection(elem.id, e.currentTarget.value)} data-testid="elem-section-{elem.id}">
            {#each sectionsArr as sec}
              <option value={String(sec.id)}>{sec.name}</option>
            {/each}
          </select>
        </td>
        <td class="end-cell" title={is3DMode ? t('prop.hinge3DDisclosure') : ''}>
          <EndConditionSelect compact release={elem.releaseI} is3D={is3DMode} onchange={(r) => setEnd(elem.id, 'i', r)} testid="elem-end-i-{elem.id}" />
        </td>
        <td class="end-cell" title={is3DMode ? t('prop.hinge3DDisclosure') : ''}>
          <EndConditionSelect compact release={elem.releaseJ} is3D={is3DMode} onchange={(r) => setEnd(elem.id, 'j', r)} testid="elem-end-j-{elem.id}" />
        </td>
        <td>{modelStore.getElementLength(elem.id).toFixed(3)}</td>
        <td><button class="del" onclick={() => deleteElement(elem.id)}>&#10005;</button></td>
      </tr>
    {/each}
  </tbody>
</table>

<!--
  Supply notes, below the table rather than interleaved with it.
  
  They lived only in the properties panel, which desktop Basic never renders —
  the ribbon replaced that panel and the drawer it sits in is mobile-only — so
  the one thing the pairing table exists to say was said nowhere at all.
  
  Below rather than as a row inside: this table is laid out at `max-content`,
  so a cell spanning every column stretches to the width of the widest row and
  carries the note off the right edge of the panel. Outside it, the note wraps
  to the panel like any other block, and the table stays tabular.
-->
{#each unusualPairings as u}
  <div class="pairing-note">
    <span class="pairing-elem">#{u.elemId}</span>
    <PairingNote family={u.family} gradeId={u.gradeId} />
  </div>
{/each}

<div class="table-footer">
  <div class="add-row">
    <span class="add-label">I:</span>
    <select bind:value={newElemNodeI} class="add-input">
      {#each nodesArr as n}<option value={n.id}>{n.id}</option>{/each}
    </select>
    <span class="add-label">J:</span>
    <select bind:value={newElemNodeJ} class="add-input">
      {#each nodesArr as n}<option value={n.id}>{n.id}</option>{/each}
    </select>
    <select bind:value={newElemType} class="add-input">
      <option value="frame">{t('table.frame')}</option>
      <option value="truss">{t('table.truss')}</option>
    </select>
    <button class="add-btn" onclick={addElement}>{t('table.addElement')}</button>
  </div>
</div>

<style>
  .pairing-note {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    padding: 0 0.5rem;
  }
  /* Which member the note is about. The table above is sorted by id, so the
     number is enough to find it. */
  .pairing-elem {
    font-size: 0.66rem;
    color: var(--st-text-3);
    padding-top: 9px;
    flex: none;
  }

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

  td input[type="number"] {
    width: 55px;
    padding: 0.1rem 0.2rem;
    background: var(--st-surface-3);
    border: 1px solid var(--st-surface-3);
    border-radius: 3px;
    color: var(--st-text);
    font-size: 0.7rem;
  }

  td select {
    padding: 0.1rem 0.2rem;
    background: var(--st-surface-3);
    border: 1px solid var(--st-surface-3);
    border-radius: 3px;
    color: var(--st-text);
    font-size: 0.7rem;
    cursor: pointer;
    max-width: 90px;
  }

  /* An end condition, with its axis beside it when it slides. */
  .end-cell { min-width: 96px; }
  .end-cell :global(.ec) { display: flex; }

  td select.node-sel { max-width: 52px; }

  .flip {
    background: none;
    border: none;
    color: var(--st-text-3);
    cursor: pointer;
    font-size: 0.72rem;
    padding: 0 0.2rem;
  }
  .flip:hover { color: var(--st-value); }

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

  .add-input {
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
