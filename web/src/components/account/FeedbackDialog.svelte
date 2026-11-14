<script lang="ts">
  import { t } from '../../lib/i18n';
  import { errorText } from '../../lib/api/error-text';
  import { feedbackApi, type FeedbackKind } from '../../lib/api/feedback';
  import { feedbackDialog } from '../../lib/store/feedback-dialog.svelte';
  import { generateShareURL } from '../../lib/utils/url-sharing';
  import { APP_VERSION } from '../../lib/build-info';

  let kind = $state<FeedbackKind>('bug');
  let message = $state('');
  let attach = $state(false);
  let busy = $state(false);
  let result = $state<{ kind: 'ok' | 'bad'; text: string } | null>(null);

  function close() {
    feedbackDialog.open = false;
    result = null;
  }

  async function send(e: SubmitEvent) {
    e.preventDefault();
    if (busy || !message.trim()) return;
    busy = true;
    result = null;
    try {
      await feedbackApi.send({
        kind,
        message: message.trim(),
        page: location.pathname,
        app_version: APP_VERSION,
        model_link: attach ? generateShareURL()?.url : undefined,
      });
      message = '';
      attach = false;
      result = { kind: 'ok', text: t('feedbackForm.sent') };
    } catch (err) {
      result = { kind: 'bad', text: errorText(err) };
    } finally {
      busy = false;
    }
  }
</script>

{#if feedbackDialog.open}
  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <div class="fb-overlay" onclick={close} onkeydown={(e) => e.key === 'Escape' && close()}>
    <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
    <div class="fb" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1" aria-labelledby="fb-title" data-testid="feedback-dialog">
    <form class="fb-form" onsubmit={send} novalidate>
      <h3 id="fb-title">{t('feedbackForm.section')}</h3>
      <p class="lede">{t('feedbackForm.lede')}</p>
      <label class="field">
        <span>{t('feedbackForm.kind')}</span>
        <select bind:value={kind} data-testid="feedback-kind">
          {#each ['bug', 'idea', 'question', 'other'] as k (k)}
            <option value={k}>{t(`feedbackForm.kind.${k}`)}</option>
          {/each}
        </select>
      </label>
      <label class="field">
        <span>{t('feedbackForm.message')}</span>
        <!-- svelte-ignore a11y_autofocus -->
        <textarea rows="5" bind:value={message} maxlength="4000" autofocus data-testid="feedback-message"></textarea>
      </label>
      <label class="check">
        <input type="checkbox" bind:checked={attach} data-testid="feedback-attach" />
        <span>{t('feedbackForm.attachModel')}</span>
      </label>
      {#if result}<p class="msg" class:bad={result.kind === 'bad'} role="status" data-testid="feedback-msg">{result.text}</p>{/if}
      <div class="footer">
        <button type="button" class="btn" onclick={close}>{t('account.close')}</button>
        <button type="submit" class="btn primary" disabled={busy || !message.trim()} data-testid="feedback-send">
          {busy ? t('account.working') : t('feedbackForm.send')}
        </button>
      </div>
    </form>
    </div>
  </div>
{/if}

<style>
  .fb-overlay {
    position: fixed;
    inset: 0;
    z-index: 220;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--st-bg) 72%, transparent);
  }
  .fb {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: min(440px, calc(100vw - 32px));
    max-height: calc(100vh - 48px);
    overflow-y: auto;
    padding: 18px;
    background: var(--st-surface);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    box-shadow: 0 8px 32px rgb(0 0 0 / 0.35);
    color: var(--st-text);
  }
  .fb-form { display: flex; flex-direction: column; gap: 10px; }
  h3 { margin: 0; font-size: 0.95rem; font-weight: 600; }
  .lede { margin: -4px 0 4px; font-size: 0.72rem; line-height: 1.5; color: var(--st-text-3); }
  .field { display: flex; flex-direction: column; gap: 4px; font-size: 0.64rem; color: var(--st-text-3); }
  .field select, .field textarea {
    padding: 6px 8px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    color: var(--st-text);
    font: inherit;
    font-size: 0.78rem;
  }
  .field textarea { resize: vertical; }
  .check { display: flex; gap: 8px; align-items: flex-start; font-size: 0.72rem; color: var(--st-text-2); }
  .msg { margin: 0; font-size: 0.72rem; color: var(--st-text-2); }
  .msg.bad { color: var(--st-bad, #e06c75); }
  .footer { display: flex; justify-content: flex-end; gap: 6px; padding-top: 10px; border-top: 1px solid var(--st-hair); }
  .btn {
    padding: 6px 11px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    font-size: 0.72rem;
    cursor: pointer;
  }
  .btn:hover:not(:disabled) { background: var(--st-surface-3); color: var(--st-text); }
  .btn:disabled { opacity: 0.45; cursor: default; }
  .btn.primary {
    background: color-mix(in srgb, var(--st-accent) 18%, var(--st-surface-2));
    border-color: color-mix(in srgb, var(--st-accent) 55%, transparent);
    color: var(--st-text);
    font-weight: 600;
  }
</style>
