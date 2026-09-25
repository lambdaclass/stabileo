<script lang="ts">
  import { isMode3D } from '../../lib/store/file';
  import { uiStore, modelStore } from '../../lib/store';
  import { t } from '../../lib/i18n';

  const loadTypes = [
    { id: 'nodal', key: 'float.loadPoint' },
    { id: 'distributed', key: 'float.loadDistributed' },
    { id: 'thermal', key: 'float.loadThermal' },
  ] as const;
</script>

<label class="ft-selfweight-toggle" title={t('float.loadSelfWeightTooltip')}>
  <input type="checkbox" bind:checked={uiStore.includeSelfWeight} />
  <span>{t('float.selfWeightLabel')}</span>
</label>
<span class="ft-sep">|</span>
<span class="ft-case-dot" style="background: {modelStore.getLoadCaseColor(uiStore.activeLoadCaseId)}"></span>
<select class="ft-case-select"
  value={String(uiStore.activeLoadCaseId)}
  onchange={(e) => uiStore.activeLoadCaseId = parseInt(e.currentTarget.value)}
  title={t('float.activeLoadCase')}>
  {#each modelStore.loadCases as lc}
    <option value={String(lc.id)}>{lc.type || lc.name}</option>
  {/each}
</select>
<span class="ft-sep">|</span>
{#each loadTypes as lt}
  <button
    class="ft-opt-btn"
    class:active={uiStore.loadType === lt.id}
    onclick={() => uiStore.loadType = lt.id}
  >{t(lt.key)}</button>
{/each}
<span class="ft-sep">|</span>
{#if uiStore.loadType === 'nodal'}
  {#if isMode3D(uiStore.analysisMode)}
    <!-- 3D: 6 DOF directions -->
    <button class="ft-opt-btn ft-dir-btn" class:active={uiStore.nodalLoadDir3D === 'fx'}
      onclick={() => uiStore.nodalLoadDir3D = 'fx'} title={t('float.loadForceX3d')}>Fx</button>
    <button class="ft-opt-btn ft-dir-btn" class:active={uiStore.nodalLoadDir3D === 'fy'}
      onclick={() => uiStore.nodalLoadDir3D = 'fy'} title={t('float.loadForceY3d')}>Fy</button>
    <button class="ft-opt-btn ft-dir-btn" class:active={uiStore.nodalLoadDir3D === 'fz'}
      onclick={() => uiStore.nodalLoadDir3D = 'fz'} title={t('float.loadForceZ3d')}>Fz</button>
    <button class="ft-opt-btn ft-dir-btn" class:active={uiStore.nodalLoadDir3D === 'mx'}
      onclick={() => uiStore.nodalLoadDir3D = 'mx'} title={t('float.loadMomentX3d')}>Mx</button>
    <button class="ft-opt-btn ft-dir-btn" class:active={uiStore.nodalLoadDir3D === 'my'}
      onclick={() => uiStore.nodalLoadDir3D = 'my'} title={t('float.loadMomentY3d')}>My</button>
    <button class="ft-opt-btn ft-dir-btn" class:active={uiStore.nodalLoadDir3D === 'mz'}
      onclick={() => uiStore.nodalLoadDir3D = 'mz'} title={t('float.loadMomentZ3d')}>Mz</button>
    <label class="ft-input-group">
      <span>{['mx','my','mz'].includes(uiStore.nodalLoadDir3D) ? 'M:' : 'F:'}</span>
      <input type="number" bind:value={uiStore.loadValue} step="1" />
      <span class="ft-unit">{['mx','my','mz'].includes(uiStore.nodalLoadDir3D) ? 'kN\u00b7m' : 'kN'}</span>
    </label>
  {:else}
  <!-- 2D: 3 directions -->
  <button class="ft-opt-btn ft-dir-btn" class:active={uiStore.nodalLoadDir === 'fx'}
    onclick={() => uiStore.nodalLoadDir = 'fx'}
    title={uiStore.loadIsGlobal ? t('float.loadForceXGlobal') : t('float.loadForceXLocal')}
  >{uiStore.loadIsGlobal ? 'Fx' : 'Fi'}</button>
  <button class="ft-opt-btn ft-dir-btn" class:active={uiStore.nodalLoadDir === 'fz'}
    onclick={() => uiStore.nodalLoadDir = 'fz'}
    title={uiStore.loadIsGlobal ? t('float.loadForceYGlobal') : t('float.loadForceYLocal')}
  >{uiStore.loadIsGlobal ? 'Fz' : 'Fj'}</button>
  <button class="ft-opt-btn ft-dir-btn" class:active={uiStore.nodalLoadDir === 'my'}
    onclick={() => uiStore.nodalLoadDir = 'my'}
    title={t('float.loadMomentZ')}
  >My</button>
  <label class="ft-input-group">
    <span>{uiStore.nodalLoadDir === 'my' ? 'M:' : 'F:'}</span>
    <input type="number" bind:value={uiStore.loadValue} step="1" />
    <span class="ft-unit">{uiStore.nodalLoadDir === 'my' ? 'kN\u00b7m' : 'kN'}</span>
  </label>
  <span class="ft-sep">|</span>
  <button class="ft-opt-btn ft-coord-btn" class:active={uiStore.loadIsGlobal} onclick={() => uiStore.loadIsGlobal = true} title={t('float.loadGlobalYDir')}>Z</button>
  <button class="ft-opt-btn ft-coord-btn" class:active={!uiStore.loadIsGlobal} onclick={() => uiStore.loadIsGlobal = false} title={t('float.loadPerpDir')}>⊥</button>
  <label class="ft-input-group">
    <span>α:</span>
    <input type="number" bind:value={uiStore.loadAngle} step="5" />
    <span class="ft-unit">°</span>
  </label>
  {/if}
{:else if uiStore.loadType === 'thermal'}
  <label class="ft-input-group">
    <span>ΔT:</span>
    <input type="number" bind:value={uiStore.thermalDT} step="5" />
    <span class="ft-unit">°C</span>
  </label>
  <label class="ft-input-group">
    <span>ΔTg:</span>
    <input type="number" bind:value={uiStore.thermalDTg} step="5" />
    <span class="ft-unit">°C</span>
  </label>
{:else if uiStore.loadType === 'distributed'}
  {#if isMode3D(uiStore.analysisMode)}
    <label class="ft-input-group">
      <span>qYI:</span>
      <input type="number" bind:value={uiStore.loadValueY3D} step="1" />
      <span class="ft-unit">kN/m</span>
    </label>
    <label class="ft-input-group">
      <span>qYJ:</span>
      <input type="number" bind:value={uiStore.loadValueYJ3D} step="1" />
      <span class="ft-unit">kN/m</span>
    </label>
  {:else}
    <label class="ft-input-group">
      <span>qI:</span>
      <input type="number" bind:value={uiStore.loadValue} step="1" />
      <span class="ft-unit">kN/m</span>
    </label>
    <label class="ft-input-group">
      <span>qJ:</span>
      <input type="number" bind:value={uiStore.loadValueJ} step="1" />
      <span class="ft-unit">kN/m</span>
    </label>
  {/if}
  {#if isMode3D(uiStore.analysisMode)}
    <label class="ft-input-group">
      <span>qZI:</span>
      <input type="number" bind:value={uiStore.loadValueZ} step="1" />
      <span class="ft-unit">kN/m</span>
    </label>
    <label class="ft-input-group">
      <span>qZJ:</span>
      <input type="number" bind:value={uiStore.loadValueZJ} step="1" />
      <span class="ft-unit">kN/m</span>
    </label>
  {:else}
  <span class="ft-sep">|</span>
  <button class="ft-opt-btn ft-coord-btn" class:active={uiStore.loadIsGlobal} onclick={() => uiStore.loadIsGlobal = true} title={t('float.loadGlobalYDir')}>Z</button>
  <button class="ft-opt-btn ft-coord-btn" class:active={!uiStore.loadIsGlobal} onclick={() => uiStore.loadIsGlobal = false} title={t('float.loadPerpDir')}>⊥</button>
  <label class="ft-input-group">
    <span>α:</span>
    <input type="number" bind:value={uiStore.loadAngle} step="5" />
    <span class="ft-unit">°</span>
  </label>
  {/if}
{/if}

<style>
  .ft-opt-btn {
    padding: 2px 8px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: 4px;
    color: var(--st-text-2);
    cursor: pointer;
    font-size: 0.7rem;
    transition: all 0.15s;
    white-space: nowrap;
  }

  .ft-opt-btn:hover:not(:disabled) {
    background: var(--st-surface-3);
    color: var(--st-text);
  }

  .ft-opt-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
    color: var(--st-text-3);
    background: var(--st-surface-2);
    border-color: var(--st-hair);
  }

  .ft-opt-btn.active {
    background: var(--st-accent);
    border-color: var(--st-danger);
    color: white;
  }

  .ft-selfweight-toggle {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 0.68rem;
    color: var(--st-text-2);
    cursor: pointer;
    white-space: nowrap;
  }
  .ft-selfweight-toggle input {
    accent-color: var(--st-accent);
    margin: 0;
  }
  .ft-selfweight-toggle span {
    font-weight: 600;
    color: var(--st-text);
  }

  .ft-case-select {
    background: var(--st-surface-2);
    color: var(--st-text);
    border: 1px solid var(--st-hair-strong);
    border-radius: 3px;
    padding: 2px 4px;
    font-size: 0.7rem;
    cursor: pointer;
  }

  .ft-case-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .ft-sep {
    color: var(--st-text-3);
    font-size: 0.8rem;
    margin: 0 2px;
  }

  .ft-input-group {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 0.7rem;
    color: var(--st-text-2);
  }

  .ft-input-group input {
    width: 55px;
    padding: 2px 4px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: 3px;
    color: var(--st-text);
    font-size: 0.7rem;
  }

  .ft-unit {
    font-size: 0.6rem;
    color: var(--st-text-3);
    white-space: nowrap;
  }

  .ft-dir-btn {
    min-width: 24px;
    font-size: 0.65rem;
    padding: 2px 4px;
  }

  .ft-coord-btn {
    min-width: 22px;
    font-size: 0.6rem;
    padding: 2px 5px;
    font-weight: 600;
    letter-spacing: 0.02em;
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

    .ft-dir-btn {
      padding: 3px 5px;
      font-size: 0.6rem;
    }

    .ft-coord-btn {
      font-size: 0.55rem;
      letter-spacing: 0;
      padding: 2px 3px;
      min-width: 18px;
    }
  }
</style>
