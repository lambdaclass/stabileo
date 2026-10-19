<script lang="ts">
  /**
   * The strata of a soil profile, top down from the founding level, as the soil report gives them
   * for piles: each its thickness and the allowable shaft friction and tip resistance. With them,
   * a pile's capacity is worked out (`model/foundation/piles.ts`) and a pile cap can be sized.
   */
  import { modelStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import type { SoilStratum } from '../../../lib/model/geotechnical';
  import { pileCapacity } from '../../../lib/model/foundation/piles';

  const profiles = $derived(modelStore.model.geotechnical?.profiles ?? []);
  let profileId = $state<number | null>(null);
  $effect(() => { if (profileId === null || !profiles.some((p) => p.id === profileId)) profileId = modelStore.model.geotechnical?.defaultProfileId ?? profiles[0]?.id ?? null; });
  const profile = $derived(profiles.find((p) => p.id === profileId));
  const strata = $derived(profile?.strata ?? []);
  let d = $state(0.5), len = $state(12);
  const cap = $derived(strata.length ? pileCapacity(strata, d, len) : null);

  const set = (next: SoilStratum[]) => { if (profileId !== null) modelStore.updateSoilProfile(profileId, { strata: next }); };
  const edit = (i: number, patch: Partial<SoilStratum>) => set(strata.map((s, k) => (k === i ? { ...s, ...patch } : s)));
</script>

<section class="pk-card" data-testid="soil-strata">
  <h5 class="ss-h">{t('fdn.strataTitle')}</h5>
  <p class="pk-hint">{t('fdn.strataHint')}</p>
  {#if profiles.length === 0}
    <button class="pk-btn" onclick={() => { const id = modelStore.addSoilProfile(); modelStore.setDefaultSoilProfile(id); }} data-testid="strata-add-profile">{t('fdn.addProfile')}</button>
  {:else}
    <label class="ss-inline">{t('fdn.profile')}
      <select bind:value={profileId}>{#each profiles as p (p.id)}<option value={p.id}>{p.name}</option>{/each}</select>
    </label>
    {#if strata.length > 0}
      <table class="ss-table">
        <thead><tr><th>{t('fdn.stratum')}</th><th>{t('fdn.thicknessM')}</th><th>{t('fdn.shaft')}</th><th>{t('fdn.tip')}</th><th></th></tr></thead>
        <tbody>
          {#each strata as s, i}
            <tr>
              <td><input value={s.name} onchange={(e) => edit(i, { name: e.currentTarget.value })} /></td>
              <td><input type="number" min="0" step="0.5" value={s.thickness} onchange={(e) => edit(i, { thickness: Number(e.currentTarget.value) || 0 })} /></td>
              <td><input type="number" min="0" step="5" value={s.shaftFrictionKPa} onchange={(e) => edit(i, { shaftFrictionKPa: Number(e.currentTarget.value) || 0 })} /></td>
              <td><input type="number" min="0" step="100" value={s.tipResistanceKPa} onchange={(e) => edit(i, { tipResistanceKPa: Number(e.currentTarget.value) || 0 })} /></td>
              <td><button class="pk-btn" title={t('grid.remove')} onclick={() => set(strata.filter((_, k) => k !== i))}>×</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
    <button class="pk-btn" onclick={() => set([...strata, { name: `E${strata.length + 1}`, thickness: 3, shaftFrictionKPa: 30, tipResistanceKPa: 0 }])} data-testid="strata-add">{t('fdn.addStratum')}</button>
    {#if cap}
      <p class="pk-hint" data-testid="strata-capacity">
        {t('fdn.pileDiameter')} <input class="ss-n" type="number" min="0.2" step="0.05" bind:value={d} />
        {t('fdn.pileLength')} <input class="ss-n" type="number" min="1" step="0.5" bind:value={len} /> →
        {tp('fdn.capacity', { q: cap.total.toFixed(0), s: cap.shaft.toFixed(0), p: cap.tip.toFixed(0) })}
        {#if cap.beyondStrata}<span class="ss-warn"> · {t('fdn.beyondStrata')}</span>{/if}
      </p>
    {/if}
  {/if}
</section>

<style>
  .ss-h { margin: 0 0 4px; font-size: 0.78rem; font-weight: 500; }
  .ss-inline { display: flex; align-items: center; gap: 4px; font-size: 0.7rem; color: var(--st-text-2); }
  .ss-table { width: 100%; border-collapse: collapse; font-size: 0.68rem; margin: 4px 0; }
  .ss-table th { text-align: left; font-weight: 500; color: var(--st-text-3); padding: 1px 3px; }
  .ss-table input { width: 100%; min-width: 0; font-size: 0.68rem; }
  .ss-n { width: 3.6rem; font-size: 0.68rem; }
  .ss-warn { color: var(--st-warn); }
</style>
