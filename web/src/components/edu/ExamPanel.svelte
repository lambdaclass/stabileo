<script lang="ts">
  import { onMount } from 'svelte';
  import { examsApi } from '../../lib/api/assignments';
  import { authStore } from '../../lib/store/auth.svelte';
  import { accountGate } from '../../lib/store/account-gate.svelte';
  import { examLock } from '../../lib/store/exam-lock.svelte';
  import { modeToPath } from '../../lib/app-mode';
  import { t, tp } from '../../lib/i18n';
  import { createExamSession } from './exam-session.svelte';
  import { variantOf } from './exercise-variant';
  import { toExercise, type EduExercise } from './exercises';
  import { leaveExamExercise, showExamExercise } from './exercise-session';
  import { formatWhen } from './exam-time';
  import EduExerciseView from './EduExerciseView.svelte';
  import ExamCountdown from './ExamCountdown.svelte';
  import ExamResults from './ExamResults.svelte';

  interface Props { code: string }
  let { code }: Props = $props();

  const session = createExamSession({ api: examsApi, lock: examLock, auth: authStore });
  let confirmStart = $state(false);
  let confirmSubmit = $state(false);
  let exercise = $state.raw<EduExercise | null>(null);
  let shownFor = '';

  onMount(() => {
    examLock.enterRoom();
    void session.load(code);
    const onHide = () => { if (document.visibilityState === 'hidden') void session.flush(); };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      void session.flush();
      session.dispose();
    };
  });

  $effect(() => { examLock.title = session.exam?.title ?? session.attempt?.title ?? ''; });

  $effect(() => {
    const a = session.attempt;
    const spec = session.spec;
    if (!a || !spec || shownFor === a.id) return;
    shownFor = a.id;
    try {
      const ex = toExercise(variantOf(spec, a.seed));
      showExamExercise(ex);
      exercise = ex;
    } catch {
      exercise = null;
    }
  });

  function signIn() {
    accountGate.requireSignIn('exam', () => session.load(code));
  }

  function leave() {
    leaveExamExercise();
    examLock.leaveRoom();
    location.assign(modeToPath('basico'));
  }

  const answered = $derived(session.answers.filter((a) => a.answer.trim() !== '').length);

  const unavailableText = $derived.by(() => {
    switch (session.unavailable) {
      case 'disabled': return t('exam.unavailable.disabled');
      case 'notFound': return t('exam.unavailable.notFound');
      case 'upcoming': return t('exam.unavailable.upcoming');
      case 'closed': return t('exam.unavailable.closed');
      case 'signinOff': return t('exam.unavailable.signinOff');
      case 'badExercise': return t('exam.unavailable.badExercise');
      default: return t('exam.unavailable.error');
    }
  });

  async function submitNow() {
    confirmSubmit = false;
    await session.submit();
  }
</script>

<div class="exam" data-testid="exam-panel" data-phase={session.phase}>
  {#if session.phase === 'loading'}
    <p class="muted">{t('exam.loading')}</p>
  {:else if session.phase === 'signin'}
    <h2>{t('exam.signinTitle')}</h2>
    <p>{t('exam.signinLede')}</p>
    <button class="primary" onclick={signIn} data-testid="exam-signin">{t('exam.signin')}</button>
  {:else if session.phase === 'unavailable'}
    <h2>{t('exam.unavailable.title')}</h2>
    <p data-testid="exam-unavailable" data-reason={session.unavailable}>{unavailableText}</p>
    <button class="ghost" onclick={leave}>{t('exam.backToStabileo')}</button>
  {:else if session.phase === 'lobby' && session.exam}
    {@const exam = session.exam}
    <h2 data-testid="exam-title">{exam.title}</h2>
    <dl class="facts">
      {#if exam.owner_name}<dt>{t('exam.teacher')}</dt><dd data-testid="exam-owner">{exam.owner_name}</dd>{/if}
      <dt>{t('exam.duration')}</dt><dd>{tp('exam.minutes', { n: exam.duration_minutes })}</dd>
      <dt>{t('exam.opens')}</dt><dd>{formatWhen(exam.opens_at)}</dd>
      <dt>{t('exam.closes')}</dt><dd>{exam.closes_at ? formatWhen(exam.closes_at) : t('exam.noClose')}</dd>
    </dl>
    <p class="note">{exam.reveal === 'on_submit' ? t('exam.revealOnSubmit') : tp('exam.revealAfterClose', { when: formatWhen(exam.closes_at) })}</p>
    <p class="note" data-testid="exam-privacy">{t('exam.privacy')}</p>
    {#if exam.status === 'upcoming'}
      <p class="warn">{tp('exam.notYetOpen', { when: formatWhen(exam.opens_at) })}</p>
      <button class="ghost" onclick={() => session.load(code)}>{t('exam.refresh')}</button>
    {:else if confirmStart}
      <div class="confirm" role="alertdialog" aria-labelledby="exam-start-warn">
        <p id="exam-start-warn">{tp('exam.startWarning', { n: exam.duration_minutes })}</p>
        <div class="row">
          <button class="primary" onclick={() => { confirmStart = false; void session.start(); }} disabled={session.busy} data-testid="exam-start-confirm">{t('exam.startNow')}</button>
          <button class="ghost" onclick={() => (confirmStart = false)}>{t('exam.cancel')}</button>
        </div>
      </div>
    {:else}
      <button class="primary" onclick={() => (confirmStart = true)} data-testid="exam-start">{t('exam.start')}</button>
    {/if}
  {:else if session.phase === 'running'}
    <div class="bar">
      <ExamCountdown />
      <span class="save" data-testid="exam-save-state" data-state={session.saveState}>
        {#if session.saveState === 'saving'}{t('exam.saving')}{:else if session.saveState === 'saved'}{t('exam.saved')}{:else if session.saveState === 'failed'}{t('exam.saveFailed')}{:else if session.saveState === 'pending'}{t('exam.unsaved')}{/if}
      </span>
      <button class="primary" onclick={() => (confirmSubmit = true)} disabled={session.busy} data-testid="exam-submit">{t('exam.submit')}</button>
    </div>
    {#if session.note === 'submitFailed'}<p class="warn" role="alert">{t('exam.submitFailed')}</p>{/if}
    {#if confirmSubmit}
      <div class="confirm" role="alertdialog" aria-labelledby="exam-submit-warn">
        <p id="exam-submit-warn">{tp('exam.submitWarning', { answered, total: session.answers.length })}</p>
        <div class="row">
          <button class="primary" onclick={submitNow} disabled={session.busy} data-testid="exam-submit-confirm">{t('exam.submitNow')}</button>
          <button class="ghost" onclick={() => (confirmSubmit = false)}>{t('exam.keepAnswering')}</button>
        </div>
      </div>
    {/if}
    {#if exercise}
      {#key session.attempt?.id}
        <EduExerciseView {exercise} exam initialAnswers={session.answers} onanswers={(a) => session.update(a)} />
      {/key}
    {/if}
  {:else if session.phase === 'closed'}
    <ExamResults {session} onleave={leave} />
  {/if}
</div>

<style>
  .exam { padding: 16px 16px 24px; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; flex: 1; }
  h2 { font-size: 1.15rem; margin: 0; color: var(--st-text); }
  p { margin: 0; font-size: 0.85rem; line-height: 1.45; color: var(--st-text-2); }
  .muted { color: var(--st-text-3); }
  .note { font-size: 0.8rem; color: var(--st-text-3); }
  .warn { color: var(--st-warn); font-size: 0.82rem; }
  .facts { display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; margin: 0; font-size: 0.85rem; }
  .facts dt { color: var(--st-text-3); }
  .facts dd { margin: 0; color: var(--st-text); }
  .bar {
    position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 10px;
    padding: 8px 0; background: var(--st-surface-2); border-bottom: 1px solid var(--st-hair);
  }
  .save { flex: 1; font-size: 0.75rem; color: var(--st-text-3); }
  .confirm { border: 1px solid var(--st-warn); background: var(--st-warn-bg); border-radius: var(--st-radius); padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; }
  .primary, .ghost { font-family: var(--st-sans); font-size: 0.8rem; padding: 6px 14px; border-radius: var(--st-radius); cursor: pointer; }
  .primary { background: var(--st-accent-fill); border: 1px solid var(--st-accent-fill); color: #fff; font-weight: 600; align-self: flex-start; }
  .primary:hover:not(:disabled) { background: var(--st-accent-fill-hover); }
  .primary:disabled { opacity: 0.6; cursor: default; }
  .ghost { background: none; border: 1px solid var(--st-hair-strong); color: var(--st-text-2); align-self: flex-start; }
</style>
