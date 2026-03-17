<script lang="ts">
  import { t } from '../../lib/i18n';
  import {
    groupColumnsByMark,
    buildScheduleRows,
    generateScheduleCrossSectionSvg,
    generateScheduleElevationSvg,
    columnScheduleToCSV,
    type ColumnMark,
  } from '../../lib/engine/column-schedule';
  import type { ElementVerification } from '../../lib/engine/codes/argentina/cirsoc201';

  interface Props {
    verifications: ElementVerification[];
    elementLengths?: Map<number, number>;
  }
  let { verifications, elementLengths }: Props = $props();

  const marks = $derived(groupColumnsByMark(verifications, elementLengths));
  const rows = $derived(buildScheduleRows(marks));

  let expandedMark = $state<string | null>(null);

  function toggleMark(markId: string) {
    expandedMark = expandedMark === markId ? null : markId;
  }

  function exportCSV() {
    const csv = columnScheduleToCSV(marks);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'column-schedule.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function statusBadge(status: 'ok' | 'warn' | 'fail'): string {
    if (status === 'ok') return '✓';
    if (status === 'warn') return '⚠';
    return '✗';
  }

  function statusClass(status: 'ok' | 'warn' | 'fail'): string {
    return `status-${status}`;
  }
</script>

<div class="col-schedule">
  {#if marks.length === 0}
    <div class="empty-msg">{t('pro.colSchedNoColumns')}</div>
  {:else}
    <div class="schedule-header">
      <span class="schedule-title">{t('pro.colSchedTitle')}</span>
      <span class="schedule-count">{marks.length} {t('pro.colSchedMarks')} · {marks.reduce((s, m) => s + m.elements.length, 0)} {t('pro.colSchedElements')}</span>
      <button class="csv-btn" onclick={exportCSV}>{t('pro.colSchedExportCsv')}</button>
    </div>

    <table class="schedule-table">
      <thead>
        <tr>
          <th>{t('pro.colSchedMark')}</th>
          <th>{t('pro.colSchedDims')}</th>
          <th>f'c</th>
          <th>{t('pro.colSchedLongBars')}</th>
          <th>{t('pro.colSchedTies')}</th>
          <th>#</th>
          <th>{t('pro.colSchedRatio')}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each rows as row, i}
          {@const mark = marks[i]}
          <tr class="schedule-row" class:expanded={expandedMark === mark.mark} onclick={() => toggleMark(mark.mark)}>
            <td class="mark-cell">{row.mark}</td>
            <td>{row.dimensions}</td>
            <td>{row.fc}</td>
            <td>{row.longBars}</td>
            <td>{row.tieConfig}</td>
            <td>{row.elementCount}</td>
            <td>
              <span class={statusClass(row.status)}>
                {(row.maxRatio * 100).toFixed(0)}% {statusBadge(row.status)}
              </span>
            </td>
            <td class="expand-arrow">{expandedMark === mark.mark ? '▾' : '▸'}</td>
          </tr>
          {#if expandedMark === mark.mark}
            <tr class="detail-row">
              <td colspan="8">
                <div class="mark-detail">
                  <div class="svgs">
                    <div class="svg-box">
                      <span class="svg-label">{t('pro.colSchedCrossSection')}</span>
                      {@html generateScheduleCrossSectionSvg(mark)}
                    </div>
                    <div class="svg-box">
                      <span class="svg-label">{t('pro.colSchedElevation')}</span>
                      {@html generateScheduleElevationSvg({
                        mark,
                        height: mark.elements[0]?.height ?? 3.0,
                      })}
                    </div>
                  </div>
                  <div class="elements-list">
                    <span class="list-label">{t('pro.colSchedElements')}:</span>
                    <table class="elements-table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>H (m)</th>
                          <th>Nu (kN)</th>
                          <th>Mu (kN·m)</th>
                          <th>Vu (kN)</th>
                          <th>{t('pro.colSchedRatio')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {#each mark.elements as el}
                          <tr>
                            <td>E{el.elementId}</td>
                            <td>{el.height.toFixed(2)}</td>
                            <td>{el.Nu.toFixed(1)}</td>
                            <td>{el.Mu.toFixed(1)}</td>
                            <td>{el.Vu.toFixed(1)}</td>
                            <td class={statusClass(el.status)}>{(el.ratio * 100).toFixed(0)}% {statusBadge(el.status)}</td>
                          </tr>
                        {/each}
                      </tbody>
                    </table>
                  </div>
                </div>
              </td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .col-schedule {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .empty-msg {
    font-size: 0.75rem;
    color: #666;
    padding: 16px;
    text-align: center;
  }

  .schedule-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 0;
  }

  .schedule-title {
    font-size: 0.8rem;
    font-weight: 600;
    color: #4ecdc4;
  }

  .schedule-count {
    font-size: 0.7rem;
    color: #666;
    flex: 1;
  }

  .csv-btn {
    padding: 3px 10px;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    color: #aaa;
    font-size: 0.68rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .csv-btn:hover {
    background: #1a4a7a;
    color: white;
  }

  .schedule-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.72rem;
  }

  .schedule-table th {
    text-align: left;
    padding: 5px 6px;
    color: #888;
    border-bottom: 1px solid #1a3a5a;
    font-weight: 600;
    font-size: 0.68rem;
    text-transform: uppercase;
  }

  .schedule-row {
    cursor: pointer;
    transition: background 0.1s;
  }

  .schedule-row:hover {
    background: #1a2a40;
  }

  .schedule-row.expanded {
    background: #0f2840;
  }

  .schedule-row td {
    padding: 5px 6px;
    border-bottom: 1px solid #1a2a3a;
    color: #ccc;
  }

  .mark-cell {
    font-weight: 600;
    color: #4ecdc4;
  }

  .expand-arrow {
    color: #555;
    text-align: center;
    width: 20px;
  }

  .detail-row td {
    padding: 0;
    border-bottom: 1px solid #1a3a5a;
  }

  .mark-detail {
    padding: 10px 8px;
    background: #0a1828;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .svgs {
    display: flex;
    gap: 16px;
    justify-content: center;
    flex-wrap: wrap;
  }

  .svg-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .svg-label {
    font-size: 0.65rem;
    color: #666;
    text-transform: uppercase;
  }

  .elements-list {
    padding: 4px 0;
  }

  .list-label {
    font-size: 0.68rem;
    color: #888;
    font-weight: 600;
  }

  .elements-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.68rem;
    margin-top: 4px;
  }

  .elements-table th {
    text-align: left;
    padding: 3px 5px;
    color: #666;
    font-size: 0.65rem;
    border-bottom: 1px solid #1a2a3a;
  }

  .elements-table td {
    padding: 3px 5px;
    color: #aaa;
    border-bottom: 1px solid #111a28;
  }

  .status-ok { color: #4caf50; }
  .status-warn { color: #f0a500; }
  .status-fail { color: #e94560; }
</style>
