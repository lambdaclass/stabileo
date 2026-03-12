<script lang="ts">
  import { modelStore, uiStore } from '../lib/store';
  import { generateKinematicReport, type KinematicReport } from '../lib/engine/kinematic-report';
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
    report = generateKinematicReport(input);
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
  <div class="kp-panel">
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
          <button class="kp-stale-btn" onclick={recompute}>
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
                  {t('kinematic.nodeDetail').replace('{id}', String(sup.nodeId)).replace('{type}', sup.type).replace('{dofs}', String(sup.dofs)).replace('{restrained}', sup.restrainedDofs)}
                </div>
              {/each}
            {:else}
              <div class="kp-detail kp-danger-text">{t('kinematic.noSupports')}</div>
            {/if}

            {#if report.hingeDetails.length > 0}
              <div class="kp-row" style="margin-top:0.2rem">
                <span class="kp-label"><strong>c</strong> {t('kinematic.internalConditions')}</span>
                <span class="kp-value">{report.totalC}</span>
              </div>
              {#each report.hingeDetails as hinge}
                <div class="kp-detail">
                  {t('kinematic.nodeHingeDetail').replace('{id}', String(hinge.nodeId)).replace('{explanation}', hinge.explanation)}
                </div>
              {/each}
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
                {t('kinematic.hiddenMechanism').replace('{n}', String(report.mechanismModes)).replace('{s}', report.mechanismModes > 1 ? 's' : '').replace('{degree}', String(report.degree))}
              </div>
              <div class="kp-explanation">
                {t('kinematic.hiddenMechanismExplanation')}
              </div>
            {:else}
              <div class="kp-result kp-danger-bg">
                {t('kinematic.mechanismDetected').replace('{n}', String(report.mechanismModes)).replace('{s}', report.mechanismModes > 1 ? 's' : '')}
              </div>
            {/if}

            {#if report.unconstrainedDofs.length > 0}
              <div class="kp-sub-title">{t('kinematic.freeMovements')}</div>
              {#each report.unconstrainedDofs as ud}
                <div class="kp-unconstrained">
                  <span class="kp-dof-badge">{t('kinematic.nodeDof').replace('{id}', String(ud.nodeId)).replace('{dofName}', ud.dofName)}</span>
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
                          {t('kinematic.bar').replace('{id}', String(ea.elemId))} <span class="kp-elem-type">({ea.type === 'frame' ? t('kinematic.rigid') : t('kinematic.truss')})</span>
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
  .kp-panel {
    position: absolute;
    bottom: 8px;
    left: 8px;
    width: 310px;
    max-height: calc(100% - 90px);
    background: #141e33;
    border: 1px solid #2a3a5a;
    border-radius: 8px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.5);
    z-index: 105;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-size: 0.78rem;
    color: #ccc;
  }

  .kp-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.45rem 0.6rem;
    background: #1a2744;
    border-bottom: 1px solid #2a3a5a;
    flex-shrink: 0;
  }

  .kp-title {
    font-size: 0.82rem;
    font-weight: 600;
    color: #e0e0e0;
  }

  .kp-header-actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .kp-quick-btn {
    width: 22px;
    height: 22px;
    border: 1px solid #2a3a5a;
    border-radius: 4px;
    background: transparent;
    color: #556;
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
    border-color: #4a6a9a;
    color: #aab;
    background: rgba(42, 58, 90, 0.3);
  }
  .kp-quick-active {
    background: rgba(76, 175, 80, 0.15);
    border-color: rgba(76, 175, 80, 0.4);
    color: #4caf50;
  }
  .kp-quick-active:hover {
    background: rgba(76, 175, 80, 0.25);
    border-color: rgba(76, 175, 80, 0.5);
    color: #5dce60;
  }

  .kp-close {
    background: transparent;
    border: none;
    color: #666;
    font-size: 1.1rem;
    cursor: pointer;
    padding: 0 0.15rem;
    line-height: 1;
    margin-left: 0.15rem;
  }
  .kp-close:hover { color: #e94560; }

  .kp-stale-btn {
    width: 100%;
    background: rgba(255, 193, 7, 0.08);
    border: 1px dashed rgba(255, 193, 7, 0.35);
    border-radius: 4px;
    color: #ffc107;
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
    color: #666;
    text-align: center;
    padding: 1rem;
    font-style: italic;
  }

  .kp-section-toggle {
    width: 100%;
    background: rgba(42, 58, 90, 0.3);
    border: none;
    border-radius: 4px;
    color: #b0bec5;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.35rem 0.5rem;
    cursor: pointer;
    text-align: left;
    margin-top: 0.25rem;
    transition: background 0.15s;
  }
  .kp-section-toggle:hover { background: rgba(42, 58, 90, 0.6); }

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
  .kp-label { color: #999; }
  .kp-value { color: #ddd; font-weight: 500; }

  .kp-sub-title {
    font-weight: 600;
    color: #b0bec5;
    margin-top: 0.35rem;
    margin-bottom: 0.15rem;
    font-size: 0.73rem;
  }

  .kp-detail {
    padding: 0.15rem 0 0.15rem 0.4rem;
    border-left: 2px solid #2a3a5a;
    margin: 0.1rem 0;
    line-height: 1.4;
    font-size: 0.72rem;
  }

  .kp-muted { color: #777; }
  .kp-danger-text { color: #e94560; }
  .kp-ok-text { color: #4caf50; }

  .kp-formula {
    font-family: 'Courier New', monospace;
    background: rgba(0,0,0,0.3);
    padding: 0.3rem 0.5rem;
    border-radius: 4px;
    text-align: center;
    color: #e0e0e0;
    font-size: 0.78rem;
    margin: 0.2rem 0;
  }
  .kp-formula-sub {
    font-size: 0.74rem;
    color: #aaa;
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
  .kp-ok { background: rgba(76, 175, 80, 0.15); color: #4caf50; border: 1px solid rgba(76, 175, 80, 0.4); }
  .kp-warn { background: rgba(255, 193, 7, 0.12); color: #ffc107; border: 1px solid rgba(255, 193, 7, 0.35); }
  .kp-danger { background: rgba(233, 69, 96, 0.15); color: #e94560; border: 1px solid rgba(233, 69, 96, 0.4); }

  .kp-explanation {
    font-size: 0.72rem;
    color: #999;
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
  .kp-ok-bg { background: rgba(76, 175, 80, 0.1); color: #4caf50; }
  .kp-warn-bg { background: rgba(255, 193, 7, 0.1); color: #ffc107; }
  .kp-danger-bg { background: rgba(233, 69, 96, 0.1); color: #e94560; }

  .kp-unconstrained {
    margin: 0.25rem 0;
    padding: 0.3rem 0.4rem;
    background: rgba(233, 69, 96, 0.06);
    border-radius: 4px;
    border-left: 3px solid #e94560;
  }
  .kp-dof-badge {
    font-weight: 600;
    color: #e94560;
    font-size: 0.73rem;
  }
  .kp-dof-explanation {
    font-size: 0.7rem;
    color: #aaa;
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
    color: #b0bec5;
    font-size: 0.72rem;
  }

  .kp-footer {
    padding: 0.4rem 0.5rem;
    border-top: 1px solid #2a3a5a;
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
    border: 1px dashed rgba(42, 58, 90, 0.5);
    border-radius: 4px;
    color: #8899aa;
    font-size: 0.72rem;
    font-weight: 600;
    padding: 0.3rem 0.5rem;
    cursor: pointer;
    text-align: left;
    margin-top: 0.4rem;
    transition: background 0.15s;
  }
  .kp-sub-toggle:hover { background: rgba(42, 58, 90, 0.5); color: #b0bec5; }

  .kp-sub-section {
    padding: 0.2rem 0;
  }

  .kp-elem-card {
    margin: 0.2rem 0;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.15);
    border-left: 3px solid #555;
    overflow: hidden;
  }
  .kp-elem-ok { border-left-color: #4caf50; }
  .kp-elem-hyper { border-left-color: #5c6bc0; }
  .kp-elem-mech { border-left-color: #e94560; }

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
    color: #ccc;
  }
  .kp-elem-type {
    font-weight: 400;
    color: #777;
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
  .kp-elem-badge-ok { background: rgba(76, 175, 80, 0.15); color: #4caf50; }
  .kp-elem-badge-hyper { background: rgba(92, 107, 192, 0.15); color: #7986cb; }
  .kp-elem-badge-mech { background: rgba(233, 69, 96, 0.15); color: #e94560; }

  .kp-elem-body {
    padding: 0.15rem 0.4rem 0.3rem;
    border-top: 1px solid rgba(42, 58, 90, 0.3);
  }

  .kp-dof-line {
    display: flex;
    align-items: baseline;
    gap: 0.25rem;
    padding: 0.1rem 0.3rem;
    font-size: 0.70rem;
    line-height: 1.4;
    border-left: 2px solid #4caf50;
  }
  .kp-dof-free {
    border-left-color: #e94560;
  }
  .kp-dof-label {
    font-weight: 700;
    font-family: 'Courier New', monospace;
    color: #ddd;
    min-width: 1.5rem;
    flex-shrink: 0;
  }
  .kp-dof-arrow {
    color: #666;
    flex-shrink: 0;
  }
  .kp-dof-none {
    color: #e94560;
    font-style: italic;
  }
  .kp-dof-sources {
    color: #aaa;
  }
  .kp-elem-summary {
    font-size: 0.68rem;
    color: #888;
    font-style: italic;
    margin-top: 0.15rem;
    padding-top: 0.1rem;
    border-top: 1px solid rgba(42, 58, 90, 0.2);
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
