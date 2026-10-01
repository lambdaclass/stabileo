<script lang="ts">
  /**
   * How the generated area loads reach the model (`engine/loads/plan-gravity.ts`): by the real
   * tributary area of the panels the beams close (two ways, or one way along X or Y), or with
   * one tributary width on every beam; and whether the loads already there are replaced.
   */
  import { t } from '../../lib/i18n';

  export type GravityMode = 'panels' | 'width';
  interface Props {
    mode: GravityMode;
    slab: 'twoWay' | 'oneWay';
    spanAxis: 'x' | 'y';
    tributaryWidth: number;
    clearExisting: boolean;
    onClearChange: (next: boolean) => void;
  }
  let { mode = $bindable(), slab = $bindable(), spanAxis = $bindable(), tributaryWidth = $bindable(), clearExisting, onClearChange }: Props = $props();
</script>

<section class="al-sec">
  <div class="al-sec-head"><span class="al-sec-title">{t('autoLoad.applying')}</span></div>
  <div class="al-sec-body">
    <div class="al-row">
      <label class="al-field"><span class="al-label">{t('autoLoad.gravity.mode')}</span>
        <select bind:value={mode} data-testid="al-gravity-mode">
          <option value="panels">{t('autoLoad.gravity.panels')}</option>
          <option value="width">{t('autoLoad.gravity.width')}</option>
        </select>
      </label>
      {#if mode === 'panels'}
        <label class="al-field"><span class="al-label">{t('floorLoad.distribution')}</span>
          <select bind:value={slab} data-testid="al-gravity-slab">
            <option value="twoWay">{t('floorLoad.twoWay')}</option>
            <option value="oneWay">{t('floorLoad.oneWay')}</option>
          </select>
        </label>
        {#if slab === 'oneWay'}
          <label class="al-field al-field-narrow"><span class="al-label">{t('floorLoad.span')}</span>
            <select bind:value={spanAxis} data-testid="al-gravity-span">
              <option value="x">X</option>
              <option value="y">Y</option>
            </select>
          </label>
        {/if}
      {/if}
    </div>
    <p class="al-hint">{t(mode === 'panels' ? 'autoLoad.gravity.panelsHint' : 'autoLoad.tributaryHint')}</p>
    <label class="al-field al-field-narrow"><span class="al-label">{t(mode === 'panels' ? 'autoLoad.gravity.fallbackWidth' : 'autoLoad.tributaryWidth')}</span>
      <span class="al-unit-field"><input type="number" step="0.5" min="0.1" bind:value={tributaryWidth} data-testid="al-trib" /><span>m</span></span>
    </label>
    <label class="al-check"><input type="checkbox" checked={clearExisting} data-testid="al-clear"
      onchange={(e) => onClearChange(e.currentTarget.checked)} /> {t('autoLoad.clearExisting')}</label>
  </div>
</section>
