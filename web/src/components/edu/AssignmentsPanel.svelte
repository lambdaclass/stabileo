<script lang="ts">
  import { assignmentsApi, type Assignment } from '../../lib/api/assignments';
  import { errorText } from '../../lib/api/error-text';
  import { examPath } from '../../lib/app-mode';
  import { t, tp } from '../../lib/i18n';
  import { assignmentStatus, formatWhen } from './exam-time';
  import AssignDialog from './AssignDialog.svelte';
  import AttemptsTable from './AttemptsTable.svelte';

  interface Props { revision?: number }
  let { revision = 0 }: Props = $props();

  let items = $state<Assignment[]>([]);
  let loading = $state(true);
  let error = $state('');
  let editing = $state<Assignment | null>(null);
  let confirmDelete = $state<string | null>(null);
  let openAttempts = $state<string | null>(null);
  let copiedId = $state<string | null>(null);

  async function load() {
    loading = true;
    error = '';
    try {
      items = (await assignmentsApi.list({ limit: 100 })).data;
    } catch (e) {
      error = errorText(e);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void revision;
    void load();
  });

  async function remove(a: Assignment) {
    confirmDelete = null;
    try {
      await assignmentsApi.remove(a.id);
      items = items.filter((x) => x.id !== a.id);
      if (openAttempts === a.id) openAttempts = null;
    } catch (e) {
      error = errorText(e);
    }
  }

  async function copyLink(a: Assignment) {
    try {
      await navigator.clipboard.writeText(`${location.origin}${examPath(a.code)}`);
      copiedId = a.id;
    } catch {
      copiedId = null;
    }
  }

  const statusText = (a: Assignment) => {
    const s = assignmentStatus(a);
    return s === 'upcoming' ? t('exam.status.upcoming') : s === 'closed' ? t('exam.status.closed') : t('exam.status.open');
  };
</script>

<div class="assignments" data-testid="assignments-panel">
  {#if loading && items.length === 0}
    <p class="muted">{t('exam.loading')}</p>
  {:else if items.length === 0 && !error}
    <p class="muted">{t('exam.mine.empty')}</p>
  {/if}
  {#if error}<p class="warn" role="alert">{error}</p>{/if}
  {#each items as a (a.id)}
    <div class="item" data-testid="assignment-row" data-code={a.code}>
      <div class="head">
        <span class="name">{a.title}</span>
        <span class="status status-{assignmentStatus(a)}">{statusText(a)}</span>
      </div>
      <p class="meta">
        {tp('exam.minutes', { n: a.duration_minutes })} · {formatWhen(a.opens_at)} → {a.closes_at ? formatWhen(a.closes_at) : t('exam.noClose')}
      </p>
      <p class="meta" data-testid="assignment-counts">{tp('exam.mine.counts', { started: a.attempt_count, submitted: a.submitted_count })}</p>
      <div class="actions">
        <button class="act" onclick={() => copyLink(a)}>{copiedId === a.id ? t('exam.assign.copied') : t('exam.mine.copyLink')}</button>
        <button class="act" onclick={() => (openAttempts = openAttempts === a.id ? null : a.id)} data-testid="assignment-attempts">{openAttempts === a.id ? t('exam.mine.hideAttempts') : t('exam.mine.attempts')}</button>
        <button class="act" onclick={() => (editing = a)}>{t('edu.author.edit')}</button>
        <button class="act del" onclick={() => (confirmDelete = a.id)}>{t('edu.author.delete')}</button>
      </div>
      {#if confirmDelete === a.id}
        <div class="confirm" role="alertdialog">
          <p>{tp('exam.mine.deleteConfirm', { title: a.title, n: a.attempt_count })}</p>
          <div class="actions">
            <button class="act del" onclick={() => remove(a)} data-testid="assignment-delete-confirm">{t('edu.author.delete')}</button>
            <button class="act" onclick={() => (confirmDelete = null)}>{t('exam.cancel')}</button>
          </div>
        </div>
      {/if}
      {#if openAttempts === a.id}<AttemptsTable assignment={a} />{/if}
    </div>
  {/each}
</div>

{#if editing}
  <AssignDialog editing={editing} onclose={() => (editing = null)} ondone={(next) => { items = items.map((x) => (x.id === next.id ? next : x)); }} />
{/if}

<style>
  .assignments { display: flex; flex-direction: column; gap: 10px; }
  .muted { color: var(--st-text-3); font-size: 0.8rem; margin: 0; }
  .warn { color: var(--st-warn); font-size: 0.8rem; margin: 0; }
  .item { border: 1px solid var(--st-hair-strong); border-radius: 8px; padding: 10px 12px; display: flex; flex-direction: column; gap: 4px; }
  .head { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
  .name { font-weight: 600; font-size: 0.88rem; color: var(--st-text); }
  .status { font-size: 0.7rem; padding: 1px 8px; border-radius: 10px; border: 1px solid var(--st-hair-strong); color: var(--st-text-2); white-space: nowrap; }
  .status-open { color: var(--st-ok); border-color: currentColor; }
  .meta { margin: 0; font-size: 0.75rem; color: var(--st-text-3); }
  .actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
  .act { background: none; border: 1px solid var(--st-hair); border-radius: var(--st-radius); color: var(--st-text-2); font-family: var(--st-sans); font-size: 0.7rem; padding: 3px 10px; cursor: pointer; }
  .act.del:hover { color: var(--st-danger); border-color: var(--st-danger); }
  .confirm { border: 1px solid var(--st-warn); background: var(--st-warn-bg); border-radius: var(--st-radius); padding: 8px 10px; }
  .confirm p { margin: 0; font-size: 0.78rem; color: var(--st-text-2); }
</style>
