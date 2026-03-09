<script lang="ts">
  import { modelStore, uiStore, resultsStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import { computeElementStress } from '../../lib/store/results.svelte';
  import { toDisplay, unitLabel } from '../../lib/utils/units';
  import SectionChanger from '../SectionChanger.svelte';
  import MaterialPresetSelector from '../MaterialPresetSelector.svelte';
  import type { SteelProfile } from '../../lib/data/steel-profiles';
  import { profileToSectionFull } from '../../lib/data/steel-profiles';
  import type { MaterialPreset } from '../../lib/data/material-presets';
  import type { SectionProperties } from '../../lib/data/section-shapes';

  const us = $derived(uiStore.unitSystem);
  const ul = (q: import('../../lib/utils/units').Quantity) => unitLabel(q, us);
  const dv = (v: number, q: import('../../lib/utils/units').Quantity) => toDisplay(v, q, us);

  let { showResults = false } = $props();

  // Section changer (unified profile + shape builder)
  let showSectionChanger = $state(false);
  let sectionChangerTargetElemId = $state<number | null>(null);

  function handleSCProfileSelect(profile: SteelProfile) {
    if (sectionChangerTargetElemId === null) return;
    const full = profileToSectionFull(profile);
    const secId = modelStore.addSection({
      name: profile.name,
      a: full.a,
      iz: full.iz,
      iy: full.iy,
      b: full.b,
      h: full.h,
      shape: full.shape,
      tw: full.tw,
      tf: full.tf,
      t: full.t,
    });
    modelStore.updateElementSection(sectionChangerTargetElemId, secId);
    resultsStore.clear();
    showSectionChanger = false;
    sectionChangerTargetElemId = null;
  }

  function handleSCShapeSelect(name: string, props: SectionProperties) {
    if (sectionChangerTargetElemId === null) return;
    const secId = modelStore.addSection({
      name,
      a: props.a,
      iz: props.iz,
      iy: props.iy,
      j: props.j,
      b: props.b,
      h: props.h,
      shape: props.shape as any,
      tw: props.tw,
      tf: props.tf,
      t: props.t,
    });
    modelStore.updateElementSection(sectionChangerTargetElemId, secId);
    resultsStore.clear();
    showSectionChanger = false;
    sectionChangerTargetElemId = null;
  }

  function handleSCAmorphousSelect(data: { name: string; a: number; iy: number; iz: number; j?: number }) {
    if (sectionChangerTargetElemId === null) return;
    const secId = modelStore.addSection({
      name: data.name,
      a: data.a,
      iy: data.iy,
      iz: data.iz,
      j: data.j,
      // No shape, b, h, tw, tf, t — amorphous section
    });
    modelStore.updateElementSection(sectionChangerTargetElemId, secId);
    resultsStore.clear();
    showSectionChanger = false;
    sectionChangerTargetElemId = null;
  }

  // Material preset selector
  let showMaterialPresetSelector = $state(false);
  let materialPresetTargetElemId = $state<number | null>(null);

  function handleMaterialPresetSelect(preset: MaterialPreset) {
    if (materialPresetTargetElemId === null) return;
    const matId = modelStore.addMaterial({
      name: preset.name,
      e: preset.e,
      nu: preset.nu,
      rho: preset.rho,
      fy: preset.fy,
    });
    modelStore.updateElementMaterial(materialPresetTargetElemId, matId);
    resultsStore.clear();
    showMaterialPresetSelector = false;
    materialPresetTargetElemId = null;
  }
</script>

<div class="panel-section">
  <h3>{t('prop.selectedElement')}</h3>
  {#each uiStore.selectedElements as elemId}
    {#if modelStore.elements.get(elemId)}
      {@const elem = modelStore.elements.get(elemId)!}
      {@const L = modelStore.getElementLength(elemId)}
      {@const mat = modelStore.materials.get(elem.materialId)}
      {@const sec = modelStore.sections.get(elem.sectionId)}
      <div class="property-row">
        <span>ID:</span>
        <span>{elem.id}</span>
      </div>
      <div class="property-row">
        <span>{t('prop.type')}:</span>
        <span>{elem.type === 'frame' ? 'Frame' : 'Truss'}</span>
      </div>
      <div class="property-row">
        <span>{t('prop.nodes')}:</span>
        <span>{elem.nodeI} → {elem.nodeJ}</span>
      </div>
      <div class="property-row">
        <span>L:</span>
        <span>{dv(L, 'length').toFixed(3)} {ul('length')}</span>
      </div>
      <div class="property-row">
        <span>{t('prop.material')}:</span>
        <div class="inline-select">
          <select value={elem.materialId} onchange={(e) => { modelStore.updateElementMaterial(elemId, Number(e.currentTarget.value)); resultsStore.clear(); }}>
            {#each [...modelStore.materials] as [id, m]}
              <option value={id}>{m.name}</option>
            {/each}
          </select>
          <button class="icon-btn profile-icon-btn" onclick={() => { materialPresetTargetElemId = elemId; showMaterialPresetSelector = true; }} title={t('table.chooseMaterial')}>&#9783;</button>
          <button class="icon-btn" onclick={() => { uiStore.editingMaterialId = elem.materialId; }} title={t('prop.editMaterial')}>&#9998;</button>
          <button class="icon-btn" onclick={() => { const newId = modelStore.addMaterial({ name: t('table.newMaterial'), e: 200e6, nu: 0.3, rho: 78.5 }); uiStore.editingMaterialId = newId; }} title={t('prop.newMaterial')}>+</button>
        </div>
      </div>
      <div class="property-row">
        <span>{t('prop.section')}:</span>
        <div class="inline-select">
          <select value={elem.sectionId} onchange={(e) => { modelStore.updateElementSection(elemId, Number(e.currentTarget.value)); resultsStore.clear(); }}>
            {#each [...modelStore.sections] as [id, s]}
              <option value={id}>{s.name}</option>
            {/each}
          </select>
          <button class="icon-btn profile-icon-btn" onclick={() => { sectionChangerTargetElemId = elemId; showSectionChanger = true; }} title={t('table.changeSection')}>&#9783;</button>
          <button class="icon-btn" onclick={() => { uiStore.editingSectionId = elem.sectionId; }} title={t('prop.editSection')}>&#9998;</button>
          <button class="icon-btn" onclick={() => { const newId = modelStore.addSection({ name: t('table.newSection'), a: 0.01, iz: 0.000025, iy: 0.0001 }); uiStore.editingSectionId = newId; }} title={t('prop.newSection')}>+</button>
        </div>
      </div>
      <div class="property-row">
        <span>{t('prop.hinges')}:</span>
        <div class="hinge-toggles">
          <button
            class="hinge-btn"
            class:active={elem.hingeStart}
            onclick={() => { modelStore.toggleHinge(elemId, 'start'); resultsStore.clear(); }}
            title={elem.hingeStart ? t('prop.removeHingeI') : t('prop.addHingeI')}
          >
            <span class="hinge-icon">{elem.hingeStart ? '\u25CB' : '\u25CF'}</span>
            {t('prop.nodeI')}
          </button>
          <button
            class="hinge-btn"
            class:active={elem.hingeEnd}
            onclick={() => { modelStore.toggleHinge(elemId, 'end'); resultsStore.clear(); }}
            title={elem.hingeEnd ? t('prop.removeHingeJ') : t('prop.addHingeJ')}
          >
            <span class="hinge-icon">{elem.hingeEnd ? '\u25CB' : '\u25CF'}</span>
            {t('prop.nodeJ')}
          </button>
        </div>
      </div>

      {#if uiStore.analysisMode === '3d' && elem.type === 'frame'}
        <div class="property-row" style="flex-direction: column; align-items: flex-start; gap: 4px;">
          <span style="font-weight: 600;">{t('prop.localAxisY')}</span>
          <div style="display: flex; gap: 4px; align-items: center; width: 100%;">
            <label style="display:flex; gap:2px; align-items:center; font-size:0.7rem;">
              Yx: <input type="number" step="0.1" value={elem.localYx ?? ''} style="width: 50px; font-size: 0.7rem;"
                onchange={(e) => {
                  const v = e.currentTarget.value;
                  if (v === '') {
                    modelStore.updateElementLocalY(elemId, undefined, undefined, undefined);
                  } else {
                    modelStore.updateElementLocalY(elemId, +v, elem.localYy ?? 0, elem.localYz ?? 0);
                  }
                  resultsStore.clear();
                }} />
            </label>
            <label style="display:flex; gap:2px; align-items:center; font-size:0.7rem;">
              Yy: <input type="number" step="0.1" value={elem.localYy ?? ''} style="width: 50px; font-size: 0.7rem;"
                onchange={(e) => {
                  const v = e.currentTarget.value;
                  if (v === '') {
                    modelStore.updateElementLocalY(elemId, undefined, undefined, undefined);
                  } else {
                    modelStore.updateElementLocalY(elemId, elem.localYx ?? 0, +v, elem.localYz ?? 0);
                  }
                  resultsStore.clear();
                }} />
            </label>
            <label style="display:flex; gap:2px; align-items:center; font-size:0.7rem;">
              Yz: <input type="number" step="0.1" value={elem.localYz ?? ''} style="width: 50px; font-size: 0.7rem;"
                onchange={(e) => {
                  const v = e.currentTarget.value;
                  if (v === '') {
                    modelStore.updateElementLocalY(elemId, undefined, undefined, undefined);
                  } else {
                    modelStore.updateElementLocalY(elemId, elem.localYx ?? 0, elem.localYy ?? 0, +v);
                  }
                  resultsStore.clear();
                }} />
            </label>
            <button class="btn-small" style="font-size: 0.6rem; padding: 2px 6px;" onclick={() => { modelStore.updateElementLocalY(elemId, undefined, undefined, undefined); resultsStore.clear(); }} title={t('prop.autoDetectLocalY')}>Auto</button>
          </div>
        </div>
      {/if}

      {#if showResults}
        {#if uiStore.analysisMode === '3d' && resultsStore.results3D}
          {@const forces3D = resultsStore.getElementForces3D(elemId)}
          {#if forces3D}
            <h4>{t('prop.internalForces3d')}</h4>
            <div class="property-row">
              <span>N_i:</span>
              <span>{dv(forces3D.nStart, 'force').toFixed(2)} {ul('force')}</span>
            </div>
            <div class="property-row">
              <span>N_j:</span>
              <span>{dv(forces3D.nEnd, 'force').toFixed(2)} {ul('force')}</span>
            </div>
            <div class="property-row">
              <span>Vy_i:</span>
              <span>{dv(forces3D.vyStart, 'force').toFixed(2)} {ul('force')}</span>
            </div>
            <div class="property-row">
              <span>Vy_j:</span>
              <span>{dv(forces3D.vyEnd, 'force').toFixed(2)} {ul('force')}</span>
            </div>
            <div class="property-row">
              <span>Vz_i:</span>
              <span>{dv(forces3D.vzStart, 'force').toFixed(2)} {ul('force')}</span>
            </div>
            <div class="property-row">
              <span>Vz_j:</span>
              <span>{dv(forces3D.vzEnd, 'force').toFixed(2)} {ul('force')}</span>
            </div>
            <h4>{t('prop.moments3d')}</h4>
            <div class="property-row">
              <span>Mx_i:</span>
              <span>{dv(-forces3D.mxStart, 'moment').toFixed(2)} {ul('moment')}</span>
            </div>
            <div class="property-row">
              <span>Mx_j:</span>
              <span>{dv(-forces3D.mxEnd, 'moment').toFixed(2)} {ul('moment')}</span>
            </div>
            <div class="property-row">
              <span>My_i:</span>
              <span>{dv(-forces3D.myStart, 'moment').toFixed(2)} {ul('moment')}</span>
            </div>
            <div class="property-row">
              <span>My_j:</span>
              <span>{dv(-forces3D.myEnd, 'moment').toFixed(2)} {ul('moment')}</span>
            </div>
            <div class="property-row">
              <span>Mz_i:</span>
              <span>{dv(-forces3D.mzStart, 'moment').toFixed(2)} {ul('moment')}</span>
            </div>
            <div class="property-row">
              <span>Mz_j:</span>
              <span>{dv(-forces3D.mzEnd, 'moment').toFixed(2)} {ul('moment')}</span>
            </div>
          {/if}
        {:else}
          {@const forces = resultsStore.getElementForces(elemId)}
          {#if forces}
            <h4>{t('prop.internalForces')}</h4>
            <div class="property-row">
              <span>M_i:</span>
              <span>{dv(-forces.mStart, 'moment').toFixed(2)} {ul('moment')}</span>
            </div>
            <div class="property-row">
              <span>M_j:</span>
              <span>{dv(-forces.mEnd, 'moment').toFixed(2)} {ul('moment')}</span>
            </div>
            <div class="property-row">
              <span>V_i:</span>
              <span>{dv(forces.vStart, 'force').toFixed(2)} {ul('force')}</span>
            </div>
            <div class="property-row">
              <span>V_j:</span>
              <span>{dv(forces.vEnd, 'force').toFixed(2)} {ul('force')}</span>
            </div>
            <div class="property-row">
              <span>N_i:</span>
              <span>{dv(forces.nStart, 'force').toFixed(2)} {ul('force')}</span>
            </div>
            <div class="property-row">
              <span>N_j:</span>
              <span>{dv(forces.nEnd, 'force').toFixed(2)} {ul('force')}</span>
            </div>

            {#if sec && mat}
              {@const stress = computeElementStress(forces, sec, mat)}
              <h4>{t('prop.stresses')}</h4>
              <div class="property-row">
                <span>σ_max:</span>
                <span>{dv(Math.max(stress.sigmaStart, stress.sigmaEnd), 'stress').toFixed(1)} {ul('stress')}</span>
              </div>
              <div class="property-row">
                <span>τ_max:</span>
                <span>{dv(Math.max(stress.tauStart, stress.tauEnd), 'stress').toFixed(1)} {ul('stress')}</span>
              </div>
              <div class="property-row">
                <span>σ_vm:</span>
                <span>{dv(Math.max(stress.vonMisesStart, stress.vonMisesEnd), 'stress').toFixed(1)} {ul('stress')}</span>
              </div>
              {#if stress.ratio !== null}
                <div class="property-row">
                  <span>Ratio:</span>
                  <span class:ratio-ok={stress.ratio <= 1} class:ratio-warn={stress.ratio > 1}>{(stress.ratio * 100).toFixed(1)}%</span>
                </div>
              {/if}
            {/if}
          {/if}
        {/if}
      {/if}

      <button class="btn-small btn-danger" onclick={() => modelStore.removeElement(elemId)}>
        {t('prop.deleteElement')}
      </button>
    {/if}
  {/each}
</div>

<SectionChanger
  open={showSectionChanger}
  onprofileselect={(p: SteelProfile, _s: { a: number; iy: number; iz: number; b: number; h: number }) => handleSCProfileSelect(p)}
  onshapeselect={(name: string, props: SectionProperties) => handleSCShapeSelect(name, props)}
  onamorphousselect={(data) => handleSCAmorphousSelect(data)}
  onclose={() => { showSectionChanger = false; sectionChangerTargetElemId = null; }}
  is3D={uiStore.analysisMode === '3d'}
/>

<MaterialPresetSelector
  open={showMaterialPresetSelector}
  onselect={(p: MaterialPreset) => handleMaterialPresetSelect(p)}
  onclose={() => { showMaterialPresetSelector = false; materialPresetTargetElemId = null; }}
/>

<style>
  .panel-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .panel-section h3 {
    font-size: 0.75rem;
    text-transform: uppercase;
    color: #888;
    letter-spacing: 0.05em;
  }

  h4 {
    font-size: 0.7rem;
    color: #aaa;
    margin-top: 0.5rem;
  }

  .property-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.875rem;
    padding: 0.25rem 0;
  }

  select {
    padding: 0.5rem;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    color: #eee;
    font-size: 0.875rem;
  }

  .inline-select {
    display: flex;
    align-items: center;
    gap: 0.2rem;
  }

  .inline-select select {
    flex: 1;
    min-width: 0;
    padding: 0.25rem;
    font-size: 0.8rem;
  }

  .icon-btn {
    padding: 0.15rem 0.35rem;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 3px;
    color: #aaa;
    cursor: pointer;
    font-size: 0.75rem;
    line-height: 1;
    flex-shrink: 0;
  }

  .icon-btn:hover {
    background: #1a4a7a;
    color: white;
  }

  .profile-icon-btn {
    color: #4ecdc4;
  }

  .profile-icon-btn:hover {
    background: #0f4a3a !important;
    color: white;
  }

  .hinge-toggles {
    display: flex;
    gap: 0.25rem;
  }

  .hinge-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.2rem 0.5rem;
    font-size: 0.72rem;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    color: #888;
    cursor: pointer;
    transition: all 0.15s;
  }

  .hinge-icon {
    font-size: 0.8rem;
  }

  .hinge-btn.active {
    background: #e94560;
    border-color: #ff6b6b;
    color: white;
  }

  .hinge-btn.active:hover {
    background: #c73050;
    border-color: #e94560;
  }

  .hinge-btn:hover {
    background: #1a4a7a;
    color: white;
  }

  .btn-small {
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    margin-top: 0.5rem;
  }

  .btn-danger {
    background: #e94560;
    color: white;
  }

  .btn-danger:hover {
    background: #ff6b6b;
  }

  .ratio-ok {
    color: #00e676;
    font-weight: 600;
  }

  .ratio-warn {
    color: #ff5252;
    font-weight: 600;
  }
</style>
