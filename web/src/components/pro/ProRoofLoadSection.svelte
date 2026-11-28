<script lang="ts" module>
  import Hint from './Hint.svelte';
  import OccupancySelect from './OccupancySelect.svelte';
  // The config, its default and its dead load's reader live with the dialog's other sections
  // (`auto-loads-sections.ts`).
  import { readRoofDead, type RoofConfig } from './auto-loads-sections';
  import type { ImposedLoadCode } from '../../lib/codes/families/load-codes';
  export { roofLrRange } from './roof-live-range';
</script>

<script lang="ts">
  /**
   * The roof block of the regulation load generator: what the members nothing higher covers
   * carry (`engine/loads/plan-area-loads.ts`). A roof reached only for maintenance takes the roof
   * live load Lr of CIRSOC 101 §4.8.1, heavy or light, with R1 by each member's area and R2 by
   * the slope; a roof used as a terrace or a garden takes that occupancy's live load (§4.8.2).
   */
  import { t, tp } from '../../lib/i18n';
  import { te } from '../../lib/i18n/engine-text';
  import type { EngineMessage } from '../../lib/codes/message';
  import { toQ, unitQ } from '../../lib/store/display-units.svelte';
  import { uiStore } from '../../lib/store/ui.svelte';
  import { fromDisplay } from '../../lib/utils/units';
  import { OCCUPANCY_TABLE_2025 } from '../../lib/codes/cirsoc101/live-loads';
  import { roofWeightClass } from '../../lib/codes/cirsoc101/roof-live';

  interface Props {
    config: RoofConfig;
    /** The floors' superimposed dead load, kN/m². */
    floorDead: number;
    /** The model's roof slope, degrees, when it has one. */
    modelSlopeDeg: number;
    /** The weight class the plan finds for the roof (§4.8.1, structure and cladding, `roofWeightFor`). */
    autoWeight?: 'heavy' | 'light' | EngineMessage;
    /** The project's imposed loads code; absent, CIRSOC 101. */
    code?: ImposedLoadCode;
  }
  let { config = $bindable(), floorDead, modelSlopeDeg, autoWeight, code }: Props = $props();

  const foreign = $derived(__PUBLIC_FEATURES__.proPlatesUnified && !!code && code.family !== 'cirsoc');
  const roofRows = $derived((foreign ? code?.roofOccupancies?.() : undefined)?.filter((o) => o.uniformKNm2 !== null)
    ?? OCCUPANCY_TABLE_2025.filter((o) => o.category === 'roof' && o.uniformKNm2 !== null && !o.key.startsWith('cubierta_usual') && o.key !== 'azotea_inaccesible' && o.key !== 'cubierta_otras'));
  const weighted = $derived(!foreign || !code?.roofLive);
  const dead = $derived(config.dead ?? floorDead);
  const autoWeightError = $derived(typeof autoWeight === 'object' ? autoWeight : undefined);
  const weightLabel = $derived(typeof autoWeight === 'object' ? t('autoLoad.blocked')
    : tp('autoLoad.roof.weightAuto', { w: t(`loads.cirsoc101.roofWeight.${autoWeight ?? roofWeightClass(dead)}`) }));
  const deadText = (d: number | null) => (d === null ? '' : String(+toQ(d, 'areaLoad').toPrecision(6)));
  /** A value that does not read keeps the one there was, and the field shows it again. */
  function setDead(el: HTMLInputElement) {
    config.dead = readRoofDead(el.value, config.dead, (v) => fromDisplay(v, 'areaLoad', uiStore.unitSystem));
    el.value = deadText(config.dead);
  }

</script>

<div class="al-pane-body" data-testid="al-roof-section">
      <Hint text={t('autoLoad.roof.hint')} />
      {#if autoWeightError}<p class="al-error" role="alert">{te(autoWeightError)}</p>{/if}
      <div class="al-row">
        <label class="al-field"><span class="al-label">{t('autoLoad.roof.use')}</span>
          <select bind:value={config.use} data-testid="al-roof-use">
            <option value="maintenance">{t(foreign ? 'autoLoad.roof.maintenanceCode' : 'autoLoad.roof.maintenance')}</option>
            <option value="occupancy">{t(foreign ? 'autoLoad.roof.occupancyCode' : 'autoLoad.roof.occupancy')}</option>
          </select>
        </label>
        <label class="al-field al-field-narrow"><span class="al-label">{t('autoLoad.roof.dead')}</span>
          <span class="al-unit-field"><input type="text" inputmode="decimal" value={deadText(config.dead)} placeholder={toQ(floorDead, 'areaLoad').toFixed(2)}
            onchange={(e) => setDead(e.currentTarget)} data-testid="al-roof-dead" /><span>{unitQ('areaLoad')}</span></span>
        </label>
      </div>
      {#if config.use === 'maintenance'}
        <div class="al-row">
          {#if weighted}
          <label class="al-field"><span class="al-label">{t('autoLoad.roof.weight')}</span>
            <select value={config.weight ?? 'auto'} onchange={(e) => { const v = e.currentTarget.value; config.weight = v === 'auto' ? null : (v as 'heavy' | 'light'); }} data-testid="al-roof-weight">
              <option value="auto">{weightLabel}</option>
              <option value="heavy">{t('autoLoad.roof.heavy')}</option>
              <option value="light">{t('autoLoad.roof.light')}</option>
            </select>
          </label>
          {/if}
          <label class="al-field al-field-narrow"><span class="al-label">{t('autoLoad.roof.slope')}</span>
            <span class="al-unit-field"><input type="number" step="1" min="0" max="80" value={config.slopeDeg ?? ''} placeholder={modelSlopeDeg.toFixed(1)}
              onchange={(e) => { const v = parseFloat(e.currentTarget.value); config.slopeDeg = Number.isFinite(v) && v >= 0 ? v : null; }} data-testid="al-roof-slope" /><span>°</span></span>
          </label>
        </div>
        {#if weighted}<Hint text={t('autoLoad.roof.weightHint')} />{/if}
      {:else}
        <label class="al-field" for="al-roof-occupancy"><span class="al-label">{t(foreign ? 'autoLoad.roof.occupancyOf' : 'loads.cirsoc101.occupancy')}</span>
          <OccupancySelect id="al-roof-occupancy" value={config.occupancyKey} rows={roofRows}
            formatPressure={q => `${q} kN/m²`} choose={key => { config.occupancyKey = key; }} />
        </label>
      {/if}
</div>
