<script lang="ts">
  /** The sheets' exports recorded with the project, each saying whether it still matches the model; `compact`: only the files that no longer do. */
  import { i18n, t, tpn } from '../../../lib/i18n';
  import { modelStore } from '../../../lib/store';
  import { sheetsExports } from '../../../lib/store/rc-sheets-exports';

  let { compact = false }: { compact?: boolean } = $props();
  const SHOWN = 8;
  const records = $derived.by(() => { void modelStore.designData; return sheetsExports(); });
  const outdated = $derived(records.filter((r) => !r.current).length);
  const when = (at: string) => { const d = new Date(at); return Number.isNaN(d.getTime()) ? at : d.toLocaleString(i18n.locale, { dateStyle: 'short', timeStyle: 'short' }); };
</script>

{#if outdated}
  <p class="rce-out" role="status" data-testid="rc-exports-outdated">{tpn('rcSheets.exports.outdated', outdated)}</p>
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
  .rce-out { margin: 0; font-size: 0.72rem; line-height: 1.4; color: var(--st-warn); }
</style>
