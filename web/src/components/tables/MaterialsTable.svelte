<script lang="ts">
  import { modelStore, resultsStore, uiStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import MaterialPresetSelector from '../MaterialPresetSelector.svelte';
  import MaterialForm from './MaterialForm.svelte';
  import type { MaterialPreset } from '../../lib/data/material-presets';

  const materialsArr = $derived([...modelStore.materials.values()]);

  let materialPresetTargetId = $state<number | null>(null);
  let formFor = $state<number | 'new' | null>(null);

  let showMaterialPresetSelector = $state(false);

  function renameMaterial(id: number, name: string) {
    modelStore.updateMaterial(id, { name });
  }

  function deleteMaterial(id: number) {
    const ok = modelStore.removeMaterial(id);
    if (!ok) uiStore.toast(t('table.cannotDeleteMaterial'), 'error');
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

{#if formFor !== null}
  {#key formFor}
    <MaterialForm materialId={formFor === 'new' ? null : formFor} onDone={() => (formFor = null)} />
  {/key}
{:else}
<table class="mat-list">
  <thead>
    <tr><th>ID</th><th>{t('table.name')}</th><th class="col-actions"></th></tr>
  </thead>
  <tbody>
    {#each materialsArr as mat (mat.id)}
      <tr data-testid="mat-row-{mat.id}">
        <td class="id-cell">{mat.id}</td>
        <td class="name-cell">
          <input type="text" value={mat.name} onchange={(e) => renameMaterial(mat.id, e.currentTarget.value)} />
        </td>
        <td class="action-cell">
          <button
            class="row-action-btn primary"
            title={t('table.chooseMaterial')}
            aria-label={t('table.chooseMaterial')}
            onclick={() => { materialPresetTargetId = mat.id; showMaterialPresetSelector = true; }}
          >&#9783;</button>
          <button
            class="row-action-btn"
            title={t('prop.editMaterial')}
            aria-label={t('prop.editMaterial')}
            data-testid="mat-edit-{mat.id}"
            onclick={() => (formFor = mat.id)}
          >&#9998;</button>
          <button class="del" aria-label={t('matEdit.delete')} data-testid="mat-delete-{mat.id}" onclick={() => deleteMaterial(mat.id)}>&#10005;</button>
        </td>
      </tr>
    {/each}
  </tbody>
</table>
<div class="table-footer">
  <button class="add-btn" data-testid="mat-new" onclick={() => (formFor = 'new')}>{t('table.addMaterialCustom')}</button>
</div>
{/if}
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

  @media (pointer: coarse), (max-width: 767px) {
    .row-action-btn, .del { min-width: 44px; min-height: 44px; font-size: 1rem; }
    td input[type="text"] { min-height: 44px; font-size: 16px; width: 120px; }
    .add-btn { min-height: 44px; font-size: 0.9rem; }
  }
</style>
