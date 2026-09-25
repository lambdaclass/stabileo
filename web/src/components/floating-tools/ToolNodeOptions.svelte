<script lang="ts">
  import { uiStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import { planeLevelAxis } from '../../lib/geometry/coordinate-system';
</script>

<button
  class="ft-opt-btn ft-primary"
  class:active={uiStore.nodeMode === 'create'}
  onclick={() => uiStore.nodeMode = 'create'}
>{t('float.nodeCreate')}</button>
<button
  class="ft-opt-btn ft-primary"
  class:active={uiStore.nodeMode === 'hinge'}
  onclick={() => uiStore.nodeMode = 'hinge'}
>{t('float.nodeJoints')}</button>
<!-- A phone puts the primary choice on a row of its own (see DataTable). -->
<span class="ft-break" aria-hidden="true"></span>

{#if uiStore.nodeMode === 'hinge' && uiStore.analysisMode !== '3d'}
  <!-- Basic 2D joints: hinge + sliding X/Z + axis mode -->
  <span class="ft-sep">|</span>
  <button class="ft-opt-btn glyph" class:active={uiStore.jointType === 'hinge'}
    onclick={() => uiStore.jointType = 'hinge'} title={t('float.jointHingeHint')}>
    <span class="jg">○</span> {t('float.jointHinge')}
  </button>
  <button class="ft-opt-btn glyph" class:active={uiStore.jointType === 'slideX'}
    onclick={() => uiStore.jointType = 'slideX'} title={t('float.jointSlideXHint')}>
    <span class="jg">↔</span> {t('float.jointSlideX')}
  </button>
  <button class="ft-opt-btn glyph" class:active={uiStore.jointType === 'slideZ'}
    onclick={() => uiStore.jointType = 'slideZ'} title={t('float.jointSlideZHint')}>
    <span class="jg">↕</span> {t('float.jointSlideZ')}
  </button>
  {#if uiStore.jointType !== 'hinge'}
    <span class="ft-sep">|</span>
    <span style="font-size:0.65rem;color:#888;">{t('float.jointAxis')}</span>
    <button class="ft-opt-btn" class:active={uiStore.jointAxis === 'global'}
      onclick={() => uiStore.jointAxis = 'global'} title={t('float.jointAxisGlobalHint')}>{t('float.jointAxisGlobal')}</button>
    <button class="ft-opt-btn" class:active={uiStore.jointAxis === 'local'}
      onclick={() => uiStore.jointAxis = 'local'} title={t('float.jointAxisLocalHint')}>{t('float.jointAxisLocal')}</button>
  {/if}
{:else if uiStore.nodeMode === 'hinge' && uiStore.analysisMode === '3d'}
  <!-- Basic 3D joints: six released relative-DOF toggles (internal release, not a support) -->
  <span class="ft-sep">|</span>
  <span style="font-size:0.65rem;color:#888;" title={t('float.joint3dRelease')}>{t('float.joint3dRelease')}</span>
  {#each ['dx', 'dy', 'dz', 'θx', 'θy', 'θz'] as label, i}
    <button class="ft-opt-btn glyph" class:active={uiStore.jointDof3d[i]}
      onclick={() => uiStore.toggleJointDof3d(i)} title={t('float.joint3dDofHint')}>{label}</button>
  {/each}
{/if}

{#if uiStore.analysisMode === '3d' && uiStore.nodeMode === 'create'}
  <!-- Node-creation working plane + level (3D only; not a joint control) -->
  <span class="ft-sep">|</span>
  <span style="font-size:0.65rem;color:#888;">{t('float.nodePlane')}</span>
  <button class="ft-opt-btn" class:active={uiStore.workingPlane==='XY'} onclick={() => uiStore.workingPlane='XY'} title={t('float.nodePlaneXY')}>XY</button>
  <button class="ft-opt-btn" class:active={uiStore.workingPlane==='XZ'} onclick={() => uiStore.workingPlane='XZ'} title={t('float.nodePlaneXZ')}>XZ</button>
  <button class="ft-opt-btn" class:active={uiStore.workingPlane==='YZ'} onclick={() => uiStore.workingPlane='YZ'} title={t('float.nodePlaneYZ')}>YZ</button>
  <span class="ft-sep">|</span>
  <label class="ft-input-group" title={t('float.nodeLevelTooltip')}>
    <span>{t('float.nodeLevel').replace('{axis}', planeLevelAxis(uiStore.workingPlane).toUpperCase())}</span>
    <input type="number" bind:value={uiStore.nodeCreateZ} step="0.5" />
    <span class="ft-unit">m</span>
  </label>
{/if}
<span class="ft-sep">|</span>
{#if uiStore.nodeMode === 'create'}
  <span class="ft-hint">{uiStore.analysisMode === '3d' ? t('float.nodeClickPlane') : t('float.nodeClickCanvas')}</span>
{:else if uiStore.analysisMode === '3d'}
  <span class="ft-hint">{t('float.joint3dHint')}</span>
{:else if uiStore.jointType === 'hinge'}
  <span class="ft-hint">{t('float.nodeHingesHint')}</span>
{:else}
  <span class="ft-hint">{t('float.jointSlideHint')}</span>
{/if}

<style>
  /* A row break for the phone's layout (DataTable); nothing on a desktop. */
  .ft-break { display: none; }

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

  .ft-opt-btn.glyph .jg {
    font-weight: 700;
    margin-right: 1px;
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

  .ft-hint {
    font-size: 0.65rem;
    color: var(--st-text-3);
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
