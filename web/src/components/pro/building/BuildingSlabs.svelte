<script lang="ts">
  /**
   * Slabs: the typology (drawn), the thickness, the levels, and the mesh the analysis reads them
   * with: meshed now, or kept as one shell per panel and meshed by the first solve, which keeps the
   * model light while it is edited (`deferred-slabs.ts`). Slabs a solve meshed can go back to one
   * shell. Placed in every bay of the grid on each level chosen, in the building's concrete.
   */
  import { modelStore } from '../../../lib/store';
  import { t } from '../../../lib/i18n';
  import TypologyPicker from './TypologyPicker.svelte';
  import { placeSlabs, type PlaceResult } from '../../../lib/model/building/build-on-grid';
  import { buildingUi } from '../../../lib/store/building-ui.svelte';
  import { simplifySlabs, slabsToMesh, slabsToSimplify } from '../../../lib/model/building/deferred-slabs';
  import { tp } from '../../../lib/i18n';

  let { meshSize = $bindable(1), report }: { meshSize?: number; report: (r: PlaceResult) => void } = $props();

  const grid = $derived(modelStore.grid);
  const levels = $derived([...(grid?.levels ?? [])].sort((a, b) => a.z - b.z));
  let typology = $state('solid'), thickness = $state(0.15), chosen = $state<string[]>([]);
  /** When the analysis mesh is made: at the first solve (the default, the model stays light) or now. */
  let meshWhen = $state<'solve' | 'now'>('solve');
  const waiting = $derived.by(() => { void modelStore.model.groups; return slabsToMesh(); });
  const meshed = $derived.by(() => { void modelStore.model.groups; return slabsToSimplify(); });
  let simplified = $state<string | null>(null);
  function simplify() { const r = simplifySlabs(); simplified = tp('building.slabs.simplified', { n: r.slabs }); }
  const toggle = (id: string) => (chosen = chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);
  /** Every level above the lowest, unless some are chosen. */
  const onLevels = () => (chosen.length > 0 ? chosen : levels.slice(1).map((l) => l.id));
  function place() {
    if (!grid) return;
    report(placeSlabs(grid, { levels: onLevels(), thickness, materialId: buildingUi.concreteId, meshSize, typology, meshAtSolve: meshWhen === 'solve' }));
  }
</script>

<section class="pk-card" data-testid="building-slabs">
  <TypologyPicker kind="slab" bind:value={typology} exclude={['ramp']} testid="building-slab-typology" />
  <div class="bs-grid">
    <label>{t('building.thickness')}<input type="number" min="0.05" step="0.01" bind:value={thickness} data-testid="building-slab-thickness" /></label>
    <label>{t('building.meshSize')}<input type="number" min="0.1" step="0.1" bind:value={meshSize} data-testid="building-mesh-size" /></label>
  </div>
  <div class="bs-mesh" role="radiogroup" aria-label={t('building.slabs.meshWhen')}>
    <span>{t('building.slabs.meshWhen')}</span>
    <label><input type="radio" name="bs-mesh" value="solve" bind:group={meshWhen} data-testid="building-slab-mesh-solve" /> {t('building.slabs.meshAtSolve')}</label>
    <label><input type="radio" name="bs-mesh" value="now" bind:group={meshWhen} data-testid="building-slab-mesh-now" /> {t('building.slabs.meshNow')}</label>
  </div>
  <p class="pk-hint">{t(meshWhen === 'solve' ? 'building.slabs.meshAtSolveHint' : 'building.slabs.meshNowHint')}</p>
  <div class="bs-levels" role="group" aria-label={t('building.atLevels')}>
    {#each levels as l (l.id)}
      <label><input type="checkbox" checked={chosen.includes(l.id)} onchange={() => toggle(l.id)} /> {l.name}</label>
    {/each}
  </div>
  <p class="pk-hint">{t('building.levelsDefault')}</p>
  <button class="pk-btn pk-btn-primary" onclick={place} data-testid="building-place-slabs">{t('building.place')}</button>
  {#if waiting > 0}<p class="pk-hint" data-testid="building-slabs-waiting">{tp('building.slabs.waiting', { n: waiting })}</p>{/if}
  {#if meshed > 0}
    <div class="bs-simplify">
      <span class="pk-hint">{tp('building.slabs.meshedCount', { n: meshed })}</span>
      <button class="pk-btn" onclick={simplify} data-testid="building-slabs-simplify">{t('building.slabs.simplify')}</button>
    </div>
  {/if}
  {#if simplified}<p class="pk-hint" role="status">{simplified}</p>{/if}
</section>

<style>
  .bs-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr)); gap: 6px; margin: 4px 0 6px; }
  .bs-grid label { display: flex; flex-direction: column; gap: 2px; font-size: 0.7rem; color: var(--st-text-2); }
  .bs-grid input { font-size: 0.72rem; }
  .bs-levels { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 0.7rem; }
  .bs-mesh { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; font-size: 0.7rem; color: var(--st-text-2); margin-top: 4px; }
  .bs-mesh label { display: flex; align-items: center; gap: 4px; color: var(--st-text); }
  .bs-simplify { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 6px; }
</style>
