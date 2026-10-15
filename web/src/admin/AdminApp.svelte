<script lang="ts">
  import { onMount } from 'svelte';
  import { adminAuth } from './admin-auth.svelte';
  import { i18n, t } from '../lib/i18n';
  import AdminLogin from './AdminLogin.svelte';
  import AdminHeader from './AdminHeader.svelte';
  import UsersPage from './UsersPage.svelte';

  let booted = $state(false);

  onMount(() => {
    void adminAuth.init().finally(() => {
      booted = true;
    });
  });

  $effect(() => {
    document.documentElement.lang = i18n.locale;
    document.title = t('admin.title');
  });
</script>

{#if !booted}
  <div class="adm-boot" data-testid="admin-boot">{t('admin.loading')}</div>
{:else if adminAuth.isAuthenticated}
  <div class="adm-shell">
    <AdminHeader />
    <main class="adm-main">
      <UsersPage />
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
