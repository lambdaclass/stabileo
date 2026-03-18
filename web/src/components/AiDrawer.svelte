<script lang="ts">
  import { resultsStore, modelStore, uiStore, historyStore } from '../lib/store';
  import { t, i18n } from '../lib/i18n';
  import { reviewModel, buildArtifact, buildModel, buildModelContext, type ReviewModelResponse, type ReviewFinding, type BuildModelResponse, type ConversationMessage, type SolverDiagnosticMsg } from '../lib/ai/client';
  import { runGlobalSolve } from '../lib/engine/live-calc';
  import type { ModelSnapshot } from '../lib/store/history.svelte';

  type AiTab = 'review' | 'explain' | 'query' | 'build';
  let activeTab = $state<AiTab>('build');

  // ─── Internal limits ───
  const MAX_MESSAGE_LENGTH = 2000;
  const MAX_CHAT_HISTORY = 50;

  // ─── Review state ───
  let reviewLoading = $state(false);
  let reviewError = $state<string | null>(null);
  let reviewResponse = $state<ReviewModelResponse | null>(null);
  let expandedFinding = $state<number | null>(null);

  const hasResults = $derived(
    uiStore.analysisMode === '3d'
      ? resultsStore.results3D !== null
      : resultsStore.results !== null
  );

  // ─── Build state ───
  interface ChatMessage {
    role: 'user' | 'ai' | 'system';
    text: string;
    meta?: { modelUsed: string; latencyMs: number; tokens: number };
    isBuilding?: boolean;
    changeSummary?: string;
    rawAiResponse?: string;
    /** The draft snapshot pending Apply/Cancel. */
    draft?: Record<string, unknown>;
  }

  let chatMessages = $state<ChatMessage[]>([]);
  let chatInput = $state('');
  let buildLoading = $state(false);
  let buildError = $state<string | null>(null);
  let chatContainer = $state<HTMLDivElement>(undefined as any);
  /** Track the last user description so Retry can resend it. */
  let lastDescription = $state('');
  /** Whether a draft is pending Apply/Cancel. */
  let pendingDraft = $state<Record<string, unknown> | null>(null);
  /** Whether model was just applied and solved — enables "Review this model". */
  let justApplied = $state(false);
  /** AbortController for cancelling in-flight AI requests. */
  let abortController = $state<AbortController | null>(null);
  /** Multi-turn conversation history sent to the backend. */
  let conversationHistory = $state<ConversationMessage[]>([]);
  /** Solver diagnostics from the last solve, available for "Fix issues". */
  let lastSolverDiagnostics = $state<SolverDiagnosticMsg[]>([]);

  function scrollChatToBottom() {
    if (chatContainer) {
      setTimeout(() => chatContainer.scrollTop = chatContainer.scrollHeight, 50);
    }
  }

  // ─── Validation ───

  interface ValidationResult {
    valid: boolean;
    errors: string[];
  }

  function validateSnapshot(snapshot: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];
    const nodes = snapshot.nodes as Array<[number, { id: number; x: number; y: number; z?: number }]> | undefined;
    const elements = snapshot.elements as Array<[number, { id: number; nodeI: number; nodeJ: number }]> | undefined;
    const supports = snapshot.supports as Array<[number, { id: number; nodeId: number; type: string }]> | undefined;
    const materials = snapshot.materials as Array<[number, unknown]> | undefined;
    const sections = snapshot.sections as Array<[number, unknown]> | undefined;

    if (!nodes || !Array.isArray(nodes) || nodes.length < 2) {
      errors.push('Model must have at least 2 nodes');
    }
    if (!elements || !Array.isArray(elements) || elements.length < 1) {
      errors.push('Model must have at least 1 element');
    }
    if (!supports || !Array.isArray(supports) || supports.length < 1) {
      errors.push('Model must have at least 1 support');
    }
    if (!materials || !Array.isArray(materials) || materials.length < 1) {
      errors.push('Model must have at least 1 material');
    }
    if (!sections || !Array.isArray(sections) || sections.length < 1) {
      errors.push('Model must have at least 1 section');
    }

    // Early return if basic structure is missing
    if (errors.length > 0) return { valid: false, errors };

    // Node ID set for reference validation
    const nodeIds = new Set(nodes!.map(([id]) => id));
    const elementIds = new Set(elements!.map(([id]) => id));

    // Validate element node references
    for (const [id, elem] of elements!) {
      if (!nodeIds.has(elem.nodeI)) {
        errors.push(`Element ${id} references non-existent node ${elem.nodeI}`);
      }
      if (!nodeIds.has(elem.nodeJ)) {
        errors.push(`Element ${id} references non-existent node ${elem.nodeJ}`);
      }
    }

    // Validate support node references
    for (const [id, sup] of supports!) {
      if (!nodeIds.has(sup.nodeId)) {
        errors.push(`Support ${id} references non-existent node ${sup.nodeId}`);
      }
    }

    // Validate load references (handles both { type, data: { elementId } } and flat { type, elementId } formats)
    const loads = snapshot.loads as Array<Record<string, unknown>> | undefined;
    if (loads && Array.isArray(loads)) {
      for (const load of loads) {
        const d = (load.data as Record<string, unknown>) ?? load;
        if (d.elementId && !elementIds.has(d.elementId as number)) {
          errors.push(`Load references non-existent element ${d.elementId}`);
        }
        if (d.nodeId && !nodeIds.has(d.nodeId as number)) {
          errors.push(`Load references non-existent node ${d.nodeId}`);
        }
      }
    }

    // Validate coordinates are finite
    for (const [id, node] of nodes!) {
      if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) {
        errors.push(`Node ${id} has invalid coordinates`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // ─── Model context for edit actions ───

  const hasModelOnCanvas = $derived(modelStore.nodes.size > 0 && modelStore.elements.size > 0);

  // ─── Build handler ───

  async function handleBuildSend(descriptionOverride?: string) {
    const text = (descriptionOverride ?? chatInput).trim();
    if (!text || buildLoading) return;
    if (text.length > MAX_MESSAGE_LENGTH) {
      buildError = `Message too long (max ${MAX_MESSAGE_LENGTH} characters)`;
      return;
    }

    if (!descriptionOverride) chatInput = '';
    buildError = null;
    justApplied = false;
    pendingDraft = null;

    // Add user message (only if not a retry)
    if (!descriptionOverride) {
      chatMessages.push({ role: 'user', text });
      if (chatMessages.length > MAX_CHAT_HISTORY) chatMessages.shift();
    }
    lastDescription = text;
    scrollChatToBottom();

    // Handle clear/reset commands locally
    const lower = text.toLowerCase();
    if (/\b(clean|clear|reset|limpiar|borrar|vaciar)\b/.test(lower) && !/\b(beam|frame|truss|viga|pórtico|portico|cantilever)\b/.test(lower)) {
      historyStore.pushState();
      resultsStore.clear();
      modelStore.clear();
      chatMessages.push({ role: 'system', text: 'Model cleared.' });
      scrollChatToBottom();
      return;
    }

    // Add building indicator
    chatMessages.push({ role: 'ai', text: 'Building...', isBuilding: true });
    scrollChatToBottom();
    buildLoading = true;
    const ac = new AbortController();
    abortController = ac;

    try {
      const mode = uiStore.analysisMode === '3d' ? '3d' : '2d';
      const ctx = hasModelOnCanvas ? buildModelContext(modelStore) : undefined;
      const currentSnap = hasModelOnCanvas ? ($state.snapshot(modelStore.snapshot()) as Record<string, unknown>) : undefined;
      const resp = await buildModel(text, i18n.locale, mode, ctx, currentSnap, conversationHistory.length > 0 ? conversationHistory : undefined, undefined, ac.signal);

      // Remove building indicator
      chatMessages = chatMessages.filter(m => !m.isBuilding);

      // Track conversation history
      conversationHistory = [
        ...conversationHistory,
        { role: 'user', content: text },
        { role: 'assistant', content: resp.message || resp.rawAiResponse || '' },
      ];

      // Check if snapshot has actual structural content
      const snap = resp.snapshot;
      const hasStructure = snap
        && typeof snap === 'object'
        && Array.isArray(snap.nodes) && (snap.nodes as unknown[]).length > 0
        && Array.isArray(snap.elements) && (snap.elements as unknown[]).length > 0;

      // No structure in response — conversational reply or scope refusal
      if (resp.scopeRefusal || !hasStructure) {
        chatMessages.push({
          role: 'ai',
          text: resp.message || 'Try describing a structure to build.',
          rawAiResponse: resp.rawAiResponse,
          meta: {
            modelUsed: resp.meta.modelUsed,
            latencyMs: resp.meta.latencyMs,
            tokens: resp.meta.inputTokens + resp.meta.outputTokens,
          },
        });
        scrollChatToBottom();
        return;
      }

      // Validate the snapshot
      const validation = validateSnapshot(snap);
      if (!validation.valid) {
        chatMessages.push({
          role: 'ai',
          text: resp.message || 'The generated model has issues.',
        });
        chatMessages.push({
          role: 'system',
          text: `Validation failed:\n${validation.errors.join('\n')}`,
        });
        scrollChatToBottom();
        return;
      }

      // Push undo state and preview the draft on canvas immediately
      historyStore.pushState();
      fastRebuild(snap as unknown as ModelSnapshot);
      pendingDraft = snap;

      chatMessages.push({
        role: 'ai',
        text: resp.message,
        changeSummary: resp.changeSummary,
        rawAiResponse: resp.rawAiResponse,
        draft: snap,
        meta: {
          modelUsed: resp.meta.modelUsed,
          latencyMs: resp.meta.latencyMs,
          tokens: resp.meta.inputTokens + resp.meta.outputTokens,
        },
      });
      scrollChatToBottom();
    } catch (e: any) {
      chatMessages = chatMessages.filter(m => !m.isBuilding);
      if (e.name === 'AbortError') {
        chatMessages.push({ role: 'system', text: 'Request cancelled.' });
      } else {
        const msg = e.message || 'Failed to build model';
        const friendly = msg.includes('Could not generate')
          ? 'I can build: beams, cantilevers, continuous beams, portal frames, trusses, and 3D frames. Try describing a structure, e.g. "simply supported beam, 6m, 10 kN/m".'
          : msg;
        chatMessages.push({ role: 'ai', text: friendly });
      }
      scrollChatToBottom();
    } finally {
      buildLoading = false;
      abortController = null;
    }
  }

  // ─── Apply / Retry / Cancel ───

  async function handleApply() {
    if (!pendingDraft) return;

    // Model is already on canvas — just solve
    await runGlobalSolve();

    pendingDraft = null;
    justApplied = true;

    // Capture solver diagnostics for potential "Fix issues"
    const is3D = uiStore.analysisMode === '3d';
    const results = is3D ? resultsStore.results3D : resultsStore.results;
    const solverDiags = (results as any)?.solverDiagnostics ?? [];
    lastSolverDiagnostics = solverDiags
      .filter((d: any) => d.severity === 'error' || d.severity === 'warning')
      .map((d: any) => ({ code: d.code, severity: d.severity, message: d.message }));

    chatMessages.push({
      role: 'system',
      text: lastSolverDiagnostics.length > 0
        ? `Model applied and solved. ${lastSolverDiagnostics.length} issue(s) found.`
        : 'Model applied and solved.',
    });
    scrollChatToBottom();
  }

  function handleCancel() {
    // Revert to previous model via undo
    historyStore.undo();
    pendingDraft = null;
    chatMessages.push({
      role: 'system',
      text: 'Draft discarded.',
    });
    scrollChatToBottom();
  }

  function handleRetry() {
    // Revert and resend
    historyStore.undo();
    pendingDraft = null;
    if (lastDescription) {
      handleBuildSend(lastDescription);
    }
  }

  async function handleFixIssues() {
    if (lastSolverDiagnostics.length === 0 || buildLoading) return;
    buildLoading = true;
    buildError = null;
    justApplied = false;

    chatMessages.push({ role: 'user', text: 'Fix the solver issues' });
    chatMessages.push({ role: 'ai', text: 'Fixing...', isBuilding: true });
    scrollChatToBottom();

    try {
      const mode = uiStore.analysisMode === '3d' ? '3d' : '2d';
      const ctx = hasModelOnCanvas ? buildModelContext(modelStore) : undefined;
      const currentSnap = hasModelOnCanvas ? ($state.snapshot(modelStore.snapshot()) as Record<string, unknown>) : undefined;
      const resp = await buildModel(
        'Fix the solver issues in this model',
        i18n.locale,
        mode,
        ctx,
        currentSnap,
        conversationHistory.length > 0 ? conversationHistory : undefined,
        lastSolverDiagnostics,
      );

      chatMessages = chatMessages.filter(m => !m.isBuilding);

      // Track in conversation history
      conversationHistory = [
        ...conversationHistory,
        { role: 'user', content: 'Fix the solver issues' },
        { role: 'assistant', content: resp.message || resp.rawAiResponse || '' },
      ];

      const snap = resp.snapshot;
      const hasStructure = snap
        && typeof snap === 'object'
        && Array.isArray(snap.nodes) && (snap.nodes as unknown[]).length > 0
        && Array.isArray(snap.elements) && (snap.elements as unknown[]).length > 0;

      if (resp.scopeRefusal || !hasStructure) {
        chatMessages.push({
          role: 'ai',
          text: resp.message || 'Could not fix the issues automatically.',
          meta: resp.meta ? { modelUsed: resp.meta.modelUsed, latencyMs: resp.meta.latencyMs, tokens: resp.meta.inputTokens + resp.meta.outputTokens } : undefined,
        });
        scrollChatToBottom();
        return;
      }

      const validation = validateSnapshot(snap);
      if (!validation.valid) {
        chatMessages.push({ role: 'ai', text: resp.message || 'Fixed model has issues.' });
        chatMessages.push({ role: 'system', text: `Validation failed:\n${validation.errors.join('\n')}` });
        scrollChatToBottom();
        return;
      }

      historyStore.pushState();
      fastRebuild(snap as unknown as ModelSnapshot);
      pendingDraft = snap;
      lastSolverDiagnostics = [];

      chatMessages.push({
        role: 'ai',
        text: resp.message,
        changeSummary: resp.changeSummary,
        rawAiResponse: resp.rawAiResponse,
        draft: snap,
        meta: resp.meta ? { modelUsed: resp.meta.modelUsed, latencyMs: resp.meta.latencyMs, tokens: resp.meta.inputTokens + resp.meta.outputTokens } : undefined,
      });
      scrollChatToBottom();
    } catch (e: any) {
      chatMessages = chatMessages.filter(m => !m.isBuilding);
      chatMessages.push({ role: 'ai', text: e.message || 'Failed to fix issues' });
      scrollChatToBottom();
    } finally {
      buildLoading = false;
    }
  }

  // ─── Fast rebuild (no diff animation) ───

  function fastRebuild(snapshot: ModelSnapshot) {
    // Switch analysis mode if snapshot specifies it
    const snapshotMode = (snapshot as any).analysisMode;
    if (snapshotMode === '3d' && uiStore.analysisMode !== '3d') {
      uiStore.analysisMode = '3d';
    } else if (snapshotMode === '2d' && uiStore.analysisMode === '3d') {
      uiStore.analysisMode = '2d';
    }

    // Clear results and restore model atomically (preserves materialId/sectionId on elements)
    resultsStore.clear();
    modelStore.restore(snapshot);

    // Zoom to fit
    const canvas = document.querySelector('.viewport-container canvas') as HTMLCanvasElement | null;
    if (canvas && modelStore.nodes.size > 0) {
      uiStore.zoomToFit(modelStore.nodes.values(), canvas.width, canvas.height);
    }
  }

  // ─── One-click review after build ───

  async function handlePostBuildReview() {
    justApplied = false;
    activeTab = 'review';
    // Small delay so the tab switches visually before the review starts
    setTimeout(() => handleReview(), 100);
  }

  function handleAbortBuild() {
    if (abortController) {
      abortController.abort();
    }
  }

  function handleBuildKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleBuildSend();
    }
  }

  // ─── Review handlers ───
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
    <span class="drawer-title">Stabileo AI</span>
    <button class="close-btn" onclick={close} title="Close">×</button>
  </div>

  <!-- Tabs -->
  <div class="tab-bar">
    <button class="tab" class:active={activeTab === 'build'} onclick={() => activeTab = 'build'}>Build</button>
    <button class="tab" class:active={activeTab === 'review'} onclick={() => activeTab = 'review'}>Review</button>
    <button class="tab" class:active={activeTab === 'explain'} onclick={() => activeTab = 'explain'}>Explain</button>
    <button class="tab" class:active={activeTab === 'query'} onclick={() => activeTab = 'query'}>Query</button>
  </div>

  <!-- Body -->
  {#if activeTab === 'review'}
    <div class="drawer-body">
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
              <span class="section-label">Findings ({reviewResponse.findings.length})</span>
              {#each reviewResponse.findings as finding, i}
                <div class="finding" class:expanded={expandedFinding === i} role="button" tabindex="0" onclick={() => handleFindingClick(finding, i)} onkeydown={(e) => { if (e.key === 'Enter') handleFindingClick(finding, i); }}>
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
                          <button class="finding-action" onclick={(e) => { e.stopPropagation(); handleFindingClick(finding, i); }}>Zoom to issue</button>
                        </div>
                      {/if}
                    </div>
                  {/if}
                </div>
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
    </div>

  {:else if activeTab === 'build'}
    <div class="build-container">
      <!-- Chat messages -->
      <div class="chat-messages" bind:this={chatContainer}>
        {#if chatMessages.length === 0}
          <div class="chat-empty">
            {#if hasModelOnCanvas}
              <p class="chat-empty-title">Describe a structure or change</p>
              <p class="chat-empty-hint">Try: "add one bay on the right"</p>
              <p class="chat-empty-hint">Or: "add a story"</p>
              <p class="chat-empty-hint">Or: "change all beams to IPE 400"</p>
              <p class="chat-empty-hint">Or: "build a new 3-story frame"</p>
            {:else}
              <p class="chat-empty-title">Describe a structure</p>
              <p class="chat-empty-hint">Try: "simply supported beam, 6m, 10 kN/m"</p>
              <p class="chat-empty-hint">Or: "portal frame, 8m span, 5m height"</p>
              <p class="chat-empty-hint">Or: "build a bridge with two piers"</p>
            {/if}
          </div>
        {/if}
        {#each chatMessages as msg}
          <div class="chat-msg chat-{msg.role}" class:building={msg.isBuilding}>
            <div class="chat-bubble">
              {#if msg.isBuilding}
                <span class="spinner-sm"></span>
              {/if}
              <span class="chat-text">{msg.text}</span>
            </div>
            {#if msg.changeSummary}
              <div class="change-summary">{msg.changeSummary}</div>
            {/if}
            {#if msg.rawAiResponse}
              <details class="raw-response">
                <summary>LLM response</summary>
                <pre>{msg.rawAiResponse}</pre>
              </details>
            {/if}
            {#if msg.meta}
              <div class="chat-meta">{msg.meta.modelUsed} · {msg.meta.latencyMs}ms · {msg.meta.tokens} tok</div>
            {/if}
          </div>
        {/each}
        {#if buildError}
          <div class="error-box">{buildError}</div>
        {/if}
      </div>

      <!-- Apply / Retry / Cancel bar -->
      {#if pendingDraft}
        <div class="draft-actions">
          <button class="draft-btn draft-apply" onclick={handleApply}>Apply</button>
          <button class="draft-btn draft-retry" onclick={handleRetry}>Retry</button>
          <button class="draft-btn draft-cancel" onclick={handleCancel}>Cancel</button>
        </div>
      {/if}

      <!-- Fix solver issues -->
      {#if justApplied && lastSolverDiagnostics.length > 0 && !pendingDraft}
        <div class="post-build-bar">
          <button class="post-build-btn fix-issues-btn" onclick={handleFixIssues} disabled={buildLoading}>
            Fix {lastSolverDiagnostics.length} solver issue{lastSolverDiagnostics.length > 1 ? 's' : ''}
          </button>
        </div>
      {/if}

      <!-- Post-build review shortcut -->
      {#if justApplied && hasResults && lastSolverDiagnostics.length === 0}
        <div class="post-build-bar">
          <button class="post-build-btn" onclick={handlePostBuildReview}>Review this model</button>
        </div>
      {/if}

      <!-- Chat input -->
      <div class="chat-input-row">
        <textarea
          class="chat-input"
          placeholder={hasModelOnCanvas ? "Describe a change or new structure..." : "Describe what to build..."}
          bind:value={chatInput}
          onkeydown={handleBuildKeydown}
          disabled={buildLoading || !!pendingDraft}
          rows="2"
        ></textarea>
        {#if buildLoading}
          <button class="chat-send stop-btn" onclick={handleAbortBuild} title="Stop">■</button>
        {:else}
          <button class="chat-send" onclick={() => handleBuildSend()} disabled={!chatInput.trim() || !!pendingDraft}>→</button>
        {/if}
      </div>
    </div>

  {:else if activeTab === 'explain'}
    <div class="drawer-body">
      <div class="placeholder">
        <span class="placeholder-icon">?</span>
        <p>Select a diagnostic or finding to get a detailed explanation.</p>
        <p class="hint">Coming soon</p>
      </div>
    </div>

  {:else if activeTab === 'query'}
    <div class="drawer-body">
      <div class="placeholder">
        <span class="placeholder-icon">⌕</span>
        <p>Ask questions about your analysis results.</p>
        <p class="hint">Coming soon</p>
      </div>
    </div>
  {/if}
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

  /* ─── Action button ─── */
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
  .action-btn:hover:not(:disabled) { background: #1a4a7a; color: white; }
  .action-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  /* ─── Loading ─── */
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

  .spinner-sm {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 2px solid #444;
    border-top-color: #4ecdc4;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  .hint { color: #555; font-size: 0.73rem; font-style: italic; margin: 0; }

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
  .results { display: flex; flex-direction: column; gap: 0.6rem; }

  .risk-row { display: flex; align-items: center; justify-content: space-between; }

  .risk-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.25rem 0.6rem;
    border: 1px solid;
    border-radius: 12px;
  }
  .risk-dot { width: 7px; height: 7px; border-radius: 50%; }
  .risk-text { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.04em; }

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

  .summary { color: #bbb; font-size: 0.76rem; line-height: 1.5; margin: 0; }

  /* ─── Findings ─── */
  .section-label { color: #777; font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }

  .findings { display: flex; flex-direction: column; gap: 0.35rem; }

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

  .finding-header { display: flex; align-items: center; gap: 0.45rem; padding: 0.4rem 0.55rem; }

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
  .finding-title { flex: 1; font-size: 0.73rem; font-weight: 500; }
  .finding-chevron { color: #555; font-size: 0.65rem; }

  .finding-body { padding: 0.4rem 0.55rem 0.5rem; border-top: 1px solid #252535; }
  .finding-body p { margin: 0 0 0.3rem; font-size: 0.72rem; color: #999; line-height: 1.45; }
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

  .no-findings { color: #4caf50; font-size: 0.73rem; margin: 0; }

  .collapsible-section { font-size: 0.72rem; }
  .collapsible-section ol, .collapsible-section ul { margin: 0.2rem 0 0; padding-left: 1.1rem; color: #999; line-height: 1.5; }

  .meta { color: #444; font-size: 0.6rem; text-align: right; padding-top: 0.3rem; border-top: 1px solid #1a1a2e; }

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
  .placeholder p { color: #666; font-size: 0.75rem; margin: 0; line-height: 1.4; }

  /* ─── Build / Chat ─── */
  .build-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .chat-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    text-align: center;
    gap: 0.3rem;
    padding: 2rem 0;
  }

  .chat-empty-title {
    color: #888;
    font-size: 0.8rem;
    font-weight: 600;
    margin: 0;
  }

  .chat-empty-hint {
    color: #555;
    font-size: 0.7rem;
    margin: 0;
    font-style: italic;
  }

  .chat-msg {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .chat-user { align-items: flex-end; }
  .chat-ai { align-items: flex-start; }
  .chat-system { align-items: center; }

  .chat-bubble {
    max-width: 90%;
    padding: 0.4rem 0.6rem;
    border-radius: 6px;
    font-size: 0.73rem;
    line-height: 1.45;
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
  }

  .chat-text {
    white-space: pre-wrap;
    word-break: break-word;
  }

  .chat-user .chat-bubble {
    background: #1a4a7a;
    color: #ddd;
    border-bottom-right-radius: 2px;
  }

  .chat-ai .chat-bubble {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid #252535;
    color: #bbb;
    border-bottom-left-radius: 2px;
  }

  .chat-system .chat-bubble {
    background: rgba(78, 205, 196, 0.08);
    border: 1px solid rgba(78, 205, 196, 0.2);
    color: #4ecdc4;
    font-size: 0.68rem;
    padding: 0.3rem 0.5rem;
  }

  .chat-msg.building .chat-bubble {
    color: #888;
    font-style: italic;
  }

  .change-summary {
    font-size: 0.62rem;
    color: #4ecdc4;
    padding: 0 0.2rem;
    font-weight: 500;
  }

  .raw-response {
    font-size: 0.6rem;
    color: #888;
    padding: 0.15rem 0.2rem;
  }
  .raw-response summary {
    cursor: pointer;
    user-select: none;
  }
  .raw-response pre {
    margin: 0.25rem 0 0;
    padding: 0.4rem;
    background: #1a1a2e;
    border-radius: 4px;
    white-space: pre-wrap;
    word-break: break-all;
    font-size: 0.55rem;
    max-height: 200px;
    overflow-y: auto;
  }

  .chat-meta {
    color: #444;
    font-size: 0.58rem;
    padding: 0 0.2rem;
  }

  /* ─── Draft actions (Apply / Retry / Cancel) ─── */
  .draft-actions {
    display: flex;
    gap: 0.4rem;
    padding: 0.45rem 0.75rem;
    border-top: 1px solid #0f3460;
    flex-shrink: 0;
  }

  .draft-btn {
    flex: 1;
    padding: 0.4rem 0;
    border: 1px solid;
    border-radius: 5px;
    font-size: 0.72rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }

  .draft-apply {
    background: rgba(78, 205, 196, 0.15);
    border-color: #4ecdc4;
    color: #4ecdc4;
  }
  .draft-apply:hover { background: rgba(78, 205, 196, 0.25); }

  .draft-retry {
    background: rgba(240, 165, 0, 0.1);
    border-color: #f0a500;
    color: #f0a500;
  }
  .draft-retry:hover { background: rgba(240, 165, 0, 0.2); }

  .draft-cancel {
    background: rgba(255, 255, 255, 0.03);
    border-color: #444;
    color: #888;
  }
  .draft-cancel:hover { background: rgba(255, 255, 255, 0.06); color: #bbb; }

  /* ─── Post-build review ─── */
  .post-build-bar {
    display: flex;
    padding: 0.35rem 0.75rem;
    border-top: 1px solid #0f3460;
    flex-shrink: 0;
  }

  .post-build-btn {
    width: 100%;
    padding: 0.35rem 0;
    background: rgba(79, 195, 247, 0.08);
    border: 1px solid rgba(79, 195, 247, 0.3);
    border-radius: 5px;
    color: #4fc3f7;
    font-size: 0.7rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }
  .post-build-btn:hover {
    background: rgba(79, 195, 247, 0.15);
    border-color: rgba(79, 195, 247, 0.5);
  }
  .fix-issues-btn {
    background: rgba(240, 165, 0, 0.08);
    border-color: rgba(240, 165, 0, 0.3);
    color: #f0a500;
  }
  .fix-issues-btn:hover {
    background: rgba(240, 165, 0, 0.15);
    border-color: rgba(240, 165, 0, 0.5);
  }
  .fix-issues-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .chat-input-row {
    display: flex;
    gap: 0.4rem;
    padding: 0.5rem 0.75rem;
    border-top: 1px solid #0f3460;
    flex-shrink: 0;
    align-items: flex-end;
  }

  .chat-input {
    flex: 1;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 6px;
    color: #ddd;
    font-size: 0.75rem;
    padding: 0.4rem 0.5rem;
    resize: none;
    line-height: 1.4;
    font-family: inherit;
  }
  .chat-input:focus {
    outline: none;
    border-color: #4ecdc4;
  }
  .chat-input::placeholder {
    color: #555;
  }
  .chat-input:disabled {
    opacity: 0.5;
  }

  .chat-send {
    width: 36px;
    height: 36px;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 6px;
    color: #ccc;
    font-size: 1rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
    flex-shrink: 0;
  }
  .chat-send:hover:not(:disabled) {
    background: #1a4a7a;
    border-color: #4ecdc4;
    color: #4ecdc4;
  }
  .chat-send:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .stop-btn {
    background: rgba(233, 69, 96, 0.15);
    border-color: #e94560;
    color: #e94560;
    font-size: 0.7rem;
  }
  .stop-btn:hover {
    background: rgba(233, 69, 96, 0.3);
  }
</style>
