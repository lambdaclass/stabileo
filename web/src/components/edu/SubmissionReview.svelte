<script lang="ts">
  /**
   * A submission, as the teacher reads it.
   *
   * One table: what was asked, what the student answered, and the verdict the
   * app gave it — the three columns anyone marking thirty of these needs, in
   * the order they are read. The score is stated once at the top rather than
   * computed in the reader's head.
   *
   * It says plainly that a submission is a record and not a proof. Everything
   * in the file was produced on the student's own machine, and a teacher who
   * assumes otherwise would be trusting it for something it cannot carry.
   */
  import { t, tp } from '../../lib/i18n';
  import { scoreOf, type Submission } from './exercise-submission';
  import type { EduExerciseSpec } from './exercise-spec';
  import { remarkSubmission, type RemarkedAnswer } from './exercise-marking';
  import { describeVariant } from './exercise-variant';

  interface Props {
    submission: Submission;
    /** The exercise to mark against; null when the teacher does not have it, absent when nothing should be marked again. */
    spec?: EduExerciseSpec | null;
    onclose: () => void;
  }
  let { submission, spec, onclose }: Props = $props();

  const remark = $derived(spec ? remarkSubmission(spec, submission) : null);
  const rows = $derived<RemarkedAnswer[]>(remark?.answers ?? submission.answers.map((a) => ({ ...a, recorded: a.outcome })));
  const score = $derived(scoreOf({ ...submission, answers: rows }));
  const variantText = $derived(spec && remark?.variant ? describeVariant(spec, remark.variant) : '');

  const when = $derived(
    submission.submittedAt
      ? new Date(submission.submittedAt).toLocaleString()
      : '—',
  );
</script>

<div class="review">
  <div class="review-head">
    <h3>{t('edu.review.title')}</h3>
    <button class="close" onclick={onclose} aria-label={t('edu.review.close')}>✕</button>
  </div>

  <div class="review-meta">
    <div><span class="k">{t('edu.review.exercise')}</span> <span class="v">{submission.exerciseTitle}</span></div>
    <div><span class="k">{t('edu.review.student')}</span> <span class="v">{submission.student || t('edu.review.anonymous')}</span></div>
    {#if submission.legajo}
      <div><span class="k">{t('edu.review.legajo')}</span> <span class="v" data-testid="review-legajo">{submission.legajo}</span></div>
    {/if}
    {#if variantText}
      <div><span class="k">{t('edu.review.variant')}</span> <span class="v" data-testid="review-variant">{variantText}</span></div>
    {/if}
    <div><span class="k">{t('edu.review.when')}</span> <span class="v">{when}</span></div>
  </div>

  <div class="score" class:all-right={score.correct === score.total}>
    {score.correct} / {score.total} {t('edu.review.correct')}
    {#if score.answered < score.total}
      · {score.total - score.answered} {t('edu.review.unanswered')}
    {/if}
    {#if score.revealed > 0}
      · {score.revealed} {t('edu.review.revealed')}
    {/if}
  </div>

  {#if remark}
    <p class="note" data-testid="review-remarked">
      {t('edu.review.remarked')}
      {#if remark.changed > 0}{tp('edu.review.changed', { n: remark.changed })}{/if}
    </p>
    {#if remark.seedMismatch}<p class="note warn">{t('edu.review.seedMismatch')}</p>{/if}
  {:else if spec === null}
    <p class="note">{t('edu.review.unknownExercise')}</p>
  {/if}

  <table class="answers">
    <thead>
      <tr>
        <th>{t('edu.review.question')}</th>
        <th>{t('edu.review.answer')}</th>
        <th>{t('edu.review.outcome')}</th>
        {#if remark}<th>{t('edu.review.expected')}</th>{/if}
      </tr>
    </thead>
    <tbody>
      {#each rows as a, i (i)}
        <tr>
          <td class="q">{a.label}</td>
          <td class="a">{a.answer || '—'}{#if a.unit && a.answer}<span class="u"> {a.unit}</span>{/if}</td>
          <td class="o">
            <!-- Glyph AND colour: a marked table read on a projector, or by
                 anyone who does not separate red from green, still works. -->
            {#if a.outcome === 'correct'}
              <span class="ok">✓ {t('edu.review.ok')}</span>
            {:else if a.outcome === 'incorrect'}
              <span class="bad">✗ {t('edu.review.bad')}</span>
            {:else}
              <span class="pend">— {t('edu.review.pending')}</span>
            {/if}
            {#if a.revealed}<span class="rev">{t('edu.review.wasRevealed')}</span>{/if}
          </td>
          {#if remark}<td class="a" data-testid="review-expected">{a.expected ?? '—'}</td>{/if}
        </tr>
      {/each}
    </tbody>
  </table>

  <p class="disclaimer">{t('edu.review.notProof')}</p>
</div>

<style>
  .review { display: flex; flex-direction: column; gap: 10px; }

  .review-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .review-head h3 {
    font-family: var(--st-mono);
    font-size: 0.7rem;
    font-weight: 400;
    letter-spacing: 0.11em;
    text-transform: uppercase;
    color: var(--st-text-2);
    margin: 0;
  }

  .close {
    background: none;
    border: none;
    color: var(--st-text-3);
    font-size: 0.85rem;
    cursor: pointer;
  }

  .close:hover { color: var(--st-text); }

  .review-meta {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 0.72rem;
  }

  .k { color: var(--st-text-3); }
  .v { color: var(--st-text); }

  .score {
    font-family: var(--st-mono);
    font-size: 0.8rem;
    color: var(--st-text);
    padding: 8px 10px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius-lg);
  }

  .score.all-right {
    color: var(--st-ok);
    border-color: var(--st-ok);
    background: color-mix(in srgb, var(--st-ok) 10%, transparent);
  }

  .answers {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.7rem;
  }

  .answers th {
    text-align: left;
    font-family: var(--st-mono);
    font-weight: 400;
    font-size: 0.62rem;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: var(--st-text-3);
    border-bottom: 1px solid var(--st-hair);
    padding: 4px 6px;
  }

  .answers td {
    padding: 4px 6px;
    border-bottom: 1px solid var(--st-hair);
    vertical-align: top;
  }

  .q { color: var(--st-text-2); }
  .a { font-family: var(--st-mono); color: var(--st-value); white-space: nowrap; }
  .u { color: var(--st-text-3); }

  .ok { color: var(--st-ok); }
  .bad { color: var(--st-danger); }
  .pend { color: var(--st-text-3); }

  .rev {
    display: block;
    font-size: 0.6rem;
    color: var(--st-warn);
  }

  .note {
    font-size: 0.68rem;
    color: var(--st-text-2);
    line-height: 1.4;
    margin: 0;
    padding: 5px 8px;
    border-left: 2px solid var(--st-value);
    background: var(--st-surface-2);
    border-radius: var(--st-radius);
  }

  .note.warn { border-left-color: var(--st-warn); }

  .disclaimer {
    font-size: 0.65rem;
    color: var(--st-text-3);
    line-height: 1.4;
    margin: 0;
  }
</style>
