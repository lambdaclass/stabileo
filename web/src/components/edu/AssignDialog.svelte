<script lang="ts">
  import { assignmentsApi, type Assignment, type AssignmentInput, type Reveal } from '../../lib/api/assignments';
  import { ApiError } from '../../lib/api/client';
  import { errorText } from '../../lib/api/error-text';
  import { examPath } from '../../lib/app-mode';
  import { t, tp } from '../../lib/i18n';
  import type { EduExerciseSpec } from './exercise-spec';
  import { exerciseEnvelope } from './exam-grading';
  import { fromLocalInput, toLocalInput } from './exam-time';

  interface Props {
    /** The exercise to assign; absent when editing one that exists. */
    spec?: EduExerciseSpec | null;
    editing?: Assignment | null;
    onclose: () => void;
    ondone: (a: Assignment) => void;
  }
  let { spec = null, editing = null, onclose, ondone }: Props = $props();

  let title = $state(editing?.title ?? spec?.title ?? '');
  let duration = $state(editing?.duration_minutes ?? 60);
  let opens = $state(toLocalInput(editing?.opens_at));
  let closes = $state(toLocalInput(editing?.closes_at));
  let reveal = $state<Reveal>(editing?.reveal ?? 'on_submit');
  let busy = $state(false);
  let error = $state('');
  let created = $state<Assignment | null>(null);
  let copied = $state(false);

  const link = $derived(created ? `${location.origin}${examPath(created.code)}` : '');

  const problem = $derived.by(() => {
    const name = title.trim();
    if (!name || name.length > 120) return t('exam.assign.errTitle');
    if (!Number.isInteger(duration) || duration < 1 || duration > 600) return t('exam.assign.errDuration');
    const o = fromLocalInput(opens);
    const c = fromLocalInput(closes);
    if (closes && !c) return t('exam.assign.errCloses');
    if (o && c && Date.parse(c) <= Date.parse(o)) return t('exam.assign.errOrder');
    if (!o && c && Date.parse(c) <= Date.now()) return t('exam.assign.errOrder');
    if (reveal === 'after_close' && !c) return t('exam.assign.errRevealNeedsClose');
    return '';
  });

  function messageFor(e: unknown): string {
    if (e instanceof ApiError) {
      if (e.code === 'assignment_limit_reached') return t('exam.assign.errLimit');
      if (e.code === 'assignments_disabled') return t('exam.unavailable.disabled');
      if (e.code === 'assignment_started') return t('exam.assign.errStarted');
      if (e.code === 'validation_error') return t('exam.assign.errInvalid');
    }
    return errorText(e);
  }

  async function save() {
    if (problem || busy) return;
    busy = true;
    error = '';
    const fields = {
      title: title.trim(),
      duration_minutes: duration,
      ...(fromLocalInput(opens) ? { opens_at: fromLocalInput(opens)! } : {}),
      closes_at: fromLocalInput(closes),
      reveal,
    };
    try {
      if (editing) {
        ondone(await assignmentsApi.update(editing.id, fields));
        onclose();
      } else if (spec) {
        const input: AssignmentInput = { ...fields, exercise: exerciseEnvelope(spec) };
        created = await assignmentsApi.create(input);
        ondone(created);
      }
    } catch (e) {
      error = messageFor(e);
    } finally {
      busy = false;
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      copied = true;
    } catch {
      copied = false;
    }
  }
</script>

<div class="backdrop" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}>
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="assign-title" data-testid="assign-dialog">
    <h3 id="assign-title">{editing ? t('exam.assign.editTitle') : t('exam.assign.title')}</h3>
    {#if created}
      <p>{t('exam.assign.created')}</p>
      <div class="link-row">
        <input class="link" type="text" readonly value={link} data-testid="assign-link" onfocus={(e) => (e.currentTarget as HTMLInputElement).select()} />
        <button class="primary" onclick={copy} data-testid="assign-copy">{copied ? t('exam.assign.copied') : t('exam.assign.copy')}</button>
      </div>
      <p class="hint">{t('exam.assign.linkHint')}</p>
      <button class="ghost" onclick={onclose}>{t('exam.assign.close')}</button>
    {:else}
      {#if spec}<p class="hint">{tp('exam.assign.exercise', { title: spec.title })}</p>{/if}
      <label>{t('exam.assign.name')}<input type="text" bind:value={title} maxlength="120" data-testid="assign-name" /></label>
      <label>{t('exam.assign.duration')}<input type="number" min="1" max="600" step="1" bind:value={duration} data-testid="assign-duration" /></label>
      <div class="two">
        <label>{t('exam.assign.opens')}<input type="datetime-local" bind:value={opens} data-testid="assign-opens" /></label>
        <label>{t('exam.assign.closes')}<input type="datetime-local" bind:value={closes} data-testid="assign-closes" /></label>
      </div>
      <p class="hint">{t('exam.assign.windowHint')}</p>
      <fieldset>
        <legend>{t('exam.assign.reveal')}</legend>
        <label class="radio"><input type="radio" name="reveal" value="on_submit" bind:group={reveal} />
          <span><strong>{t('exam.assign.revealOnSubmit')}</strong> {t('exam.assign.revealOnSubmitHint')}</span></label>
        <label class="radio"><input type="radio" name="reveal" value="after_close" bind:group={reveal} data-testid="assign-after-close" />
          <span><strong>{t('exam.assign.revealAfterClose')}</strong> {t('exam.assign.revealAfterCloseHint')}</span></label>
      </fieldset>
      {#if editing && editing.attempt_count > 0}<p class="hint">{t('exam.assign.exerciseLocked')}</p>{/if}
      {#if problem}<p class="warn">{problem}</p>{/if}
      {#if error}<p class="warn" role="alert">{error}</p>{/if}
      <div class="row">
        <button class="primary" onclick={save} disabled={!!problem || busy} data-testid="assign-save">{editing ? t('exam.assign.saveChanges') : t('exam.assign.create')}</button>
        <button class="ghost" onclick={onclose}>{t('exam.cancel')}</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; z-index: 1000; background: rgba(0, 0, 0, 0.45); display: flex; align-items: center; justify-content: center; padding: 16px; }
  .dialog { width: min(480px, 100%); max-height: calc(100vh - 32px); overflow-y: auto; background: var(--st-surface-2); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 10px; padding: 18px; display: flex; flex-direction: column; gap: 10px; }
  h3 { margin: 0; font-size: 1rem; }
  p { margin: 0; font-size: 0.82rem; color: var(--st-text-2); line-height: 1.4; }
  .hint { font-size: 0.76rem; color: var(--st-text-3); }
  .warn { color: var(--st-warn); font-size: 0.8rem; }
  label { display: flex; flex-direction: column; gap: 4px; font-size: 0.78rem; color: var(--st-text-2); }
  input[type='text'], input[type='number'], input[type='datetime-local'] { font: inherit; font-size: 0.85rem; padding: 6px 8px; border-radius: var(--st-radius); border: 1px solid var(--st-hair-strong); background: var(--st-surface-3); color: var(--st-text); }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  @media (max-width: 480px) { .two { grid-template-columns: 1fr; } }
  fieldset { border: 1px solid var(--st-hair); border-radius: var(--st-radius); padding: 8px 10px; margin: 0; display: flex; flex-direction: column; gap: 8px; }
  legend { font-size: 0.78rem; color: var(--st-text-2); padding: 0 4px; }
  .radio { flex-direction: row; align-items: flex-start; gap: 8px; font-size: 0.8rem; line-height: 1.4; }
  .row, .link-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .link { flex: 1; min-width: 0; }
  .primary, .ghost { font-family: var(--st-sans); font-size: 0.8rem; padding: 6px 14px; border-radius: var(--st-radius); cursor: pointer; align-self: flex-start; }
  .primary { background: var(--st-accent-fill); border: 1px solid var(--st-accent-fill); color: #fff; font-weight: 600; }
  .primary:disabled { opacity: 0.6; cursor: default; }
  .ghost { background: none; border: 1px solid var(--st-hair-strong); color: var(--st-text-2); }
</style>
