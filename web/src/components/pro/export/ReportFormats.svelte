<script lang="ts">
  /**
   * The five formats every report offers, as one row of buttons: PDF, HTML, Word, workbook and
   * CSV. The same row on the analysed model's reports and on the designed model's, each with its
   * own content.
   */
  import { t } from '../../../lib/i18n';
  import { REPORT_FORMATS, type ReportFormat } from '../../../lib/export/report-formats';

  let { run, prefix, ids = {}, disabled = false, formats = REPORT_FORMATS }: { run: (f: ReportFormat) => void; prefix: string; ids?: Partial<Record<ReportFormat, string>>; disabled?: boolean; formats?: readonly ReportFormat[] } = $props();
</script>

<div class="rf" role="group" aria-label={t('export.formats')} data-testid="{prefix}-formats">
  {#each formats as f (f)}
    <button type="button" {disabled} onclick={() => run(f)} data-testid={ids[f] ?? `${prefix}-${f}`}>{t(`export.format.${f}`)}</button>
  {/each}
</div>

<style>
  .rf { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .rf button { font-size: 0.7rem; padding: 0.2rem 0.55rem; background: var(--st-surface-3); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 4px; cursor: pointer; }
  .rf button:disabled { opacity: 0.45; cursor: default; }
</style>
