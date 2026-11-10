<script lang="ts">
  import { assignmentsApi, type Assignment, type OwnerAttempt } from '../../lib/api/assignments';
  import { errorText } from '../../lib/api/error-text';
  import { slugifyTabName } from '../../lib/app-mode';
  import { saveFile } from '../../lib/export/save-file';
  import { EXAM_GRACE_MS } from '../../lib/store/exam-lock.svelte';
  import { t, tp } from '../../lib/i18n';
  import type { EduExerciseSpec } from './exercise-spec';
  import { exerciseFromEnvelope, gradeAttempt, gradesCsv, type Grade } from './exam-grading';
  import { formatWhen } from './exam-time';
  import { initSolver } from '../../lib/engine/wasm-solver';
  import SubmissionReview from './SubmissionReview.svelte';

  interface Props { assignment: Assignment }
  let { assignment }: Props = $props();

  interface Row { attempt: OwnerAttempt; grade: Grade | null; status: 'submitted' | 'closed' | 'open' }

  let spec = $state.raw<EduExerciseSpec | null>(null);
  let rows = $state.raw<Row[]>([]);
  let loading = $state(true);
  let error = $state('');
  let opened = $state<string | null>(null);

  const statusOf = (a: OwnerAttempt): Row['status'] =>
    a.submitted_at ? 'submitted' : Date.now() > Date.parse(a.deadline_at) + EXAM_GRACE_MS ? 'closed' : 'open';
  const statusText = (s: Row['status']) =>
    s === 'submitted' ? t('exam.attempt.submitted') : s === 'closed' ? t('exam.attempt.closed') : t('exam.attempt.open');

  async function load() {
    loading = true;
    error = '';
    try {
      const full = await assignmentsApi.get(assignment.id);
      spec = exerciseFromEnvelope(full.exercise);
      const all: OwnerAttempt[] = [];
      for (let offset = 0; ; offset += 100) {
        const page = await assignmentsApi.attempts(assignment.id, { limit: 100, offset });
        all.push(...page.data);
        if (page.data.length === 0 || all.length >= page.meta.total) break;
      }
      await initSolver();
      rows = all.map((a) => ({
        attempt: a,
        status: statusOf(a),
        grade: spec ? gradeAttempt(spec, a.seed, a.answers, a.student.name ?? a.student.email) : null,
      }));
    } catch (e) {
      error = errorText(e);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void assignment.id;
    void load();
  });

  function exportCsv() {
    const header = [t('exam.csv.name'), t('exam.csv.email'), t('exam.csv.started'), t('exam.csv.submitted'), t('exam.csv.status'), t('exam.csv.correct'), t('exam.csv.total'), t('exam.csv.percent')];
    const csv = gradesCsv(header, rows.map((r) => ({
      name: r.attempt.student.name ?? '',
      email: r.attempt.student.email,
      startedAt: r.attempt.started_at,
      submittedAt: r.attempt.submitted_at,
      status: statusText(r.status),
      correct: r.grade?.correct ?? null,
      total: r.grade?.total ?? null,
    })));
    const slug = slugifyTabName(assignment.title);
    saveFile(`${slug}-${assignment.code}.csv`, new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
  }
</script>

<div class="attempts" data-testid="attempts-table">
  {#if loading}
    <p class="muted">{t('exam.loading')}</p>
  {:else if error}
    <p class="warn" role="alert">{error}</p>
  {:else}
    {#if !spec}<p class="warn">{t('exam.unavailable.badExercise')}</p>{/if}
    {#if rows.length === 0}
      <p class="muted">{t('exam.mine.noAttempts')}</p>
    {:else}
      <div class="tools">
        <button class="act" onclick={exportCsv} data-testid="attempts-csv">{t('exam.mine.exportCsv')}</button>
        <button class="act" onclick={load}>{t('exam.refresh')}</button>
      </div>
      <p class="note">{t('exam.mine.gradedHere')}</p>
      <div class="scroll">
        <table>
          <thead><tr><th>{t('exam.csv.name')}</th><th>{t('exam.csv.started')}</th><th>{t('exam.csv.status')}</th><th>{t('exam.mine.score')}</th><th></th></tr></thead>
          <tbody>
            {#each rows as r (r.attempt.id)}
              <tr data-testid="attempt-row">
                <td><div>{r.attempt.student.name ?? '—'}</div><div class="email">{r.attempt.student.email}</div></td>
                <td>{formatWhen(r.attempt.started_at)}</td>
                <td>{statusText(r.status)}{#if r.attempt.submitted_at}<div class="email">{formatWhen(r.attempt.submitted_at)}</div>{/if}</td>
                <td data-testid="attempt-score">{r.grade ? tp('exam.mine.scoreValue', { correct: r.grade.correct, total: r.grade.total }) : '—'}</td>
                <td>{#if r.grade}<button class="act" onclick={() => (opened = opened === r.attempt.id ? null : r.attempt.id)} data-testid="attempt-detail">{t('exam.mine.detail')}</button>{/if}</td>
              </tr>
              {#if opened === r.attempt.id && r.grade}
                <tr><td colspan="5"><SubmissionReview submission={r.grade.submission} {spec} onclose={() => (opened = null)} /></td></tr>
              {/if}
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}
</div>

<style>
  .attempts { margin-top: 6px; display: flex; flex-direction: column; gap: 6px; }
  .muted, .note { color: var(--st-text-3); font-size: 0.75rem; margin: 0; }
  .warn { color: var(--st-warn); font-size: 0.78rem; margin: 0; }
  .tools { display: flex; gap: 6px; }
  .scroll { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 0.75rem; }
  th { text-align: left; color: var(--st-text-3); font-weight: 600; padding: 4px 6px; border-bottom: 1px solid var(--st-hair); }
  td { padding: 5px 6px; border-bottom: 1px solid var(--st-hair); color: var(--st-text-2); vertical-align: top; }
  .email { color: var(--st-text-3); font-size: 0.7rem; }
  .act { background: none; border: 1px solid var(--st-hair); border-radius: var(--st-radius); color: var(--st-text-2); font-family: var(--st-sans); font-size: 0.7rem; padding: 3px 10px; cursor: pointer; white-space: nowrap; }
</style>
