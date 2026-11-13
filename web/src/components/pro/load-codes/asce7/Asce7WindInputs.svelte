<script lang="ts">
  import { t, tp } from '../../../../lib/i18n';
  import type { CodeInputProps } from '../registry';
  import Field from './Asce7Field.svelte';
  import { RISK_CATEGORIES, WIND_DEFAULTS, type Asce7WindInput } from '../../../../lib/codes/asce7/inputs';
  import { groundElevationKe, kz, velocityPressure } from '../../../../lib/codes/asce7/wind';
  import { MPH } from '../../../../lib/codes/asce7/refs';
  import { WIND_DIRECTIONS, type WindDirection } from '../../../../lib/engine/loads/wind-cases';
  import type { Enclosure, Exposure } from '../../../../lib/codes/cirsoc102/wind';

  let { value, onchange }: CodeInputProps<Asce7WindInput> = $props();
  const v = $derived(value ?? {});
  const set = (patch: Partial<Asce7WindInput>) => onchange({ ...v, ...patch });
  const exposure = $derived(v.exposure ?? WIND_DEFAULTS.exposure);
  const dirs = $derived<WindDirection[]>(v.directions ?? [...WIND_DEFAULTS.directions]);
  const ke = $derived(v.ke ?? (v.groundElevationM !== undefined ? groundElevationKe(v.groundElevationM) : 1));
  const q10 = $derived(v.V ? velocityPressure(10, { V: v.V, exposure, kzt: v.kzt ?? 1, ke }) / 1000 : null);
  function toggle(d: WindDirection, on: boolean) {
    set({ directions: on ? WIND_DIRECTIONS.filter((x) => x === d || dirs.includes(x)) : dirs.filter((x) => x !== d) });
  }
  const ENCLOSURES: Enclosure[] = ['enclosed', 'partiallyEnclosed', 'partiallyOpen', 'open'];
</script>

<div class="pk-card" data-testid="asce7-wind">
  <span class="pk-heading">{t('loads.asce7.ui.windSite')}</span>
  <div class="a7-grid">
    <label class="a7-col"><span class="pk-label">{t('loads.asce7.ui.riskCategory')}</span>
      <select value={v.riskCategory ?? WIND_DEFAULTS.riskCategory} onchange={(e) => set({ riskCategory: e.currentTarget.value as Asce7WindInput['riskCategory'] })}>
        {#each RISK_CATEGORIES as rc (rc)}<option value={rc}>{rc}</option>{/each}
      </select>
    </label>
    <Field label={t('loads.asce7.ui.windSpeed')} unit="mph" testid="asce7-wind-v"
      value={v.V !== undefined ? v.V / MPH : undefined}
      hint={v.V ? `${(+v.V.toFixed(2))} m/s` : t('loads.asce7.ui.windSpeedHint')}
      onchange={(n) => set({ V: n !== undefined && n > 0 ? n * MPH : undefined })} />
    <label class="a7-col"><span class="pk-label">{t('autoLoad.windExposure')}</span>
      <select value={exposure} onchange={(e) => set({ exposure: e.currentTarget.value as Exposure })}>
        {#each ['B', 'C', 'D'] as x (x)}<option value={x}>{x}</option>{/each}
      </select>
    </label>
    <Field label={'Kzt'} value={v.kzt} placeholder="1" hint={t('loads.asce7.ui.kztHint')} onchange={(n) => set({ kzt: n })} />
    <Field label={t('loads.asce7.ui.groundElevation')} unit="m" value={v.groundElevationM} placeholder="0"
      hint={`Ke = ${ke.toFixed(3)}`} onchange={(n) => set({ groundElevationM: n, ke: undefined })} />
    <label class="a7-col"><span class="pk-label">{t('autoLoad.windEnclosure')}</span>
      <select value={v.enclosure ?? WIND_DEFAULTS.enclosure} onchange={(e) => set({ enclosure: e.currentTarget.value as Enclosure })}>
        {#each ENCLOSURES as x (x)}<option value={x}>{t(`loads.cirsoc102.enclosure.${x}`)}</option>{/each}
      </select>
    </label>
    <Field label={t('autoLoad.windRoofSlope')} unit="°" value={v.roofSlopeDeg} placeholder="0" onchange={(n) => set({ roofSlopeDeg: n })} />
  </div>
  {#if q10 !== null}<p class="pk-hint">{tp('loads.asce7.ui.windPreview', { kz: kz(10, exposure).toFixed(3), q: q10.toFixed(3) })}</p>{/if}
</div>

<div class="pk-card">
  <span class="pk-heading">{t('loads.asce7.ui.windCases')}</span>
  <div class="pk-row">
    <span class="pk-label">{t('loads.asce7.ui.directions')}</span>
    {#each WIND_DIRECTIONS as d (d)}
      <label class="pk-check"><input type="checkbox" checked={dirs.includes(d)} onchange={(e) => toggle(d, e.currentTarget.checked)} />{d.replace('-', '−').toUpperCase()}</label>
    {/each}
  </div>
  <label class="a7-col"><span class="pk-label">{t('loads.asce7.ui.caseSet')}</span>
    <select value={v.caseSet ?? WIND_DEFAULTS.caseSet} onchange={(e) => set({ caseSet: e.currentTarget.value as Asce7WindInput['caseSet'] })}>
      {#each ['all', 'cases13', 'case1'] as c (c)}<option value={c}>{t(`loads.asce7.ui.caseSet.${c}`)}</option>{/each}
    </select>
  </label>
  <label class="pk-check"><input type="checkbox" checked={v.rigid ?? true} onchange={(e) => set({ rigid: e.currentTarget.checked })} />{t('loads.asce7.ui.rigid')}</label>
  {#if v.rigid === false}<p class="pk-warn">{t('loads.asce7.wind.blocked.flexible')}</p>{/if}
  {#if !v.V}<p class="pk-warn">{t('loads.asce7.wind.blocked.noSpeed')}</p>{/if}
</div>

<style>
  .a7-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr)); gap: 0.5rem; }
  .a7-col { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
</style>
