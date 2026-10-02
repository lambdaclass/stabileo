<script lang="ts">
  /**
   * The components and cladding pressures of CIRSOC 102 Cap. 5 for a building
   * (`codes/cirsoc102/cladding.ts`), as a table for the elements' own design: Parte 1 up to 20 m,
   * Parte 2 above, by the roof's kind, with the parapet and the element's height Parte 2 reads.
   */
  import { t, tp } from '../../lib/i18n';
  import { claddingPressures, type CladdingRoof } from '../../lib/codes/cirsoc102/cladding';
  import { velocityPressure, internalPressureCoefficient, type Enclosure, type Exposure } from '../../lib/codes/cirsoc102/wind';

  interface Props {
    speed: number; exposure: Exposure; altitude: number; kzt: number; enclosure: Enclosure;
    /** Mean roof height, least plan dimension and roof slope of the model. */
    height: number; leastDimension: number; roofSlopeDeg: number;
    /** The roof's kind as the snow block has it, for the first guess. */
    roofHint?: CladdingRoof;
  }
  let { speed, exposure, altitude, kzt, enclosure, height, leastDimension, roofSlopeDeg, roofHint = 'gable' }: Props = $props();

  let area = $state(1);
  let roof = $state<CladdingRoof | null>(null);
  let parapet = $state(false);
  let lowRise = $state(false);
  /** The element's height above the ground, m; null: the roof's. */
  let z = $state<number | null>(null);
  const kind = $derived(roof ?? roofHint);
  const q = (at: number) => velocityPressure(at, {
    basicSpeed: speed, exposure, siteAltitudeM: altitude, kzt, kztSurveyed: true, structureKind: 'building',
    enclosure, meanRoofHeight: height, L: leastDimension, B: leastDimension, roofSlopeDeg, rigid: true,
  });
  const cladding = $derived.by(() => {
    if (!(height > 0)) return null;
    const qh = q(height);
    const qz = height > 20 ? q(Math.min(Math.max(z ?? height, 0), height)) : qh;
    return { qh, qz, r: claddingPressures({
      qhNm2: qh, qzNm2: qz, meanRoofHeight: height, leastDimension, roofSlopeDeg, roof: kind, parapet, lowRise,
      gcpi: internalPressureCoefficient(enclosure), areaM2: area,
    }) };
  });
  const ROOFS: CladdingRoof[] = ['gable', 'hip', 'monoslope', 'sawtooth'];
  /** The sawtooth's zone 3 differs on the first span (A) and the others (B to D). */
  const zoneLabel = (z: string) => (z === '3A' ? '3 (A)' : z === '3BCD' ? '3 (B–D)' : z);
</script>

{#if cladding}
  <div class="al-sub" data-testid="al-cladding">
    <span class="al-sub-title">{t('wind.cladding.title')}</span>
    <div class="al-grid">
      <label class="al-field"><span class="al-label">{t('wind.cladding.area')}</span>
        <span class="al-unit-field"><input type="number" min="0.1" step="0.5" bind:value={area} data-testid="al-cladding-area" /><span>m²</span></span>
      </label>
      <label class="al-field"><span class="al-label">{t('wind.cladding.roofKind')}</span>
        <select value={kind} onchange={(e) => (roof = e.currentTarget.value as CladdingRoof)} data-testid="al-cladding-roof">
          {#each ROOFS as r (r)}<option value={r}>{t(`wind.cladding.roofKind.${r}`)}</option>{/each}
        </select>
      </label>
      {#if height > 20 && !(lowRise && cladding.r.lowRiseAllowed)}
        <label class="al-field"><span class="al-label">{t('wind.cladding.z')}</span>
          <span class="al-unit-field"><input type="number" min="0" step="1" value={z ?? ''} placeholder={height.toFixed(1)}
            onchange={(e) => { const v = parseFloat(e.currentTarget.value); z = Number.isFinite(v) && v >= 0 ? v : null; }} data-testid="al-cladding-z" /><span>m</span></span>
        </label>
      {/if}
    </div>
    {#if height > 20}
      <label class="al-check"><input type="checkbox" bind:checked={parapet} data-testid="al-cladding-parapet" /> {t('wind.cladding.parapet')}</label>
      {#if cladding.r.lowRiseAllowed}
        <label class="al-check"><input type="checkbox" bind:checked={lowRise} data-testid="al-cladding-lowrise" /> {t('wind.cladding.lowRise')}</label>
      {/if}
    {/if}
    {#if cladding.r.refused}
      <p class="al-warn" data-testid="al-cladding-refused">{t(`wind.cladding.refused.${cladding.r.refused}`)}</p>
    {:else}
      <p class="al-hint">{tp(cladding.r.part === 1 ? 'wind.cladding.basis' : 'wind.cladding.basisHigh', {
        qh: (cladding.qh / 1000).toFixed(3), qz: (cladding.qz / 1000).toFixed(3),
        a: cladding.r.aWalls?.toFixed(2) ?? '—', aRoof: cladding.r.aRoof?.toFixed(2) ?? t('wind.cladding.aDrawn'),
      })}</p>
      <table class="al-table" data-testid="al-cladding-table">
        <thead><tr><th>{t('wind.cladding.surface')}</th><th>{t('wind.cladding.zone')}</th><th>GCp +</th><th>GCp −</th><th>p + (kN/m²)</th><th>p − (kN/m²)</th></tr></thead>
        <tbody>
          {#each cladding.r.rows as r (r.surface + r.zone)}
            <tr><td>{t(`wind.cladding.${r.surface}`)}</td><td>{zoneLabel(r.zone)}</td><td>{r.gcpPos === null ? '—' : r.gcpPos.toFixed(2)}</td><td>{r.gcpNeg.toFixed(2)}</td><td>{r.pPos.toFixed(3)}</td><td>{r.pNeg.toFixed(3)}</td></tr>
          {/each}
        </tbody>
      </table>
      <p class="al-hint">{t('wind.cladding.note')}</p>
    {/if}
  </div>
{/if}

<style>
  .al-table { width: 100%; border-collapse: collapse; font-size: 0.66rem; font-variant-numeric: tabular-nums; }
  .al-table th { text-align: left; font-weight: 500; color: var(--st-text-3); padding: 3px 4px; border-bottom: 1px solid var(--st-hair); }
  .al-table td { padding: 3px 4px; border-bottom: 1px solid var(--st-hair); color: var(--st-text-2); }
</style>
