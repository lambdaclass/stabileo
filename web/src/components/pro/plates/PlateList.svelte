<script lang="ts">
  /**
   * The model's physical plates and the state of each one's mesh, one line each. A click selects
   * the plate whole; the ones that need a mesh can be meshed together from here.
   */
  import { modelStore, uiStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import { physicalPlates, plateStatus, platesNeedingMesh } from '../../../lib/store/physical-plates';
  import PlateMeshDialog from './PlateMeshDialog.svelte';

  const rows = $derived.by(() => {
    void modelStore.modelVersion; void modelStore.model.groups;
    return physicalPlates().map((p) => ({ id: p.id, name: p.name, status: plateStatus(p.id), cells: p.surface.meshed?.cells ?? 0 }));
  });
  const pending = $derived.by(() => { void rows; return platesNeedingMesh(); });
  let open = $state(false);
  let meshIds = $state<number[]>([]);
</script>

{#if rows.length}
  <section class="pl" data-testid="plate-list">
    <header class="pl-head">
      <span>{tp('plates.listTitle', { n: rows.length })}</span>
      <label class="pl-mesh" title={t('plates.showMeshHint')}><input type="checkbox" checked={uiStore.platesShowMesh} onchange={(e) => (uiStore.platesShowMesh = e.currentTarget.checked)} data-testid="plates-show-mesh" /> {t('plates.showMesh')}</label>
      {#if pending.length}
        <button class="pl-btn" onclick={() => { meshIds = pending; open = true; }} data-testid="plate-list-mesh-pending">{tp('plates.meshPending', { n: pending.length })}</button>
      {/if}
    </header>
    <ul>
      {#each rows as r (r.id)}
        <li>
          <button class="pl-row" class:sel={uiStore.selectedPlates.has(r.id)} onclick={(e) => { uiStore.selectMode = 'shells'; uiStore.selectPlates([r.id], e.shiftKey); }} data-testid="plate-row-{r.id}">
            <span class="pl-name">{r.name}</span>
            <span class="chip chip-{r.status}">{t(`plates.status.${r.status}`)}</span>
            {#if r.cells}<span class="pl-dim">{tp('plates.nElements', { n: r.cells })}</span>{/if}
          </button>
        </li>
      {/each}
    </ul>
  </section>
  {#if open}<PlateMeshDialog ids={meshIds} onclose={() => (open = false)} />{/if}
{/if}

<style>
  .pl { margin: 0 8px 10px; font-size: 0.73rem; color: var(--st-text-2); }
  .pl-head { display: flex; justify-content: space-between; align-items: center; gap: 6px; padding: 4px 0; font-weight: 600; }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; max-height: 180px; overflow: auto; }
  .pl-row { width: 100%; display: flex; gap: 6px; align-items: center; padding: 3px 6px; background: none; border: 1px solid transparent; border-radius: var(--st-radius); color: inherit; font: inherit; cursor: pointer; text-align: left; }
  .pl-row:hover { border-color: var(--st-hair-strong); }
  .pl-row.sel { border-color: var(--st-accent); }
  .pl-name { min-width: 38px; color: var(--st-text); }
  .pl-dim { color: var(--st-text-3); }
  .pl-mesh { font-weight: 400; display: inline-flex; gap: 4px; align-items: center; margin-left: auto; }
  .pl-btn { padding: 2px 8px; background: var(--st-surface-3); color: var(--st-text-2); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); font: inherit; cursor: pointer; font-weight: 400; }
  .chip { padding: 0 6px; border-radius: 9px; font-size: 0.66rem; border: 1px solid var(--st-hair-strong); }
  .chip-current { color: var(--st-ok, #5cb85c); border-color: currentColor; }
  .chip-stale { color: var(--st-warn, #d9a441); border-color: currentColor; }
  .chip-unmeshed { color: var(--st-text-3); }
  .chip-invalid { color: var(--st-danger, #e06c6c); border-color: currentColor; }
</style>
