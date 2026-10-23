<script lang="ts">
  import { onMount } from 'svelte';
  import { completeOAuthCallback } from './oauth-callback';
  import { PAGE_PATHS } from './admin-route.svelte';
  import { t } from '../lib/i18n';

  let message = $state<string | null>(null);

  onMount(() => {
    void completeOAuthCallback(location.search).then((outcome) => {
      if (!outcome.ok) message = outcome.message;
    });
  });
</script>

<div class="adm-cb-wrap">
  <div class="adm-cb" data-testid="admin-oauth-callback">
    <div class="adm-cb-brand">
      <span class="adm-mark" aria-hidden="true"></span>
      <span class="adm-brand">{t('admin.brand')}</span>
      <span class="adm-tag">{t('admin.brandTag')}</span>
    </div>
    {#if message}
      <h1 class="adm-cb-title">{t('admin.oauth.failedTitle')}</h1>
      <p class="adm-error" role="alert" data-testid="admin-oauth-error">{message}</p>
      <a class="adm-cb-back" href={PAGE_PATHS.users} data-testid="admin-oauth-back">{t('admin.oauth.back')}</a>
    {:else}
      <p class="adm-cb-working" role="status">{t('admin.oauth.working')}</p>
    {/if}
  </div>
</div>

<style>
  .adm-cb-wrap {
    display: grid;
    place-items: center;
    min-height: 100vh;
    padding: 24px 16px;
  }

  .adm-cb {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: min(380px, 100%);
    padding: 22px;
    background: var(--st-surface);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius-lg);
  }

  .adm-cb-brand { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }

  .adm-mark {
    width: 0;
    height: 0;
    border-left: 7px solid transparent;
    border-right: 7px solid transparent;
    border-bottom: 12px solid var(--st-accent);
  }

  .adm-brand { font-family: var(--st-display); font-weight: 700; font-size: 1rem; color: var(--st-text); }

  .adm-tag {
    padding: 1px 6px;
    border: 1px solid var(--st-hair-strong);
    border-radius: 999px;
    font-size: 0.62rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--st-text-2);
  }

  .adm-cb-title { margin: 0; font-size: 1.05rem; font-weight: 600; color: var(--st-text); }
  .adm-cb-working { margin: 0; font-size: 0.8rem; color: var(--st-text-2); }
  .adm-error { margin: 0; font-size: 0.78rem; line-height: 1.45; color: var(--st-danger); }

  .adm-cb-back {
    align-self: flex-start;
    color: var(--st-accent);
    font-size: 0.8rem;
    font-weight: 600;
  }
</style>
