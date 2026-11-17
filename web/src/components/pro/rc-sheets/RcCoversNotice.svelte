<script lang="ts">
  import { i18n, inSentence, t, tp, tpn } from '../../../lib/i18n';
  import { modelStore } from '../../../lib/store';
  import { applyTableCovers, sheetCoverShortfalls } from '../../../lib/store/rc-sheets-covers';
  import { coversNotice } from '../../../lib/rc-sheets/covers-notice';

  const under = $derived.by(() => { void modelStore.designData; return sheetCoverShortfalls(); });
  const text = $derived(coversNotice(under, { t, tp, tpn, inSentence: (l) => inSentence(l, i18n.locale), locale: i18n.locale }));
</script>

{#if under.length}
  <div class="rcn" role="status" data-testid="rc-covers-under">
    <strong>{tpn('rcSheets.coversNotice.title', under.length)}</strong>
    <ul>{#each text.items as line, i (i)}<li data-testid="rc-covers-item" data-kind={under[i]?.kind} data-origin={under[i]?.origin}>{line}</li>{/each}</ul>
    <p>{text.consequence} {text.change} {text.undo}</p>
    <button type="button" class="rcn-btn" onclick={() => applyTableCovers()} data-testid="rc-covers-apply">{text.button}</button>
  </div>
{/if}

<style>
  .rcn { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; margin: 0 0 6px; padding: 6px 10px; border: 1px solid var(--st-warn); border-radius: 4px; font-size: 0.72rem; line-height: 1.45; color: var(--st-text); background: color-mix(in srgb, var(--st-warn) 10%, transparent); max-width: 120ch; }
  ul { margin: 0; padding-left: 1.2em; }
  p { margin: 0; color: var(--st-text-2); }
  .rcn-btn { font-size: 0.72rem; border: 1px solid var(--st-hair); background: var(--st-surface-2); color: var(--st-text); border-radius: 4px; padding: 3px 8px; cursor: pointer; }
</style>
