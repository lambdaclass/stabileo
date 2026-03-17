<script lang="ts">
  import { resultsStore, modelStore, uiStore } from '../lib/store';
  import { t, i18n } from '../lib/i18n';
  import { reviewModel, buildArtifact, type ReviewModelResponse, type ReviewFinding } from '../lib/ai/client';

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
    response = null;

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

  function riskColor(risk: string): string {
    switch (risk) {
      case 'high': return '#e94560';
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
  <div class="drawer-header">
    <span class="drawer-title">{t('ai.title')}</span>
    <button class="close-btn" onclick={close}>×</button>
  </div>

  <div class="drawer-body">
    <!-- Review tab -->
    <div class="tab-content">
      <button
        class="review-btn"
        disabled={!hasResults || loading}
        onclick={handleReview}
      >
        {#if loading}
          <span class="spinner"></span> {t('ai.reviewing')}
        {:else}
          {t('ai.reviewModel')}
        {/if}
      </button>

      {#if !hasResults}
        <p class="hint">{t('ai.solveFirst')}</p>
      {/if}

      {#if error}
        <div class="error-box">{error}</div>
      {/if}

      {#if response}
        <div class="results">
          <!-- Risk Level -->
          <div class="risk-badge" style="border-color: {riskColor(response.riskLevel)}">
            <span class="risk-label">{t('ai.risk')}</span>
            <span class="risk-value" style="color: {riskColor(response.riskLevel)}">
              {response.riskLevel.toUpperCase()}
            </span>
          </div>

          <!-- Summary -->
          <p class="summary">{response.summary}</p>

          <!-- Findings -->
          {#if response.findings.length > 0}
            <div class="findings">
              {#each response.findings as finding, i}
                <button
                  class="finding"
                  class:expanded={expandedFinding === i}
                  onclick={() => handleFindingClick(finding, i)}
                >
                  <div class="finding-header">
                    <span class="severity-dot" style="background: {severityColor(finding.severity)}"></span>
                    <span class="finding-title">{finding.title}</span>
                    <span class="finding-chevron">{expandedFinding === i ? '▾' : '▸'}</span>
                  </div>
                  {#if expandedFinding === i}
                    <div class="finding-body">
                      <p>{finding.explanation}</p>
                      {#if finding.recommendation}
                        <p class="recommendation"><strong>{t('ai.recommendation')}:</strong> {finding.recommendation}</p>
                      {/if}
                      {#if finding.affectedIds.length > 0}
                        <p class="affected">
                          {t('ai.affected')}: {finding.affectedIds.join(', ')}
                        </p>
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
            <div class="review-order">
              <span class="sub-label">{t('ai.reviewOrder')}</span>
              <ol>
                {#each response.reviewOrder as step}
                  <li>{step}</li>
                {/each}
              </ol>
            </div>
          {/if}

          <!-- Risky Assumptions -->
          {#if response.riskyAssumptions.length > 0}
            <div class="assumptions">
              <span class="sub-label">{t('ai.riskyAssumptions')}</span>
              <ul>
                {#each response.riskyAssumptions as assumption}
                  <li>{assumption}</li>
                {/each}
              </ul>
            </div>
          {/if}

          <!-- Meta -->
          <div class="meta">
            {response.meta.modelUsed} · {response.meta.latencyMs}ms · {response.meta.inputTokens + response.meta.outputTokens} tokens
          </div>
        </div>
      {/if}
    </div>
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
  }

  .drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.6rem 0.75rem;
    border-bottom: 1px solid #0f3460;
    flex-shrink: 0;
  }

  .drawer-title {
    font-size: 0.8rem;
    font-weight: 600;
    color: #ccc;
    text-transform: uppercase;
    letter-spacing: 0.05em;
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

  .drawer-body {
    flex: 1;
    overflow-y: auto;
    padding: 0.75rem;
  }

  .tab-content {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .review-btn {
    width: 100%;
    padding: 0.6rem;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    color: #ccc;
    cursor: pointer;
    font-size: 0.8rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
  }

  .review-btn:hover:not(:disabled) {
    background: #1a4a7a;
    color: white;
  }

  .review-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid #555;
    border-top-color: #ccc;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .hint {
    color: #666;
    font-size: 0.75rem;
    font-style: italic;
    margin: 0;
  }

  .error-box {
    background: rgba(233, 69, 96, 0.15);
    border: 1px solid #e94560;
    border-radius: 4px;
    padding: 0.5rem 0.6rem;
    color: #e94560;
    font-size: 0.75rem;
    word-break: break-word;
  }

  .results {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .risk-badge {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.6rem;
    border: 1px solid;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.03);
  }

  .risk-label {
    color: #888;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .risk-value {
    font-size: 0.8rem;
    font-weight: 700;
  }

  .summary {
    color: #bbb;
    font-size: 0.78rem;
    line-height: 1.45;
    margin: 0;
  }

  .findings {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .finding {
    width: 100%;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid #2a2a3a;
    border-radius: 4px;
    padding: 0;
    cursor: pointer;
    text-align: left;
    color: #ccc;
    transition: border-color 0.2s;
  }

  .finding:hover {
    border-color: #444;
  }

  .finding.expanded {
    border-color: #555;
  }

  .finding-header {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.45rem 0.6rem;
  }

  .severity-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .finding-title {
    flex: 1;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .finding-chevron {
    color: #666;
    font-size: 0.7rem;
  }

  .finding-body {
    padding: 0 0.6rem 0.5rem;
    border-top: 1px solid #2a2a3a;
  }

  .finding-body p {
    margin: 0.35rem 0 0;
    font-size: 0.73rem;
    color: #999;
    line-height: 1.4;
  }

  .recommendation {
    color: #aaa !important;
  }

  .affected {
    color: #777 !important;
    font-size: 0.7rem !important;
  }

  .no-findings {
    color: #4caf50;
    font-size: 0.75rem;
    margin: 0;
  }

  .review-order, .assumptions {
    font-size: 0.73rem;
  }

  .sub-label {
    color: #888;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .review-order ol, .assumptions ul {
    margin: 0.25rem 0 0;
    padding-left: 1.2rem;
    color: #999;
    line-height: 1.45;
  }

  .meta {
    color: #555;
    font-size: 0.65rem;
    text-align: right;
    padding-top: 0.3rem;
    border-top: 1px solid #1a1a2e;
  }
</style>
