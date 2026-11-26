<script lang="ts">
  /**
   * The storey being modelled: what is drawn on the plan goes to it, its columns and walls from its
   * level to the next one, its beams and slabs at that next one. Its template is the plan laid on its
   * level. The working level is the storey's floor, so the plan view and this list agree.
   */
  import Hint from '../Hint.svelte';
  import { modelStore, uiStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import { sortedLevels } from '../../../lib/model/grid';
  import { storeyLabel } from '../../../lib/model/storeys';
  import { buildingUi } from '../../../lib/store/building-ui.svelte';
  import { underlayLevelFor } from '../../../lib/model/osnap';

  const levels = $derived(sortedLevels(modelStore.grid ?? undefined));
  const current = $derived(levels.find((l) => Math.abs(l.z - uiStore.nodeCreateZ) < 1e-6));
  $effect(() => { if (!current && levels[0]) uiStore.setActiveLevel(levels[0].z); });
  const template = $derived(current ? modelStore.underlays.find((u) => u.levelId === current.id || Math.abs(u.z - current.z) < 1e-6) : undefined);
  /** With none of its own, the storey draws over the nearest one below, as the snaps do. */
  const borrowed = $derived.by(() => {
    if (!current || template) return undefined;
    const z = underlayLevelFor(modelStore.underlays, current.z);
    const u = z === null ? undefined : modelStore.underlays.find((x) => Math.abs(x.z - z) < 1e-6);
    const l = u && levels.find((x) => Math.abs(x.z - u.z) < 1e-6);
    return u ? { name: u.name, level: l?.name ?? `${u.z.toFixed(2)} m` } : undefined;
  });
</script>

<section class="pk-card st" data-testid="building-storey">
  <div class="st-row">
    <label class="st-field">{t('building.storey')}
      <select value={current?.id ?? ''} onchange={(e) => { const l = levels.find((x) => x.id === e.currentTarget.value); if (l) uiStore.setActiveLevel(l.z); }} data-testid="building-storey-select">
        {#each [...levels].reverse() as l (l.id)}<option value={l.id}>{storeyLabel(levels, l)}</option>{/each}
      </select>
    </label>
    {#if template}
      <span class="st-tpl" data-testid="building-storey-template">{tp('building.storeyTemplate', { name: template.name })}</span>
    {:else}
      <span class="st-tpl st-none" data-testid="building-storey-borrowed">{borrowed ? tp('building.storeyBorrowed', borrowed) : t('building.storeyNoTemplate')}</span>
      <button class="pk-btn" onclick={() => (buildingUi.tool = 'levels')} data-testid="building-storey-add-template">{t('building.storeyAddTemplate')}</button>
    {/if}
  </div>
  <Hint text={t('building.storeyHint')} />
</section>

<style>
  .st-row { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 6px 12px; }
  .st-field { display: flex; flex-direction: column; gap: 2px; font-size: 0.7rem; color: var(--st-text-2); }
  .st-field select { font-size: 0.74rem; min-width: 12rem; }
  .st-tpl { font-size: 0.7rem; color: var(--st-text-2); padding-bottom: 3px; }
  .st-none { color: var(--st-text-3); }
</style>
