<script lang="ts">
  import { t, i18n } from '../../../lib/i18n';
  import { decimalFor, makeFmt } from '../../../lib/rc-sheets/format';
  import type { ComboTable } from '../../../lib/rc-sheets/types';

  let { table }: { table: ComboTable } = $props();
  const fmt = $derived(makeFmt(decimalFor(i18n.locale)));
  const head = (h: string) => (h.startsWith('rcSheets.') ? t(h) : h);
</script>

{#if table.rows.length}
  <table class="rck" data-testid="rc-combos">
    <thead>
      <tr><th>{t('rcSheets.combo.name')}</th>{#each table.headers as h (h)}<th class="n">{head(h)}</th>{/each}<th class="n">{t('rcSheets.col.ratio')}</th><th></th></tr>
    </thead>
    <tbody>
      {#each table.rows as r (r.combo)}
        <tr class:bad={!r.ok}>
          <td>{r.combo}</td>
          {#each r.values as v, i (i)}<td class="n">{v}</td>{/each}
          <td class="n">{fmt(r.ratio, 2)}</td>
          <td class="st">{r.ok ? '✓' : '✗'}</td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}

<style>
  .rck { width: 100%; border-collapse: collapse; font-size: 0.72rem; margin-bottom: 8px; }
  th { text-align: left; font-weight: 600; color: var(--st-text-2); padding: 3px 6px; border-bottom: 1px solid var(--st-hair); background: var(--st-surface-2); }
  td { padding: 2px 6px; border-bottom: 1px solid var(--st-hair); color: var(--st-text); }
  .n { font-family: var(--st-mono); text-align: right; white-space: nowrap; }
  .st { width: 1.4em; text-align: center; font-weight: 700; color: var(--st-ok); }
  tr.bad td, tr.bad .st { color: var(--st-danger); }
</style>
