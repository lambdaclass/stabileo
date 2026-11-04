<script lang="ts">
  import { uiStore } from '../../lib/store';
  import { saveStatus } from '../../lib/store/save-status.svelte';
  import { requestAutosave } from '../../lib/store/autosave-service';
  import { i18n, t, tp } from '../../lib/i18n';

  let now = $state(Date.now());
  $effect(() => {
    const id = setInterval(() => { now = Date.now(); }, 20_000);
    return () => clearInterval(id);
  });

  const state = $derived(saveStatus.state);
  const ago = $derived.by(() => {
    if (!saveStatus.savedAt) return '';
    const s = Math.round((new Date(saveStatus.savedAt).getTime() - now) / 1000);
    if (s > -45) return t('save.justNow');
    const rtf = new Intl.RelativeTimeFormat(i18n.locale, { numeric: 'auto' });
    return Math.abs(s) < 3600 ? rtf.format(Math.round(s / 60), 'minute') : rtf.format(Math.round(s / 3600), 'hour');
  });
  const label = $derived(
    state === 'saving' ? t('save.saving')
    : state === 'saved' ? tp('save.savedAgo', { when: ago })
    : state === 'degraded' ? t('save.degraded')
    : state === 'failed' ? t('save.failed')
    : state === 'changed' ? t('save.changed') : '',
  );
  const where = $derived(saveStatus.revision != null
    ? tp('save.where.browser', { n: saveStatus.revision }) : t('save.where.browserNone'));
  const title = $derived(state === 'changed' ? `${t('save.clickToSave')}. ${where}` : `${where} ${t('save.clickToOpen')}`);

  function act() {
    if (state === 'changed') { void requestAutosave('manual'); return; }
    uiStore.proActiveTab = 'project';
    uiStore.proPanelVisible = true;
  }
</script>

{#if state !== 'idle'}
  <button type="button" class="ss" data-state={state} onclick={act} {title} aria-label={`${label}. ${title}`}
    data-testid="pro-save-status">
    <span class="ss-dot" aria-hidden="true"></span>
    {#if !uiStore.isMobile}<span class="ss-text">{label}</span>{/if}
  </button>
{/if}

<style>
  .ss {
    display: inline-flex; align-items: center; gap: 6px;
    height: 26px; padding: 0 8px; border: 1px solid transparent; border-radius: var(--st-radius);
    background: none; color: var(--st-text-3); font-size: 0.7rem; cursor: pointer; white-space: nowrap;
  }
  .ss:hover { border-color: var(--st-hair-strong); color: var(--st-text-2); }
  .ss-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--st-ok); flex: none; }
  .ss[data-state='saving'] .ss-dot { background: var(--st-text-3); }
  .ss[data-state='changed'] .ss-dot { background: none; box-shadow: inset 0 0 0 1.5px var(--st-text-2); }
  .ss[data-state='degraded'] .ss-dot { background: var(--st-warn); }
  .ss[data-state='degraded'] { color: var(--st-warn); }
  .ss[data-state='failed'] .ss-dot { background: var(--st-danger); }
  .ss[data-state='failed'] { color: var(--st-danger); }
</style>
