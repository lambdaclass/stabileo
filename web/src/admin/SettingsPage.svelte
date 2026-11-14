<script lang="ts">
  import { onMount } from 'svelte';
  import { adminSettings } from './admin-settings.svelte';
  import { adminErrorText } from './error-text';
  import { adminRoute } from './admin-route.svelte';
  import { productUrl } from './product-url';
  import { t, tp, i18n } from '../lib/i18n';
  import { legalHref, TERMS_PATH, PRIVACY_PATH, USAGE_DATA_PATH } from '../lib/legal/legal';
  import type { AdminFlag } from '../lib/api/admin';

  const ACCOUNT_FEATURES: { key: AdminFlag; label: string; help: string; testid: string }[] = [
    { key: 'cloud_projects_enabled', label: 'admin.settings.cloudProjects', help: 'admin.settings.cloudProjectsHelp', testid: 'admin-settings-projects' },
    { key: 'save_requires_account', label: 'admin.settings.saveRequiresAccount', help: 'admin.settings.saveRequiresAccountHelp', testid: 'admin-settings-save-account' },
  ];

  let limitDraft = $state<number | null>(null);
  const limit = $derived(limitDraft ?? adminSettings.projectLimit);
  const limitChanged = $derived(limitDraft !== null && limitDraft !== adminSettings.projectLimit);
  const limitValid = $derived(Number.isInteger(limit) && limit >= 1 && limit <= 100);
  const loginOn = $derived(adminSettings.flag('user_login_enabled'));

  onMount(() => {
    void adminSettings.load();
  });

  async function saveLimit() {
    if (!limitValid || limitDraft === null) return;
    if (await adminSettings.setProjectLimit(limitDraft)) limitDraft = null;
  }

  const legal = (path: string) => `${productUrl()}${legalHref(path, i18n.locale)}`;
</script>

<section class="adm-settings" aria-labelledby="adm-settings-title">
  <h1 id="adm-settings-title" class="adm-h1">{t('admin.settings.title')}</h1>
  <p class="adm-lede">{t('admin.settings.lede')}</p>

  {#if adminSettings.loadError}
    <div class="adm-banner" role="alert" data-testid="admin-settings-error">
      <span>{adminErrorText(adminSettings.loadError)}</span>
      <button type="button" class="adm-btn" onclick={() => adminSettings.load()}>{t('admin.users.retry')}</button>
    </div>
  {/if}

  {#if !adminSettings.settings}
    {#if adminSettings.loading}<p class="adm-muted">{t('admin.loading')}</p>{/if}
  {:else}
    <h2 class="adm-h2">{t('admin.settings.secAccounts')}</h2>
    <div class="adm-card">
      {@render toggle('user_login_enabled', 'admin.settings.userLogin', 'admin-settings-user-login')}
      <p class="adm-help">{t('admin.settings.userLoginHelp')}</p>

      <div class="adm-deps" class:idle={!loginOn} data-testid="admin-settings-deps">
        {#if !loginOn}<p class="adm-note" data-testid="admin-settings-deps-idle">{t('admin.settings.depsIdle')}</p>{/if}
        {#each ACCOUNT_FEATURES as f (f.key)}
          <div class="adm-dep">
            {@render toggle(f.key, f.label, f.testid)}
            <p class="adm-help">{t(f.help)}</p>
            {#if f.key === 'cloud_projects_enabled'}
              <label class="adm-limit">
                <span>{t('admin.settings.projectLimit')}</span>
                <input
                  type="number" min="1" max="100" step="1" value={limit}
                  oninput={(e) => (limitDraft = Number(e.currentTarget.value))}
                  disabled={adminSettings.saving}
                  aria-invalid={!limitValid}
                  data-testid="admin-settings-project-limit"
                />
                <button type="button" class="adm-btn" onclick={saveLimit} disabled={!limitChanged || !limitValid || adminSettings.saving} data-testid="admin-settings-project-limit-save">
                  {t('admin.settings.saveLimit')}
                </button>
              </label>
              <p class="adm-help">{tp('admin.settings.projectLimitHelp', { n: adminSettings.projectLimit })}</p>
            {/if}
          </div>
        {/each}
      </div>
    </div>

    <h2 class="adm-h2">{t('admin.settings.secUsage')}</h2>
    <div class="adm-card">
      {@render toggle('usage_telemetry_enabled', 'admin.settings.usageTelemetry', 'admin-settings-usage')}
      <p class="adm-help">{t('admin.settings.usageTelemetryHelp')}</p>
      <button type="button" class="adm-link" onclick={() => adminRoute.navigate('metrics')}>{t('admin.settings.seeMetrics')}</button>
    </div>

    <h2 class="adm-h2">{t('admin.settings.secLegal')}</h2>
    <div class="adm-card">
      {#if adminSettings.settings.terms_version}
        <span class="adm-toggle-label">{t('admin.settings.termsVersion')}: <code>{adminSettings.settings.terms_version}</code></span>
      {/if}
      <p class="adm-help">{t('admin.settings.termsVersionHelp')}</p>
      <p class="adm-help adm-links">
        <a href={legal(TERMS_PATH)} target="_blank" rel="noopener noreferrer">{t('legal.termsLink')}</a> ·
        <a href={legal(PRIVACY_PATH)} target="_blank" rel="noopener noreferrer">{t('legal.privacyLink')}</a> ·
        <a href={legal(USAGE_DATA_PATH)} target="_blank" rel="noopener noreferrer">{t('usage.whatIsSent')}</a>
      </p>
    </div>

    <div class="adm-status">
      {#if adminSettings.saving}
        <p class="adm-muted" role="status" data-testid="admin-settings-saving">{t('admin.settings.saving')}</p>
      {:else if adminSettings.saveError}
        <p class="adm-error" role="alert" data-testid="admin-settings-save-error">{adminErrorText(adminSettings.saveError)}</p>
      {:else if adminSettings.savedAt}
        <p class="adm-done" role="status" data-testid="admin-settings-saved">{t('admin.settings.saved')}</p>
      {/if}
    </div>
  {/if}
</section>

{#snippet toggle(key: AdminFlag, label: string, testid: string)}
  <label class="adm-toggle">
    <input
      type="checkbox"
      role="switch"
      checked={adminSettings.flag(key)}
      disabled={adminSettings.saving}
      onchange={(e) => adminSettings.setFlag(key, e.currentTarget.checked)}
      data-testid={testid}
    />
    <span class="adm-toggle-label">{t(label)}</span>
    <span class="adm-badge" class:off={!adminSettings.flag(key)} data-testid={key === 'user_login_enabled' ? 'admin-settings-state' : undefined}>
      {adminSettings.flag(key) ? t('admin.settings.on') : t('admin.settings.off')}
    </span>
  </label>
{/snippet}

<style>
  .adm-settings { display: flex; flex-direction: column; gap: 12px; max-width: 640px; }
  .adm-h1 { margin: 0; font-family: var(--st-display); font-size: 1.25rem; font-weight: 600; color: var(--st-text); }
  .adm-h2 { margin: 10px 0 0; font-size: 0.92rem; font-weight: 600; color: var(--st-text); }
  .adm-lede { margin: 0; font-size: 0.8rem; line-height: 1.5; color: var(--st-text-2); }
  .adm-deps { display: flex; flex-direction: column; gap: 12px; margin-top: 4px; padding: 10px 0 0 18px; border-top: 1px solid var(--st-hair); border-left: 2px solid var(--st-hair-strong); }
  .adm-deps.idle .adm-dep { opacity: 0.55; }
  .adm-dep { display: flex; flex-direction: column; gap: 6px; }
  .adm-note { margin: 0; padding: 6px 9px; background: var(--st-surface-2); border-left: 2px solid var(--st-accent); font-size: 0.76rem; color: var(--st-text); }
  .adm-limit { display: flex; align-items: center; gap: 8px; font-size: 0.8rem; color: var(--st-text); }
  .adm-limit input { width: 5em; padding: 4px 6px; background: var(--st-surface-2); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); color: var(--st-text); font: inherit; }
  .adm-limit input[aria-invalid='true'] { border-color: var(--st-danger); }
  .adm-links a, .adm-link { color: var(--st-interactive, var(--st-accent)); }
  .adm-link { align-self: flex-start; padding: 0; background: none; border: none; font: inherit; font-size: 0.76rem; cursor: pointer; text-decoration: underline; }

  .adm-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px 16px;
    background: var(--st-surface);
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius-lg);
  }

  .adm-toggle { display: flex; align-items: center; gap: 10px; cursor: pointer; }
  .adm-toggle input { width: 16px; height: 16px; accent-color: var(--st-accent); }
  .adm-toggle-label { flex: 1; font-size: 0.88rem; font-weight: 600; color: var(--st-text); }

  .adm-help { margin: 0; font-size: 0.78rem; line-height: 1.5; color: var(--st-text-2); }
  .adm-muted { margin: 0; font-size: 0.76rem; color: var(--st-text-2); }
  .adm-error { margin: 0; font-size: 0.78rem; color: var(--st-danger); }

  .adm-done {
    margin: 0;
    padding: 6px 9px;
    border-left: 2px solid var(--st-ok);
    background: var(--st-surface-2);
    font-size: 0.78rem;
    color: var(--st-text);
  }

  .adm-badge {
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--st-ok) 55%, transparent);
    background: color-mix(in srgb, var(--st-ok) 14%, transparent);
    color: var(--st-ok);
    font-size: 0.68rem;
    font-weight: 600;
    white-space: nowrap;
  }

  .adm-badge.off {
    border-color: color-mix(in srgb, var(--st-danger) 55%, transparent);
    background: var(--st-danger-bg);
    color: var(--st-danger);
  }

  .adm-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 10px;
    background: var(--st-danger-bg);
    border-left: 2px solid var(--st-danger);
    font-size: 0.8rem;
    color: var(--st-text);
  }

  .adm-btn {
    padding: 5px 11px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    font-size: 0.76rem;
    cursor: pointer;
  }

  .adm-btn:hover:not(:disabled) { background: var(--st-surface-3); color: var(--st-text); }
</style>
