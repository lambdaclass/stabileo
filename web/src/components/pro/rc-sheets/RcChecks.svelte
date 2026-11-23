<script lang="ts">
  import { t, tp, tpn, i18n, inSentence } from '../../../lib/i18n';
  import { decimalFor, makeFmt } from '../../../lib/rc-sheets/format';
  import type { CheckLine } from '../../../lib/rc-sheets/types';
  import { applyTableCovers, sheetCoverShortfalls } from '../../../lib/store/rc-sheets-covers';
  import { coverCheckText, coversButton } from '../../../lib/rc-sheets/covers-notice';
  import type { DesignKind } from '../../../lib/model/design-data';
  import { modelStore } from '../../../lib/store';

  let { lines, kind }: { lines: CheckLine[]; kind?: DesignKind } = $props();
  const fmt = $derived(makeFmt(decimalFor(i18n.locale)));
  const under = $derived.by(() => { void modelStore.designData; return sheetCoverShortfalls(); });
  const words = $derived({ t, tp, tpn, inSentence: (l: string) => inSentence(l, i18n.locale), locale: i18n.locale });
  const own = $derived(kind ? under.filter((u) => u.kind === kind) : under);
</script>

<table class="rcc" data-testid="rc-checks">
  <thead>
    <tr><th>{t('rcSheets.v.title')}</th><th>{t('rcSheets.v.clause')}</th><th class="n">{t('rcSheets.v.demand')}</th><th class="n">{t('rcSheets.v.capacity')}</th><th class="n">{t('rcSheets.col.ratio')}</th><th></th></tr>
  </thead>
  <tbody>
    {#each lines as l, i (i)}
      <tr class:bad={!l.ok}>
        <td>{t(l.label)}{#if !l.ok && l.label === 'rcSheets.v.mainCover' && own.length}
          {#each own as u (u.kind)}<span class="why" data-testid="rc-check-covers-why">{coverCheckText(u, words)}</span>{/each}
          <button type="button" class="fix" onclick={() => applyTableCovers()} data-testid="rc-check-covers-apply">{coversButton(under, words)}</button>{/if}</td>
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
  .why { display: block; font-size: 0.68rem; color: var(--st-text-2); margin: 2px 0; }
  .fix { margin-left: 6px; font-size: 0.68rem; border: 1px solid var(--st-hair); background: var(--st-surface-2); color: var(--st-text); border-radius: 4px; padding: 1px 6px; cursor: pointer; }
</style>
