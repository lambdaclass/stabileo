<script lang="ts">
  import { onMount } from 'svelte';
  import { adminFeedback } from './admin-insights.svelte';
  import { PAGE_SIZE } from './list-store.svelte';
  import { adminErrorText } from './error-text';
  import { formatDateTime } from './format';
  import { t, tp } from '../lib/i18n';
  import type { FeedbackStatus } from '../lib/api/admin';

  const FILTERS = ['new', 'read', 'done', ''] as const;
  let filter = $state<(typeof FILTERS)[number]>((adminFeedback.params.status as (typeof FILTERS)[number] | undefined) ?? 'new');
  let actionError = $state<unknown>(null);

  onMount(() => {
    void adminFeedback.load({ status: filter, offset: 0 });
  });

  function show(next: (typeof FILTERS)[number]) {
    filter = next;
    void adminFeedback.load({ status: next, offset: 0 });
  }

  async function mark(id: string, status: FeedbackStatus) {
    actionError = null;
    try {
      await adminFeedback.setStatus(id, status);
    } catch (e) {
      actionError = e;
    }
  }

  const offset = $derived(Number(adminFeedback.params.offset ?? 0));
  const sender = $derived(adminFeedback.params.account_id ? String(adminFeedback.params.owner_label ?? '') : null);

  function reply(f: { kind: string; message: string; account: { email: string; name: string } | null }): string {
    if (!f.account) return '';
    const subject = encodeURIComponent(t('admin.feedback.replySubject'));
    const quoted = encodeURIComponent(`\n\n> ${f.message.split('\n').join('\n> ')}`);
    return `mailto:${f.account.email}?subject=${subject}&body=${quoted}`;
  }
</script>

<section class="ins" aria-labelledby="ins-feedback-title" data-testid="admin-feedback">
  <div class="ins-head">
    <h1 id="ins-feedback-title" class="ins-h1">{t('admin.feedback.title')}</h1>
    <span class="ins-sub">{tp('admin.users.total', { count: adminFeedback.total })}</span>
  </div>

  <div class="ins-explain">
    <p>{t('admin.feedback.what')}</p>
  </div>

  <div class="ins-toolbar">
    {#each FILTERS as f (f)}
      <button class="ins-btn" class:on={filter === f} onclick={() => show(f)} data-testid={`admin-feedback-filter-${f || 'all'}`}>
        {f ? t(`admin.feedback.status.${f}`) : t('admin.status.all')}
      </button>
    {/each}
    {#if sender !== null}
      <span class="ins-tag accent" data-testid="admin-feedback-sender">
        {tp('admin.feedback.senderFilter', { sender })}
        <button type="button" class="ins-chip-x" aria-label={t('admin.projects.clearOwner')}
          onclick={() => adminFeedback.load({ account_id: undefined, owner_label: undefined, offset: 0 })}>✕</button>
      </span>
    {/if}
  </div>

  {#if adminFeedback.error}<div class="ins-banner" role="alert">{adminErrorText(adminFeedback.error)}</div>{/if}
  {#if actionError}<div class="ins-banner" role="alert">{adminErrorText(actionError)}</div>{/if}

  {#if adminFeedback.rows.length === 0}
    <p class="ins-muted">{adminFeedback.loading ? t('admin.loading') : t('admin.feedback.empty')}</p>
  {:else}
    <ul class="ins-feed">
      {#each adminFeedback.rows as f (f.id)}
        <li class="ins-feed-item" class:new={f.status === 'new'} data-testid="admin-feedback-item">
          <div class="ins-feed-meta">
            <span class="ins-tag accent">{t(`feedbackForm.kind.${f.kind}`)}</span>
            <span class="ins-tag">{t(`admin.feedback.status.${f.status}`)}</span>
            <span>{f.account ? `${f.account.name} · ${f.account.email}` : '—'}</span>
            <span>{formatDateTime(f.inserted_at)}</span>
            {#if f.page}<span class="ins-mono">{f.page}</span>{/if}
            {#if f.app_version}<span class="ins-mono">v{f.app_version}</span>{/if}
          </div>
          <p class="ins-feed-msg">{f.message}</p>
          <div class="ins-feed-actions">
            {#each ['read', 'done', 'new'] as const as s (s)}
              {#if f.status !== s}
                <button class="ins-btn" onclick={() => mark(f.id, s)} data-testid={`admin-feedback-mark-${s}`}>{t(`admin.feedback.mark.${s}`)}</button>
              {/if}
            {/each}
            {#if f.model_link}<a href={f.model_link} target="_blank" rel="noopener noreferrer">{t('admin.feedback.openModel')}</a>{/if}
            {#if f.account}<a href={reply(f)} data-testid="admin-feedback-reply">{t('admin.feedback.reply')}</a>{/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  <nav class="ins-pager" aria-label={t('admin.users.pagination')}>
    <span>{tp('admin.users.range', { from: adminFeedback.total ? offset + 1 : 0, to: Math.min(offset + PAGE_SIZE, adminFeedback.total), total: adminFeedback.total })}</span>
    <span>
      <button class="ins-btn" disabled={offset === 0} onclick={() => adminFeedback.load({ offset: Math.max(0, offset - PAGE_SIZE) })}>{t('admin.users.prev')}</button>
      <button class="ins-btn" disabled={offset + PAGE_SIZE >= adminFeedback.total} onclick={() => adminFeedback.load({ offset: offset + PAGE_SIZE })}>{t('admin.users.next')}</button>
    </span>
  </nav>
</section>
