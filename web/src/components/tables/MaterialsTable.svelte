<script lang="ts">
  import { modelStore, resultsStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import MaterialPresetSelector from '../MaterialPresetSelector.svelte';
  import type { MaterialPreset } from '../../lib/data/material-presets';

  const materialsArr = $derived([...modelStore.materials.values()]);

  let materialPresetTargetId = $state<number | null>(null);
  let showMaterialPresetSelector = $state(false);

  function addMaterial() {
    modelStore.addMaterial({ name: t('table.newMaterial'), e: 200000, nu: 0.3, rho: 78.5 });
  }

  function updateMaterialField(id: number, field: string, val: string) {
    if (field === 'name') {
      modelStore.updateMaterial(id, { name: val });
    } else {
      const num = parseFloat(val);
      if (isNaN(num)) return;
      modelStore.updateMaterial(id, { [field]: num });
      resultsStore.clear();
    }
  }

  function deleteMaterial(id: number) {
    const ok = modelStore.removeMaterial(id);
    if (!ok) alert(t('table.cannotDeleteMaterial'));
  }

  function handleMaterialPresetSelect(preset: MaterialPreset) {
    if (materialPresetTargetId === null) return;
    modelStore.updateMaterial(materialPresetTargetId, {
      name: preset.name,
      e: preset.e,
      nu: preset.nu,
      rho: preset.rho,
      fy: preset.fy,
    });
    resultsStore.clear();
    showMaterialPresetSelector = false;
    materialPresetTargetId = null;
  }
</script>

<table>
  <thead>
    <tr><th>ID</th><th>{t('table.name')}</th><th>E (MPa)</th><th>&nu;</th><th>&rho; (kN/m&sup3;)</th><th>fy (MPa)</th><th></th></tr>
  </thead>
  <tbody>
    {#each materialsArr as mat}
      <tr>
        <td class="id-cell">{mat.id}</td>
        <td class="name-with-action">
          <input type="text" value={mat.name} onchange={(e) => updateMaterialField(mat.id, 'name', e.currentTarget.value)} />
          <button class="row-action-btn" title={t('table.chooseMaterial')} onclick={() => { materialPresetTargetId = mat.id; showMaterialPresetSelector = true; }}>&#9783;</button>
        </td>
        <td><input type="number" step="1000" value={mat.e} onchange={(e) => updateMaterialField(mat.id, 'e', e.currentTarget.value)} /></td>
        <td><input type="number" step="0.01" value={mat.nu} onchange={(e) => updateMaterialField(mat.id, 'nu', e.currentTarget.value)} /></td>
        <td><input type="number" step="0.1" value={mat.rho} onchange={(e) => updateMaterialField(mat.id, 'rho', e.currentTarget.value)} /></td>
        <td><input type="number" step="10" value={mat.fy ?? ''} onchange={(e) => updateMaterialField(mat.id, 'fy', e.currentTarget.value)} /></td>
        <td class="action-cell">
          <button class="del" onclick={() => deleteMaterial(mat.id)}>&#10005;</button>
        </td>
      </tr>
    {/each}
  </tbody>
</table>
<div class="table-footer">
  <button class="add-btn" onclick={addMaterial}>{t('table.addMaterialCustom')}</button>
</div>
<MaterialPresetSelector
  open={showMaterialPresetSelector}
  onselect={(p: MaterialPreset) => handleMaterialPresetSelect(p)}
  onclose={() => { showMaterialPresetSelector = false; materialPresetTargetId = null; }}
/>

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

  td input[type="number"],
  td input[type="text"] {
    width: 55px;
    padding: 0.1rem 0.2rem;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 3px;
    color: #eee;
    font-size: 0.7rem;
  }

  td input[type="text"] {
    width: 80px;
  }

  .action-cell {
    display: flex;
    gap: 0.2rem;
    align-items: center;
  }

  .name-with-action {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .name-with-action input {
    flex: 1;
    min-width: 0;
  }

  .row-action-btn {
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 3px;
    color: #4ecdc4;
    cursor: pointer;
    font-size: 0.8rem;
    padding: 0.1rem 0.3rem;
    line-height: 1;
    transition: all 0.15s;
  }

  .row-action-btn:hover {
    background: #1a4a7a;
    color: white;
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
