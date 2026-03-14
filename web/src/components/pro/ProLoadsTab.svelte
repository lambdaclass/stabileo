<script lang="ts">
  import { modelStore, uiStore, resultsStore } from '../../lib/store';
  import type { LoadCaseType } from '../../lib/store/model.svelte';
  import { t } from '../../lib/i18n';
  import ProAutoLoadsDialog from './ProAutoLoadsDialog.svelte';

  let showAutoLoadsDialog = $state(false);

  type LoadKind = 'nodal' | 'distributed' | 'point' | 'surface' | 'thermalQuad';

  let loadKind = $state<LoadKind>('nodal');
  let activeCaseId = $state(1); // default to first load case

  // Load visibility toggle per case
  function isCaseVisible(caseId: number): boolean {
    const vis = uiStore.visibleLoadCases3D;
    return vis === null || vis.includes(caseId);
  }

  function toggleCaseVisibility(caseId: number) {
    const current = uiStore.visibleLoadCases3D;
    if (current === null) {
      // Currently showing all → hide this one (show all except this)
      uiStore.visibleLoadCases3D = loadCases.map(lc => lc.id).filter(id => id !== caseId);
    } else {
      if (current.includes(caseId)) {
        const next = current.filter(id => id !== caseId);
        uiStore.visibleLoadCases3D = next;
      } else {
        const next = [...current, caseId];
        // If all cases are visible, reset to null (show all)
        uiStore.visibleLoadCases3D = next.length >= loadCases.length ? null : next;
      }
    }
    // Ensure loads are shown
    uiStore.showLoads3D = true;
  }

  function showAllCases() {
    uiStore.visibleLoadCases3D = null;
    uiStore.showLoads3D = true;
    uiStore.hideLoadsWithDiagram = false;
  }

  function hideAllCases() {
    uiStore.visibleLoadCases3D = [];
  }

  // Nodal load fields
  let nlNodeId = $state('');
  let nlFx = $state('');
  let nlFy = $state('');
  let nlFz = $state('');
  let nlMx = $state('');
  let nlMy = $state('');
  let nlMz = $state('');

  // Distributed load fields
  let dlElemId = $state('');
  let dlQyI = $state('');
  let dlQyJ = $state('');
  let dlQzI = $state('');
  let dlQzJ = $state('');

  // Point load on element fields
  let plElemId = $state('');
  let plA = $state('');
  let plPy = $state('');
  let plPz = $state('');

  // Surface load fields
  let slQuadId = $state('');
  let slQ = $state('');

  // Thermal quad load fields
  let tqQuadId = $state('');
  let tqDtUniform = $state('');
  let tqDtGradient = $state('');

  // New load case fields
  let newCaseName = $state('');
  let newCaseType = $state<LoadCaseType>('');

  // New combination fields
  let newComboName = $state('');

  const loads = $derived(modelStore.loads);
  const loadCases = $derived(modelStore.model.loadCases);
  const combinations = $derived(modelStore.model.combinations);

  // Filter loads by active case
  const caseLoads = $derived(loads.filter(l => (l.data.caseId ?? 1) === activeCaseId));
  const nodalLoads = $derived(caseLoads.filter(l => l.type === 'nodal3d'));
  const distLoads = $derived(caseLoads.filter(l => l.type === 'distributed3d'));
  const pointLoads = $derived(caseLoads.filter(l => l.type === 'pointOnElement3d'));
  const surfaceLoads = $derived(caseLoads.filter(l => l.type === 'surface3d'));
  const thermalQuadLoads = $derived(caseLoads.filter(l => l.type === 'thermalQuad3d'));

  const caseTypeLabels = $derived<Record<string, string>>({
    'D': t('pro.caseTypeD'),
    'L': t('pro.caseTypeL'),
    'W': t('pro.caseTypeW'),
    'E': t('pro.caseTypeE'),
    'S': t('pro.caseTypeS'),
    'T': t('pro.caseTypeT'),
    '': t('pro.caseTypeOther'),
  });

  function addNodalLoad() {
    const nodeId = parseInt(nlNodeId);
    if (isNaN(nodeId) || !modelStore.nodes.has(nodeId)) return;
    const fx = parseFloat(nlFx) || 0;
    const fy = parseFloat(nlFy) || 0;
    const fz = parseFloat(nlFz) || 0;
    const mx = parseFloat(nlMx) || 0;
    const my = parseFloat(nlMy) || 0;
    const mz = parseFloat(nlMz) || 0;
    if (fx === 0 && fy === 0 && fz === 0 && mx === 0 && my === 0 && mz === 0) return;
    modelStore.addNodalLoad3D(nodeId, fx, fy, fz, mx, my, mz, activeCaseId);
    nlNodeId = ''; nlFx = ''; nlFy = ''; nlFz = ''; nlMx = ''; nlMy = ''; nlMz = '';
  }

  function addDistLoad() {
    const elemId = parseInt(dlElemId);
    if (isNaN(elemId) || !modelStore.elements.has(elemId)) return;
    const qyI = parseFloat(dlQyI) || 0;
    const qyJ = parseFloat(dlQyJ) || qyI;
    const qzI = parseFloat(dlQzI) || 0;
    const qzJ = parseFloat(dlQzJ) || qzI;
    if (qyI === 0 && qyJ === 0 && qzI === 0 && qzJ === 0) return;
    modelStore.addDistributedLoad3D(elemId, qyI, qyJ, qzI, qzJ, undefined, undefined, activeCaseId);
    dlElemId = ''; dlQyI = ''; dlQyJ = ''; dlQzI = ''; dlQzJ = '';
  }

  function addPointLoad() {
    const elemId = parseInt(plElemId);
    if (isNaN(elemId) || !modelStore.elements.has(elemId)) return;
    const a = parseFloat(plA);
    const py = parseFloat(plPy) || 0;
    const pz = parseFloat(plPz) || 0;
    if (isNaN(a) || a < 0 || (py === 0 && pz === 0)) return;
    modelStore.addPointLoadOnElement3D(elemId, a, py, pz, activeCaseId);
    plElemId = ''; plA = ''; plPy = ''; plPz = '';
  }

  function addSurfaceLoad() {
    const quadId = parseInt(slQuadId);
    if (isNaN(quadId)) return;
    if (!modelStore.model.quads.has(quadId)) {
      uiStore.toast(t('pro.noQuadFound'), 'error');
      return;
    }
    const q = parseFloat(slQ) || 0;
    if (q === 0) return;
    modelStore.addSurfaceLoad3D(quadId, q, activeCaseId);
    slQuadId = ''; slQ = '';
  }

  function addThermalQuadLoad() {
    const quadId = parseInt(tqQuadId);
    if (isNaN(quadId) || !modelStore.model.quads.has(quadId)) return;
    const dtU = parseFloat(tqDtUniform) || 0;
    const dtG = parseFloat(tqDtGradient) || 0;
    if (dtU === 0 && dtG === 0) return;
    modelStore.addThermalLoadQuad3D(quadId, dtU, dtG, activeCaseId);
    tqQuadId = ''; tqDtUniform = ''; tqDtGradient = '';
  }

  function removeLoad(loadId: number) {
    modelStore.removeLoad(loadId);
  }

  function addLoadCase() {
    if (!newCaseName.trim()) return;
    const id = modelStore.addLoadCase(newCaseName.trim(), newCaseType);
    activeCaseId = id;
    newCaseName = '';
    newCaseType = '';
  }

  function removeLoadCase(id: number) {
    modelStore.removeLoadCase(id);
    if (activeCaseId === id) {
      activeCaseId = loadCases[0]?.id ?? 1;
    }
  }

  function addCombination() {
    if (!newComboName.trim()) return;
    // Default: all cases ×1.0
    const factors = loadCases.map(lc => ({ caseId: lc.id, factor: 1.0 }));
    modelStore.addCombination(newComboName.trim(), factors);
    newComboName = '';
  }

  function removeCombination(id: number) {
    modelStore.removeCombination(id);
  }

  function updateComboFactor(comboId: number, caseId: number, value: string) {
    const f = parseFloat(value);
    if (isNaN(f)) return;
    const combo = combinations.find(c => c.id === comboId);
    if (!combo) return;
    const existing = combo.factors.find(ff => ff.caseId === caseId);
    if (existing) {
      existing.factor = f;
    } else {
      combo.factors.push({ caseId, factor: f });
    }
    // Trigger reactivity
    modelStore.updateCombination(comboId, combo.name, combo.factors);
  }

  function fmtNum(n: number): string {
    if (n === 0) return '0';
    return n.toFixed(2);
  }
</script>

<div class="pro-loads">
  <!-- Auto-generate button -->
  <div class="pro-autogen-bar">
    <button class="pro-btn-autogen" onclick={() => showAutoLoadsDialog = true}>{t('autoLoad.autoGenBtn')}</button>
  </div>

  <ProAutoLoadsDialog open={showAutoLoadsDialog} onclose={() => showAutoLoadsDialog = false} />

  <!-- Self-weight toggle -->
  <div class="pro-sw-bar">
    <label class="pro-sw-toggle">
      <input type="checkbox" bind:checked={uiStore.includeSelfWeight} />
      {t('pro.selfWeightLabel')}
    </label>
  </div>

  <!-- Load visibility bar -->
  <div class="pro-vis-bar">
    <label class="pro-vis-toggle">
      <input type="checkbox" checked={uiStore.showLoads3D} onchange={(e) => { uiStore.showLoads3D = e.currentTarget.checked; if (e.currentTarget.checked) uiStore.hideLoadsWithDiagram = false; }} />
      {t('pro.showLoads')}
    </label>
    {#if !uiStore.showLoads3D}
      <span class="pro-vis-status pro-vis-off">OFF</span>
    {:else if uiStore.hideLoadsWithDiagram && resultsStore.diagramType !== 'none'}
      <button class="pro-vis-btn pro-vis-btn-warn" onclick={() => { uiStore.hideLoadsWithDiagram = false; uiStore.showLoads3D = true; }}>
        {t('pro.loadsHiddenByDiagram')}
      </button>
    {:else}
      <span class="pro-vis-status pro-vis-on">{loads.length} cargas</span>
    {/if}
    <button class="pro-vis-btn" onclick={showAllCases} title={t('pro.showAll')}>{t('pro.showAll')}</button>
    <button class="pro-vis-btn" onclick={hideAllCases} title={t('pro.hideAll')}>{t('pro.hideAll')}</button>
  </div>

  <!-- Load Cases Management -->
  <div class="pro-cases-section">
    <div class="pro-cases-header">
      <span class="pro-section-label">{t('pro.loadCases')}</span>
    </div>
    <div class="pro-cases-tabs">
      {#each loadCases as lc}
        <button
          class="pro-case-tab"
          class:active={activeCaseId === lc.id}
          onclick={() => activeCaseId = lc.id}
          title={caseTypeLabels[lc.type] ?? lc.type}
        >
          <span class="case-type-dot" class:type-d={lc.type === 'D'} class:type-l={lc.type === 'L'} class:type-w={lc.type === 'W'} class:type-e={lc.type === 'E'}></span>
          {lc.name}
          <span class="case-eye" class:visible={isCaseVisible(lc.id)} role="button" tabindex="-1" onclick={(e) => { e.stopPropagation(); toggleCaseVisibility(lc.id); }} onkeydown={() => {}} title={isCaseVisible(lc.id) ? t('pro.hideCase') : t('pro.showCase')}>
            {isCaseVisible(lc.id) ? '👁' : '·'}
          </span>
          {#if loadCases.length > 1}
            <span class="case-x" role="button" tabindex="-1" onclick={(e) => { e.stopPropagation(); removeLoadCase(lc.id); }} onkeydown={() => {}}>×</span>
          {/if}
        </button>
      {/each}
    </div>
    <div class="pro-case-add">
      <input type="text" bind:value={newCaseName} placeholder={t('pro.newCase')} class="inp-case" />
      <select bind:value={newCaseType} class="pro-sel-sm">
        <option value="D">D</option>
        <option value="L">L</option>
        <option value="W">W</option>
        <option value="E">E</option>
        <option value="S">S</option>
        <option value="">{t('pro.caseTypeOther')}</option>
      </select>
      <button class="pro-btn-sm" onclick={addLoadCase}>+</button>
    </div>
  </div>

  <!-- Combinations -->
  <div class="pro-combos-section">
    <details>
      <summary class="pro-section-label">{t('pro.combos')} ({combinations.length})</summary>
      <div class="pro-combos-list">
        {#each combinations as combo}
          <div class="pro-combo-row">
            <span class="combo-name">{combo.name}</span>
            <div class="combo-factors">
              {#each loadCases as lc}
                {@const factor = combo.factors.find(f => f.caseId === lc.id)?.factor ?? 0}
                <label class="combo-factor-label">
                  {lc.name}:
                  <input type="text" value={factor} class="inp-factor"
                    onchange={(e) => updateComboFactor(combo.id, lc.id, e.currentTarget.value)} />
                </label>
              {/each}
            </div>
            <button class="pro-delete-btn" onclick={() => removeCombination(combo.id)}>×</button>
          </div>
        {/each}
        <div class="pro-combo-add">
          <input type="text" bind:value={newComboName} placeholder={t('pro.comboPlaceholder')} class="inp-case" />
          <button class="pro-btn-sm" onclick={addCombination}>{t('pro.addCombo')}</button>
        </div>
      </div>
    </details>
  </div>

  <div class="pro-loads-header">
    <span class="pro-loads-count">{t('pro.loadsInCase').replace('{n}', String(caseLoads.length)).replace('{name}', loadCases.find(c => c.id === activeCaseId)?.name ?? '?').replace('{total}', String(loads.length))}</span>
  </div>

  <!-- Load kind selector -->
  <div class="pro-loads-form">
    <div class="pro-kind-row">
      <button class="pro-type-btn" class:active={loadKind === 'nodal'} onclick={() => loadKind = 'nodal'}>{t('pro.nodal')}</button>
      <button class="pro-type-btn" class:active={loadKind === 'distributed'} onclick={() => loadKind = 'distributed'}>{t('pro.distributed')}</button>
      <button class="pro-type-btn" class:active={loadKind === 'point'} onclick={() => loadKind = 'point'}>{t('pro.pointLoad')}</button>
      <button class="pro-type-btn" class:active={loadKind === 'surface'} onclick={() => loadKind = 'surface'}>{t('pro.surfaceLoad')}</button>
      <button class="pro-type-btn" class:active={loadKind === 'thermalQuad'} onclick={() => loadKind = 'thermalQuad'}>{t('pro.thermalQuadLoad')}</button>
    </div>

    {#if loadKind === 'nodal'}
      <div class="pro-load-inputs">
        <div class="pro-load-row">
          <label>Nodo: <input type="text" bind:value={nlNodeId} placeholder="ID" class="inp-sm" /></label>
        </div>
        <div class="pro-load-row">
          <label>Fx: <input type="text" bind:value={nlFx} placeholder="kN" class="inp-num" /></label>
          <label>Fy: <input type="text" bind:value={nlFy} placeholder="kN" class="inp-num" /></label>
          <label>Fz: <input type="text" bind:value={nlFz} placeholder="kN" class="inp-num" /></label>
        </div>
        <div class="pro-load-row">
          <label>Mx: <input type="text" bind:value={nlMx} placeholder="kN·m" class="inp-num" /></label>
          <label>My: <input type="text" bind:value={nlMy} placeholder="kN·m" class="inp-num" /></label>
          <label>Mz: <input type="text" bind:value={nlMz} placeholder="kN·m" class="inp-num" /></label>
        </div>
        <button class="pro-btn" onclick={addNodalLoad}>{t('pro.addNodalLoad')}</button>
      </div>
    {:else if loadKind === 'distributed'}
      <div class="pro-load-inputs">
        <div class="pro-load-row">
          <label>Elemento: <input type="text" bind:value={dlElemId} placeholder="ID" class="inp-sm" /></label>
        </div>
        <div class="pro-load-row">
          <label>qY_i: <input type="text" bind:value={dlQyI} placeholder="kN/m" class="inp-num" /></label>
          <label>qY_j: <input type="text" bind:value={dlQyJ} placeholder="kN/m" class="inp-num" /></label>
        </div>
        <div class="pro-load-row">
          <label>qZ_i: <input type="text" bind:value={dlQzI} placeholder="kN/m" class="inp-num" /></label>
          <label>qZ_j: <input type="text" bind:value={dlQzJ} placeholder="kN/m" class="inp-num" /></label>
        </div>
        <button class="pro-btn" onclick={addDistLoad}>{t('pro.addDistLoad')}</button>
      </div>
    {:else if loadKind === 'point'}
      <div class="pro-load-inputs">
        <div class="pro-load-row">
          <label>Elemento: <input type="text" bind:value={plElemId} placeholder="ID" class="inp-sm" /></label>
          <label>a (m): <input type="text" bind:value={plA} placeholder="dist." class="inp-num" /></label>
        </div>
        <div class="pro-load-row">
          <label>Py: <input type="text" bind:value={plPy} placeholder="kN" class="inp-num" /></label>
          <label>Pz: <input type="text" bind:value={plPz} placeholder="kN" class="inp-num" /></label>
        </div>
        <button class="pro-btn" onclick={addPointLoad}>{t('pro.addPointLoad')}</button>
      </div>
    {:else if loadKind === 'surface'}
      <div class="pro-load-inputs">
        <div class="pro-load-row">
          <label>{t('pro.slab')}: <input type="text" bind:value={slQuadId} placeholder="ID" class="inp-sm" /></label>
          <label>q: <input type="text" bind:value={slQ} placeholder="kN/m²" class="inp-num" /></label>
        </div>
        <button class="pro-btn" onclick={addSurfaceLoad}>{t('pro.addSurfaceLoad')}</button>
      </div>
    {:else}
      <div class="pro-load-inputs">
        <div class="pro-load-row">
          <label>{t('pro.slab')}: <input type="text" bind:value={tqQuadId} placeholder="ID" class="inp-sm" /></label>
        </div>
        <div class="pro-load-row">
          <label>{t('pro.dtUniform')}: <input type="text" bind:value={tqDtUniform} placeholder="°C" class="inp-num" /></label>
          <label>{t('pro.dtGradient')}: <input type="text" bind:value={tqDtGradient} placeholder="°C" class="inp-num" /></label>
        </div>
        <button class="pro-btn" onclick={addThermalQuadLoad}>{t('pro.addThermalQuadLoad')}</button>
      </div>
    {/if}
  </div>

  <!-- Loads table for active case -->
  <div class="pro-loads-table-wrap">
    {#if nodalLoads.length > 0}
      <div class="pro-load-section-title">{t('pro.nodalLoads')}</div>
      <table class="pro-loads-table">
        <thead><tr><th>ID</th><th>Nodo</th><th>Fx</th><th>Fy</th><th>Fz</th><th>Mx</th><th>My</th><th>Mz</th><th></th></tr></thead>
        <tbody>
          {#each nodalLoads as l}
            <tr>
              <td class="col-id">{l.data.id}</td>
              <td class="col-num">{l.data.nodeId}</td>
              <td class="col-num">{fmtNum(l.data.fx)}</td>
              <td class="col-num">{fmtNum(l.data.fy)}</td>
              <td class="col-num">{fmtNum(l.data.fz ?? 0)}</td>
              <td class="col-num">{fmtNum(l.data.mx ?? 0)}</td>
              <td class="col-num">{fmtNum(l.data.my ?? 0)}</td>
              <td class="col-num">{fmtNum(l.data.mz ?? 0)}</td>
              <td><button class="pro-delete-btn" onclick={() => removeLoad(l.data.id)}>×</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}

    {#if distLoads.length > 0}
      <div class="pro-load-section-title">{t('pro.distLoads')}</div>
      <table class="pro-loads-table">
        <thead><tr><th>ID</th><th>Elem</th><th>qY_i</th><th>qY_j</th><th>qZ_i</th><th>qZ_j</th><th></th></tr></thead>
        <tbody>
          {#each distLoads as l}
            <tr>
              <td class="col-id">{l.data.id}</td>
              <td class="col-num">{l.data.elementId}</td>
              <td class="col-num">{fmtNum(l.data.qYI ?? 0)}</td>
              <td class="col-num">{fmtNum(l.data.qYJ ?? 0)}</td>
              <td class="col-num">{fmtNum(l.data.qZI ?? 0)}</td>
              <td class="col-num">{fmtNum(l.data.qZJ ?? 0)}</td>
              <td><button class="pro-delete-btn" onclick={() => removeLoad(l.data.id)}>×</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}

    {#if pointLoads.length > 0}
      <div class="pro-load-section-title">{t('pro.pointLoads')}</div>
      <table class="pro-loads-table">
        <thead><tr><th>ID</th><th>Elem</th><th>a (m)</th><th>Py</th><th>Pz</th><th></th></tr></thead>
        <tbody>
          {#each pointLoads as l}
            <tr>
              <td class="col-id">{l.data.id}</td>
              <td class="col-num">{l.data.elementId}</td>
              <td class="col-num">{fmtNum(l.data.a)}</td>
              <td class="col-num">{fmtNum(l.data.py ?? 0)}</td>
              <td class="col-num">{fmtNum(l.data.pz ?? 0)}</td>
              <td><button class="pro-delete-btn" onclick={() => removeLoad(l.data.id)}>×</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}

    {#if surfaceLoads.length > 0}
      <div class="pro-load-section-title">{t('pro.surfaceLoads')}</div>
      <table class="pro-loads-table">
        <thead><tr><th>ID</th><th>{t('pro.slab')}</th><th>q (kN/m²)</th><th></th></tr></thead>
        <tbody>
          {#each surfaceLoads as l}
            <tr>
              <td class="col-id">{l.data.id}</td>
              <td class="col-num">{l.data.quadId}</td>
              <td class="col-num">{fmtNum(l.data.q)}</td>
              <td><button class="pro-delete-btn" onclick={() => removeLoad(l.data.id)}>×</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}

    {#if thermalQuadLoads.length > 0}
      <div class="pro-load-section-title">{t('pro.thermalQuadLoads')}</div>
      <table class="pro-loads-table">
        <thead><tr><th>ID</th><th>{t('pro.slab')}</th><th>{t('pro.dtUniform')}</th><th>{t('pro.dtGradient')}</th><th></th></tr></thead>
        <tbody>
          {#each thermalQuadLoads as l}
            <tr>
              <td class="col-id">{l.data.id}</td>
              <td class="col-num">{l.data.quadId}</td>
              <td class="col-num">{fmtNum(l.data.dtUniform)}</td>
              <td class="col-num">{fmtNum(l.data.dtGradient)}</td>
              <td><button class="pro-delete-btn" onclick={() => removeLoad(l.data.id)}>x</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}

    {#if caseLoads.length === 0}
      <div class="pro-empty">{t('pro.noLoads')}</div>
    {/if}
  </div>
</div>

<style>
  .pro-loads { display: flex; flex-direction: column; }
  .pro-sw-bar {
    display: flex; align-items: center; padding: 6px 10px;
    border-bottom: 1px solid #1a3050; background: #0d2238;
  }
  .pro-sw-toggle {
    display: flex; align-items: center; gap: 6px;
    font-size: 0.75rem; color: #ccc; cursor: pointer; font-weight: 500;
  }
  .pro-sw-toggle input { accent-color: #4ecdc4; cursor: pointer; }
  .pro-vis-bar {
    display: flex; align-items: center; gap: 8px; padding: 6px 10px;
    border-bottom: 1px solid #1a3050; background: #0a1a30;
  }
  .pro-vis-toggle {
    display: flex; align-items: center; gap: 4px;
    font-size: 0.72rem; color: #aaa; cursor: pointer; margin-right: auto;
  }
  .pro-vis-toggle input { accent-color: #4ecdc4; cursor: pointer; }
  .pro-vis-btn {
    padding: 2px 8px; font-size: 0.65rem; color: #888;
    background: transparent; border: 1px solid #1a3050; border-radius: 3px; cursor: pointer;
  }
  .pro-vis-btn:hover { color: #ccc; border-color: #4ecdc4; }
  .pro-vis-status { font-size: 0.62rem; font-weight: 600; }
  .pro-vis-on { color: #4ecdc4; }
  .pro-vis-off { color: #e94560; }
  .pro-vis-btn-warn {
    color: #f0a500; border-color: #5a4a2a; font-weight: 600;
    animation: pulse-warn 1.5s ease-in-out infinite;
  }
  @keyframes pulse-warn { 0%, 100% { opacity: 0.7; } 50% { opacity: 1; } }
  .pro-autogen-bar { padding: 8px 10px; border-bottom: 1px solid #1a3050; }
  .pro-btn-autogen {
    width: 100%; padding: 7px 12px; font-size: 0.75rem; font-weight: 600;
    color: #1a1a2e; background: #4ecdc4; border: none; border-radius: 5px;
    cursor: pointer; transition: background 0.15s;
  }
  .pro-btn-autogen:hover { background: #3dbdb4; }

  /* Load Cases */
  .pro-cases-section { border-bottom: 1px solid #1a3050; }
  .pro-cases-header { padding: 8px 12px; }
  .pro-section-label { font-size: 0.78rem; color: #4ecdc4; font-weight: 600; cursor: pointer; }

  .pro-cases-tabs {
    display: flex; flex-wrap: wrap; gap: 4px; padding: 0 10px 8px;
  }
  .pro-case-tab {
    padding: 5px 12px; font-size: 0.72rem; color: #888; background: #0f2840;
    border: 1px solid #1a3050; border-radius: 4px; cursor: pointer;
    display: flex; align-items: center; gap: 5px;
  }
  .pro-case-tab:hover { color: #ccc; background: #1a3860; }
  .pro-case-tab.active { color: #fff; background: #1a4a7a; border-color: #4ecdc4; }
  .case-eye {
    background: none; border: none; font-size: 0.7rem; cursor: pointer;
    padding: 0 2px; line-height: 1; opacity: 0.4; transition: opacity 0.15s;
  }
  .case-eye.visible { opacity: 0.9; }
  .case-eye:hover { opacity: 1; }
  .case-x { background: none; border: none; color: #555; font-size: 0.8rem; cursor: pointer; padding: 0 0 0 4px; line-height: 1; }
  .case-x:hover { color: #ff6b6b; }

  .case-type-dot { width: 6px; height: 6px; border-radius: 50%; background: #555; flex-shrink: 0; }
  .case-type-dot.type-d { background: #4ecdc4; }
  .case-type-dot.type-l { background: #f0a500; }
  .case-type-dot.type-w { background: #6bbaff; }
  .case-type-dot.type-e { background: #e94560; }

  .pro-case-add {
    display: flex; gap: 6px; padding: 6px 10px 8px; align-items: center;
  }
  .inp-case {
    width: 110px; padding: 4px 6px; background: #0f2840; border: 1px solid #1a3050;
    border-radius: 3px; color: #ddd; font-size: 0.72rem;
  }
  .inp-case:focus { border-color: #1a4a7a; outline: none; }
  .pro-sel-sm {
    padding: 4px 5px; background: #0f2840; border: 1px solid #1a3050;
    border-radius: 3px; color: #ccc; font-size: 0.72rem; cursor: pointer;
  }
  .pro-btn-sm {
    padding: 4px 10px; font-size: 0.72rem; color: #4ecdc4; background: #0f3460;
    border: 1px solid #1a4a7a; border-radius: 4px; cursor: pointer;
  }
  .pro-btn-sm:hover { background: #1a4a7a; color: #fff; }

  /* Combinations */
  .pro-combos-section { border-bottom: 1px solid #1a3050; padding: 6px 10px; }
  .pro-combos-list { padding: 6px 0; display: flex; flex-direction: column; gap: 6px; }
  .pro-combo-row {
    display: flex; align-items: center; gap: 8px; padding: 4px 0;
    border-bottom: 1px solid #0f2030; flex-wrap: wrap;
  }
  .combo-name { font-size: 0.72rem; color: #ccc; font-weight: 500; min-width: 90px; }
  .combo-factors { display: flex; flex-wrap: wrap; gap: 6px; }
  .combo-factor-label { font-size: 0.68rem; color: #888; display: flex; align-items: center; gap: 3px; }
  .inp-factor {
    width: 40px; padding: 3px 4px; background: #0f2840; border: 1px solid #1a3050;
    border-radius: 3px; color: #ddd; font-size: 0.72rem; font-family: monospace; text-align: center;
  }
  .inp-factor:focus { border-color: #1a4a7a; outline: none; }
  .pro-combo-add { display: flex; gap: 6px; align-items: center; padding-top: 6px; }

  .pro-loads-header { padding: 8px 12px; border-bottom: 1px solid #1a3050; }
  .pro-loads-count { font-size: 0.78rem; color: #4ecdc4; font-weight: 600; }

  .pro-loads-form { padding: 10px 12px; border-bottom: 1px solid #1a3050; }
  .pro-kind-row { display: flex; gap: 5px; margin-bottom: 10px; }
  .pro-type-btn {
    padding: 5px 10px; font-size: 0.75rem; font-weight: 500; color: #888;
    background: #0f2840; border: 1px solid #1a3050; border-radius: 4px; cursor: pointer;
  }
  .pro-type-btn:hover { color: #ccc; background: #1a3860; }
  .pro-type-btn.active { color: #fff; background: #1a4a7a; border-color: #4ecdc4; }

  .pro-load-inputs { display: flex; flex-direction: column; gap: 8px; }
  .pro-load-row { display: flex; flex-wrap: wrap; gap: 8px; }
  .pro-load-row label { font-size: 0.75rem; color: #888; display: flex; align-items: center; gap: 4px; }
  .inp-sm { width: 55px; padding: 4px 6px; background: #0f2840; border: 1px solid #1a3050; border-radius: 3px; color: #ddd; font-size: 0.78rem; font-family: monospace; }
  .inp-num { width: 65px; padding: 4px 6px; background: #0f2840; border: 1px solid #1a3050; border-radius: 3px; color: #ddd; font-size: 0.78rem; font-family: monospace; }
  .inp-sm:focus, .inp-num:focus { border-color: #1a4a7a; outline: none; }
  .pro-btn { align-self: flex-start; padding: 5px 14px; font-size: 0.75rem; color: #ccc; background: #0f3460; border: 1px solid #1a4a7a; border-radius: 4px; cursor: pointer; }
  .pro-btn:hover { background: #1a4a7a; color: #fff; }

  .pro-loads-table-wrap { }
  .pro-load-section-title { padding: 6px 12px; font-size: 0.72rem; font-weight: 600; color: #4ecdc4; text-transform: uppercase; background: #0a1a30; border-bottom: 1px solid #1a3050; }
  .pro-loads-table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
  .pro-loads-table thead { position: sticky; top: 0; z-index: 1; }
  .pro-loads-table th { padding: 6px 6px; text-align: left; font-size: 0.68rem; font-weight: 600; color: #888; text-transform: uppercase; background: #0a1a30; border-bottom: 1px solid #1a4a7a; }
  .pro-loads-table td { padding: 4px 6px; border-bottom: 1px solid #0f2030; color: #ccc; }
  .col-id { width: 32px; color: #666; font-family: monospace; text-align: center; }
  .col-num { font-family: monospace; text-align: right; font-size: 0.75rem; }
  .pro-delete-btn { background: none; border: none; color: #555; font-size: 1rem; cursor: pointer; padding: 0; }
  .pro-delete-btn:hover { color: #ff6b6b; }
  .pro-empty { text-align: center; color: #555; font-style: italic; padding: 30px 10px; font-size: 0.78rem; }
</style>
