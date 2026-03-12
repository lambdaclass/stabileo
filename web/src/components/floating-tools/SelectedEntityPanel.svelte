<script lang="ts">
  import { uiStore, resultsStore, modelStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import type { NodalLoad, DistributedLoad, PointLoadOnElement, NodalLoad3D, DistributedLoad3D } from '../../lib/store/model.svelte.ts';

  function updateLoadField(loadId: number, field: string, val: string | boolean) {
    if (typeof val === 'boolean') {
      modelStore.updateLoad(loadId, { [field]: val });
    } else {
      const num = parseFloat(val);
      if (isNaN(num)) return;
      modelStore.updateLoad(loadId, { [field]: num });
    }
    resultsStore.clear();
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
    return type === 'rollerX' || type === 'rollerY' || type === 'rollerXZ' || type === 'rollerXY' || type === 'rollerYZ';
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
  <div class="ft-load-edit">
    <span class="ft-load-tag">{t('selEntity.editingLoad')}</span>
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
        <input type="number" step="1" value={nl.fx} onchange={(e) => updateLoadField(nl.id, 'fx', e.currentTarget.value)} />
        <span class="ft-unit">kN</span>
      </label>
      <label class="ft-input-group">
        <span>Fy:</span>
        <input type="number" step="1" value={nl.fy} onchange={(e) => updateLoadField(nl.id, 'fy', e.currentTarget.value)} />
        <span class="ft-unit">kN</span>
      </label>
      <label class="ft-input-group">
        <span>Mz:</span>
        <input type="number" step="1" value={nl.mz} onchange={(e) => updateLoadField(nl.id, 'mz', e.currentTarget.value)} />
        <span class="ft-unit">kN·m</span>
      </label>
    {:else if selectedLoad.type === 'distributed'}
      {@const dl = selectedLoad.data as DistributedLoad}
      {@const elemLen = modelStore.getElementLength(dl.elementId)}
      <label class="ft-input-group">
        <span>qI:</span>
        <input type="number" step="1" value={dl.qI} onchange={(e) => updateLoadField(dl.id, 'qI', e.currentTarget.value)} />
        <span class="ft-unit">kN/m</span>
      </label>
      <label class="ft-input-group">
        <span>qJ:</span>
        <input type="number" step="1" value={dl.qJ} onchange={(e) => updateLoadField(dl.id, 'qJ', e.currentTarget.value)} />
        <span class="ft-unit">kN/m</span>
      </label>
      <label class="ft-input-group">
        <span>a:</span>
        <input type="number" step="0.1" min="0" max={elemLen} value={(dl.a ?? 0).toFixed(2)} onchange={(e) => updateDistLoadPosition(dl.id, 'a', e.currentTarget.value, elemLen, dl.a ?? 0, dl.b ?? elemLen)} />
        <span class="ft-unit">m</span>
      </label>
      <label class="ft-input-group">
        <span>b:</span>
        <input type="number" step="0.1" min="0" max={elemLen} value={(dl.b ?? elemLen).toFixed(2)} onchange={(e) => updateDistLoadPosition(dl.id, 'b', e.currentTarget.value, elemLen, dl.a ?? 0, dl.b ?? elemLen)} />
        <span class="ft-unit">m</span>
      </label>
      <span class="ft-sep">|</span>
      <button class="ft-opt-btn ft-coord-btn" class:active={dl.isGlobal === true} onclick={() => updateLoadField(dl.id, 'isGlobal', true)} title={t('float.loadGlobalYDir')}>Y</button>
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
        <input type="number" step="0.1" min="0" max={elemLen} value={pl.a.toFixed(2)} onchange={(e) => updateLoadField(pl.id, 'a', e.currentTarget.value)} />
        <span class="ft-unit">m</span>
      </label>
      <label class="ft-input-group">
        <span>{pl.isGlobal ? 'Fy' : 'Fj'}:</span>
        <input type="number" step="1" value={pl.p} onchange={(e) => updateLoadField(pl.id, 'p', e.currentTarget.value)} />
        <span class="ft-unit">kN</span>
      </label>
      <label class="ft-input-group">
        <span>{pl.isGlobal ? 'Fx' : 'Fi'}:</span>
        <input type="number" step="1" value={pl.px ?? 0} onchange={(e) => updateLoadField(pl.id, 'px', e.currentTarget.value)} />
        <span class="ft-unit">kN</span>
      </label>
      <label class="ft-input-group">
        <span>Mz:</span>
        <input type="number" step="1" value={pl.mz ?? 0} onchange={(e) => updateLoadField(pl.id, 'mz', e.currentTarget.value)} />
        <span class="ft-unit">kN·m</span>
      </label>
      <span class="ft-sep">|</span>
      <button class="ft-opt-btn ft-coord-btn" class:active={pl.isGlobal === true} onclick={() => updateLoadField(pl.id, 'isGlobal', true)} title={t('float.loadGlobalYDir')}>Y</button>
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
        <input type="number" step="5" value={tl.dtUniform} onchange={(e) => updateLoadField(tl.id, 'dtUniform', e.currentTarget.value)} />
        <span class="ft-unit">°C</span>
      </label>
      <label class="ft-input-group">
        <span>ΔTg:</span>
        <input type="number" step="5" value={tl.dtGradient} onchange={(e) => updateLoadField(tl.id, 'dtGradient', e.currentTarget.value)} />
        <span class="ft-unit">°C</span>
      </label>
    {:else if selectedLoad.type === 'nodal3d'}
      {@const nl3 = selectedLoad.data as NodalLoad3D}
      <label class="ft-input-group"><span>Fx:</span><input type="number" step="1" value={nl3.fx} onchange={(e) => updateLoadField(nl3.id, 'fx', e.currentTarget.value)} /><span class="ft-unit">kN</span></label>
      <label class="ft-input-group"><span>Fy:</span><input type="number" step="1" value={nl3.fy} onchange={(e) => updateLoadField(nl3.id, 'fy', e.currentTarget.value)} /><span class="ft-unit">kN</span></label>
      <label class="ft-input-group"><span>Fz:</span><input type="number" step="1" value={nl3.fz} onchange={(e) => updateLoadField(nl3.id, 'fz', e.currentTarget.value)} /><span class="ft-unit">kN</span></label>
      <label class="ft-input-group"><span>Mx:</span><input type="number" step="1" value={nl3.mx} onchange={(e) => updateLoadField(nl3.id, 'mx', e.currentTarget.value)} /><span class="ft-unit">kN·m</span></label>
      <label class="ft-input-group"><span>My:</span><input type="number" step="1" value={nl3.my} onchange={(e) => updateLoadField(nl3.id, 'my', e.currentTarget.value)} /><span class="ft-unit">kN·m</span></label>
      <label class="ft-input-group"><span>Mz:</span><input type="number" step="1" value={nl3.mz} onchange={(e) => updateLoadField(nl3.id, 'mz', e.currentTarget.value)} /><span class="ft-unit">kN·m</span></label>
    {:else if selectedLoad.type === 'distributed3d'}
      {@const dl3 = selectedLoad.data as DistributedLoad3D}
      <label class="ft-input-group"><span>qYI:</span><input type="number" step="1" value={dl3.qYI} onchange={(e) => updateLoadField(dl3.id, 'qYI', e.currentTarget.value)} /><span class="ft-unit">kN/m</span></label>
      <label class="ft-input-group"><span>qYJ:</span><input type="number" step="1" value={dl3.qYJ} onchange={(e) => updateLoadField(dl3.id, 'qYJ', e.currentTarget.value)} /><span class="ft-unit">kN/m</span></label>
      <label class="ft-input-group"><span>qZI:</span><input type="number" step="1" value={dl3.qZI} onchange={(e) => updateLoadField(dl3.id, 'qZI', e.currentTarget.value)} /><span class="ft-unit">kN/m</span></label>
      <label class="ft-input-group"><span>qZJ:</span><input type="number" step="1" value={dl3.qZJ} onchange={(e) => updateLoadField(dl3.id, 'qZJ', e.currentTarget.value)} /><span class="ft-unit">kN/m</span></label>
    {/if}
    <button class="ft-load-delete" onclick={deleteSelectedLoads} title={t('selEntity.deleteLoad')}>🗑</button>
    <button class="ft-load-done" onclick={() => { uiStore.clearSelectedLoads(); uiStore.currentTool = 'load'; }} title={t('selEntity.deselectBack')}>✓</button>
  </div>
{:else if uiStore.selectedLoads.size > 1}
  <div class="ft-load-edit">
    <span class="ft-load-tag">{t('selEntity.loadsSelected').replace('{n}', String(uiStore.selectedLoads.size))}</span>
    <button class="ft-load-delete" onclick={deleteSelectedLoads} title={t('selEntity.deleteSelectedLoads')}>🗑 {t('selEntity.deleteBtn')}</button>
    <button class="ft-load-done" onclick={() => uiStore.clearSelectedLoads()} title={t('selEntity.deselect')}>✓</button>
  </div>
{/if}

{#if selectedSup}
  <div class="ft-load-edit">
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
        <label class="ft-input-group"><span>kx:</span><input type="number" step="100" value={selectedSup.kx ?? 0} onchange={(e) => updateSupportField(selectedSup.id, 'kx', e.currentTarget.value)} /></label>
      {/if}
      {#if !dofs.ty}
        <label class="ft-input-group"><span>ky:</span><input type="number" step="100" value={selectedSup.ky ?? 0} onchange={(e) => updateSupportField(selectedSup.id, 'ky', e.currentTarget.value)} /></label>
      {/if}
      {#if !dofs.tz}
        <label class="ft-input-group"><span>kz:</span><input type="number" step="100" value={selectedSup.kz ?? 0} onchange={(e) => updateSupportField(selectedSup.id, 'kz', e.currentTarget.value)} /></label>
      {/if}
      {#if !dofs.rx}
        <label class="ft-input-group"><span>krx:</span><input type="number" step="100" value={selectedSup.krx ?? 0} onchange={(e) => updateSupportField(selectedSup.id, 'krx', e.currentTarget.value)} /></label>
      {/if}
      {#if !dofs.ry}
        <label class="ft-input-group"><span>kry:</span><input type="number" step="100" value={selectedSup.kry ?? 0} onchange={(e) => updateSupportField(selectedSup.id, 'kry', e.currentTarget.value)} /></label>
      {/if}
      {#if !dofs.rz}
        <label class="ft-input-group"><span>krz:</span><input type="number" step="100" value={selectedSup.krz ?? 0} onchange={(e) => updateSupportField(selectedSup.id, 'krz', e.currentTarget.value)} /></label>
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
      <button class="ft-opt-btn ft-dir-btn" class:active={selectedSup.type === 'rollerY'}
        onclick={() => changeSupportType(selectedSup.id, 'rollerY')}
        title={selectedSup.isGlobal !== false ? t('float.rollerRestrictsXGlobal') : t('float.rollerRestrictsILocal')}
      >{selectedSup.isGlobal !== false ? 'Y' : 'j'}</button>
      <span class="ft-sep">|</span>
      <button class="ft-opt-btn ft-coord-btn" class:active={selectedSup.isGlobal !== false} onclick={() => updateSupportField(selectedSup.id, 'isGlobal', true)}
        title={t('float.rollerGlobalLabel')}>Gl</button>
      <button class="ft-opt-btn ft-coord-btn" class:active={selectedSup.isGlobal === false} onclick={() => updateSupportField(selectedSup.id, 'isGlobal', false)}
        title={t('float.rollerLocalLabel')}>Loc</button>
      <label class="ft-input-group" title={t('float.prescribedRollerDisp')}>
        <span>di:</span>
        <input type="number" step="0.001" value={selectedSup.dx ?? 0} onchange={(e) => updateSupportField(selectedSup.id, 'dx', e.currentTarget.value)} />
        <span class="ft-unit">m</span>
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
        <input type="number" step="100" value={selectedSup.kx ?? 0} onchange={(e) => updateSupportField(selectedSup.id, 'kx', e.currentTarget.value)} />
      </label>
      <label class="ft-input-group">
        <span>ky:</span>
        <input type="number" step="100" value={selectedSup.ky ?? 0} onchange={(e) => updateSupportField(selectedSup.id, 'ky', e.currentTarget.value)} />
      </label>
      <label class="ft-input-group">
        <span>kθ:</span>
        <input type="number" step="100" value={selectedSup.kz ?? 0} onchange={(e) => updateSupportField(selectedSup.id, 'kz', e.currentTarget.value)} />
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
          <input type="number" step="0.001" value={selectedSup.dx ?? 0} onchange={(e) => updateSupportField(selectedSup.id, 'dx', e.currentTarget.value)} />
        </label>
        <label class="ft-input-group" title={t('float.prescribedDy')}>
          <span>dy:</span>
          <input type="number" step="0.001" value={selectedSup.dy ?? 0} onchange={(e) => updateSupportField(selectedSup.id, 'dy', e.currentTarget.value)} />
        </label>
      {/if}
      {#if selectedSup.type === 'fixed'}
        <label class="ft-input-group" title={t('float.prescribedDrz')}>
          <span>dθz:</span>
          <input type="number" step="0.001" value={selectedSup.drz ?? 0} onchange={(e) => updateSupportField(selectedSup.id, 'drz', e.currentTarget.value)} />
        </label>
      {/if}
      <label class="ft-input-group" title={t('float.supportAngleVisual')}>
        <span>α:</span>
        <input type="number" step="5" value={selectedSup.angle ?? 0} onchange={(e) => updateSupportField(selectedSup.id, 'angle', e.currentTarget.value)} />
        <span class="ft-unit">°</span>
      </label>
    {/if}
    <button class="ft-load-delete" onclick={deleteSelectedSupports} title={t('selEntity.deleteSupport')}>🗑</button>
    <button class="ft-load-done" onclick={() => uiStore.clearSelectedSupports()} title={t('selEntity.deselect')}>✓</button>
  </div>
{:else if uiStore.selectedSupports.size > 1}
  <div class="ft-load-edit">
    <span class="ft-load-tag">{t('selEntity.supportsSelected').replace('{n}', String(uiStore.selectedSupports.size))}</span>
    <button class="ft-load-delete" onclick={deleteSelectedSupports} title={t('selEntity.deleteSelectedSupports')}>🗑 {t('selEntity.deleteBtn')}</button>
    <button class="ft-load-done" onclick={() => uiStore.clearSelectedSupports()} title={t('selEntity.deselect')}>✓</button>
  </div>
{/if}

<style>
  .ft-opt-btn {
    padding: 2px 8px;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    color: #aaa;
    cursor: pointer;
    font-size: 0.7rem;
    transition: all 0.15s;
    white-space: nowrap;
  }

  .ft-opt-btn:hover:not(:disabled) {
    background: #1a4a7a;
    color: #ddd;
  }

  .ft-opt-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
    color: #555;
    background: #0a1a30;
    border-color: #1a3050;
  }

  .ft-opt-btn.active {
    background: #e94560;
    border-color: #ff6b6b;
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
    color: #bbb;
    cursor: pointer;
    white-space: nowrap;
  }
  .ft-chk input {
    accent-color: #e94560;
    margin: 0;
    width: 13px;
    height: 13px;
  }
  .ft-chk span {
    font-size: 0.65rem;
  }

  .ft-sep {
    color: #444;
    font-size: 0.8rem;
    margin: 0 2px;
  }

  .ft-case-select {
    background: #0f3460;
    color: #eee;
    border: 1px solid #1a4a7a;
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
    color: #aaa;
  }

  .ft-input-group input {
    width: 55px;
    padding: 2px 4px;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 3px;
    color: #eee;
    font-size: 0.7rem;
  }

  .ft-unit {
    font-size: 0.6rem;
    color: #666;
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
    border-top: 1px solid rgba(78, 205, 196, 0.3);
    background: rgba(78, 205, 196, 0.06);
  }

  .ft-load-tag {
    font-size: 0.65rem;
    color: #4ecdc4;
    font-weight: 600;
    white-space: nowrap;
  }

  .ft-load-delete {
    padding: 2px 6px;
    background: #e94560;
    border: 1px solid #ff6b6b;
    border-radius: 3px;
    color: white;
    cursor: pointer;
    font-size: 0.65rem;
    white-space: nowrap;
  }

  .ft-load-delete:hover {
    background: #ff6b6b;
  }

  .ft-load-done {
    padding: 2px 6px;
    background: #0f3460;
    border: 1px solid #4ecdc4;
    border-radius: 3px;
    color: #4ecdc4;
    cursor: pointer;
    font-size: 0.7rem;
  }

  .ft-load-done:hover {
    background: #4ecdc4;
    color: #0a1628;
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

    .ft-input-group input {
      width: 45px;
    }

    .ft-input-group {
      font-size: 0.65rem;
    }

    .ft-unit {
      font-size: 0.6rem;
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
