<script lang="ts">
  /**
   * The concrete of each kind of element, by level. It changes the analysis model (the members'
   * material), so it stays available with design off; the design data panel shows it too.
   */
  import { modelStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import { DESIGN_KINDS, type DesignKind } from '../../lib/model/design-data';
  import { assignConcrete } from '../../lib/model/building/assign-concrete';
  import { materialFamilyOf } from '../../lib/engine/steel/material-family';
  import { catalogueGradeFamily } from '../../lib/engine/steel/grade-family';

  const concretes = $derived([...modelStore.materials.values()].filter((m) => materialFamilyOf(m, catalogueGradeFamily).family === 'concrete'));
  const levels = $derived(modelStore.grid?.levels ?? []);
  let ckind = $state<DesignKind>('column'), cmat = $state(0), clevel = $state('');
  $effect(() => { if (!concretes.some((m) => m.id === cmat) && concretes[0]) cmat = concretes[0].id; });
  let assigned = $state<number | null>(null);
  function assign() { if (ckind !== 'footing') assigned = assignConcrete(ckind, cmat, clevel || undefined); }
</script>

<section class="pk-card" data-testid="design-data-concrete">
  <h5 class="cl-h">{t('designData.concrete')}</h5>
  <p class="pk-hint cl-hint">{t('designData.concreteHint')}</p>
  {#if concretes.length === 0}<p class="pk-hint cl-hint">{t('designData.noConcrete')}</p>{:else}
    <div class="cl-row">
      <select bind:value={ckind} aria-label={t('physical.kindCol')}>{#each DESIGN_KINDS.filter((k) => k !== 'footing') as k}<option value={k}>{t(`designData.kind.${k}`)}</option>{/each}</select>
      <select bind:value={clevel} aria-label={t('building.level')}>
        <option value="">{t('designData.allLevels')}</option>
        {#each levels as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
      </select>
      <select bind:value={cmat} aria-label={t('building.material')}>{#each concretes as m (m.id)}<option value={m.id}>{m.name}</option>{/each}</select>
      <button class="pk-btn" onclick={assign} data-testid="design-data-assign">{t('designData.assign')}</button>
    </div>
    {#if assigned !== null}<p class="pk-hint cl-hint" role="status">{tp('designData.assigned', { n: assigned })}</p>{/if}
  {/if}
</section>

<style>
  .cl-h { margin: 0 0 4px; font-size: 0.78rem; font-weight: 500; }
  .cl-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; font-size: 0.7rem; margin: 4px 0; }
  .cl-hint { color: var(--st-text-2); }
</style>
