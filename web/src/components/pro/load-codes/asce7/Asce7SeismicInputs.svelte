<script lang="ts">
  import { t, tp } from '../../../../lib/i18n';
  import type { CodeInputProps } from '../registry';
  import Field from './Asce7Field.svelte';
  import Hint from '../../Hint.svelte';
  import { RISK_CATEGORIES, SEISMIC_DEFAULTS, SITE_CLASSES, type Asce7SeismicInput } from '../../../../lib/codes/asce7/inputs';
  import { IMPORTANCE_SEISMIC, PERIOD_PARAMETERS, SYSTEMS, designCategory } from '../../../../lib/codes/asce7/seismic';

  const SYM = { design: 'SDS, SD1', mce: 'SMS, SM1', sds: 'SDS', sd1: 'SD1', sms: 'SMS', sm1: 'SM1' };
  let { value, onchange }: CodeInputProps<Asce7SeismicInput> = $props();
  const v = $derived(value ?? {});
  const set = (patch: Partial<Asce7SeismicInput>) => onchange({ ...v, ...patch });
  const mce = $derived((v.spectrum ?? SEISMIC_DEFAULTS.spectrum) === 'mce');
  const sds = $derived(mce ? (v.sms !== undefined ? (2 / 3) * v.sms : undefined) : v.sds);
  const sd1 = $derived(mce ? (v.sm1 !== undefined ? (2 / 3) * v.sm1 : undefined) : v.sd1);
  const rc = $derived(v.riskCategory ?? SEISMIC_DEFAULTS.riskCategory);
  const systemKey = $derived(v.systemKey ?? SEISMIC_DEFAULTS.systemKey);
  const sys = $derived(systemKey === 'custom' ? null : SYSTEMS[systemKey]);
  const dirs = $derived(v.directions ?? SEISMIC_DEFAULTS.directions);
  const sdc = $derived(sds !== undefined && sd1 !== undefined ? designCategory(sds, sd1, v.s1, rc) : null);
  const missing = $derived(sds === undefined || sd1 === undefined ? 'loads.asce7.seismic.blocked.noSpectrum' : !(v.tl! > 0) ? 'loads.asce7.seismic.blocked.noTl' : (v.siteClass === 'F' ? 'loads.asce7.seismic.blocked.siteF' : null));
</script>

<div class="pk-card" data-testid="asce7-seismic">
  <span class="pk-heading">{t('loads.asce7.ui.spectrum')}</span>
  <div class="a7-grid">
    <label class="a7-col"><span class="pk-label">{t('loads.asce7.ui.spectrumMode')}</span>
      <select value={v.spectrum ?? SEISMIC_DEFAULTS.spectrum} onchange={(e) => set({ spectrum: e.currentTarget.value as 'design' | 'mce' })}>
        <option value="design">{SYM.design}</option><option value="mce">{SYM.mce}</option>
      </select>
    </label>
    <label class="a7-col"><span class="pk-label">{t('loads.asce7.ui.siteClass')}</span>
      <select value={v.siteClass ?? SEISMIC_DEFAULTS.siteClass} onchange={(e) => set({ siteClass: e.currentTarget.value as Asce7SeismicInput['siteClass'] })}>
        {#each SITE_CLASSES as s (s)}<option value={s}>{s}</option>{/each}
      </select>
    </label>
    {#if mce}
      <Field label={SYM.sms} unit="g" value={v.sms} onchange={(n) => set({ sms: n })} />
      <Field label={SYM.sm1} unit="g" value={v.sm1} onchange={(n) => set({ sm1: n })} />
    {:else}
      <Field label={SYM.sds} unit="g" value={v.sds} testid="asce7-sds" onchange={(n) => set({ sds: n })} />
      <Field label={SYM.sd1} unit="g" value={v.sd1} testid="asce7-sd1" onchange={(n) => set({ sd1: n })} />
    {/if}
    <Field label="S1" unit="g" value={v.s1} hint={t('loads.asce7.ui.s1Hint')} onchange={(n) => set({ s1: n })} />
    <Field label="TL" unit="s" value={v.tl} testid="asce7-tl" onchange={(n) => set({ tl: n })} />
  </div>
  <Hint text={t('loads.asce7.ui.spectrumHint')} />
</div>

<div class="pk-card">
  <span class="pk-heading">{t('loads.asce7.ui.system')}</span>
  <div class="a7-grid">
    <label class="a7-col"><span class="pk-label">{t('loads.asce7.ui.riskCategory')}</span>
      <select value={rc} onchange={(e) => set({ riskCategory: e.currentTarget.value as Asce7SeismicInput['riskCategory'] })}>
        {#each RISK_CATEGORIES as r (r)}<option value={r}>{r} · Ie = {IMPORTANCE_SEISMIC[r]}</option>{/each}
      </select>
    </label>
    <label class="a7-col a7-wide"><span class="pk-label">{t('loads.asce7.ui.systemRow')}</span>
      <select value={systemKey} onchange={(e) => set({ systemKey: e.currentTarget.value })}>
        {#each Object.keys(SYSTEMS) as k (k)}<option value={k}>{t(`loads.asce7.system.${k}`)}</option>{/each}
        <option value="custom">{t('loads.asce7.system.custom')}</option>
      </select>
    </label>
    {#if systemKey === 'custom'}
      <Field label="R" value={v.r} onchange={(n) => set({ r: n })} />
      <Field label="Cd" value={v.cd} onchange={(n) => set({ cd: n })} />
      <Field label="Ω0" value={v.omega0} onchange={(n) => set({ omega0: n })} />
    {/if}
    <label class="a7-col"><span class="pk-label">{t('loads.asce7.ui.periodRow')}</span>
      <select value={v.periodKey ?? SEISMIC_DEFAULTS.periodKey} onchange={(e) => set({ periodKey: e.currentTarget.value })}>
        {#each Object.entries(PERIOD_PARAMETERS) as [k, p] (k)}<option value={k}>{t(`loads.asce7.period.${k}`)} · Ct = {p.ct}, x = {p.x}</option>{/each}
      </select>
    </label>
    <Field label="T" unit="s" value={v.computedT} placeholder="Ta" hint={t('loads.asce7.ui.computedTHint')} onchange={(n) => set({ computedT: n })} />
    <label class="a7-col"><span class="pk-label">ρ</span>
      <select value={String(v.rho ?? SEISMIC_DEFAULTS.rho)} onchange={(e) => set({ rho: Number(e.currentTarget.value) })}>
        <option value="1">1.0</option><option value="1.3">1.3</option>
      </select>
    </label>
    <Field label={t('loads.asce7.ui.partition')} unit="kN/m²" value={v.partitionKNm2} placeholder="0.48" onchange={(n) => set({ partitionKNm2: n })} />
  </div>
  {#if sys}<p class="pk-hint">R = {sys.r} · Cd = {sys.cd} · Ω0 = {sys.omega0}</p>{/if}
  {#if sdc}<p class="pk-hint">{tp('loads.asce7.ui.sdc', { sdc, sds: (+sds!.toFixed(3)), sd1: (+sd1!.toFixed(3)) })}</p>{/if}
</div>

<div class="pk-card">
  <span class="pk-heading">{t('loads.asce7.ui.directions')}</span>
  <div class="pk-row">
    <label class="pk-check"><input type="checkbox" checked={dirs.x} onchange={(e) => set({ directions: { ...dirs, x: e.currentTarget.checked } })} />X</label>
    <label class="pk-check"><input type="checkbox" checked={dirs.y} onchange={(e) => set({ directions: { ...dirs, y: e.currentTarget.checked } })} />Y</label>
  </div>
  <label class="pk-check"><input type="checkbox" checked={v.torsion ?? SEISMIC_DEFAULTS.torsion} onchange={(e) => set({ torsion: e.currentTarget.checked })} />{t('loads.asce7.ui.torsion')}</label>
  <label class="pk-check"><input type="checkbox" checked={v.orthogonal ?? SEISMIC_DEFAULTS.orthogonal} onchange={(e) => set({ orthogonal: e.currentTarget.checked })} />{t('loads.asce7.ui.orthogonal')}</label>
  {#if missing}<p class="pk-warn">{t(missing)}</p>{/if}
</div>

<style>
  .a7-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr)); gap: 0.5rem; }
  .a7-col { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
  .a7-wide { grid-column: span 2; }
</style>
