<script lang="ts">
  import { axesStore } from '../../lib/axes/axes.svelte';
  import { upLabel } from '../../lib/axes/frame';
  import { uiStore, resultsStore } from '../../lib/store';
  import LocaleSelect from '../LocaleSelect.svelte';

  /**
   * The floor sizes worth offering, in metres.
   *
   * Round numbers an order of magnitude apart: a test frame, a building, a
   * site, a district. `updateGrid` draws only a patch around the view, and drops
   * the finest lines when zoomed far out, so a 10 km floor does not ask for
   * twenty thousand line segments.
   */
  const GRID_EXTENTS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
  import { authStore } from '../../lib/store/auth.svelte';
  import { usageConsent } from '../../lib/telemetry/consent.svelte';
  import { legalHref, USAGE_DATA_PATH } from '../../lib/legal/legal';
  import { t } from '../../lib/i18n';
  import { setLocale, OFFERED_LOCALES, i18n } from '../../lib/i18n/store.svelte';
  import { LOCALE_NAMES } from '../../lib/i18n/offered';
  import HelpTip from '../HelpTip.svelte';
  import UnitInput from '../UnitInput.svelte';
  import { toQ, unitQ } from '../../lib/store/display-units.svelte';
  import { announceDesignOn, DESIGN_LIMITS } from '../../lib/store/design-presence';

  const gridSizeLabel = () => `${t('config.gridSpacing')} (${unitQ('length')})`;
  /** A floor extent in whole units: they are round numbers of metres, 20 to 10 000. */
  const extentLabel = (m: number) => String(Math.round(toQ(m, 'length')));

  function setUsageSharing(granted: boolean) {
    usageConsent.set(granted ? 'granted' : 'denied');
    if (authStore.isAuthenticated) void authStore.recordConsent('usage_analytics', granted).catch(() => {});
  }
  const axesSummary = $derived(t('axes.configSummary')
    .replace('{up}', upLabel(axesStore.frame).replace('+', ''))
    .replace('{hand}', t(axesStore.choice.hand === 'right' ? 'axes.right' : 'axes.left'))
    .replace('{local}', t(uiStore.axisConvention3D === 'leftHand' ? 'axes.left' : 'axes.right')));
  const is3D = $derived(uiStore.is3DWorkspace);
  const isPro = $derived(uiStore.appMode === 'pro');
  const gridVisible = $derived(is3D ? uiStore.showGrid3D : uiStore.showGrid);
</script>

{#snippet check(tip: string | null, label: string, checked: boolean, set: (v: boolean) => void, testid?: string, disabled = false)}
  <label class="cfg-check" class:cfg-disabled={disabled}>
    {#if tip}
      <HelpTip text={tip}>
        <input type="checkbox" {checked} {disabled} data-testid={testid} onchange={(e) => set(e.currentTarget.checked)} />
        <span>{label}</span>
      </HelpTip>
    {:else}
      <input type="checkbox" {checked} {disabled} data-testid={testid} onchange={(e) => set(e.currentTarget.checked)} />
      <span>{label}</span>
    {/if}
  </label>
{/snippet}

<div class="cfg" data-tour="config-section">
  {#if uiStore.isMobile}
    <section class="cfg-sec">
      <h4 class="cfg-heading cfg-mobile-heading">{t('config.mobileSection')}</h4>
      <div class="cfg-field cfg-lang">
        <HelpTip text={t('config.tip.language')}><label for="cfg-lang">{t('app.language')}</label></HelpTip>
        <LocaleSelect
          value={i18n.locale}
          options={OFFERED_LOCALES}
          label={(c) => LOCALE_NAMES[c as keyof typeof LOCALE_NAMES]}
          onChange={(c) => setLocale(c)}
          ariaLabel={t('app.language')}
          testid="cfg-lang"
        />
      </div>
      <div class="cfg-field cfg-density">
        <HelpTip text={t('config.tip.touchDensity')}><label for="cfg-density">{t('config.touchDensity')}</label></HelpTip>
        <select id="cfg-density" bind:value={uiStore.touchDensity} data-testid="cfg-density-select">
          <option value="compact">{t('config.densityCompact')}</option>
          <option value="comfortable">{t('config.densityComfortable')}</option>
        </select>
      </div>
    </section>
  {/if}

  <section class="cfg-sec" data-tour="cfg-view">
    <h4 class="cfg-heading">{t('config.view')}</h4>
    {@render check(t('config.tip.showAxes'), t('config.showAxes'), is3D ? uiStore.showAxes3D : uiStore.showAxes,
      (v) => { if (is3D) uiStore.showAxes3D = v; else uiStore.showAxes = v; })}
    <div class="cfg-field">
      <HelpTip text={t('config.tip.localAxes')}><label for="cfg-local-axes">{isPro ? t('config.localAxesMembers') : t('config.localAxes')}</label></HelpTip>
      <select id="cfg-local-axes" bind:value={uiStore.localAxesMode3D}>
        <option value="selected">{t('config.localAxesSelected')}</option>
        <option value="always">{t('config.localAxesAlways')}</option>
        <option value="never">{t('config.localAxesNever')}</option>
      </select>
    </div>
    {#if isPro}
      <div class="cfg-field">
        <HelpTip text={t('config.tip.localAxesShells')}><label for="cfg-shell-axes">{t('config.localAxesShells')}</label></HelpTip>
        <select id="cfg-shell-axes" bind:value={uiStore.shellAxesMode3D}>
          <option value="selected">{t('config.localAxesSelected')}</option>
          <option value="always">{t('config.localAxesAlways')}</option>
          <option value="never">{t('config.localAxesNever')}</option>
        </select>
      </div>
    {/if}
    {#if is3D}
      <div class="cfg-field">
        <HelpTip text={t('config.tip.renderMode')}><label for="cfg-render">{t('config.renderMode')}</label></HelpTip>
        <select id="cfg-render" bind:value={uiStore.renderMode3D}>
          <option value="wireframe">{t('config.wireframe')}</option>
          <option value="solid">{t('config.solid')}</option>
          <option value="sections">{t('config.sections')}</option>
        </select>
      </div>
      <div class="cfg-field">
        <HelpTip text={t('config.tip.nodeStyle')}><label for="cfg-node-style">{t('config.nodeStyle')}</label></HelpTip>
        <select id="cfg-node-style" bind:value={uiStore.nodeStyle3D} data-testid="cfg-node-style">
          <option value="auto">{t('config.nodeStyleAuto')}</option>
          <option value="points">{t('config.nodeStylePoints')}</option>
          <option value="spheres">{t('config.nodeStyleSpheres')}</option>
        </select>
      </div>
      <div class="cfg-field">
        <HelpTip text={t('config.tip.momentStyle')}><label for="cfg-moments">{t('config.momentStyle')}</label></HelpTip>
        <select id="cfg-moments" bind:value={uiStore.momentStyle3D}>
          <option value="double-arrow">{t('config.momentArrowDouble')}</option>
          <option value="curved">{t('config.momentArrowCurved')}</option>
        </select>
      </div>
    {:else}
      <div class="cfg-field">
        <HelpTip text={t('config.tip.color')}><label for="cfg-color">{t('config.color')}</label></HelpTip>
        <select id="cfg-color" bind:value={uiStore.elementColorMode}>
          <option value="uniform">{t('config.uniform')}</option>
          <option value="byMaterial">{t('config.byMaterial')}</option>
          <option value="bySection">{t('config.bySection')}</option>
          <option value="byGroup">{t('config.byGroup')}</option>
        </select>
      </div>
    {/if}
    {#if isPro}
      {@render check(t('config.tip.smoothOrbit'), t('config.smoothOrbit'), uiStore.smoothOrbit3D, (v) => { uiStore.smoothOrbit3D = v; })}
    {/if}
  </section>

  <section class="cfg-sec" data-tour="cfg-grid">
    <h4 class="cfg-heading">{t('config.grid')}</h4>
    {@render check(t('config.tip.showGrid'), t('config.showGrid'), gridVisible,
      (v) => { if (is3D) uiStore.showGrid3D = v; else uiStore.showGrid = v; })}
    <div class="cfg-dependent" class:cfg-disabled={!gridVisible}>
      {@render check(t('config.tip.snapGrid'), t('config.snapGrid'), is3D ? uiStore.snapToGrid3D : uiStore.snapToGrid,
        (v) => { if (is3D) uiStore.snapToGrid3D = v; else uiStore.snapToGrid = v; })}
      <div class="cfg-field">
        <HelpTip text={t('config.tip.gridSize')}><label>{gridSizeLabel()}</label></HelpTip>
        <div class="cfg-num">
          <UnitInput
            value={is3D ? uiStore.gridSize3D : uiStore.gridSize}
            qty="length"
            unit={false}
            live
            min={0.001}
            onchange={(v) => { if (v > 0) { if (is3D) uiStore.gridSize3D = v; else uiStore.gridSize = v; } }}
          />
        </div>
      </div>
      {#if is3D}
        <div class="cfg-slider">
          <HelpTip text={t('config.tip.gridExtent')}><label for="cfg-grid-extent">{t('config.gridExtent')}</label></HelpTip>
          <input
            id="cfg-grid-extent"
            type="range"
            min="0"
            max={GRID_EXTENTS.length - 1}
            step="1"
            value={Math.max(0, GRID_EXTENTS.indexOf(uiStore.gridExtent3D))}
            oninput={(e) => { uiStore.gridExtent3D = GRID_EXTENTS[parseInt(e.currentTarget.value)]; }}
            data-testid="cfg-grid-extent"
          />
          <span class="cfg-slider-val">{extentLabel(uiStore.gridExtent3D)} {unitQ('length')}</span>
        </div>
      {/if}
    </div>
  </section>

  <section class="cfg-sec" data-tour="cfg-model">
    <h4 class="cfg-heading">{t('config.model')}</h4>
    {@render check(t('config.tip.nodeIds'), t('config.nodeIds'), is3D ? uiStore.showNodeLabels3D : uiStore.showNodeLabels,
      (v) => { if (is3D) uiStore.showNodeLabels3D = v; else uiStore.showNodeLabels = v; }, 'cfg-node-ids')}
    {@render check(t('config.tip.elementIds'), t('config.elementIds'), is3D ? uiStore.showElementLabels3D : uiStore.showElementLabels,
      (v) => { if (is3D) uiStore.showElementLabels3D = v; else uiStore.showElementLabels = v; })}
    {#if is3D}
      {@render check(t('config.tip.shellIds'), t('config.shellIds'), uiStore.showShellLabels3D, (v) => { uiStore.showShellLabels3D = v; }, 'cfg-shell-ids')}
    {/if}
    {@render check(t('config.tip.lengths'), t('config.lengths'), is3D ? uiStore.showLengths3D : uiStore.showLengths,
      (v) => { if (is3D) uiStore.showLengths3D = v; else uiStore.showLengths = v; })}
    {@render check(t('config.tip.showLoads'), t('config.showLoads'), is3D ? uiStore.showLoads3D : uiStore.showLoads,
      (v) => { if (is3D) uiStore.showLoads3D = v; else uiStore.showLoads = v; })}
    {@render check(t('config.tip.showSupports'), t('config.showSupports'), uiStore.showSupports, (v) => { uiStore.showSupports = v; }, 'cfg-show-supports')}
    <div class="cfg-slider">
      <HelpTip text={t('config.tip.labelSize')}><label for="cfg-label-size">{t('config.labelSize')}</label></HelpTip>
      <input id="cfg-label-size" type="range" data-testid="cfg-label-size"
        min={uiStore.labelScaleRange[0]} max={uiStore.labelScaleRange[1]} step="0.1"
        value={uiStore.labelScale}
        oninput={(e) => { uiStore.labelScale = parseFloat(e.currentTarget.value); }} />
      <span class="cfg-slider-val">{Math.round(uiStore.labelScale * 100)} %</span>
    </div>
    <!-- PRO sets the same factor from its load cases panel. -->
    {#if !isPro}
      <div class="cfg-slider">
        <HelpTip text={t('config.tip.loadSize')}><label for="cfg-load-size">{t('config.loadSize')}</label></HelpTip>
        <input id="cfg-load-size" type="range" data-testid="cfg-load-size"
          min={uiStore.loadArrowScaleRange[0]} max={uiStore.loadArrowScaleRange[1]} step="0.1"
          value={uiStore.loadArrowScale}
          oninput={(e) => { uiStore.loadArrowScale = parseFloat(e.currentTarget.value); }} />
        <span class="cfg-slider-val">{Math.round(uiStore.loadArrowScale * 100)} %</span>
      </div>
    {/if}
    {#if !is3D}
      {@render check(t('config.tip.memberDims'), t('config.memberDims'), uiStore.showMemberDimensions, (v) => { uiStore.showMemberDimensions = v; }, 'cfg-member-dims')}
      {@render check(t('config.tip.autoSplit'), t('config.autoSplitElements'), uiStore.autoSplitOnNodePlace, (v) => { uiStore.autoSplitOnNodePlace = v; })}
    {/if}
  </section>

  <section class="cfg-sec" data-tour="cfg-results">
    <h4 class="cfg-heading">{t('config.resultsSection')}</h4>
    {@render check(t('config.tip.showValues'), t('config.showValues'), resultsStore.showDiagramValues, (v) => { resultsStore.showDiagramValues = v; })}
    {@render check(t('config.tip.showReactions'), t('config.showReactions'), resultsStore.showReactions, (v) => { resultsStore.showReactions = v; })}
    {@render check(t('config.tip.showConstraintForces'), t('config.showConstraintForces'), resultsStore.showConstraintForces, (v) => { resultsStore.showConstraintForces = v; })}
    {@render check(t('config.tip.hideLoadsWithDiagram'), t('config.hideLoadsWithDiagram'), uiStore.hideLoadsWithDiagram, (v) => { uiStore.hideLoadsWithDiagram = v; })}
    {@render check(t('config.tip.drawPositiveTowardLocalAxes'), t('config.drawPositiveTowardLocalAxes'), resultsStore.drawPositiveTowardLocalAxes, (v) => { resultsStore.drawPositiveTowardLocalAxes = v; })}
    {@render check(t('config.tip.showPrimarySelector'), t('config.showPrimarySelector'), uiStore.showPrimarySelector, (v) => { uiStore.showPrimarySelector = v; })}
    <div class="cfg-dependent">
      {@render check(t('config.tip.showSecondarySelector'), t('config.showSecondarySelector'), uiStore.showSecondarySelector,
        (v) => { uiStore.showSecondarySelector = v; }, undefined, !uiStore.showPrimarySelector)}
    </div>
  </section>

  <section class="cfg-sec" data-tour="cfg-general">
    <h4 class="cfg-heading">{t('config.general')}</h4>
    <div class="cfg-field">
      <HelpTip text={t('config.tip.units')}><label for="cfg-units">{t('config.units')}</label></HelpTip>
      <select id="cfg-units" bind:value={uiStore.unitSystem} data-testid="cfg-units">
        <option value="SI">{t('config.unitSI')}</option>
        <option value="SImm">{t('config.unitSImm')}</option>
        <option value="MKS">{t('config.unitMKS')}</option>
        <option value="Imperial">{t('config.unitImperial')}</option>
      </select>
    </div>
    {#if __PUBLIC_FEATURES__.globalAxes}
      <div class="cfg-field">
        <HelpTip text={t('axes.configTip')}><label for="cfg-axes-open">{t('axes.configLabel')}</label></HelpTip>
        <div class="cfg-axes">
          <span class="cfg-axes-summary" data-testid="cfg-axes-summary">{axesSummary}</span>
          <button type="button" id="cfg-axes-open" class="cfg-btn" data-testid="cfg-axes-open" onclick={() => { axesStore.pickerOpen = true; }}>{t('axes.configOpen')}</button>
        </div>
      </div>
    {:else}
      <div class="cfg-field">
        <HelpTip text={t('config.tip.axisConvention')}><label for="cfg-axis-conv">{t('config.localAxes')}</label></HelpTip>
        <select id="cfg-axis-conv" bind:value={uiStore.axisConvention3D} title={t('config.axisConventionHelp')}>
          <option value="rightHand">{t('config.rightHand')}</option>
          <option value="leftHand">{t('config.leftHand')}</option>
        </select>
      </div>
    {/if}
    {@render check(t('config.liveCalcTooltip'), t('config.liveCalc'), uiStore.liveCalc, (v) => { uiStore.liveCalc = v; }, 'cfg-live-calc')}
    {#if !uiStore.isMobile}
      {@render check(t('config.tip.panelScrollbars'), t('config.panelScrollbars'), uiStore.panelScrollbars, (v) => { uiStore.panelScrollbars = v; }, 'cfg-panel-scrollbars')}
    {/if}
    {#if uiStore.appMode === 'basico'}
      {@render check(null, t('config.eduInBasic'), uiStore.eduInBasic, (v) => { uiStore.eduInBasic = v; }, 'cfg-edu-in-basic')}
      <p class="cfg-hint">{t('config.eduInBasicHint')}</p>
    {/if}
    {#if isPro}
      {@render check(null, t('config.inlineHelp'), uiStore.inlineHelp, (v) => { uiStore.inlineHelp = v; }, 'cfg-inline-help')}
      <p class="cfg-hint">{t('config.inlineHelpSummary')}</p>
      {@render check(null, t('config.designInPro'), uiStore.designInPro,
        (v) => { uiStore.designInPro = v; if (v) announceDesignOn(); }, 'cfg-design-in-pro')}
      <p class="cfg-hint">{t('config.designInProSummary')}</p>
      <details class="cfg-limits" data-testid="cfg-design-limits">
        <summary>{t('config.designLimits.title')}</summary>
        <p>{t('config.designLimits.rule')}</p>
        <ul>
          {#each DESIGN_LIMITS as key (key)}<li>{t(`config.designLimits.${key}`)}</li>{/each}
        </ul>
      </details>
    {/if}
  </section>

  {#if __PUBLIC_FEATURES__.accounts && authStore.usageTelemetryEnabled}
    <section class="cfg-sec" data-testid="cfg-privacy">
      <h4 class="cfg-heading">{t('usage.settingsHeading')}</h4>
      {@render check(null, t('usage.share'), usageConsent.granted, setUsageSharing, 'cfg-usage-sharing')}
      <p class="cfg-hint">{t('usage.settingsHint')} <a href={legalHref(USAGE_DATA_PATH, i18n.locale)} target="_blank" rel="noopener noreferrer">{t('usage.whatIsSent')}</a></p>
    </section>
  {/if}
</div>

<style>
  .cfg {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    padding: 0 0.2rem 0.6rem;
    font-size: 0.8rem;
    color: var(--st-text);
  }

  .cfg-sec {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .cfg-heading {
    margin: 0 0 0.15rem;
    padding: 0.35rem 0 0.25rem;
    border-bottom: 1px solid var(--st-hair);
    font-family: var(--st-mono);
    font-size: 0.66rem;
    font-weight: 400;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--st-text-2);
  }

  .cfg-check {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 22px;
    cursor: pointer;
  }
  .cfg-check :global(.ht-wrap) { gap: 0.5rem; }
  .cfg-check input { margin: 0; flex: none; }

  .cfg-disabled {
    opacity: 0.4;
    pointer-events: none;
  }

  .cfg-dependent {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .cfg-dependent > .cfg-check { padding-left: 1.35rem; }

  .cfg-field {
    display: grid;
    grid-template-columns: minmax(6.5rem, 38%) minmax(0, 1fr);
    align-items: center;
    gap: 0.6rem;
    min-height: 26px;
  }
  .cfg-field label { color: var(--st-text-2); }

  .cfg-field select {
    width: 100%;
    min-width: 0;
    height: 26px;
    padding: 0 0.35rem;
    font-size: 0.75rem;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    color: var(--st-text);
    cursor: pointer;
  }

  .cfg-num :global(input) {
    width: 80px;
    height: 26px;
    padding: 0 0.35rem;
    font-size: 0.75rem;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    color: var(--st-text);
  }

  .cfg-slider {
    display: grid;
    grid-template-columns: minmax(6.5rem, 38%) minmax(0, 1fr) 5.5em;
    align-items: center;
    gap: 0.6rem;
    min-height: 26px;
  }
  .cfg-slider label { color: var(--st-text-2); }
  .cfg-slider input[type="range"] { width: 100%; min-width: 0; margin: 0; accent-color: var(--st-accent); }
  .cfg-slider-val {
    text-align: right;
    font-variant-numeric: tabular-nums;
    font-size: 0.72rem;
    color: var(--st-text-3);
    white-space: nowrap;
  }

  .cfg-axes {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }
  .cfg-axes-summary { flex: 1; min-width: 0; font-size: 0.72rem; color: var(--st-text-2); }
  .cfg-btn {
    flex: none;
    height: 24px;
    padding: 0 10px;
    font: inherit;
    font-size: 0.72rem;
    color: var(--st-interactive);
    background: var(--st-surface-3);
    border: 1px solid var(--st-border);
    border-radius: var(--st-radius);
    cursor: pointer;
  }

  .cfg-hint {
    margin: -0.25rem 0 0.15rem 1.35rem;
    font-size: 0.68rem;
    line-height: 1.4;
    color: var(--st-text-3);
  }
  .cfg-hint a { color: var(--st-interactive, var(--st-accent)); }

  .cfg-limits {
    margin-left: 1.35rem;
    font-size: 0.7rem;
    color: var(--st-text-2);
  }
  .cfg-limits summary { cursor: pointer; }
  .cfg-limits p { margin: 0.3rem 0 0; color: var(--st-text-3); line-height: 1.4; }
  .cfg-limits ul { margin: 0.3rem 0 0; padding-left: 1rem; display: flex; flex-direction: column; gap: 3px; line-height: 1.4; }

  input[type="checkbox"] { accent-color: var(--st-accent); }
</style>
