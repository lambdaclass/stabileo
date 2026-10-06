<script lang="ts" module>
  export interface RoofConfig {
    enabled: boolean;
    use: 'maintenance' | 'occupancy';
    /** Superimposed dead load of the roof, kN/m²; null: the floors'. */
    dead: number | null;
    /** null: from the roof's structure and dead load (heavy above 0,5 kN/m², `roofWeightOf`). */
    weight: 'heavy' | 'light' | null;
    occupancyKey: string;
    /** Roof slope, degrees; null: the model's roof. */
    slopeDeg: number | null;
  }
  export const defaultRoofConfig = (): RoofConfig => ({
    enabled: true, use: 'maintenance', dead: null, weight: null, occupancyKey: 'azotea_privada', slopeDeg: null,
  });

  import { roofLiveLoad as lrOf, roofWeightClass as weightOf } from '../../lib/codes/cirsoc101/roof-live';
  /**
   * Lr over a member of large (80 m²) and small (10 m²) tributary area, kN/m², for the readouts.
   * `autoWeight`: the class the plan finds for the roof's structure and cladding (`roofWeightFor`);
   * absent, the dead load's alone.
   */
  export function roofLrRange(c: RoofConfig, floorDead: number, modelSlopeDeg: number, autoWeight?: 'heavy' | 'light'): { lo: number; hi: number } {
    const weight = c.weight ?? autoWeight ?? weightOf(c.dead ?? floorDead);
    const pct = Math.tan(((c.slopeDeg ?? modelSlopeDeg) * Math.PI) / 180) * 100;
    return { lo: lrOf({ weight, atM2: 80, slopePercent: pct }).lr, hi: lrOf({ weight, atM2: 10, slopePercent: pct }).lr };
  }
</script>

<script lang="ts">
  /**
   * The roof block of the regulation load generator: what the members nothing higher covers
   * carry (`engine/loads/plan-area-loads.ts`). A roof reached only for maintenance takes the roof
   * live load Lr of CIRSOC 101 §4.8.1, heavy or light, with R1 by each member's area and R2 by
   * the slope; a roof used as a terrace or a garden takes that occupancy's live load (§4.8.2).
   */
  import { t, tp } from '../../lib/i18n';
  import { toQ, unitQ } from '../../lib/store/display-units.svelte';
  import { uiStore } from '../../lib/store/ui.svelte';
  import { fromDisplay } from '../../lib/utils/units';
  import { parseDecimal } from '../../lib/utils/numeric-input';
  import { OCCUPANCY_TABLE_2025 } from '../../lib/codes/cirsoc101/live-loads';
  import { roofWeightClass } from '../../lib/codes/cirsoc101/roof-live';

  interface Props {
    config: RoofConfig;
    /** The floors' superimposed dead load, kN/m². */
    floorDead: number;
    /** The model's roof slope, degrees, when it has one. */
    modelSlopeDeg: number;
    /** The weight class the plan finds for the roof (§4.8.1, structure and cladding, `roofWeightFor`). */
    autoWeight?: 'heavy' | 'light';
  }
  let { config = $bindable(), floorDead, modelSlopeDeg, autoWeight }: Props = $props();

  const roofRows = OCCUPANCY_TABLE_2025.filter((o) => o.category === 'roof' && o.uniformKNm2 !== null && !o.key.startsWith('cubierta_usual') && o.key !== 'azotea_inaccesible' && o.key !== 'cubierta_otras');
  const dead = $derived(config.dead ?? floorDead);

</script>

<div class="al-pane-body" data-testid="al-roof-section">
      <p class="al-hint">{t('autoLoad.roof.hint')}</p>
      <div class="al-row">
        <label class="al-field"><span class="al-label">{t('autoLoad.roof.use')}</span>
          <select bind:value={config.use} data-testid="al-roof-use">
            <option value="maintenance">{t('autoLoad.roof.maintenance')}</option>
            <option value="occupancy">{t('autoLoad.roof.occupancy')}</option>
          </select>
        </label>
        <label class="al-field al-field-narrow"><span class="al-label">{t('autoLoad.roof.dead')}</span>
          <span class="al-unit-field"><input type="text" inputmode="decimal" value={config.dead === null ? '' : +toQ(config.dead, 'areaLoad').toPrecision(6)} placeholder={toQ(floorDead, 'areaLoad').toFixed(2)}
            onchange={(e) => { const v = parseDecimal(e.currentTarget.value); config.dead = v !== null && v >= 0 ? fromDisplay(v, 'areaLoad', uiStore.unitSystem) : null; }} data-testid="al-roof-dead" /><span>{unitQ('areaLoad')}</span></span>
        </label>
      </div>
      {#if config.use === 'maintenance'}
        <div class="al-row">
          <label class="al-field"><span class="al-label">{t('autoLoad.roof.weight')}</span>
            <select value={config.weight ?? 'auto'} onchange={(e) => { const v = e.currentTarget.value; config.weight = v === 'auto' ? null : (v as 'heavy' | 'light'); }} data-testid="al-roof-weight">
              <option value="auto">{tp('autoLoad.roof.weightAuto', { w: t(`loads.cirsoc101.roofWeight.${autoWeight ?? roofWeightClass(dead)}`) })}</option>
              <option value="heavy">{t('autoLoad.roof.heavy')}</option>
              <option value="light">{t('autoLoad.roof.light')}</option>
            </select>
          </label>
          <label class="al-field al-field-narrow"><span class="al-label">{t('autoLoad.roof.slope')}</span>
            <span class="al-unit-field"><input type="number" step="1" min="0" max="80" value={config.slopeDeg ?? ''} placeholder={modelSlopeDeg.toFixed(1)}
              onchange={(e) => { const v = parseFloat(e.currentTarget.value); config.slopeDeg = Number.isFinite(v) && v >= 0 ? v : null; }} data-testid="al-roof-slope" /><span>°</span></span>
          </label>
        </div>
        <p class="al-hint">{t('autoLoad.roof.weightHint')}</p>
      {:else}
        <label class="al-field"><span class="al-label">{t('loads.cirsoc101.occupancy')}</span>
          <select bind:value={config.occupancyKey} data-testid="al-roof-occupancy">
            {#each roofRows as o (o.key)}<option value={o.key}>{t(o.labelKey)} · {o.uniformKNm2} kN/m²</option>{/each}
          </select>
        </label>
      {/if}
</div>
