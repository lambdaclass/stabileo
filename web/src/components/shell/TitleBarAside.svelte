<script lang="ts">
  import { t } from '../../lib/i18n';
  import { shellLayout } from '../../lib/store/shell-layout.svelte';
  import { accountGate } from '../../lib/store/account-gate.svelte';
  import { authStore } from '../../lib/store/auth.svelte';
  import { feedbackDialog } from '../../lib/store/feedback-dialog.svelte';
  import { SOCIAL_LINKS, SOCIAL_ICONS } from '../../lib/contact/channels';
  import Icon from '../ribbon/Icon.svelte';

  const DISCORD = SOCIAL_LINKS.find((l) => l.id === 'discord')!.href;

  const left = $derived(shellLayout.panelSide === 'left');
  const label = $derived(left ? t('appShell.panelRight') : t('appShell.panelLeft'));
  const canSendFeedback = $derived(__PUBLIC_FEATURES__.accounts && (authStore.isAuthenticated || authStore.userLoginEnabled));
</script>

<button
  class="ta-btn"
  onclick={() => shellLayout.toggle()}
  title={label}
  aria-label={label}
  data-testid="panel-side"
  data-side={shellLayout.panelSide}
><Icon name={left ? 'panelLeft' : 'panelRight'} size={17} /></button>

<a
  class="ta-pill ta-discord"
  href={DISCORD}
  target="_blank"
  rel="noopener noreferrer"
  title={t('appShell.discord')}
  aria-label={t('appShell.discord')}
  data-testid="tb-discord"
><span class="ta-mark" aria-hidden="true">{@html SOCIAL_ICONS.discord}</span><span class="ta-label">Discord</span></a>

{#if canSendFeedback}
  <button
    class="ta-pill ta-feedback"
    onclick={() => accountGate.requireSignIn('feedback', () => (feedbackDialog.open = true))}
    title={t('appShell.feedbackTip')}
    data-testid="tb-feedback"
  ><Icon name="message" size={15} /><span class="ta-label">{t('feedbackForm.open')}</span></button>
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

  .ta-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 12px 0 10px;
    border-radius: 999px;
    font: inherit;
    font-size: 0.78rem;
    white-space: nowrap;
    text-decoration: none;
    cursor: pointer;
  }

  .ta-mark { display: inline-flex; }

  .ta-discord {
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    color: var(--st-text-2);
  }

  .ta-discord:hover { background: color-mix(in srgb, #5865f2 22%, var(--st-surface-2)); border-color: #5865f2; color: var(--st-text); }

  .ta-feedback {
    background: color-mix(in srgb, var(--st-accent) 16%, var(--st-surface-2));
    border: 1px solid color-mix(in srgb, var(--st-accent) 60%, transparent);
    color: var(--st-text);
    font-weight: 600;
  }

  .ta-feedback:hover { background: color-mix(in srgb, var(--st-accent) 28%, var(--st-surface-2)); }

  @media (max-width: 1280px) {
    .ta-discord .ta-label { display: none; }
    .ta-discord { padding: 0 7px; }
  }

  @media (max-width: 1100px) {
    .ta-feedback .ta-label { display: none; }
    .ta-feedback { padding: 0 7px; }
  }
</style>
