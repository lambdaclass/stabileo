<script lang="ts">

  /**
   * `docked` renders this panel inside the right-hand panel instead of floating
   * over the canvas.
   *
   * Floating was the old shell's answer to "where does an analysis put its
   * output": a box pinned to a corner of the drawing area. With several
   * analyses open it stopped being an answer — Kinematic sat over the left of
   * the model, Explore over the right, and the structure they describe was
   * behind them. The new shell already has one place for anything that needs
   * area and outlives a single click, so that is where this goes; the floating
   * form is kept for mobile, which has no right panel to dock into.
   */
  let { docked = false }: { docked?: boolean } = $props();
  import { modelStore, uiStore } from '../lib/store';
  import { generateKinematicReport, type KinematicReport, type SlidingJointInput } from '../lib/engine/kinematic-report';
  import { t } from '../lib/i18n';

  // Collapsible sections
  let showStep1 = $state(true);
  let showStep2 = $state(true);
  let showStep3 = $state(true);
  let showBarAnalysis = $state(false);
  let showStep4 = $state(true);

  // Per-element collapsibles (all closed by default)
  let expandedElems = $state(new Set<number>());
  function toggleElem(elemId: number) {
    const next = new Set(expandedElems);
    if (next.has(elemId)) next.delete(elemId); else next.add(elemId);
    expandedElems = next;
  }

  // Quick-toggle helpers (mode-aware)
  const is3D = $derived(uiStore.analysisMode === '3d');

  // Kinematic report — cached, not auto-derived
  let report = $state<KinematicReport | null>(null);
  let lastAnalyzedVersion = $state(-1);

  // Is the report stale? (model changed since last analysis)
  const isStale = $derived(
    report !== null && modelStore.modelVersion !== lastAnalyzedVersion
  );

  function recompute() {
    const input = modelStore.buildSolverInput(false);
    if (!input) {
      report = null;
      return;
    }
    // Sliding joints are a Basic 2D feature stored as element-end translational
    // releases. They aren't on the solver wire, so pass them explicitly so the
    // determinacy count includes them (each releases one relative translation).
    const slidingJoints: SlidingJointInput[] = [];
    for (const e of modelStore.elements.values()) {
      if (e.releaseI?.slide) slidingJoints.push({ elemId: e.id, end: 'I', kind: e.releaseI.slide, axis: e.releaseI.slideAxis ?? 'global' });
      if (e.releaseJ?.slide) slidingJoints.push({ elemId: e.id, end: 'J', kind: e.releaseJ.slide, axis: e.releaseJ.slideAxis ?? 'global' });
    }
    report = generateKinematicReport(input, slidingJoints);
    lastAnalyzedVersion = modelStore.modelVersion;
  }

  // Main reactive logic: auto-recompute when appropriate
  $effect(() => {
    if (!uiStore.showKinematicPanel) {
      // Panel closed — reset state
      if (lastAnalyzedVersion !== -1) {
        lastAnalyzedVersion = -1;
        report = null;
      }
      return;
    }
    const v = modelStore.modelVersion;
    // Initial computation when panel first opens
    if (lastAnalyzedVersion === -1) {
      recompute();
      return;
    }
    // Auto-recompute on model changes when liveCalc is enabled
    if (uiStore.liveCalc && v !== lastAnalyzedVersion) {
      recompute();
    }
  });

  function close() {
    uiStore.showKinematicPanel = false;
  }

  // Close on Escape
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && uiStore.showKinematicPanel) close();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if uiStore.showKinematicPanel}
  <div class="kp-panel" class:docked={docked}>
    <div class="kp-header">
      <span class="kp-title">{t('kinematic.title')}</span>
      <div class="kp-header-actions">
        <button
          class="kp-quick-btn"
          class:kp-quick-active={is3D ? uiStore.showNodeLabels3D : uiStore.showNodeLabels}
          title={t('kinematic.toggleNodeIds')}
          onclick={() => { if (is3D) uiStore.showNodeLabels3D = !uiStore.showNodeLabels3D; else uiStore.showNodeLabels = !uiStore.showNodeLabels; }}>
          N
        </button>
        <button
          class="kp-quick-btn"
          class:kp-quick-active={is3D ? uiStore.showElementLabels3D : uiStore.showElementLabels}
          title={t('kinematic.toggleElementIds')}
          onclick={() => { if (is3D) uiStore.showElementLabels3D = !uiStore.showElementLabels3D; else uiStore.showElementLabels = !uiStore.showElementLabels; }}>
          E
        </button>
        <button
          class="kp-quick-btn"
          class:kp-quick-active={is3D ? uiStore.showLoads3D : uiStore.showLoads}
          title={t('kinematic.toggleLoads')}
          onclick={() => { if (is3D) uiStore.showLoads3D = !uiStore.showLoads3D; else uiStore.showLoads = !uiStore.showLoads; }}>
          Q
        </button>
        <button class="kp-close" onclick={close} title={t('kinematic.close')}>&times;</button>
      </div>
    </div>

    {#if !report}
      <div class="kp-body">
        <p class="kp-empty">{t('kinematic.empty')}</p>
      </div>
    {:else}
      <div class="kp-body">

        {#if isStale}
          <button class="kp-stale-btn" data-testid="kin-stale" onclick={recompute}>
            {t('kinematic.stale')}
          </button>
        {/if}

        <!-- ═══ PASO 1: Resumen ═══ -->
        <button class="kp-section-toggle" onclick={() => showStep1 = !showStep1}>
          <span class="kp-chevron">{showStep1 ? '▾' : '▸'}</span>
          {t('kinematic.step1Title')}
        </button>
        {#if showStep1}
          <div class="kp-section">
            <div class="kp-explanation" style="margin-bottom:0.3rem">{t('kinematic.step1Vars')}</div>
            <div class="kp-row">
              <span class="kp-label"><strong>n</strong> {t('kinematic.nodes')}</span>
              <span class="kp-value">{report.nNodes}</span>
            </div>
            {#if report.nFrames > 0}
              <div class="kp-row">
                <span class="kp-label"><strong>{report.nTrusses > 0 ? 'm_p' : 'm'}</strong> {t('kinematic.rigidBars')}</span>
                <span class="kp-value">{report.nFrames}</span>
              </div>
            {/if}
            {#if report.nTrusses > 0}
              <div class="kp-row">
                <span class="kp-label"><strong>{report.isPureTruss ? 'm' : 'm_r'}</strong> {t('kinematic.trussBars')}</span>
                <span class="kp-value">{report.nTrusses}</span>
              </div>
            {/if}

            {#if report.supportDetails.length > 0}
              <div class="kp-row" style="margin-top:0.2rem">
                <span class="kp-label"><strong>r</strong> {t('kinematic.supportReactions')}</span>
                <span class="kp-value">{report.totalR}</span>
              </div>
              {#each report.supportDetails as sup}
                <div class="kp-detail">
                  {t('kinematic.nodeDetail').replaceAll('{id}', String(sup.nodeId)).replaceAll('{type}', sup.type).replaceAll('{dofs}', String(sup.dofs)).replaceAll('{restrained}', sup.restrainedDofs)}
                </div>
              {/each}
            {:else}
              <div class="kp-detail kp-danger-text">{t('kinematic.noSupports')}</div>
            {/if}

            {#if report.hingeDetails.length > 0 || report.slideDetails.length > 0}
              <div class="kp-row" style="margin-top:0.2rem">
                <span class="kp-label"><strong>c</strong> {t('kinematic.internalConditions')}</span>
                <span class="kp-value">{report.totalC}</span>
              </div>
              {#each report.hingeDetails as hinge}
                <div class="kp-detail">
                  {t('kinematic.nodeHingeDetail').replaceAll('{id}', String(hinge.nodeId)).replaceAll('{explanation}', hinge.explanation)}
                </div>
              {/each}
              {#each report.slideDetails as slide}
                <div class="kp-detail">{slide.explanation}</div>
              {/each}
              {#if report.slideDetails.length > 0}
                <div class="kp-detail kp-muted">{t('kinematic.slideAxisNote')}</div>
              {/if}
            {:else if !report.isPureTruss}
              <div class="kp-detail kp-muted">{t('kinematic.noHinges')}</div>
            {/if}
          </div>
        {/if}

        <!-- ═══ PASO 2: Fórmula ═══ -->
        <button class="kp-section-toggle" onclick={() => showStep2 = !showStep2}>
          <span class="kp-chevron">{showStep2 ? '▾' : '▸'}</span>
          {t('kinematic.step2Title')}
        </button>
        {#if showStep2}
          <div class="kp-section">
            <div class="kp-formula">{report.formula}</div>
            <div class="kp-formula kp-formula-sub">{report.substitution}</div>
            <div class="kp-badge" class:kp-ok={report.classification === 'hyperstatic'}
              class:kp-warn={report.classification === 'isostatic'}
              class:kp-danger={report.classification === 'hypostatic'}>
              g = {report.degree}
            </div>
            <div class="kp-explanation">{report.classificationText}</div>
          </div>
        {/if}

        <!-- ═══ PASO 3: Verificación numérica ═══ -->
        <button class="kp-section-toggle" onclick={() => showStep3 = !showStep3}>
          <span class="kp-chevron">{showStep3 ? '▾' : '▸'}</span>
          {t('kinematic.step3Title')}
        </button>
        {#if showStep3}
          <div class="kp-section">
            <div class="kp-explanation">
              {@html t('kinematic.matrixExplanation').replaceAll('{n}', String(report.nFreeDofs))}
            </div>

            {#if report.mechanismModes === 0}
              <div class="kp-result kp-ok-bg">
                {t('kinematic.noMechanisms')}
              </div>
            {:else if report.hasHiddenMechanism}
              <div class="kp-result kp-danger-bg">
                {t('kinematic.hiddenMechanism').replaceAll('{n}', String(report.mechanismModes)).replaceAll('{s}', report.mechanismModes > 1 ? 's' : '').replaceAll('{degree}', String(report.degree))}
              </div>
              <div class="kp-explanation">
                {t('kinematic.hiddenMechanismExplanation')}
              </div>
            {:else}
              <div class="kp-result kp-danger-bg">
                {t('kinematic.mechanismDetected').replaceAll('{n}', String(report.mechanismModes)).replaceAll('{s}', report.mechanismModes > 1 ? 's' : '')}
              </div>
            {/if}

            {#if report.unconstrainedDofs.length > 0}
              <div class="kp-sub-title">{t('kinematic.freeMovements')}</div>
              {#each report.unconstrainedDofs as ud}
                <div class="kp-unconstrained">
                  <span class="kp-dof-badge">{t('kinematic.nodeDof').replaceAll('{id}', String(ud.nodeId)).replaceAll('{dofName}', ud.dofName)}</span>
                  <div class="kp-dof-explanation">{ud.explanation}</div>
                </div>
              {/each}
            {/if}

            <!-- Sub-collapsible: Análisis barra por barra -->
            {#if report.elementAnalysis.length > 0}
              <button class="kp-sub-toggle" onclick={() => showBarAnalysis = !showBarAnalysis}>
                <span class="kp-chevron">{showBarAnalysis ? '▾' : '▸'}</span>
                {t('kinematic.barByBarAnalysis')}
              </button>
              {#if showBarAnalysis}
                <div class="kp-sub-section">
                  {#each report.elementAnalysis as ea}
                    <div class="kp-elem-card"
                      class:kp-elem-ok={ea.status === 'isostatic'}
                      class:kp-elem-hyper={ea.status === 'hyperstatic'}
                      class:kp-elem-mech={ea.status === 'mechanism'}>
                      <button class="kp-elem-toggle" onclick={() => toggleElem(ea.elemId)}>
                        <span class="kp-elem-toggle-left">
                          <span class="kp-chevron">{expandedElems.has(ea.elemId) ? '▾' : '▸'}</span>
                          {t('kinematic.bar').replaceAll('{id}', String(ea.elemId))} <span class="kp-elem-type">({ea.type === 'frame' ? t('kinematic.rigid') : t('kinematic.truss')})</span>
                        </span>
                        <span class="kp-elem-badge"
                          class:kp-elem-badge-ok={ea.status === 'isostatic'}
                          class:kp-elem-badge-hyper={ea.status === 'hyperstatic'}
                          class:kp-elem-badge-mech={ea.status === 'mechanism'}>
                          {ea.status === 'isostatic' ? t('kinematic.statusIsostatic') : ea.status === 'hyperstatic' ? t('kinematic.statusHyperstatic') : t('kinematic.statusMechanism')}
                        </span>
                      </button>
                      {#if expandedElems.has(ea.elemId)}
                        <div class="kp-elem-body">
                          {#each ea.dofBreakdown.lines as line}
                            <div class="kp-dof-line" class:kp-dof-free={line.sources.length === 0}>
                              <span class="kp-dof-label">{line.dof}</span>
                              {#if line.sources.length === 0}
                                <span class="kp-dof-none">{t('kinematic.noRestriction')}</span>
                              {:else}
                                <span class="kp-dof-arrow">←</span>
                                <span class="kp-dof-sources">{line.displayText}</span>
                              {/if}
                            </div>
                          {/each}
                          <div class="kp-elem-summary">{ea.dofBreakdown.summary}</div>
                        </div>
                      {/if}
                    </div>
                  {/each}
                </div>
              {/if}
            {/if}
          </div>
        {/if}

        <!-- ═══ PASO 4: Sugerencias (solo si hay problemas) ═══ -->
        {#if report.suggestions.length > 0}
          <button class="kp-section-toggle" onclick={() => showStep4 = !showStep4}>
            <span class="kp-chevron">{showStep4 ? '▾' : '▸'}</span>
            {t('kinematic.step4Title')}
          </button>
          {#if showStep4}
            <div class="kp-section">
              <ul class="kp-suggestions">
                {#each report.suggestions as sug}
                  <li>{sug}</li>
                {/each}
              </ul>
            </div>
          {/if}
        {/if}

        <!-- ═══ Resultado final ═══ -->
        <div class="kp-footer">
          {#if report.isSolvable}
            <span class="kp-status kp-ok-text">{t('kinematic.stableResult')}</span>
          {:else}
            <span class="kp-status kp-danger-text">{t('kinematic.mechanismResult')}</span>
          {/if}
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  /*
     Docked, this panel's header is a section heading inside the right panel,
     not the title bar of a window: the rule above separates it from the
     analysis list it belongs to, and the type matches every other heading in
     the panel so the eye reads one column, not a widget dropped into one.
  */
  .kp-panel.docked .kp-header {
    background: none;
    padding: 0.5rem 0 0.35rem;
    margin-top: 0.5rem;
    border-top: 1px solid var(--st-hair);
    border-bottom: none;
  }

  .kp-panel.docked .kp-title {
    font-family: var(--st-mono);
    font-size: 0.68rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--st-text-2);
    font-weight: 400;
  }

  /* Docked: no chrome of its own — the right panel already supplies the frame. */
  .kp-panel.docked {
    position: static;
    width: auto;
    max-height: none;
    border: none;
    border-radius: 0;
    box-shadow: none;
    backdrop-filter: none;
    background: transparent;
    z-index: auto;
  }

  .kp-panel {
    position: absolute;
    bottom: 8px;
    left: 8px;
    width: 310px;
    max-height: calc(100% - 90px);
    background: var(--st-surface-2);
    border: 1px solid var(--st-surface-3);
    border-radius: 8px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.5);
    z-index: 105;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-size: 0.78rem;
    color: var(--st-text);
  }

  .kp-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.45rem 0.6rem;
    background: var(--st-surface-2);
    border-bottom: 1px solid var(--st-surface-3);
    flex-shrink: 0;
  }

  .kp-title {
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--st-text);
  }

  .kp-header-actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .kp-quick-btn {
    width: 22px;
    height: 22px;
    border: 1px solid var(--st-surface-3);
    border-radius: 4px;
    background: transparent;
    color: var(--st-text-3);
    font-size: 0.62rem;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: all 0.15s;
    line-height: 1;
  }
  .kp-quick-btn:hover {
    border-color: var(--st-surface-3);
    color: var(--st-text-2);
    background: rgba(23, 41, 58, 0.3);
  }
  /*
     N / E / Q are view toggles, so they take the accent every other active
     toggle in the application takes. They were green, which in this palette is
     reserved for "solved" and "stable" — the panel's own verdict sits four
     lines below in the same green, and two unrelated things claiming the same
     colour is how a status colour stops meaning anything.
  */
  .kp-quick-active {
    background: var(--st-selected-bg);
    border-color: var(--st-accent);
    color: var(--st-accent);
  }
  .kp-quick-active:hover {
    background: var(--st-selected-bg);
    border-color: var(--st-accent-hover);
    color: var(--st-accent-hover);
  }

  .kp-close {
    background: transparent;
    border: none;
    color: var(--st-text-3);
    font-size: 1.1rem;
    cursor: pointer;
    padding: 0 0.15rem;
    line-height: 1;
    margin-left: 0.15rem;
  }
  .kp-close:hover { color: var(--st-accent); }

  .kp-stale-btn {
    width: 100%;
    background: rgba(255, 193, 7, 0.08);
    border: 1px dashed rgba(255, 193, 7, 0.35);
    border-radius: 4px;
    color: var(--st-warn);
    font-size: 0.72rem;
    padding: 0.4rem 0.5rem;
    cursor: pointer;
    text-align: center;
    margin-bottom: 0.3rem;
    transition: background 0.15s;
  }
  .kp-stale-btn:hover {
    background: rgba(255, 193, 7, 0.18);
  }

  .kp-body {
    overflow-y: auto;
    padding: 0.3rem;
    flex: 1;
  }

  .kp-empty {
    color: var(--st-text-3);
    text-align: center;
    padding: 1rem;
    font-style: italic;
  }

  .kp-section-toggle {
    width: 100%;
    background: rgba(23, 41, 58, 0.3);
    border: none;
    border-radius: 4px;
    color: var(--st-text-2);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.35rem 0.5rem;
    cursor: pointer;
    text-align: left;
    margin-top: 0.25rem;
    transition: background 0.15s;
  }
  .kp-section-toggle:hover { background: rgba(23, 41, 58, 0.6); }

  .kp-chevron {
    display: inline-block;
    width: 1em;
    font-size: 0.7rem;
  }

  .kp-section {
    padding: 0.35rem 0.5rem 0.2rem;
  }

  .kp-row {
    display: flex;
    justify-content: space-between;
    padding: 0.1rem 0;
  }
  .kp-label { color: var(--st-text-3); }
  .kp-value { color: var(--st-text); font-weight: 500; }

  .kp-sub-title {
    font-weight: 600;
    color: var(--st-text-2);
    margin-top: 0.35rem;
    margin-bottom: 0.15rem;
    font-size: 0.73rem;
  }

  .kp-detail {
    padding: 0.15rem 0 0.15rem 0.4rem;
    border-left: 2px solid var(--st-surface-3);
    margin: 0.1rem 0;
    line-height: 1.4;
    font-size: 0.72rem;
  }

  .kp-muted { color: var(--st-text-3); }
  .kp-danger-text { color: var(--st-accent); }
  .kp-ok-text { color: var(--st-ok); }

  .kp-formula {
    font-family: 'Courier New', monospace;
    background: rgba(0,0,0,0.3);
    padding: 0.3rem 0.5rem;
    border-radius: 4px;
    text-align: center;
    color: var(--st-text);
    font-size: 0.78rem;
    margin: 0.2rem 0;
  }
  .kp-formula-sub {
    font-size: 0.74rem;
    color: var(--st-text-2);
  }

  .kp-badge {
    display: inline-block;
    padding: 0.2rem 0.6rem;
    border-radius: 12px;
    font-weight: 700;
    font-size: 0.82rem;
    margin: 0.3rem 0;
    text-align: center;
    width: 100%;
  }
  .kp-ok { background: rgba(42, 168, 105, 0.15); color: var(--st-ok); border: 1px solid rgba(42, 168, 105, 0.4); }
  .kp-warn { background: rgba(255, 193, 7, 0.12); color: var(--st-warn); border: 1px solid rgba(255, 193, 7, 0.35); }
  .kp-danger { background: rgba(229, 72, 42, 0.15); color: var(--st-accent); border: 1px solid rgba(229, 72, 42, 0.4); }

  .kp-explanation {
    font-size: 0.72rem;
    color: var(--st-text-3);
    line-height: 1.45;
    margin: 0.2rem 0;
  }

  .kp-result {
    padding: 0.35rem 0.5rem;
    border-radius: 4px;
    margin: 0.3rem 0;
    font-weight: 500;
    font-size: 0.74rem;
    line-height: 1.4;
  }
  .kp-ok-bg { background: rgba(42, 168, 105, 0.1); color: var(--st-ok); }
  .kp-warn-bg { background: rgba(255, 193, 7, 0.1); color: var(--st-warn); }
  .kp-danger-bg { background: rgba(229, 72, 42, 0.1); color: var(--st-accent); }

  .kp-unconstrained {
    margin: 0.25rem 0;
    padding: 0.3rem 0.4rem;
    background: rgba(229, 72, 42, 0.06);
    border-radius: 4px;
    border-left: 3px solid var(--st-accent);
  }
  .kp-dof-badge {
    font-weight: 600;
    color: var(--st-accent);
    font-size: 0.73rem;
  }
  .kp-dof-explanation {
    font-size: 0.7rem;
    color: var(--st-text-2);
    margin-top: 0.15rem;
    line-height: 1.4;
  }

  .kp-suggestions {
    margin: 0;
    padding: 0 0 0 1.1rem;
    list-style: '→ ';
  }
  .kp-suggestions li {
    margin: 0.2rem 0;
    line-height: 1.4;
    color: var(--st-text-2);
    font-size: 0.72rem;
  }

  .kp-footer {
    padding: 0.4rem 0.5rem;
    border-top: 1px solid var(--st-surface-3);
    margin-top: 0.3rem;
    text-align: center;
  }
  .kp-status {
    font-weight: 600;
    font-size: 0.76rem;
  }

  /* ── Per-element analysis sub-section ── */

  .kp-sub-toggle {
    width: 100%;
    background: rgba(30, 45, 70, 0.4);
    border: 1px dashed rgba(23, 41, 58, 0.5);
    border-radius: 4px;
    color: var(--st-text-2);
    font-size: 0.72rem;
    font-weight: 600;
    padding: 0.3rem 0.5rem;
    cursor: pointer;
    text-align: left;
    margin-top: 0.4rem;
    transition: background 0.15s;
  }
  .kp-sub-toggle:hover { background: rgba(23, 41, 58, 0.5); color: var(--st-text-2); }

  .kp-sub-section {
    padding: 0.2rem 0;
  }

  .kp-elem-card {
    margin: 0.2rem 0;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.15);
    border-left: 3px solid var(--st-hair-strong);
    overflow: hidden;
  }
  .kp-elem-ok { border-left-color: var(--st-ok); }
  .kp-elem-hyper { border-left-color: var(--st-info); }
  .kp-elem-mech { border-left-color: var(--st-accent); }

  .kp-elem-toggle {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: transparent;
    border: none;
    padding: 0.25rem 0.4rem;
    cursor: pointer;
    transition: background 0.12s;
  }
  .kp-elem-toggle:hover { background: rgba(255, 255, 255, 0.03); }
  .kp-elem-toggle-left {
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--st-text);
  }
  .kp-elem-type {
    font-weight: 400;
    color: var(--st-text-3);
  }

  .kp-elem-badge {
    font-size: 0.6rem;
    font-weight: 600;
    padding: 0.1rem 0.35rem;
    border-radius: 8px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    flex-shrink: 0;
  }
  .kp-elem-badge-ok { background: rgba(42, 168, 105, 0.15); color: var(--st-ok); }
  .kp-elem-badge-hyper { background: rgba(74, 143, 212, 0.15); color: var(--st-info); }
  .kp-elem-badge-mech { background: rgba(229, 72, 42, 0.15); color: var(--st-accent); }

  .kp-elem-body {
    padding: 0.15rem 0.4rem 0.3rem;
    border-top: 1px solid rgba(23, 41, 58, 0.3);
  }

  .kp-dof-line {
    display: flex;
    align-items: baseline;
    gap: 0.25rem;
    padding: 0.1rem 0.3rem;
    font-size: 0.70rem;
    line-height: 1.4;
    border-left: 2px solid var(--st-ok);
  }
  .kp-dof-free {
    border-left-color: var(--st-accent);
  }
  .kp-dof-label {
    font-weight: 700;
    font-family: 'Courier New', monospace;
    color: var(--st-text);
    min-width: 1.5rem;
    flex-shrink: 0;
  }
  .kp-dof-arrow {
    color: var(--st-text-3);
    flex-shrink: 0;
  }
  .kp-dof-none {
    color: var(--st-accent);
    font-style: italic;
  }
  .kp-dof-sources {
    color: var(--st-text-2);
  }
  .kp-elem-summary {
    font-size: 0.68rem;
    color: var(--st-text-3);
    font-style: italic;
    margin-top: 0.15rem;
    padding-top: 0.1rem;
    border-top: 1px solid rgba(23, 41, 58, 0.2);
  }

  @media (max-width: 640px) {
    .kp-panel {
      width: calc(100vw - 16px);
      left: 8px;
      bottom: 60px;
      max-height: 50vh;
    }
  }
</style>
