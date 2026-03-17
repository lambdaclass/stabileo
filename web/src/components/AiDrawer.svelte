<script lang="ts">
  import { resultsStore, modelStore, uiStore } from '../lib/store';
  import { t, i18n } from '../lib/i18n';
  import { reviewModel, buildArtifact, type ReviewModelResponse, type ReviewFinding } from '../lib/ai/client';

  type AiTab = 'review' | 'explain' | 'query' | 'build';
  let activeTab = $state<AiTab>('review');

  let loading = $state(false);
  let error = $state<string | null>(null);
  let response = $state<ReviewModelResponse | null>(null);
  let expandedFinding = $state<number | null>(null);

  const hasResults = $derived(
    uiStore.analysisMode === '3d'
      ? resultsStore.results3D !== null
      : resultsStore.results !== null
  );

  async function handleReview() {
    loading = true;
    error = null;

    try {
      const is3D = uiStore.analysisMode === '3d';
      const results = is3D ? resultsStore.results3D : resultsStore.results;
      if (!results) {
        error = t('ai.noResults');
        return;
      }

      const artifact = buildArtifact(
        results as any,
        modelStore.nodes.size,
        modelStore.elements.size,
      );

      response = await reviewModel(artifact, i18n.locale);
    } catch (e: any) {
      error = e.message || t('ai.unknownError');
    } finally {
      loading = false;
    }
  }

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
    {#if activeTab === 'review'}
      <!-- Review action -->
      {#if !response && !loading}
        <button
          class="action-btn"
          disabled={!hasResults}
          onclick={handleReview}
        >
          {t('ai.reviewModel')}
        </button>
        {#if !hasResults}
          <p class="hint">{t('ai.solveFirst')}</p>
        {/if}
      {:else if loading}
        <div class="loading-state">
          <span class="spinner"></span>
          <span class="loading-text">{t('ai.reviewing')}</span>
        </div>
      {/if}

      {#if error}
        <div class="error-box">{error}</div>
      {/if}

      {#if response}
        <div class="results">
          <!-- Risk + Regenerate row -->
          <div class="risk-row">
            <div class="risk-chip" style="background: {riskColor(response.riskLevel)}20; border-color: {riskColor(response.riskLevel)}">
              <span class="risk-dot" style="background: {riskColor(response.riskLevel)}"></span>
              <span class="risk-text" style="color: {riskColor(response.riskLevel)}">{response.riskLevel.toUpperCase()}</span>
            </div>
            <button class="regen-btn" onclick={handleReview} disabled={loading} title="Re-run review">↻</button>
          </div>

          <!-- Summary -->
          <p class="summary">{response.summary}</p>

          <!-- Findings -->
          {#if response.findings.length > 0}
            <div class="findings">
              <span class="section-label">{t('ai.findings') ?? 'Findings'} ({response.findings.length})</span>
              {#each response.findings as finding, i}
                <button
                  class="finding"
                  class:expanded={expandedFinding === i}
                  onclick={() => handleFindingClick(finding, i)}
                >
                  <div class="finding-header">
                    <span class="severity-badge" style="background: {severityColor(finding.severity)}">
                      {severityLabel(finding.severity)}
                    </span>
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

          <!-- Review Order -->
          {#if response.reviewOrder.length > 0}
            <div class="collapsible-section">
              <span class="section-label">{t('ai.reviewOrder')}</span>
              <ol>
                {#each response.reviewOrder as step}
                  <li>{step}</li>
                {/each}
              </ol>
            </div>
          {/if}

          <!-- Risky Assumptions -->
          {#if response.riskyAssumptions.length > 0}
            <div class="collapsible-section">
              <span class="section-label">{t('ai.riskyAssumptions')}</span>
              <ul>
                {#each response.riskyAssumptions as assumption}
                  <li>{assumption}</li>
                {/each}
              </ul>
            </div>
          {/if}

          <!-- Meta -->
          <div class="meta">
            {response.meta.modelUsed} · {response.meta.latencyMs}ms · {response.meta.inputTokens + response.meta.outputTokens} tok
          </div>
        </div>
      {/if}

    {:else if activeTab === 'explain'}
      <div class="placeholder">
        <span class="placeholder-icon">?</span>
        <p>Select a diagnostic or finding to get a detailed explanation.</p>
        <p class="hint">Coming soon</p>
      </div>

    {:else if activeTab === 'query'}
      <div class="placeholder">
        <span class="placeholder-icon">⌕</span>
        <p>Ask questions about your analysis results.</p>
        <p class="hint">Coming soon</p>
      </div>

    {:else if activeTab === 'build'}
      <div class="placeholder">
        <span class="placeholder-icon">+</span>
        <p>Describe a structure and let AI build it.</p>
        <p class="hint">Coming soon</p>
      </div>
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

  .close-btn:hover {
    color: #e94560;
  }

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

  .tab:hover {
    color: #aaa;
    background: rgba(255, 255, 255, 0.02);
  }

  .tab.active {
    color: #4ecdc4;
    border-bottom-color: #4ecdc4;
  }

  /* ─── Body ─── */
  .drawer-body {
    flex: 1;
    overflow-y: auto;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  /* ─── Action button (shown before results) ─── */
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
  }

  .action-btn:hover:not(:disabled) {
    background: #1a4a7a;
    color: white;
  }

  .action-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* ─── Loading ─── */
  .loading-state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 1rem 0;
    color: #888;
  }

  .loading-text {
    font-size: 0.78rem;
  }

  .spinner {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid #444;
    border-top-color: #4ecdc4;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

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

  /* ─── Results ─── */
  .results {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

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

  .regen-btn:hover:not(:disabled) {
    border-color: #4ecdc4;
    color: #4ecdc4;
  }

  .regen-btn:disabled {
    opacity: 0.4;
  }

  .summary {
    color: #bbb;
    font-size: 0.76rem;
    line-height: 1.5;
    margin: 0;
  }

  /* ─── Findings ─── */
  .section-label {
    color: #777;
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

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

  .finding:hover {
    border-color: #3a3a4a;
  }

  .finding.expanded {
    border-color: #4a4a5a;
  }

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

  .recommendation {
    color: #aaa !important;
    font-style: italic;
  }

  .finding-actions {
    display: flex;
    gap: 0.4rem;
    margin-top: 0.3rem;
  }

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

  .finding-action:hover {
    border-color: #4ecdc4;
    color: #4ecdc4;
  }

  .no-findings {
    color: #4caf50;
    font-size: 0.73rem;
    margin: 0;
  }

  /* ─── Collapsible sections ─── */
  .collapsible-section {
    font-size: 0.72rem;
  }

  .collapsible-section ol, .collapsible-section ul {
    margin: 0.2rem 0 0;
    padding-left: 1.1rem;
    color: #999;
    line-height: 1.5;
  }

  .meta {
    color: #444;
    font-size: 0.6rem;
    text-align: right;
    padding-top: 0.3rem;
    border-top: 1px solid #1a1a2e;
  }

  /* ─── Placeholder tabs ─── */
  .placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem 1rem;
    text-align: center;
    gap: 0.4rem;
  }

  .placeholder-icon {
    font-size: 1.5rem;
    color: #333;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    border: 2px solid #252535;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 0.3rem;
  }

  .placeholder p {
    color: #666;
    font-size: 0.75rem;
    margin: 0;
    line-height: 1.4;
  }
</style>
