<script lang="ts" module>
  export interface WindStructureConfig {
    kind: 'building' | 'freeRoof' | 'latticeTower' | 'openSign' | 'solidSign' | 'chimney';
    roof: 'monoslope' | 'pitched' | 'troughed';
    blocked: boolean;
    towerSection: 'square' | 'triangle';
    round: boolean;
    solidity: number;
    diagonal: boolean;
    members: 'flat' | 'roundSmall' | 'roundLarge';
    clearance: number;
    chimney: 'squareNormal' | 'squareDiagonal' | 'hexOct' | 'roundSmooth' | 'roundRough' | 'roundVeryRough';
  }
  export const defaultWindStructure = (): WindStructureConfig => ({
    kind: 'building', roof: 'pitched', blocked: false, towerSection: 'square', round: false, solidity: 0.2,
    diagonal: true, members: 'flat', clearance: 2, chimney: 'roundRough',
  });
</script>

<script lang="ts">
  /**
   * What the wind blows on: a closed building (Cap. 2), or one of the other structures of §2.4.3
   * and Cap. 4 (`engine/loads/wind-other.ts`), with what each one needs; and the components and
   * cladding pressures of Cap. 5 for a building, as a table for the elements' own design.
   */
  import { t, tp } from '../../lib/i18n';
  import { claddingPressures } from '../../lib/codes/cirsoc102/cladding';
  import { velocityPressure, internalPressureCoefficient, type Enclosure, type Exposure } from '../../lib/codes/cirsoc102/wind';

  interface Props {
    config: WindStructureConfig;
    speed: number; exposure: Exposure; altitude: number; kzt: number; enclosure: Enclosure;
    /** Mean roof height, least plan dimension and roof slope of the model. */
    height: number; leastDimension: number; roofSlopeDeg: number;
  }
  let { config = $bindable(), speed, exposure, altitude, kzt, enclosure, height, leastDimension, roofSlopeDeg }: Props = $props();

  let area = $state(1);
  const cladding = $derived.by(() => {
    if (config.kind !== 'building' || !(height > 0)) return null;
    const qh = velocityPressure(height, {
      basicSpeed: speed, exposure, siteAltitudeM: altitude, kzt, kztSurveyed: true, structureKind: 'building',
      enclosure, meanRoofHeight: height, L: leastDimension, B: leastDimension, roofSlopeDeg, rigid: true,
    });
    return { qh, r: claddingPressures({ qhNm2: qh, meanRoofHeight: height, leastDimension, roofSlopeDeg, gcpi: internalPressureCoefficient(enclosure), areaM2: area }) };
  });
</script>

<div class="al-sub" data-testid="al-wind-structure">
  <label class="al-field"><span class="al-label">{t('wind.other.kind')}</span>
    <select bind:value={config.kind} data-testid="al-wind-kind">
      {#each ['building', 'freeRoof', 'latticeTower', 'openSign', 'solidSign', 'chimney'] as k (k)}<option value={k}>{t(`wind.other.kind.${k}`)}</option>{/each}
    </select>
  </label>
  {#if config.kind === 'freeRoof'}
    <div class="al-row">
      <label class="al-field"><span class="al-label">{t('wind.other.roof')}</span>
        <select bind:value={config.roof} data-testid="al-wind-free-roof">
          {#each ['monoslope', 'pitched', 'troughed'] as k (k)}<option value={k}>{t(`wind.other.roof.${k}`)}</option>{/each}
        </select>
      </label>
      <label class="al-check"><input type="checkbox" bind:checked={config.blocked} data-testid="al-wind-blocked" /> {t('wind.other.blocked')}</label>
    </div>
  {:else if config.kind === 'latticeTower' || config.kind === 'openSign'}
    <div class="al-row">
      <label class="al-field al-field-narrow"><span class="al-label">{t('wind.other.solidity')}</span>
        <input type="number" min="0.01" max="0.99" step="0.05" bind:value={config.solidity} data-testid="al-wind-solidity" />
      </label>
      {#if config.kind === 'latticeTower'}
        <label class="al-field"><span class="al-label">{t('wind.other.section')}</span>
          <select bind:value={config.towerSection} data-testid="al-wind-tower-section">
            <option value="square">{t('wind.other.square')}</option><option value="triangle">{t('wind.other.triangle')}</option>
          </select>
        </label>
        <label class="al-check"><input type="checkbox" bind:checked={config.round} /> {t('wind.other.roundMembers')}</label>
        {#if config.towerSection === 'square'}<label class="al-check"><input type="checkbox" bind:checked={config.diagonal} /> {t('wind.other.diagonal')}</label>{/if}
      {:else}
        <label class="al-field"><span class="al-label">{t('wind.other.members')}</span>
          <select bind:value={config.members}>
            {#each ['flat', 'roundSmall', 'roundLarge'] as k (k)}<option value={k}>{t(`wind.other.members.${k}`)}</option>{/each}
          </select>
        </label>
      {/if}
    </div>
  {:else if config.kind === 'solidSign'}
    <label class="al-field al-field-narrow"><span class="al-label">{t('wind.other.clearance')}</span>
      <span class="al-unit-field"><input type="number" min="0" step="0.5" bind:value={config.clearance} data-testid="al-wind-clearance" /><span>m</span></span>
    </label>
  {:else if config.kind === 'chimney'}
    <label class="al-field"><span class="al-label">{t('wind.other.section')}</span>
      <select bind:value={config.chimney}>
        {#each ['squareNormal', 'squareDiagonal', 'hexOct', 'roundSmooth', 'roundRough', 'roundVeryRough'] as k (k)}<option value={k}>{t(`wind.other.chimney.${k}`)}</option>{/each}
      </select>
    </label>
  {/if}
  {#if config.kind !== 'building'}<p class="al-hint">{t(`wind.other.hint.${config.kind}`)}</p>{/if}

  {#if cladding}
    <details class="al-details" data-testid="al-cladding">
      <summary>{t('wind.cladding.title')}</summary>
      <label class="al-field al-field-narrow"><span class="al-label">{t('wind.cladding.area')}</span>
        <span class="al-unit-field"><input type="number" min="0.1" step="0.5" bind:value={area} data-testid="al-cladding-area" /><span>m²</span></span>
      </label>
      {#if cladding.r.refused}
        <p class="al-warn">{t(`wind.cladding.refused.${cladding.r.refused}`)}</p>
      {:else}
        <p class="al-hint">{tp('wind.cladding.basis', { qh: (cladding.qh / 1000).toFixed(3), a: cladding.r.aWalls?.toFixed(2) ?? '—', aRoof: cladding.r.aRoof?.toFixed(2) ?? t('wind.cladding.aDrawn') })}</p>
        <table class="al-table" data-testid="al-cladding-table">
          <thead><tr><th>{t('wind.cladding.surface')}</th><th>{t('wind.cladding.zone')}</th><th>GCp +</th><th>GCp −</th><th>p + (kN/m²)</th><th>p − (kN/m²)</th></tr></thead>
          <tbody>
            {#each cladding.r.rows as r (r.surface + r.zone)}
              <tr><td>{t(`wind.cladding.${r.surface}`)}</td><td>{r.zone}</td><td>{r.gcpPos.toFixed(2)}</td><td>{r.gcpNeg.toFixed(2)}</td><td>{r.pPos.toFixed(3)}</td><td>{r.pNeg.toFixed(3)}</td></tr>
            {/each}
          </tbody>
        </table>
        <p class="al-hint">{t('wind.cladding.note')}</p>
      {/if}
    </details>
  {/if}
</div>

<style>
  .al-details summary { cursor: pointer; color: var(--st-text-2); font-size: 0.7rem; }
  .al-details[open] summary { margin-bottom: 6px; }
  .al-table { width: 100%; border-collapse: collapse; font-size: 0.66rem; font-variant-numeric: tabular-nums; }
  .al-table th { text-align: left; font-weight: 500; color: var(--st-text-3); padding: 3px 4px; border-bottom: 1px solid var(--st-hair); }
  .al-table td { padding: 3px 4px; border-bottom: 1px solid var(--st-hair); color: var(--st-text-2); }
</style>
