<script lang="ts">
  // First: every dictionary entry, before anything here renders (the store starts with the public
  // pages' entries only, and the admin keys are not among them).
  import '../lib/i18n/full-dictionaries';
  import { onMount } from 'svelte';
  import { adminAuth } from './admin-auth.svelte';
  import { i18n, t } from '../lib/i18n';
  import AdminLogin from './AdminLogin.svelte';
  import AdminHeader from './AdminHeader.svelte';
  import UsersPage from './UsersPage.svelte';
  import SettingsPage from './SettingsPage.svelte';
  import AllowlistPage from './AllowlistPage.svelte';
  import MetricsPage from './MetricsPage.svelte';
  import ProjectsPage from './ProjectsPage.svelte';
  import FeedbackPage from './FeedbackPage.svelte';
  import AuditLogPage from './AuditLogPage.svelte';
  import './admin-pages.css';
  import OAuthCallback from './OAuthCallback.svelte';
  import { adminRoute } from './admin-route.svelte';

  let booted = $state(false);

  onMount(() => {
    const onPop = () => adminRoute.sync();
    window.addEventListener('popstate', onPop);
    if (adminRoute.isCallback) booted = true;
    else void adminAuth.init().finally(() => {
      booted = true;
    });
    return () => window.removeEventListener('popstate', onPop);
  });

  $effect(() => {
    document.documentElement.lang = i18n.locale;
    document.title = t('admin.title');
  });
</script>

{#if adminRoute.isCallback}
  <OAuthCallback />
{:else if !booted}
  <div class="adm-boot" data-testid="admin-boot">{t('admin.loading')}</div>
{:else if adminAuth.isAuthenticated}
  <div class="adm-shell">
    <AdminHeader />
    <main class="adm-main">
      {#if adminRoute.page === 'settings'}
        <SettingsPage />
      {:else if adminRoute.page === 'metrics'}
        <MetricsPage />
      {:else if adminRoute.page === 'projects'}
        <ProjectsPage />
      {:else if adminRoute.page === 'feedback'}
        <FeedbackPage />
      {:else if adminRoute.page === 'audit'}
        <AuditLogPage />
      {:else if adminRoute.page === 'allowlist'}
        <AllowlistPage />
      {:else}
        <UsersPage />
      {/if}
    </main>
  </div>
{:else}
  <AdminLogin />
{/if}

<style>
  .adm-boot {
    display: grid;
    place-items: center;
    min-height: 100vh;
    color: var(--st-text-2);
    font-size: 0.85rem;
  }

  .adm-shell {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  .adm-main {
    flex: 1;
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px 16px 40px;
  }
</style>
