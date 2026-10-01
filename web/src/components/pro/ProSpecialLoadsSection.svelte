<script lang="ts" module>
  export interface SpecialLoadsConfig {
    thermal: { on: boolean; dt: number; grad: number };
    soil: { on: boolean; gradeZ: number; gamma: number; k: number; surcharge: number; permanent: boolean };
    fluid: { on: boolean; levelZ: number; gamma: number };
  }
  export const defaultSpecialLoads = (): SpecialLoadsConfig => ({
    thermal: { on: false, dt: 20, grad: 0 },
    soil: { on: false, gradeZ: 0, gamma: 17.3, k: 0.5, surcharge: 0, permanent: true },
    fluid: { on: false, levelZ: 3, gamma: 10 },
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
   * change on every member and shell, the soil's lateral pressure on the vertical shells below the
   * grade, and a fluid's pressure below its level.
   */
  import { t } from '../../lib/i18n';

  interface Props { config: SpecialLoadsConfig }
  let { config = $bindable() }: Props = $props();
</script>

<section class="al-sec" data-testid="al-special-section">
  <div class="al-sec-head"><span class="al-sec-title">{t('autoLoad.special.title')}</span><span class="al-sec-code">CIRSOC 101-2025 §2.2, §2.3.2, §2.3.4</span></div>
  <div class="al-sec-body">
    <label class="al-check"><input type="checkbox" bind:checked={config.thermal.on} data-testid="al-thermal" /> {t('autoLoad.special.thermal')}</label>
    {#if config.thermal.on}
      <div class="al-row">
        <label class="al-field al-field-narrow"><span class="al-label">ΔT</span>
          <span class="al-unit-field"><input type="number" step="5" bind:value={config.thermal.dt} data-testid="al-thermal-dt" /><span>°C</span></span></label>
        <label class="al-field al-field-narrow"><span class="al-label">{t('autoLoad.special.gradient')}</span>
          <span class="al-unit-field"><input type="number" step="5" bind:value={config.thermal.grad} /><span>°C</span></span></label>
      </div>
    {/if}
    <label class="al-check"><input type="checkbox" bind:checked={config.soil.on} data-testid="al-soil" /> {t('autoLoad.special.soil')}</label>
    {#if config.soil.on}
      <div class="al-row">
        <label class="al-field al-field-narrow"><span class="al-label">{t('autoLoad.special.grade')}</span>
          <span class="al-unit-field"><input type="number" step="0.5" bind:value={config.soil.gradeZ} data-testid="al-soil-grade" /><span>m</span></span></label>
        <label class="al-field"><span class="al-label">{t('autoLoad.special.soilType')}</span>
          <select value={SOIL_WEIGHTS.find((s) => s.gamma === config.soil.gamma)?.key ?? ''} onchange={(e) => { const s = SOIL_WEIGHTS.find((x) => x.key === e.currentTarget.value); if (s) config.soil.gamma = s.gamma; }}>
            <option value="" disabled>{t('autoLoad.special.typed')}</option>
            {#each SOIL_WEIGHTS as s (s.key)}<option value={s.key}>{t(`autoLoad.special.soil.${s.key}`)} · {s.gamma}</option>{/each}
          </select></label>
        <label class="al-field al-field-narrow"><span class="al-label">γ</span>
          <span class="al-unit-field"><input type="number" step="0.1" bind:value={config.soil.gamma} data-testid="al-soil-gamma" /><span>kN/m³</span></span></label>
        <label class="al-field al-field-narrow"><span class="al-label">K</span>
          <input type="number" step="0.05" min="0" max="1.5" bind:value={config.soil.k} data-testid="al-soil-k" /></label>
        <label class="al-field al-field-narrow"><span class="al-label">{t('autoLoad.special.surcharge')}</span>
          <span class="al-unit-field"><input type="number" step="1" min="0" bind:value={config.soil.surcharge} /><span>kN/m²</span></span></label>
      </div>
      <label class="al-check"><input type="checkbox" bind:checked={config.soil.permanent} /> {t('autoLoad.special.permanent')}</label>
      <p class="al-hint">{t('autoLoad.special.soilHint')}</p>
    {/if}
    <label class="al-check"><input type="checkbox" bind:checked={config.fluid.on} data-testid="al-fluid" /> {t('autoLoad.special.fluid')}</label>
    {#if config.fluid.on}
      <div class="al-row">
        <label class="al-field al-field-narrow"><span class="al-label">{t('autoLoad.special.level')}</span>
          <span class="al-unit-field"><input type="number" step="0.5" bind:value={config.fluid.levelZ} data-testid="al-fluid-level" /><span>m</span></span></label>
        <label class="al-field al-field-narrow"><span class="al-label">γ</span>
          <span class="al-unit-field"><input type="number" step="0.1" bind:value={config.fluid.gamma} /><span>kN/m³</span></span></label>
      </div>
      <p class="al-hint">{t('autoLoad.special.fluidHint')}</p>
    {/if}
  </div>
</section>
