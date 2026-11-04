<script lang="ts">
  import { authStore, initialsOf } from '../../lib/store/auth.svelte';
  import { t } from '../../lib/i18n';
  import AuthDialog from './AuthDialog.svelte';
  import ProfileDialog from './ProfileDialog.svelte';

  let authOpen = $state(false);
  let profileOpen = $state(false);

  const account = $derived(authStore.account);
  const loading = $derived(authStore.status === 'loading' && !account);

  function onClick() {
    if (account) profileOpen = true;
    else authOpen = true;
  }
</script>

{#if account}
  <button
    type="button"
    class="acc-entry signed"
    class:on={profileOpen}
    onclick={onClick}
    title={account.name}
    aria-label={`${t('account.menuLabel')}: ${account.name}`}
    data-testid="account-button"
  >
    <span class="acc-initials" aria-hidden="true">{initialsOf(account)}</span>
    <span class="acc-name">{account.name}</span>
  </button>
{:else}
  <button
    type="button"
    class="acc-entry"
    class:on={authOpen}
    onclick={onClick}
    disabled={loading}
    title={t('account.signIn')}
    aria-label={t('account.signIn')}
    data-testid="account-button"
  >
    <svg class="acc-glyph" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <circle cx="12" cy="8.5" r="3.6" fill="none" stroke="currentColor" stroke-width="1.6" />
      <path d="M4.8 19.5c1.2-3.4 4-5.2 7.2-5.2s6 1.8 7.2 5.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
    </svg>
    <span class="acc-name">{loading ? t('account.working') : t('account.signIn')}</span>
  </button>
{/if}

<AuthDialog bind:open={authOpen} />
<ProfileDialog bind:open={profileOpen} />

<style>
  .acc-entry {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    height: 32px;
    max-width: 11rem;
    padding: 0 0.6rem;
    background: transparent;
    border: 1px solid var(--st-hair-strong);
    border-radius: 999px;
    color: var(--st-text-2);
    font: inherit;
    font-size: 0.75rem;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
  }

  .acc-entry:hover:not(:disabled) { background: var(--st-surface-3); color: var(--st-text); }
  .acc-entry.on { border-color: var(--st-accent); color: var(--st-text); }
  .acc-entry:disabled { opacity: 0.6; cursor: default; }

  .acc-entry.signed { padding-left: 3px; }

  .acc-initials {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--st-accent) 22%, var(--st-surface-2));
    color: var(--st-text);
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.03em;
  }

  .acc-glyph { flex: none; }

  .acc-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 768px) {
    .acc-name { display: none; }
    .acc-entry { width: 32px; padding: 0; justify-content: center; }
    .acc-entry.signed { padding: 0; }
  }
</style>
