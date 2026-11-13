<script lang="ts">
  import { t, i18n } from '../../../lib/i18n';
  import { decimalFor, makeFmt } from '../../../lib/rc-sheets/format';
  import type { CheckLine } from '../../../lib/rc-sheets/types';

  let { lines }: { lines: CheckLine[] } = $props();
  const fmt = $derived(makeFmt(decimalFor(i18n.locale)));
</script>

<table class="rcc" data-testid="rc-checks">
  <thead>
    <tr><th>{t('rcSheets.v.title')}</th><th>{t('rcSheets.v.clause')}</th><th>{t('rcSheets.v.demand')}</th><th>{t('rcSheets.v.capacity')}</th><th>{t('rcSheets.col.ratio')}</th><th></th></tr>
  </thead>
  <tbody>
    {#each lines as l, i (i)}
      <tr class:bad={!l.ok}>
        <td>{t(l.label)}</td>
        <td class="cl">{l.clause ?? ''}</td>
        <td class="n">{l.demand ?? ''}</td>
        <td class="n">{l.capacity ?? ''}</td>
        <td class="n">{l.ratio !== undefined ? fmt(l.ratio, 2) : ''}</td>
        <td class="st">{l.ok ? '✓' : '✗'}</td>
      </tr>
    {/each}
  </tbody>
</table>

<style>
  .rcc { width: 100%; border-collapse: collapse; font-size: 0.72rem; margin-bottom: 8px; }
  th { text-align: left; font-weight: 600; color: var(--st-text-2); padding: 3px 6px; border-bottom: 1px solid var(--st-hair); background: var(--st-surface-2); }
  td { padding: 2px 6px; border-bottom: 1px solid var(--st-hair); color: var(--st-text); }
  .cl { color: var(--st-text-3); font-family: var(--st-mono); white-space: nowrap; }
  .n { font-family: var(--st-mono); text-align: right; white-space: nowrap; }
  .st { width: 1.4em; text-align: center; font-weight: 700; color: var(--st-ok); }
  tr.bad td { color: var(--st-danger); }
  tr.bad .st { color: var(--st-danger); }
</style>
