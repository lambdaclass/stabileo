<script lang="ts">
  import { modelStore, uiStore, historyStore, resultsStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import type { SupportType } from '../../lib/store/model.svelte.ts';

  const nodesArr = $derived([...modelStore.nodes.values()]);
  const supportsArr = $derived([...modelStore.supports.values()]);

  let newSupportNodeId = $state(0);
  let newSupportType = $state<string>('pinned');

  function deleteSupport(id: number) {
    modelStore.removeSupport(id);
  }

  function changeSupportType(supId: number, val: string) {
    modelStore.updateSupport(supId, { type: val as SupportType });
  }

  function updateSupportSpring(supId: number, field: string, val: string) {
    const num = parseFloat(val);
    if (isNaN(num)) return;
    modelStore.updateSupport(supId, { [field]: num } as any);
  }

  /** Default DOF restraints based on support type (for supports without explicit dofRestraints) */
  function defaultDofs(type: string): { tx: boolean; ty: boolean; tz: boolean; rx: boolean; ry: boolean; rz: boolean } {
    if (type === 'fixed3d' || type === 'fixed') return { tx: true, ty: true, tz: true, rx: true, ry: true, rz: true };
    if (type === 'pinned3d' || type === 'pinned') return { tx: true, ty: true, tz: true, rx: false, ry: false, rz: false };
    if (type === 'spring3d' || type === 'spring') return { tx: false, ty: false, tz: false, rx: false, ry: false, rz: false };
    if (type === 'rollerXZ') return { tx: false, ty: true, tz: false, rx: false, ry: false, rz: false };
    if (type === 'rollerXY') return { tx: false, ty: false, tz: true, rx: false, ry: false, rz: false };
    if (type === 'rollerYZ') return { tx: true, ty: false, tz: false, rx: false, ry: false, rz: false };
    return { tx: true, ty: true, tz: true, rx: true, ry: true, rz: true };
  }

  /** Derive support type from DOF restraints */
  function deriveType(r: { tx: boolean; ty: boolean; tz: boolean; rx: boolean; ry: boolean; rz: boolean }): SupportType {
    const allFixed = r.tx && r.ty && r.tz && r.rx && r.ry && r.rz;
    const onlyTrans = r.tx && r.ty && r.tz && !r.rx && !r.ry && !r.rz;
    const noneFixed = !r.tx && !r.ty && !r.tz && !r.rx && !r.ry && !r.rz;
    if (allFixed) return 'fixed3d';
    if (onlyTrans) return 'pinned3d';
    if (noneFixed) return 'spring3d';
    return 'custom3d';
  }

  /** Toggle a single DOF restraint on an existing support */
  function toggleDofRestraint(supId: number, sup: any, dof: 'tx' | 'ty' | 'tz' | 'rx' | 'ry' | 'rz') {
    const current = sup.dofRestraints ?? defaultDofs(sup.type);
    const updated = { ...current, [dof]: !current[dof] };
    const type = deriveType(updated);
    modelStore.updateSupport(supId, { dofRestraints: updated, type } as any);
    resultsStore.clear();
    resultsStore.clear3D();
  }

  function addSupport() {
    if (!modelStore.getNode(newSupportNodeId)) return;
    historyStore.pushState();
    if (uiStore.analysisMode === '3d') {
      // Create with per-DOF restraints from UI state
      const dofRestraints = {
        tx: uiStore.sup3dTx, ty: uiStore.sup3dTy, tz: uiStore.sup3dTz,
        rx: uiStore.sup3dRx, ry: uiStore.sup3dRy, rz: uiStore.sup3dRz,
      };
      const type = deriveType(dofRestraints);
      // Collect springs for unchecked DOFs
      let springs: any = undefined;
      const hasSpring = (!dofRestraints.tx && uiStore.sup3dKx > 0) ||
                        (!dofRestraints.ty && uiStore.sup3dKy > 0) ||
                        (!dofRestraints.tz && uiStore.sup3dKz > 0) ||
                        (!dofRestraints.rx && uiStore.sup3dKrx > 0) ||
                        (!dofRestraints.ry && uiStore.sup3dKry > 0) ||
                        (!dofRestraints.rz && uiStore.sup3dKrz > 0);
      if (hasSpring) {
        springs = {};
        if (!dofRestraints.tx && uiStore.sup3dKx > 0) springs.kx = uiStore.sup3dKx;
        if (!dofRestraints.ty && uiStore.sup3dKy > 0) springs.ky = uiStore.sup3dKy;
        if (!dofRestraints.tz && uiStore.sup3dKz > 0) springs.kz = uiStore.sup3dKz;
        if (!dofRestraints.rx && uiStore.sup3dKrx > 0) springs.krx = uiStore.sup3dKrx;
        if (!dofRestraints.ry && uiStore.sup3dKry > 0) springs.kry = uiStore.sup3dKry;
        if (!dofRestraints.rz && uiStore.sup3dKrz > 0) springs.krz = uiStore.sup3dKrz;
      }
      modelStore.addSupport(newSupportNodeId, type, springs, { dofRestraints, dofFrame: 'global' });
    } else {
      modelStore.addSupport(newSupportNodeId, newSupportType as any);
    }
    resultsStore.clear();
    resultsStore.clear3D();
  }
</script>

<table>
  <thead>
    {#if uiStore.analysisMode === '3d'}
      <tr><th>ID</th><th>{t('table.nodeLabel')}</th><th>{t('table.dofRestrained')}</th><th>{t('table.stiffness')}</th><th></th></tr>
    {:else}
      <tr><th>ID</th><th>{t('table.nodeLabel')}</th><th>{t('table.type')}</th><th>{t('table.stiffness')}</th><th></th></tr>
    {/if}
  </thead>
  <tbody>
    {#each supportsArr as sup}
      <tr>
        <td class="id-cell">{sup.id}</td>
        <td>{sup.nodeId}</td>
        {#if uiStore.analysisMode === '3d'}
          <!-- 3D: per-DOF checkboxes -->
          {@const dofs = sup.dofRestraints ?? defaultDofs(sup.type)}
          <td class="load-values">
            <label class="dof-chk" title={t('table.translationX')}><input type="checkbox" checked={dofs.tx} onchange={() => toggleDofRestraint(sup.id, sup, 'tx')} />Fx</label>
            <label class="dof-chk" title={t('table.translationY')}><input type="checkbox" checked={dofs.ty} onchange={() => toggleDofRestraint(sup.id, sup, 'ty')} />Fy</label>
            <label class="dof-chk" title={t('table.translationZ')}><input type="checkbox" checked={dofs.tz} onchange={() => toggleDofRestraint(sup.id, sup, 'tz')} />Fz</label>
            <label class="dof-chk" title={t('table.rotationX')}><input type="checkbox" checked={dofs.rx} onchange={() => toggleDofRestraint(sup.id, sup, 'rx')} />Mx</label>
            <label class="dof-chk" title={t('table.rotationY')}><input type="checkbox" checked={dofs.ry} onchange={() => toggleDofRestraint(sup.id, sup, 'ry')} />My</label>
            <label class="dof-chk" title={t('table.rotationZ')}><input type="checkbox" checked={dofs.rz} onchange={() => toggleDofRestraint(sup.id, sup, 'rz')} />Mz</label>
          </td>
          <td class="load-values">
            {#if !dofs.tx}
              <span class="load-field">kx<input type="number" step="100" value={sup.kx ?? 0} onchange={(e) => updateSupportSpring(sup.id, 'kx', e.currentTarget.value)} /></span>
            {/if}
            {#if !dofs.ty}
              <span class="load-field">ky<input type="number" step="100" value={sup.ky ?? 0} onchange={(e) => updateSupportSpring(sup.id, 'ky', e.currentTarget.value)} /></span>
            {/if}
            {#if !dofs.tz}
              <span class="load-field">kz<input type="number" step="100" value={sup.kz ?? 0} onchange={(e) => updateSupportSpring(sup.id, 'kz', e.currentTarget.value)} /></span>
            {/if}
            {#if !dofs.rx}
              <span class="load-field">krx<input type="number" step="100" value={sup.krx ?? 0} onchange={(e) => updateSupportSpring(sup.id, 'krx', e.currentTarget.value)} /></span>
            {/if}
            {#if !dofs.ry}
              <span class="load-field">kry<input type="number" step="100" value={sup.kry ?? 0} onchange={(e) => updateSupportSpring(sup.id, 'kry', e.currentTarget.value)} /></span>
            {/if}
            {#if !dofs.rz}
              <span class="load-field">krz<input type="number" step="100" value={sup.krz ?? 0} onchange={(e) => updateSupportSpring(sup.id, 'krz', e.currentTarget.value)} /></span>
            {/if}
          </td>
        {:else}
          <!-- 2D: type dropdown -->
          <td>
            <select value={sup.type} onchange={(e) => changeSupportType(sup.id, e.currentTarget.value)}>
              <option value="fixed">{t('table.fixed')}</option>
              <option value="pinned">{t('table.pinned')}</option>
              <option value="rollerX">{t('table.rollerX')}</option>
              <option value="rollerY">{t('table.rollerY')}</option>
              <option value="spring">{t('table.spring')}</option>
            </select>
          </td>
          <td class="load-values">
            {#if sup.type === 'spring'}
              <span class="load-field">kx<input type="number" step="100" value={sup.kx ?? 0} onchange={(e) => updateSupportSpring(sup.id, 'kx', e.currentTarget.value)} /></span>
              <span class="load-field">ky<input type="number" step="100" value={sup.ky ?? 0} onchange={(e) => updateSupportSpring(sup.id, 'ky', e.currentTarget.value)} /></span>
              <span class="load-field">kz<input type="number" step="100" value={sup.kz ?? 0} onchange={(e) => updateSupportSpring(sup.id, 'kz', e.currentTarget.value)} /></span>
            {:else}
              <span class="load-field">dx<input type="number" step="0.001" value={sup.dx ?? 0} onchange={(e) => updateSupportSpring(sup.id, 'dx', e.currentTarget.value)} /></span>
              <span class="load-field">dy<input type="number" step="0.001" value={sup.dy ?? 0} onchange={(e) => updateSupportSpring(sup.id, 'dy', e.currentTarget.value)} /></span>
              <span class="load-field">d&theta;<input type="number" step="0.001" value={sup.drz ?? 0} onchange={(e) => updateSupportSpring(sup.id, 'drz', e.currentTarget.value)} /></span>
            {/if}
          </td>
        {/if}
        <td><button class="del" onclick={() => deleteSupport(sup.id)}>&#10005;</button></td>
      </tr>
    {/each}
  </tbody>
</table>
<div class="table-footer">
  <div class="add-row" style={uiStore.analysisMode === '3d' ? 'flex-wrap:nowrap;gap:0.15rem;' : ''}>
    <span class="add-label">{t('table.nodeLabel')}:</span>
    <select bind:value={newSupportNodeId} class="add-input" style={uiStore.analysisMode === '3d' ? 'width:40px;' : ''}>
      {#each nodesArr as n}<option value={n.id}>{n.id}</option>{/each}
    </select>
    {#if uiStore.analysisMode === '3d'}
      <!-- 3D: per-DOF checkboxes for new support -->
      <label class="dof-chk"><input type="checkbox" bind:checked={uiStore.sup3dTx} />Fx</label>
      <label class="dof-chk"><input type="checkbox" bind:checked={uiStore.sup3dTy} />Fy</label>
      <label class="dof-chk"><input type="checkbox" bind:checked={uiStore.sup3dTz} />Fz</label>
      <label class="dof-chk"><input type="checkbox" bind:checked={uiStore.sup3dRx} />Mx</label>
      <label class="dof-chk"><input type="checkbox" bind:checked={uiStore.sup3dRy} />My</label>
      <label class="dof-chk"><input type="checkbox" bind:checked={uiStore.sup3dRz} />Mz</label>
      <button class="add-btn" style="padding:1px 3px;font-size:0.55rem;" onclick={() => uiStore.setSupport3DPreset('fixed')} title={t('table.fixed6dof')}>&#9635;</button>
      <button class="add-btn" style="padding:1px 3px;font-size:0.55rem;" onclick={() => uiStore.setSupport3DPreset('pinned')} title={t('table.pinned3trans')}>&#9651;</button>
    {:else}
      <select bind:value={newSupportType} class="add-input add-input-wide">
        <option value="fixed">{t('table.fixed')}</option>
        <option value="pinned">{t('table.pinned')}</option>
        <option value="rollerX">{t('table.rollerX')}</option>
        <option value="rollerY">{t('table.rollerY')}</option>
        <option value="spring">{t('table.spring')}</option>
      </select>
    {/if}
    <button class="add-btn" onclick={addSupport}>{t('table.addSupport')}</button>
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

  .load-values {
    display: flex;
    gap: 0.25rem;
    flex-wrap: wrap;
  }

  .load-field {
    display: flex;
    align-items: center;
    gap: 0.15rem;
    font-size: 0.65rem;
    color: #888;
  }

  .load-field input {
    width: 50px;
  }

  .dof-chk {
    display: inline-flex;
    align-items: center;
    gap: 1px;
    font-size: 0.6rem;
    color: #aaa;
    cursor: pointer;
    white-space: nowrap;
  }
  .dof-chk input {
    accent-color: #e94560;
    margin: 0;
    width: 12px;
    height: 12px;
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

  .add-input-wide {
    width: auto;
    min-width: 80px;
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
