<script lang="ts">
  import { modelStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import {
    getMaterialPresets, MATERIAL_CATEGORIES, searchPresets,
    type MaterialPreset,
  } from '../../lib/data/material-presets';

  let activeCategory = $state<string>('hormigon');
  let searchQuery = $state('');
  let filtered = $derived(searchPresets(searchQuery, activeCategory));

  // Custom material form
  let showCustom = $state(false);
  let newName = $state('');
  let newE = $state('');
  let newNu = $state('');
  let newRho = $state('');
  let newFy = $state('');

  const materials = $derived([...modelStore.materials.values()]);

  function addPreset(p: MaterialPreset) {
    modelStore.addMaterial({
      name: p.name,
      e: p.e,
      nu: p.nu,
      rho: p.rho,
      fy: p.fy,
    });
  }

  function addCustom() {
    const e = parseFloat(newE);
    const nu = parseFloat(newNu);
    const rho = parseFloat(newRho);
    const fy = parseFloat(newFy);
    if (!newName.trim() || isNaN(e) || isNaN(nu) || isNaN(rho)) return;
    modelStore.addMaterial({
      name: newName.trim(),
      e,
      nu,
      rho,
      fy: isNaN(fy) ? undefined : fy,
    });
    newName = ''; newE = ''; newNu = ''; newRho = ''; newFy = '';
    showCustom = false;
  }

  function removeMat(id: number) {
    modelStore.removeMaterial(id);
  }
</script>

<div class="pro-mat">
  <!-- Collapsible add-material panel -->
  <details class="add-panel">
    <summary class="add-panel-summary">{t('pro.addMaterialPanel')}</summary>
    <div class="add-panel-body">

  <!-- Category tabs -->
  <div class="cat-tabs">
    {#each MATERIAL_CATEGORIES as cat}
      <button
        class:active={activeCategory === cat.id}
        onclick={() => { activeCategory = cat.id; searchQuery = ''; }}
      >{t(cat.label)}</button>
    {/each}
  </div>

  <!-- Search -->
  <div class="search-wrap">
    <input type="text" placeholder={t('search.material')} bind:value={searchQuery} />
  </div>

  <!-- Preset list -->
  <div class="preset-list">
    {#each filtered as p}
      <button class="preset-item" onclick={() => addPreset(p)}>
        <span class="preset-name">{p.name}</span>
        <span class="preset-props">
          E={p.e >= 1000 ? `${(p.e/1000).toFixed(0)}GPa` : `${p.e}MPa`}
          {#if p.fy}&nbsp; fy={p.fy}MPa{/if}
          &nbsp; {t('field.density')}={p.rho}
        </span>
      </button>
    {/each}
    {#if filtered.length === 0}
      <p class="no-results">{t('search.noResults')}</p>
    {/if}
  </div>

  <!-- Custom material toggle -->
  <div class="custom-section">
    <button class="custom-toggle" onclick={() => showCustom = !showCustom}>
      {showCustom ? '−' : '+'} {t('pro.customMaterial')}
    </button>
    {#if showCustom}
      <div class="custom-form">
        <div class="custom-row">
          <label><span>{t('pro.thName')}</span>
            <input type="text" bind:value={newName} placeholder="Ej: Acero S275" /></label>
        </div>
        <div class="custom-row">
          <label><span>E (MPa)</span>
            <input type="number" bind:value={newE} placeholder="200000" /></label>
          <label><span>{t('field.poisson')}</span>
            <input type="number" step="0.01" bind:value={newNu} placeholder="0.3" /></label>
        </div>
        <div class="custom-row">
          <label><span>{t('field.density')} (kN/m³)</span>
            <input type="number" step="0.1" bind:value={newRho} placeholder="78.5" /></label>
          <label><span>fy (MPa)</span>
            <input type="number" bind:value={newFy} placeholder={t('pro.optional')} /></label>
        </div>
        <button class="add-btn" onclick={addCustom}>{t('pro.addMaterial')}</button>
      </div>
    {/if}
  </div>

    </div>
  </details>

  <!-- Materials table -->
  <div class="mat-list">
    <div class="mat-list-header">
      <span class="mat-count">{t('pro.nMaterials').replace('{n}', String(materials.length))}</span>
    </div>
    <div class="mat-table-wrap">
      <table class="mat-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>{t('pro.thName')}</th>
            <th>E (MPa)</th>
            <th>{t('field.poisson')}</th>
            <th>{t('field.density')}</th>
            <th>fy</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each materials as m}
            <tr>
              <td class="col-id">{m.id}</td>
              <td class="col-name">{m.name}</td>
              <td class="col-num">{m.e.toLocaleString()}</td>
              <td class="col-num">{m.nu}</td>
              <td class="col-num">{m.rho}</td>
              <td class="col-num">{m.fy ?? '—'}</td>
              <td><button class="del-btn" onclick={() => removeMat(m.id)}>×</button></td>
            </tr>
          {/each}
          {#if materials.length === 0}
            <tr><td colspan="7" class="no-results">{t('pro.noMaterials')}</td></tr>
          {/if}
        </tbody>
      </table>
    </div>
  </div>
</div>

<style>
  .pro-mat {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  /* ─── Add Panel (collapsible) ─── */
  .add-panel {
    flex-shrink: 0;
    border-bottom: 2px solid #0f3460;
  }
  .add-panel[open] {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .add-panel-summary {
    padding: 8px 12px;
    font-size: 0.78rem;
    font-weight: 600;
    color: #4ecdc4;
    cursor: pointer;
    user-select: none;
    list-style: none;
  }
  .add-panel-summary::-webkit-details-marker { display: none; }
  .add-panel-summary::before {
    content: '+ ';
  }
  .add-panel[open] > .add-panel-summary::before {
    content: '− ';
  }
  .add-panel-summary:hover { color: #6eede4; }
  .add-panel-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* ─── Category Tabs ─── */
  .cat-tabs {
    display: flex;
    border-bottom: 2px solid #0f3460;
    flex-shrink: 0;
  }
  .cat-tabs button {
    flex: 1;
    padding: 0.45rem 0.4rem;
    border: none;
    background: transparent;
    color: #888;
    cursor: pointer;
    font-size: 0.72rem;
    font-weight: 500;
    border-bottom: 2px solid transparent;
    margin-bottom: -2px;
    transition: all 0.15s;
  }
  .cat-tabs button:hover { color: #ccc; }
  .cat-tabs button.active { color: #4ecdc4; border-bottom-color: #4ecdc4; }

  /* ─── Search ─── */
  .search-wrap {
    padding: 6px 8px;
    flex-shrink: 0;
  }
  .search-wrap input {
    width: 100%;
    padding: 5px 8px;
    background: #0f2840;
    border: 1px solid #1a3050;
    border-radius: 4px;
    color: #eee;
    font-size: 0.78rem;
  }
  .search-wrap input::placeholder { color: #555; }
  .search-wrap input:focus { outline: none; border-color: #4ecdc4; }

  /* ─── Preset List ─── */
  .preset-list {
    flex: 1;
    overflow-y: auto;
    padding: 0 6px;
    min-height: 0;
  }
  .preset-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding: 6px 8px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    color: #ccc;
    cursor: pointer;
    font-size: 0.78rem;
    text-align: left;
    transition: all 0.12s;
  }
  .preset-item:hover {
    background: #1a4a7a;
    border-color: #4ecdc4;
    color: white;
  }
  .preset-name { font-weight: 600; white-space: nowrap; }
  .preset-props { font-size: 0.65rem; color: #777; white-space: nowrap; }
  .preset-item:hover .preset-props { color: #aaa; }

  .no-results {
    text-align: center;
    color: #555;
    font-size: 0.75rem;
    padding: 1rem;
  }

  /* ─── Custom Material ─── */
  .custom-section {
    flex-shrink: 0;
    border-top: 1px solid #1a3050;
    padding: 4px 8px 6px;
  }
  .custom-toggle {
    background: none;
    border: none;
    color: #888;
    font-size: 0.75rem;
    cursor: pointer;
    padding: 4px 0;
    width: 100%;
    text-align: left;
  }
  .custom-toggle:hover { color: #4ecdc4; }

  .custom-form {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding-top: 4px;
  }
  .custom-row {
    display: flex;
    gap: 8px;
  }
  .custom-row label {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 0.7rem;
    color: #888;
  }
  .custom-row input {
    padding: 4px 6px;
    background: #0f2840;
    border: 1px solid #1a3050;
    border-radius: 3px;
    color: #ddd;
    font-size: 0.75rem;
    font-family: monospace;
  }
  .custom-row input:focus { outline: none; border-color: #4ecdc4; }

  .add-btn {
    margin-top: 4px;
    padding: 5px 12px;
    background: #0f4a3a;
    border: 1px solid #1a7a5a;
    border-radius: 4px;
    color: #4ecdc4;
    cursor: pointer;
    font-size: 0.75rem;
    font-weight: 600;
    align-self: flex-start;
    transition: all 0.15s;
  }
  .add-btn:hover { background: #1a7a5a; color: white; }

  /* ─── Materials Table ─── */
  .mat-list {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .add-panel[open] ~ .mat-list {
    flex: 0 0 auto;
    max-height: 160px;
  }
  .mat-list-header {
    padding: 5px 10px;
    flex-shrink: 0;
  }
  .mat-count {
    font-size: 0.78rem;
    color: #4ecdc4;
    font-weight: 600;
  }
  .mat-table-wrap {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }
  .mat-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.72rem;
  }
  .mat-table thead { position: sticky; top: 0; z-index: 1; }
  .mat-table th {
    padding: 4px 5px;
    text-align: left;
    font-size: 0.65rem;
    font-weight: 600;
    color: #666;
    text-transform: uppercase;
    background: #0a1a30;
    border-bottom: 1px solid #1a3050;
  }
  .mat-table td {
    padding: 3px 5px;
    border-bottom: 1px solid #0f2030;
    color: #bbb;
  }
  .col-id { width: 28px; color: #555; font-family: monospace; text-align: center; }
  .col-name { max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .col-num { font-family: monospace; text-align: right; font-size: 0.68rem; }
  .del-btn {
    background: none; border: none; color: #444; font-size: 0.9rem; cursor: pointer; padding: 0;
  }
  .del-btn:hover { color: #ff6b6b; }
</style>
