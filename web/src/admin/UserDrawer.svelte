<script lang="ts">
  import { adminUsers, type UserAction } from './admin-users.svelte';
  import { adminErrorText } from './error-text';
  import { formatDateTime } from './format';
  import { t, tp } from '../lib/i18n';
  import { adminProjects, adminFeedback } from './admin-insights.svelte';
  import { adminRoute } from './admin-route.svelte';

  let { onclose }: { onclose: () => void } = $props();

  const CONFIRM_KEY: Record<UserAction, string> = {
    disable: 'admin.confirm.disable',
    enable: 'admin.confirm.enable',
    'force-logout': 'admin.confirm.forceLogout',
  };

  const LABEL_KEY: Record<UserAction, string> = {
    disable: 'admin.action.disable',
    enable: 'admin.action.enable',
    'force-logout': 'admin.action.forceLogout',
  };

  let pending = $state<UserAction | null>(null);
  let busy = $state(false);
  let error = $state<string | null>(null);
  let done = $state<string | null>(null);

  const user = $derived(adminUsers.selected);

  $effect(() => {
    void adminUsers.selectedId;
    pending = null;
    error = null;
    done = null;
  });

  function ask(action: UserAction) {
    pending = action;
    error = null;
    done = null;
  }

  async function confirm() {
    if (!user || !pending || busy) return;
    const action = pending;
    busy = true;
    error = null;
    try {
      const outcome = await adminUsers.act(user.id, action);
      done = action === 'force-logout'
        ? tp('admin.done.forceLogout', { count: outcome.revoked ?? 0 })
        : t(action === 'disable' ? 'admin.done.disable' : 'admin.done.enable');
      pending = null;
    } catch (e) {
      error = adminErrorText(e);
      pending = null;
    } finally {
      busy = false;
    }
  }

  function showProjects() {
    if (!user) return;
    void adminProjects.load({ account_id: user.id, owner_label: user.email, offset: 0 });
    onclose();
    adminRoute.navigate('projects');
  }

  function showFeedback() {
    if (!user) return;
    void adminFeedback.load({ account_id: user.id, owner_label: user.email, status: '', offset: 0 });
    onclose();
    adminRoute.navigate('feedback');
  }

  function onKey(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    if (pending && !busy) pending = null;
    else onclose();
  }
</script>

<svelte:window onkeydown={onKey} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="adm-scrim" onclick={onclose}></div>
<div class="adm-drawer" role="dialog" aria-modal="true" aria-labelledby="adm-drawer-title" data-testid="admin-user-drawer">
  <div class="adm-drawer-head">
    <h2 id="adm-drawer-title" class="adm-drawer-title">{user?.name ?? t('admin.detail.title')}</h2>
    <button type="button" class="adm-close" onclick={onclose} aria-label={t('admin.detail.close')} data-testid="admin-drawer-close">✕</button>
  </div>

  {#if adminUsers.detailError && !user}
    <p class="adm-error" role="alert" data-testid="admin-drawer-error">{adminErrorText(adminUsers.detailError)}</p>
  {:else if !user}
    <p class="adm-muted">{t('admin.loading')}</p>
  {:else}
    <div class="adm-drawer-status">
      <span class="adm-badge" class:off={!user.is_active} data-testid="admin-drawer-status">
        {user.is_active ? t('admin.status.active') : t('admin.status.disabled')}
      </span>
      {#if user.is_admin}<span class="adm-admin-tag">{t('admin.isAdmin')}</span>{/if}
      {#if adminUsers.detailLoading}<span class="adm-muted">{t('admin.refreshing')}</span>{/if}
    </div>

    {#if adminUsers.detailError}
      <p class="adm-error" role="alert">{adminErrorText(adminUsers.detailError)}</p>
    {/if}

    <dl class="adm-fields">
      <dt>{t('admin.col.email')}</dt><dd data-testid="admin-drawer-email">{user.email}</dd>
      <dt>{t('admin.col.name')}</dt><dd>{user.name}</dd>
      <dt>{t('admin.detail.id')}</dt><dd class="mono">{user.id}</dd>
      <dt>{t('admin.detail.company')}</dt><dd>{user.company ?? '—'}</dd>
      <dt>{t('admin.detail.jobTitle')}</dt><dd>{user.job_title ?? '—'}</dd>
      <dt>{t('admin.detail.country')}</dt><dd>{user.country ?? '—'}</dd>
      <dt>{t('admin.detail.locale')}</dt><dd>{user.locale}</dd>
      <dt>{t('admin.detail.emailVerified')}</dt>
      <dd>{user.email_verified_at ? formatDateTime(user.email_verified_at) : t('admin.detail.notVerified')}</dd>
      <dt>{t('admin.col.created')}</dt><dd>{formatDateTime(user.inserted_at)}</dd>
      <dt>{t('admin.col.lastActive')}</dt><dd data-testid="admin-drawer-last-active">{formatDateTime(user.last_active_at ?? user.last_sign_in_at)}</dd>
      <dt>{t('admin.col.lastSignIn')}</dt><dd>{formatDateTime(user.last_sign_in_at)}</dd>
      <dt>{t('admin.col.sessions')}</dt><dd class="mono" data-testid="admin-drawer-sessions">{user.active_sessions}</dd>
      <dt>{t('admin.detail.adminAccess')}</dt><dd>{user.is_admin ? t('admin.yes') : t('admin.no')}</dd>
      <dt>{t('admin.col.terms')}</dt>
      <dd data-testid="admin-drawer-terms">{user.consents?.terms ? `${user.consents.terms.version} · ${formatDateTime(user.consents.terms.accepted_at)}` : t('admin.users.termsMissing')}</dd>
      <dt>{t('admin.detail.usageAnalytics')}</dt><dd>{user.consents?.usage_analytics ? t('admin.yes') : t('admin.no')}</dd>
      <dt>{t('admin.detail.modelResearch')}</dt><dd>{user.consents?.model_research ? t('admin.yes') : t('admin.no')}</dd>
      <dt>{t('admin.col.projects')}</dt><dd class="mono">{user.project_count ?? 0}</dd>
    </dl>

    <div class="adm-links">
      <button type="button" class="adm-linkbtn" onclick={showProjects} data-testid="admin-drawer-projects">{tp('admin.detail.seeProjects', { n: user.project_count ?? 0 })}</button>
      <button type="button" class="adm-linkbtn" onclick={showFeedback} data-testid="admin-drawer-feedback">{t('admin.detail.seeFeedback')}</button>
    </div>

    <p class="adm-actions-help">{t('admin.detail.actionsHelp')}</p>

    {#if done}
      <p class="adm-done" role="status" data-testid="admin-drawer-done">{done}</p>
    {/if}
    {#if error}
      <p class="adm-error" role="alert" data-testid="admin-drawer-action-error">{error}</p>
    {/if}

    {#if pending}
      <div class="adm-confirm" data-testid="admin-confirm">
        <p>{tp(CONFIRM_KEY[pending], { email: user.email })}</p>
        <div class="adm-actions">
          <button type="button" class="adm-btn" onclick={() => (pending = null)} disabled={busy}>{t('admin.confirm.cancel')}</button>
          <button
            type="button"
            class="adm-btn"
            class:danger={pending !== 'enable'}
            class:primary={pending === 'enable'}
            onclick={confirm}
            disabled={busy}
            data-testid="admin-confirm-yes"
          >{busy ? t('admin.working') : t(LABEL_KEY[pending])}</button>
        </div>
      </div>
    {:else}
      <div class="adm-actions">
        {#if user.is_active}
          <button type="button" class="adm-btn danger" onclick={() => ask('disable')} data-testid="admin-action-disable">
            {t('admin.action.disable')}
          </button>
        {:else}
          <button type="button" class="adm-btn primary" onclick={() => ask('enable')} data-testid="admin-action-enable">
            {t('admin.action.enable')}
          </button>
        {/if}
        <button type="button" class="adm-btn" onclick={() => ask('force-logout')} data-testid="admin-action-force-logout">
          {t('admin.action.forceLogout')}
        </button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .adm-links { display: flex; gap: 14px; flex-wrap: wrap; margin: 4px 0 10px; }
  .adm-linkbtn { padding: 0; background: none; border: none; color: var(--st-interactive, var(--st-accent)); font: inherit; font-size: 0.78rem; cursor: pointer; text-decoration: underline; }
  .adm-actions-help { margin: 0 0 8px; font-size: 0.74rem; line-height: 1.5; color: var(--st-text-2); }
  .adm-scrim {
    position: fixed;
    inset: 0;
    z-index: 20;
    background: color-mix(in srgb, var(--st-bg) 60%, transparent);
  }

  .adm-drawer {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 21;
    display: flex;
    flex-direction: column;
    gap: 14px;
    width: min(420px, 100vw);
    padding: 18px;
    overflow-y: auto;
    background: var(--st-surface);
    border-left: 1px solid var(--st-hair-strong);
    box-shadow: -8px 0 32px rgb(0 0 0 / 0.3);
  }

  .adm-drawer-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
  .adm-drawer-title { margin: 0; font-size: 1.05rem; font-weight: 600; color: var(--st-text); word-break: break-word; }

  .adm-close {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    background: transparent;
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    cursor: pointer;
  }

  .adm-close:hover { background: var(--st-surface-3); color: var(--st-text); }

  .adm-drawer-status { display: flex; align-items: center; gap: 8px; }

  .adm-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--st-ok) 55%, transparent);
    background: color-mix(in srgb, var(--st-ok) 14%, transparent);
    color: var(--st-ok);
    font-size: 0.68rem;
    font-weight: 600;
  }

  .adm-badge.off {
    border-color: color-mix(in srgb, var(--st-danger) 55%, transparent);
    background: var(--st-danger-bg);
    color: var(--st-danger);
  }

  .adm-admin-tag {
    padding: 0 5px;
    border: 1px solid var(--st-hair-strong);
    border-radius: 999px;
    font-size: 0.6rem;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--st-text-2);
  }

  .adm-fields {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 7px 14px;
    margin: 0;
    font-size: 0.8rem;
  }

  .adm-fields dt {
    color: var(--st-text-2);
    font-size: 0.66rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    padding-top: 2px;
  }

  .adm-fields dd { margin: 0; color: var(--st-text); word-break: break-word; }
  .mono { font-family: var(--st-mono); font-size: 0.74rem; }

  .adm-muted { margin: 0; font-size: 0.74rem; color: var(--st-text-2); }
  .adm-error { margin: 0; font-size: 0.78rem; color: var(--st-danger); }

  .adm-done {
    margin: 0;
    padding: 7px 9px;
    border-left: 2px solid var(--st-ok);
    background: var(--st-surface-2);
    font-size: 0.78rem;
    color: var(--st-text);
  }

  .adm-confirm {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px 12px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-left: 2px solid var(--st-warn);
    border-radius: var(--st-radius);
  }

  .adm-confirm p { margin: 0; font-size: 0.8rem; line-height: 1.5; color: var(--st-text); }

  .adm-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }

  .adm-btn {
    padding: 6px 12px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    font-size: 0.76rem;
    font-weight: 600;
    cursor: pointer;
  }

  .adm-btn:hover:not(:disabled) { background: var(--st-surface-3); color: var(--st-text); }
  .adm-btn:disabled { opacity: 0.45; cursor: default; }

  .adm-btn.danger {
    border-color: color-mix(in srgb, var(--st-danger) 55%, transparent);
    color: var(--st-danger);
  }

  .adm-btn.danger:hover:not(:disabled) { background: var(--st-danger-bg); }

  .adm-btn.primary {
    background: color-mix(in srgb, var(--st-accent) 18%, var(--st-surface-2));
    border-color: color-mix(in srgb, var(--st-accent) 55%, transparent);
    color: var(--st-text);
  }
</style>
