<script lang="ts">
  import { modelStore, resultsStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import MaterialPresetSelector from '../MaterialPresetSelector.svelte';
  import type { MaterialPreset } from '../../lib/data/material-presets';
  import { unitQ } from '../../lib/store/display-units.svelte';
  import UnitInput from '../UnitInput.svelte';

  const materialsArr = $derived([...modelStore.materials.values()]);

  let materialPresetTargetId = $state<number | null>(null);
  /** Which material has its properties open. One at a time: this is a list. */
  let expandedId = $state<number | null>(null);

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

  /** E, ρ and fy come from a UnitInput, already back in SI (MPa, kN/m³). */
  function setMaterialNumber(id: number, field: 'e' | 'rho' | 'fy', v: number) {
    if (!Number.isFinite(v)) return;
    modelStore.updateMaterial(id, { [field]: v });
    resultsStore.clear();
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
      // The catalogue link must travel too. Without it the material looks
      // ungraded, and the next profile picked for a member would overwrite
      // this deliberate steel with the profile's commercial default — the
      // exact interference `commercial-default.ts` exists to prevent.
      gradeId: preset.gradeId,
    });
    resultsStore.clear();
    showMaterialPresetSelector = false;
    materialPresetTargetId = null;
  }
</script>

<!--
  Number, name, and what you do with it — the same shape as the sections list.
  E, nu, rho and fy spread across every row made three materials read as a
  spreadsheet; they belong to ONE material at a time, which is a different
  question from "which materials are there".
-->
<table class="mat-list">
  <thead>
    <tr><th>ID</th><th>{t('table.name')}</th><th class="col-actions"></th></tr>
  </thead>
  <tbody>
    {#each materialsArr as mat}
      {@const open = expandedId === mat.id}
      <tr class:expanded={open}>
        <td class="id-cell">{mat.id}</td>
        <td class="name-cell">
          <input type="text" value={mat.name} onchange={(e) => updateMaterialField(mat.id, 'name', e.currentTarget.value)} />
        </td>
        <td class="action-cell">
          <button
            class="row-action-btn primary"
            title={t('table.chooseMaterial')}
            onclick={() => { materialPresetTargetId = mat.id; showMaterialPresetSelector = true; }}
          >&#9783;</button>
          <button
            class="row-action-btn"
            class:on={open}
            title={t('table.showProperties')}
            aria-expanded={open}
            onclick={() => expandedId = open ? null : mat.id}
          >&#9432;</button>
          <button class="del" onclick={() => deleteMaterial(mat.id)}>&#10005;</button>
        </td>
      </tr>
      {#if open}
        <tr class="detail-row">
          <td colspan="3">
            <div class="mat-detail">
              <label class="prop"><span>E ({unitQ('stress')})</span><UnitInput value={mat.e} qty="stress" unit={false} step="1000" onchange={(v) => setMaterialNumber(mat.id, 'e', v)} /></label>
              <label class="prop"><span>ν</span><input type="number" step="0.01" value={mat.nu} onchange={(e) => updateMaterialField(mat.id, 'nu', e.currentTarget.value)} /></label>
              <label class="prop"><span>ρ ({unitQ('density')})</span><UnitInput value={mat.rho} qty="density" unit={false} step="0.1" onchange={(v) => setMaterialNumber(mat.id, 'rho', v)} /></label>
              <label class="prop"><span>fy ({unitQ('stress')})</span><UnitInput value={mat.fy ?? NaN} qty="stress" unit={false} step="10" onchange={(v) => setMaterialNumber(mat.id, 'fy', v)} /></label>
            </div>
          </td>
        </tr>
      {/if}
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
  .mat-list .col-actions { width: 1%; }
  .mat-list .name-cell input { width: 100%; }
  .mat-list .action-cell { display: flex; gap: 4px; justify-content: flex-end; }
  .row-action-btn.primary { color: var(--st-value); border-color: var(--st-value); }
  .row-action-btn.on { background: var(--st-surface-3); color: var(--st-text); }
  tr.expanded > td { border-bottom-color: transparent; }
  .detail-row > td { padding: 0 0 8px; }
  .mat-detail {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 4px 14px;
    padding: 9px 11px;
    border-radius: var(--st-radius, 3px);
    background: var(--st-surface-2);
  }
  .prop {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    font-size: 0.74rem;
    color: var(--st-text-3);
  }
  /* :global because E, ρ and fy are inputs inside UnitInput. */
  .prop :global(input) { width: 90px; text-align: right; }

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

  td :global(input[type="number"]),
  td input[type="text"] {
    width: 55px;
    padding: 0.1rem 0.2rem;
    background: var(--st-surface-3);
    border: 1px solid var(--st-surface-3);
    border-radius: 3px;
    color: var(--st-text);
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
    background: var(--st-surface-3);
    border: 1px solid var(--st-surface-3);
    border-radius: 3px;
    color: var(--st-value);
    cursor: pointer;
    font-size: 0.8rem;
    padding: 0.1rem 0.3rem;
    line-height: 1;
    transition: all 0.15s;
  }

  .row-action-btn:hover {
    background: var(--st-surface-3);
    color: white;
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
