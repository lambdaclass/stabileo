<script lang="ts">
  import { untrack } from 'svelte';
  import { authStore } from '../../lib/store/auth.svelte';
  import { errorText, fieldErrors } from '../../lib/api/error-text';
  import { t, tp, i18n, OFFERED_LOCALES, isOfferedLocale } from '../../lib/i18n';
  import LocaleSelect from '../LocaleSelect.svelte';

  let { open = $bindable(false) }: { open?: boolean } = $props();

  let name = $state('');
  let company = $state('');
  let jobTitle = $state('');
  let country = $state('');
  let locale = $state<string>('es');
  let saving = $state(false);
  let profileMsg = $state<{ kind: 'ok' | 'bad'; text: string } | null>(null);
  let profileFields = $state<Record<string, string>>({});

  let currentPassword = $state('');
  let newPassword = $state('');
  let changing = $state(false);
  let passwordMsg = $state<{ kind: 'ok' | 'bad'; text: string } | null>(null);
  let passwordFields = $state<Record<string, string>>({});

  $effect(() => {
    if (!open) return;
    untrack(() => {
      const a = authStore.account;
      name = a?.name ?? '';
      company = a?.company ?? '';
      jobTitle = a?.job_title ?? '';
      country = a?.country ?? '';
      locale = a && isOfferedLocale(a.locale) ? a.locale : 'es';
      profileMsg = null;
      profileFields = {};
      passwordMsg = null;
      passwordFields = {};
      currentPassword = '';
      newPassword = '';
    });
  });

  const countryCode = $derived(country.trim().toUpperCase());

  const countryName = $derived.by(() => {
    if (!/^[A-Z]{2}$/.test(countryCode)) return '';
    try {
      const label = new Intl.DisplayNames([i18n.locale], { type: 'region' }).of(countryCode);
      return label && label !== countryCode ? label : '';
    } catch {
      return '';
    }
  });

  const blankToNull = (v: string) => (v.trim() === '' ? null : v.trim());

  function close() {
    open = false;
  }

  async function saveProfile(e: SubmitEvent) {
    e.preventDefault();
    if (saving) return;
    saving = true;
    profileMsg = null;
    profileFields = {};
    try {
      await authStore.updateProfile({
        name: name.trim(),
        company: blankToNull(company),
        job_title: blankToNull(jobTitle),
        country: countryCode === '' ? null : countryCode,
        locale,
      });
      profileMsg = { kind: 'ok', text: t('account.saved') };
    } catch (err) {
      profileFields = fieldErrors(err);
      profileMsg = {
        kind: 'bad',
        text: Object.keys(profileFields).length ? t('account.err.validation_error') : errorText(err),
      };
      if (!authStore.isAuthenticated) close();
    } finally {
      saving = false;
    }
  }

  async function changePassword(e: SubmitEvent) {
    e.preventDefault();
    if (changing) return;
    changing = true;
    passwordMsg = null;
    passwordFields = {};
    try {
      await authStore.changePassword(currentPassword, newPassword);
      currentPassword = '';
      newPassword = '';
      passwordMsg = { kind: 'ok', text: t('account.passwordChanged') };
    } catch (err) {
      passwordFields = fieldErrors(err);
      passwordMsg = {
        kind: 'bad',
        text: Object.keys(passwordFields).length ? t('account.err.validation_error') : errorText(err),
      };
      if (!authStore.isAuthenticated) close();
    } finally {
      changing = false;
    }
  }

  async function logout() {
    close();
    await authStore.logout();
  }
</script>

{#if open && authStore.account}
  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <div class="acc-overlay" onclick={close} onkeydown={(e) => e.key === 'Escape' && close()}>
    <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
    <div
      class="acc"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      aria-labelledby="acc-profile-title"
      data-testid="profile-dialog"
    >
      <h3 class="acc-title" id="acc-profile-title">{t('account.profileTitle')}</h3>
      <p class="acc-lede">{tp('account.signedInAs', { email: authStore.account.email })}</p>

      <form class="acc-section" onsubmit={saveProfile} novalidate>
        <h4 class="acc-section-head">{t('account.profileSection')}</h4>

        <label class="acc-field">
          <span class="acc-label">{t('account.name')}</span>
          <input type="text" bind:value={name} autocomplete="name" class:bad={profileFields.name} data-testid="profile-name" />
          {#if profileFields.name}<span class="acc-field-err">{profileFields.name}</span>{/if}
        </label>

        <div class="acc-row">
          <label class="acc-field">
            <span class="acc-label">{t('account.company')}</span>
            <input type="text" bind:value={company} autocomplete="organization" class:bad={profileFields.company} data-testid="profile-company" />
            {#if profileFields.company}<span class="acc-field-err">{profileFields.company}</span>{/if}
          </label>
          <label class="acc-field">
            <span class="acc-label">{t('account.jobTitle')}</span>
            <input type="text" bind:value={jobTitle} autocomplete="organization-title" class:bad={profileFields.job_title} data-testid="profile-job-title" />
            {#if profileFields.job_title}<span class="acc-field-err">{profileFields.job_title}</span>{/if}
          </label>
        </div>

        <div class="acc-row">
          <label class="acc-field">
            <span class="acc-label">{t('account.country')}</span>
            <input
              type="text" bind:value={country} maxlength="2" autocomplete="country"
              placeholder="AR" class="acc-country" class:bad={profileFields.country}
              data-testid="profile-country"
            />
            {#if profileFields.country}
              <span class="acc-field-err">{profileFields.country}</span>
            {:else}
              <span class="acc-hint">{countryName || t('account.countryHint')}</span>
            {/if}
          </label>
          <div class="acc-field">
            <span class="acc-label">{t('account.locale')}</span>
            <LocaleSelect
              value={locale}
              options={OFFERED_LOCALES}
              label={(c) => t(`lang.${c}`)}
              onChange={(c) => (locale = c)}
              ariaLabel={t('account.locale')}
              testid="profile-locale"
            />
            {#if profileFields.locale}<span class="acc-field-err">{profileFields.locale}</span>{/if}
          </div>
        </div>

        {#if profileMsg}
          <p class="acc-msg" class:bad={profileMsg.kind === 'bad'} role="status" data-testid="profile-msg">{profileMsg.text}</p>
        {/if}

        <div class="acc-actions">
          <button type="submit" class="acc-btn acc-primary" disabled={saving} data-testid="profile-save">
            {saving ? t('account.working') : t('account.save')}
          </button>
        </div>
      </form>

      <form class="acc-section" onsubmit={changePassword} novalidate>
        <h4 class="acc-section-head">{t('account.passwordSection')}</h4>
        <div class="acc-row">
          <label class="acc-field">
            <span class="acc-label">{t('account.currentPassword')}</span>
            <input
              type="password" bind:value={currentPassword} autocomplete="current-password"
              class:bad={passwordFields.current_password} data-testid="password-current"
            />
            {#if passwordFields.current_password}<span class="acc-field-err">{passwordFields.current_password}</span>{/if}
          </label>
          <label class="acc-field">
            <span class="acc-label">{t('account.newPassword')}</span>
            <input
              type="password" bind:value={newPassword} autocomplete="new-password"
              class:bad={passwordFields.password} data-testid="password-new"
            />
            {#if passwordFields.password}
              <span class="acc-field-err">{passwordFields.password}</span>
            {:else}
              <span class="acc-hint">{t('account.passwordHint')}</span>
            {/if}
          </label>
        </div>

        {#if passwordMsg}
          <p class="acc-msg" class:bad={passwordMsg.kind === 'bad'} role="status" data-testid="password-msg">{passwordMsg.text}</p>
        {/if}

        <div class="acc-actions">
          <button
            type="submit" class="acc-btn"
            disabled={changing || !currentPassword || !newPassword}
            data-testid="password-submit"
          >{changing ? t('account.working') : t('account.changePassword')}</button>
        </div>
      </form>

      <div class="acc-footer">
        <button type="button" class="acc-btn acc-quiet" onclick={logout} data-testid="account-logout">
          {t('account.logout')}
        </button>
        <button type="button" class="acc-btn" onclick={close}>{t('account.close')}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .acc-overlay {
    position: fixed;
    inset: 0;
    background: color-mix(in srgb, var(--st-bg) 72%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
  }

  .acc {
    width: min(520px, calc(100vw - 32px));
    max-height: calc(100vh - 48px);
    overflow-y: auto;
    padding: 18px;
    background: var(--st-surface);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    box-shadow: 0 8px 32px rgb(0 0 0 / 0.35);
  }

  .acc-title { margin: 0 0 4px; font-size: 0.95rem; font-weight: 600; color: var(--st-text); }
  .acc-lede { margin: 0 0 14px; font-size: 0.72rem; line-height: 1.5; color: var(--st-text-3); }

  .acc-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 16px;
  }

  .acc-section-head {
    margin: 0;
    font-size: 0.68rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--st-text-2);
  }

  .acc-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

  @media (max-width: 480px) {
    .acc-row { grid-template-columns: 1fr; }
  }

  .acc-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }

  .acc-label { font-size: 0.64rem; color: var(--st-text-3); }

  .acc-field input {
    padding: 6px 8px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    color: var(--st-text);
    font: inherit;
    font-size: 0.78rem;
  }

  .acc-field input:focus { outline: none; border-color: var(--st-accent); }
  .acc-field input.bad { border-color: var(--st-bad, #e06c75); }
  .acc-field input.acc-country { width: 5em; text-transform: uppercase; font-family: var(--st-mono, monospace); }

  .acc-field :global(.ls-btn) { height: 31px; }

  .acc-hint { font-size: 0.62rem; color: var(--st-text-3); }
  .acc-field-err { font-size: 0.64rem; color: var(--st-bad, #e06c75); }

  .acc-msg { margin: 0; font-size: 0.7rem; color: var(--st-text-2); }
  .acc-msg.bad { color: var(--st-bad, #e06c75); }

  .acc-actions { display: flex; justify-content: flex-end; }

  .acc-footer {
    display: flex;
    justify-content: space-between;
    gap: 6px;
    padding-top: 12px;
    border-top: 1px solid var(--st-hair);
  }

  .acc-btn {
    padding: 6px 11px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    font-size: 0.72rem;
    cursor: pointer;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
  }

  .acc-btn:hover:not(:disabled) { background: var(--st-surface-3); color: var(--st-text); }
  .acc-btn:disabled { opacity: 0.45; cursor: default; }

  .acc-primary {
    background: color-mix(in srgb, var(--st-accent) 18%, var(--st-surface-2));
    border-color: color-mix(in srgb, var(--st-accent) 55%, transparent);
    color: var(--st-text);
    font-weight: 600;
  }

  .acc-quiet { color: var(--st-text-3); }
</style>
