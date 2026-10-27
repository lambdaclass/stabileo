<script lang="ts">
  import { adminAuth } from './admin-auth.svelte';
  import { adminUsers } from './admin-users.svelte';
  import { adminSettings } from './admin-settings.svelte';
  import { adminAllowlist } from './admin-allowlist.svelte';
  import { adminMetrics, adminProjects, adminFeedback, adminAudit } from './admin-insights.svelte';
  import { adminRoute, PAGE_PATHS, type AdminPage } from './admin-route.svelte';
  import { t } from '../lib/i18n';

  const NAV: { page: AdminPage; label: string }[] = [
    { page: 'users', label: 'admin.nav.users' },
    { page: 'metrics', label: 'admin.nav.metrics' },
    { page: 'projects', label: 'admin.nav.projects' },
    { page: 'feedback', label: 'admin.nav.feedback' },
    { page: 'audit', label: 'admin.nav.audit' },
    { page: 'settings', label: 'admin.nav.settings' },
    { page: 'allowlist', label: 'admin.nav.allowlist' },
  ];

  function go(e: MouseEvent, page: AdminPage) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    adminRoute.navigate(page);
  }

  let busy = $state(false);

  async function signOut() {
    if (busy) return;
    busy = true;
    try {
      await adminAuth.logout();
      adminUsers.reset();
      adminSettings.reset();
      adminAllowlist.reset();
      adminMetrics.reset();
      adminProjects.reset();
      adminFeedback.reset();
      adminAudit.reset();
    } finally {
      busy = false;
    }
  }
</script>

<header class="adm-header">
  <div class="adm-header-inner">
    <div class="adm-brand-row">
      <span class="adm-mark" aria-hidden="true"></span>
      <span class="adm-brand">{t('admin.brand')}</span>
      <span class="adm-tag">{t('admin.brandTag')}</span>
    </div>
    <nav class="adm-nav" aria-label={t('admin.nav.label')}>
      {#each NAV as item (item.page)}
        <a
          href={PAGE_PATHS[item.page]}
          class="adm-nav-link"
          class:on={adminRoute.page === item.page}
          aria-current={adminRoute.page === item.page ? 'page' : undefined}
          onclick={(e) => go(e, item.page)}
          data-testid={`admin-nav-${item.page}`}
        >{t(item.label)}</a>
      {/each}
    </nav>
    <div class="adm-who">
      <span class="adm-who-label">{t('admin.signedInAs')}</span>
      <span class="adm-who-email" data-testid="admin-email">{adminAuth.account?.email}</span>
      <button type="button" class="adm-signout" onclick={signOut} disabled={busy} data-testid="admin-signout">
        {t('admin.signOut')}
      </button>
    </div>
  </div>
</header>

<style>
  .adm-header {
    position: sticky;
    top: 0;
    z-index: 10;
    background: var(--st-surface);
    border-bottom: 1px solid var(--st-hair);
  }

  .adm-header-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    max-width: 1200px;
    margin: 0 auto;
    padding: 10px 16px;
  }

  .adm-brand-row { display: flex; align-items: center; gap: 8px; }

  .adm-mark {
    width: 0;
    height: 0;
    border-left: 7px solid transparent;
    border-right: 7px solid transparent;
    border-bottom: 12px solid var(--st-accent);
  }

  .adm-brand { font-family: var(--st-display); font-weight: 700; font-size: 0.95rem; color: var(--st-text); }

  .adm-tag {
    padding: 1px 6px;
    border: 1px solid var(--st-hair-strong);
    border-radius: 999px;
    font-size: 0.6rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--st-text-2);
  }

  .adm-nav { display: flex; align-items: center; gap: 2px; flex: 1; min-width: 0; overflow-x: auto; }

  .adm-nav-link {
    padding: 5px 10px;
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    font-size: 0.78rem;
    font-weight: 600;
    text-decoration: none;
    white-space: nowrap;
  }

  .adm-nav-link:hover { background: var(--st-surface-3); color: var(--st-text); }
  .adm-nav-link.on { color: var(--st-text); box-shadow: inset 0 -2px 0 var(--st-accent); }

  .adm-who { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 0.78rem; }
  .adm-who-label { color: var(--st-text-2); }

  .adm-who-email {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--st-text);
    font-weight: 500;
  }

  .adm-signout {
    flex-shrink: 0;
    padding: 5px 10px;
    background: transparent;
    border: 1px solid var(--st-hair-strong);
    border-radius: 999px;
    color: var(--st-text-2);
    font-size: 0.74rem;
    cursor: pointer;
  }

  .adm-signout:hover:not(:disabled) { background: var(--st-surface-3); color: var(--st-text); }
  .adm-signout:disabled { opacity: 0.5; cursor: default; }

  @media (max-width: 600px) {
    .adm-who-label { display: none; }
    .adm-who-email { display: none; }
  }
</style>
