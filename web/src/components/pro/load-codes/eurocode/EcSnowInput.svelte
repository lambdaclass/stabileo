<script lang="ts">
  import Hint from '../../Hint.svelte';
  import { t } from '../../../../lib/i18n';
  import type { CodeInputProps } from '../registry';
  import { SNOW_DEFAULTS, type EcSnowInput, type UkSnowInput } from '../../../../lib/codes/eurocode/inputs';
  import { ukGroundSnow } from '../../../../lib/codes/eurocode/snow';

  type Value = EcSnowInput & UkSnowInput;
  let { value, onchange, uk = false }: CodeInputProps<Value> & { uk?: boolean } = $props();
  const v = $derived<Value>({ ...SNOW_DEFAULTS, ...(value ?? {}) });
  const ukSk = $derived(uk && v.zone! > 0 && v.altitude !== undefined ? ukGroundSnow(v.zone!, v.altitude) : null);

  function set<K extends keyof Value>(k: K, x: Value[K]) { onchange({ ...(value ?? {}), [k]: x }); }
  const num = (e: Event) => {
    const n = parseFloat((e.currentTarget as HTMLInputElement).value.replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  };
</script>

<div class="ec-form" data-testid={uk ? 'ec-snow-uk' : 'ec-snow'}>
  <div class="ec-grid">
    {#if uk}
      <label class="ec-field"><span class="pk-label">{t('loads.ec.ui.snowZone')}</span>
        <input type="number" step="0.5" min="1" value={v.zone ?? ''} oninput={(e) => set('zone', num(e))} data-testid="ec-snow-zone" /></label>
    {:else}
      <label class="ec-field"><span class="pk-label">s<sub>k</sub> (kN/m²)</span>
        <input type="number" step="0.05" min="0" value={v.sk ?? ''} oninput={(e) => set('sk', num(e))} data-testid="ec-snow-sk" /></label>
    {/if}
    <label class="ec-field"><span class="pk-label">{t('loads.ec.ui.altitude')}</span>
      <input type="number" step="1" value={v.altitude ?? ''} oninput={(e) => set('altitude', num(e))} data-testid="ec-snow-altitude" /></label>
    <label class="ec-field"><span class="pk-label">C<sub>t</sub></span>
      <input type="number" step="0.05" min="0" value={v.ct} oninput={(e) => set('ct', num(e))} /></label>
  </div>
  <label class="ec-field"><span class="pk-label">{t('loads.ec.ui.snowExposure')}</span>
    <select value={v.exposure} onchange={(e) => set('exposure', e.currentTarget.value as Value['exposure'])} data-testid="ec-snow-exposure">
      <option value="windswept">{t('loads.ec.exposure.windswept')} · Ce = 0.8</option>
      <option value="normal">{t('loads.ec.exposure.normal')} · Ce = 1.0</option>
      <option value="sheltered">{t('loads.ec.exposure.sheltered')} · Ce = 1.2</option>
    </select></label>
  <label class="ec-field"><span class="pk-label">{t('loads.ec.ui.roofShape')}</span>
    <select value={v.roof} onchange={(e) => set('roof', e.currentTarget.value as Value['roof'])} data-testid="ec-snow-roof">
      <option value="duopitch">{t('loads.ec.snowRoof.duopitch')}</option>
      <option value="monopitch">{t('loads.ec.snowRoof.monopitch')}</option>
    </select></label>
  <label class="pk-check"><input type="checkbox" checked={v.slidingPrevented} onchange={(e) => set('slidingPrevented', e.currentTarget.checked)} />{t('loads.ec.ui.slidingPrevented')}</label>
  {#if uk}
    {#if ukSk !== null}<p class="pk-hint">s<sub>k</sub> = {ukSk.toFixed(3)} kN/m²</p>{:else}<p class="pk-warn">{t('loads.ec.blocked.ukSnow')}</p>{/if}
  {:else if !(v.sk! > 0)}
    <p class="pk-warn">{t('loads.ec.blocked.sk')}</p>
  {/if}
  <Hint text={t('loads.ec.ui.snowHint')} />
</div>

<style>
  .ec-form { display: flex; flex-direction: column; gap: 0.45rem; }
  .ec-field { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
  .ec-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(5.5rem, 1fr)); gap: 0.4rem; }
</style>
