<script lang="ts">
  /**
   * The snow block of the regulation load generator: p_g from Tablas 1.1 a 1.15 (or a site
   * value), the roof's exposure, thermal condition and category, and the roof shape. The plan
   * does the rest (`engine/loads/snow-loads.ts`); this previews p_f and p_s for what is typed.
   */
  import { t, tp } from '../../lib/i18n';
  import { GROUND_SNOW_TABLES } from '../../lib/codes/cirsoc104/ground-snow';
  import {
    roofSnow, type RoofExposure, type SnowCategory, type SnowTerrain, type ThermalCondition,
  } from '../../lib/codes/cirsoc104/snow';
  import { snowPg, type SnowConfig } from '../../lib/engine/loads/snow-config';

  interface Props {
    config: SnowConfig; available: boolean;
    /** The roof as the model has it, for the preview; null without roof members. */
    roof: { slopeDeg: number; W: number } | null;
  }
  let { config = $bindable(), available, roof }: Props = $props();
  const roofSlopeDeg = $derived(roof?.slopeDeg ?? 0);

  const table = $derived(GROUND_SNOW_TABLES.find((x) => x.table === config.table) ?? GROUND_SNOW_TABLES[0]!);
  const row = $derived(table.rows.find((r) => r.n === config.locality) ?? table.rows[0]!);
  const preview = $derived.by(() => {
    const { pg } = snowPg(config);
    return roofSnow({
      pg, terrain: config.terrain, exposure: config.exposure, thermal: config.thermal, category: config.category,
      roof: { kind: config.roofKind, slopeDeg: roofSlopeDeg, W: roof?.W ?? 1, slippery: config.slippery },
    });
  });

  const TERRAINS: SnowTerrain[] = ['A', 'B', 'C', 'D', 'aboveTreeline'];
  const EXPOSURES: RoofExposure[] = ['full', 'partial', 'sheltered'];
  const THERMALS: ThermalCondition[] = ['normal', 'coldVentilated', 'unheated', 'greenhouse'];
  const CATEGORIES: SnowCategory[] = ['I', 'II', 'III', 'IV'];
  const f3 = (v: number) => v.toFixed(3);
</script>

<fieldset class="al-fieldset" data-testid="al-snow-section">
  <legend>
    <label class="al-check-legend">
      <input type="checkbox" bind:checked={config.enabled} disabled={!available} data-testid="al-enable-snow" />
      {t('autoLoad.snow')} (CIRSOC 104-2005)
    </label>
  </legend>
  {#if !available}
    <p class="al-warn">{t('autoLoad.snowNeedsRole')}</p>
  {:else if config.enabled}
    <div class="sn-row">
      <span class="al-label">{t('autoLoad.snowSource')}</span>
      <label><input type="radio" bind:group={config.fromTable} value={true} /> {t('autoLoad.snowFromTable')}</label>
      <label><input type="radio" bind:group={config.fromTable} value={false} data-testid="al-snow-site" /> {t('autoLoad.snowSite')}</label>
    </div>
    {#if config.fromTable}
      <div class="sn-row">
        <label>{t('autoLoad.snowProvince')}
          <select class="al-select-sm" bind:value={config.table} onchange={() => (config.locality = table.rows[0]!.n)} data-testid="al-snow-province">
            {#each GROUND_SNOW_TABLES as tb (tb.table)}<option value={tb.table}>{tb.province}</option>{/each}
          </select>
        </label>
        <label>{t('autoLoad.snowLocality')}
          <select class="al-select-sm" bind:value={config.locality} data-testid="al-snow-locality">
            {#each table.rows as r (r.n)}<option value={r.n}>{r.locality} ({r.district}, {r.altitudeM} m): {r.pg} kN/m²{r.estimated ? ' *' : ''}</option>{/each}
          </select>
        </label>
      </div>
      {#if row.estimated}<p class="al-hint">* {t('autoLoad.snowEstimated')}</p>{/if}
    {:else}
      <label class="sn-row">pg (kN/m²) <input type="number" class="al-input-sm" min="0" step="0.05" bind:value={config.sitePg} data-testid="al-snow-pg" /></label>
    {/if}
    <div class="al-grid">
      <label class="al-field"><span class="al-label">{t('autoLoad.snowTerrain')}</span>
        <select class="al-select-sm" bind:value={config.terrain}>
          {#each TERRAINS as x (x)}<option value={x}>{x === 'aboveTreeline' ? t('autoLoad.snowTerrain.aboveTreeline') : x}</option>{/each}
        </select>
      </label>
      <label class="al-field"><span class="al-label">{t('autoLoad.snowExposure')}</span>
        <select class="al-select-sm" bind:value={config.exposure}>
          {#each EXPOSURES as x (x)}<option value={x}>{t(`autoLoad.snowExposure.${x}`)}</option>{/each}
        </select>
      </label>
      <label class="al-field"><span class="al-label">{t('autoLoad.snowThermal')}</span>
        <select class="al-select-sm" bind:value={config.thermal}>
          {#each THERMALS as x (x)}<option value={x}>{t(`autoLoad.snowThermal.${x}`)}</option>{/each}
        </select>
      </label>
      <label class="al-field"><span class="al-label">{t('autoLoad.snowCategory')}</span>
        <select class="al-select-sm" bind:value={config.category}>
          {#each CATEGORIES as x (x)}<option value={x}>{x}</option>{/each}
        </select>
      </label>
      <label class="al-field"><span class="al-label">{t('autoLoad.snowRoofKind')}</span>
        <select class="al-select-sm" bind:value={config.roofKind} data-testid="al-snow-roofkind">
          <option value="gable">{t('autoLoad.snowRoofKind.gable')}</option>
          <option value="mono">{t('autoLoad.snowRoofKind.mono')}</option>
        </select>
      </label>
    </div>
    <label class="al-check"><input type="checkbox" bind:checked={config.slippery} /> {t('autoLoad.snowSlippery')}</label>
    {#if preview.refused}
      <p class="al-warn" data-testid="al-snow-refused">{t(preview.refused)}</p>
    {:else}
      <p class="al-hint" data-testid="al-snow-preview">
        {tp('snow.preview', { pf: f3(preview.pf), cs: f3(preview.cs), ps: f3(preview.ps), slope: roofSlopeDeg.toFixed(1) })}
      </p>
    {/if}
  {/if}
</fieldset>

<style>
  .sn-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 0.68rem; margin-bottom: 4px; }
</style>
