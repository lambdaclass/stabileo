<script lang="ts">
  import { modelStore, uiStore, historyStore, resultsStore } from '../../lib/store';
  import { t } from '../../lib/i18n';

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
</script>

<table>
  <thead>
    <tr><th>ID</th><th>{t('table.type')}</th><th>{t('table.nodeI')}</th><th>{t('table.nodeJ')}</th><th>{t('prop.material')}</th><th>{t('table.sectionHeader')}</th><th>{t('table.hingeI')}</th><th>{t('table.hingeJ')}</th><th>L (m)</th><th></th></tr>
  </thead>
  <tbody>
    {#each elementsArr as elem}
      <tr>
        <td class="id-cell">{elem.id}</td>
        <td>{elem.type}</td>
        <td>{elem.nodeI}</td>
        <td>{elem.nodeJ}</td>
        <td>
          <select value={String(elem.materialId)} onchange={(e) => changeElementMaterial(elem.id, e.currentTarget.value)}>
            {#each materialsArr as mat}
              <option value={String(mat.id)}>{mat.name}</option>
            {/each}
          </select>
        </td>
        <td>
          <select value={String(elem.sectionId)} onchange={(e) => changeElementSection(elem.id, e.currentTarget.value)}>
            {#each sectionsArr as sec}
              <option value={String(sec.id)}>{sec.name}</option>
            {/each}
          </select>
        </td>
        <td class="hinge-cell" onclick={() => modelStore.toggleHinge(elem.id, 'start')}>{elem.hingeStart ? '\u25CB' : '\u2014'}</td>
        <td class="hinge-cell" onclick={() => modelStore.toggleHinge(elem.id, 'end')}>{elem.hingeEnd ? '\u25CB' : '\u2014'}</td>
        <td>{modelStore.getElementLength(elem.id).toFixed(3)}</td>
        <td><button class="del" onclick={() => deleteElement(elem.id)}>&#10005;</button></td>
      </tr>
    {/each}
  </tbody>
</table>
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
  table {
    width: max-content;
    min-width: 100%;
    border-collapse: collapse;
  }

  th {
    text-align: left;
    padding: 0.25rem 0.35rem;
    color: #888;
    font-weight: 500;
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    border-bottom: 1px solid #0f3460;
    position: sticky;
    top: 0;
    background: #16213e;
    white-space: nowrap;
  }

  td {
    padding: 0.2rem 0.35rem;
    border-bottom: 1px solid #0a1a30;
    color: #ccc;
    white-space: nowrap;
  }

  .id-cell {
    color: #4ecdc4;
    font-weight: 600;
  }

  td input[type="number"] {
    width: 55px;
    padding: 0.1rem 0.2rem;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 3px;
    color: #eee;
    font-size: 0.7rem;
  }

  td select {
    padding: 0.1rem 0.2rem;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 3px;
    color: #eee;
    font-size: 0.7rem;
    cursor: pointer;
    max-width: 90px;
  }

  .hinge-cell {
    cursor: pointer;
    text-align: center;
    user-select: none;
  }
  .hinge-cell:hover {
    color: #4ecdc4;
  }

  .del {
    background: none;
    border: none;
    color: #666;
    cursor: pointer;
    font-size: 0.8rem;
    padding: 0.1rem 0.3rem;
  }
  .del:hover {
    color: #e94560;
  }

  tr:hover {
    background: rgba(78, 205, 196, 0.05);
  }

  .table-footer {
    padding: 0.5rem;
    border-top: 1px solid #0a1a30;
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
    color: #888;
    flex-shrink: 0;
  }

  .add-input {
    background: #16213e;
    color: #ccc;
    border: 1px solid #0f3460;
    border-radius: 3px;
    padding: 0.2rem 0.3rem;
    font-size: 0.75rem;
    width: 60px;
  }

  .add-btn {
    width: 100%;
    padding: 0.4rem 0.5rem;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    color: #4ecdc4;
    cursor: pointer;
    font-size: 0.8rem;
    transition: all 0.2s;
  }

  .add-btn:hover {
    background: #1a4a7a;
    color: white;
  }
</style>
