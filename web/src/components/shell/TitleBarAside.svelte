<script lang="ts">
  import { t } from '../../lib/i18n';
  import { shellLayout } from '../../lib/store/shell-layout.svelte';
  import { accountGate } from '../../lib/store/account-gate.svelte';
  import { authStore } from '../../lib/store/auth.svelte';
  import { feedbackDialog } from '../../lib/store/feedback-dialog.svelte';
  import Icon from '../ribbon/Icon.svelte';

  const ISSUES_URL = 'https://github.com/lambdaclass/stabileo/issues/new';

  const left = $derived(shellLayout.panelSide === 'left');
  const label = $derived(left ? t('appShell.panelRight') : t('appShell.panelLeft'));
  const inApp = $derived(__PUBLIC_FEATURES__.accounts && (authStore.isAuthenticated || authStore.userLoginEnabled));
</script>

<button
  class="ta-btn"
  onclick={() => shellLayout.toggle()}
  title={label}
  aria-label={label}
  data-testid="panel-side"
  data-side={shellLayout.panelSide}
><Icon name={left ? 'panelLeft' : 'panelRight'} size={17} /></button>

{#if inApp}
  <button
    class="ta-bug"
    onclick={() => accountGate.requireSignIn('feedback', () => (feedbackDialog.open = true))}
    title={t('appShell.reportBug')}
    data-testid="report-bug"
  ><Icon name="bug" size={15} /><span>{t('appShell.reportBug')}</span></button>
{:else}
  <a
    class="ta-bug"
    href={ISSUES_URL}
    target="_blank"
    rel="noopener noreferrer"
    title={t('appShell.reportBug')}
    data-testid="report-bug"
  ><Icon name="bug" size={15} /><span>{t('appShell.reportBug')}</span></a>
{/if}

<style>
  .ta-btn {
    width: 30px;
    height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    cursor: pointer;
  }

  .ta-btn:hover { background: var(--st-surface-2); color: var(--st-text); }

  .ta-bug {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 12px 0 10px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: 999px;
    color: var(--st-text);
    font: inherit;
    font-size: 0.78rem;
    white-space: nowrap;
    text-decoration: none;
    cursor: pointer;
  }

  .ta-bug:hover { background: var(--st-surface-3); }

  @media (max-width: 1100px) {
    .ta-bug span { display: none; }
    .ta-bug { padding: 0 7px; }
  }
</style>
