<script lang="ts">
  import { t } from '../../../../lib/i18n';
  import type { CodeInputProps } from '../registry';
  import { TERRAIN_CATEGORIES, WIND_DEFAULTS, type EcWindInput, type UkWindInput } from '../../../../lib/codes/eurocode/inputs';
  import { basicVelocity } from '../../../../lib/codes/eurocode/wind';

  type Value = EcWindInput & UkWindInput;
  let { value, onchange, uk = false }: CodeInputProps<Value> & { uk?: boolean } = $props();
  const v = $derived<Value>({ ...WIND_DEFAULTS, ...(value ?? {}) });
  const basic = $derived(basicVelocity(uk ? 'uk' : 'eurocode', v));

  function set<K extends keyof Value>(k: K, x: Value[K]) { onchange({ ...(value ?? {}), [k]: x }); }
  const num = (e: Event) => {
    const n = parseFloat((e.currentTarget as HTMLInputElement).value.replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  };
  const dir = (axis: 'x' | 'y', on: boolean) => set('directions', { ...v.directions!, [axis]: on });
</script>

<div class="ec-form" data-testid={uk ? 'ec-wind-uk' : 'ec-wind'}>
  {#if uk}
    <label class="ec-field"><span class="pk-label">{t('loads.ec.ui.vbMap')}</span>
      <input type="number" step="0.1" min="0" value={v.vbMap ?? ''} oninput={(e) => set('vbMap', num(e))} data-testid="ec-wind-vbmap" /></label>
    <label class="ec-field"><span class="pk-label">{t('loads.ec.ui.altitude')}</span>
      <input type="number" step="1" value={v.altitude ?? ''} oninput={(e) => set('altitude', num(e))} data-testid="ec-wind-altitude" /></label>
  {:else}
    <label class="ec-field"><span class="pk-label">{t('loads.ec.ui.vb0')}</span>
      <input type="number" step="0.1" min="0" value={v.vb0 ?? ''} oninput={(e) => set('vb0', num(e))} data-testid="ec-wind-vb0" /></label>
  {/if}
  <label class="ec-field"><span class="pk-label">{t('loads.ec.ui.terrain')}</span>
    <select value={v.terrain ?? ''} onchange={(e) => set('terrain', (e.currentTarget.value || undefined) as Value['terrain'])} data-testid="ec-wind-terrain">
      <option value="" disabled>{t('loads.ec.ui.choose')}</option>
      {#each TERRAIN_CATEGORIES as c (c)}<option value={c}>{c} · {t(`loads.ec.terrain.${c}`)}</option>{/each}
    </select></label>
  <div class="ec-grid">
    <label class="ec-field"><span class="pk-label">{'c'}<sub>{'dir'}</sub></span>
      <input type="number" step="0.05" min="0" max="1" value={v.cdir} oninput={(e) => set('cdir', num(e))} /></label>
    <label class="ec-field"><span class="pk-label">{'c'}<sub>{'season'}</sub></span>
      <input type="number" step="0.05" min="0" max="1" value={v.cseason} oninput={(e) => set('cseason', num(e))} /></label>
    <label class="ec-field"><span class="pk-label">c<sub>0</sub></span>
      <input type="number" step="0.05" min="0" value={v.c0} oninput={(e) => set('c0', num(e))} /></label>
    <label class="ec-field"><span class="pk-label">c<sub>s</sub>c<sub>d</sub></span>
      <input type="number" step="0.05" min="0" value={v.cscd} oninput={(e) => set('cscd', num(e))} /></label>
  </div>
  <div class="pk-row">
    <span class="pk-label">{t('loads.ec.ui.directions')}</span>
    <label class="pk-check"><input type="checkbox" checked={v.directions?.x} onchange={(e) => dir('x', e.currentTarget.checked)} data-testid="ec-wind-dir-x" />±X</label>
    <label class="pk-check"><input type="checkbox" checked={v.directions?.y} onchange={(e) => dir('y', e.currentTarget.checked)} data-testid="ec-wind-dir-y" />±Y</label>
  </div>
  {#if basic}
    <p class="pk-hint">v<sub>b,0</sub> = {basic.vb0.toFixed(2)} m/s · v<sub>b</sub> = {basic.vb.toFixed(2)} m/s</p>
  {:else}
    <p class="pk-warn">{t(uk ? 'loads.ec.blocked.ukWindSpeed' : 'loads.ec.blocked.windSpeed')}</p>
  {/if}
  <p class="pk-hint">{t(uk ? 'loads.ec.ui.windHintUk' : 'loads.ec.ui.windHint')}</p>
</div>

<style>
  .ec-form { display: flex; flex-direction: column; gap: 0.45rem; }
  .ec-field { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
  .ec-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(5.5rem, 1fr)); gap: 0.4rem; }
</style>
