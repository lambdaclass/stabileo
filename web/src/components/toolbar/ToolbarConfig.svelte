<script lang="ts">
  import { uiStore, resultsStore } from '../../lib/store';
  import { unitLabel } from '../../lib/utils/units';
  import { t } from '../../lib/i18n';
  import HelpTip from '../HelpTip.svelte';

  /** When true, skip outer toggle and show content directly (used in PRO dropdown). */

  /**
   * `flat` — everything open, no accordions.
   *
   * These sections collapse because they used to be stacked in one narrow left
   * column where five of them competed for the same vertical space. In the
   * ribbon layout only ONE of them is ever mounted, in a panel that already
   * names it and that the user can widen, so a disclosure triangle just hides
   * what they explicitly asked to see.
   */
  let { inline = false, flat = false }: any = $props();

  let showConfig = $state(false);
  let showGridSub = $state(false);
  let showStructureSub = $state(false);
  let showResultsSub = $state(false);

  const us = $derived(uiStore.unitSystem);
  const ul = (q: import('../../lib/utils/units').Quantity) => unitLabel(q, us);

  // Listen for tour events to auto-open/close config section
  $effect(() => {
    const openConfig = () => { showConfig = true; };
    const closeConfig = () => { showConfig = false; };
    window.addEventListener('stabileo-open-config', openConfig);
    window.addEventListener('stabileo-close-config', closeConfig);
    return () => {
      window.removeEventListener('stabileo-open-config', openConfig);
      window.removeEventListener('stabileo-close-config', closeConfig);
    };
  });
</script>

<div class="toolbar-section" data-tour="config-section">
  {#if !inline}
  {#if !flat}<button class="section-toggle" onclick={() => showConfig = !showConfig}>
    {showConfig ? '▾' : '▸'} {t('config.title')}
  </button>
  {/if}
  {/if}
  <!--
    `flat` belongs in this gate. Every sub-section below already opens on
    `flat ||`, but the outer one did not, and `showConfig` starts closed —
    so pressing Settings in the ribbon opened a right panel with a heading
    and nothing underneath it.
  -->
  {#if showConfig || inline || flat}
  <div class="config-children">
    {#if flat}
      <span class="sub-heading">{t('config.grid')}</span>
    {:else}
      <button class="sub-toggle" onclick={() => showGridSub = !showGridSub}>
        {showGridSub ? '▾' : '▸'} {t('config.grid')}
      </button>
    {/if}
    {#if flat || showGridSub}
      {@const is3D = uiStore.analysisMode === '3d' || uiStore.analysisMode === 'pro'}
      {@const isPro = uiStore.analysisMode === 'pro'}
      {@const gridVisible = is3D ? uiStore.showGrid3D : uiStore.showGrid}
      <div class="sub-content" data-tour="cfg-grid">
        <label class="checkbox-item">
          <HelpTip text={t('config.tip.showAxes')}>
          <input type="checkbox" checked={is3D ? uiStore.showAxes3D : uiStore.showAxes}
            onchange={(e) => { if (is3D) uiStore.showAxes3D = e.currentTarget.checked; else uiStore.showAxes = e.currentTarget.checked; }} />
          <span>{t('config.showAxes')}</span>
          </HelpTip>
        </label>
        <!-- Basic mode: one "Local axes" control (members only — Basic has no shells).
             PRO keeps the member/shell split. Works in both Basic 2D and Basic 3D. -->
        <div class="input-group">
          <HelpTip text={t('config.tip.localAxes')}><label>{isPro ? t('config.localAxesMembers') : t('config.localAxes')}:</label></HelpTip>
          <select bind:value={uiStore.localAxesMode3D}>
            <option value="selected">{t('config.localAxesSelected')}</option>
            <option value="always">{t('config.localAxesAlways')}</option>
            <option value="never">{t('config.localAxesNever')}</option>
          </select>
        </div>
        {#if isPro}
          <div class="input-group">
            <HelpTip text={t('config.tip.localAxesShells')}><label>{t('config.localAxesShells')}:</label></HelpTip>
            <select bind:value={uiStore.shellAxesMode3D}>
              <option value="selected">{t('config.localAxesSelected')}</option>
              <option value="always">{t('config.localAxesAlways')}</option>
              <option value="never">{t('config.localAxesNever')}</option>
            </select>
          </div>
          <label class="checkbox-item">
            <HelpTip text={t('config.tip.smoothOrbit')}>
            <input type="checkbox" checked={uiStore.smoothOrbit3D}
              onchange={(e) => { uiStore.smoothOrbit3D = e.currentTarget.checked; }} />
            <span>{t('config.smoothOrbit')}</span>
            </HelpTip>
          </label>
        {/if}
        <label class="checkbox-item">
          <HelpTip text={t('config.tip.showGrid')}>
          <input type="checkbox" checked={gridVisible}
            onchange={(e) => { if (is3D) uiStore.showGrid3D = e.currentTarget.checked; else uiStore.showGrid = e.currentTarget.checked; }} />
          <span>{t('config.showGrid')}</span>
          </HelpTip>
        </label>
        <div style="opacity: {gridVisible ? 1 : 0.4}; pointer-events: {gridVisible ? 'auto' : 'none'}; display: flex; flex-direction: column; gap: 0.35rem;">
          <label class="checkbox-item">
            <HelpTip text={t('config.tip.snapGrid')}>
            <input type="checkbox" checked={is3D ? uiStore.snapToGrid3D : uiStore.snapToGrid}
              onchange={(e) => { if (is3D) uiStore.snapToGrid3D = e.currentTarget.checked; else uiStore.snapToGrid = e.currentTarget.checked; }} />
            <span>{t('config.snapGrid')}</span>
            </HelpTip>
          </label>
          <div class="input-group">
            <HelpTip text={t('config.tip.gridSize')}><label>{is3D ? t('config.gridSizeXZ') : `${t('config.gridSize')} (${ul('length')})`}:</label></HelpTip>
            <input
              type="number"
              value={is3D ? uiStore.gridSize3D : uiStore.gridSize}
              oninput={(e) => { const v = parseFloat(e.currentTarget.value); if (!isNaN(v) && v > 0) { if (is3D) uiStore.gridSize3D = v; else uiStore.gridSize = v; } }}
              min="0.1"
              step="0.1"
            />
          </div>
          {#if is3D}
            <div class="input-group" style="flex-direction: column; align-items: stretch;">
              <HelpTip text={t('config.tip.gridExtent')}><label>{t('config.gridExtent')}: {uiStore.gridExtent3D}×{uiStore.gridExtent3D} m</label></HelpTip>
              <input
                type="range"
                min="20"
                max="100"
                step="10"
                value={uiStore.gridExtent3D}
                oninput={(e) => { uiStore.gridExtent3D = parseInt(e.currentTarget.value); }}
              />
            </div>
          {/if}
        </div>
      </div>
    {/if}

    {#if flat}

      <span class="sub-heading">{t('config.model')}</span>

    {:else}

      <button class="sub-toggle" onclick={() => showStructureSub = !showStructureSub}>

        {showStructureSub ? '▾' : '▸'} {t('config.model')}

      </button>

    {/if}
    {#if flat || showStructureSub}
      {@const is3Dm = uiStore.analysisMode === '3d' || uiStore.analysisMode === 'pro'}
      <div class="sub-content" data-tour="cfg-model">
        <label class="checkbox-item">
          <HelpTip text={t('config.tip.nodeIds')}>
          <input type="checkbox" checked={is3Dm ? uiStore.showNodeLabels3D : uiStore.showNodeLabels}
            onchange={(e) => { if (is3Dm) uiStore.showNodeLabels3D = e.currentTarget.checked; else uiStore.showNodeLabels = e.currentTarget.checked; }} />
          <span>{t('config.nodeIds')}</span>
          </HelpTip>
        </label>
        <label class="checkbox-item">
          <HelpTip text={t('config.tip.elementIds')}>
          <input type="checkbox" checked={is3Dm ? uiStore.showElementLabels3D : uiStore.showElementLabels}
            onchange={(e) => { if (is3Dm) uiStore.showElementLabels3D = e.currentTarget.checked; else uiStore.showElementLabels = e.currentTarget.checked; }} />
          <span>{t('config.elementIds')}</span>
          </HelpTip>
        </label>
        <label class="checkbox-item">
          <HelpTip text={t('config.tip.lengths')}>
          <input type="checkbox" checked={is3Dm ? uiStore.showLengths3D : uiStore.showLengths}
            onchange={(e) => { if (is3Dm) uiStore.showLengths3D = e.currentTarget.checked; else uiStore.showLengths = e.currentTarget.checked; }} />
          <span>{t('config.lengths')}</span>
          </HelpTip>
        </label>
        <label class="checkbox-item">
          <HelpTip text={t('config.tip.showLoads')}>
          <input type="checkbox" checked={is3Dm ? uiStore.showLoads3D : uiStore.showLoads}
            onchange={(e) => { if (is3Dm) uiStore.showLoads3D = e.currentTarget.checked; else uiStore.showLoads = e.currentTarget.checked; }} />
          <span>{t('config.showLoads')}</span>
          </HelpTip>
        </label>
        {#if !is3Dm}
          <label class="checkbox-item">
            <HelpTip text={t('config.tip.autoSplit')}>
            <input type="checkbox" bind:checked={uiStore.autoSplitOnNodePlace} />
            <span>{t('config.autoSplitElements')}</span>
            </HelpTip>
          </label>
        {/if}
        <div class="input-group">
          <HelpTip text={t('config.tip.units')}><label>{t('config.units')}:</label></HelpTip>
          <select bind:value={uiStore.unitSystem}>
            <option value="SI">{t('config.unitSI')}</option>
            <option value="Imperial">{t('config.unitImperial')}</option>
          </select>
        </div>
        <div class="input-group">
          <HelpTip text={t('config.tip.axisConvention')}><label>{t('config.localAxes')}:</label></HelpTip>
          <select bind:value={uiStore.axisConvention3D}>
            <option value="rightHand">{t('config.rightHand')}</option>
            <option value="leftHand">{t('config.leftHand')}</option>
          </select>
          <span class="help-hint"
            title={t('config.axisConventionHelp')}>?</span>
        </div>
        {#if is3Dm}
          <div class="input-group">
            <HelpTip text={t('config.tip.momentStyle')}>
            <select bind:value={uiStore.momentStyle3D}>
              <option value="double-arrow">{t('config.momentsDoubleArrow')}</option>
              <option value="curved">{t('config.momentsCurved')}</option>
            </select>
            </HelpTip>
          </div>
          <div class="input-group">
            <HelpTip text={t('config.tip.renderMode')}>
            <select bind:value={uiStore.renderMode3D}>
              <option value="wireframe">{t('config.wireframe')}</option>
              <option value="solid">{t('config.solid')}</option>
              <option value="sections">{t('config.sections')}</option>
            </select>
            </HelpTip>
          </div>
        {:else}
          <div class="input-group">
            <HelpTip text={t('config.tip.color')}><label>{t('config.color')}:</label></HelpTip>
            <select bind:value={uiStore.elementColorMode}>
              <option value="uniform">{t('config.uniform')}</option>
              <option value="byMaterial">{t('config.byMaterial')}</option>
              <option value="bySection">{t('config.bySection')}</option>
            </select>
          </div>
        {/if}
      </div>
    {/if}

    {#if flat}

      <span class="sub-heading">{t('config.resultsSection')}</span>

    {:else}

      <button class="sub-toggle" onclick={() => showResultsSub = !showResultsSub}>

        {showResultsSub ? '▾' : '▸'} {t('config.resultsSection')}

      </button>

    {/if}
    {#if flat || showResultsSub}
      <div class="sub-content" data-tour="cfg-results">
        <label class="checkbox-item">
          <HelpTip text={t('config.tip.showValues')}>
          <input type="checkbox" bind:checked={resultsStore.showDiagramValues} />
          <span>{t('config.showValues')}</span>
          </HelpTip>
        </label>
        <label class="checkbox-item">
          <HelpTip text={t('config.tip.showReactions')}>
          <input type="checkbox" bind:checked={resultsStore.showReactions} />
          <span>{t('config.showReactions')}</span>
          </HelpTip>
        </label>
        <label class="checkbox-item">
          <HelpTip text={t('config.tip.showConstraintForces')}>
          <input type="checkbox" bind:checked={resultsStore.showConstraintForces} />
          <span>{t('config.showConstraintForces')}</span>
          </HelpTip>
        </label>
        <label class="checkbox-item">
          <HelpTip text={t('config.tip.hideLoadsWithDiagram')}>
          <input type="checkbox" bind:checked={uiStore.hideLoadsWithDiagram} />
          <span>{t('config.hideLoadsWithDiagram')}</span>
          </HelpTip>
        </label>
        <label class="checkbox-item">
          <HelpTip text={t('config.tip.showPrimarySelector')}>
          <input type="checkbox" bind:checked={uiStore.showPrimarySelector} />
          <span>{t('config.showPrimarySelector')}</span>
          </HelpTip>
        </label>
        <label class="checkbox-item" class:checkbox-disabled={!uiStore.showPrimarySelector}>
          <HelpTip text={t('config.tip.showSecondarySelector')}>
          <input type="checkbox" bind:checked={uiStore.showSecondarySelector}
                 disabled={!uiStore.showPrimarySelector} />
          <span>{t('config.showSecondarySelector')}</span>
          </HelpTip>
        </label>
        <label class="checkbox-item">
          <HelpTip text={t('config.tip.drawPositiveTowardLocalAxes')}>
          <input type="checkbox" bind:checked={resultsStore.drawPositiveTowardLocalAxes} />
          <span>{t('config.drawPositiveTowardLocalAxes')}</span>
          </HelpTip>
        </label>
      </div>
    {/if}

    {#if !inline}
    <button class="config-action-btn live-calc-btn" class:live-calc-active={uiStore.liveCalc}
      onclick={() => uiStore.liveCalc = !uiStore.liveCalc}
      title={t('config.liveCalcTooltip')}>
      {t('config.liveCalc')} — {uiStore.liveCalc ? t('config.liveCalcOn') : t('config.liveCalcOff')}
    </button>
    {/if}
  </div>
  {/if}
</div>

<style>
  .toolbar-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .section-toggle {
    width: 100%;
    padding: 0.4rem 0.5rem;
    background: none;
    border: 1px solid var(--st-hair);
    border-radius: 4px;
    color: var(--st-text-2);
    cursor: pointer;
    font-size: 0.75rem;
    font-weight: 600;
    text-align: left;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    transition: all 0.2s;
  }

  .section-toggle:hover {
    background: var(--st-bg);
    color: var(--st-text);
    border-color: var(--st-hair-strong);
  }

  /* Configuración sub-sections */
  .config-children {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding-left: 0.2rem;
    padding-right: 0.2rem;
  }

  .sub-heading {
    display: block;
    font-family: var(--st-mono);
    font-size: 0.66rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--st-text-2);
    padding: 0.5rem 0 0.2rem;
    border-bottom: 1px solid var(--st-hair);
    margin-bottom: 0.25rem;
  }

  .sub-toggle {
    width: 100%;
    padding: 0.25rem 0.4rem;
    background: none;
    border: 1px solid var(--st-hair);
    border-radius: 3px;
    color: var(--st-text-2);
    cursor: pointer;
    font-size: 0.68rem;
    font-weight: 500;
    text-align: left;
    letter-spacing: 0.03em;
    transition: all 0.2s;
  }
  .sub-toggle:hover {
    background: var(--st-bg);
    color: var(--st-text);
    border-color: var(--st-hair-strong);
  }

  .sub-content {
    padding: 0.4rem 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    border: 1px solid var(--st-hair);
    border-radius: 4px;
    margin-top: 0.15rem;
    overflow: hidden;
  }

  .sub-content select {
    font-size: 0.68rem;
    padding: 0.2rem 0.3rem;
  }
  .sub-content .input-group label {
    font-size: 0.65rem;
  }

  .checkbox-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    cursor: pointer;
  }

  .checkbox-item.checkbox-disabled {
    opacity: 0.4;
    pointer-events: none;
  }

  .input-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
  }

  .input-group input {
    width: 70px;
    padding: 0.25rem;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: 4px;
    color: var(--st-text);
    cursor: pointer;
  }

  .input-group select {
    flex: 1;
    min-width: 100px;
    padding: 0.25rem;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: 4px;
    color: var(--st-text);
    cursor: pointer;
  }

  input[type="radio"],
  input[type="checkbox"] {
    accent-color: var(--st-accent);
  }

  .help-hint {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 1px solid var(--st-hair-strong);
    color: var(--st-text-3);
    font-size: 0.6rem;
    font-weight: 600;
    cursor: help;
    flex-shrink: 0;
  }
  .help-hint:hover {
    border-color: var(--st-interactive);
    color: var(--st-value);
  }

  .config-action-btn {
    width: 100%;
    padding: 0.25rem 0.4rem;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: 3px;
    color: var(--st-value);
    cursor: pointer;
    font-size: 0.68rem;
    transition: all 0.2s;
  }
  .config-action-btn:hover {
    background: var(--st-surface-3);
    color: white;
  }
  .live-calc-btn {
    color: var(--st-text-3);
    background: var(--st-bg);
    border-color: var(--st-hair);
  }
  .live-calc-btn:hover {
    background: var(--st-bg);
    color: var(--st-text);
  }
  .live-calc-active {
    color: var(--st-value);
    background: var(--st-surface-2);
    border-color: var(--st-interactive);
  }
  .live-calc-active:hover {
    background: var(--st-surface-3);
    color: white;
  }
</style>
