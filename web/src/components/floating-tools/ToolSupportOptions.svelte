<script lang="ts">
  import { uiStore } from '../../lib/store';
  import { t } from '../../lib/i18n';

  const supportTypes = [
    { id: 'fixed', key: 'float.supportFixedShort', icon: '▣', svg: false },
    { id: 'pinned', key: 'float.supportPinnedShort', icon: '△', svg: false },
    { id: 'roller', key: 'float.supportRoller', icon: '', svg: true },
    { id: 'spring', key: 'float.supportSpring', icon: '⌇', svg: false },
  ] as const;
</script>

{#if uiStore.analysisMode === '3d'}
  <!-- Per-DOF checkboxes (global frame) -->
  <label class="ft-chk" title={t('float.supportRestrainTx')}><input type="checkbox" bind:checked={uiStore.sup3dTx}/> <span>Fx</span></label>
  <label class="ft-chk" title={t('float.supportRestrainTy')}><input type="checkbox" bind:checked={uiStore.sup3dTy}/> <span>Fy</span></label>
  <label class="ft-chk" title={t('float.supportRestrainTz')}><input type="checkbox" bind:checked={uiStore.sup3dTz}/> <span>Fz</span></label>
  <label class="ft-chk" title={t('float.supportRestrainRx')}><input type="checkbox" bind:checked={uiStore.sup3dRx}/> <span>Mx</span></label>
  <label class="ft-chk" title={t('float.supportRestrainRy')}><input type="checkbox" bind:checked={uiStore.sup3dRy}/> <span>My</span></label>
  <label class="ft-chk" title={t('float.supportRestrainRz')}><input type="checkbox" bind:checked={uiStore.sup3dRz}/> <span>Mz</span></label>
  <span class="ft-sep">|</span>
  <!-- Quick presets -->
  <button class="ft-opt-btn" onclick={() => uiStore.setSupport3DPreset('fixed')} title={t('float.supportFixed3dTitle')}>▣ {t('float.supportFixedShort')}</button>
  <button class="ft-opt-btn" onclick={() => uiStore.setSupport3DPreset('pinned')} title={t('float.supportPinned3dTitle')}>△ {t('float.supportPinnedShort')}</button>
  <span class="ft-sep">|</span>
  <!-- Spring stiffnesses for unchecked DOFs -->
  {#if !uiStore.sup3dTx || !uiStore.sup3dTy || !uiStore.sup3dTz || !uiStore.sup3dRx || !uiStore.sup3dRy || !uiStore.sup3dRz}
    {#if !uiStore.sup3dTx}
      <label class="ft-input-group"><span>kx:</span><input type="number" bind:value={uiStore.sup3dKx} step="100" placeholder="0" /></label>
    {/if}
    {#if !uiStore.sup3dTy}
      <label class="ft-input-group"><span>ky:</span><input type="number" bind:value={uiStore.sup3dKy} step="100" placeholder="0" /></label>
    {/if}
    {#if !uiStore.sup3dTz}
      <label class="ft-input-group"><span>kz:</span><input type="number" bind:value={uiStore.sup3dKz} step="100" placeholder="0" /></label>
    {/if}
    {#if !uiStore.sup3dRx}
      <label class="ft-input-group"><span>krx:</span><input type="number" bind:value={uiStore.sup3dKrx} step="100" placeholder="0" /></label>
    {/if}
    {#if !uiStore.sup3dRy}
      <label class="ft-input-group"><span>kry:</span><input type="number" bind:value={uiStore.sup3dKry} step="100" placeholder="0" /></label>
    {/if}
    {#if !uiStore.sup3dRz}
      <label class="ft-input-group"><span>krz:</span><input type="number" bind:value={uiStore.sup3dKrz} step="100" placeholder="0" /></label>
    {/if}
  {/if}
  <span class="ft-hint">{t('float.supportHint')}</span>
{:else}
  <!-- 2D support types -->
  {#each supportTypes as st}
    <button
      class="ft-opt-btn ft-sup-btn"
      class:active={uiStore.supportType === st.id}
      onclick={() => uiStore.supportType = st.id}
      title={t(st.key)}
    >
      {#if st.id === 'roller'}
        <svg class="ft-sup-svg" viewBox="0 0 20 20" width="16" height="16">
          <polygon points="10,2 3,12 17,12" fill="none" stroke="currentColor" stroke-width="1.8"/>
          <circle cx="7" cy="16" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/>
          <circle cx="13" cy="16" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/>
        </svg>
      {:else}
        {st.icon}
      {/if}
      {t(st.key)}
    </button>
  {/each}
  {#if uiStore.supportType === 'spring'}
    <span class="ft-sep">|</span>
    <label class="ft-input-group">
      <span>kx:</span>
      <input type="number" bind:value={uiStore.springKx} step="100" />
    </label>
    <label class="ft-input-group">
      <span>ky:</span>
      <input type="number" bind:value={uiStore.springKy} step="100" />
    </label>
    <label class="ft-input-group">
      <span>kθ:</span>
      <input type="number" bind:value={uiStore.springKz} step="100" />
    </label>
    <span class="ft-sep">|</span>
    <button class="ft-opt-btn ft-coord-btn" class:active={uiStore.supportIsGlobal} onclick={() => uiStore.supportIsGlobal = true}
      title={t('float.supportGlobalAxes')}>Gl</button>
    <button class="ft-opt-btn ft-coord-btn" class:active={!uiStore.supportIsGlobal} onclick={() => uiStore.supportIsGlobal = false}
      title={t('float.supportLocalAxes')}>Loc</button>
    <label class="ft-input-group" title={t('float.supportAngle')}>
      <span>α:</span>
      <input type="number" bind:value={uiStore.supportAngle} step="5" />
      <span class="ft-unit">°</span>
    </label>
  {:else if uiStore.supportType === 'roller'}
    <span class="ft-sep">|</span>
    <button class="ft-opt-btn ft-dir-btn" class:active={uiStore.supportDirection === 'x'}
      onclick={() => uiStore.supportDirection = 'x'}
      title={uiStore.supportIsGlobal
        ? t('float.rollerRestrictsYGlobal')
        : t('float.rollerRestrictsJLocal')}
    >{uiStore.supportIsGlobal ? 'X' : 'i'}</button>
    <button class="ft-opt-btn ft-dir-btn" class:active={uiStore.supportDirection === 'y'}
      onclick={() => uiStore.supportDirection = 'y'}
      title={uiStore.supportIsGlobal
        ? t('float.rollerRestrictsXGlobal')
        : t('float.rollerRestrictsILocal')}
    >{uiStore.supportIsGlobal ? 'Y' : 'j'}</button>
    <span class="ft-sep">|</span>
    <button class="ft-opt-btn ft-coord-btn" class:active={uiStore.supportIsGlobal} onclick={() => uiStore.supportIsGlobal = true}
      title={t('float.rollerGlobalLabel')}>Gl</button>
    <button class="ft-opt-btn ft-coord-btn" class:active={!uiStore.supportIsGlobal} onclick={() => uiStore.supportIsGlobal = false}
      title={t('float.rollerLocalLabel')}>Loc</button>
    <label class="ft-input-group" title={t('float.prescribedRollerDisp')}>
      <span>di:</span>
      <input type="number" bind:value={uiStore.supportDx} step="0.001" />
      <span class="ft-unit">m</span>
    </label>
    <label class="ft-input-group" title={t('float.supportAngle')}>
      <span>α:</span>
      <input type="number" bind:value={uiStore.supportAngle} step="5" />
      <span class="ft-unit">°</span>
    </label>
  {:else}
    <span class="ft-sep">|</span>
    {#if uiStore.supportType === 'fixed' || uiStore.supportType === 'pinned'}
      <label class="ft-input-group" title={t('float.prescribedDx')}>
        <span>dx:</span>
        <input type="number" bind:value={uiStore.supportDx} step="0.001" />
      </label>
      <label class="ft-input-group" title={t('float.prescribedDy')}>
        <span>dy:</span>
        <input type="number" bind:value={uiStore.supportDy} step="0.001" />
      </label>
    {/if}
    {#if uiStore.supportType === 'fixed'}
      <label class="ft-input-group" title={t('float.prescribedDrz')}>
        <span>dθz:</span>
        <input type="number" bind:value={uiStore.supportDrz} step="0.001" />
      </label>
    {/if}
    <label class="ft-input-group" title={t('float.supportAngleVisual')}>
      <span>α:</span>
      <input type="number" bind:value={uiStore.supportAngle} step="5" />
      <span class="ft-unit">°</span>
    </label>
  {/if}
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

  .ft-sup-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
    min-height: 22px;
    min-width: 22px;
    line-height: 1;
  }

  .ft-sup-svg {
    vertical-align: middle;
    flex-shrink: 0;
  }

  .ft-chk {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-size: 0.68rem;
    color: #bbb;
    cursor: pointer;
    white-space: nowrap;
  }
  .ft-chk input {
    accent-color: #e94560;
    margin: 0;
    width: 13px;
    height: 13px;
  }
  .ft-chk span {
    font-size: 0.65rem;
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

    .ft-sup-btn {
      padding: 3px 5px;
      font-size: 0.6rem;
      min-height: 20px;
      min-width: 20px;
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
