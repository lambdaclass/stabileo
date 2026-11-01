<script lang="ts">
  import { t } from '../../lib/i18n';
  import ExportDialog from './ExportDialog.svelte';
  import ExportSection from './ExportSection.svelte';
  import { exportWorkbook, exportResultsCsv } from '../../lib/export/results-export';

  let { open = $bindable(false) }: { open: boolean } = $props();
  let format = $state<'xlsx' | 'csv'>('xlsx');
  let busy = $state(false);

  async function run() {
    busy = true;
    try {
      await (format === 'xlsx' ? exportWorkbook() : exportResultsCsv());
      open = false;
    } finally {
      busy = false;
    }
  }
</script>

<ExportDialog bind:open title={t('export.resultsTitle')} testid="results-export-dialog">
  <ExportSection title={t('export.formats')} summary={format === 'xlsx' ? 'Excel' : 'CSV'} open testid="results-export-format">
    <div class="xs-seg">
      <button type="button" class:on={format === 'xlsx'} aria-pressed={format === 'xlsx'} onclick={() => (format = 'xlsx')} data-testid="results-format-xlsx">Excel</button>
      <button type="button" class:on={format === 'csv'} aria-pressed={format === 'csv'} onclick={() => (format = 'csv')} data-testid="results-format-csv">CSV</button>
    </div>
    <p class="xs-note">{format === 'xlsx' ? t('project.exportExcelTooltip') : t('project.exportCsvTooltip')}</p>
  </ExportSection>

  {#snippet actions()}
    <button type="button" onclick={() => (open = false)}>{t('calcReport.cancel')}</button>
    <button type="button" class="primary" onclick={run} disabled={busy} data-testid="results-export-download">{t('viewExport.download')}</button>
  {/snippet}
</ExportDialog>

<style>
  .xs-seg { align-self: flex-start; }
</style>
