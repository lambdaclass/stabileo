<script lang="ts">
  import { onMount } from 'svelte';
  import { adminSettings } from './admin-settings.svelte';
  import { adminErrorText } from './error-text';
  import { t } from '../lib/i18n';
  import type { AdminFlag } from '../lib/api/admin';

  const EXTRA_FLAGS: { key: AdminFlag; label: string; help: string; testid: string }[] = [
    { key: 'usage_telemetry_enabled', label: 'admin.settings.usageTelemetry', help: 'admin.settings.usageTelemetryHelp', testid: 'admin-settings-usage' },
    { key: 'cloud_projects_enabled', label: 'admin.settings.cloudProjects', help: 'admin.settings.cloudProjectsHelp', testid: 'admin-settings-projects' },
    { key: 'save_requires_account', label: 'admin.settings.saveRequiresAccount', help: 'admin.settings.saveRequiresAccountHelp', testid: 'admin-settings-save-account' },
  ];

  onMount(() => {
    void adminSettings.load();
  });

  function onToggle(e: Event) {
    void adminSettings.setUserLoginEnabled((e.currentTarget as HTMLInputElement).checked);
  }
</script>

<section class="adm-settings" aria-labelledby="adm-settings-title">
  <h1 id="adm-settings-title" class="adm-h1">{t('admin.settings.title')}</h1>

  {#if adminSettings.loadError}
    <div class="adm-banner" role="alert" data-testid="admin-settings-error">
      <span>{adminErrorText(adminSettings.loadError)}</span>
      <button type="button" class="adm-btn" onclick={() => adminSettings.load()}>{t('admin.users.retry')}</button>
    </div>
  {/if}

  {#if !adminSettings.settings}
    {#if adminSettings.loading}<p class="adm-muted">{t('admin.loading')}</p>{/if}
  {:else}
    <div class="adm-card">
      <label class="adm-toggle">
        <input
          type="checkbox"
          role="switch"
          checked={adminSettings.userLoginEnabled}
          disabled={adminSettings.saving}
          onchange={onToggle}
          data-testid="admin-settings-user-login"
        />
        <span class="adm-toggle-label">{t('admin.settings.userLogin')}</span>
        <span class="adm-badge" class:off={!adminSettings.settings.user_login_enabled} data-testid="admin-settings-state">
          {adminSettings.settings.user_login_enabled ? t('admin.settings.on') : t('admin.settings.off')}
        </span>
      </label>
      <p class="adm-help">{t('admin.settings.userLoginHelp')}</p>
    </div>

    {#each EXTRA_FLAGS as flag (flag.key)}
      <div class="adm-card">
        <label class="adm-toggle">
          <input
            type="checkbox"
            role="switch"
            checked={adminSettings.flag(flag.key)}
            disabled={adminSettings.saving}
            onchange={(e) => adminSettings.setFlag(flag.key, e.currentTarget.checked)}
            data-testid={flag.testid}
          />
          <span class="adm-toggle-label">{t(flag.label)}</span>
          <span class="adm-badge" class:off={!adminSettings.flag(flag.key)}>
            {adminSettings.flag(flag.key) ? t('admin.settings.on') : t('admin.settings.off')}
          </span>
        </label>
        <p class="adm-help">{t(flag.help)}</p>
      </div>
    {/each}

    {#if adminSettings.settings.terms_version}
      <div class="adm-card">
        <span class="adm-toggle-label">{t('admin.settings.termsVersion')}</span>
        <p class="adm-help"><code>{adminSettings.settings.terms_version}</code> · {t('admin.settings.termsVersionHelp')}</p>
      </div>
    {/if}

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

<style>
  .adm-settings { display: flex; flex-direction: column; gap: 12px; max-width: 640px; }
  .adm-h1 { margin: 0; font-family: var(--st-display); font-size: 1.25rem; font-weight: 600; color: var(--st-text); }

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
