<script lang="ts">
  import { axisName } from '../../lib/axes/display';
  import Hint from './Hint.svelte';
  /**
   * How the generated area loads reach the model (`engine/loads/plan-gravity.ts`): by the real
   * tributary area of the panels the beams close (two ways, or one way along X or Y), or with
   * one tributary width on every beam; and whether the loads already there are replaced.
   */
  import { t } from '../../lib/i18n';
  import QuantityInput from './loads/QuantityInput.svelte';
  import type { GravityMode } from './auto-loads-sections';
  interface Props {
    mode: GravityMode;
    slab: 'twoWay' | 'oneWay';
    spanAxis: 'x' | 'y';
    tributaryWidth: number;
    loadEveryPanel: boolean;
    clearExisting: boolean;
    onClearChange: (next: boolean) => void;
  }
  let { mode = $bindable(), slab = $bindable(), spanAxis = $bindable(), tributaryWidth = $bindable(), loadEveryPanel = $bindable(), clearExisting, onClearChange }: Props = $props();
</script>

<div class="al-pane-body" data-testid="al-applying-section">
  <div class="al-sub">
    <span class="al-sub-title">{t('autoLoad.applying.areaTitle')}</span>
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
              <option value="x">{axisName(0)}</option>
              <option value="y">{axisName(1)}</option>
            </select>
          </label>
        {/if}
      {/if}
    </div>
    <p class="al-hint">{t(mode === 'panels' ? 'autoLoad.gravity.panelsHint' : 'autoLoad.tributaryHint')}</p>
    <label class="al-field al-field-narrow"><span class="al-label">{t(mode === 'panels' ? 'autoLoad.gravity.fallbackWidth' : 'autoLoad.tributaryWidth')}</span>
      <QuantityInput bind:value={tributaryWidth} quantity="length" min={0.1} testid="al-trib" wrap="al-unit-field" />
    </label>
    <label class="al-check"><input type="checkbox" bind:checked={loadEveryPanel} data-testid="al-load-every-panel" /> {t('autoLoad.gravity.loadEveryPanel')}</label>
    <Hint text={t('autoLoad.gravity.loadEveryPanelHint')} />
  </div>
  <div class="al-sub">
    <span class="al-sub-title">{t('autoLoad.applying.existingTitle')}</span>
    <label class="al-check"><input type="checkbox" checked={clearExisting} data-testid="al-clear"
      onchange={(e) => onClearChange(e.currentTarget.checked)} /> {t('autoLoad.clearExisting')}</label>
    <Hint text={t('autoLoad.applying.existingHint')} />
  </div>
</div>
