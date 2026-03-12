<script lang="ts">
  import { uiStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
</script>

<button
  class="ft-opt-btn"
  class:active={uiStore.nodeMode === 'create'}
  onclick={() => uiStore.nodeMode = 'create'}
>{t('float.nodeCreate')}</button>
<button
  class="ft-opt-btn"
  class:active={uiStore.nodeMode === 'hinge'}
  onclick={() => uiStore.nodeMode = 'hinge'}
>{t('float.nodeHinges')}</button>
{#if uiStore.analysisMode === '3d'}
  <span class="ft-sep">|</span>
  <span style="font-size:0.65rem;color:#888;">{t('float.nodePlane')}</span>
  <button class="ft-opt-btn" class:active={uiStore.workingPlane==='XZ'} onclick={() => uiStore.workingPlane='XZ'} title={t('float.nodePlaneXZ')}>XZ</button>
  <button class="ft-opt-btn" class:active={uiStore.workingPlane==='XY'} onclick={() => uiStore.workingPlane='XY'} title={t('float.nodePlaneXY')}>XY</button>
  <button class="ft-opt-btn" class:active={uiStore.workingPlane==='YZ'} onclick={() => uiStore.workingPlane='YZ'} title={t('float.nodePlaneYZ')}>YZ</button>
  <span class="ft-sep">|</span>
  <label class="ft-input-group" title={t('float.nodeLevelTooltip')}>
    <span>{t('float.nodeLevel').replace('{axis}', uiStore.workingPlane === 'XZ' ? 'Y' : uiStore.workingPlane === 'XY' ? 'Z' : 'X')}</span>
    <input type="number" bind:value={uiStore.nodeCreateZ} step="0.5" />
    <span class="ft-unit">m</span>
  </label>
{/if}
<span class="ft-sep">|</span>
{#if uiStore.nodeMode === 'create'}
  <span class="ft-hint">{uiStore.analysisMode === '3d' ? t('float.nodeClickPlane') : t('float.nodeClickCanvas')}</span>
{:else}
  <span class="ft-hint">{t('float.nodeHingesHint')}</span>
{/if}

<style>
  .ft-opt-btn {
    padding: 2px 8px;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    color: #aaa;
    cursor: pointer;
    font-size: 0.7rem;
    transition: all 0.15s;
    white-space: nowrap;
  }

  .ft-opt-btn:hover:not(:disabled) {
    background: #1a4a7a;
    color: #ddd;
  }

  .ft-opt-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
    color: #555;
    background: #0a1a30;
    border-color: #1a3050;
  }

  .ft-opt-btn.active {
    background: #e94560;
    border-color: #ff6b6b;
    color: white;
  }

  .ft-sep {
    color: #444;
    font-size: 0.8rem;
    margin: 0 2px;
  }

  .ft-input-group {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 0.7rem;
    color: #aaa;
  }

  .ft-input-group input {
    width: 55px;
    padding: 2px 4px;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 3px;
    color: #eee;
    font-size: 0.7rem;
  }

  .ft-unit {
    font-size: 0.6rem;
    color: #666;
    white-space: nowrap;
  }

  .ft-hint {
    font-size: 0.65rem;
    color: #666;
    font-style: italic;
    margin-left: 4px;
  }

  @media (max-width: 767px) {
    .ft-opt-btn {
      white-space: nowrap;
      font-size: 0.6rem;
      padding: 4px 6px;
    }

    .ft-input-group input {
      width: 45px;
    }

    .ft-input-group {
      font-size: 0.65rem;
    }

    .ft-unit {
      font-size: 0.6rem;
    }

    .ft-hint {
      font-size: 0.55rem;
    }
  }
</style>
