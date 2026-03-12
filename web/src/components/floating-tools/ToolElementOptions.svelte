<script lang="ts">
  import { uiStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
</script>

<label class="ft-opt-radio">
  <input type="radio" name="ft-elemType" value="frame" checked={uiStore.elementCreateType === 'frame'} onchange={() => uiStore.elementCreateType = 'frame'} />
  <span>{t('float.elementRigid')}</span>
</label>
<label class="ft-opt-radio">
  <input type="radio" name="ft-elemType" value="truss" checked={uiStore.elementCreateType === 'truss'} onchange={() => uiStore.elementCreateType = 'truss'} />
  <span>{t('float.elementTruss')}</span>
</label>
<span class="ft-sep">|</span>
<span class="ft-hint">{t('float.elementHint')}</span>

<style>
  .ft-opt-radio {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 0.72rem;
    color: #bbb;
    cursor: pointer;
  }

  .ft-opt-radio input {
    accent-color: #e94560;
  }

  .ft-sep {
    color: #444;
    font-size: 0.8rem;
    margin: 0 2px;
  }

  .ft-hint {
    font-size: 0.65rem;
    color: #666;
    font-style: italic;
    margin-left: 4px;
  }

  @media (max-width: 767px) {
    .ft-hint {
      font-size: 0.55rem;
    }
  }
</style>
