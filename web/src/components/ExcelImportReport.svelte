<script lang="ts">
  /**
   * What an Excel import left to fix, shared by Basic and PRO.
   *
   * PRO had the import button and nothing after it: the file loaded, or did not, and the rows
   * it had refused were never shown. Both modes now show the same report.
   */
  import { t } from '../lib/i18n';
  import type { ImportOutcome } from '../lib/excel-import/apply';

  let { report, onclose }: { report: ImportOutcome; onclose: () => void } = $props();
</script>

<!--
  The report stays until it is dismissed, and it lists rows rather than
  counting them: "row 47 wants a number in x" is something a reader can
  act on in the spreadsheet they still have open, and "12 problems" is
  not. Capped at fifteen because a file with more than that has one
  systematic mistake, not fifteen — the sixteenth line would not teach
  anything the first three have not.
-->
<div class="xls-report" data-testid="xls-report">
  <div class="xls-report-head">
    <span>
      {t('xls.ui.reportTitle')
        .replace('{n}', String(report.loaded.nodes))
        .replace('{e}', String(report.loaded.elements))}
    </span>
    <button class="xls-report-close" onclick={onclose} aria-label={t('ribbon.close')}>×</button>
  </div>

  {#if report.unknownSheets.length > 0}
    <p class="xls-report-note">
      {t('xls.ui.unknownSheets').replace('{s}', report.unknownSheets.join(', '))}
    </p>
  {/if}

  {#if report.problems.length === 0}
    <p class="xls-report-ok">{t('xls.ui.noProblems')}</p>
  {:else}
    <ul class="xls-report-list">
      {#each report.problems.slice(0, 15) as p}
        <li><strong>{p.sheet} · {t('xls.ui.row')} {p.row}</strong> — {p.message}</li>
      {/each}
    </ul>
    {#if report.problems.length > 15}
      <p class="xls-report-note">
        {t('xls.ui.andMore').replace('{n}', String(report.problems.length - 15))}
      </p>
    {/if}
  {/if}
</div>

<style>
  .xls-report {
    margin-top: 0.4rem;
    padding: 0.5rem 0.6rem;
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    background: var(--st-surface-2);
    font-size: 0.7rem;
    line-height: 1.45;
  }
  .xls-report-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    color: var(--st-text);
    font-weight: 600;
  }
  .xls-report-close {
    background: none;
    border: none;
    color: var(--st-text-3);
    font-size: 1rem;
    line-height: 1;
    cursor: pointer;
    padding: 0 0.2rem;
  }
  .xls-report-close:hover { color: var(--st-text); }
  .xls-report-ok { margin: 0.3rem 0 0; color: var(--st-ok); }
  .xls-report-note { margin: 0.3rem 0 0; color: var(--st-text-3); }
  .xls-report-list {
    /* Long reports scroll inside the box; the panel keeps its own length. */
    margin: 0.35rem 0 0;
    padding-left: 1rem;
    max-height: 190px;
    overflow-y: auto;
    color: var(--st-text-2);
  }
  .xls-report-list li { margin-bottom: 0.2rem; }
  .xls-report-list strong { color: var(--st-text); font-weight: 600; }
</style>
