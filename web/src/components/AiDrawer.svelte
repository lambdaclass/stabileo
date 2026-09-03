<script lang="ts">
  import { resultsStore, modelStore, uiStore, historyStore } from '../lib/store';
  import { t, i18n } from '../lib/i18n';
  import { reviewModel, buildArtifact, buildModel, buildModelContext, type ReviewModelResponse, type ReviewFinding, type BuildModelResponse, type ConversationMessage, type SolverDiagnosticMsg } from '../lib/ai/client';
  import { runGlobalSolve } from '../lib/engine/live-calc';
  import type { ModelSnapshot } from '../lib/store/history.svelte';
  import { compactSnapshotForAi, isValidReleaseShape, normalizeSnapshotReleases } from '../lib/ai/build-model';

  /**
   * `docked` — the body without its own chrome, for rendering inside a panel.
   *
   * The assistant used to be a 380 px container beside the app. It is a panel
   * destination now, so the heading, the ✕ and — on a phone — the sheet and its
   * drag all come from the panel. See `BasicPanel` and `ProPanel`.
   */
  let { docked = false }: { docked?: boolean } = $props();

  /**
   * The assistant is not usable yet, and every control says so from one place.
   *
   * A banner that announces "in development" above an input you can still type
   * into is a notice its own surface contradicts — the reader believes the box,
   * not the label. So this flag disables what would otherwise accept work, and
   * the banner explains what the disabling means. One constant, so the day it
   * ships there is one line to change and no control left behind still greyed.
   */
  const AI_IN_DEVELOPMENT = true;

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

  const is3DMode = $derived(uiStore.analysisMode === '3d' || uiStore.analysisMode === 'pro');
  const aiAnalysisMode = $derived(is3DMode ? '3d' : '2d');
  const hasResults = $derived(
    is3DMode
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
      // Typed end releases are optional (absent -> NO_RELEASE on apply), but
      // when present must have the { my, mz, t } boolean shape.
      const e = elem as unknown as { releaseI?: unknown; releaseJ?: unknown };
      if (!isValidReleaseShape(e.releaseI)) {
        errors.push(`Element ${id} has an invalid releaseI shape`);
      }
      if (!isValidReleaseShape(e.releaseJ)) {
        errors.push(`Element ${id} has an invalid releaseJ shape`);
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
      const mode = aiAnalysisMode;
      const ctx = hasModelOnCanvas ? buildModelContext(modelStore) : undefined;
      const currentSnap = hasModelOnCanvas ? compactSnapshotForAi($state.snapshot(modelStore.snapshot()) as Record<string, unknown>) : undefined;
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

      // Normalize typed end releases (drops any extra keys the AI slipped
      // into a well-shaped releaseI/releaseJ) before the draft touches the store.
      const normalizedSnap = normalizeSnapshotReleases(snap);

      // Push undo state and preview the draft on canvas immediately
      historyStore.pushState();
      fastRebuild(normalizedSnap as unknown as ModelSnapshot);
      pendingDraft = normalizedSnap;

      chatMessages.push({
        role: 'ai',
        text: resp.message,
        changeSummary: resp.changeSummary,
        rawAiResponse: resp.rawAiResponse,
        draft: normalizedSnap,
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
    const is3D = is3DMode;
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
      const mode = aiAnalysisMode;
      const ctx = hasModelOnCanvas ? buildModelContext(modelStore) : undefined;
      const currentSnap = hasModelOnCanvas ? compactSnapshotForAi($state.snapshot(modelStore.snapshot()) as Record<string, unknown>) : undefined;
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

      const normalizedSnap = normalizeSnapshotReleases(snap);

      historyStore.pushState();
      fastRebuild(normalizedSnap as unknown as ModelSnapshot);
      pendingDraft = normalizedSnap;
      lastSolverDiagnostics = [];

      chatMessages.push({
        role: 'ai',
        text: resp.message,
        changeSummary: resp.changeSummary,
        rawAiResponse: resp.rawAiResponse,
        draft: normalizedSnap,
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
    const snapshotIs3D = snapshotMode === '3d' || snapshotMode === 'pro';
    if (snapshotIs3D && !is3DMode) {
      uiStore.analysisMode = uiStore.appMode === 'pro' ? 'pro' : '3d';
    } else if (snapshotMode === '2d' && is3DMode) {
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
      const is3D = is3DMode;
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

  /*
   * Only the undocked form has its own ✕, and nothing renders that any more —
   * the panels provide it. Kept as the one place a standalone drawer would
   * close from, should the component ever be mounted on its own again.
   */
  function close() {
    uiStore.aiDrawerOpen = false;
  }
</script>

<!--
  `docked` — rendered inside a panel rather than as a container of its own.
  ───────────────────────────────────────────────────────────────────────
  The panel already draws a heading and a ✕, and on a phone it is the bottom
  sheet with its drag handle. Keeping our own would be a second title and a
  second close button four millimetres apart, which is what a standalone drawer
  needed and a docked body must not have. Same convention as `KinematicPanel`
  and `WhatIfPanel`.
-->
<svelte:element this={docked ? 'div' : 'aside'} class="ai-drawer" class:ai-docked={docked}>
  {#if !docked}
    <div class="drawer-header">
      <span class="drawer-title">Stabileo AI</span>
      <button class="close-btn" onclick={close} title="Close">×</button>
    </div>
  {/if}

  <!-- Tabs -->
  <div class="tab-bar">
    <button class="tab" class:active={activeTab === 'build'} onclick={() => activeTab = 'build'}>{t('ai.tabBuild')}</button>
    <button class="tab" class:active={activeTab === 'review'} onclick={() => activeTab = 'review'}>{t('ai.tabReview')}</button>
    <button class="tab" class:active={activeTab === 'explain'} onclick={() => activeTab = 'explain'}>{t('ai.tabExplain')}</button>
    <button class="tab" class:active={activeTab === 'query'} onclick={() => activeTab = 'query'}>{t('ai.tabQuery')}</button>
  </div>

  <!-- Body -->
  {#if activeTab === 'review'}
    <div class="drawer-body">
      {#if !reviewResponse && !reviewLoading}
        <button class="action-btn" disabled={AI_IN_DEVELOPMENT || !hasResults} onclick={handleReview}>
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
          <!--
            The empty state is the panel, most of the time.
            ──────────────────────────────────────────────
            Nothing has been asked yet and nothing can be, so this is what a
            reader actually sees — it is worth designing rather than filling.

            The examples are chips, not a stack of italic lines. A chip is the
            shape of something you can pick, which is the truthful shape here:
            they are the sentences this assistant is built to understand, and
            picking one will write it into the composer once there is an
            assistant to send it to. Until then they are inert, and `disabled`
            says so rather than a cursor discovering it.
          -->
          <div class="chat-empty">
            <span class="chat-empty-mark" aria-hidden="true">△</span>
            <p class="chat-empty-title">
              {hasModelOnCanvas ? t('ai.emptyChange') : t('ai.emptyBuild')}
            </p>
            <div class="chat-empty-chips">
              {#each (hasModelOnCanvas ? ['ai.exBay', 'ai.exStory', 'ai.exProfile', 'ai.exFrame3'] : ['ai.exBeam', 'ai.exPortal', 'ai.exBridge']) as k (k)}
                <button
                  class="chat-chip"
                  disabled={AI_IN_DEVELOPMENT}
                  onclick={() => (chatInput = t(k))}
                >{t(k)}</button>
              {/each}
            </div>
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
          placeholder={AI_IN_DEVELOPMENT ? t('ai.devPlaceholder') : (hasModelOnCanvas ? t('ai.describeChange') : t('ai.describeBuild'))}
          bind:value={chatInput}
          onkeydown={handleBuildKeydown}
          disabled={AI_IN_DEVELOPMENT || buildLoading || !!pendingDraft}
          rows="2"
        ></textarea>
        {#if buildLoading}
          <button class="chat-send stop-btn" onclick={handleAbortBuild} title="Stop">■</button>
        {:else}
          <button class="chat-send" onclick={() => handleBuildSend()} disabled={AI_IN_DEVELOPMENT || !chatInput.trim() || !!pendingDraft} data-testid="ai-send">→</button>
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

  <!--
    The in-development notice — quiet, and last.
    ───────────────────────────────────────────
    It sits at the foot of the panel in every tab, because the thing it
    qualifies is the panel, not one view of it.

    An earlier version was a `--st-warn` banner above the tabs. That read as a
    warning about the model — the colour the app uses for "your structure has a
    problem" — when it is a note about the feature. Demoted to a hairline rule
    and `--st-text-3`: present wherever you look, loud nowhere.

    The claim is not carried by this text alone. `AI_IN_DEVELOPMENT` also
    disables the composer and its send button, and the placeholder says why, so
    the first thing a reader tries is the thing that tells them. A notice the
    interface contradicts is worse than no notice.
  -->
  <p class="ai-dev-note" data-testid="ai-dev-note">
    <span class="ai-dev-mark" aria-hidden="true"></span>
    {t('ai.devNote')}
  </p>
</svelte:element>

<style>
  .ai-drawer {
    width: 380px;
    height: 100%;
    background: var(--st-surface);
    border-left: 1px solid var(--st-hair);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    flex-shrink: 0;
  }

  /* ── The in-development notice ──────────────────────────────────────
     A footnote, not a warning. It is the last thing in the panel, separated by
     a hairline instead of a filled box, and it borrows no semantic colour —
     `--st-warn` in this application means the structure has a problem, and
     spending it on "this feature is unfinished" makes both meanings weaker.
     ───────────────────────────────────────────────────────────────── */
  .ai-dev-note {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    margin: 0;
    padding: 7px 12px calc(7px + env(safe-area-inset-bottom, 0px));
    border-top: 1px solid var(--st-hair);
    color: var(--st-text-3);
    font-size: 0.65rem;
    line-height: 1.4;
  }
  /* A dot rather than an icon: at 5 px an icon is noise, and the sentence is
     the message. It only has to say "this line is a status, not body copy". */
  .ai-dev-mark {
    width: 5px;
    height: 5px;
    flex-shrink: 0;
    border-radius: 50%;
    background: var(--st-text-3);
  }

  /* Docked: the panel owns the box, so this contributes no chrome of its own. */
  .ai-drawer.ai-docked {
    width: auto;
    background: none;
    border-left: none;
    /*
       Takes the height the panel offers, when the panel is a column that has
       height to offer — which is the phone sheet, and PRO's desktop drawer.
       Where the parent is ordinary flow the `flex` shorthand is simply
       ignored and the drawer stays content-sized, as it was.

       This is what puts the footnote at the FOOT. Content-sized, it landed
       directly under the composer with the rest of the panel empty below it
       on desktop, and at y≈1017 on a 667 px phone — a note about the feature
       that you had to scroll past the feature to reach.
    */
    flex: 1 1 auto;
    min-height: 0;
  }
  /* Whatever room is left goes above the note, not below it. */
  .ai-drawer.ai-docked .ai-dev-note { margin-top: auto; }

  .drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--st-hair);
    flex-shrink: 0;
  }

  .drawer-title {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--st-text);
    letter-spacing: 0.03em;
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--st-text-3);
    font-size: 1.2rem;
    cursor: pointer;
    padding: 0 0.2rem;
    line-height: 1;
  }
  .close-btn:hover { color: var(--st-text-2); }

  /* ─── Tabs ───────────────────────────────────────────────────────────
     A segmented control, not the underlined row this panel used to carry.
     The four views are one exclusive choice, and a recessed track with a
     raised active segment says that in the shape itself — an underline only
     says it in colour. It is also the one piece of chrome here allowed to be
     more finished than the rest of the app: a real track, a lifted thumb.
     ─────────────────────────────────────────────────────────────────── */
  .tab-bar {
    display: flex;
    gap: 2px;
    flex-shrink: 0;
    margin: 8px 12px 4px;
    padding: 2px;
    border-radius: 7px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair);
  }

  .tab {
    flex: 1;
    padding: 0.34rem 0;
    background: none;
    border: none;
    border-radius: 5px;
    color: var(--st-text-3);
    font-size: 0.64rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }
  .tab:hover { color: var(--st-text-2); }
  .tab.active {
    color: var(--st-text);
    background: var(--st-surface-3);
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.28);
  }
  /* The lit segment is named by a rule under it rather than by tinting the
     whole chip — the tint would compete with the accent the body already
     spends on values. */
  .tab.active { box-shadow: 0 1px 2px rgb(0 0 0 / 0.28), inset 0 -2px 0 -1px var(--st-accent); }

  /* ─── Body ─── */
  .drawer-body {
    flex: 1;
    /*
       Required, not decorative. A flex item defaults to `min-height: auto`,
       which refuses to shrink below its content — so the body grew past the
       drawer's box, `overflow: hidden` clipped the tail, and on a 300 px PRO
       sheet the lower half of the panel became unreachable. With this the
       body scrolls inside the drawer and the footnote keeps its place at the
       bottom edge.
    */
    min-height: 0;
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
    background: var(--st-hair);
    border: 1px solid var(--st-surface-3);
    border-radius: 4px;
    color: var(--st-text);
    cursor: pointer;
    font-size: 0.78rem;
    font-weight: 600;
    transition: all 0.2s;
  }
  .action-btn:hover:not(:disabled) { background: var(--st-surface-3); color: white; }
  .action-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  /* ─── Loading ─── */
  .loading-state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 1rem 0;
    color: var(--st-text-3);
  }
  .loading-text { font-size: 0.78rem; }

  .spinner {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid var(--st-hair);
    border-top-color: var(--st-accent);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  .spinner-sm {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 2px solid var(--st-hair);
    border-top-color: var(--st-accent);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  .hint { color: var(--st-hair-strong); font-size: 0.73rem; font-style: italic; margin: 0; }

  .error-box {
    background: rgba(233, 69, 96, 0.12);
    border: 1px solid rgba(233, 69, 96, 0.4);
    border-radius: 4px;
    padding: 0.5rem 0.6rem;
    color: var(--st-text-2);
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
    border: 1px solid var(--st-hair);
    color: var(--st-text-3);
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
  .regen-btn:hover:not(:disabled) { border-color: var(--st-accent); color: var(--st-accent); }
  .regen-btn:disabled { opacity: 0.4; }

  .summary { color: var(--st-text-2); font-size: 0.76rem; line-height: 1.5; margin: 0; }

  /* ─── Findings ─── */
  .section-label { color: var(--st-text-3); font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }

  .findings { display: flex; flex-direction: column; gap: 0.35rem; }

  .finding {
    width: 100%;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--st-surface-2);
    border-radius: 5px;
    padding: 0;
    cursor: pointer;
    text-align: left;
    color: var(--st-text);
    transition: border-color 0.15s;
  }
  .finding:hover { border-color: var(--st-hair); }
  .finding.expanded { border-color: var(--st-hair-strong); }

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
  .finding-chevron { color: var(--st-hair-strong); font-size: 0.65rem; }

  .finding-body { padding: 0.4rem 0.55rem 0.5rem; border-top: 1px solid var(--st-surface-2); }
  .finding-body p { margin: 0 0 0.3rem; font-size: 0.72rem; color: var(--st-text-2); line-height: 1.45; }
  .recommendation { color: var(--st-text-2) !important; font-style: italic; }

  .finding-actions { display: flex; gap: 0.4rem; margin-top: 0.3rem; }
  .finding-action {
    background: none;
    border: 1px solid var(--st-hair);
    color: var(--st-text-3);
    font-size: 0.65rem;
    padding: 0.2rem 0.45rem;
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .finding-action:hover { border-color: var(--st-accent); color: var(--st-accent); }

  .no-findings { color: var(--st-ok); font-size: 0.73rem; margin: 0; }

  .collapsible-section { font-size: 0.72rem; }
  .collapsible-section ol, .collapsible-section ul { margin: 0.2rem 0 0; padding-left: 1.1rem; color: var(--st-text-2); line-height: 1.5; }

  .meta { color: var(--st-hair); font-size: 0.6rem; text-align: right; padding-top: 0.3rem; border-top: 1px solid var(--st-surface-2); }

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
    color: var(--st-hair);
    width: 48px;
    height: 48px;
    border-radius: 50%;
    border: 2px solid var(--st-surface-2);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 0.3rem;
  }
  .placeholder p { color: var(--st-text-3); font-size: 0.75rem; margin: 0; line-height: 1.4; }

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

  /* The brand mark, held well back — it identifies the surface without
     asking to be looked at, which is the whole job of an empty state. */
  .chat-empty-mark {
    font-size: 2rem;
    line-height: 1;
    color: var(--st-accent);
    opacity: 0.28;
    margin-bottom: 0.15rem;
  }

  .chat-empty-title {
    color: var(--st-text-2);
    font-size: 0.85rem;
    font-weight: 600;
    margin: 0 0 0.55rem;
  }

  .chat-empty-chips {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 5px;
    width: 100%;
    max-width: 260px;
  }

  /* Stated as things you could pick, and greyed because you cannot yet. The
     italic hint lines this replaces looked like an apology for the panel. */
  .chat-chip {
    padding: 0.4rem 0.6rem;
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius);
    background: var(--st-surface-2);
    color: var(--st-text-2);
    font-size: 0.7rem;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s;
  }
  .chat-chip:hover:not(:disabled) { border-color: var(--st-hair-strong); color: var(--st-text); }
  .chat-chip:disabled { opacity: 0.55; cursor: default; }

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
    background: var(--st-surface-3);
    color: var(--st-text);
    border-bottom-right-radius: 2px;
  }

  .chat-ai .chat-bubble {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--st-surface-2);
    color: var(--st-text-2);
    border-bottom-left-radius: 2px;
  }

  .chat-system .chat-bubble {
    background: rgba(78, 205, 196, 0.08);
    border: 1px solid rgba(78, 205, 196, 0.2);
    color: var(--st-accent);
    font-size: 0.68rem;
    padding: 0.3rem 0.5rem;
  }

  .chat-msg.building .chat-bubble {
    color: var(--st-text-3);
    font-style: italic;
  }

  .change-summary {
    font-size: 0.62rem;
    color: var(--st-accent);
    padding: 0 0.2rem;
    font-weight: 500;
  }

  .raw-response {
    font-size: 0.6rem;
    color: var(--st-text-3);
    padding: 0.15rem 0.2rem;
  }
  .raw-response summary {
    cursor: pointer;
    user-select: none;
  }
  .raw-response pre {
    margin: 0.25rem 0 0;
    padding: 0.4rem;
    background: var(--st-surface-2);
    border-radius: 4px;
    white-space: pre-wrap;
    word-break: break-all;
    font-size: 0.55rem;
    max-height: 200px;
    overflow-y: auto;
  }

  .chat-meta {
    color: var(--st-hair);
    font-size: 0.58rem;
    padding: 0 0.2rem;
  }

  /* ─── Draft actions (Apply / Retry / Cancel) ─── */
  .draft-actions {
    display: flex;
    gap: 0.4rem;
    padding: 0.45rem 0.75rem;
    border-top: 1px solid var(--st-hair);
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
    border-color: var(--st-accent);
    color: var(--st-accent);
  }
  .draft-apply:hover { background: rgba(78, 205, 196, 0.25); }

  .draft-retry {
    background: rgba(240, 165, 0, 0.1);
    border-color: var(--st-warn);
    color: var(--st-warn);
  }
  .draft-retry:hover { background: rgba(240, 165, 0, 0.2); }

  .draft-cancel {
    background: rgba(255, 255, 255, 0.03);
    border-color: var(--st-hair);
    color: var(--st-text-3);
  }
  .draft-cancel:hover { background: rgba(255, 255, 255, 0.06); color: var(--st-text-2); }

  /* ─── Post-build review ─── */
  .post-build-bar {
    display: flex;
    padding: 0.35rem 0.75rem;
    border-top: 1px solid var(--st-hair);
    flex-shrink: 0;
  }

  .post-build-btn {
    width: 100%;
    padding: 0.35rem 0;
    background: rgba(79, 195, 247, 0.08);
    border: 1px solid rgba(79, 195, 247, 0.3);
    border-radius: 5px;
    color: var(--st-info);
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
    color: var(--st-warn);
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
    border-top: 1px solid var(--st-hair);
    flex-shrink: 0;
    align-items: flex-end;
  }

  .chat-input {
    flex: 1;
    background: var(--st-hair);
    border: 1px solid var(--st-surface-3);
    border-radius: 6px;
    color: var(--st-text);
    font-size: 0.75rem;
    padding: 0.4rem 0.5rem;
    resize: none;
    line-height: 1.4;
    font-family: inherit;
  }
  .chat-input:focus {
    outline: none;
    border-color: var(--st-accent);
  }
  .chat-input::placeholder {
    color: var(--st-hair-strong);
  }
  .chat-input:disabled {
    opacity: 0.5;
  }

  .chat-send {
    width: 36px;
    height: 36px;
    background: var(--st-hair);
    border: 1px solid var(--st-surface-3);
    border-radius: 6px;
    color: var(--st-text);
    font-size: 1rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
    flex-shrink: 0;
  }
  .chat-send:hover:not(:disabled) {
    background: var(--st-surface-3);
    border-color: var(--st-accent);
    color: var(--st-accent);
  }
  .chat-send:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .stop-btn {
    background: rgba(233, 69, 96, 0.15);
    border-color: var(--st-text-2);
    color: var(--st-text-2);
    font-size: 0.7rem;
  }
  .stop-btn:hover {
    background: rgba(233, 69, 96, 0.3);
  }
</style>
