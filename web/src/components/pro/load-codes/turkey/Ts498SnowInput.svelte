<script lang="ts">
  import { t, tp } from '../../../../lib/i18n';
  import type { CodeInputProps } from '../registry';
  import Hint from '../../Hint.svelte';
  import type { SnowZone, Ts498SnowInput } from '../../../../lib/codes/turkey/inputs';
  import { groundSnow, slopeFactor } from '../../../../lib/codes/turkey/ts498-snow';

  let { value, onchange }: CodeInputProps<Ts498SnowInput> = $props();

  const v = $derived(value ?? {});
  const set = (patch: Partial<Ts498SnowInput>) => onchange({ ...v, ...patch });
  const num = (e: Event): number | undefined => {
    const s = (e.currentTarget as HTMLInputElement).value.trim().replace(',', '.');
    const n = Number(s);
    return s === '' || !Number.isFinite(n) ? undefined : n;
  };
  const ZONES: SnowZone[] = ['I', 'II', 'III', 'IV'];
  const pk0 = $derived(v.zone && v.altitudeM !== undefined && v.altitudeM >= 0 ? groundSnow(v.zone, v.altitudeM).pk0 : null);
</script>

<div class="al-sub" data-testid="tr-snow-input">
  <span class="al-sub-title">{t('loads.tr.snow.title')}</span>
  <label class="pk-check"><input type="checkbox" checked={!!v.noSnow} onchange={(e) => set({ noSnow: e.currentTarget.checked })} data-testid="tr-snow-none" />{t('loads.tr.snow.noSnow')}</label>
  {#if !v.noSnow}
    <div class="al-grid">
      <label class="al-field"><span class="al-label">{t('loads.tr.snow.zone')}</span>
        <select value={v.zone ?? ''} onchange={(e) => set({ zone: (e.currentTarget.value || undefined) as SnowZone | undefined })} data-testid="tr-snow-zone">
          <option value="" disabled>—</option>
          {#each ZONES as z (z)}<option value={z}>{z}</option>{/each}
        </select></label>
      <label class="al-field"><span class="al-label">{t('loads.tr.snow.altitude')}</span>
        <input type="number" min="0" step="50" value={v.altitudeM ?? ''} oninput={(e) => set({ altitudeM: num(e) })} data-testid="tr-snow-altitude" /></label>
      <label class="al-field"><span class="al-label">{t('loads.tr.snow.slope')}</span>
        <input type="number" min="0" max="90" step="1" value={v.roofSlopeDeg ?? ''} placeholder={t('loads.tr.snow.slopeFromModel')} oninput={(e) => set({ roofSlopeDeg: num(e) })} data-testid="tr-snow-slope" /></label>
    </div>
    <label class="pk-check"><input type="checkbox" checked={!!v.slidingPrevented} onchange={(e) => set({ slidingPrevented: e.currentTarget.checked })} data-testid="tr-snow-sliding" />{t('loads.tr.snow.slidingPrevented')}</label>
    <Hint text={t('loads.tr.snow.zoneHint')} />
    {#if !v.zone}<p class="pk-warn" data-testid="tr-snow-missing">{t('loads.tr.snow.blocked.zone')}</p>
    {:else if v.altitudeM === undefined}<p class="pk-warn">{t('loads.tr.snow.blocked.altitude')}</p>{/if}
    {#if pk0 !== null}
      <p class="pk-hint" data-testid="tr-snow-preview">{tp('loads.tr.snow.preview', {
        pk0: pk0.toFixed(2), m: slopeFactor(v.roofSlopeDeg ?? 0, v.slidingPrevented).toFixed(2),
        pk: (pk0 * slopeFactor(v.roofSlopeDeg ?? 0, v.slidingPrevented)).toFixed(2) })}</p>
    {/if}
  {/if}
</div>
