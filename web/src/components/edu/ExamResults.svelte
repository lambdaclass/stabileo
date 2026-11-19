<script lang="ts">
  import { t, tp } from '../../lib/i18n';
  import type { ExamSession } from './exam-session.svelte';
  import { gradeAttempt } from './exam-grading';
  import { explainAnswer } from './exam-explain';
  import { formatWhen } from './exam-time';
  import { handOffSteps } from './exam-steps-handoff';
  import { initSolver, isSolverReady } from '../../lib/engine/wasm-solver';

  interface Props { session: ExamSession; onleave: () => void }
  let { session, onleave }: Props = $props();

  let engineReady = $state(isSolverReady());
  $effect(() => { if (!engineReady) void initSolver().then(() => { engineReady = true; }); });

  const attempt = $derived(session.attempt);
  const grade = $derived(engineReady && attempt?.reveal_allowed && session.spec ? gradeAttempt(session.spec, attempt.seed, attempt.answers) : null);
  const pct = $derived(grade ? Math.round(grade.fraction * 100) : 0);

  $effect(() => {
    if (!attempt || attempt.reveal_allowed) return;
    const id = setInterval(() => void session.refresh(), 60_000);
    return () => clearInterval(id);
  });

  function stepByStep() {
    if (!grade) return;
    handOffSteps(grade.resolved.title, grade.resolved.model);
  }
</script>

<section class="results" data-testid="exam-results">
  <h2>{attempt?.title}</h2>
  {#if session.note === 'autoSubmitted'}<p class="note" role="status">{t('exam.autoSubmitted')}</p>{/if}
  {#if session.note === 'lateSubmit'}<p class="note" role="status">{t('exam.lateSubmit')}</p>{/if}
  {#if attempt?.submitted_at}<p class="note">{tp('exam.submittedAt', { when: formatWhen(attempt.submitted_at) })}</p>{/if}

  {#if !attempt?.reveal_allowed}
    <p data-testid="exam-results-later">{attempt?.closes_at ? tp('exam.resultsLater', { when: formatWhen(attempt.closes_at) }) : t('exam.resultsLaterNoDate')}</p>
    <button class="ghost" onclick={() => session.refresh()} disabled={session.busy}>{t('exam.refresh')}</button>
  {:else if !engineReady}
    <p role="status">{t('exam.loading')}</p>
  {:else if grade}
    <p class="score" data-testid="exam-score" data-correct={grade.correct} data-total={grade.total}>
      {tp('exam.score', { correct: grade.correct, total: grade.total, pct })}
    </p>
    <ol class="answers">
      {#each grade.answers as a (a.key)}
        <li class={a.outcome} data-testid="exam-answer" data-key={a.key} data-outcome={a.outcome}>
          <div class="q">{a.label}</div>
          <div class="pair">
            <span><span class="k">{t('exam.yours')}</span> {a.answer && !a.sketch ? a.answer : a.sketch ? t('exam.yourDrawing') : '—'}{#if a.unit && a.answer && !a.sketch}<span class="u">&nbsp;{a.unit}</span>{/if}</span>
            <span><span class="k">{t('exam.correct')}</span> {a.expected ?? '—'}{#if a.unit && a.expected}<span class="u">&nbsp;{a.unit}</span>{/if}</span>
            <span class="verdict">{a.outcome === 'correct' ? '✓ ' + t('edu.review.ok') : a.outcome === 'incorrect' ? '✗ ' + t('edu.review.bad') : '— ' + t('exam.notAnswered')}</span>
          </div>
          <p class="why">{explainAnswer(grade.resolved, a.key!)}</p>
        </li>
      {/each}
    </ol>
    <p class="note">{t('exam.gradedHere')}</p>
    <button class="ghost" onclick={stepByStep} data-testid="exam-steps">{t('exam.stepByStep')}</button>
  {:else}
    <p class="warn">{t('exam.cannotGrade')}</p>
  {/if}
  <button class="primary" onclick={onleave} data-testid="exam-leave">{t('exam.backToStabileo')}</button>
</section>

<style>
  .results { display: flex; flex-direction: column; gap: 10px; }
  h2 { font-size: 1.15rem; margin: 0; color: var(--st-text); }
  p { margin: 0; font-size: 0.85rem; line-height: 1.45; color: var(--st-text-2); }
  .note { font-size: 0.8rem; color: var(--st-text-3); }
  .warn { color: var(--st-warn); }
  .score { font-size: 1.05rem; font-weight: 700; color: var(--st-text); }
  .answers { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .answers li { border: 1px solid var(--st-hair); border-left-width: 3px; border-radius: var(--st-radius); padding: 8px 10px; background: var(--st-surface-2); }
  .answers li.correct { border-left-color: var(--st-ok); }
  .answers li.incorrect { border-left-color: var(--st-danger); }
  .answers li.pending { border-left-color: var(--st-text-3); }
  .q { font-size: 0.82rem; font-weight: 600; color: var(--st-text); }
  .pair { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 0.8rem; margin: 4px 0; color: var(--st-text-2); }
  .k { color: var(--st-text-3); }
  .u { color: var(--st-text-3); }
  .verdict { font-weight: 600; }
  li.correct .verdict { color: var(--st-ok); }
  li.incorrect .verdict { color: var(--st-danger); }
  .why { font-size: 0.78rem; color: var(--st-text-3); }
  .primary, .ghost { font-family: var(--st-sans); font-size: 0.8rem; padding: 6px 14px; border-radius: var(--st-radius); cursor: pointer; align-self: flex-start; }
  .primary { background: var(--st-accent-fill); border: 1px solid var(--st-accent-fill); color: #fff; font-weight: 600; }
  .ghost { background: none; border: 1px solid var(--st-hair-strong); color: var(--st-text-2); }
</style>
