<script lang="ts">
  import { modelStore, uiStore } from '../../lib/store';
  import type { SupportType } from '../../lib/store/model.svelte';
  import { t } from '../../lib/i18n';

  const supportTypes = $derived([
    { value: 'fixed' as SupportType, label: t('pro.fixed') },
    { value: 'pinned' as SupportType, label: t('pro.pinned') },
    { value: 'rollerX' as SupportType, label: t('pro.rollerX') },
    { value: 'rollerY' as SupportType, label: t('pro.rollerY') },
    { value: 'spring' as SupportType, label: t('pro.spring') },
  ]);

  let newNodeId = $state('');
  let newType = $state<SupportType>('fixed');

  const supports = $derived([...modelStore.supports.values()]);

  function addSupport() {
    const nodeId = parseInt(newNodeId);
    if (isNaN(nodeId) || !modelStore.nodes.has(nodeId)) return;
    modelStore.addSupport(nodeId, newType);
    newNodeId = '';
  }

  function removeSupport(id: number) {
    modelStore.removeSupport(id);
  }

  function addFromSelection() {
    for (const nodeId of uiStore.selectedNodes) {
      if (!modelStore.nodes.has(nodeId)) continue;
      // Check if already has support
      const existing = [...modelStore.supports.values()].find(s => s.nodeId === nodeId);
      if (!existing) {
        modelStore.addSupport(nodeId, newType);
      }
    }
  }
</script>

<div class="pro-sup">
  <div class="pro-sup-header">
    <span class="pro-sup-count">{t('pro.nSupports').replace('{n}', String(supports.length))}</span>
  </div>

  <div class="pro-sup-form">
    <div class="pro-sup-row">
      <label>Nodo: <input type="text" bind:value={newNodeId} placeholder="ID" class="pro-input-sm" /></label>
      <label>Tipo:
        <select bind:value={newType} class="pro-select-sm">
          {#each supportTypes as st}
            <option value={st.value}>{st.label}</option>
          {/each}
        </select>
      </label>
      <button class="pro-btn" onclick={addSupport}>{t('pro.add')}</button>
    </div>
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
            <td>{supportTypes.find(st => st.value === s.type)?.label ?? s.type}</td>
            <td><button class="pro-delete-btn" onclick={() => removeSupport(s.id)}>×</button></td>
          </tr>
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
  .pro-delete-btn { background: none; border: none; color: #555; font-size: 1rem; cursor: pointer; padding: 0; }
  .pro-delete-btn:hover { color: #ff6b6b; }
</style>
