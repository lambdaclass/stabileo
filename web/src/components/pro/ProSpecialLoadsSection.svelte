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
  import { fmtQ, unitQ } from '../../lib/store/display-units.svelte';

  interface Props { config: SpecialLoadsConfig }
  let { config = $bindable() }: Props = $props();
</script>

<div class="al-pane-body" data-testid="al-special-section">
  <div class="al-sub">
    <label class="al-check"><input type="checkbox" bind:checked={config.thermal.on} data-testid="al-thermal" /> {t('autoLoad.special.thermal')}</label>
    {#if config.thermal.on}
      <div class="al-row">
        <label class="al-field al-field-narrow"><span class="al-label">ΔT</span>
          <QuantityInput bind:value={config.thermal.dt} quantity="temperatureDiff" testid="al-thermal-dt" wrap="al-unit-field" /></label>
        <label class="al-field al-field-narrow"><span class="al-label">{t('autoLoad.special.gradient')}</span>
          <QuantityInput bind:value={config.thermal.grad} quantity="temperatureDiff" wrap="al-unit-field" /></label>
      </div>
    {/if}
  </div>
  <div class="al-sub">
    <label class="al-check"><input type="checkbox" bind:checked={config.soil.on} data-testid="al-soil" /> {t('autoLoad.special.soil')}</label>
    {#if config.soil.on}
      <div class="al-row">
        <label class="al-field al-field-narrow"><span class="al-label">{t('autoLoad.special.grade')}</span>
          <QuantityInput bind:value={config.soil.gradeZ} quantity="length" testid="al-soil-grade" wrap="al-unit-field" /></label>
        <label class="al-field"><span class="al-label">{t('autoLoad.special.soilType')}</span>
          <select value={SOIL_WEIGHTS.find((s) => s.gamma === config.soil.gamma)?.key ?? ''} onchange={(e) => { const s = SOIL_WEIGHTS.find((x) => x.key === e.currentTarget.value); if (s) config.soil.gamma = s.gamma; }}>
            <option value="" disabled>{t('autoLoad.special.typed')}</option>
            {#each SOIL_WEIGHTS as s (s.key)}<option value={s.key}>{t(`autoLoad.special.soil.${s.key}`)} · {fmtQ(s.gamma, 'density')} {unitQ('density')}</option>{/each}
          </select></label>
        <label class="al-field al-field-narrow"><span class="al-label">γ</span>
          <QuantityInput bind:value={config.soil.gamma} quantity="density" testid="al-soil-gamma" wrap="al-unit-field" /></label>
        <label class="al-field al-field-narrow"><span class="al-label">K</span>
          <input type="number" step="0.05" min="0" max="1.5" bind:value={config.soil.k} data-testid="al-soil-k" /></label>
        <label class="al-field al-field-narrow"><span class="al-label">{t('autoLoad.special.surcharge')}</span>
          <QuantityInput bind:value={config.soil.surcharge} quantity="areaLoad" min={0} wrap="al-unit-field" /></label>
      </div>
      <label class="al-check"><input type="checkbox" bind:checked={config.soil.permanent} /> {t('autoLoad.special.permanent')}</label>
      <label class="al-check"><input type="checkbox" bind:checked={config.soil.sideOn} data-testid="al-soil-side" /> {t('autoLoad.special.soilSide')}</label>
      {#if config.soil.sideOn}
        <div class="al-row">
          <label class="al-field al-field-narrow"><span class="al-label">X</span>
            <QuantityInput bind:value={config.soil.sideX} quantity="length" testid="al-soil-side-x" wrap="al-unit-field" /></label>
          <label class="al-field al-field-narrow"><span class="al-label">Y</span>
            <QuantityInput bind:value={config.soil.sideY} quantity="length" testid="al-soil-side-y" wrap="al-unit-field" /></label>
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
          <QuantityInput bind:value={config.fluid.levelZ} quantity="length" testid="al-fluid-level" wrap="al-unit-field" /></label>
        <label class="al-field al-field-narrow"><span class="al-label">γ</span>
          <QuantityInput bind:value={config.fluid.gamma} quantity="density" wrap="al-unit-field" /></label>
      </div>
      <label class="al-check"><input type="checkbox" bind:checked={config.fluid.insideOn} data-testid="al-fluid-inside" /> {t('autoLoad.special.fluidInside')}</label>
      {#if config.fluid.insideOn}
        <div class="al-row">
          <label class="al-field al-field-narrow"><span class="al-label">X</span>
            <QuantityInput bind:value={config.fluid.insideX} quantity="length" testid="al-fluid-inside-x" wrap="al-unit-field" /></label>
          <label class="al-field al-field-narrow"><span class="al-label">Y</span>
            <QuantityInput bind:value={config.fluid.insideY} quantity="length" testid="al-fluid-inside-y" wrap="al-unit-field" /></label>
        </div>
      {/if}
      <p class="al-hint">{t('autoLoad.special.fluidHint')}</p>
    {/if}
  </div>
</div>
