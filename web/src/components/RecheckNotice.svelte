<script lang="ts">
  import { saveWorkspaceToLocalStorage } from '../lib/store/file';
  import { recheckStore } from '../lib/store/recheck.svelte';
  import { rerunAnalysisAndDesign, recheckKey } from '../lib/actions/recheck';
  import { changelogUrl, type Locale3, type ResultChange } from '../lib/provenance/registry';
  import { captureFocus, cycleTabWithin } from '../lib/utils/dialog-focus';
  import { t, tp, i18n } from '../lib/i18n';

  let details = $state.raw<Map<string, ResultChange> | null>(null);
  let loadFailed = $state(false);
  let recoveryFailed = $state(false);

  function saveAndReload() {
    recoveryFailed = !saveWorkspaceToLocalStorage();
    if (!recoveryFailed) window.location.reload();
  }

  async function loadDetails() {
    loadFailed = false;
    try {
      const { RESULT_CHANGES } = await import('../lib/provenance/full-registry');
      details = new Map(RESULT_CHANGES.changes.map(c => [c.id, c]));
    } catch {
      loadFailed = true;
    }
  }

  let readIt = $state(false);
  let reviewing = $state(false);
  let busy = $state(false);
  let dialog = $state<HTMLDivElement | null>(null);

  const a = $derived(recheckStore.assessment);
  const open = $derived(recheckStore.noticeOpen || reviewing);
  const loc = $derived<Locale3>((['en', 'es', 'pt'] as const).includes(i18n.locale as Locale3) ? (i18n.locale as Locale3) : 'en');

  $effect(() => {
    if (open && !details) void loadDetails();
  });

  // A new notice (another project) starts unticked.
  $effect(() => {
    void recheckStore.assessment;
    readIt = false;
  });

  $effect(() => {
    if (!open || !dialog) return;
    const restore = captureFocus(dialog);
    return restore;
  });

  function onKey(e: KeyboardEvent) {
    // Escape is swallowed: the notice is dismissed by acknowledging it, not by a reflex.
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return; }
    if (cycleTabWithin(dialog, e)) e.preventDefault();
  }

  function acknowledge() {
    recheckStore.acknowledge();
    reviewing = false;
  }

  async function rerun() {
    if (busy) return;
    busy = true;
    recheckStore.acknowledge();
    reviewing = false;
    try { await rerunAnalysisAndDesign(); } finally { busy = false; }
  }
</script>

{#if open && a}
  <div class="rc-overlay" data-testid="recheck-overlay">
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="rc"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="rc-title"
      aria-describedby="rc-intro"
      tabindex="-1"
      bind:this={dialog}
      onkeydown={onKey}
      data-testid="recheck-notice"
    >
      <h3 class="rc-title" id="rc-title">{t('recheck.title')}</h3>
      <p class="rc-intro" id="rc-intro">
        {a.solvedVersion > 0
          ? tp('recheck.intro', { from: a.solvedVersion, to: a.currentVersion })
          : t('recheck.introUnknown')}
      </p>
      {#if !details}
        <p role="status">{t(loadFailed ? 'recheck.loadFailed' : 'recheck.loading')}</p>
        {#if loadFailed}
          <button class="rc-btn" onclick={loadDetails}>{t('recheck.retry')}</button>
          <button class="rc-btn" onclick={saveAndReload} data-testid="recheck-reload">{t('recheck.saveAndReload')}</button>
          {#if recoveryFailed}<p role="alert">{t('recheck.recoveryFailed')}</p>{/if}
        {/if}
      {/if}
      <ul class="rc-list" data-testid="recheck-changes">
        {#each a.changes as c (c.id)}
          <li class="rc-item" data-change-id={c.id}>
            <div class="rc-item-head">
              <span class="rc-area rc-area-{c.area}">{t(`recheck.area.${c.area}`)}</span>
              <span class="rc-item-title">{details?.get(c.id)?.title[loc] ?? c.id}</span>
            </div>
            <p class="rc-item-text">{details?.get(c.id)?.explanation[loc] ?? t('recheck.detailsUnavailable')}</p>
            <a class="rc-link" href={changelogUrl(c)} target="_blank" rel="noopener noreferrer">{t('recheck.details')}</a>
          </li>
        {/each}
      </ul>
      <p class="rc-stale">{t('recheck.staleWarning')}</p>
      {#if recheckStore.noticeOpen}
        <label class="rc-ack">
          <input type="checkbox" disabled={!details} bind:checked={readIt} data-testid="recheck-ack" />
          {t('recheck.ack')}
        </label>
      {/if}
      <div class="rc-actions">
        {#if recheckStore.noticeOpen}
          <button class="rc-btn" disabled={!details || !readIt} onclick={acknowledge} data-testid="recheck-later">{t('recheck.later')}</button>
        {:else}
          <button class="rc-btn" onclick={() => (reviewing = false)} data-testid="recheck-close">{t('provenance.reproduce.close')}</button>
        {/if}
        <button class="rc-btn rc-primary" disabled={!details || (recheckStore.noticeOpen && !readIt) || busy} onclick={rerun} data-testid="recheck-rerun">{t(recheckKey('recheck.rerun'))}</button>
      </div>
    </div>
  </div>
{/if}

{#if !open && recheckStore.stale && a}
  <div class="rc-banner" role="status" data-testid="recheck-stale-banner">
    <span>{tp('recheck.banner', { n: a.changes.length })}</span>
    <button class="rc-banner-btn" onclick={() => (reviewing = true)} data-testid="recheck-banner-details">{t('recheck.bannerDetails')}</button>
    <button class="rc-banner-btn rc-primary" disabled={busy} onclick={rerun} data-testid="recheck-banner-rerun">{t('recheck.bannerRerun')}</button>
  </div>
{/if}

<style>
  .rc-overlay {
    position: fixed;
    inset: 0;
    background: color-mix(in srgb, var(--st-bg) 78%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 260;
  }
  .rc {
    width: min(640px, calc(100vw - 32px));
    max-height: calc(100vh - 48px);
    overflow-y: auto;
    padding: 18px;
    background: var(--st-surface);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    box-shadow: 0 8px 32px rgb(0 0 0 / 0.35);
    outline: none;
  }
  .rc-title { margin: 0 0 6px; font-size: 0.95rem; font-weight: 600; color: var(--st-text); }
  .rc-intro { margin: 0 0 12px; font-size: 0.75rem; line-height: 1.5; color: var(--st-text-2, var(--st-text)); }
  .rc-list { list-style: none; margin: 0 0 12px; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .rc-item { padding: 8px 10px; border: 1px solid var(--st-hair); border-radius: var(--st-radius); }
  .rc-item-head { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
  .rc-area { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--st-text-3); }
  .rc-item-title { font-size: 0.78rem; font-weight: 600; color: var(--st-text); }
  .rc-item-text { margin: 4px 0; font-size: 0.72rem; line-height: 1.5; color: var(--st-text-2, var(--st-text)); }
  .rc-link { font-size: 0.68rem; color: var(--st-accent, #4a90d9); }
  .rc-stale { margin: 0 0 10px; font-size: 0.72rem; font-weight: 600; color: var(--st-warn, #d9a441); }
  .rc-ack { display: flex; gap: 6px; align-items: center; font-size: 0.75rem; color: var(--st-text); margin-bottom: 12px; }
  .rc-actions { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
  .rc-btn, .rc-banner-btn {
    padding: 6px 12px;
    font-size: 0.75rem;
    border-radius: var(--st-radius);
    border: 1px solid var(--st-hair-strong);
    background: var(--st-surface-2, var(--st-surface));
    color: var(--st-text);
    cursor: pointer;
  }
  .rc-btn:disabled, .rc-banner-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .rc-primary { background: var(--st-accent, #4a90d9); border-color: var(--st-accent, #4a90d9); color: #fff; }
  .rc-banner {
    position: fixed;
    left: 50%;
    bottom: 44px;
    transform: translateX(-50%);
    /* Above the app's own bars and drawers, below the notice itself. */
    z-index: 250;
    display: flex;
    gap: 8px;
    align-items: center;
    max-width: calc(100vw - 32px);
    padding: 6px 10px;
    font-size: 0.72rem;
    color: var(--st-text);
    background: var(--st-surface);
    border: 1px solid var(--st-warn, #d9a441);
    border-radius: var(--st-radius);
    box-shadow: 0 4px 16px rgb(0 0 0 / 0.25);
  }
  .rc-banner-btn { padding: 3px 8px; font-size: 0.68rem; }
</style>
