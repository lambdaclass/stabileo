<script lang="ts">
  import { adminAuth } from './admin-auth.svelte';
  import { adminUsers } from './admin-users.svelte';
  import { t } from '../lib/i18n';

  let busy = $state(false);

  async function signOut() {
    if (busy) return;
    busy = true;
    try {
      await adminAuth.logout();
      adminUsers.reset();
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
  }
</style>
