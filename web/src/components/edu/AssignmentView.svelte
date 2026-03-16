<script lang="ts">
  import { t } from '../../lib/i18n';
  import { uiStore } from '../../lib/store';
  import {
    gradeAssignment,
    reportGradeToLMS,
    type AssignmentDef,
    type GradeResult,
  } from '../../lib/utils/assignment';

  let { assignment }: { assignment: AssignmentDef } = $props();

  // ─── State ──────────────────────────────────────────────────────
  let answers = $state(new Map<number, string>());
  let grade = $state<GradeResult | null>(null);
  let attempts = $state(0);
  let timerSeconds = $state(assignment.timeLimit * 60);
  let timerExpired = $state(false);
  let timerInterval = $state<ReturnType<typeof setInterval> | null>(null);
  let copyFeedback = $state(false);

  // Start timer if there's a time limit
  $effect(() => {
    if (assignment.timeLimit > 0 && !grade) {
      timerInterval = setInterval(() => {
        timerSeconds--;
        if (timerSeconds <= 0) {
          timerExpired = true;
          if (timerInterval) clearInterval(timerInterval);
          // Auto-submit when time runs out
          handleSubmit();
        }
      }, 1000);
      return () => {
        if (timerInterval) clearInterval(timerInterval);
      };
    }
  });

  const canSubmit = $derived(
    !grade &&
    !timerExpired &&
    (assignment.maxAttempts === 0 || attempts < assignment.maxAttempts)
  );

  const canRetry = $derived(
    grade !== null &&
    !timerExpired &&
    (assignment.maxAttempts === 0 || attempts < assignment.maxAttempts)
  );

  function handleSubmit() {
    const result = gradeAssignment(assignment, answers);
    grade = result;
    attempts++;

    // Report to LMS parent iframe
    reportGradeToLMS(result);

    // Stop timer
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function handleRetry() {
    grade = null;
    // Don't reset answers — let student improve
  }

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  async function copyGrade() {
    if (!grade) return;
    const text = [
      `${t('lms.assignment')}: ${grade.assignmentTitle}`,
      `${t('lms.score')}: ${grade.score}/${grade.total} (${grade.percent}%)`,
      `${t('lms.timestamp')}: ${new Date(grade.timestamp).toLocaleString()}`,
      '',
      ...grade.details.map(d =>
        `${d.correct ? '\u2713' : '\u2717'} ${d.label} (${d.points} pts)`
      ),
    ].join('\n');

    try {
      await navigator.clipboard.writeText(text);
      copyFeedback = true;
      setTimeout(() => { copyFeedback = false; }, 1500);
    } catch {
      uiStore.toast(t('lms.copyError'), 'error');
    }
  }

  // Kinematic question helpers
  type KinChoice = 'isostatic' | 'hyperstatic';
  let kinematicSelections = $state(new Map<number, KinChoice>());
  let hyperDegrees = $state(new Map<number, string>());

  function updateKinematicAnswer(qId: number) {
    const sel = kinematicSelections.get(qId);
    if (!sel) return;
    if (sel === 'isostatic') {
      answers.set(qId, 'isostatic');
    } else {
      const deg = hyperDegrees.get(qId) ?? '0';
      answers.set(qId, `hyperstatic:${deg}`);
    }
    answers = new Map(answers);
  }
</script>

<div class="assignment-panel">
  <!-- Header -->
  <div class="assignment-header">
    <h2>{assignment.title}</h2>
    <div class="header-meta">
      {#if assignment.author}
        <span class="meta-item">{assignment.author}</span>
      {/if}
      {#if assignment.timeLimit > 0}
        <span class="timer" class:timer-warning={timerSeconds < 60} class:timer-expired={timerExpired}>
          {timerExpired ? t('lms.timeUp') : formatTime(timerSeconds)}
        </span>
      {/if}
      {#if assignment.maxAttempts > 0}
        <span class="meta-item">
          {t('lms.attemptsLeft').replace('{n}', String(Math.max(0, assignment.maxAttempts - attempts)))}
        </span>
      {/if}
    </div>
  </div>

  <!-- Questions -->
  <div class="questions-panel">
    {#each assignment.questions as q}
      <div class="question-card" class:q-correct={grade?.details.find(d => d.questionId === q.id)?.correct} class:q-incorrect={grade && !grade.details.find(d => d.questionId === q.id)?.correct}>
        <div class="q-header">
          <span class="q-label">{q.label}</span>
          {#if q.unit}
            <span class="q-unit">[{q.unit}]</span>
          {/if}
          <span class="q-points">{q.points ?? 1} pts</span>
        </div>

        {#if q.type === 'reaction' || q.type === 'characteristic'}
          <div class="q-input-row">
            <input
              type="text"
              inputmode="decimal"
              placeholder="0.00"
              value={answers.get(q.id) ?? ''}
              oninput={(e) => {
                answers.set(q.id, (e.target as HTMLInputElement).value);
                answers = new Map(answers);
              }}
              disabled={!!grade}
            />
            {#if q.unit}
              <span class="q-input-unit">{q.unit}</span>
            {/if}
          </div>

        {:else if q.type === 'kinematic'}
          <div class="q-choice-row">
            <label class="radio-opt">
              <input
                type="radio"
                name={`kin-${q.id}`}
                value="isostatic"
                checked={kinematicSelections.get(q.id) === 'isostatic'}
                onchange={() => { kinematicSelections.set(q.id, 'isostatic'); kinematicSelections = new Map(kinematicSelections); updateKinematicAnswer(q.id); }}
                disabled={!!grade}
              />
              {t('lms.isostatic')}
            </label>
            <label class="radio-opt">
              <input
                type="radio"
                name={`kin-${q.id}`}
                value="hyperstatic"
                checked={kinematicSelections.get(q.id) === 'hyperstatic'}
                onchange={() => { kinematicSelections.set(q.id, 'hyperstatic'); kinematicSelections = new Map(kinematicSelections); updateKinematicAnswer(q.id); }}
                disabled={!!grade}
              />
              {t('lms.hyperstatic')}
            </label>
            {#if kinematicSelections.get(q.id) === 'hyperstatic'}
              <div class="degree-input">
                <span>{t('lms.degree')}:</span>
                <input
                  type="number"
                  min="1"
                  value={hyperDegrees.get(q.id) ?? ''}
                  oninput={(e) => { hyperDegrees.set(q.id, (e.target as HTMLInputElement).value); hyperDegrees = new Map(hyperDegrees); updateKinematicAnswer(q.id); }}
                  disabled={!!grade}
                />
              </div>
            {/if}
          </div>

        {:else if q.type === 'diagramShape'}
          <div class="q-choice-row">
            {#each ['zero', 'constant', 'linear', 'quadratic'] as shape}
              <label class="radio-opt">
                <input
                  type="radio"
                  name={`shape-${q.id}`}
                  value={shape}
                  checked={answers.get(q.id) === shape}
                  onchange={() => { answers.set(q.id, shape); answers = new Map(answers); }}
                  disabled={!!grade}
                />
                {t(`lms.shape.${shape}`)}
              </label>
            {/each}
          </div>
        {/if}

        <!-- Feedback after grading -->
        {#if grade}
          {@const detail = grade.details.find(d => d.questionId === q.id)}
          {#if detail}
            <div class="q-feedback" class:correct={detail.correct} class:incorrect={!detail.correct}>
              {detail.correct ? '\u2713 ' + t('lms.correct') : '\u2717 ' + t('lms.incorrect')}
            </div>
          {/if}
        {/if}
      </div>
    {/each}
  </div>

  <!-- Actions -->
  <div class="assignment-footer">
    {#if !grade}
      <button class="submit-btn" onclick={handleSubmit} disabled={!canSubmit}>
        {t('lms.submit')}
      </button>
    {:else}
      <div class="grade-display">
        <div class="grade-score">
          <span class="grade-number">{grade.percent}%</span>
          <span class="grade-detail">{grade.score}/{grade.total} pts</span>
        </div>
        <div class="grade-actions">
          {#if canRetry}
            <button class="retry-btn" onclick={handleRetry}>{t('lms.retry')}</button>
          {/if}
          <button class="copy-grade-btn" onclick={copyGrade}>
            {copyFeedback ? t('lms.copied') : t('lms.copyGrade')}
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .assignment-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #16213e;
    color: #ddd;
  }

  .assignment-header {
    padding: 12px 14px;
    background: #0a1a30;
    border-bottom: 1px solid #1a4a7a;
    flex-shrink: 0;
  }

  .assignment-header h2 {
    font-size: 0.9rem;
    color: #4ecdc4;
    margin: 0 0 6px;
  }

  .header-meta {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .meta-item {
    font-size: 0.68rem;
    color: #888;
  }

  .timer {
    font-size: 0.8rem;
    font-weight: 700;
    font-family: monospace;
    color: #4ecdc4;
    padding: 2px 8px;
    border: 1px solid #4ecdc4;
    border-radius: 4px;
  }

  .timer-warning {
    color: #f0a500;
    border-color: #f0a500;
    animation: pulse 1s infinite;
  }

  .timer-expired {
    color: #e94560;
    border-color: #e94560;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .questions-panel {
    flex: 1;
    overflow-y: auto;
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .question-card {
    background: #0f1a2e;
    border: 1px solid #1a3a5a;
    border-radius: 6px;
    padding: 10px 12px;
    transition: border-color 0.2s;
  }

  .question-card.q-correct {
    border-color: #4caf50;
  }

  .question-card.q-incorrect {
    border-color: #e94560;
  }

  .q-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .q-label {
    font-size: 0.78rem;
    font-weight: 600;
    color: #ddd;
    flex: 1;
  }

  .q-unit {
    font-size: 0.65rem;
    color: #666;
  }

  .q-points {
    font-size: 0.6rem;
    color: #4ecdc4;
    background: rgba(78, 205, 196, 0.1);
    padding: 1px 6px;
    border-radius: 8px;
  }

  .q-input-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .q-input-row input {
    width: 120px;
    padding: 5px 8px;
    background: #0a1628;
    border: 1px solid #334;
    border-radius: 4px;
    color: #eee;
    font-size: 0.78rem;
    font-family: monospace;
    text-align: right;
  }

  .q-input-row input:focus {
    outline: none;
    border-color: #4ecdc4;
  }

  .q-input-row input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .q-input-unit {
    font-size: 0.65rem;
    color: #666;
  }

  .q-choice-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }

  .radio-opt {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.72rem;
    color: #bbb;
    cursor: pointer;
    padding: 3px 8px;
    border-radius: 4px;
    border: 1px solid transparent;
    transition: all 0.15s;
  }

  .radio-opt:hover {
    background: rgba(78, 205, 196, 0.08);
  }

  .radio-opt input[type="radio"] {
    accent-color: #4ecdc4;
    margin: 0;
  }

  .degree-input {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.72rem;
    color: #aaa;
  }

  .degree-input input {
    width: 45px;
    padding: 3px 6px;
    background: #0a1628;
    border: 1px solid #334;
    border-radius: 4px;
    color: #eee;
    font-size: 0.75rem;
    text-align: center;
  }

  .degree-input input:focus {
    outline: none;
    border-color: #4ecdc4;
  }

  .q-feedback {
    margin-top: 6px;
    font-size: 0.7rem;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 3px;
  }

  .q-feedback.correct {
    color: #4caf50;
    background: rgba(76, 175, 80, 0.1);
  }

  .q-feedback.incorrect {
    color: #e94560;
    background: rgba(233, 69, 96, 0.1);
  }

  .assignment-footer {
    padding: 10px 14px;
    border-top: 1px solid #1a4a7a;
    background: #0a1a30;
    flex-shrink: 0;
  }

  .submit-btn {
    width: 100%;
    padding: 8px 16px;
    background: #4ecdc4;
    color: #1a1a2e;
    border: none;
    border-radius: 6px;
    font-size: 0.82rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s;
  }

  .submit-btn:hover:not(:disabled) {
    background: #5eddd4;
  }

  .submit-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .grade-display {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .grade-score {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .grade-number {
    font-size: 1.5rem;
    font-weight: 800;
    color: #4ecdc4;
  }

  .grade-detail {
    font-size: 0.75rem;
    color: #888;
  }

  .grade-actions {
    display: flex;
    gap: 8px;
  }

  .retry-btn, .copy-grade-btn {
    padding: 5px 12px;
    border: 1px solid #333;
    border-radius: 4px;
    font-size: 0.72rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .retry-btn {
    background: transparent;
    color: #4ecdc4;
    border-color: #4ecdc4;
  }

  .retry-btn:hover {
    background: rgba(78, 205, 196, 0.1);
  }

  .copy-grade-btn {
    background: #0f3460;
    color: #ccc;
    border-color: #1a4a7a;
  }

  .copy-grade-btn:hover {
    background: #1a4a7a;
    color: white;
  }
</style>
