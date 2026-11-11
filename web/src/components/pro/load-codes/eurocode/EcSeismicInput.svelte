<script lang="ts">
  import Hint from '../../Hint.svelte';
  import { t } from '../../../../lib/i18n';
  import type { CodeInputProps } from '../registry';
  import { SEISMIC_DEFAULTS, type EcSeismicInput, type GroundType, type ImportanceClass, type PeriodSystem } from '../../../../lib/codes/eurocode/inputs';
  import { GAMMA_I, SPECTRUM, designSpectrum } from '../../../../lib/codes/eurocode/seismic';

  let { value, onchange }: CodeInputProps<EcSeismicInput> = $props();
  const v = $derived<EcSeismicInput>({ ...SEISMIC_DEFAULTS, ...(value ?? {}) });
  const GROUNDS: GroundType[] = ['A', 'B', 'C', 'D', 'E'];
  const CLASSES: ImportanceClass[] = ['I', 'II', 'III', 'IV'];
  const SYSTEMS: PeriodSystem[] = ['steelMrf', 'concreteMrf', 'other'];
  const plateau = $derived.by(() => {
    if (!(v.agR! > 0) || !v.groundType || !(v.q! >= 1)) return null;
    const p = SPECTRUM[v.spectrumType!][v.groundType];
    const ag = (v.gammaI ?? GAMMA_I[v.importance!]) * v.agR!;
    return designSpectrum(p.TC, ag, p, v.q!);
  });

  function set<K extends keyof EcSeismicInput>(k: K, x: EcSeismicInput[K]) { onchange({ ...(value ?? {}), [k]: x }); }
  const num = (e: Event) => {
    const n = parseFloat((e.currentTarget as HTMLInputElement).value.replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  };
  const dir = (axis: 'x' | 'y', on: boolean) => set('directions', { ...v.directions!, [axis]: on });
</script>

<div class="ec-form" data-testid="ec-seismic">
  <div class="ec-grid">
    <label class="ec-field"><span class="pk-label">a<sub>gR</sub>/g</span>
      <input type="number" step="0.01" min="0" value={v.agR ?? ''} oninput={(e) => set('agR', num(e))} data-testid="ec-seismic-agr" /></label>
    <label class="ec-field"><span class="pk-label">q</span>
      <input type="number" step="0.1" min="1" value={v.q ?? ''} oninput={(e) => set('q', num(e))} data-testid="ec-seismic-q" /></label>
    <label class="ec-field"><span class="pk-label">{t('loads.ec.ui.t1')}</span>
      <input type="number" step="0.01" min="0" value={v.t1 ?? ''} placeholder={t('loads.ec.ui.t1Auto')} oninput={(e) => set('t1', num(e))} /></label>
  </div>
  <div class="ec-grid">
    <label class="ec-field"><span class="pk-label">{t('loads.ec.ui.groundType')}</span>
      <select value={v.groundType ?? ''} onchange={(e) => set('groundType', (e.currentTarget.value || undefined) as GroundType)} data-testid="ec-seismic-ground">
        <option value="" disabled>{t('loads.ec.ui.choose')}</option>
        {#each GROUNDS as g (g)}<option value={g}>{g}</option>{/each}
      </select></label>
    <label class="ec-field"><span class="pk-label">{t('loads.ec.ui.spectrumType')}</span>
      <select value={String(v.spectrumType)} onchange={(e) => set('spectrumType', Number(e.currentTarget.value) as 1 | 2)}>
        <option value="1">{t('loads.ec.ui.type1')}</option><option value="2">{t('loads.ec.ui.type2')}</option>
      </select></label>
    <label class="ec-field"><span class="pk-label">{t('loads.ec.ui.importance')}</span>
      <select value={v.importance} onchange={(e) => set('importance', e.currentTarget.value as ImportanceClass)}>
        {#each CLASSES as c (c)}<option value={c}>{c} · γI = {GAMMA_I[c]}</option>{/each}
      </select></label>
  </div>
  <label class="ec-field"><span class="pk-label">{t('loads.ec.ui.periodSystem')}</span>
    <select value={v.periodSystem} onchange={(e) => set('periodSystem', e.currentTarget.value as PeriodSystem)}>
      {#each SYSTEMS as s (s)}<option value={s}>{t(`loads.ec.period.${s}`)}</option>{/each}
    </select></label>
  <label class="ec-field"><span class="pk-label">{t('loads.ec.ui.occupancy')}</span>
    <select value={v.occupancy} onchange={(e) => set('occupancy', e.currentTarget.value as EcSeismicInput['occupancy'])}>
      <option value="correlated">{t('loads.ec.ui.correlated')}</option><option value="independent">{t('loads.ec.ui.independent')}</option>
    </select></label>
  <div class="pk-row">
    <span class="pk-label">{t('loads.ec.ui.directions')}</span>
    <label class="pk-check"><input type="checkbox" checked={v.directions?.x} onchange={(e) => dir('x', e.currentTarget.checked)} data-testid="ec-seismic-dir-x" />X</label>
    <label class="pk-check"><input type="checkbox" checked={v.directions?.y} onchange={(e) => dir('y', e.currentTarget.checked)} data-testid="ec-seismic-dir-y" />Y</label>
    <label class="pk-check"><input type="checkbox" checked={v.combine30} onchange={(e) => set('combine30', e.currentTarget.checked)} />{t('loads.ec.ui.combine30')}</label>
  </div>
  {#if plateau !== null}
    <p class="pk-hint">S<sub>d</sub>(T<sub>B</sub>…T<sub>C</sub>) = {plateau.toFixed(4)} g</p>
  {:else}
    <p class="pk-warn">{t('loads.ec.ui.seismicMissing')}</p>
  {/if}
  <Hint text={t('loads.ec.ui.seismicHint')} />
</div>

<style>
  .ec-form { display: flex; flex-direction: column; gap: 0.45rem; }
  .ec-field { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
  .ec-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(5.5rem, 1fr)); gap: 0.4rem; }
</style>
