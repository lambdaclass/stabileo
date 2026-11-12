<script lang="ts">
  import { t, tp } from '../../lib/i18n';
  import type { Acquisition, AcquisitionSummary } from '../../lib/api/marketing-admin';
  import { channelLabel, count, percent, triggerLabel } from './ads-format';

  let { data }: { data: Acquisition } = $props();

  const rate = (part: number, whole: number) => (whole > 0 ? part / whole : null);

  function hours(h: number | null): string {
    if (h === null) return '—';
    return h < 48 ? tp('admin.ads.acq.hours', { n: Math.round(h) }) : tp('admin.ads.acq.days', { n: Math.round(h / 24) });
  }
</script>

<div class="ins-panel" data-testid="acquisition">
  <h2>{t('admin.ads.acq.title')}</h2>
  <p class="acq-help">{t('admin.ads.acq.help')}</p>
  <p class="acq-funnel" data-testid="acquisition-totals">
    <strong>{count(data.totals.accounts)}</strong> {t('admin.ads.acq.accounts')} →
    <strong>{count(data.totals.analyzed)}</strong> {t('admin.ads.acq.analyzed')} →
    <strong>{count(data.totals.saved)}</strong> {t('admin.ads.acq.saved')} →
    <strong>{count(data.totals.exported)}</strong> {t('admin.ads.acq.exported')}
    <span class="ins-muted">· {tp('admin.ads.acq.returnedOf', { returned: data.totals.returned, eligible: data.totals.return_eligible })}</span>
  </p>

  {@render table('channel', t('admin.ads.acq.byChannel'), data.channels.map((c) => ({ label: channelLabel(c.channel), row: c })))}
  {@render table('trigger', t('admin.ads.acq.byTrigger'), data.triggers.map((c) => ({ label: triggerLabel(c.trigger), row: c })))}
</div>

{#snippet table(kind: string, title: string, rows: { label: string; row: AcquisitionSummary }[])}
  <h3 class="acq-h3">{title}</h3>
  {#if rows.length === 0}
    <p class="ins-muted">{t('admin.metrics.noData')}</p>
  {:else}
    <div class="ins-table-wrap">
      <table class="ins-table" data-testid={`acquisition-${kind}`}>
        <thead>
          <tr>
            <th></th>
            <th>{t('admin.ads.acq.accounts')}</th>
            <th>{t('admin.ads.acq.paid')}</th>
            <th>{t('admin.ads.acq.analyzedRate')}</th>
            <th>{t('admin.ads.acq.savedRate')}</th>
            <th>{t('admin.ads.acq.returnedRate')}</th>
            <th>{t('admin.ads.acq.timeToSave')}</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as { label, row }, i (i)}
            <tr>
              <td>{label}</td>
              <td class="ins-mono">{count(row.accounts)}</td>
              <td class="ins-mono">{count(row.paid)}</td>
              <td class="ins-mono">{percent(rate(row.analyzed, row.accounts))}</td>
              <td class="ins-mono">{percent(rate(row.saved, row.accounts))}</td>
              <td class="ins-mono">{percent(rate(row.returned, row.return_eligible))}</td>
              <td class="ins-mono">{hours(row.median_hours_to_save)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{/snippet}

<style>
  .acq-help { margin: -6px 0 10px; font-size: 0.7rem; color: var(--st-text-2); max-width: 90ch; }
  .acq-funnel { margin: 0 0 12px; font-size: 0.82rem; }
  .acq-funnel strong { font-family: var(--st-display); font-size: 1.05rem; }
  .acq-h3 { margin: 14px 0 6px; font-size: 0.8rem; }
  .ins-panel :global(.ins-mono) { white-space: nowrap; }
</style>
