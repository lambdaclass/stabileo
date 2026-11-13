<script lang="ts">
  import { t, tp } from '../../../../lib/i18n';
  import type { CodeInputProps } from '../registry';
  import Field from './Asce7Field.svelte';
  import { RISK_CATEGORIES, SNOW_DEFAULTS, type Asce7SnowInput } from '../../../../lib/codes/asce7/inputs';
  import { roofSnow7 } from '../../../../lib/codes/asce7/snow';
  import { PSF } from '../../../../lib/codes/asce7/refs';

  let { value, onchange }: CodeInputProps<Asce7SnowInput> = $props();
  const v = $derived(value ?? {});
  const set = (patch: Partial<Asce7SnowInput>) => onchange({ ...v, ...patch });
  const preview = $derived(v.pg !== undefined ? roofSnow7({
    pg: v.pg, ce: v.ce ?? SNOW_DEFAULTS.ce, ct: v.ct ?? SNOW_DEFAULTS.ct, riskCategory: v.riskCategory ?? SNOW_DEFAULTS.riskCategory,
    slopeDeg: v.roofSlopeDeg ?? 0, slippery: v.slippery ?? false, cs: v.cs,
  }) : null);
</script>

<div class="pk-card" data-testid="asce7-snow">
  <span class="pk-heading">{t('loads.asce7.ui.snowRoof')}</span>
  <div class="a7-grid">
    <label class="a7-col"><span class="pk-label">{t('loads.asce7.ui.riskCategory')}</span>
      <select value={v.riskCategory ?? SNOW_DEFAULTS.riskCategory} onchange={(e) => set({ riskCategory: e.currentTarget.value as Asce7SnowInput['riskCategory'] })}>
        {#each RISK_CATEGORIES as rc (rc)}<option value={rc}>{rc}</option>{/each}
      </select>
    </label>
    <Field label="pg" unit="kN/m²" testid="asce7-snow-pg" value={v.pg}
      hint={v.pg !== undefined ? `${(v.pg / PSF).toFixed(1)} psf` : t('loads.asce7.ui.pgHint')} onchange={(n) => set({ pg: n !== undefined && n >= 0 ? n : undefined })} />
    <Field label="Ce" value={v.ce} placeholder="1" hint={t('loads.asce7.ui.ceHint')} onchange={(n) => set({ ce: n })} />
    <Field label="Ct" value={v.ct} placeholder="1" hint={t('loads.asce7.ui.ctHint')} onchange={(n) => set({ ct: n })} />
    <Field label="Cs" value={v.cs} placeholder={t('loads.asce7.ui.fromSlope')} hint={t('loads.asce7.ui.csHint')} onchange={(n) => set({ cs: n })} />
    <Field label={t('autoLoad.windRoofSlope')} unit="°" value={v.roofSlopeDeg} placeholder={t('loads.asce7.ui.fromModel')} onchange={(n) => set({ roofSlopeDeg: n })} />
  </div>
  <label class="pk-check"><input type="checkbox" checked={v.slippery ?? false} onchange={(e) => set({ slippery: e.currentTarget.checked })} />{t('loads.asce7.ui.slippery')}</label>
  {#if preview}
    <p class="pk-hint">{tp('loads.asce7.ui.snowPreview', { pf: preview.pf.toFixed(3), cs: preview.cs.toFixed(3), ps: preview.ps.toFixed(3), pm: preview.pm === null ? '—' : preview.pm.toFixed(3) })}</p>
  {:else}
    <p class="pk-warn">{t('loads.asce7.snow.blocked.noPg')}</p>
  {/if}
</div>

<style>
  .a7-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr)); gap: 0.5rem; }
  .a7-col { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
</style>
