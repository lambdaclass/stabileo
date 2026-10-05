<script lang="ts">
  /**
   * Weights for the mass alone, apart from the load cases (`engine/dynamics/mass-weights.ts`): kN/m
   * on members, kN/m² on slabs, or kN/m² on a floor carried to its beams, each on a part of the
   * model. Kept with the mass source.
   */
  import { modelStore } from '../../../lib/store';
  import { t } from '../../../lib/i18n';
  import { parseDecimal } from '../../../lib/utils/numeric-input';
  import ProActionRegion from '../loads/ProActionRegion.svelte';
  import type { MassWeight } from '../../../lib/engine/dynamics/mass-source';

  const weights = $derived(modelStore.model.massSource?.weights ?? []);
  function save(list: MassWeight[]) {
    const ms = modelStore.model.massSource;
    modelStore.setMassSource(ms ? { ...ms, weights: list } : { kind: 'custom', factors: [], weights: list });
  }
  const set = (i: number, patch: Partial<MassWeight>) => save(weights.map((w, k) => (k === i ? { ...w, ...patch } : w)));
  const UNIT: Record<MassWeight['on'], string> = { members: 'kN/m', slabs: 'kN/m²', floor: 'kN/m²' };
</script>

<div class="mw" data-testid="mass-weights">
  <div class="mw-title">{t('massWeights.title')}</div>
  {#each weights as w, i (i)}
    <div class="mw-row">
      <select value={w.on} onchange={(e) => set(i, { on: e.currentTarget.value as MassWeight['on'] })} data-testid="mw-on-{i}">
        <option value="members">{t('massWeights.members')}</option>
        <option value="slabs">{t('massWeights.slabs')}</option>
        <option value="floor">{t('massWeights.floor')}</option>
      </select>
      <input type="text" class="mw-num" value={String(w.w)} onchange={(e) => { const v = parseDecimal(e.currentTarget.value); if (v !== null) set(i, { w: v }); }} data-testid="mw-w-{i}" /> {UNIT[w.on]}
      <button class="mw-x" onclick={() => save(weights.filter((_, k) => k !== i))} aria-label={t('loadTables.delete')}>×</button>
    </div>
    <div class="mw-row"><ProActionRegion region={w.region} testid="mw-region-{i}" onchange={(r) => set(i, { region: r })} /></div>
  {/each}
  <button class="pk-btn" onclick={() => save([...weights, { on: 'members', region: { kind: 'all' }, w: 1 }])} data-testid="mw-add">+ {t('massWeights.add')}</button>
  <p class="mw-hint">{t('massWeights.hint')}</p>
</div>

<style>
  .mw { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; font-size: 0.68rem; color: var(--st-text-2); }
  .mw-title { font-weight: 600; color: var(--st-text); }
  .mw-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; }
  .mw-num { width: 56px; font-family: var(--st-mono); }
  .mw-x { background: none; border: none; color: var(--st-text-3); cursor: pointer; }
  .mw-hint { margin: 0; font-size: 0.6rem; color: var(--st-text-3); }
</style>
