<script lang="ts">
  import type { SeismicMethodConfig } from './auto-loads-sections';
  import { t } from '../../lib/i18n';

  interface Props { config: SeismicMethodConfig }
  let { config = $bindable() }: Props = $props();
</script>

<div class="al-sub" data-testid="al-seismic-method">
  <div class="al-row">
    <label class="al-field"><span class="al-label">{t('autoLoad.seismic.method')}</span>
      <select bind:value={config.method} data-testid="al-seismic-method-select">
        <option value="static">{t('autoLoad.seismic.static')}</option>
        <option value="modal">{t('autoLoad.seismic.modal')}</option>
      </select>
    </label>
    <label class="al-field"><span class="al-label">{t('autoLoad.seismic.torsion')}</span>
      <select bind:value={config.torsion} data-testid="al-seismic-torsion">
        <option value="low">{t('autoLoad.seismic.torsionLow')}</option>
        <option value="medium">{t('autoLoad.seismic.torsionMedium')}</option>
        <option value="extreme">{t('autoLoad.seismic.torsionExtreme')}</option>
      </select>
    </label>
  </div>
  <label class="al-check" title={t('autoLoad.seismic.verticalHint')}>
    <input type="checkbox" bind:checked={config.vertical} data-testid="al-seismic-vertical" /> {t('autoLoad.seismic.vertical')}
  </label>
  <label class="al-check" title={t('autoLoad.seismic.diagonalHint')}>
    <input type="checkbox" bind:checked={config.diagonal} data-testid="al-seismic-diagonal" /> {t('autoLoad.seismic.diagonal')}
  </label>
</div>
