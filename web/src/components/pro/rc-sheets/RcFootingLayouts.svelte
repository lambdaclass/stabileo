<script lang="ts">
  import { t, i18n } from '../../../lib/i18n';
  import { decimalFor, makeFmt } from '../../../lib/rc-sheets/format';
  import { setFoundationSystem } from '../../../lib/store/rc-sheets-footings';
  import type { FoundationLayout } from '../../../lib/rc-sheets/footing-layouts';
  import type { FoundationSystem } from '../../../lib/rc-sheets/footing-types';

  let { layouts, adopted, preview = $bindable() }: { layouts: readonly FoundationLayout[]; adopted: FoundationSystem | null; preview: FoundationSystem } = $props();
  const fmt = $derived(makeFmt(decimalFor(i18n.locale)));
  const pct = (v: number | null) => (v === null ? '—' : `${fmt(v * 100, 0)} %`);
</script>

<div class="rfl" data-testid="rc-footing-layouts">
  <div class="rfl-head">
    <span class="rfl-title">{t('rcSheets.foundation.layouts')}</span>
    {#if adopted}
      <span class="rfl-state on" data-testid="rc-foundation-adopted">{t('rcSheets.foundation.adopted')}: {t(`rcSheets.foundation.${adopted}`)}</span>
      <button type="button" class="rcs-btn" onclick={() => setFoundationSystem(null)} data-testid="rc-foundation-clear">{t('rcSheets.foundation.clear')}</button>
    {:else}
      <span class="rfl-state" data-testid="rc-foundation-none">{t('rcSheets.foundation.none')}</span>
    {/if}
  </div>
  <table>
    <thead><tr><th></th><th>{t('rcSheets.foundation.label')}</th><th class="n">{t('rcSheets.foundation.share')}</th><th class="n">m³</th><th class="n">kg</th><th>{t('rcSheets.foundation.parts')}</th><th class="n">{t('rcSheets.foundation.failing')}</th><th></th></tr></thead>
    <tbody>
      {#each layouts as l (l.system)}
        <tr class:sel={(adopted ?? preview) === l.system} data-testid="rc-foundation-layout-{l.system}">
          <td><input type="radio" name="rc-foundation-preview" checked={(adopted ?? preview) === l.system} disabled={!!adopted} onchange={() => (preview = l.system)} aria-label={t(`rcSheets.foundation.${l.system}`)} /></td>
          <td>{t(`rcSheets.foundation.${l.system}`)}{#if l.system === 'auto'} <span class="rec">{t('rcSheets.foundation.recommended')}</span>{/if}</td>
          <td class="n">{pct(l.summary.share)}</td>
          <td class="n">{fmt(l.summary.concrete, 1)}</td>
          <td class="n">{fmt(l.summary.steel, 0)}</td>
          <td>{l.summary.count.footing ? `${l.summary.count.footing} ${t('rcSheets.foundation.footingsShort')}` : ''}{l.summary.count.strip ? ` ${l.summary.count.strip} ${t('rcSheets.footKind.strip')}` : ''}{l.summary.count.mat ? ` ${l.summary.count.mat} ${t('rcSheets.footKind.mat')}` : ''}</td>
          <td class="n" class:bad={l.summary.failing > 0}>{l.summary.failing}</td>
          <td>{#if adopted !== l.system}<button type="button" class="rcs-btn" onclick={() => setFoundationSystem(l.system)} data-testid="rc-foundation-adopt-{l.system}">{t('rcSheets.foundation.adopt')}</button>{/if}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  {#if !adopted}<p class="hint">{t('rcSheets.foundation.noneHint')}</p>{/if}
</div>

<style>
  .rfl { display: flex; flex-direction: column; gap: 4px; margin: 4px 0 8px; font-size: 0.72rem; }
  .rfl-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .rfl-title { font-weight: 600; color: var(--st-text-2); text-transform: uppercase; letter-spacing: 0.05em; font-size: 0.66rem; }
  .rfl-state { color: var(--st-warn); }
  .rfl-state.on { color: var(--st-ok); }
  table { border-collapse: collapse; }
  th, td { padding: 2px 6px; border-bottom: 1px solid var(--st-hair); text-align: left; }
  th.n, td.n { text-align: right; font-variant-numeric: tabular-nums; }
  tr.sel td { background: color-mix(in srgb, var(--st-accent) 10%, transparent); }
  .rec { font-size: 0.64rem; color: var(--st-accent); border: 1px solid var(--st-accent); border-radius: 3px; padding: 0 3px; }
  .bad { color: var(--st-danger); font-weight: 600; }
  .hint { margin: 0; color: var(--st-text-3); }
  .rcs-btn { font-size: 0.7rem; border: 1px solid var(--st-hair); background: var(--st-surface-2); color: var(--st-text); border-radius: 4px; padding: 1px 6px; cursor: pointer; }
</style>
