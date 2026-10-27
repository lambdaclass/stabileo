<script lang="ts">
  import { onMount } from 'svelte';
  import { adminAudit } from './admin-insights.svelte';
  import { PAGE_SIZE } from './list-store.svelte';
  import { adminErrorText } from './error-text';
  import { formatDateTime } from './format';
  import { t, tp } from '../lib/i18n';

  onMount(() => {
    void adminAudit.load({ offset: 0 });
  });

  const offset = $derived(Number(adminAudit.params.offset ?? 0));
  const details = (d: Record<string, unknown>) =>
    Object.entries(d)
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
      .join(' · ');
</script>

<section class="ins" aria-labelledby="ins-audit-title" data-testid="admin-audit">
  <div class="ins-head">
    <h1 id="ins-audit-title" class="ins-h1">{t('admin.audit.title')}</h1>
    <span class="ins-sub">{tp('admin.users.total', { count: adminAudit.total })}</span>
  </div>
  <p class="ins-muted">{t('admin.audit.lede')}</p>

  {#if adminAudit.error}<div class="ins-banner" role="alert">{adminErrorText(adminAudit.error)}</div>{/if}

  <div class="ins-table-wrap">
    <table class="ins-table">
      <thead>
        <tr>
          <th>{t('admin.audit.when')}</th>
          <th>{t('admin.audit.who')}</th>
          <th>{t('admin.audit.action')}</th>
          <th>{t('admin.audit.details')}</th>
        </tr>
      </thead>
      <tbody>
        {#each adminAudit.rows as a (a.id)}
          <tr data-testid="admin-audit-row">
            <td>{formatDateTime(a.inserted_at)}</td>
            <td>{a.admin?.email ?? '—'}</td>
            <td><span class="ins-tag accent">{a.action}</span></td>
            <td class="ins-mono">{details(a.details)}</td>
          </tr>
        {:else}
          <tr><td colspan="4" class="ins-muted">{adminAudit.loading ? t('admin.loading') : t('admin.audit.empty')}</td></tr>
        {/each}
      </tbody>
    </table>
  </div>

  <nav class="ins-pager" aria-label={t('admin.users.pagination')}>
    <span>{tp('admin.users.range', { from: adminAudit.total ? offset + 1 : 0, to: Math.min(offset + PAGE_SIZE, adminAudit.total), total: adminAudit.total })}</span>
    <span>
      <button class="ins-btn" disabled={offset === 0} onclick={() => adminAudit.load({ offset: Math.max(0, offset - PAGE_SIZE) })}>{t('admin.users.prev')}</button>
      <button class="ins-btn" disabled={offset + PAGE_SIZE >= adminAudit.total} onclick={() => adminAudit.load({ offset: offset + PAGE_SIZE })}>{t('admin.users.next')}</button>
    </span>
  </nav>
</section>
