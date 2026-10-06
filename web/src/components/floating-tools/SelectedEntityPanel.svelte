<script lang="ts">
  import { uiStore, resultsStore, modelStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import type { NodalLoad, DistributedLoad, PointLoadOnElement, NodalLoad3D, DistributedLoad3D } from '../../lib/store/model.svelte.ts';
  import { get2DDisplayNodalLoadMoment, get2DDisplayNodalLoadVertical } from '../../lib/geometry/coordinate-system';
  import { memberLoadPerpComponent } from '../../lib/engine/model-diagnostics';
  import Icon from '../ribbon/Icon.svelte';
  // Values are typed in the unit system chosen under Settings and kept in SI.
  import UnitInput from '../UnitInput.svelte';
  import { unitQ } from '../../lib/store/display-units.svelte';

  /**
   * `inBar`: shown in the options bar's edit mode (ToolOptions), whose own
   * label already says "Edit load", so the panel's tag would repeat it.
   */
  let { inBar = false }: { inBar?: boolean } = $props();

  function updateLoadField(loadId: number, field: string, val: string | boolean) {
    if (typeof val === 'boolean') {
      modelStore.updateLoad(loadId, { [field]: val });
    } else {
      const num = parseFloat(val);
      if (isNaN(num)) return;
      modelStore.updateLoad(loadId, { [field]: num });
    }
    resultsStore.clear();
    warnIfTransverseOnTruss(loadId);
  }

  /** Educational warning: transverse load on an axial-only (truss) member is not
   *  transferred as bending/shear. Non-blocking. */
  function warnIfTransverseOnTruss(loadId: number) {
    const load = modelStore.loads.find((l) => l.data.id === loadId);
    const elemId = load ? (load.data as { elementId?: number }).elementId : undefined;
    if (!load || elemId == null) return;
    const elem = modelStore.elements.get(elemId);
    if (!elem || elem.type !== 'truss') return;
    if (memberLoadPerpComponent(load as any, elem, modelStore.nodes) > 1e-9) {
      uiStore.toast(t('diag.model.transverseOnTruss'), 'info');
    }
  }

  function updateDistLoadPosition(loadId: number, field: 'a' | 'b', val: string, elemLen: number, currentA: number, currentB: number) {
    const num = parseFloat(val);
    if (isNaN(num)) return;
    if (field === 'a') {
      const a = Math.max(0, Math.min(elemLen, num));
      const updates: Record<string, number> = { a };
      if (a > currentB) updates.b = a;
      modelStore.updateLoad(loadId, updates);
    } else {
      const b = Math.max(currentA, Math.min(elemLen, num));
      modelStore.updateLoad(loadId, { b });
    }
    resultsStore.clear();
  }

  function deleteSelectedLoads() {
    const ids = [...uiStore.selectedLoads];
    modelStore.batch(() => { for (const id of ids) modelStore.removeLoad(id); });
    uiStore.clearSelectedLoads();
    resultsStore.clear();
  }

  function deleteSelectedSupports() {
    const ids = [...uiStore.selectedSupports];
    modelStore.batch(() => { for (const id of ids) modelStore.removeSupport(id); });
    uiStore.clearSelectedSupports();
    resultsStore.clear();
  }

  function changeSupportType(supId: number, newType: string) {
    modelStore.updateSupport(supId, { type: newType as any });
    resultsStore.clear();
  }

  function updateSupportField(supId: number, field: string, val: string | boolean) {
    if (typeof val === 'boolean') {
      modelStore.updateSupport(supId, { [field]: val } as any);
    } else {
      const num = parseFloat(val);
      if (isNaN(num)) return;
      modelStore.updateSupport(supId, { [field]: num } as any);
    }
    resultsStore.clear();
  }

  const supTypeLabelKeys: Record<string, string> = {
    fixed: 'selEntity.supFixed',
    pinned: 'selEntity.supPinned',
    rollerX: 'selEntity.supRoller',
    rollerZ: 'selEntity.supRoller',
    rollerY: 'selEntity.supRoller',
    spring: 'selEntity.supSpring',
    fixed3d: 'selEntity.supFixed3d',
    pinned3d: 'selEntity.supPinned3d',
    rollerXZ: 'selEntity.supRollerXZ',
    rollerXY: 'selEntity.supRollerXY',
    rollerYZ: 'selEntity.supRollerYZ',
    spring3d: 'selEntity.supSpring3d',
    custom3d: 'selEntity.supCustom3d',
  };

  function isRollerType(type: string): boolean {
    return type === 'rollerX' || type === 'rollerY' || type === 'rollerZ' || type === 'rollerXZ' || type === 'rollerXY' || type === 'rollerYZ';
  }

  function is3DSupport(type: string): boolean {
    return type === 'fixed3d' || type === 'pinned3d' || type === 'rollerXZ' || type === 'rollerXY' || type === 'rollerYZ' || type === 'spring3d' || type === 'custom3d';
  }

  const supportTypes = [
    { id: 'fixed', key: 'float.supportFixedShort', icon: '▣', svg: false },
    { id: 'pinned', key: 'float.supportPinnedShort', icon: '△', svg: false },
    { id: 'roller', key: 'float.supportRoller', icon: '', svg: true },
    { id: 'spring', key: 'float.supportSpring', icon: '⌇', svg: false },
  ] as const;

  // Get the single selected load (for inline edit)
  const selectedLoad = $derived.by(() => {
    if (uiStore.selectedLoads.size !== 1) return null;
    const id = [...uiStore.selectedLoads][0];
    return modelStore.loads.find(l => l.data.id === id) ?? null;
  });

  // Get the single selected support (for inline edit)
  const selectedSup = $derived.by(() => {
    if (uiStore.selectedSupports.size !== 1) return null;
    const id = [...uiStore.selectedSupports][0];
    return modelStore.supports.get(id) ?? null;
  });
</script>

{#if selectedLoad}
  <div class="ft-load-edit" class:in-bar={inBar}>
    {#if !inBar}<span class="ft-load-tag">{t('selEntity.editingLoad')}</span>{/if}
    <span class="ft-case-dot" style="background: {modelStore.getLoadCaseColor((selectedLoad.data as any).caseId ?? 1)}"></span>
    <select class="ft-case-select"
      value={String((selectedLoad.data as any).caseId ?? 1)}
      onchange={(e) => { updateLoadField(selectedLoad.data.id, 'caseId', e.currentTarget.value); }}
      title={t('selEntity.loadCase')}>
      {#each modelStore.loadCases as lc}
        <option value={String(lc.id)}>{lc.type || lc.name}</option>
      {/each}
    </select>
    <span class="ft-sep">|</span>
    {#if selectedLoad.type === 'nodal'}
      {@const nl = selectedLoad.data as NodalLoad}
      <label class="ft-input-group">
        <span>Fx:</span>
        <UnitInput value={nl.fx} qty="force" onchange={(v) => updateLoadField(nl.id, 'fx', String(v))} unit={false} />
        <span class="ft-unit">{unitQ('force')}</span>
      </label>
      <label class="ft-input-group">
        <span>Fz:</span>
        <UnitInput value={get2DDisplayNodalLoadVertical(nl)} qty="force" onchange={(v) => updateLoadField(nl.id, 'fz', String(v))} unit={false} />
        <span class="ft-unit">{unitQ('force')}</span>
      </label>
      <label class="ft-input-group">
        <span>My:</span>
        <UnitInput value={get2DDisplayNodalLoadMoment(nl)} qty="moment" onchange={(v) => updateLoadField(nl.id, 'my', String(v))} unit={false} />
        <span class="ft-unit">{unitQ('moment')}</span>
      </label>
    {:else if selectedLoad.type === 'distributed'}
      {@const dl = selectedLoad.data as DistributedLoad}
      {@const elemLen = modelStore.getElementLength(dl.elementId)}
      <label class="ft-input-group">
        <span>qI:</span>
        <UnitInput value={dl.qI} qty="distributedLoad" onchange={(v) => updateLoadField(dl.id, 'qI', String(v))} unit={false} />
        <span class="ft-unit">{unitQ('distributedLoad')}</span>
      </label>
      <label class="ft-input-group">
        <span>qJ:</span>
        <UnitInput value={dl.qJ} qty="distributedLoad" onchange={(v) => updateLoadField(dl.id, 'qJ', String(v))} unit={false} />
        <span class="ft-unit">{unitQ('distributedLoad')}</span>
      </label>
      <label class="ft-input-group">
        <span>a:</span>
        <UnitInput value={dl.a ?? 0} qty="length" onchange={(v) => updateDistLoadPosition(dl.id, 'a', String(v), elemLen, dl.a ?? 0, dl.b ?? elemLen)} unit={false} />
        <span class="ft-unit">{unitQ('length')}</span>
      </label>
      <label class="ft-input-group">
        <span>b:</span>
        <UnitInput value={dl.b ?? elemLen} qty="length" onchange={(v) => updateDistLoadPosition(dl.id, 'b', String(v), elemLen, dl.a ?? 0, dl.b ?? elemLen)} unit={false} />
        <span class="ft-unit">{unitQ('length')}</span>
      </label>
      <span class="ft-sep">|</span>
      <button class="ft-opt-btn ft-coord-btn" class:active={dl.isGlobal === true} onclick={() => updateLoadField(dl.id, 'isGlobal', true)} title={t('float.loadGlobalYDir')}>Z</button>
      <button class="ft-opt-btn ft-coord-btn" class:active={!dl.isGlobal} onclick={() => updateLoadField(dl.id, 'isGlobal', false)} title={t('float.loadPerpDir')}>⊥</button>
      <label class="ft-input-group">
        <span>α:</span>
        <input type="number" step="5" value={dl.angle ?? 0} onchange={(e) => updateLoadField(dl.id, 'angle', e.currentTarget.value)} />
        <span class="ft-unit">°</span>
      </label>
    {:else if selectedLoad.type === 'pointOnElement'}
      {@const pl = selectedLoad.data as PointLoadOnElement}
      {@const elemLen = modelStore.getElementLength(pl.elementId)}
      <label class="ft-input-group">
        <span>a:</span>
        <UnitInput value={pl.a} qty="length" onchange={(v) => updateLoadField(pl.id, 'a', String(v))} unit={false} />
        <span class="ft-unit">{unitQ('length')}</span>
      </label>
      <label class="ft-input-group">
        <span>{pl.isGlobal ? 'Fz' : 'Fj'}:</span>
        <UnitInput value={pl.p} qty="force" onchange={(v) => updateLoadField(pl.id, 'p', String(v))} unit={false} />
        <span class="ft-unit">{unitQ('force')}</span>
      </label>
      <label class="ft-input-group">
        <span>{pl.isGlobal ? 'Fx' : 'Fi'}:</span>
        <UnitInput value={pl.px ?? 0} qty="force" onchange={(v) => updateLoadField(pl.id, 'px', String(v))} unit={false} />
        <span class="ft-unit">{unitQ('force')}</span>
      </label>
      <label class="ft-input-group">
        <span>My:</span>
        <UnitInput value={get2DDisplayNodalLoadMoment(pl)} qty="moment" onchange={(v) => updateLoadField(pl.id, 'my', String(v))} unit={false} />
        <span class="ft-unit">{unitQ('moment')}</span>
      </label>
      <span class="ft-sep">|</span>
      <button class="ft-opt-btn ft-coord-btn" class:active={pl.isGlobal === true} onclick={() => updateLoadField(pl.id, 'isGlobal', true)} title={t('float.loadGlobalYDir')}>Z</button>
      <button class="ft-opt-btn ft-coord-btn" class:active={!pl.isGlobal} onclick={() => updateLoadField(pl.id, 'isGlobal', false)} title={t('float.loadPerpDir')}>⊥</button>
      <label class="ft-input-group">
        <span>α:</span>
        <input type="number" step="5" value={pl.angle ?? 0} onchange={(e) => updateLoadField(pl.id, 'angle', e.currentTarget.value)} />
        <span class="ft-unit">°</span>
      </label>
    {:else if selectedLoad.type === 'thermal'}
      {@const tl = selectedLoad.data as { id: number; elementId: number; dtUniform: number; dtGradient: number }}
      <label class="ft-input-group">
        <span>ΔT:</span>
        <UnitInput value={tl.dtUniform} qty="temperatureDelta" onchange={(v) => updateLoadField(tl.id, 'dtUniform', String(v))} unit={false} />
        <span class="ft-unit">{unitQ('temperatureDelta')}</span>
      </label>
      <label class="ft-input-group">
        <span>ΔTg:</span>
        <UnitInput value={tl.dtGradient} qty="temperatureDelta" onchange={(v) => updateLoadField(tl.id, 'dtGradient', String(v))} unit={false} />
        <span class="ft-unit">{unitQ('temperatureDelta')}</span>
      </label>
    {:else if selectedLoad.type === 'nodal3d'}
      {@const nl3 = selectedLoad.data as NodalLoad3D}
      <label class="ft-input-group"><span>Fx:</span><UnitInput value={nl3.fx} qty="force" onchange={(v) => updateLoadField(nl3.id, 'fx', String(v))} unit={false} /><span class="ft-unit">{unitQ('force')}</span></label>
      <label class="ft-input-group"><span>Fy:</span><UnitInput value={nl3.fy} qty="force" onchange={(v) => updateLoadField(nl3.id, 'fy', String(v))} unit={false} /><span class="ft-unit">{unitQ('force')}</span></label>
      <label class="ft-input-group"><span>Fz:</span><UnitInput value={nl3.fz} qty="force" onchange={(v) => updateLoadField(nl3.id, 'fz', String(v))} unit={false} /><span class="ft-unit">{unitQ('force')}</span></label>
      <label class="ft-input-group"><span>Mx:</span><UnitInput value={nl3.mx} qty="moment" onchange={(v) => updateLoadField(nl3.id, 'mx', String(v))} unit={false} /><span class="ft-unit">{unitQ('moment')}</span></label>
      <label class="ft-input-group"><span>My:</span><UnitInput value={nl3.my} qty="moment" onchange={(v) => updateLoadField(nl3.id, 'my', String(v))} unit={false} /><span class="ft-unit">{unitQ('moment')}</span></label>
      <label class="ft-input-group"><span>Mz:</span><UnitInput value={nl3.mz} qty="moment" onchange={(v) => updateLoadField(nl3.id, 'mz', String(v))} unit={false} /><span class="ft-unit">{unitQ('moment')}</span></label>
    {:else if selectedLoad.type === 'distributed3d'}
      {@const dl3 = selectedLoad.data as DistributedLoad3D}
      <label class="ft-input-group"><span>qYI:</span><UnitInput value={dl3.qYI} qty="distributedLoad" onchange={(v) => updateLoadField(dl3.id, 'qYI', String(v))} unit={false} /><span class="ft-unit">{unitQ('distributedLoad')}</span></label>
      <label class="ft-input-group"><span>qYJ:</span><UnitInput value={dl3.qYJ} qty="distributedLoad" onchange={(v) => updateLoadField(dl3.id, 'qYJ', String(v))} unit={false} /><span class="ft-unit">{unitQ('distributedLoad')}</span></label>
      <label class="ft-input-group"><span>qZI:</span><UnitInput value={dl3.qZI} qty="distributedLoad" onchange={(v) => updateLoadField(dl3.id, 'qZI', String(v))} unit={false} /><span class="ft-unit">{unitQ('distributedLoad')}</span></label>
      <label class="ft-input-group"><span>qZJ:</span><UnitInput value={dl3.qZJ} qty="distributedLoad" onchange={(v) => updateLoadField(dl3.id, 'qZJ', String(v))} unit={false} /><span class="ft-unit">{unitQ('distributedLoad')}</span></label>
    {/if}
    <button class="ft-load-delete" onclick={deleteSelectedLoads} title={t('selEntity.deleteLoad')} aria-label={t('selEntity.deleteLoad')} data-testid="edit-delete"><Icon name="trash" size={14} /></button>
    <button class="ft-load-done" onclick={() => { uiStore.clearSelectedLoads(); uiStore.currentTool = 'load'; }} title={t('selEntity.deselectBack')} data-testid="edit-done">✓</button>
  </div>
{:else if uiStore.selectedLoads.size > 1}
  <div class="ft-load-edit" class:in-bar={inBar}>
    <span class="ft-load-tag">{t('selEntity.loadsSelected').replace('{n}', String(uiStore.selectedLoads.size))}</span>
    <button class="ft-load-delete" onclick={deleteSelectedLoads} title={t('selEntity.deleteSelectedLoads')} data-testid="edit-delete"><Icon name="trash" size={14} /> {t('selEntity.deleteBtn')}</button>
    <button class="ft-load-done" onclick={() => { uiStore.clearSelectedLoads(); uiStore.currentTool = 'load'; }} title={t('selEntity.deselectBack')} data-testid="edit-done">✓</button>
  </div>
{/if}

{#if selectedSup}
  <div class="ft-load-edit" class:in-bar={inBar}>
    <span class="ft-load-tag">{t('selEntity.support')} {t(supTypeLabelKeys[selectedSup.type] ?? '') || selectedSup.type}</span>
    <span class="ft-sep">|</span>
    {#if is3DSupport(selectedSup.type)}
      <!-- 3D per-DOF editing for selected support -->
      {@const dofs = selectedSup.dofRestraints ?? { tx: true, ty: true, tz: true, rx: true, ry: true, rz: true }}
      <label class="ft-chk"><input type="checkbox" checked={dofs.tx} onchange={() => {
        const r = selectedSup.dofRestraints ?? { tx: true, ty: true, tz: true, rx: true, ry: true, rz: true };
        const u = { ...r, tx: !r.tx };
        const allF = u.tx && u.ty && u.tz && u.rx && u.ry && u.rz;
        const onlyT = u.tx && u.ty && u.tz && !u.rx && !u.ry && !u.rz;
        const noneF = !u.tx && !u.ty && !u.tz && !u.rx && !u.ry && !u.rz;
        modelStore.updateSupport(selectedSup.id, { dofRestraints: u, type: allF ? 'fixed3d' : onlyT ? 'pinned3d' : noneF ? 'spring3d' : 'custom3d' } as any);
        resultsStore.clear(); resultsStore.clear3D();
      }} /> <span>Fx</span></label>
      <label class="ft-chk"><input type="checkbox" checked={dofs.ty} onchange={() => {
        const r = selectedSup.dofRestraints ?? { tx: true, ty: true, tz: true, rx: true, ry: true, rz: true };
        const u = { ...r, ty: !r.ty };
        const allF = u.tx && u.ty && u.tz && u.rx && u.ry && u.rz;
        const onlyT = u.tx && u.ty && u.tz && !u.rx && !u.ry && !u.rz;
        const noneF = !u.tx && !u.ty && !u.tz && !u.rx && !u.ry && !u.rz;
        modelStore.updateSupport(selectedSup.id, { dofRestraints: u, type: allF ? 'fixed3d' : onlyT ? 'pinned3d' : noneF ? 'spring3d' : 'custom3d' } as any);
        resultsStore.clear(); resultsStore.clear3D();
      }} /> <span>Fy</span></label>
      <label class="ft-chk"><input type="checkbox" checked={dofs.tz} onchange={() => {
        const r = selectedSup.dofRestraints ?? { tx: true, ty: true, tz: true, rx: true, ry: true, rz: true };
        const u = { ...r, tz: !r.tz };
        const allF = u.tx && u.ty && u.tz && u.rx && u.ry && u.rz;
        const onlyT = u.tx && u.ty && u.tz && !u.rx && !u.ry && !u.rz;
        const noneF = !u.tx && !u.ty && !u.tz && !u.rx && !u.ry && !u.rz;
        modelStore.updateSupport(selectedSup.id, { dofRestraints: u, type: allF ? 'fixed3d' : onlyT ? 'pinned3d' : noneF ? 'spring3d' : 'custom3d' } as any);
        resultsStore.clear(); resultsStore.clear3D();
      }} /> <span>Fz</span></label>
      <label class="ft-chk"><input type="checkbox" checked={dofs.rx} onchange={() => {
        const r = selectedSup.dofRestraints ?? { tx: true, ty: true, tz: true, rx: true, ry: true, rz: true };
        const u = { ...r, rx: !r.rx };
        const allF = u.tx && u.ty && u.tz && u.rx && u.ry && u.rz;
        const onlyT = u.tx && u.ty && u.tz && !u.rx && !u.ry && !u.rz;
        const noneF = !u.tx && !u.ty && !u.tz && !u.rx && !u.ry && !u.rz;
        modelStore.updateSupport(selectedSup.id, { dofRestraints: u, type: allF ? 'fixed3d' : onlyT ? 'pinned3d' : noneF ? 'spring3d' : 'custom3d' } as any);
        resultsStore.clear(); resultsStore.clear3D();
      }} /> <span>Mx</span></label>
      <label class="ft-chk"><input type="checkbox" checked={dofs.ry} onchange={() => {
        const r = selectedSup.dofRestraints ?? { tx: true, ty: true, tz: true, rx: true, ry: true, rz: true };
        const u = { ...r, ry: !r.ry };
        const allF = u.tx && u.ty && u.tz && u.rx && u.ry && u.rz;
        const onlyT = u.tx && u.ty && u.tz && !u.rx && !u.ry && !u.rz;
        const noneF = !u.tx && !u.ty && !u.tz && !u.rx && !u.ry && !u.rz;
        modelStore.updateSupport(selectedSup.id, { dofRestraints: u, type: allF ? 'fixed3d' : onlyT ? 'pinned3d' : noneF ? 'spring3d' : 'custom3d' } as any);
        resultsStore.clear(); resultsStore.clear3D();
      }} /> <span>My</span></label>
      <label class="ft-chk"><input type="checkbox" checked={dofs.rz} onchange={() => {
        const r = selectedSup.dofRestraints ?? { tx: true, ty: true, tz: true, rx: true, ry: true, rz: true };
        const u = { ...r, rz: !r.rz };
        const allF = u.tx && u.ty && u.tz && u.rx && u.ry && u.rz;
        const onlyT = u.tx && u.ty && u.tz && !u.rx && !u.ry && !u.rz;
        const noneF = !u.tx && !u.ty && !u.tz && !u.rx && !u.ry && !u.rz;
        modelStore.updateSupport(selectedSup.id, { dofRestraints: u, type: allF ? 'fixed3d' : onlyT ? 'pinned3d' : noneF ? 'spring3d' : 'custom3d' } as any);
        resultsStore.clear(); resultsStore.clear3D();
      }} /> <span>Mz</span></label>
      <!-- Spring stiffnesses for unchecked DOFs -->
      {#if !dofs.tx}
        <label class="ft-input-group"><span>kx:</span><UnitInput value={selectedSup.kx ?? 0} qty="springK" onchange={(v) => updateSupportField(selectedSup.id, 'kx', String(v))} unit={false} /><span class="ft-unit">{unitQ('springK')}</span></label>
      {/if}
      {#if !dofs.ty}
        <label class="ft-input-group"><span>ky:</span><UnitInput value={selectedSup.ky ?? 0} qty="springK" onchange={(v) => updateSupportField(selectedSup.id, 'ky', String(v))} unit={false} /><span class="ft-unit">{unitQ('springK')}</span></label>
      {/if}
      {#if !dofs.tz}
        <label class="ft-input-group"><span>kz:</span><UnitInput value={selectedSup.kz ?? 0} qty="springK" onchange={(v) => updateSupportField(selectedSup.id, 'kz', String(v))} unit={false} /><span class="ft-unit">{unitQ('springK')}</span></label>
      {/if}
      {#if !dofs.rx}
        <label class="ft-input-group"><span>krx:</span><UnitInput value={selectedSup.krx ?? 0} qty="springKr" onchange={(v) => updateSupportField(selectedSup.id, 'krx', String(v))} unit={false} /><span class="ft-unit">{unitQ('springKr')}</span></label>
      {/if}
      {#if !dofs.ry}
        <label class="ft-input-group"><span>kry:</span><UnitInput value={selectedSup.kry ?? 0} qty="springKr" onchange={(v) => updateSupportField(selectedSup.id, 'kry', String(v))} unit={false} /><span class="ft-unit">{unitQ('springKr')}</span></label>
      {/if}
      {#if !dofs.rz}
        <label class="ft-input-group"><span>krz:</span><UnitInput value={selectedSup.krz ?? 0} qty="springKr" onchange={(v) => updateSupportField(selectedSup.id, 'krz', String(v))} unit={false} /><span class="ft-unit">{unitQ('springKr')}</span></label>
      {/if}
    {:else}
    <!-- 2D support type buttons -->
    {#each supportTypes as st}
      <button
        class="ft-opt-btn ft-sup-btn"
        class:active={st.id === 'roller' ? isRollerType(selectedSup.type) : selectedSup.type === st.id}
        onclick={() => changeSupportType(selectedSup.id, st.id === 'roller' ? 'rollerX' : st.id)}
        title={t(st.key)}
      >
        {#if st.id === 'roller'}
          <svg class="ft-sup-svg" viewBox="0 0 20 20" width="14" height="14">
            <polygon points="10,2 3,12 17,12" fill="none" stroke="currentColor" stroke-width="1.8"/>
            <circle cx="7" cy="16" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/>
            <circle cx="13" cy="16" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/>
          </svg>
        {:else}
          {st.icon}
        {/if}
      </button>
    {/each}
    {/if}
    {#if isRollerType(selectedSup.type)}
      <span class="ft-sep">|</span>
      <button class="ft-opt-btn ft-dir-btn" class:active={selectedSup.type === 'rollerX'}
        onclick={() => changeSupportType(selectedSup.id, 'rollerX')}
        title={selectedSup.isGlobal !== false ? t('float.rollerRestrictsYGlobal') : t('float.rollerRestrictsJLocal')}
      >{selectedSup.isGlobal !== false ? 'X' : 'i'}</button>
      <button class="ft-opt-btn ft-dir-btn" class:active={selectedSup.type === 'rollerY' || selectedSup.type === 'rollerZ'}
        onclick={() => changeSupportType(selectedSup.id, 'rollerZ')}
        title={selectedSup.isGlobal !== false ? t('float.rollerRestrictsXGlobal') : t('float.rollerRestrictsILocal')}
      >{selectedSup.isGlobal !== false ? 'Z' : 'j'}</button>
      <span class="ft-sep">|</span>
      <button class="ft-opt-btn ft-coord-btn" class:active={selectedSup.isGlobal !== false} onclick={() => updateSupportField(selectedSup.id, 'isGlobal', true)}
        title={t('float.rollerGlobalLabel')}>Gl</button>
      <button class="ft-opt-btn ft-coord-btn" class:active={selectedSup.isGlobal === false} onclick={() => updateSupportField(selectedSup.id, 'isGlobal', false)}
        title={t('float.rollerLocalLabel')}>Loc</button>
      <label class="ft-input-group" title={t('float.prescribedRollerDisp')}>
        <span>di:</span>
        <UnitInput value={selectedSup.dx ?? 0} qty="displacement" onchange={(v) => updateSupportField(selectedSup.id, 'dx', String(v))} unit={false} />
        <span class="ft-unit">{unitQ('displacement')}</span>
      </label>
      <label class="ft-input-group" title={t('float.supportAngle')}>
        <span>α:</span>
        <input type="number" step="5" value={selectedSup.angle ?? 0} onchange={(e) => updateSupportField(selectedSup.id, 'angle', e.currentTarget.value)} />
        <span class="ft-unit">°</span>
      </label>
    {:else if selectedSup.type === 'spring'}
      <span class="ft-sep">|</span>
      <label class="ft-input-group">
        <span>kx:</span>
        <UnitInput value={selectedSup.kx ?? 0} qty="springK" onchange={(v) => updateSupportField(selectedSup.id, 'kx', String(v))} unit={false} /><span class="ft-unit">{unitQ('springK')}</span>
      </label>
      <label class="ft-input-group">
        <span>ky:</span>
        <UnitInput value={selectedSup.ky ?? 0} qty="springK" onchange={(v) => updateSupportField(selectedSup.id, 'ky', String(v))} unit={false} /><span class="ft-unit">{unitQ('springK')}</span>
      </label>
      <label class="ft-input-group">
        <span>kθ:</span>
        <UnitInput value={selectedSup.kz ?? 0} qty="springKr" onchange={(v) => updateSupportField(selectedSup.id, 'kz', String(v))} unit={false} /><span class="ft-unit">{unitQ('springKr')}</span>
      </label>
      <span class="ft-sep">|</span>
      <button class="ft-opt-btn ft-coord-btn" class:active={selectedSup.isGlobal !== false} onclick={() => updateSupportField(selectedSup.id, 'isGlobal', true)}
        title={t('float.supportGlobalAxes')}>Gl</button>
      <button class="ft-opt-btn ft-coord-btn" class:active={selectedSup.isGlobal === false} onclick={() => updateSupportField(selectedSup.id, 'isGlobal', false)}
        title={t('float.supportLocalAxes')}>Loc</button>
      <label class="ft-input-group" title={t('float.supportAngle')}>
        <span>α:</span>
        <input type="number" step="5" value={selectedSup.angle ?? 0} onchange={(e) => updateSupportField(selectedSup.id, 'angle', e.currentTarget.value)} />
        <span class="ft-unit">°</span>
      </label>
    {:else if selectedSup.type === 'fixed' || selectedSup.type === 'pinned'}
      <span class="ft-sep">|</span>
      {#if selectedSup.type === 'fixed' || selectedSup.type === 'pinned'}
        <label class="ft-input-group" title={t('float.prescribedDx')}>
          <span>dx:</span>
          <UnitInput value={selectedSup.dx ?? 0} qty="displacement" onchange={(v) => updateSupportField(selectedSup.id, 'dx', String(v))} unit={false} /><span class="ft-unit">{unitQ('displacement')}</span>
        </label>
        <label class="ft-input-group" title={t('float.prescribedDy')}>
          <!-- The plane is XZ: named as SupportDetails names them, and written to the store's own fields. -->
          <span>dz:</span>
          <UnitInput value={selectedSup.dz ?? selectedSup.dy ?? 0} qty="displacement" onchange={(v) => updateSupportField(selectedSup.id, 'dz', String(v))} unit={false} /><span class="ft-unit">{unitQ('displacement')}</span>
        </label>
      {/if}
      {#if selectedSup.type === 'fixed'}
        <label class="ft-input-group" title={t('float.prescribedDrz')}>
          <span>dθy:</span>
          <UnitInput value={selectedSup.dry ?? selectedSup.drz ?? 0} qty="rotation" onchange={(v) => updateSupportField(selectedSup.id, 'dry', String(v))} unit={false} /><span class="ft-unit">{unitQ('rotation')}</span>
        </label>
      {/if}
      <label class="ft-input-group" title={t('float.supportAngleVisual')}>
        <span>α:</span>
        <input type="number" step="5" value={selectedSup.angle ?? 0} onchange={(e) => updateSupportField(selectedSup.id, 'angle', e.currentTarget.value)} />
        <span class="ft-unit">°</span>
      </label>
    {/if}
    <button class="ft-load-delete" onclick={deleteSelectedSupports} title={t('selEntity.deleteSupport')} aria-label={t('selEntity.deleteSupport')} data-testid="edit-delete"><Icon name="trash" size={14} /></button>
    <button class="ft-load-done" onclick={() => { uiStore.clearSelectedSupports(); uiStore.currentTool = 'support'; }} title={t('selEntity.deselectBackSupport')} data-testid="edit-done">✓</button>
  </div>
{:else if uiStore.selectedSupports.size > 1}
  <div class="ft-load-edit" class:in-bar={inBar}>
    <span class="ft-load-tag">{t('selEntity.supportsSelected').replace('{n}', String(uiStore.selectedSupports.size))}</span>
    <button class="ft-load-delete" onclick={deleteSelectedSupports} title={t('selEntity.deleteSelectedSupports')} data-testid="edit-delete"><Icon name="trash" size={14} /> {t('selEntity.deleteBtn')}</button>
    <button class="ft-load-done" onclick={() => { uiStore.clearSelectedSupports(); uiStore.currentTool = 'support'; }} title={t('selEntity.deselectBackSupport')} data-testid="edit-done">✓</button>
  </div>
{/if}

<style>
  .ft-opt-btn {
    padding: 2px 8px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: 4px;
    color: var(--st-text-2);
    cursor: pointer;
    font-size: 0.7rem;
    transition: all 0.15s;
    white-space: nowrap;
  }

  .ft-opt-btn:hover:not(:disabled) {
    background: var(--st-surface-3);
    color: var(--st-text);
  }

  .ft-opt-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
    color: var(--st-text-3);
    background: var(--st-surface-2);
    border-color: var(--st-hair);
  }

  .ft-opt-btn.active {
    background: var(--st-accent);
    border-color: var(--st-danger);
    color: white;
  }

  .ft-sup-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
    min-height: 22px;
    min-width: 22px;
    line-height: 1;
  }

  .ft-sup-svg {
    vertical-align: middle;
    flex-shrink: 0;
  }

  .ft-chk {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-size: 0.68rem;
    color: var(--st-text-2);
    cursor: pointer;
    white-space: nowrap;
  }
  .ft-chk input {
    accent-color: var(--st-accent);
    margin: 0;
    width: 13px;
    height: 13px;
  }
  .ft-chk span {
    font-size: 0.65rem;
  }

  .ft-sep {
    color: var(--st-text-3);
    font-size: 0.8rem;
    margin: 0 2px;
  }

  .ft-case-select {
    background: var(--st-surface-2);
    color: var(--st-text);
    border: 1px solid var(--st-hair-strong);
    border-radius: 3px;
    padding: 2px 4px;
    font-size: 0.7rem;
    cursor: pointer;
  }

  .ft-case-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .ft-input-group {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 0.7rem;
    color: var(--st-text-2);
  }

  .ft-input-group :global(input) {
    width: 55px;
    padding: 2px 4px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: 3px;
    color: var(--st-text);
    font-size: 0.7rem;
  }

  .ft-unit {
    font-size: 0.68rem;
    color: var(--st-text-2);
    white-space: nowrap;
  }

  .ft-dir-btn {
    min-width: 24px;
    font-size: 0.65rem;
    padding: 2px 4px;
  }

  .ft-coord-btn {
    min-width: 22px;
    font-size: 0.6rem;
    padding: 2px 5px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  /* Inline load/support editor */
  .ft-load-edit {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 4px 8px;
    border-top: 1px solid var(--st-hair-strong);
    background: var(--st-surface-2);
  }

  /* In the options bar it is part of the row, not a strip of its own. */
  .ft-load-edit.in-bar { border-top: none; background: transparent; padding: 0; justify-content: flex-start; }

  .ft-load-tag {
    font-size: 0.65rem;
    color: var(--st-value);
    font-weight: 600;
    white-space: nowrap;
  }

  .ft-load-delete {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    background: var(--st-accent);
    border: 1px solid var(--st-danger);
    border-radius: 3px;
    color: white;
    cursor: pointer;
    font-size: 0.65rem;
    white-space: nowrap;
  }

  .ft-load-delete:hover {
    background: var(--st-danger);
  }

  .ft-load-done {
    padding: 2px 6px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-interactive);
    border-radius: 3px;
    color: var(--st-value);
    cursor: pointer;
    font-size: 0.7rem;
  }

  .ft-load-done:hover {
    background: var(--st-accent);
    color: var(--st-text-on-accent);
  }

  @media (max-width: 767px) {
    .ft-opt-btn {
      white-space: nowrap;
      font-size: 0.6rem;
      padding: 4px 6px;
    }

    .ft-sup-btn {
      padding: 3px 5px;
      font-size: 0.6rem;
      min-height: 20px;
      min-width: 20px;
    }

    .ft-input-group :global(input) {
      width: 45px;
    }

    .ft-input-group {
      font-size: 0.65rem;
    }

    .ft-unit {
      font-size: 0.68rem;
    }

    .ft-load-edit {
      font-size: 0.6rem;
      overflow-x: auto;
      flex-wrap: nowrap;
      -webkit-overflow-scrolling: touch;
    }

    .ft-load-tag {
      white-space: nowrap;
    }

    .ft-dir-btn {
      padding: 3px 5px;
      font-size: 0.6rem;
    }

    .ft-coord-btn {
      font-size: 0.55rem;
      letter-spacing: 0;
      padding: 2px 3px;
      min-width: 18px;
    }
  }
</style>
