<script lang="ts">
  import { t, tp } from '../../lib/i18n';
  import type { AdTotals, Display } from '../../lib/api/marketing-admin';
  import { count, delta, money, percent } from './ads-format';

  let { current, previous, display }: { current: AdTotals; previous: AdTotals; display: Display } = $props();

  type Kpi = { key: string; value: string; label: string; sub: string; change: number | null; lowerIsBetter?: boolean };

  const kpis = $derived<Kpi[]>([
    { key: 'spend', value: money(current.spend, display), label: t('admin.ads.kpi.spend'), sub: current.budget ? tp('admin.ads.kpi.spendSub', { pct: percent(current.budget_executed) }) : t('admin.ads.kpi.spendNoBudget'), change: delta(current.spend, previous.spend) },
    { key: 'clicks', value: count(current.clicks), label: t('admin.ads.kpi.clicks'), sub: tp('admin.ads.kpi.clicksSub', { ctr: percent(current.ctr), cpc: money(current.cpc, display) }), change: delta(current.clicks, previous.clicks) },
    { key: 'signup_clicks', value: count(current.signup_clicks), label: t('admin.ads.kpi.signupClicks'), sub: current.signup_clicks === null ? t('admin.ads.notMeasured') : tp('admin.ads.kpi.signupClicksSub', { pct: percent(current.signup_rate) }), change: delta(current.signup_clicks, previous.signup_clicks) },
    { key: 'signups', value: count(current.signups), label: t('admin.ads.kpi.signups'), sub: tp('admin.ads.kpi.costEach', { cost: money(current.cost_per_signup, display) }), change: delta(current.signups, previous.signups) },
    { key: 'accounts', value: count(current.accounts), label: t('admin.ads.kpi.accounts'), sub: tp('admin.ads.kpi.costEach', { cost: money(current.cost_per_account, display) }), change: delta(current.accounts, previous.accounts) },
    { key: 'activated', value: count(current.activated), label: t('admin.ads.kpi.activated'), sub: tp('admin.ads.kpi.costEach', { cost: money(current.cost_per_activated, display) }), change: delta(current.activated, previous.activated) },
  ]);
</script>

<div class="ins-cards ads-kpis" data-testid="ads-kpis">
  {#each kpis as k (k.key)}
    <div class="ins-card">
      <span class="ins-card-value" data-testid={`ads-kpi-${k.key}`}>{k.value}</span>
      <span class="ins-card-label">{k.label}</span>
      <span class="ads-sub">{k.sub}</span>
      {#if k.change !== null}
        <span class="ads-delta" class:up={k.key !== 'spend' && k.change > 0} class:down={k.key !== 'spend' && k.change < 0}>{k.change > 0 ? '▲' : k.change < 0 ? '▼' : '='} {percent(Math.abs(k.change))} {t('admin.ads.vsPrevious')}</span>
      {/if}
    </div>
  {/each}
</div>
<p class="ads-note">{t('admin.ads.kpi.oursNote')}</p>

<style>
  .ads-sub { font-size: 0.7rem; color: var(--st-text-2); }
  .ads-delta { font-family: var(--st-mono); font-size: 0.66rem; color: var(--st-text-2); }
  .ads-delta.up { color: var(--st-ok); }
  .ads-delta.down { color: var(--st-warn); }
  .ads-note { margin: 0; font-size: 0.72rem; color: var(--st-text-2); max-width: 80ch; }
</style>
