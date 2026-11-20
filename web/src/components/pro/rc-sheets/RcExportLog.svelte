<script lang="ts">
  /** The sheets' exports recorded with the project, each saying whether it still matches the model; `compact`: only the files that no longer do. */
  import { i18n, t, tpn } from '../../../lib/i18n';
  import { modelStore } from '../../../lib/store';
  import { sheetsExports } from '../../../lib/store/rc-sheets-exports';

  let { compact = false }: { compact?: boolean } = $props();
  const SHOWN = 8;
  const records = $derived.by(() => { void modelStore.designData; return sheetsExports(); });
  const outdated = $derived(records.filter((r) => !r.current).length);
  const DISMISS_KEY = 'stabileo-rc-exports-dismissed';
  const signature = $derived(records.filter((r) => !r.current).map((r) => `${r.filename}@${r.at}`).join('|'));
  let dismissed = $state((() => { try { return sessionStorage.getItem(DISMISS_KEY) ?? ''; } catch { return ''; } })());
  function dismiss() { dismissed = signature; try { sessionStorage.setItem(DISMISS_KEY, signature); } catch { /* lasts while the panel is open */ } }
  const when = (at: string) => { const d = new Date(at); return Number.isNaN(d.getTime()) ? at : d.toLocaleString(i18n.locale, { dateStyle: 'short', timeStyle: 'short' }); };
</script>

{#if outdated && (!compact || dismissed !== signature)}
  <div class="rce-outbox" role="status">
    <p class="rce-out" data-testid="rc-exports-outdated">{tpn('rcSheets.exports.outdated', outdated)}</p>
    {#if compact}<button type="button" class="rce-close" onclick={dismiss} aria-label={t('rcSheets.exports.dismiss')} title={t('rcSheets.exports.dismiss')} data-testid="rc-exports-outdated-dismiss">✕</button>{/if}
  </div>
{/if}
{#if !compact}
  <section class="rce" aria-label={t('rcSheets.exports.title')} data-testid="rc-export-log">
    <h5>{t('rcSheets.exports.title')}</h5>
    {#if !records.length}
      <p class="dim" data-testid="rc-export-log-empty">{t('rcSheets.exports.none')}</p>
    {:else}
      <ul>
        {#each records.slice(0, SHOWN) as r, i (`${r.at}:${i}`)}
          <li data-testid="rc-export-record" data-kind={r.kind} data-current={r.current}>
            <span class="dim">{when(r.at)}</span> · {t(`rcSheets.exports.kind.${r.kind}`)} · <code>{r.filename}</code>{#if r.scope} · <span class="dim">{r.scope}</span>{/if}
            <span class="st" class:old={!r.current} data-testid="rc-export-state">{r.current ? t('rcSheets.exports.current') : r.staleSheets ? t('rcSheets.exports.fromStaleSheets') : t('rcSheets.exports.older')}</span>
          </li>
        {/each}
      </ul>
      {#if records.length > SHOWN}<p class="dim">{tpn('rcSheets.exports.more', records.length - SHOWN)}</p>{/if}
    {/if}
  </section>
{/if}

<style>
  .rce { display: flex; flex-direction: column; gap: 3px; font-size: 0.7rem; color: var(--st-text-2); }
  h5 { margin: 0; font-size: 0.72rem; color: var(--st-text); }
  ul { margin: 0; padding-left: 1.1em; display: flex; flex-direction: column; gap: 2px; }
  code { font-size: 0.68rem; color: var(--st-text); }
  .dim { color: var(--st-text-3); margin: 0; }
  .st { margin-left: 4px; color: var(--st-ok); }
  .st.old { color: var(--st-warn); font-weight: 600; }
  .rce-outbox { display: flex; align-items: flex-start; gap: 8px; padding: 5px 8px; border: 1px solid var(--st-warn); border-radius: var(--st-radius); background: color-mix(in srgb, var(--st-warn) 8%, transparent); }
  .rce-out { margin: 0; flex: 1; font-size: 0.72rem; line-height: 1.4; color: var(--st-warn); }
  .rce-close { border: none; background: none; padding: 0 2px; color: var(--st-text-2); cursor: pointer; font-size: 0.72rem; line-height: 1.4; }
  .rce-close:hover { color: var(--st-text); }
  .rce-close:focus-visible { outline: 2px solid var(--st-focus); outline-offset: 2px; }
</style>
