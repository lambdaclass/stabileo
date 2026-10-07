<script lang="ts">
  /**
   * The snow block of the regulation load generator: p_g from Tablas 1.1 a 1.15 (or a site
   * value), the roof's exposure, thermal condition and category, the roof's shape, and what it
   * gathers snow against (parapets, separate higher structures). The plan does the rest
   * (`engine/loads/snow-loads.ts`); this previews p_f and p_s for what is typed. Whether snow is
   * generated at all is the dialog's switch, in the panel's header.
   */
  import { t, tp } from '../../lib/i18n';
  import QuantityInput from './loads/QuantityInput.svelte';
  import { GROUND_SNOW_TABLES } from '../../lib/codes/cirsoc104/ground-snow';
  import type { RoofExposure, SnowCategory, SnowTerrain, ThermalCondition } from '../../lib/codes/cirsoc104/snow';
  import { snowPreview, type SnowConfig } from '../../lib/engine/loads/snow-config';

  interface Props {
    config: SnowConfig;
    /** The roof as the model has it, for the preview; null without roof members. */
    roof: { slopeDeg: number; W: number } | null;
  }
  let { config = $bindable(), roof }: Props = $props();
  const roofSlopeDeg = $derived(roof?.slopeDeg ?? 0);

  const table = $derived(GROUND_SNOW_TABLES.find((x) => x.table === config.table) ?? GROUND_SNOW_TABLES[0]!);
  const row = $derived(table.rows.find((r) => r.n === config.locality) ?? table.rows[0]!);
  const preview = $derived(snowPreview(config, roof));
  const shaped = $derived(config.roofKind === 'curved' || config.roofKind === 'multiple' || config.roofKind === 'dome');

  const TERRAINS: SnowTerrain[] = ['A', 'B', 'C', 'D', 'aboveTreeline'];
  const EXPOSURES: RoofExposure[] = ['full', 'partial', 'sheltered'];
  const THERMALS: ThermalCondition[] = ['normal', 'coldVentilated', 'unheated', 'greenhouse'];
  const CATEGORIES: SnowCategory[] = ['I', 'II', 'III', 'IV'];
  const ROOFS = ['gable', 'mono', 'curved', 'multiple', 'dome'] as const;
  const SIDES = ['+x', '-x', '+y', '-y'] as const;
  const f3 = (v: number) => v.toFixed(3);
</script>

<div class="al-pane-body" data-testid="al-snow-section">
  <div class="al-sub">
    <span class="al-sub-title">{t('autoLoad.snow.ground')}</span>
    <div class="al-row" role="radiogroup" aria-label={t('autoLoad.snowSource')}>
      <span class="al-label">{t('autoLoad.snowSource')}</span>
      <label class="al-check"><input type="radio" bind:group={config.fromTable} value={true} /> {t('autoLoad.snowFromTable')}</label>
      <label class="al-check"><input type="radio" bind:group={config.fromTable} value={false} data-testid="al-snow-site" /> {t('autoLoad.snowSite')}</label>
    </div>
    {#if config.fromTable}
      <div class="al-grid">
        <label class="al-field"><span class="al-label">{t('autoLoad.snowProvince')}</span>
          <select bind:value={config.table} onchange={() => (config.locality = table.rows[0]!.n)} data-testid="al-snow-province">
            {#each GROUND_SNOW_TABLES as tb (tb.table)}<option value={tb.table}>{tb.province}</option>{/each}
          </select>
        </label>
        <label class="al-field"><span class="al-label">{t('autoLoad.snowLocality')}</span>
          <select bind:value={config.locality} data-testid="al-snow-locality">
            {#each table.rows as r (r.n)}<option value={r.n}>{r.locality} ({r.district}, {r.altitudeM} m) · {r.pg} kN/m²{r.estimated ? ' *' : ''}</option>{/each}
          </select>
        </label>
      </div>
      {#if row.estimated}<p class="al-hint">* {t('autoLoad.snowEstimated')}</p>{/if}
    {:else}
      <label class="al-field al-field-narrow"><span class="al-label">pg</span>
        <QuantityInput bind:value={config.sitePg} quantity="areaLoad" min={0} testid="al-snow-pg" wrap="al-unit-field" />
      </label>
    {/if}
  </div>

  <div class="al-sub">
    <span class="al-sub-title">{t('autoLoad.snow.roofTitle')}</span>
    <div class="al-grid">
      <label class="al-field"><span class="al-label">{t('autoLoad.snowTerrain')}</span>
        <select bind:value={config.terrain}>
          {#each TERRAINS as x (x)}<option value={x}>{x === 'aboveTreeline' ? t('autoLoad.snowTerrain.aboveTreeline') : x}</option>{/each}
        </select>
      </label>
      <label class="al-field"><span class="al-label">{t('autoLoad.snowExposure')}</span>
        <select bind:value={config.exposure}>
          {#each EXPOSURES as x (x)}<option value={x}>{t(`autoLoad.snowExposure.${x}`)}</option>{/each}
        </select>
      </label>
      <label class="al-field"><span class="al-label">{t('autoLoad.snowThermal')}</span>
        <select bind:value={config.thermal}>
          {#each THERMALS as x (x)}<option value={x}>{t(`autoLoad.snowThermal.${x}`)}</option>{/each}
        </select>
      </label>
      <label class="al-field"><span class="al-label">{t('autoLoad.snowCategory')}</span>
        <select bind:value={config.category}>
          {#each CATEGORIES as x (x)}<option value={x}>{x}</option>{/each}
        </select>
      </label>
      <label class="al-field al-field-wide"><span class="al-label">{t('autoLoad.snowRoofKind')}</span>
        <select bind:value={config.roofKind} data-testid="al-snow-roofkind">
          {#each ROOFS as k (k)}<option value={k}>{t(`autoLoad.snowRoofKind.${k}`)}</option>{/each}
        </select>
      </label>
    </div>
    <p class="al-hint">{t(`autoLoad.snowRoofKind.${config.roofKind}.hint`)}</p>
    <label class="al-check"><input type="checkbox" bind:checked={config.slippery} /> {t('autoLoad.snowSlippery')}</label>
    {#if config.roofKind === 'curved'}
      <label class="al-check"><input type="checkbox" bind:checked={config.abutting} data-testid="al-snow-abutting" /> {t('autoLoad.snowAbutting')}</label>
    {/if}
    {#if preview.refused}
      <p class="al-warn" data-testid="al-snow-refused">{t(preview.refused)}</p>
    {:else}
      <p class="al-readout" data-testid="al-snow-preview">
        {shaped
          ? tp('snow.previewShaped', { pf: f3(preview.pf) })
          : tp('snow.preview', { pf: f3(preview.pf), cs: f3(preview.cs), ps: f3(preview.ps), slope: roofSlopeDeg.toFixed(1) })}
      </p>
    {/if}
  </div>

  <div class="al-sub">
    <span class="al-sub-title">{t('autoLoad.snow.patternsTitle')}</span>
    <label class="al-check"><input type="checkbox" bind:checked={config.partial} data-testid="al-snow-partial" /> {t('autoLoad.snow.partial')}</label>
    <p class="al-hint">{t('autoLoad.snow.partialHint')}</p>
  </div>

  <div class="al-sub">
    <span class="al-sub-title">{t('autoLoad.snow.driftsTitle')}</span>
    <p class="al-hint">{t('autoLoad.snow.driftsHint')}</p>
    <label class="al-field al-field-narrow"><span class="al-label">{t('autoLoad.snow.parapet')}</span>
      <QuantityInput bind:value={config.parapet} quantity="length" min={0} testid="al-snow-parapet" wrap="al-unit-field" />
    </label>
    <span class="al-label">{t('autoLoad.snow.adjacent')}</span>
    {#each config.adjacent as a, k (k)}
      <div class="al-adjacent" data-testid="al-snow-adjacent-{k}">
        <label class="al-field"><span class="al-label">{t('autoLoad.snow.adjSide')}</span>
          <select bind:value={a.side}>{#each SIDES as sd (sd)}<option value={sd}>{sd.toUpperCase()}</option>{/each}</select></label>
        <label class="al-field"><span class="al-label">{t('autoLoad.snow.adjTop')}</span>
          <QuantityInput bind:value={a.topZ} quantity="length" wrap="al-unit-field" /></label>
        <label class="al-field"><span class="al-label">{t('autoLoad.snow.adjGap')}</span>
          <QuantityInput bind:value={a.separation} quantity="length" min={0} wrap="al-unit-field" /></label>
        <label class="al-field"><span class="al-label">{t('autoLoad.snow.adjLength')}</span>
          <QuantityInput bind:value={a.length} quantity="length" min={0} wrap="al-unit-field" /></label>
        <button type="button" class="al-btn-sm" aria-label={t('autoLoad.snow.adjRemove')} onclick={() => (config.adjacent = config.adjacent.filter((_, j) => j !== k))}>×</button>
      </div>
    {/each}
    <button type="button" class="al-btn-sm al-self-start" data-testid="al-snow-adjacent-add"
      onclick={() => (config.adjacent = [...config.adjacent, { side: '+x', topZ: 10, separation: 2, length: 15 }])}>{t('autoLoad.snow.adjAdd')}</button>
  </div>
</div>

<style>
  .al-adjacent { display: grid; grid-template-columns: 4.5rem repeat(3, minmax(0, 1fr)) auto; gap: 6px; align-items: end; }
  .al-self-start { align-self: flex-start; }
</style>
