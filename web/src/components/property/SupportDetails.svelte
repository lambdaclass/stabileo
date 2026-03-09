<script lang="ts">
  import { modelStore, uiStore, resultsStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import type { SupportType } from '../../lib/store/model.svelte.ts';

  let { supId, sup }: { supId: number; sup: any } = $props();

  function changeSupportType(id: number, val: string) {
    modelStore.updateSupport(id, { type: val as SupportType });
  }

  function updateSpringField(id: number, field: string, val: string) {
    if (field === 'isGlobal') {
      modelStore.updateSupport(id, { isGlobal: val === '1' || val === 'true' } as any);
      return;
    }
    const num = parseFloat(val);
    if (isNaN(num)) return;
    modelStore.updateSupport(id, { [field]: num } as any);
  }

  function removeSupport(id: number) {
    modelStore.removeSupport(id);
  }

  function toggleDofRestraint(id: number, s: any, dof: 'tx' | 'ty' | 'tz' | 'rx' | 'ry' | 'rz') {
    const current = s.dofRestraints ?? { tx: true, ty: true, tz: true, rx: true, ry: true, rz: true };
    const updated = { ...current, [dof]: !current[dof] };
    // Determine new type based on DOF config
    const allFixed = updated.tx && updated.ty && updated.tz && updated.rx && updated.ry && updated.rz;
    const onlyTrans = updated.tx && updated.ty && updated.tz && !updated.rx && !updated.ry && !updated.rz;
    const noneFixed = !updated.tx && !updated.ty && !updated.tz && !updated.rx && !updated.ry && !updated.rz;
    const type = allFixed ? 'fixed3d' : onlyTrans ? 'pinned3d' : noneFixed ? 'spring3d' : 'custom3d';
    modelStore.updateSupport(id, { dofRestraints: updated, type } as any);
    resultsStore.clear();
    resultsStore.clear3D();
  }
</script>

<h4>{t('prop.support')}</h4>
{#if uiStore.analysisMode === '3d'}
  <!-- 3D per-DOF editing -->
  {@const dofs = sup.dofRestraints ?? { tx: true, ty: true, tz: true, rx: true, ry: true, rz: true }}
  <div class="property-row" style="flex-wrap:wrap;gap:4px;">
    <label style="font-size:0.7rem;display:inline-flex;align-items:center;gap:2px;cursor:pointer;">
      <input type="checkbox" checked={dofs.tx} onchange={() => toggleDofRestraint(supId, sup, 'tx')} /> Fx
    </label>
    <label style="font-size:0.7rem;display:inline-flex;align-items:center;gap:2px;cursor:pointer;">
      <input type="checkbox" checked={dofs.ty} onchange={() => toggleDofRestraint(supId, sup, 'ty')} /> Fy
    </label>
    <label style="font-size:0.7rem;display:inline-flex;align-items:center;gap:2px;cursor:pointer;">
      <input type="checkbox" checked={dofs.tz} onchange={() => toggleDofRestraint(supId, sup, 'tz')} /> Fz
    </label>
    <label style="font-size:0.7rem;display:inline-flex;align-items:center;gap:2px;cursor:pointer;">
      <input type="checkbox" checked={dofs.rx} onchange={() => toggleDofRestraint(supId, sup, 'rx')} /> Mx
    </label>
    <label style="font-size:0.7rem;display:inline-flex;align-items:center;gap:2px;cursor:pointer;">
      <input type="checkbox" checked={dofs.ry} onchange={() => toggleDofRestraint(supId, sup, 'ry')} /> My
    </label>
    <label style="font-size:0.7rem;display:inline-flex;align-items:center;gap:2px;cursor:pointer;">
      <input type="checkbox" checked={dofs.rz} onchange={() => toggleDofRestraint(supId, sup, 'rz')} /> Mz
    </label>
  </div>
  <!-- Spring stiffnesses for unchecked DOFs -->
  {#if !dofs.tx}
    <div class="property-row"><span>kx:</span><input type="number" step="100" value={sup.kx ?? 0} class="prop-input" onchange={(e) => updateSpringField(supId, 'kx', e.currentTarget.value)} /><span>kN/m</span></div>
  {/if}
  {#if !dofs.ty}
    <div class="property-row"><span>ky:</span><input type="number" step="100" value={sup.ky ?? 0} class="prop-input" onchange={(e) => updateSpringField(supId, 'ky', e.currentTarget.value)} /><span>kN/m</span></div>
  {/if}
  {#if !dofs.tz}
    <div class="property-row"><span>kz:</span><input type="number" step="100" value={sup.kz ?? 0} class="prop-input" onchange={(e) => updateSpringField(supId, 'kz', e.currentTarget.value)} /><span>kN/m</span></div>
  {/if}
  {#if !dofs.rx}
    <div class="property-row"><span>krx:</span><input type="number" step="100" value={sup.krx ?? 0} class="prop-input" onchange={(e) => updateSpringField(supId, 'krx', e.currentTarget.value)} /><span>kN·m/rad</span></div>
  {/if}
  {#if !dofs.ry}
    <div class="property-row"><span>kry:</span><input type="number" step="100" value={sup.kry ?? 0} class="prop-input" onchange={(e) => updateSpringField(supId, 'kry', e.currentTarget.value)} /><span>kN·m/rad</span></div>
  {/if}
  {#if !dofs.rz}
    <div class="property-row"><span>krz:</span><input type="number" step="100" value={sup.krz ?? 0} class="prop-input" onchange={(e) => updateSpringField(supId, 'krz', e.currentTarget.value)} /><span>kN·m/rad</span></div>
  {/if}
{:else}
  <!-- 2D support editing -->
  <div class="property-row">
    <span>{t('prop.type')}:</span>
    <select value={sup.type === 'rollerX' || sup.type === 'rollerY' ? 'roller' : sup.type}
      onchange={(e) => {
        const val = e.currentTarget.value;
        if (val === 'roller') {
          changeSupportType(supId, 'rollerX');
        } else {
          changeSupportType(supId, val);
        }
      }}>
      <option value="fixed">{t('table.fixed')}</option>
      <option value="pinned">{t('table.pinned')}</option>
      <option value="roller">{t('prop.roller')}</option>
      <option value="spring">{t('table.spring')}</option>
    </select>
  </div>
  {#if sup.type === 'rollerX' || sup.type === 'rollerY'}
    <div class="property-row">
      <span>{t('prop.direction')}:</span>
      <button class="btn-small" class:active={sup.type === 'rollerX'} onclick={() => changeSupportType(supId, 'rollerX')}
      >{sup.isGlobal !== false ? 'X' : 'i'}</button>
      <button class="btn-small" class:active={sup.type === 'rollerY'} onclick={() => changeSupportType(supId, 'rollerY')}
      >{sup.isGlobal !== false ? 'Y' : 'j'}</button>
    </div>
    <div class="property-row">
      <span>{t('prop.axes')}:</span>
      <button class="btn-small" class:active={sup.isGlobal !== false} onclick={() => updateSpringField(supId, 'isGlobal', '1')}
      >Gl</button>
      <button class="btn-small" class:active={sup.isGlobal === false} onclick={() => updateSpringField(supId, 'isGlobal', '0')}
      >Loc</button>
    </div>
    <div class="property-row" title={t('prop.imposedDispRollerTitle')}>
      <span>di:</span>
      <input type="number" step="0.001" value={sup.dx ?? 0} class="prop-input" onchange={(e) => updateSpringField(supId, 'dx', e.currentTarget.value)} />
      <span>m</span>
    </div>
    <div class="property-row">
      <span>α:</span>
      <input type="number" step="5" value={sup.angle ?? 0} class="prop-input" onchange={(e) => updateSpringField(supId, 'angle', e.currentTarget.value)} />
      <span>°</span>
    </div>
  {:else if sup.type === 'spring'}
    <div class="property-row">
      <span>kx:</span>
      <input type="number" step="100" value={sup.kx ?? 0} class="prop-input" onchange={(e) => updateSpringField(supId, 'kx', e.currentTarget.value)} />
      <span>kN/m</span>
    </div>
    <div class="property-row">
      <span>ky:</span>
      <input type="number" step="100" value={sup.ky ?? 0} class="prop-input" onchange={(e) => updateSpringField(supId, 'ky', e.currentTarget.value)} />
      <span>kN/m</span>
    </div>
    <div class="property-row">
      <span>kz:</span>
      <input type="number" step="100" value={sup.kz ?? 0} class="prop-input" onchange={(e) => updateSpringField(supId, 'kz', e.currentTarget.value)} />
      <span>kN·m/rad</span>
    </div>
    <div class="property-row">
      <span>{t('prop.axes')}:</span>
      <button class="btn-small" class:active={sup.isGlobal !== false} onclick={() => updateSpringField(supId, 'isGlobal', '1')}
        title={t('prop.globalAxesTitle')}>Gl</button>
      <button class="btn-small" class:active={sup.isGlobal === false} onclick={() => updateSpringField(supId, 'isGlobal', '0')}
        title={t('prop.localAxesTitle')}>Loc</button>
    </div>
    <div class="property-row">
      <span>α:</span>
      <input type="number" step="5" value={sup.angle ?? 0} class="prop-input" onchange={(e) => updateSpringField(supId, 'angle', e.currentTarget.value)} />
      <span>°</span>
    </div>
  {:else}
    <h4>{t('prop.imposedDisp')}</h4>
    {#if sup.type === 'fixed' || sup.type === 'pinned'}
      <div class="property-row" title={t('prop.imposedDxTitle')}>
        <span>dx:</span>
        <input type="number" step="0.001" value={sup.dx ?? 0} class="prop-input" onchange={(e) => updateSpringField(supId, 'dx', e.currentTarget.value)} />
        <span>m</span>
      </div>
      <div class="property-row" title={t('prop.imposedDyTitle')}>
        <span>dy:</span>
        <input type="number" step="0.001" value={sup.dy ?? 0} class="prop-input" onchange={(e) => updateSpringField(supId, 'dy', e.currentTarget.value)} />
        <span>m</span>
      </div>
    {/if}
    {#if sup.type === 'fixed'}
      <div class="property-row" title={t('prop.imposedDrzTitle')}>
        <span>dθz:</span>
        <input type="number" step="0.001" value={sup.drz ?? 0} class="prop-input" onchange={(e) => updateSpringField(supId, 'drz', e.currentTarget.value)} />
        <span>rad</span>
      </div>
    {/if}
    <div class="property-row" title={t('prop.visualAngleTitle')}>
      <span>α:</span>
      <input type="number" step="5" value={sup.angle ?? 0} class="prop-input" onchange={(e) => updateSpringField(supId, 'angle', e.currentTarget.value)} />
      <span>°</span>
    </div>
  {/if}
{/if}
<button class="btn-small btn-secondary" onclick={() => removeSupport(supId)}>
  {t('prop.removeSupport')}
</button>

<style>
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

  .prop-input {
    width: 65px;
    padding: 0.2rem 0.3rem;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 3px;
    color: #eee;
    font-size: 0.8rem;
  }

  select {
    padding: 0.5rem;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    color: #eee;
    font-size: 0.875rem;
  }

  .btn-small {
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    margin-top: 0.5rem;
  }

  .btn-secondary {
    background: #0f3460;
    color: #aaa;
  }

  .btn-secondary:hover {
    background: #1a4a7a;
    color: white;
  }

  input[type="checkbox"] {
    accent-color: #e94560;
  }
</style>
