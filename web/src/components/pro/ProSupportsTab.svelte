<script lang="ts">
  import { modelStore, uiStore } from '../../lib/store';
  import type { SupportType } from '../../lib/store/model.svelte';
  import { t } from '../../lib/i18n';

  const is3D = $derived(uiStore.analysisMode === '3d' || uiStore.analysisMode === 'pro');

  const supportTypes = $derived(is3D ? [
    { value: 'fixed3d' as SupportType, label: t('pro.fixed3d') !== 'pro.fixed3d' ? t('pro.fixed3d') : 'Fixed (6 DOF)' },
    { value: 'pinned3d' as SupportType, label: t('pro.pinned3d') !== 'pro.pinned3d' ? t('pro.pinned3d') : 'Pinned (3 transl.)' },
    { value: 'rollerXZ' as SupportType, label: 'Roller XZ' },
    { value: 'rollerXY' as SupportType, label: 'Roller XY' },
    { value: 'rollerYZ' as SupportType, label: 'Roller YZ' },
    { value: 'spring3d' as SupportType, label: t('pro.spring3d') !== 'pro.spring3d' ? t('pro.spring3d') : 'Spring' },
    { value: 'custom3d' as SupportType, label: t('pro.custom3d') !== 'pro.custom3d' ? t('pro.custom3d') : 'Custom DOF' },
  ] : [
    { value: 'fixed' as SupportType, label: t('pro.fixed') },
    { value: 'pinned' as SupportType, label: t('pro.pinned') },
    { value: 'rollerX' as SupportType, label: t('pro.rollerX') },
    { value: 'rollerZ' as SupportType, label: t('pro.rollerY') },
    { value: 'spring' as SupportType, label: t('pro.spring') },
  ]);

  let newNodeId = $state('');
  let newType = $state<SupportType>('fixed3d');

  // Custom DOF state
  let dofTx = $state(true);
  let dofTy = $state(true);
  let dofTz = $state(true);
  let dofRx = $state(false);
  let dofRy = $state(false);
  let dofRz = $state(false);

  // Spring state
  let sKx = $state('');
  let sKy = $state('');
  let sKz = $state('');
  let sKrx = $state('');
  let sKry = $state('');
  let sKrz = $state('');

  const supports = $derived([...modelStore.supports.values()]);

  function addSupport() {
    const nodeId = parseInt(newNodeId);
    if (isNaN(nodeId) || !modelStore.nodes.has(nodeId)) return;
    const springs = newType === 'spring3d' || newType === 'spring'
      ? { kx: parseFloat(sKx) || undefined, ky: parseFloat(sKy) || undefined, kz: parseFloat(sKz) || undefined, krx: parseFloat(sKrx) || undefined, kry: parseFloat(sKry) || undefined, krz: parseFloat(sKrz) || undefined }
      : undefined;
    const opts = newType === 'custom3d'
      ? { dofRestraints: { tx: dofTx, ty: dofTy, tz: dofTz, rx: dofRx, ry: dofRy, rz: dofRz } }
      : undefined;
    modelStore.addSupport(nodeId, newType, springs, opts);
    newNodeId = '';
  }

  function removeSupport(id: number) {
    modelStore.removeSupport(id);
  }

  function addFromSelection() {
    for (const nodeId of uiStore.selectedNodes) {
      if (!modelStore.nodes.has(nodeId)) continue;
      const existing = [...modelStore.supports.values()].find(s => s.nodeId === nodeId);
      if (!existing) {
        const springs = newType === 'spring3d' || newType === 'spring'
          ? { kx: parseFloat(sKx) || undefined, ky: parseFloat(sKy) || undefined, kz: parseFloat(sKz) || undefined, krx: parseFloat(sKrx) || undefined, kry: parseFloat(sKry) || undefined, krz: parseFloat(sKrz) || undefined }
          : undefined;
        const opts = newType === 'custom3d'
          ? { dofRestraints: { tx: dofTx, ty: dofTy, tz: dofTz, rx: dofRx, ry: dofRy, rz: dofRz } }
          : undefined;
        modelStore.addSupport(nodeId, newType, springs, opts);
      }
    }
  }

  function typeLabel(type: string): string {
    return supportTypes.find(st => st.value === type)?.label ?? type;
  }
</script>

<div class="pro-sup">
  <div class="pro-sup-header">
    <span class="pro-sup-count">{t('pro.nSupports').replace('{n}', String(supports.length))}</span>
  </div>

  <div class="pro-sup-form">
    <div class="pro-sup-row">
      <label>{t('pro.thNode')}: <input type="text" bind:value={newNodeId} placeholder="ID" class="pro-input-sm" /></label>
      <label>{t('pro.thType')}:
        <select bind:value={newType} class="pro-select-sm">
          {#each supportTypes as st}
            <option value={st.value}>{st.label}</option>
          {/each}
        </select>
      </label>
      <button class="pro-btn" onclick={addSupport}>{t('pro.add')}</button>
    </div>

    {#if newType === 'custom3d'}
      <div class="dof-grid">
        <span class="dof-section-label">Translation</span>
        <label class="dof-check"><input type="checkbox" bind:checked={dofTx} /> ux</label>
        <label class="dof-check"><input type="checkbox" bind:checked={dofTy} /> uy</label>
        <label class="dof-check"><input type="checkbox" bind:checked={dofTz} /> uz</label>
        <span class="dof-section-label">Rotation</span>
        <label class="dof-check"><input type="checkbox" bind:checked={dofRx} /> rx</label>
        <label class="dof-check"><input type="checkbox" bind:checked={dofRy} /> ry</label>
        <label class="dof-check"><input type="checkbox" bind:checked={dofRz} /> rz</label>
      </div>
    {/if}

    {#if newType === 'spring3d' || newType === 'spring'}
      <div class="spring-grid">
        <label class="spring-field">kx <input type="text" bind:value={sKx} placeholder="kN/m" class="pro-input-sm" /></label>
        <label class="spring-field">ky <input type="text" bind:value={sKy} placeholder="kN/m" class="pro-input-sm" /></label>
        <label class="spring-field">kz <input type="text" bind:value={sKz} placeholder="kN/m" class="pro-input-sm" /></label>
        {#if is3D}
          <label class="spring-field">krx <input type="text" bind:value={sKrx} placeholder="kN·m/rad" class="pro-input-sm" /></label>
          <label class="spring-field">kry <input type="text" bind:value={sKry} placeholder="kN·m/rad" class="pro-input-sm" /></label>
          <label class="spring-field">krz <input type="text" bind:value={sKrz} placeholder="kN·m/rad" class="pro-input-sm" /></label>
        {/if}
      </div>
    {/if}

    {#if uiStore.selectedNodes.size > 0}
      <button class="pro-btn pro-btn-selection" onclick={addFromSelection}>
        {t('pro.addToSelection').replace('{n}', String(uiStore.selectedNodes.size))}
      </button>
    {/if}
  </div>

  <div class="pro-sup-table-wrap">
    <table class="pro-sup-table">
      <thead>
        <tr>
          <th>ID</th>
          <th>{t('pro.thNode')}</th>
          <th>{t('pro.thType')}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each supports as s}
          <tr>
            <td class="col-id">{s.id}</td>
            <td class="col-num">{s.nodeId}</td>
            <td>
              <select class="pro-select-inline" value={s.type} onchange={(e) => modelStore.updateSupport(s.id, { type: e.currentTarget.value })}>
                {#each supportTypes as st}
                  <option value={st.value}>{st.label}</option>
                {/each}
              </select>
            </td>
            <td><button class="pro-delete-btn" onclick={() => removeSupport(s.id)}>×</button></td>
          </tr>
          {#if s.type === 'custom3d'}
            <tr class="param-row">
              <td colspan="4">
                <div class="dof-grid-inline">
                  <label class="dof-check"><input type="checkbox" checked={s.dofRestraints?.tx ?? true} onchange={(e) => modelStore.updateSupport(s.id, { dofRestraints: { ...s.dofRestraints ?? { tx:true,ty:true,tz:true,rx:false,ry:false,rz:false }, tx: e.currentTarget.checked } })} /> ux</label>
                  <label class="dof-check"><input type="checkbox" checked={s.dofRestraints?.ty ?? true} onchange={(e) => modelStore.updateSupport(s.id, { dofRestraints: { ...s.dofRestraints ?? { tx:true,ty:true,tz:true,rx:false,ry:false,rz:false }, ty: e.currentTarget.checked } })} /> uy</label>
                  <label class="dof-check"><input type="checkbox" checked={s.dofRestraints?.tz ?? true} onchange={(e) => modelStore.updateSupport(s.id, { dofRestraints: { ...s.dofRestraints ?? { tx:true,ty:true,tz:true,rx:false,ry:false,rz:false }, tz: e.currentTarget.checked } })} /> uz</label>
                  <label class="dof-check"><input type="checkbox" checked={s.dofRestraints?.rx ?? false} onchange={(e) => modelStore.updateSupport(s.id, { dofRestraints: { ...s.dofRestraints ?? { tx:true,ty:true,tz:true,rx:false,ry:false,rz:false }, rx: e.currentTarget.checked } })} /> rx</label>
                  <label class="dof-check"><input type="checkbox" checked={s.dofRestraints?.ry ?? false} onchange={(e) => modelStore.updateSupport(s.id, { dofRestraints: { ...s.dofRestraints ?? { tx:true,ty:true,tz:true,rx:false,ry:false,rz:false }, ry: e.currentTarget.checked } })} /> ry</label>
                  <label class="dof-check"><input type="checkbox" checked={s.dofRestraints?.rz ?? false} onchange={(e) => modelStore.updateSupport(s.id, { dofRestraints: { ...s.dofRestraints ?? { tx:true,ty:true,tz:true,rx:false,ry:false,rz:false }, rz: e.currentTarget.checked } })} /> rz</label>
                </div>
              </td>
            </tr>
          {:else if s.type === 'spring3d' || s.type === 'spring'}
            <tr class="param-row">
              <td colspan="4">
                <div class="spring-grid-inline">
                  <label class="spring-field">kx <input type="text" value={s.kx ?? ''} placeholder="kN/m" class="pro-input-sm" onchange={(e) => modelStore.updateSupport(s.id, { kx: parseFloat(e.currentTarget.value) || 0 })} /></label>
                  <label class="spring-field">ky <input type="text" value={s.ky ?? ''} placeholder="kN/m" class="pro-input-sm" onchange={(e) => modelStore.updateSupport(s.id, { ky: parseFloat(e.currentTarget.value) || 0 })} /></label>
                  <label class="spring-field">kz <input type="text" value={s.kz ?? ''} placeholder="kN/m" class="pro-input-sm" onchange={(e) => modelStore.updateSupport(s.id, { kz: parseFloat(e.currentTarget.value) || 0 })} /></label>
                  {#if is3D}
                    <label class="spring-field">krx <input type="text" value={s.krx ?? ''} placeholder="kN·m/rad" class="pro-input-sm" onchange={(e) => modelStore.updateSupport(s.id, { krx: parseFloat(e.currentTarget.value) || 0 })} /></label>
                    <label class="spring-field">kry <input type="text" value={s.kry ?? ''} placeholder="kN·m/rad" class="pro-input-sm" onchange={(e) => modelStore.updateSupport(s.id, { kry: parseFloat(e.currentTarget.value) || 0 })} /></label>
                    <label class="spring-field">krz <input type="text" value={s.krz ?? ''} placeholder="kN·m/rad" class="pro-input-sm" onchange={(e) => modelStore.updateSupport(s.id, { krz: parseFloat(e.currentTarget.value) || 0 })} /></label>
                  {/if}
                </div>
              </td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .pro-sup { display: flex; flex-direction: column; height: 100%; }

  .pro-sup-header {
    padding: 8px 10px;
    border-bottom: 1px solid #1a3050;
  }

  .pro-sup-count { font-size: 0.82rem; color: #4ecdc4; font-weight: 600; }

  .pro-sup-form {
    padding: 10px 12px;
    border-bottom: 1px solid #1a3050;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .pro-sup-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .pro-sup-row label {
    font-size: 0.75rem;
    color: #888;
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .pro-input-sm {
    width: 55px;
    padding: 4px 6px;
    background: #0f2840;
    border: 1px solid #1a3050;
    border-radius: 3px;
    color: #ddd;
    font-size: 0.78rem;
    font-family: monospace;
  }

  .pro-input-sm:focus { border-color: #1a4a7a; outline: none; }

  .pro-select-sm {
    padding: 4px 6px;
    background: #0f2840;
    border: 1px solid #1a3050;
    border-radius: 3px;
    color: #ccc;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .pro-btn {
    padding: 5px 12px;
    font-size: 0.75rem;
    color: #ccc;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    cursor: pointer;
  }

  .pro-btn:hover { background: #1a4a7a; color: #fff; }

  .pro-btn-selection {
    font-size: 0.72rem;
    color: #4ecdc4;
    border-color: #2a5a6a;
  }

  .dof-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
    align-items: center;
    padding: 4px 0;
  }
  .dof-section-label {
    font-size: 0.65rem;
    color: #667;
    text-transform: uppercase;
    font-weight: 600;
    width: 100%;
  }
  .dof-check {
    font-size: 0.75rem;
    color: #aab;
    display: flex;
    align-items: center;
    gap: 3px;
    cursor: pointer;
  }
  .dof-check input { accent-color: #4ecdc4; }

  .spring-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .spring-field {
    font-size: 0.72rem;
    color: #889;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .spring-field .pro-input-sm { width: 65px; }

  .pro-sup-table-wrap { flex: 1; overflow: auto; }

  .pro-sup-table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
  .pro-sup-table thead { position: sticky; top: 0; z-index: 1; }
  .pro-sup-table th {
    padding: 6px 8px; text-align: left; font-size: 0.7rem; font-weight: 600;
    color: #888; text-transform: uppercase; background: #0a1a30; border-bottom: 1px solid #1a4a7a;
  }
  .pro-sup-table td { padding: 5px 8px; border-bottom: 1px solid #0f2030; color: #ccc; }
  .col-id { width: 34px; color: #666; font-family: monospace; text-align: center; }
  .col-num { font-family: monospace; }
  .param-row td { padding: 4px 8px; background: #0a1828; }
  .dof-grid-inline { display: flex; flex-wrap: wrap; gap: 4px 10px; }
  .spring-grid-inline { display: flex; flex-wrap: wrap; gap: 4px; }
  .pro-select-inline {
    padding: 2px 4px; background: #0f2840; border: 1px solid transparent; border-radius: 3px;
    color: #ccc; font-size: 0.72rem; cursor: pointer; width: 100%;
  }
  .pro-select-inline:hover { border-color: #1a4a7a; }
  .pro-select-inline:focus { border-color: #4ecdc4; outline: none; }
  .pro-delete-btn { background: none; border: none; color: #555; font-size: 1rem; cursor: pointer; padding: 0; }
  .pro-delete-btn:hover { color: #ff6b6b; }
</style>
