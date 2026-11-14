<script lang="ts">
  import { saveWorkspaceSettled, saveSession } from '../lib/store/file';
  import { recheckStore } from '../lib/store/recheck.svelte';
  import { rerunAnalysisAndDesign, recheckKey } from '../lib/actions/recheck';
  import { changelogUrl, concernsGeneratedLoads, registryLocale } from '../lib/provenance/registry';
  import { advisoryName, type Advisory } from '../lib/provenance/advisories';
  import { cycleTabWithin } from '../lib/utils/dialog-focus';
  import { t, tp, i18n } from '../lib/i18n';

  const details = $derived(!recheckStore.pending);
  const loadFailed = $derived(recheckStore.loadFailed);
  let recoveryFailed = $state(false);

  async function saveAndReload() {
    recoveryFailed = !(await saveWorkspaceSettled());
    if (!recoveryFailed) window.location.reload();
  }

  function loadDetails() { return recheckStore.retry(); }

  let reviewing = $state(false);
  let busy = $state(false);
  let dialog = $state<HTMLDivElement | null>(null);

  const CHECK_GRACE_MS = 800;
  let checkingLong = $state(false);
  $effect(() => {
    if (!recheckStore.pending) { checkingLong = false; return; }
    const id = setTimeout(() => { checkingLong = true; }, CHECK_GRACE_MS);
    return () => clearTimeout(id);
  });

  const a = $derived(recheckStore.assessment);
  const open = $derived((recheckStore.noticeOpen && (details || loadFailed || checkingLong)) || reviewing);
  const regenerate = $derived(!!a?.changes.some((c) => concernsGeneratedLoads(c.when)));
  const resolve = $derived(!a || !a.changes.length || a.changes.some((c) => !concernsGeneratedLoads(c.when)));
  const loc = $derived(registryLocale(i18n.locale));
  const openAdvisories = $derived(recheckStore.openAdvisories);
  const maybe = (x: Advisory) => !!a?.maybe.includes(x.id);
  const certain = $derived(openAdvisories.filter((x) => !x.analysis && !maybe(x)));
  const listed = $derived(recheckStore.noticeOpen ? a?.advisories ?? [] : openAdvisories);
  const analysisLabel = (x: Advisory) => x.ifUsed?.[loc] ?? x.analysis ?? '';
  const advisoryText = (x: Advisory, banner: boolean) => {
    const vars = { name: advisoryName(x), analysis: analysisLabel(x) };
    if (maybe(x) && !x.analysis) return tp(banner ? 'recheck.advisoryBannerMaybeIf' : 'recheck.advisoryMaybeIf', vars);
    if (maybe(x)) return tp(banner ? 'recheck.advisoryBannerMaybe' : 'recheck.advisoryMaybe', vars);
    return x.analysis ? tp('recheck.advisoryAnalysis', vars) + (banner ? '.' : '') : tp('recheck.advisory', vars);
  };

  // A safety notice belongs in the browser's top layer, above every app z-index.
  // showModal also makes the desk and other background dialogs inert and restores
  // focus on close. Do not use the `open` attribute: it creates a non-modal dialog.
  function showNotice(node: HTMLDialogElement) {
    node.showModal();
    dialog?.focus();
    return { destroy: () => node.close() };
  }

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
  <dialog
    class="rc-overlay"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="rc-title"
    aria-describedby="rc-intro"
    data-testid="recheck-overlay"
    use:showNotice
    oncancel={(e) => e.preventDefault()}
    onkeydown={onKey}
  >
    <div
      class="rc"
      class:rc-recovery={loadFailed}
      tabindex="-1"
      bind:this={dialog}
      data-testid="recheck-notice"
    >
      <h3 class="rc-title" id="rc-title">{t(details ? 'recheck.title' : 'recheck.checkingTitle')}</h3>
      {#if details}
        <p class="rc-intro" id="rc-intro">
          {a.solvedVersion >= a.currentVersion
            ? tp('recheck.introLoads', { to: a.currentVersion })
            : a.solvedVersion > 0
            ? tp('recheck.intro', { from: a.solvedVersion, to: a.currentVersion })
            : t('recheck.introUnknown')}
        </p>
      {:else}
        <p role="status" id="rc-intro">{t(loadFailed ? 'recheck.loadFailed' : 'recheck.loading')}</p>
        {#if loadFailed}
          <button class="rc-btn" onclick={loadDetails} data-testid="recheck-retry">{t('recheck.retry')}</button>
          <button class="rc-btn" onclick={saveAndReload} data-testid="recheck-reload">{t('recheck.saveAndReload')}</button>
          <button class="rc-btn" onclick={saveSession} data-testid="recheck-backup">{t('recheck.downloadBackup')}</button>
          <p class="rc-intro">{t('recheck.backupHelp')}</p>
          {#if recoveryFailed}<p role="alert">{t('recheck.recoveryFailed')}</p>{/if}
        {/if}
      {/if}
      {#if details && listed.length}
        <ul class="rc-list rc-advisories" role="alert" data-testid="recheck-advisories">
          {#each listed as adv (adv.id)}
            <li class="rc-item rc-advisory" data-advisory-id={adv.id}>
              <span class="rc-item-title">{advisoryText(adv, false)}</span>
              <p class="rc-item-text">{adv.title[loc]}</p>
              <a class="rc-link" href={adv.url} target="_blank" rel="noopener noreferrer">{t('recheck.advisoryLink')}</a>
            </li>
          {/each}
        </ul>
      {/if}
      <ul class="rc-list" data-testid="recheck-changes">
        {#each a.changes as c (c.id)}
          <li class="rc-item" data-change-id={c.id}>
            <div class="rc-item-head">
              <span class="rc-area rc-area-{c.area}">{t(`recheck.area.${c.area}`)}</span>
              <span class="rc-item-title">{c.title[loc]}</span>
            </div>
            <p class="rc-item-text">{c.explanation[loc]}</p>
            <a class="rc-link" href={changelogUrl(c)} target="_blank" rel="noopener noreferrer">{t('recheck.details')}</a>
          </li>
        {/each}
      </ul>
      <footer class="rc-footer">
        {#if regenerate}<p class="rc-stale" data-testid="recheck-regenerate">{tp('recheck.regenerateLoads', { button: t('autoLoad.autoGenBtn') })}</p>{/if}
        {#if resolve}<p class="rc-stale">{t('recheck.staleWarning')}</p>{/if}
        <div class="rc-actions">
          {#if recheckStore.noticeOpen}
            <button class="rc-btn" disabled={!details} onclick={acknowledge} data-testid="recheck-later">{t('recheck.later')}</button>
          {:else}
            <button class="rc-btn" onclick={() => (reviewing = false)} data-testid="recheck-close">{t('provenance.reproduce.close')}</button>
          {/if}
          {#if resolve}
            <button class="rc-btn rc-primary" disabled={!details || busy} onclick={rerun} data-testid="recheck-rerun">{t(recheckKey('recheck.rerun'))}</button>
          {/if}
        </div>
      </footer>
    </div>
  </dialog>
{/if}

{#if !open && details && recheckStore.stale && a}
  <div class="rc-banner" class:rc-banner-advisory={openAdvisories.length > 0} role={openAdvisories.length ? 'alert' : 'status'} data-testid="recheck-stale-banner">
    {#if openAdvisories.length}
      <span data-testid="recheck-advisory-banner">
        {#if certain.length}{tp('recheck.advisoryBanner', { names: certain.map(advisoryName).join(', ') })}{/if}
        {#each openAdvisories.filter((x) => x.analysis || maybe(x)) as adv (adv.id)} {advisoryText(adv, true)}{/each}
      </span>
    {:else}
      <span>{tp('recheck.banner', { n: a.changes.length })}</span>
    {/if}
    <button class="rc-banner-btn" onclick={() => (reviewing = true)} data-testid="recheck-banner-details">{t('recheck.bannerDetails')}</button>
    {#if resolve && !recheckStore.solvedAgain}<button class="rc-banner-btn rc-primary" disabled={busy} onclick={rerun} data-testid="recheck-banner-rerun">{t('recheck.bannerRerun')}</button>{/if}
  </div>
{/if}

<style>
  .rc-overlay {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    max-width: none;
    max-height: none;
    margin: 0;
    padding: 0;
    border: 0;
    color: inherit;
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .rc-overlay::backdrop {
    background: color-mix(in srgb, var(--st-bg) 78%, transparent);
  }
  .rc {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    width: min(640px, calc(100vw - 32px));
    max-height: calc(100vh - 48px);
    max-height: calc(100dvh - 48px);
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    overflow-wrap: anywhere;
    font-size: 0.75rem;
    padding: 18px;
    background: var(--st-surface);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    box-shadow: 0 8px 32px rgb(0 0 0 / 0.35);
    outline: none;
  }
  .rc-title, .rc-intro, .rc-stale, .rc-actions { flex-shrink: 0; }
  .rc-title { margin: 0 0 6px; font-size: 0.95rem; font-weight: 600; color: var(--st-text); }
  .rc-recovery > :global(*) { flex-shrink: 0; }
  .rc-intro { margin: 0 0 12px; font-size: 0.75rem; line-height: 1.5; color: var(--st-text-2, var(--st-text)); }
  .rc-list { min-height: 0; overflow-y: auto; overscroll-behavior: contain; list-style: none; margin: 0 0 12px; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .rc-list:has(> li) { min-height: 4rem; }
  .rc-item { flex-shrink: 0; padding: 8px 10px; border: 1px solid var(--st-hair); border-radius: var(--st-radius); }
  .rc-item-head { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
  .rc-area { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--st-text-3); }
  .rc-item-title { font-size: 0.78rem; font-weight: 600; color: var(--st-text); }
  .rc-item-text { margin: 4px 0; font-size: 0.75rem; line-height: 1.5; color: var(--st-text-2, var(--st-text)); }
  .rc-link { display: inline-flex; align-items: center; min-height: 44px; min-width: 44px; font-size: 0.75rem; color: var(--st-accent, #4a90d9); }
  .rc-stale { margin: 0 0 10px; font-size: 0.75rem; font-weight: 600; color: var(--st-warn, #d9a441); }
  .rc-footer { flex-shrink: 0; }
  .rc-actions { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
  .rc-btn, .rc-banner-btn {
    min-height: 44px;
    min-width: 44px;
    max-width: 100%;
    white-space: normal;
    overflow-wrap: anywhere;
    padding: 8px 12px;
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
    box-sizing: border-box;
    width: max-content;
    max-width: calc(100vw - 32px);
    flex-wrap: wrap;
    overflow-wrap: anywhere;
    padding: 6px 10px;
    font-size: 0.75rem;
    color: var(--st-text);
    background: var(--st-surface);
    border: 1px solid var(--st-warn, #d9a441);
    border-radius: var(--st-radius);
    box-shadow: 0 4px 16px rgb(0 0 0 / 0.25);
  }
  .rc-banner-btn { padding: 3px 8px; font-size: 0.75rem; }
  .rc-banner-advisory, .rc-advisory { border-color: var(--st-danger, #d9534f); }
  .rc-banner-advisory { z-index: 920; }
  /* Only one of .rc and .rc-list may scroll: a drag on a nested list never reaches the controls below it. */
  @media (max-height: 520px) {
    .rc-list { flex-shrink: 0; overflow-y: visible; overscroll-behavior: auto; }
  }
  @media (max-width: 600px) {
    .rc { padding: 12px; max-height: calc(100dvh - 24px); }
    .rc-actions .rc-btn { flex: 1 1 100%; }
    .rc-banner { width: calc(100vw - 24px); }
    .rc-banner > span { flex-basis: 100%; }
    .rc-banner-btn { flex: 1; }
  }
</style>
