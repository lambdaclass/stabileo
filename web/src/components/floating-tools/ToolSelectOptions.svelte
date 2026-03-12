<script lang="ts">
  import { uiStore } from '../../lib/store';
  import { t } from '../../lib/i18n';

  const selectModes = [
    { id: 'nodes', key: 'float.selectNodes' },
    { id: 'elements', key: 'float.selectElements' },
    { id: 'supports', key: 'float.selectSupports' },
    { id: 'loads', key: 'float.selectLoads' },
    { id: 'stress', key: 'float.selectStress' },
  ] as const;
</script>

{#each selectModes as sm}
  <button
    class="ft-opt-btn"
    class:active={uiStore.selectMode === sm.id}
    onclick={() => uiStore.selectMode = sm.id}
  >{t(sm.key)}</button>
{/each}
{#if uiStore.selectMode === 'nodes'}
  <span class="ft-hint">{t('float.selectNodesHint')}</span>
{:else if uiStore.selectMode === 'elements'}
  <span class="ft-hint">{t('float.selectElementsHint')}</span>
{:else if uiStore.selectMode === 'loads'}
  <span class="ft-hint">{t('float.selectLoadsHint')}</span>
{:else if uiStore.selectMode === 'supports'}
  <span class="ft-hint">{t('float.selectSupportsHint')}</span>
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

    .ft-hint {
      font-size: 0.55rem;
    }
  }
</style>
