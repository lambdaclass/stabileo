<script lang="ts">
  import { selectRow, frameRow, focusRow, rowSelected } from '../../lib/actions/table-row-select';
  import { modelStore, uiStore, resultsStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  // Values are typed in the unit system chosen under Settings and kept in SI.
  import UnitInput from '../UnitInput.svelte';
  import { unitQ } from '../../lib/store/display-units.svelte';
  import type { SupportType } from '../../lib/store/model.svelte.ts';
  import { defaultDofs } from '../../lib/store/support-dofs';

  const supportsArr = $derived([...modelStore.supports.values()]);


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
</script>

<table>
  <thead>
    {#if uiStore.is3DWorkspace}
      <tr><th>ID</th><th>{t('table.nodeLabel')}</th><th>{t('table.dofRestrained')}</th><th>{t('table.stiffness')}</th><th></th></tr>
    {:else}
      <tr><th>ID</th><th>{t('table.nodeLabel')}</th><th>{t('table.type')}</th><th>{t('table.stiffness')}</th><th></th></tr>
    {/if}
  </thead>
  <tbody>
    {#each supportsArr as sup}
      <tr class:row-sel={rowSelected('support', sup.id)} onclick={(e) => selectRow(e, 'support', sup.id)}
        ondblclick={(e) => frameRow(e, 'support', sup.id)} onfocusin={(e) => focusRow(e, 'support', sup.id)}>
        <td class="id-cell">{sup.id}</td>
        <td>{sup.nodeId}</td>
        {#if uiStore.is3DWorkspace}
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
              <span class="load-field">kx<UnitInput value={sup.kx ?? 0} qty="springK" onchange={(v) => updateSupportSpring(sup.id, 'kx', String(v))} unit={false} /><span class="lf-unit">{unitQ('springK')}</span></span>
            {/if}
            {#if !dofs.ty}
              <span class="load-field">ky<UnitInput value={sup.ky ?? 0} qty="springK" onchange={(v) => updateSupportSpring(sup.id, 'ky', String(v))} unit={false} /><span class="lf-unit">{unitQ('springK')}</span></span>
            {/if}
            {#if !dofs.tz}
              <span class="load-field">kz<UnitInput value={sup.kz ?? 0} qty="springK" onchange={(v) => updateSupportSpring(sup.id, 'kz', String(v))} unit={false} /><span class="lf-unit">{unitQ('springK')}</span></span>
            {/if}
            {#if !dofs.rx}
              <span class="load-field">krx<UnitInput value={sup.krx ?? 0} qty="springKr" onchange={(v) => updateSupportSpring(sup.id, 'krx', String(v))} unit={false} /><span class="lf-unit">{unitQ('springKr')}</span></span>
            {/if}
            {#if !dofs.ry}
              <span class="load-field">kry<UnitInput value={sup.kry ?? 0} qty="springKr" onchange={(v) => updateSupportSpring(sup.id, 'kry', String(v))} unit={false} /><span class="lf-unit">{unitQ('springKr')}</span></span>
            {/if}
            {#if !dofs.rz}
              <span class="load-field">krz<UnitInput value={sup.krz ?? 0} qty="springKr" onchange={(v) => updateSupportSpring(sup.id, 'krz', String(v))} unit={false} /><span class="lf-unit">{unitQ('springKr')}</span></span>
            {/if}
          </td>
        {:else}
          <!-- 2D: type dropdown -->
          <td>
            <select value={sup.type} onchange={(e) => changeSupportType(sup.id, e.currentTarget.value)}>
              <option value="fixed">{t('table.fixed')}</option>
              <option value="pinned">{t('table.pinned')}</option>
              <option value="rollerX">{t('table.rollerX')}</option>
              <option value="rollerZ">{t('table.rollerY')}</option>
              <option value="spring">{t('table.spring')}</option>
            </select>
          </td>
          <td class="load-values">
            {#if sup.type === 'spring'}
              <span class="load-field">kx<UnitInput value={sup.kx ?? 0} qty="springK" onchange={(v) => updateSupportSpring(sup.id, 'kx', String(v))} unit={false} /><span class="lf-unit">{unitQ('springK')}</span></span>
              <span class="load-field">ky<UnitInput value={sup.ky ?? 0} qty="springK" onchange={(v) => updateSupportSpring(sup.id, 'ky', String(v))} unit={false} /><span class="lf-unit">{unitQ('springK')}</span></span>
              <span class="load-field">kz<UnitInput value={sup.kz ?? 0} qty="springKr" onchange={(v) => updateSupportSpring(sup.id, 'kz', String(v))} unit={false} /><span class="lf-unit">{unitQ('springKr')}</span></span>
            {:else}
              <span class="load-field">dx<UnitInput value={sup.dx ?? 0} qty="displacement" onchange={(v) => updateSupportSpring(sup.id, 'dx', String(v))} unit={false} /><span class="lf-unit">{unitQ('displacement')}</span></span>
              <span class="load-field">dz<UnitInput value={sup.dz ?? sup.dy ?? 0} qty="displacement" onchange={(v) => updateSupportSpring(sup.id, 'dy', String(v))} unit={false} /><span class="lf-unit">{unitQ('displacement')}</span></span>
              <span class="load-field">d&theta;y<UnitInput value={sup.dry ?? sup.drz ?? 0} qty="rotation" onchange={(v) => updateSupportSpring(sup.id, 'drz', String(v))} unit={false} /><span class="lf-unit">{unitQ('rotation')}</span></span>
            {/if}
          </td>
        {/if}
        <td><button class="del" onclick={() => deleteSupport(sup.id)}>&#10005;</button></td>
      </tr>
    {/each}
  </tbody>
</table>
<!-- Created with the tool above the drawing; the table lists and edits them. -->
{#if supportsArr.length === 0}
  <p class="empty-hint">{t('table.supportsEmpty')}</p>
{/if}

<style>
  .empty-hint { margin: 0.5rem; font-size: 0.74rem; color: var(--st-text-3); }
  tr.row-sel td { background: var(--st-selected-bg); }
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

  td :global(input[type="number"]) {
    width: 55px;
    padding: 0.1rem 0.2rem;
    background: var(--st-surface-3);
    border: 1px solid var(--st-surface-3);
    border-radius: 3px;
    color: var(--st-text);
    font-size: 0.7rem;
  }

  td select {
    padding: 0.1rem 0.2rem;
    background: var(--st-surface-3);
    border: 1px solid var(--st-surface-3);
    border-radius: 3px;
    color: var(--st-text);
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
    color: var(--st-text-3);
  }

  /* The unit each value is typed in, legible at a glance rather than a faint hint. */
  .lf-unit {
    margin-left: 2px;
    font-size: 0.68rem;
    color: var(--st-text-2);
    white-space: nowrap;
  }
  .load-field :global(input) {
    width: 50px;
  }

  .dof-chk {
    display: inline-flex;
    align-items: center;
    gap: 1px;
    font-size: 0.6rem;
    color: var(--st-text-2);
    cursor: pointer;
    white-space: nowrap;
  }
  .dof-chk input {
    accent-color: var(--st-accent);
    margin: 0;
    width: 12px;
    height: 12px;
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








</style>
