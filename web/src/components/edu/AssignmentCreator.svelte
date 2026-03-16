<script lang="ts">
  import { modelStore, uiStore, resultsStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import {
    generateAssignmentURL,
    hashNumericAnswer,
    hashChoiceAnswer,
    generateSalt,
    type AssignmentQuestion,
    type AssignmentDef,
  } from '../../lib/utils/assignment';
  import { validateAndSolve2D, validateAndSolve3D } from '../../lib/engine/solver-service';
  import type { AnalysisResults } from '../../lib/engine/types';

  let { onclose }: { onclose: () => void } = $props();

  // ─── Assignment config ──────────────────────────────────────────
  let title = $state('');
  let author = $state('');
  let timeLimit = $state(0);
  let maxAttempts = $state(1);
  let tolerance = $state(5); // percent
  let showAnswers = $state(true);

  // ─── Auto-detected questions ────────────────────────────────────
  interface QuestionDraft {
    enabled: boolean;
    type: AssignmentQuestion['type'];
    label: string;
    unit?: string;
    correctValue?: number;  // for numeric
    correctChoice?: string; // for choice
    points: number;
  }

  let questions = $state<QuestionDraft[]>([]);
  let solveError = $state<string | null>(null);
  let generatedUrl = $state<string | null>(null);
  let urlLength = $state(0);
  let copyFeedback = $state(false);

  // Solve model and auto-detect questions on mount
  function detectQuestions() {
    solveError = null;

    // Pre-check: need a model with geometry
    if (modelStore.nodes.size < 2 || modelStore.elements.size < 1) {
      solveError = t('lms.emptyModel');
      return;
    }
    if (modelStore.supports.size < 1) {
      solveError = t('lms.emptyModel');
      return;
    }

    // analysisMode may be 'edu' — treat as 2D unless explicitly 3D
    const is3D = uiStore.analysisMode === '3d';
    const modelData = {
      nodes: modelStore.nodes,
      elements: modelStore.elements,
      supports: modelStore.supports,
      loads: modelStore.loads,
      materials: modelStore.materials,
      sections: modelStore.sections,
      plates: modelStore.model.plates as any,
      quads: modelStore.model.quads as any,
    };

    let result: AnalysisResults | string | null;
    if (is3D) {
      result = validateAndSolve3D(modelData, false);
    } else {
      result = validateAndSolve2D(modelData, false);
    }

    if (result === null) {
      solveError = t('lms.emptyModel');
      return;
    }
    if (typeof result === 'string') {
      solveError = result;
      return;
    }

    const drafts: QuestionDraft[] = [];

    // Reaction questions
    const supports = Array.from(modelStore.supports.values());
    for (let i = 0; i < supports.length && i < result.reactions.length; i++) {
      const sup = supports[i];
      const r = result.reactions[i];
      const node = modelStore.nodes.get(sup.nodeId);
      const nodeLabel = node ? `N${sup.nodeId}` : `#${sup.nodeId}`;

      if (r.rx !== undefined && r.rx !== 0 || sup.type === 'fixed' || sup.type === 'pinned') {
        drafts.push({
          enabled: true, type: 'reaction',
          label: `${nodeLabel} — Rx`, unit: 'kN',
          correctValue: r.rx, points: 1,
        });
      }
      if (r.ry !== undefined) {
        drafts.push({
          enabled: true, type: 'reaction',
          label: `${nodeLabel} — Ry`, unit: 'kN',
          correctValue: r.ry, points: 1,
        });
      }
      if (r.mz !== undefined && r.mz !== 0) {
        drafts.push({
          enabled: true, type: 'reaction',
          label: `${nodeLabel} — Mz`, unit: 'kN·m',
          correctValue: r.mz, points: 1,
        });
      }
    }

    // Characteristic questions
    const forces = result.elementForces;
    if (forces.length > 0) {
      let mMax = 0, vMax = 0, nMax = 0;
      for (const f of forces) {
        mMax = Math.max(mMax, Math.abs(f.mStart), Math.abs(f.mEnd));
        vMax = Math.max(vMax, Math.abs(f.vStart), Math.abs(f.vEnd));
        nMax = Math.max(nMax, Math.abs(f.nStart), Math.abs(f.nEnd));
      }
      if (mMax > 1e-6) {
        drafts.push({
          enabled: true, type: 'characteristic',
          label: 'Mmax', unit: 'kN·m',
          correctValue: mMax, points: 1,
        });
      }
      if (vMax > 1e-6) {
        drafts.push({
          enabled: true, type: 'characteristic',
          label: 'Vmax', unit: 'kN',
          correctValue: vMax, points: 1,
        });
      }
      if (nMax > 1e-6) {
        drafts.push({
          enabled: false, type: 'characteristic',
          label: 'Nmax', unit: 'kN',
          correctValue: nMax, points: 1,
        });
      }
    }

    // Kinematic classification
    const nSupDofs = supports.reduce((sum, s) => {
      let d = 0;
      if (s.type === 'fixed') d = 3;
      else if (s.type === 'pinned') d = 2;
      else if (s.type?.startsWith('roller')) d = 1;
      return sum + d;
    }, 0);
    const nElements = modelStore.elements.size;
    const gi = 3 * nElements - nSupDofs; // simplified for 2D frames
    const classification = gi <= 0 ? 'isostatic' : 'hyperstatic';
    drafts.push({
      enabled: true, type: 'kinematic',
      label: t('lms.kinematicClass'),
      correctChoice: gi <= 0 ? 'isostatic' : `hyperstatic:${Math.abs(gi)}`,
      points: 1,
    });

    questions = drafts;
  }

  // Run detection on mount
  $effect(() => { detectQuestions(); });

  function handleGenerate() {
    generatedUrl = null;
    const salt = generateSalt();
    const tol = tolerance / 100;

    const assignmentQuestions: AssignmentQuestion[] = [];
    let qId = 1;
    for (const q of questions) {
      if (!q.enabled) continue;
      const aq: AssignmentQuestion = {
        id: qId++,
        type: q.type,
        label: q.label,
        unit: q.unit,
        points: q.points,
      };
      if (q.type === 'reaction' || q.type === 'characteristic') {
        if (q.correctValue !== undefined) {
          aq.answerHash = hashNumericAnswer(q.correctValue, tol, salt);
        }
      } else if (q.type === 'kinematic' || q.type === 'diagramShape') {
        if (q.correctChoice !== undefined) {
          aq.choiceHash = hashChoiceAnswer(q.correctChoice, salt);
        }
      }
      assignmentQuestions.push(aq);
    }

    if (assignmentQuestions.length === 0) {
      solveError = t('lms.noQuestions');
      return;
    }

    const snapshot = modelStore.snapshot();
    const mode = uiStore.analysisMode;

    const def: AssignmentDef = {
      version: 1,
      title: title || t('lms.untitled'),
      author: author || undefined,
      timeLimit,
      maxAttempts,
      model: snapshot,
      analysisMode: (mode === '2d' || mode === '3d') ? mode : '2d',
      questions: assignmentQuestions,
      tolerance: tol,
      salt,
      showAnswers,
    };

    const result = generateAssignmentURL(def);
    generatedUrl = result.url;
    urlLength = result.length;
  }

  async function copyUrl() {
    if (!generatedUrl) return;
    try {
      await navigator.clipboard.writeText(generatedUrl);
      copyFeedback = true;
      setTimeout(() => { copyFeedback = false; }, 1500);
    } catch {
      uiStore.toast(t('lms.copyError'), 'error');
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }

  const enabledCount = $derived(questions.filter(q => q.enabled).length);
  const totalPoints = $derived(questions.filter(q => q.enabled).reduce((s, q) => s + q.points, 0));
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="lms-overlay" onclick={onclose} role="presentation">
  <div class="lms-dialog" onclick={(e) => e.stopPropagation()} role="dialog">
    <div class="lms-header">
      <h2>{t('lms.creatorTitle')}</h2>
      <button class="close-btn" onclick={onclose}>{'\u2715'}</button>
    </div>

    {#if solveError && !questions.length}
      <div class="lms-error">{solveError}</div>
    {:else}
      <div class="lms-body">
        <!-- Metadata -->
        <div class="lms-section">
          <span class="lms-section-title">{t('lms.metadata')}</span>
          <div class="lms-form-grid">
            <label class="lms-field">
              <span>{t('lms.assignmentTitle')}</span>
              <input type="text" bind:value={title} placeholder={t('lms.titlePlaceholder')} />
            </label>
            <label class="lms-field">
              <span>{t('lms.author')}</span>
              <input type="text" bind:value={author} placeholder={t('lms.authorPlaceholder')} />
            </label>
            <label class="lms-field">
              <span>{t('lms.timeLimit')}</span>
              <div class="input-with-unit">
                <input type="number" bind:value={timeLimit} min="0" step="5" />
                <span class="unit">min</span>
              </div>
            </label>
            <label class="lms-field">
              <span>{t('lms.maxAttempts')}</span>
              <input type="number" bind:value={maxAttempts} min="0" step="1" />
            </label>
            <label class="lms-field">
              <span>{t('lms.tolerance')}</span>
              <div class="input-with-unit">
                <input type="number" bind:value={tolerance} min="1" max="20" step="1" />
                <span class="unit">%</span>
              </div>
            </label>
            <label class="lms-field lms-checkbox">
              <input type="checkbox" bind:checked={showAnswers} />
              <span>{t('lms.showAnswers')}</span>
            </label>
          </div>
        </div>

        <!-- Questions -->
        <div class="lms-section">
          <span class="lms-section-title">
            {t('lms.questions')} ({enabledCount} — {totalPoints} pts)
          </span>
          <div class="questions-list">
            {#each questions as q, i}
              <label class="question-row">
                <input type="checkbox" bind:checked={q.enabled} />
                <span class="q-label">{q.label}</span>
                {#if q.unit}
                  <span class="q-unit">[{q.unit}]</span>
                {/if}
                <span class="q-type">{q.type}</span>
                <input
                  type="number"
                  class="q-points"
                  bind:value={q.points}
                  min="1"
                  max="10"
                  title={t('lms.points')}
                />
                <span class="q-pts-label">pts</span>
              </label>
            {/each}
          </div>
        </div>

        <!-- Generate -->
        <div class="lms-actions">
          <button class="lms-btn primary" onclick={handleGenerate} disabled={enabledCount === 0}>
            {t('lms.generate')}
          </button>
        </div>

        {#if generatedUrl}
          <div class="lms-result">
            <div class="url-box">
              <textarea class="url-text" value={generatedUrl} readonly></textarea>
              <button class="copy-btn" onclick={copyUrl}>
                {copyFeedback ? t('lms.copied') : t('lms.copyUrl')}
              </button>
            </div>
            {#if urlLength > 2000}
              <p class="url-warning">{t('lms.longUrl').replace('{n}', String(urlLength))}</p>
            {/if}
            <p class="url-hint">{t('lms.embedHint')}</p>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .lms-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.6);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .lms-dialog {
    background: #1a1a2e;
    border: 1px solid #0f3460;
    border-radius: 8px;
    width: 90vw;
    max-width: 700px;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .lms-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: #16213e;
    border-bottom: 1px solid #0f3460;
    flex-shrink: 0;
  }
  .lms-header h2 {
    font-size: 0.9rem;
    color: #4ecdc4;
    margin: 0;
  }
  .close-btn {
    background: none;
    border: none;
    color: #888;
    cursor: pointer;
    font-size: 1rem;
    padding: 0.2rem;
  }
  .close-btn:hover { color: #e94560; }
  .lms-error {
    padding: 16px;
    color: #e94560;
    font-size: 0.8rem;
    text-align: center;
  }
  .lms-body {
    padding: 12px 14px;
    overflow-y: auto;
    flex: 1;
  }
  .lms-section {
    margin-bottom: 16px;
  }
  .lms-section-title {
    font-size: 0.72rem;
    font-weight: 600;
    color: #4ecdc4;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    display: block;
    margin-bottom: 8px;
  }
  .lms-form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .lms-field {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 0.72rem;
    color: #aaa;
  }
  .lms-field input[type="text"],
  .lms-field input[type="number"] {
    padding: 5px 8px;
    background: #0a1628;
    border: 1px solid #334;
    border-radius: 4px;
    color: #eee;
    font-size: 0.75rem;
  }
  .lms-field input:focus {
    outline: none;
    border-color: #4ecdc4;
  }
  .input-with-unit {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .input-with-unit input {
    flex: 1;
    padding: 5px 8px;
    background: #0a1628;
    border: 1px solid #334;
    border-radius: 4px;
    color: #eee;
    font-size: 0.75rem;
  }
  .input-with-unit input:focus {
    outline: none;
    border-color: #4ecdc4;
  }
  .unit {
    font-size: 0.65rem;
    color: #666;
  }
  .lms-checkbox {
    flex-direction: row !important;
    align-items: center;
    gap: 6px !important;
  }
  .lms-checkbox input[type="checkbox"] {
    margin: 0;
    accent-color: #4ecdc4;
  }
  .questions-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 250px;
    overflow-y: auto;
  }
  .question-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    background: #0f1a2e;
    border-radius: 4px;
    font-size: 0.72rem;
    cursor: pointer;
    transition: background 0.15s;
  }
  .question-row:hover {
    background: #1a2a44;
  }
  .question-row input[type="checkbox"] {
    margin: 0;
    accent-color: #4ecdc4;
  }
  .q-label {
    color: #ddd;
    flex: 1;
  }
  .q-unit {
    color: #666;
    font-size: 0.65rem;
  }
  .q-type {
    color: #555;
    font-size: 0.6rem;
    text-transform: uppercase;
    min-width: 70px;
    text-align: right;
  }
  .q-points {
    width: 40px;
    padding: 2px 4px;
    background: #0a1628;
    border: 1px solid #334;
    border-radius: 3px;
    color: #eee;
    font-size: 0.7rem;
    text-align: center;
  }
  .q-pts-label {
    font-size: 0.6rem;
    color: #666;
  }
  .lms-actions {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
  }
  .lms-btn {
    padding: 6px 16px;
    border: 1px solid #333;
    border-radius: 4px;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s;
  }
  .lms-btn.primary {
    background: #4ecdc4;
    color: #1a1a2e;
    border-color: #4ecdc4;
    font-weight: 600;
  }
  .lms-btn.primary:hover:not(:disabled) {
    background: #5eddd4;
  }
  .lms-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .lms-result {
    background: #0f1a2e;
    border: 1px solid #1a4a7a;
    border-radius: 6px;
    padding: 10px;
  }
  .url-box {
    display: flex;
    gap: 8px;
    align-items: stretch;
  }
  .url-text {
    flex: 1;
    background: #0a1628;
    color: #ccc;
    border: 1px solid #334;
    border-radius: 4px;
    padding: 8px;
    font-family: monospace;
    font-size: 0.6rem;
    resize: none;
    height: 60px;
    outline: none;
  }
  .copy-btn {
    padding: 4px 12px;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    color: #4ecdc4;
    font-size: 0.7rem;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s;
  }
  .copy-btn:hover {
    background: #1a4a7a;
  }
  .url-warning {
    font-size: 0.65rem;
    color: #f0a500;
    margin: 6px 0 0;
  }
  .url-hint {
    font-size: 0.65rem;
    color: #666;
    margin: 6px 0 0;
    line-height: 1.4;
  }
</style>
