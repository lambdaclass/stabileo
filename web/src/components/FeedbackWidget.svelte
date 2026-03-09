<script lang="ts">
  import { generateShareURL } from '../lib/utils/url-sharing';
  import { uiStore } from '../lib/store';
  import { t } from '../lib/i18n';
  import { LEADERBOARD, LAST_UPDATED } from '../lib/data/leaderboard';

  // Turnstile site keys: test key for localhost, real key for production
  const TURNSTILE_SITE_KEY = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? '1x00000000000000000000AA'   // Cloudflare test key (always passes)
    : '0x4AAAAAACeNPq1ea7qrgJTe';  // Production site key from Cloudflare Turnstile

  // Feature flags
  const SHOW_TELEGRAM = false;
  const SHOW_CAFECITO = false;

  const TELEGRAM_URL = 'https://t.me/dedaliano';
  const CAFECITO_URL = 'https://cafecito.app/dedaliano';

  let isOpen = $state(false);
  let showForm = $state(false);
  let showLeaderboard = $state(false);
  let feedbackType = $state<'bug' | 'sugerencia' | 'otro'>('bug');
  let feedbackText = $state('');
  let feedbackName = $state('');
  let shareLink = $state('');
  let isSending = $state(false);
  let submitResult = $state<{ success: boolean; issueNumber?: number; url?: string; error?: string } | null>(null);

  // Turnstile state — turnstileFailed lets users submit even if Turnstile breaks
  let turnstileToken = $state('');
  let turnstileWidgetId = $state<string | null>(null);
  let turnstileFailed = $state(false);
  let turnstileContainer: HTMLDivElement;

  declare global {
    interface Window {
      turnstile?: {
        render: (container: HTMLElement, options: {
          sitekey: string;
          callback: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: () => void;
          theme?: 'dark' | 'light' | 'auto';
          size?: 'normal' | 'compact';
        }) => string;
        remove: (widgetId: string) => void;
        reset: (widgetId: string) => void;
      };
    }
  }

  function toggleOpen() {
    isOpen = !isOpen;
    if (!isOpen) {
      showForm = false;
      showLeaderboard = false;
      cleanupTurnstile();
    }
  }

  function openBugForm() {
    showForm = true;
    submitResult = null;
    // Auto-generate share link
    const result = generateShareURL();
    shareLink = result?.url ?? '';
    // Render Turnstile widget after DOM updates
    requestAnimationFrame(() => renderTurnstile());
  }

  function closeBugForm() {
    showForm = false;
    feedbackText = '';
    feedbackName = '';
    feedbackType = 'bug';
    submitResult = null;
    cleanupTurnstile();
  }

  function openLeaderboard() {
    showLeaderboard = true;
    showForm = false;
  }

  function closeLeaderboard() {
    showLeaderboard = false;
  }

  function renderTurnstile() {
    if (!turnstileContainer || !window.turnstile) {
      // Turnstile script didn't load — allow submission without it
      turnstileFailed = true;
      return;
    }
    cleanupTurnstile();
    try {
      turnstileWidgetId = window.turnstile.render(turnstileContainer, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: (token: string) => { turnstileToken = token; turnstileFailed = false; },
        'expired-callback': () => { turnstileToken = ''; },
        'error-callback': () => { turnstileToken = ''; turnstileFailed = true; },
        theme: 'dark',
        size: 'compact',
      });
    } catch {
      // Turnstile render failed — allow submission without it
      turnstileFailed = true;
    }
  }

  function cleanupTurnstile() {
    if (turnstileWidgetId && window.turnstile) {
      window.turnstile.remove(turnstileWidgetId);
    }
    turnstileWidgetId = null;
    turnstileToken = '';
  }

  async function submitFeedback() {
    if (!feedbackText.trim()) {
      uiStore.toast(t('feedback.toastEmptyText'), 'error');
      return;
    }
    if (!turnstileToken && !turnstileFailed) {
      uiStore.toast(t('feedback.toastSecurityWait'), 'error');
      return;
    }

    isSending = true;
    submitResult = null;

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: feedbackType,
          description: feedbackText,
          name: feedbackName.trim() || undefined,
          shareLink: shareLink || undefined,
          mode: uiStore.analysisMode.toUpperCase(),
          browser: navigator.userAgent,
          turnstileToken: turnstileToken || 'turnstile-bypass',
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        submitResult = { success: true, issueNumber: data.issueNumber, url: data.url };
        uiStore.toast(t('feedback.toastCreated').replace('{n}', String(data.issueNumber)), 'success');
        feedbackText = '';
        feedbackName = '';
      } else {
        submitResult = { success: false, error: data.error || t('error.unknown') };
        uiStore.toast(data.error || t('feedback.toastError'), 'error');
      }
    } catch (err) {
      submitResult = { success: false, error: t('feedback.toastConnectionError') };
      uiStore.toast(t('feedback.toastConnectionError'), 'error');
    } finally {
      isSending = false;
      // Reset turnstile for next submission
      if (turnstileWidgetId && window.turnstile) {
        window.turnstile.reset(turnstileWidgetId);
        turnstileToken = '';
      }
    }
  }

  function copyLink() {
    if (shareLink) {
      navigator.clipboard.writeText(shareLink);
      uiStore.toast(t('feedback.toastLinkCopied'), 'success');
    }
  }
</script>

<div class="feedback-widget" data-tour="feedback-widget" class:open={isOpen}>
  {#if isOpen}
    <!-- Invisible backdrop: click outside to close -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="feedback-backdrop" onclick={toggleOpen}></div>
    <div class="feedback-menu">
      {#if showForm}
        <!-- Bug report form -->
        <div class="feedback-form">
          <div class="form-header">
            <span class="form-title">{t('feedback.reportSuggest')}</span>
            <button class="form-close" onclick={closeBugForm}>&times;</button>
          </div>

          {#if submitResult?.success}
            <div class="success-message">
              <span class="success-icon">&#10003;</span>
              <span>{t('feedback.reportCreated').replace('{n}', String(submitResult.issueNumber))}</span>
            </div>
            <button class="form-submit" onclick={closeBugForm}>{t('feedback.close')}</button>
          {:else}
            <select class="form-select" bind:value={feedbackType}>
              <option value="bug">{t('feedback.bugError')}</option>
              <option value="sugerencia">{t('feedback.suggestion')}</option>
              <option value="otro">{t('feedback.other')}</option>
            </select>

            <input
              class="form-input"
              type="text"
              placeholder={t('feedback.namePlaceholder')}
              bind:value={feedbackName}
              maxlength={50}
            />

            <textarea
              class="form-textarea"
              placeholder={t('feedback.textPlaceholder')}
              bind:value={feedbackText}
              rows="4"
            ></textarea>

            {#if shareLink}
              <div class="auto-link">
                <span class="link-icon">&#128206;</span>
                <span class="link-label">{t('feedback.linkAttached')}</span>
                <button class="link-copy" onclick={copyLink} title={t('feedback.toastLinkCopied')}>{t('feedback.copy')}</button>
              </div>
            {/if}

            <div bind:this={turnstileContainer} style:display={turnstileToken || turnstileFailed ? 'none' : 'block'}></div>

            {#if submitResult?.error}
              <p class="error-hint">{submitResult.error}</p>
            {/if}

            <button
              class="form-submit"
              onclick={submitFeedback}
              disabled={isSending || !feedbackText.trim() || (!turnstileToken && !turnstileFailed)}
            >
              {isSending ? t('feedback.sending') : t('feedback.submitReport')}
            </button>
          {/if}
        </div>
      {:else if showLeaderboard}
        <!-- Leaderboard view -->
        <div class="feedback-form">
          <div class="form-header">
            <span class="form-title">{t('feedback.leaderboardTitle')}</span>
            <button class="form-close" onclick={closeLeaderboard}>&times;</button>
          </div>
          <p class="lb-description">{t('feedback.leaderboardDesc')}</p>
          {#if LEADERBOARD.filter(e => e.feedbacks > 0).length > 0}
            <div class="leaderboard-list">
              {#each LEADERBOARD.filter(e => e.feedbacks > 0) as entry}
                <div class="leaderboard-entry">
                  <span class="lb-badge">{entry.badge}</span>
                  <span class="lb-name">{entry.name}</span>
                  <span class="lb-count">{entry.feedbacks !== 1 ? t('feedback.reportCountPlural').replace('{n}', String(entry.feedbacks)) : t('feedback.reportCount').replace('{n}', String(entry.feedbacks))}</span>
                </div>
              {/each}
            </div>
          {:else}
            <p class="lb-empty">{t('feedback.leaderboardEmpty')}</p>
          {/if}
          <div class="lb-updated">{t('feedback.leaderboardUpdated').replace('{date}', LAST_UPDATED)}</div>
        </div>
      {:else}
        <!-- Menu options -->
        <button class="menu-item" onclick={openBugForm}>
          <span class="menu-icon">&#128027;</span>
          <span>{t('feedback.reportBug')}</span>
        </button>

        <button class="menu-item" onclick={openLeaderboard}>
          <span class="menu-icon">&#127942;</span>
          <span>{t('feedback.leaderboardTitle')}</span>
        </button>

        {#if SHOW_TELEGRAM}
          <a class="menu-item" href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer">
            <span class="menu-icon">&#128172;</span>
            <span>{t('feedback.communityTelegram')}</span>
          </a>
        {/if}

        {#if SHOW_CAFECITO}
          <a class="menu-item" href={CAFECITO_URL} target="_blank" rel="noopener noreferrer">
            <span class="menu-icon">&#9749;</span>
            <span>{t('feedback.buyCoffee')}</span>
          </a>
        {/if}
      {/if}
    </div>
  {/if}

  <button class="fab" onclick={toggleOpen} title="Feedback" aria-label="Feedback">
    {#if isOpen}
      <span class="fab-icon">&times;</span>
    {:else}
      <span class="fab-icon">&#128172;</span>
    {/if}
  </button>
</div>

<style>
  .feedback-widget {
    position: fixed;
    bottom: 1.25rem;
    right: 1.25rem;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.5rem;
  }

  .feedback-backdrop {
    position: fixed;
    inset: 0;
    z-index: -1;
  }

  .fab {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: #e94560;
    border: none;
    color: white;
    font-size: 1.25rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 12px rgba(233, 69, 96, 0.4);
    transition: all 0.2s;
  }

  .fab:hover {
    background: #d63854;
    transform: scale(1.08);
    box-shadow: 0 4px 16px rgba(233, 69, 96, 0.5);
  }

  .fab-icon {
    line-height: 1;
  }

  .feedback-menu {
    background: #1a2440;
    border: 1px solid #2a3a5a;
    border-radius: 10px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    min-width: 260px;
    max-width: 320px;
    overflow: hidden;
    animation: slideUp 0.15s ease-out;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.65rem 0.9rem;
    background: transparent;
    border: none;
    color: #ccc;
    font-size: 0.85rem;
    cursor: pointer;
    transition: background 0.15s;
    text-decoration: none;
    width: 100%;
    text-align: left;
  }

  .menu-item:hover {
    background: rgba(233, 69, 96, 0.1);
    color: #eee;
  }

  .menu-icon {
    font-size: 1.1rem;
    flex-shrink: 0;
  }

  /* Form styles */
  .feedback-form {
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .form-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .form-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: #ddd;
  }

  .form-close {
    background: transparent;
    border: none;
    color: #666;
    font-size: 1.1rem;
    cursor: pointer;
    padding: 0 0.2rem;
    line-height: 1;
  }

  .form-close:hover {
    color: #e94560;
  }

  .form-select {
    background: #0f1a30;
    border: 1px solid #2a3a5a;
    border-radius: 5px;
    color: #ccc;
    padding: 0.35rem 0.5rem;
    font-size: 0.8rem;
  }

  .form-textarea {
    background: #0f1a30;
    border: 1px solid #2a3a5a;
    border-radius: 5px;
    color: #ccc;
    padding: 0.4rem 0.5rem;
    font-size: 0.8rem;
    resize: vertical;
    min-height: 60px;
    font-family: inherit;
  }

  .form-input {
    background: #0f1a30;
    border: 1px solid #2a3a5a;
    border-radius: 5px;
    color: #ccc;
    padding: 0.35rem 0.5rem;
    font-size: 0.8rem;
    font-family: inherit;
  }

  .form-textarea:focus, .form-select:focus, .form-input:focus {
    outline: none;
    border-color: #e94560;
  }

  .auto-link {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    background: rgba(233, 69, 96, 0.08);
    border-radius: 5px;
    padding: 0.3rem 0.5rem;
    font-size: 0.72rem;
    color: #999;
  }

  .link-icon {
    flex-shrink: 0;
  }

  .link-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .link-copy {
    background: transparent;
    border: 1px solid #444;
    border-radius: 3px;
    color: #aaa;
    font-size: 0.65rem;
    cursor: pointer;
    padding: 0.1rem 0.3rem;
    flex-shrink: 0;
    transition: all 0.15s;
  }

  .link-copy:hover {
    border-color: #e94560;
    color: #e94560;
  }

  .form-submit {
    background: #e94560;
    border: none;
    border-radius: 5px;
    color: white;
    padding: 0.4rem 0.75rem;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }

  .form-submit:hover:not(:disabled) {
    background: #d63854;
  }

  .form-submit:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .success-message {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    background: rgba(78, 205, 196, 0.1);
    border: 1px solid rgba(78, 205, 196, 0.3);
    border-radius: 5px;
    padding: 0.5rem 0.6rem;
    font-size: 0.82rem;
    color: #4ecdc4;
  }

  .success-icon {
    font-size: 1rem;
    font-weight: bold;
  }

  .error-hint {
    font-size: 0.72rem;
    color: #e94560;
    margin: 0;
    line-height: 1.35;
  }

  /* Leaderboard */
  .leaderboard-list {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .leaderboard-entry {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.5rem;
    background: rgba(78, 205, 196, 0.06);
    border-radius: 5px;
    font-size: 0.82rem;
  }

  .lb-badge {
    font-size: 1.1rem;
    flex-shrink: 0;
  }

  .lb-name {
    flex: 1;
    color: #ddd;
  }

  .lb-count {
    font-family: 'Courier New', monospace;
    color: #4ecdc4;
    font-size: 0.72rem;
    white-space: nowrap;
  }

  .lb-description {
    color: #888;
    font-size: 0.72rem;
    line-height: 1.45;
    margin: 0;
    padding: 0 0.1rem 0.2rem;
  }

  .lb-empty {
    color: #666;
    font-size: 0.78rem;
    text-align: center;
    padding: 0.5rem;
    margin: 0;
    line-height: 1.5;
  }

  .lb-updated {
    font-size: 0.65rem;
    color: #555;
    text-align: right;
    padding-top: 0.3rem;
  }

  @media (max-width: 640px) {
    .feedback-widget {
      bottom: 0.75rem;
      right: 0.75rem;
    }
    .fab {
      width: 40px;
      height: 40px;
      font-size: 1.1rem;
    }
    .feedback-menu {
      min-width: 220px;
    }
  }
</style>
