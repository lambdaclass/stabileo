<script lang="ts">
  import PickKind from './PickKind.svelte';
  import { modelStore, uiStore } from '../../lib/store';
  import type { SupportType } from '../../lib/store/model.svelte';
  import { t } from '../../lib/i18n';
  import DrawInModelButton from './DrawInModelButton.svelte';
  import { supportTypeOptions } from '../../lib/pro/support-types';

  const is3D = $derived(uiStore.analysisMode === '3d' || uiStore.analysisMode === 'pro');

  const supportTypes = $derived(supportTypeOptions(is3D, t));

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

  /** What a support adds to its type: it lifts off, it has springs or curves, it is inclined. */
  function supportTags(s: { uplift?: boolean; isInclined?: boolean; curves?: unknown; kx?: number; ky?: number; kz?: number; krx?: number; kry?: number; krz?: number }): string[] {
    const tags: string[] = [];
    if (s.uplift) tags.push(t('support.uplift'));
    if (s.curves) tags.push(t('spec.list.curves'));
    else if (['kx', 'ky', 'kz', 'krx', 'kry', 'krz'].some((k) => ((s as Record<string, number | undefined>)[k] ?? 0) > 0)) tags.push(t('spec.list.springs'));
    if (s.isInclined) tags.push(t('spec.list.inclined'));
    return tags;
  }
  function openSpec(id: number) {
    uiStore.specSection = 'supports';
    uiStore.proActiveTab = 'specifications';
    uiStore.clearSelection();
    uiStore.selectSupport(id, true);
  }
</script>

<div class="pro-sup">
  <!-- The one place a drawing mode is entered; see `DrawInModelButton`. -->

  <div class="pro-sup-header">
    <DrawInModelButton tool="support" label={t('pro.oneSupport')} icon="support" testid="draw-support" />
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
        <span class="dof-section-label">{t('pro.dofTranslation')}</span>
        <label class="dof-check"><input type="checkbox" bind:checked={dofTx} /> ux</label>
        <label class="dof-check"><input type="checkbox" bind:checked={dofTy} /> uy</label>
        <label class="dof-check"><input type="checkbox" bind:checked={dofTz} /> uz</label>
        <span class="dof-section-label">{t('pro.dofRotation')}</span>
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
    {:else}
      <PickKind kind="nodes" />
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
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each supports as s}
          <tr class:selected={uiStore.selectedSupports.has(s.id)} onclick={() => { uiStore.selectMode = 'supports'; uiStore.selectSupport(s.id, false); }}>
            <td class="col-id">{s.id}</td>
            <td class="col-num">{s.nodeId}</td>
            <!-- What the support is, read here; edited in its one place, Specifications › Supports. -->
            <td class="sup-kind">{supportTypes.find((st) => st.value === s.type)?.label ?? s.type}{#each supportTags(s) as tag (tag)}<span class="sup-tag">{tag}</span>{/each}</td>
            <td><button class="pro-edit-btn" title={t('spec.supports.open')} aria-label={t('spec.supports.open')}
                  onclick={(e) => { e.stopPropagation(); openSpec(s.id); }} data-testid="sup-spec-{s.id}">✎</button></td>
            <td><button class="pro-delete-btn" onclick={() => removeSupport(s.id)}>×</button></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .sup-kind { white-space: nowrap; }
  .sup-tag { margin-left: 4px; padding: 0 4px; border: 1px solid var(--st-hair); border-radius: 3px; font-size: 0.58rem; color: var(--st-text-3); }
  .pro-edit-btn { background: none; border: none; color: var(--st-text-3); cursor: pointer; font-size: 0.72rem; }
  .pro-edit-btn:hover { color: var(--st-accent); }


  .pro-sup { display: flex; flex-direction: column; height: 100%; }

  .pro-sup-header {
    padding: 8px 10px;
    border-bottom: 1px solid var(--st-surface-3);
  }

  .pro-sup-count { font-size: 0.82rem; color: var(--st-value); font-weight: 600; }

  .pro-sup-form {
    padding: 10px 12px;
    border-bottom: 1px solid var(--st-surface-3);
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
    color: var(--st-text-3);
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .pro-input-sm {
    width: 55px;
    padding: 4px 6px;
    background: var(--st-surface-3);
    border: 1px solid var(--st-surface-3);
    border-radius: 3px;
    color: var(--st-text);
    font-size: 0.78rem;
    font-family: monospace;
  }

  .pro-input-sm:focus { border-color: var(--st-surface-3); outline: none; }

  .pro-select-sm {
    padding: 4px 6px;
    background: var(--st-surface-3);
    border: 1px solid var(--st-surface-3);
    border-radius: 3px;
    color: var(--st-text-2);
    font-size: 0.75rem;
    cursor: pointer;
  }

  .pro-btn {
    padding: 5px 12px;
    font-size: 0.75rem;
    color: var(--st-text-2);
    background: var(--st-surface-3);
    border: 1px solid var(--st-surface-3);
    border-radius: 4px;
    cursor: pointer;
  }

  .pro-btn:hover { background: var(--st-surface-3); color: var(--st-text); }

  .pro-btn-selection {
    font-size: 0.72rem;
    color: var(--st-text-2);
    border-color: var(--st-hair-strong);
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
    color: var(--st-text-3);
    text-transform: uppercase;
    font-weight: 600;
    width: 100%;
  }
  .dof-check {
    font-size: 0.75rem;
    color: var(--st-text-2);
    display: flex;
    align-items: center;
    gap: 3px;
    cursor: pointer;
  }
  .dof-check input { accent-color: var(--st-text-2); }

  .spring-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .spring-field {
    font-size: 0.72rem;
    color: var(--st-text-2);
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
    color: var(--st-text-3); text-transform: uppercase; background: var(--st-surface); border-bottom: 1px solid var(--st-surface-3);
  }
  .pro-sup-table td { padding: 5px 8px; border-bottom: 1px solid var(--st-surface-2); color: var(--st-text-2); }
  .pro-sup-table tbody tr { cursor: pointer; transition: background 0.1s; }
  .pro-sup-table tbody tr:hover { background: rgba(127, 212, 204, 0.08); }
  .pro-sup-table tbody tr.selected { background: rgba(127, 212, 204, 0.18); box-shadow: inset 3px 0 0 var(--st-value); }
  .col-id { width: 34px; color: var(--st-text-3); font-family: monospace; text-align: center; }
  .col-num { font-family: monospace; }
  .pro-select-inline {
    padding: 2px 4px; background: var(--st-surface-3); border: 1px solid transparent; border-radius: 3px;
    color: var(--st-text-2); font-size: 0.72rem; cursor: pointer; width: 100%;
  }
  .pro-select-inline:hover { border-color: var(--st-surface-3); }
  .pro-select-inline:focus { border-color: var(--st-text-2); outline: none; }
  .pro-delete-btn { background: none; border:  none; color: var(--st-text-3); font-size: 1rem; cursor: pointer; padding: 0; }
  .pro-delete-btn:hover { color: var(--st-danger); }
</style>
