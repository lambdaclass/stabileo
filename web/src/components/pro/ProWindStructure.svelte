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
    /** A lattice's face width and a chimney's D, m, for a stick model whose levels span none; 0: from the nodes. */
    width: number;
    diameter: number;
  }
  export const defaultWindStructure = (): WindStructureConfig => ({
    kind: 'building', roof: 'pitched', blocked: false, towerSection: 'square', round: false, solidity: 0.2,
    diagonal: true, members: 'flat', clearance: 2, chimney: 'roundRough', width: 0, diameter: 0,
  });
</script>

<script lang="ts">
  /**
   * What the wind blows on: a closed building (Cap. 2), or one of the other structures of §2.4.3
   * and Cap. 4 (`engine/loads/wind-other.ts`), with what each one needs. The components and
   * cladding of a building are `ProWindCladding`.
   */
  import { t } from '../../lib/i18n';
  import QuantityInput from './loads/QuantityInput.svelte';

  interface Props { config: WindStructureConfig }
  let { config = $bindable() }: Props = $props();
</script>

<div class="al-sub" data-testid="al-wind-structure">
  <span class="al-sub-title">{t('autoLoad.wind.structureTitle')}</span>
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
      <label class="al-field al-field-narrow"><span class="al-label">{t('wind.other.width')}</span>
        <QuantityInput bind:value={config.width} quantity="length" min={0} placeholder={t('wind.other.fromModel')} testid="al-wind-width" wrap="al-unit-field" />
      </label>
    </div>
  {:else if config.kind === 'solidSign'}
    <label class="al-field al-field-narrow"><span class="al-label">{t('wind.other.clearance')}</span>
      <QuantityInput bind:value={config.clearance} quantity="length" min={0} testid="al-wind-clearance" wrap="al-unit-field" />
    </label>
  {:else if config.kind === 'chimney'}
    <div class="al-row">
      <label class="al-field"><span class="al-label">{t('wind.other.section')}</span>
        <select bind:value={config.chimney}>
          {#each ['squareNormal', 'squareDiagonal', 'hexOct', 'roundSmooth', 'roundRough', 'roundVeryRough'] as k (k)}<option value={k}>{t(`wind.other.chimney.${k}`)}</option>{/each}
        </select>
      </label>
      <label class="al-field al-field-narrow"><span class="al-label">{t('wind.other.diameter')}</span>
        <QuantityInput bind:value={config.diameter} quantity="length" min={0} placeholder={t('wind.other.fromModel')} testid="al-wind-diameter" wrap="al-unit-field" />
      </label>
    </div>
  {/if}
  {#if config.kind !== 'building'}<p class="al-hint">{t(`wind.other.hint.${config.kind}`)}</p>{/if}

</div>
