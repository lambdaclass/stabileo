<script lang="ts">
  import { t, tp, tpn } from '../../../lib/i18n';
  import { modelStore } from '../../../lib/store';
  import { applyTableCovers, sheetCoversUnder } from '../../../lib/store/rc-sheets-covers';

  const under = $derived.by(() => { void modelStore.designData; return sheetCoversUnder(); });
  const mm = (m: number) => Math.round(m * 1000);
  const kinds = $derived(under.map((u) => tp('rcSheets.coversUnderItem', { kind: t(`designData.kind.${u.kind}`), cover: mm(u.cover), min: mm(u.minimum) })).join('; '));
</script>

{#if under.length}
  <div class="rcn" role="status" data-testid="rc-covers-under">
    <span>{tpn('rcSheets.coversUnder', under.length, { kinds })}</span>
    <button type="button" class="rcn-btn" onclick={() => applyTableCovers()} data-testid="rc-covers-apply">{t('rcSheets.coversApply')}</button>
  </div>
{/if}

<style>
  .rcn { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin: 0 0 6px; padding: 6px 8px; border: 1px solid var(--st-warn); border-radius: 4px; font-size: 0.72rem; line-height: 1.4; color: var(--st-text); background: color-mix(in srgb, var(--st-warn) 10%, transparent); }
  .rcn-btn { font-size: 0.72rem; border: 1px solid var(--st-hair); background: var(--st-surface-2); color: var(--st-text); border-radius: 4px; padding: 3px 8px; cursor: pointer; }
</style>
