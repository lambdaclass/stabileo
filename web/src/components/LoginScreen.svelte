<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '../lib/store/auth.svelte';
  import { t } from '../lib/i18n';

  // Google OAuth Client ID — set via environment variable at build time
  const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

  let googleBtnRef: HTMLDivElement;
  let gsiError = $state(false);

  onMount(() => {
    if (!GOOGLE_CLIENT_ID) {
      console.warn('VITE_GOOGLE_CLIENT_ID not set — auth disabled');
      authStore.setReady();
      return;
    }

    // Wait for GSI script to load
    const initGsi = () => {
      if (typeof google === 'undefined' || !google.accounts?.id) {
        // Script not loaded yet, retry
        setTimeout(initGsi, 200);
        return;
      }

      try {
        google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => {
            authStore.handleCredential(response.credential);
          },
          auto_select: true,
        });

        if (googleBtnRef) {
          google.accounts.id.renderButton(googleBtnRef, {
            theme: 'filled_black',
            size: 'large',
            width: 300,
            text: 'signin_with',
            shape: 'pill',
            logo_alignment: 'left',
          });
        }

        // Try auto-select (One Tap)
        google.accounts.id.prompt();
      } catch (e) {
        console.error('GSI init error:', e);
        gsiError = true;
      }

      authStore.setReady();
    };

    initGsi();
  });
</script>

<div class="login-screen">
  <div class="login-card">
    <div class="login-logo">
      <span class="login-icon">△</span>
      <span class="login-title">Dedaliano</span>
    </div>
    <p class="login-subtitle">{t('auth.subtitle')}</p>

    <div class="login-divider"></div>

    {#if GOOGLE_CLIENT_ID}
      <div class="google-btn-wrapper" bind:this={googleBtnRef}></div>
      {#if gsiError}
        <p class="login-error">{t('auth.error')}</p>
      {/if}
    {:else}
      <p class="login-dev-notice">{t('auth.devMode')}</p>
    {/if}

    <p class="login-footer">{t('auth.footer')}</p>
  </div>
</div>

<style>
  .login-screen {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #1a1a2e;
  }

  .login-card {
    background: #16213e;
    border: 1px solid #0f3460;
    border-radius: 12px;
    padding: 2.5rem 3rem;
    text-align: center;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    max-width: 400px;
    width: 90%;
  }

  .login-logo {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .login-icon {
    font-size: 2.5rem;
    color: #e94560;
  }

  .login-title {
    font-size: 2rem;
    font-weight: 700;
    color: #eee;
    letter-spacing: 0.05em;
  }

  .login-subtitle {
    color: #888;
    font-size: 0.9rem;
    margin-bottom: 1.5rem;
    line-height: 1.5;
  }

  .login-divider {
    height: 1px;
    background: #0f3460;
    margin-bottom: 1.5rem;
  }

  .google-btn-wrapper {
    display: flex;
    justify-content: center;
    margin-bottom: 1.5rem;
    min-height: 44px;
  }

  .login-error {
    color: #e94560;
    font-size: 0.8rem;
    margin-bottom: 1rem;
  }

  .login-dev-notice {
    color: #4ecdc4;
    font-size: 0.8rem;
    background: rgba(78, 205, 196, 0.1);
    border: 1px solid rgba(78, 205, 196, 0.2);
    border-radius: 6px;
    padding: 0.75rem;
    margin-bottom: 1.5rem;
  }

  .login-footer {
    color: #555;
    font-size: 0.7rem;
    line-height: 1.4;
  }

  @media (max-width: 480px) {
    .login-card {
      padding: 2rem 1.5rem;
    }
    .login-title {
      font-size: 1.5rem;
    }
    .login-icon {
      font-size: 2rem;
    }
  }
</style>
