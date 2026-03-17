<script lang="ts">
  import { resultsStore, modelStore, uiStore, historyStore } from '../lib/store';
  import { t, i18n } from '../lib/i18n';
  import {
    reviewModel, buildArtifact, buildResultSummary, explainDiagnostic, interpretResults, buildModel,
    type ReviewModelResponse, type ReviewFinding,
    type ExplainDiagnosticResponse,
    type InterpretResultsResponse,
    type BuildModelResponse,
  } from '../lib/ai/client';

  type AiTab = 'review' | 'explain' | 'query' | 'build';
  let activeTab = $state<AiTab>('review');

  // ─── Review state ──────────────────────────────────────────────
  let reviewLoading = $state(false);
  let reviewError = $state<string | null>(null);
  let reviewResponse = $state<ReviewModelResponse | null>(null);
  let expandedFinding = $state<number | null>(null);

  // ─── Explain state ─────────────────────────────────────────────
  let explainLoading = $state(false);
  let explainError = $state<string | null>(null);
  let explainResponse = $state<ExplainDiagnosticResponse | null>(null);
  let selectedDiagIndex = $state<number | null>(null);

  // ─── Query state ───────────────────────────────────────────────
  let queryLoading = $state(false);
  let queryError = $state<string | null>(null);
  let queryResponse = $state<InterpretResultsResponse | null>(null);
  let queryInput = $state('');

  // ─── Build state ───────────────────────────────────────────────
  let buildLoading = $state(false);
  let buildError = $state<string | null>(null);
  let buildResponse = $state<BuildModelResponse | null>(null);
  let buildInput = $state('');
  let buildImported = $state(false);
  let showBuildJson = $state(false);

  const hasResults = $derived(
    uiStore.analysisMode === '3d'
      ? resultsStore.results3D !== null
      : resultsStore.results !== null
  );

  const diagnostics = $derived(() => {
    const is3D = uiStore.analysisMode === '3d';
    return is3D ? resultsStore.solverDiagnostics3D : resultsStore.solverDiagnostics;
  });

  // ─── Review ────────────────────────────────────────────────────
  async function handleReview() {
    reviewLoading = true;
    reviewError = null;

    try {
      const is3D = uiStore.analysisMode === '3d';
      const results = is3D ? resultsStore.results3D : resultsStore.results;
      if (!results) {
        reviewError = t('ai.noResults');
        return;
      }

      const artifact = buildArtifact(results as any, modelStore.nodes.size, modelStore.elements.size);
      reviewResponse = await reviewModel(artifact, i18n.locale);
    } catch (e: any) {
      reviewError = e.message || t('ai.unknownError');
    } finally {
      reviewLoading = false;
    }
  }

  // ─── Explain ───────────────────────────────────────────────────
  async function handleExplain(index: number) {
    const diags = diagnostics();
    if (!diags[index]) return;

    selectedDiagIndex = index;
    explainLoading = true;
    explainError = null;
    explainResponse = null;

    try {
      const d = diags[index];
      explainResponse = await explainDiagnostic(
        d.code,
        d.severity,
        d.message,
        i18n.locale,
      );
    } catch (e: any) {
      explainError = e.message || t('ai.unknownError');
    } finally {
      explainLoading = false;
    }
  }

  // ─── Query ─────────────────────────────────────────────────────
  async function handleQuery() {
    const q = queryInput.trim();
    if (!q) return;

    queryLoading = true;
    queryError = null;
    queryResponse = null;

    try {
      const is3D = uiStore.analysisMode === '3d';
      const results = is3D ? resultsStore.results3D : resultsStore.results;
      if (!results) {
        queryError = t('ai.query.noResults');
        return;
      }

      const summary = buildResultSummary(results as any);
      queryResponse = await interpretResults(
        summary,
        q,
        i18n.locale,
        {
          nElements: modelStore.elements.size,
          nNodes: modelStore.nodes.size,
        },
      );
    } catch (e: any) {
      queryError = e.message || t('ai.unknownError');
    } finally {
      queryLoading = false;
    }
  }

  // ─── Build ─────────────────────────────────────────────────────
  async function handleBuild() {
    const desc = buildInput.trim();
    if (!desc) return;

    buildLoading = true;
    buildError = null;
    buildResponse = null;
    buildImported = false;
    showBuildJson = false;

    try {
      buildResponse = await buildModel(desc, i18n.locale);
    } catch (e: any) {
      buildError = e.message || t('ai.unknownError');
    } finally {
      buildLoading = false;
    }
  }

  function handleImport() {
    if (!buildResponse?.snapshot) return;
    historyStore.pushState();
    modelStore.restore(buildResponse.snapshot as any);
    resultsStore.clear();
    buildImported = true;
  }

  // ─── Helpers ───────────────────────────────────────────────────
  function severityColor(severity: string): string {
    switch (severity) {
      case 'error': return '#e94560';
      case 'warning': return '#f0a500';
      case 'info': return '#4fc3f7';
      default: return '#aaa';
    }
  }

  function severityLabel(severity: string): string {
    switch (severity) {
      case 'error': return 'ERR';
      case 'warning': return 'WARN';
      case 'info': return 'INFO';
      default: return severity.toUpperCase().slice(0, 4);
    }
  }

  function riskColor(risk: string): string {
    switch (risk) {
      case 'high': case 'critical': return '#e94560';
      case 'medium': return '#f0a500';
      case 'low': return '#4caf50';
      default: return '#aaa';
    }
  }

  function assessmentColor(a: string): string {
    switch (a) {
      case 'ok': return '#4caf50';
      case 'marginal': return '#f0a500';
      case 'excessive': return '#e94560';
      default: return '#aaa';
    }
  }

  function handleFindingClick(finding: ReviewFinding, index: number) {
    expandedFinding = expandedFinding === index ? null : index;
    if (finding.affectedIds.length > 0) {
      const nodeIds = new Set<number>();
      const elemIds = new Set<number>();
      for (const id of finding.affectedIds) {
        if (modelStore.nodes.has(id)) nodeIds.add(id);
        if (modelStore.elements.has(id)) elemIds.add(id);
      }
      uiStore.setSelection(nodeIds, elemIds);
    }
  }

  function close() {
    uiStore.aiDrawerOpen = false;
  }
</script>

<aside class="ai-drawer">
  <!-- Header -->
  <div class="drawer-header">
    <span class="drawer-title">△ Stabileo AI</span>
    <button class="close-btn" onclick={close} title="Close">×</button>
  </div>

  <!-- Tabs -->
  <div class="tab-bar">
    <button class="tab" class:active={activeTab === 'review'} onclick={() => activeTab = 'review'}>Review</button>
    <button class="tab" class:active={activeTab === 'explain'} onclick={() => activeTab = 'explain'}>Explain</button>
    <button class="tab" class:active={activeTab === 'query'} onclick={() => activeTab = 'query'}>Query</button>
    <button class="tab" class:active={activeTab === 'build'} onclick={() => activeTab = 'build'}>Build</button>
  </div>

  <!-- Body -->
  <div class="drawer-body">

    <!-- ═══ REVIEW TAB ═══ -->
    {#if activeTab === 'review'}
      {#if !reviewResponse && !reviewLoading}
        <button class="action-btn" disabled={!hasResults} onclick={handleReview}>
          {t('ai.reviewModel')}
        </button>
        {#if !hasResults}
          <p class="hint">{t('ai.solveFirst')}</p>
        {/if}
      {:else if reviewLoading}
        <div class="loading-state">
          <span class="spinner"></span>
          <span class="loading-text">{t('ai.reviewing')}</span>
        </div>
      {/if}

      {#if reviewError}
        <div class="error-box">{reviewError}</div>
      {/if}

      {#if reviewResponse}
        <div class="results">
          <div class="risk-row">
            <div class="risk-chip" style="background: {riskColor(reviewResponse.riskLevel)}20; border-color: {riskColor(reviewResponse.riskLevel)}">
              <span class="risk-dot" style="background: {riskColor(reviewResponse.riskLevel)}"></span>
              <span class="risk-text" style="color: {riskColor(reviewResponse.riskLevel)}">{reviewResponse.riskLevel.toUpperCase()}</span>
            </div>
            <button class="regen-btn" onclick={handleReview} disabled={reviewLoading} title="Re-run review">↻</button>
          </div>

          <p class="summary">{reviewResponse.summary}</p>

          {#if reviewResponse.findings.length > 0}
            <div class="findings">
              <span class="section-label">{t('ai.findings') ?? 'Findings'} ({reviewResponse.findings.length})</span>
              {#each reviewResponse.findings as finding, i}
                <button class="finding" class:expanded={expandedFinding === i} onclick={() => handleFindingClick(finding, i)}>
                  <div class="finding-header">
                    <span class="severity-badge" style="background: {severityColor(finding.severity)}">{severityLabel(finding.severity)}</span>
                    <span class="finding-title">{finding.title}</span>
                    <span class="finding-chevron">{expandedFinding === i ? '▾' : '▸'}</span>
                  </div>
                  {#if expandedFinding === i}
                    <div class="finding-body">
                      <p>{finding.explanation}</p>
                      {#if finding.recommendation}
                        <p class="recommendation">{finding.recommendation}</p>
                      {/if}
                      {#if finding.affectedIds.length > 0}
                        <div class="finding-actions">
                          <button class="finding-action" onclick={(e) => { e.stopPropagation(); handleFindingClick(finding, i); }}>
                            Zoom to issue
                          </button>
                        </div>
                      {/if}
                    </div>
                  {/if}
                </button>
              {/each}
            </div>
          {:else}
            <p class="no-findings">{t('ai.noFindings')}</p>
          {/if}

          {#if reviewResponse.reviewOrder.length > 0}
            <div class="collapsible-section">
              <span class="section-label">{t('ai.reviewOrder')}</span>
              <ol>{#each reviewResponse.reviewOrder as step}<li>{step}</li>{/each}</ol>
            </div>
          {/if}

          {#if reviewResponse.riskyAssumptions.length > 0}
            <div class="collapsible-section">
              <span class="section-label">{t('ai.riskyAssumptions')}</span>
              <ul>{#each reviewResponse.riskyAssumptions as assumption}<li>{assumption}</li>{/each}</ul>
            </div>
          {/if}

          <div class="meta">
            {reviewResponse.meta.modelUsed} · {reviewResponse.meta.latencyMs}ms · {reviewResponse.meta.inputTokens + reviewResponse.meta.outputTokens} tok
          </div>
        </div>
      {/if}

    <!-- ═══ EXPLAIN TAB ═══ -->
    {:else if activeTab === 'explain'}
      {@const diags = diagnostics()}
      {#if diags.length === 0}
        <p class="hint">{t('ai.explain.noDiagnostics')}</p>
      {:else}
        <p class="hint">{t('ai.explain.prompt')}</p>
        <div class="diag-list">
          {#each diags as d, i}
            <button
              class="diag-item"
              class:selected={selectedDiagIndex === i}
              onclick={() => handleExplain(i)}
            >
              <span class="severity-badge" style="background: {severityColor(d.severity)}">{severityLabel(d.severity)}</span>
              <span class="diag-code">{d.code}</span>
              <span class="diag-msg">{d.message}</span>
            </button>
          {/each}
        </div>
      {/if}

      {#if explainLoading}
        <div class="loading-state">
          <span class="spinner"></span>
          <span class="loading-text">{t('ai.explain.explaining')}</span>
        </div>
      {/if}

      {#if explainError}
        <div class="error-box">{explainError}</div>
      {/if}

      {#if explainResponse}
        <div class="results">
          <div class="trust-label">{t('ai.explain.advisory')}</div>
          <h4 class="explain-title">{explainResponse.title}</h4>
          <p class="summary">{explainResponse.explanation}</p>

          <div class="explain-section">
            <span class="section-label">{t('ai.explain.cause')}</span>
            <p class="explain-text">{explainResponse.cause}</p>
          </div>

          {#if explainResponse.fixSteps.length > 0}
            <div class="explain-section">
              <span class="section-label">{t('ai.explain.fixSteps')}</span>
              <ol class="fix-steps">{#each explainResponse.fixSteps as step}<li>{step}</li>{/each}</ol>
            </div>
          {/if}

          <div class="explain-section">
            <span class="section-label">{t('ai.explain.severityMeaning')}</span>
            <p class="explain-text">{explainResponse.severityMeaning}</p>
          </div>

          <div class="meta">
            {explainResponse.meta.modelUsed} · {explainResponse.meta.latencyMs}ms · {explainResponse.meta.inputTokens + explainResponse.meta.outputTokens} tok
          </div>
        </div>
      {/if}

    <!-- ═══ QUERY TAB ═══ -->
    {:else if activeTab === 'query'}
      {#if !hasResults}
        <p class="hint">{t('ai.query.noResults')}</p>
      {:else}
        <div class="input-row">
          <input
            type="text"
            class="query-input"
            placeholder={t('ai.query.placeholder')}
            bind:value={queryInput}
            onkeydown={(e) => { if (e.key === 'Enter' && !queryLoading) handleQuery(); }}
            disabled={queryLoading}
          />
          <button class="send-btn" onclick={handleQuery} disabled={queryLoading || !queryInput.trim()}>
            {queryLoading ? '…' : '→'}
          </button>
        </div>
      {/if}

      {#if queryLoading}
        <div class="loading-state">
          <span class="spinner"></span>
          <span class="loading-text">{t('ai.query.asking')}</span>
        </div>
      {/if}

      {#if queryError}
        <div class="error-box">{queryError}</div>
      {/if}

      {#if queryResponse}
        <div class="results">
          <div class="trust-label">{t('ai.query.advisory')}</div>
          <p class="summary">{queryResponse.answer}</p>

          <div class="assessment-row">
            <span class="section-label">{t('ai.query.assessment')}</span>
            <span class="assessment-badge" style="color: {assessmentColor(queryResponse.assessment)}">
              {queryResponse.assessment.toUpperCase()}
            </span>
          </div>

          {#if queryResponse.codeReferences.length > 0}
            <div class="collapsible-section">
              <span class="section-label">{t('ai.query.references')}</span>
              <ul>{#each queryResponse.codeReferences as ref}<li>{ref}</li>{/each}</ul>
            </div>
          {/if}

          {#if queryResponse.warnings.length > 0}
            <div class="collapsible-section warnings-section">
              <span class="section-label">{t('ai.query.warnings')}</span>
              <ul>{#each queryResponse.warnings as w}<li>{w}</li>{/each}</ul>
            </div>
          {/if}

          <div class="meta">
            {queryResponse.meta.modelUsed} · {queryResponse.meta.latencyMs}ms · {queryResponse.meta.inputTokens + queryResponse.meta.outputTokens} tok
          </div>
        </div>
      {/if}

    <!-- ═══ BUILD TAB ═══ -->
    {:else if activeTab === 'build'}
      <p class="hint">{t('ai.build.scopeNote')}</p>

      <div class="input-row">
        <textarea
          class="build-input"
          placeholder={t('ai.build.placeholder')}
          bind:value={buildInput}
          disabled={buildLoading}
          rows="3"
        ></textarea>
      </div>
      <button class="action-btn" onclick={handleBuild} disabled={buildLoading || !buildInput.trim()}>
        {#if buildLoading}
          <span class="spinner"></span> {t('ai.build.generating')}
        {:else}
          {t('ai.build.generate')}
        {/if}
      </button>

      {#if buildError}
        <div class="error-box">{buildError}</div>
      {/if}

      {#if buildResponse}
        <div class="results">
          <div class="trust-label">{t('ai.build.draft')}</div>

          <div class="explain-section">
            <span class="section-label">{t('ai.build.interpretation')}</span>
            <p class="explain-text">{buildResponse.interpretation}</p>
          </div>

          <button class="toggle-btn" onclick={() => showBuildJson = !showBuildJson}>
            {showBuildJson ? '▾' : '▸'} {t('ai.build.preview')}
          </button>
          {#if showBuildJson}
            <pre class="json-preview">{JSON.stringify(buildResponse.snapshot, null, 2)}</pre>
          {/if}

          {#if !buildImported}
            <div class="import-section">
              <p class="import-warning">{t('ai.build.importWarning')}</p>
              <button class="import-btn" onclick={handleImport}>
                {t('ai.build.import')}
              </button>
            </div>
          {:else}
            <div class="imported-notice">{t('ai.build.imported')}</div>
          {/if}

          <div class="meta">
            {buildResponse.meta.modelUsed} · {buildResponse.meta.latencyMs}ms · {buildResponse.meta.inputTokens + buildResponse.meta.outputTokens} tok
          </div>
        </div>
      {/if}
    {/if}
  </div>
</aside>

<style>
  .ai-drawer {
    width: 380px;
    height: 100%;
    background: #16213e;
    border-left: 1px solid #0f3460;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    flex-shrink: 0;
  }

  .drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid #0f3460;
    flex-shrink: 0;
  }

  .drawer-title {
    font-size: 0.75rem;
    font-weight: 600;
    color: #ccc;
    letter-spacing: 0.03em;
  }

  .close-btn {
    background: none;
    border: none;
    color: #666;
    font-size: 1.2rem;
    cursor: pointer;
    padding: 0 0.2rem;
    line-height: 1;
  }
  .close-btn:hover { color: #e94560; }

  /* ─── Tabs ─── */
  .tab-bar {
    display: flex;
    border-bottom: 1px solid #0f3460;
    flex-shrink: 0;
  }

  .tab {
    flex: 1;
    padding: 0.4rem 0;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: #666;
    font-size: 0.68rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    cursor: pointer;
    transition: all 0.15s;
  }
  .tab:hover { color: #aaa; background: rgba(255, 255, 255, 0.02); }
  .tab.active { color: #4ecdc4; border-bottom-color: #4ecdc4; }

  /* ─── Body ─── */
  .drawer-body {
    flex: 1;
    overflow-y: auto;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  /* ─── Shared ─── */
  .action-btn {
    width: 100%;
    padding: 0.55rem;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    color: #ccc;
    cursor: pointer;
    font-size: 0.78rem;
    font-weight: 600;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
  }
  .action-btn:hover:not(:disabled) { background: #1a4a7a; color: white; }
  .action-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .loading-state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 1rem 0;
    color: #888;
  }
  .loading-text { font-size: 0.78rem; }

  .spinner {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid #444;
    border-top-color: #4ecdc4;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .hint {
    color: #555;
    font-size: 0.73rem;
    font-style: italic;
    margin: 0;
  }

  .error-box {
    background: rgba(233, 69, 96, 0.12);
    border: 1px solid rgba(233, 69, 96, 0.4);
    border-radius: 4px;
    padding: 0.5rem 0.6rem;
    color: #e94560;
    font-size: 0.73rem;
    word-break: break-word;
  }

  .results {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .meta {
    color: #444;
    font-size: 0.6rem;
    text-align: right;
    padding-top: 0.3rem;
    border-top: 1px solid #1a1a2e;
  }

  .section-label {
    color: #777;
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .summary {
    color: #bbb;
    font-size: 0.76rem;
    line-height: 1.5;
    margin: 0;
  }

  .trust-label {
    color: #f0a500;
    font-size: 0.6rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0.2rem 0.4rem;
    border: 1px solid rgba(240, 165, 0, 0.3);
    border-radius: 3px;
    background: rgba(240, 165, 0, 0.08);
    align-self: flex-start;
  }

  /* ─── Review ─── */
  .risk-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .risk-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.25rem 0.6rem;
    border: 1px solid;
    border-radius: 12px;
  }

  .risk-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }

  .risk-text {
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.04em;
  }

  .regen-btn {
    background: none;
    border: 1px solid #333;
    color: #777;
    width: 28px;
    height: 28px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
  }
  .regen-btn:hover:not(:disabled) { border-color: #4ecdc4; color: #4ecdc4; }
  .regen-btn:disabled { opacity: 0.4; }

  .findings {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .finding {
    width: 100%;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid #252535;
    border-radius: 5px;
    padding: 0;
    cursor: pointer;
    text-align: left;
    color: #ccc;
    transition: border-color 0.15s;
  }
  .finding:hover { border-color: #3a3a4a; }
  .finding.expanded { border-color: #4a4a5a; }

  .finding-header {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.4rem 0.55rem;
  }

  .severity-badge {
    font-size: 0.55rem;
    font-weight: 700;
    letter-spacing: 0.03em;
    color: white;
    padding: 0.1rem 0.35rem;
    border-radius: 3px;
    flex-shrink: 0;
    line-height: 1.3;
  }

  .finding-title {
    flex: 1;
    font-size: 0.73rem;
    font-weight: 500;
  }

  .finding-chevron {
    color: #555;
    font-size: 0.65rem;
  }

  .finding-body {
    padding: 0.4rem 0.55rem 0.5rem;
    border-top: 1px solid #252535;
  }

  .finding-body p {
    margin: 0 0 0.3rem;
    font-size: 0.72rem;
    color: #999;
    line-height: 1.45;
  }

  .recommendation { color: #aaa !important; font-style: italic; }

  .finding-actions { display: flex; gap: 0.4rem; margin-top: 0.3rem; }

  .finding-action {
    background: none;
    border: 1px solid #333;
    color: #888;
    font-size: 0.65rem;
    padding: 0.2rem 0.45rem;
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .finding-action:hover { border-color: #4ecdc4; color: #4ecdc4; }

  .no-findings {
    color: #4caf50;
    font-size: 0.73rem;
    margin: 0;
  }

  .collapsible-section { font-size: 0.72rem; }
  .collapsible-section ol, .collapsible-section ul {
    margin: 0.2rem 0 0;
    padding-left: 1.1rem;
    color: #999;
    line-height: 1.5;
  }

  /* ─── Explain ─── */
  .diag-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .diag-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.5rem;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid #252535;
    border-radius: 4px;
    cursor: pointer;
    text-align: left;
    color: #ccc;
    transition: border-color 0.15s;
  }
  .diag-item:hover { border-color: #3a3a4a; }
  .diag-item.selected { border-color: #4ecdc4; background: rgba(78, 205, 196, 0.05); }

  .diag-code {
    font-size: 0.65rem;
    font-family: monospace;
    color: #888;
    flex-shrink: 0;
  }

  .diag-msg {
    font-size: 0.7rem;
    color: #999;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .explain-title {
    color: #ddd;
    font-size: 0.82rem;
    margin: 0;
    font-weight: 600;
  }

  .explain-section {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .explain-text {
    color: #999;
    font-size: 0.72rem;
    line-height: 1.45;
    margin: 0;
  }

  .fix-steps {
    margin: 0.15rem 0 0;
    padding-left: 1.1rem;
    color: #999;
    font-size: 0.72rem;
    line-height: 1.5;
  }

  /* ─── Query ─── */
  .input-row {
    display: flex;
    gap: 0.35rem;
  }

  .query-input {
    flex: 1;
    padding: 0.45rem 0.55rem;
    background: #0d1b3e;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    color: #ccc;
    font-size: 0.75rem;
    outline: none;
  }
  .query-input:focus { border-color: #4ecdc4; }
  .query-input:disabled { opacity: 0.5; }

  .send-btn {
    padding: 0.45rem 0.6rem;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    color: #ccc;
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 700;
    transition: all 0.15s;
  }
  .send-btn:hover:not(:disabled) { background: #1a4a7a; color: white; }
  .send-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .assessment-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .assessment-badge {
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.04em;
  }

  .warnings-section ul { color: #f0a500; }

  /* ─── Build ─── */
  .build-input {
    width: 100%;
    padding: 0.45rem 0.55rem;
    background: #0d1b3e;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    color: #ccc;
    font-size: 0.75rem;
    outline: none;
    resize: vertical;
    font-family: inherit;
  }
  .build-input:focus { border-color: #4ecdc4; }
  .build-input:disabled { opacity: 0.5; }

  .toggle-btn {
    background: none;
    border: 1px solid #333;
    color: #888;
    font-size: 0.68rem;
    padding: 0.25rem 0.5rem;
    border-radius: 3px;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s;
  }
  .toggle-btn:hover { border-color: #555; color: #aaa; }

  .json-preview {
    background: #0d1b3e;
    border: 1px solid #1a3a5a;
    border-radius: 4px;
    padding: 0.5rem;
    color: #888;
    font-size: 0.6rem;
    line-height: 1.4;
    max-height: 200px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-all;
    margin: 0;
  }

  .import-section {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.5rem;
    border: 1px solid rgba(233, 69, 96, 0.3);
    border-radius: 4px;
    background: rgba(233, 69, 96, 0.05);
  }

  .import-warning {
    color: #e94560;
    font-size: 0.68rem;
    margin: 0;
    line-height: 1.4;
  }

  .import-btn {
    padding: 0.4rem 0.6rem;
    background: #e94560;
    border: none;
    border-radius: 4px;
    color: white;
    font-size: 0.72rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }
  .import-btn:hover { background: #d63851; }

  .imported-notice {
    color: #4caf50;
    font-size: 0.72rem;
    padding: 0.4rem 0.5rem;
    border: 1px solid rgba(76, 175, 80, 0.3);
    border-radius: 4px;
    background: rgba(76, 175, 80, 0.08);
  }
</style>
