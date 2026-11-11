<script lang="ts">
  import { t } from '../../../../lib/i18n';
  import type { CodeInputProps } from '../registry';
  import Hint from '../../Hint.svelte';
  import type { Ts498WindInput } from '../../../../lib/codes/turkey/inputs';
  import { velocityPressure } from '../../../../lib/codes/turkey/ts498-wind';

  let { value, onchange }: CodeInputProps<Ts498WindInput> = $props();

  const v = $derived(value ?? {});
  const set = (patch: Partial<Ts498WindInput>) => onchange({ ...v, ...patch });
  const dirs = $derived(v.directions ?? { x: true, y: true });
  const bands = [[4, '0–8'], [12, '9–20'], [50, '21–100'], [150, '> 100']] as const;
</script>

<div class="al-sub" data-testid="tr-wind-input">
  <span class="al-sub-title">{t('loads.tr.wind.title')}</span>
  <div class="al-grid">
    <label class="al-field al-field-wide"><span class="al-label">{t('loads.tr.wind.shape')}</span>
      <select value={v.shape ?? ''} onchange={(e) => set({ shape: (e.currentTarget.value || undefined) as Ts498WindInput['shape'] })} data-testid="tr-wind-shape">
        <option value="">{t('loads.tr.wind.shapeAuto')}</option>
        <option value="general">{t('loads.tr.wind.shapeGeneral')}</option>
        <option value="tower">{t('loads.tr.wind.shapeTower')}</option>
      </select></label>
  </div>
  <label class="pk-check"><input type="checkbox" checked={!!v.exposedSlope} onchange={(e) => set({ exposedSlope: e.currentTarget.checked })} data-testid="tr-wind-slope" />{t('loads.tr.wind.exposedSlope')}</label>
  <table class="tr-bands" data-testid="tr-wind-bands">
    <thead><tr><th>{t('loads.tr.wind.height')}</th><th>q [kN/m²]</th></tr></thead>
    <tbody>{#each bands as [z, label] (label)}<tr><td>{label}</td><td>{velocityPressure(z, v.exposedSlope).toFixed(2)}</td></tr>{/each}</tbody>
  </table>
  <Hint text={t('loads.tr.wind.hint')} />
  <div class="pk-row">
    <span class="pk-label">{t('loads.tr.directions')}</span>
    <label class="pk-check"><input type="checkbox" checked={dirs.x} onchange={(e) => set({ directions: { ...dirs, x: e.currentTarget.checked } })} data-testid="tr-wind-x" />±X</label>
    <label class="pk-check"><input type="checkbox" checked={dirs.y} onchange={(e) => set({ directions: { ...dirs, y: e.currentTarget.checked } })} data-testid="tr-wind-y" />±Y</label>
  </div>
  {#if !dirs.x && !dirs.y}<p class="pk-warn">{t('loads.tr.noDirection')}</p>{/if}
</div>

<style>
  .tr-bands { border-collapse: collapse; font-size: 0.66rem; font-variant-numeric: tabular-nums; }
  .tr-bands th, .tr-bands td { padding: 2px 10px 2px 0; text-align: left; color: var(--st-text-2); }
  .tr-bands th { color: var(--st-text-3); font-weight: 500; }
</style>
