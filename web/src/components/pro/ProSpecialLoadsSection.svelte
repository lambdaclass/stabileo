<script lang="ts" module>
  export interface SpecialLoadsConfig {
    thermal: { on: boolean; dt: number; grad: number };
    /** `side`: a plan point in the retained soil; off, the side is read off the plan (`special-loads.ts`). */
    soil: { on: boolean; gradeZ: number; gamma: number; k: number; surcharge: number; permanent: boolean; sideOn: boolean; sideX: number; sideY: number };
    /** `inside`: a plan point inside the fluid; off, the walls that close a region in. */
    fluid: { on: boolean; levelZ: number; gamma: number; insideOn: boolean; insideX: number; insideY: number };
  }
  export const defaultSpecialLoads = (): SpecialLoadsConfig => ({
    thermal: { on: false, dt: 20, grad: 0 },
    soil: { on: false, gradeZ: 0, gamma: 17.3, k: 0.5, surcharge: 0, permanent: true, sideOn: false, sideX: 0, sideY: 0 },
    fluid: { on: false, levelZ: 3, gamma: 10, insideOn: false, insideX: 0, insideY: 0 },
  });
  /** CIRSOC 101-2025 Tabla 3.2, soil unit weights, kN/m³. */
  export const SOIL_WEIGHTS: ReadonlyArray<{ key: string; gamma: number }> = [
    { key: 'clayDry', gamma: 9.9 }, { key: 'clayWet', gamma: 17.3 }, { key: 'clayGravelDry', gamma: 15.7 },
    { key: 'sandGravelLoose', gamma: 15.7 }, { key: 'sandGravelDense', gamma: 17.3 }, { key: 'sandGravelWet', gamma: 18.9 },
    { key: 'siltLoose', gamma: 12.3 }, { key: 'siltCompact', gamma: 15.1 }, { key: 'siltVeryWet', gamma: 17 },
    { key: 'clayUnder', gamma: 12.6 }, { key: 'sandUnder', gamma: 9.4 }, { key: 'sandClayUnder', gamma: 10.2 },
    { key: 'riverMud', gamma: 14.1 }, { key: 'topsoil', gamma: 11 },
  ];
</script>

<script lang="ts">
  /**
   * T, H and F in the regulation load generator (`engine/loads/special-loads.ts`): a temperature
   * change on every member and shell, in both senses, the soil's lateral pressure on the vertical
   * shells below the grade that retain it, and a fluid's pressure below its level on the shells that
   * hold it; a point in plan on the soil's side, or inside the fluid, says which when the plan
   * cannot (a lone retaining wall).
   */
  import { t } from '../../lib/i18n';
  import QuantityInput from './loads/QuantityInput.svelte';

  interface Props { config: SpecialLoadsConfig }
  let { config = $bindable() }: Props = $props();

  /*
   * An emptied number field reaches bind:value as null, and the plan used to take it: a null ΔT
   * put {dtUniform: null} on every member, an empty level or point read as 0. Only a number is
   * written; an emptied field keeps the value before it, and shows it again on leaving.
   */
  const setNum = <K extends string>(o: Record<K, number>, k: K) => (v: number | null) => {
    if (typeof v === 'number' && Number.isFinite(v)) o[k] = v;
  };
  const reshow = (v: number) => (e: FocusEvent) => {
    const el = e.currentTarget as HTMLInputElement;
    if (!Number.isFinite(el.valueAsNumber)) el.value = String(v);
  };
</script>

<div class="al-pane-body" data-testid="al-special-section">
  <div class="al-sub">
    <label class="al-check"><input type="checkbox" bind:checked={config.thermal.on} data-testid="al-thermal" /> {t('autoLoad.special.thermal')}</label>
    {#if config.thermal.on}
      <div class="al-row">
        <label class="al-field al-field-narrow"><span class="al-label">ΔT</span>
          <span class="al-unit-field"><input type="number" step="5" bind:value={() => config.thermal.dt, setNum(config.thermal, 'dt')} onblur={reshow(config.thermal.dt)} data-testid="al-thermal-dt" /><span>°C</span></span></label>
        <label class="al-field al-field-narrow"><span class="al-label">{t('autoLoad.special.gradient')}</span>
          <span class="al-unit-field"><input type="number" step="5" bind:value={() => config.thermal.grad, setNum(config.thermal, 'grad')} onblur={reshow(config.thermal.grad)} /><span>°C</span></span></label>
      </div>
    {/if}
  </div>
  <div class="al-sub">
    <label class="al-check"><input type="checkbox" bind:checked={config.soil.on} data-testid="al-soil" /> {t('autoLoad.special.soil')}</label>
    {#if config.soil.on}
      <div class="al-row">
        <label class="al-field al-field-narrow"><span class="al-label">{t('autoLoad.special.grade')}</span>
          <span class="al-unit-field"><input type="number" step="0.5" bind:value={() => config.soil.gradeZ, setNum(config.soil, 'gradeZ')} onblur={reshow(config.soil.gradeZ)} data-testid="al-soil-grade" /><span>m</span></span></label>
        <label class="al-field"><span class="al-label">{t('autoLoad.special.soilType')}</span>
          <select value={SOIL_WEIGHTS.find((s) => s.gamma === config.soil.gamma)?.key ?? ''} onchange={(e) => { const s = SOIL_WEIGHTS.find((x) => x.key === e.currentTarget.value); if (s) config.soil.gamma = s.gamma; }}>
            <option value="" disabled>{t('autoLoad.special.typed')}</option>
            {#each SOIL_WEIGHTS as s (s.key)}<option value={s.key}>{t(`autoLoad.special.soil.${s.key}`)} · {s.gamma}</option>{/each}
          </select></label>
        <label class="al-field al-field-narrow"><span class="al-label">γ</span>
          <span class="al-unit-field"><input type="number" step="0.1" bind:value={() => config.soil.gamma, setNum(config.soil, 'gamma')} onblur={reshow(config.soil.gamma)} data-testid="al-soil-gamma" /><span>kN/m³</span></span></label>
        <label class="al-field al-field-narrow"><span class="al-label">K</span>
          <input type="number" step="0.05" min="0" max="1.5" bind:value={() => config.soil.k, setNum(config.soil, 'k')} onblur={reshow(config.soil.k)} data-testid="al-soil-k" /></label>
        <label class="al-field al-field-narrow"><span class="al-label">{t('autoLoad.special.surcharge')}</span>
          <QuantityInput bind:value={config.soil.surcharge} quantity="areaLoad" min={0} wrap="al-unit-field" /></label>
      </div>
      <label class="al-check"><input type="checkbox" bind:checked={config.soil.permanent} /> {t('autoLoad.special.permanent')}</label>
      <label class="al-check"><input type="checkbox" bind:checked={config.soil.sideOn} data-testid="al-soil-side" /> {t('autoLoad.special.soilSide')}</label>
      {#if config.soil.sideOn}
        <div class="al-row">
          <label class="al-field al-field-narrow"><span class="al-label">X</span>
            <span class="al-unit-field"><input type="number" step="0.5" bind:value={() => config.soil.sideX, setNum(config.soil, 'sideX')} onblur={reshow(config.soil.sideX)} data-testid="al-soil-side-x" /><span>m</span></span></label>
          <label class="al-field al-field-narrow"><span class="al-label">Y</span>
            <span class="al-unit-field"><input type="number" step="0.5" bind:value={() => config.soil.sideY, setNum(config.soil, 'sideY')} onblur={reshow(config.soil.sideY)} data-testid="al-soil-side-y" /><span>m</span></span></label>
        </div>
      {/if}
      <p class="al-hint">{t('autoLoad.special.soilHint')}</p>
    {/if}
  </div>
  <div class="al-sub">
    <label class="al-check"><input type="checkbox" bind:checked={config.fluid.on} data-testid="al-fluid" /> {t('autoLoad.special.fluid')}</label>
    {#if config.fluid.on}
      <div class="al-row">
        <label class="al-field al-field-narrow"><span class="al-label">{t('autoLoad.special.level')}</span>
          <span class="al-unit-field"><input type="number" step="0.5" bind:value={() => config.fluid.levelZ, setNum(config.fluid, 'levelZ')} onblur={reshow(config.fluid.levelZ)} data-testid="al-fluid-level" /><span>m</span></span></label>
        <label class="al-field al-field-narrow"><span class="al-label">γ</span>
          <span class="al-unit-field"><input type="number" step="0.1" bind:value={() => config.fluid.gamma, setNum(config.fluid, 'gamma')} onblur={reshow(config.fluid.gamma)} /><span>kN/m³</span></span></label>
      </div>
      <label class="al-check"><input type="checkbox" bind:checked={config.fluid.insideOn} data-testid="al-fluid-inside" /> {t('autoLoad.special.fluidInside')}</label>
      {#if config.fluid.insideOn}
        <div class="al-row">
          <label class="al-field al-field-narrow"><span class="al-label">X</span>
            <span class="al-unit-field"><input type="number" step="0.5" bind:value={() => config.fluid.insideX, setNum(config.fluid, 'insideX')} onblur={reshow(config.fluid.insideX)} data-testid="al-fluid-inside-x" /><span>m</span></span></label>
          <label class="al-field al-field-narrow"><span class="al-label">Y</span>
            <span class="al-unit-field"><input type="number" step="0.5" bind:value={() => config.fluid.insideY, setNum(config.fluid, 'insideY')} onblur={reshow(config.fluid.insideY)} data-testid="al-fluid-inside-y" /><span>m</span></span></label>
        </div>
      {/if}
      <p class="al-hint">{t('autoLoad.special.fluidHint')}</p>
    {/if}
  </div>
</div>
