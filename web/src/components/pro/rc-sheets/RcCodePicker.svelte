<script lang="ts">
  import { t } from '../../../lib/i18n';
  import { modelStore } from '../../../lib/store';
  import { setSheetCode, sheetCode } from '../../../lib/store/rc-sheets.svelte';
  import { SHEET_CODE_LIST, SHEET_CODES, type SheetCode } from '../../../lib/rc-sheets/types';

  let { compact = false }: { compact?: boolean } = $props();
  const code = $derived.by(() => { void modelStore.designData; return sheetCode(); });
</script>

<label class="rcc" class:compact title={t('rcSheets.codeHint')}>
  <span>{t('rcSheets.code')}</span>
  <select value={code} onchange={(e) => setSheetCode(e.currentTarget.value as SheetCode)} data-testid="rc-code-select">
    {#each SHEET_CODE_LIST as c (c)}<option value={c}>{SHEET_CODES[c].name} · {t(`rcSheets.country.${SHEET_CODES[c].country}`)}</option>{/each}
  </select>
</label>

<style>
  .rcc { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 0.76rem; color: var(--st-text-2); }
  .rcc.compact { justify-content: flex-start; font-size: 0.72rem; }
  .rcc select { font: inherit; font-weight: 600; padding: 3px 6px; background: var(--st-surface); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 4px; }
</style>
