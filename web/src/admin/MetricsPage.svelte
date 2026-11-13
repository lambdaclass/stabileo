<script lang="ts">
  import { onMount } from 'svelte';
  import { adminMetrics } from './admin-insights.svelte';
  import { adminRoute } from './admin-route.svelte';
  import { adminErrorText } from './error-text';
  import { metricLabel } from './metric-labels';
  import { t, tp, i18n } from '../lib/i18n';
  import type { Count, UsageBreakdown } from '../lib/api/admin';

  const PERIODS = [7, 30, 90];
  const USE_PANELS: UsageBreakdown[] = ['modes', 'diagrams', 'tools', 'advanced', 'step_methods', 'examples', 'exports'];
  const DAY_MS = 86_400_000;

  onMount(() => {
    void adminMetrics.load();
  });

  const s = $derived(adminMetrics.summary);

  const days = $derived.by(() => {
    if (!s) return [];
    const byDay = new Map(s.visitors.daily.map((d) => [d.day.slice(0, 10), d]));
    const today = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
    return Array.from({ length: s.days }, (_, i) => {
      const day = new Date(today - (s.days - 1 - i) * DAY_MS).toISOString().slice(0, 10);
      const d = byDay.get(day);
      return { day, visits: d?.visits ?? 0, solving: d?.solving ?? 0 };
    });
  });
  const peak = $derived(Math.max(1, ...days.map((d) => d.visits)));

  function pct(part: number, whole: number): string {
    return whole > 0 ? `${Math.round((part / whole) * 100)} %` : '—';
  }

  function shortDay(day: string): string {
    return new Date(`${day}T12:00:00Z`).toLocaleDateString(i18n.locale, { day: 'numeric', month: 'short' });
  }

  function max(list: Count[]) {
    return Math.max(1, ...list.map((c) => c.count));
  }
</script>

<section class="ins" aria-labelledby="ins-metrics-title" data-testid="admin-metrics">
  <div class="ins-head">
    <h1 id="ins-metrics-title" class="ins-h1">{t('admin.metrics.title')}</h1>
    <div class="ins-toolbar">
      {#each PERIODS as d (d)}
        <button type="button" class="ins-btn" class:on={adminMetrics.days === d} onclick={() => adminMetrics.load(d)} data-testid={`admin-metrics-days-${d}`}>
          {tp('admin.metrics.days', { n: d })}
        </button>
      {/each}
    </div>
  </div>
  <p class="ins-lede">{t('admin.metrics.lede')}</p>

  {#if adminMetrics.error}
    <div class="ins-banner" role="alert">{adminErrorText(adminMetrics.error)}</div>
  {/if}

  {#if !s}
    {#if adminMetrics.loading}<p class="ins-muted">{t('admin.loading')}</p>{/if}
  {:else}
    <h2 class="ins-section">{t('admin.metrics.sec.visits')}</h2>
    <div class="ins-cards">
      {@render card(s.visitors.visits, t('admin.metrics.visits'), t('admin.metrics.visitsHelp'), 'metric-visits')}
      {@render card(s.visitors.visits_with_solve, t('admin.metrics.solving'), tp('admin.metrics.solvingHelp', { pct: pct(s.visitors.visits_with_solve, s.visitors.visits) }), 'metric-solving')}
      {@render card(s.visitors.solves, t('admin.metrics.solves'), t('admin.metrics.solvesHelp'), 'metric-solves')}
      {@render card(s.visitors.browsers, t('admin.metrics.browsers'), t('admin.metrics.browsersHelp'), 'metric-browsers')}
    </div>

    <div class="ins-panel">
      <h2>{t('admin.metrics.daily')}</h2>
      <p class="ins-panel-help">{t('admin.metrics.dailyHelp')}</p>
      <div class="chart" data-testid="metric-chart">
        <span class="chart-peak">{peak}</span>
        <div class="chart-cols">
          {#each days as d (d.day)}
            <div class="chart-col" title={tp('admin.metrics.dayTip', { day: shortDay(d.day), visits: d.visits, solving: d.solving })}>
              <span class="bar all" style={`height:${(d.visits / peak) * 100}%`}></span>
              <span class="bar solve" style={`height:${(d.solving / peak) * 100}%`}></span>
            </div>
          {/each}
        </div>
      </div>
      <div class="ins-legend">
        <span><span class="sw all"></span>{t('admin.metrics.visits')}</span>
        <span><span class="sw solve"></span>{t('admin.metrics.solving')}</span>
        {#if days.length}<span class="range">{shortDay(days[0].day)} – {shortDay(days[days.length - 1].day)}</span>{/if}
      </div>
    </div>

    <h2 class="ins-section">{t('admin.metrics.sec.use')}</h2>
    <p class="ins-lede">{t('admin.metrics.useHelp')}</p>
    <div class="ins-grid">
      {#each USE_PANELS as key (key)}
        {@render bars(key, t(`admin.metrics.b.${key}`), null, s.usage[key] ?? [])}
      {/each}
      {@render bars('solve_outcomes', t('admin.metrics.b.solve_outcomes'), t('admin.metrics.countsSolves'), s.usage.solve_outcomes)}
      {@render bars('solve_dims', t('admin.metrics.b.solve_dims'), t('admin.metrics.countsSolves'), s.usage.solve_dims)}
      {@render bars('locales', t('admin.metrics.b.locales'), null, s.usage.locales)}
      {@render bars('versions', t('admin.metrics.b.versions'), null, s.usage.versions)}
    </div>

    <h2 class="ins-section">{t('admin.metrics.sec.accounts')}</h2>
    <div class="ins-cards">
      {@render card(s.accounts.total, t('admin.metrics.accounts'), t('admin.metrics.accountsHelp'), 'metric-accounts')}
      {@render card(s.accounts.new, t('admin.metrics.newAccounts'), tp('admin.metrics.newAccountsHelp', { n: s.days }), 'metric-new-accounts')}
      {@render card(s.accounts.active_7d, t('admin.metrics.active7d'), t('admin.metrics.active7dHelp'), 'metric-active')}
      {@render card(s.accounts.consents.usage_analytics, t('admin.metrics.consentUsage'), t('admin.metrics.consentUsageHelp'), 'metric-consent-usage')}
      {@render card(s.accounts.consents.model_research, t('admin.metrics.consentResearch'), t('admin.metrics.consentResearchHelp'), 'metric-consent-research')}
    </div>

    <div class="ins-grid">
      <div class="ins-panel" data-testid="metric-gate">
        <h2>{t('admin.metrics.gate')}</h2>
        <p class="ins-panel-help">{t('admin.metrics.gateHelp')}</p>
        <p class="funnel">
          <strong>{s.gate.asked}</strong> {t('admin.metrics.gateAsked')} →
          <strong>{s.gate.passed}</strong> {t('admin.metrics.gatePassed')}
          <span class="ins-muted">({pct(s.gate.passed, s.gate.asked)})</span>
        </p>
        {@render list('gate_actions', s.usage.gate_actions)}
      </div>
      <div class="ins-panel">
        <h2>{t('admin.metrics.projects')}</h2>
        <p class="ins-panel-help">{tp('admin.metrics.projectsHelp', { limit: s.projects.limit })}</p>
        <p class="funnel">
          <strong>{s.projects.total}</strong> {t('admin.metrics.projectsSaved')} ·
          <strong>{s.projects.accounts}</strong> {t('admin.metrics.projectsAccounts')}
        </p>
        {@render list('modes', s.projects.by_mode)}
        <button type="button" class="ins-link" onclick={() => adminRoute.navigate('projects')}>{t('admin.metrics.seeProjects')}</button>
      </div>
      <div class="ins-panel">
        <h2>{t('admin.metrics.feedbackNew')}</h2>
        <p class="funnel"><strong>{s.feedback.new}</strong></p>
        <button type="button" class="ins-link" onclick={() => adminRoute.navigate('feedback')}>{t('admin.metrics.seeFeedback')}</button>
      </div>
    </div>
  {/if}
</section>

{#snippet card(value: number, label: string, help: string, testid: string)}
  <div class="ins-card">
    <span class="ins-card-value" data-testid={testid}>{value}</span>
    <span class="ins-card-label">{label}</span>
    <span class="ins-card-help">{help}</span>
  </div>
{/snippet}

{#snippet bars(kind: UsageBreakdown, title: string, help: string | null, items: Count[])}
  <div class="ins-panel" data-testid={`metric-${kind}`}>
    <h2>{title}</h2>
    <p class="ins-panel-help">{help ?? t('admin.metrics.countsVisits')}</p>
    {@render list(kind, items)}
  </div>
{/snippet}

{#snippet list(kind: UsageBreakdown, items: Count[])}
  {#if items.length === 0}
    <p class="ins-muted">{t('admin.metrics.noData')}</p>
  {:else}
    <ul class="ins-bars">
      {#each items as c (c.label)}
        <li class="ins-bar">
          <span class="ins-bar-label" title={c.label}>{metricLabel(kind, c.label)}</span>
          <span class="ins-bar-track"><span class="ins-bar-fill" style={`display:block;width:${(c.count / max(items)) * 100}%`}></span></span>
          <span class="ins-bar-n">{c.count}</span>
        </li>
      {/each}
    </ul>
  {/if}
{/snippet}

<style>
  .ins-section { margin: 8px 0 0; font-size: 0.95rem; font-weight: 600; color: var(--st-text); }
  .ins-lede { margin: -6px 0 0; font-size: 0.78rem; line-height: 1.5; color: var(--st-text-2); max-width: 70ch; }
  .ins-card-help { font-size: 0.68rem; line-height: 1.4; color: var(--st-text-3, var(--st-text-2)); }
  .ins-panel-help { margin: -6px 0 10px; font-size: 0.7rem; line-height: 1.4; color: var(--st-text-2); }
  .chart { display: grid; grid-template-columns: auto 1fr; gap: 6px; height: 150px; }
  .chart-peak { font-family: var(--st-mono); font-size: 0.66rem; color: var(--st-text-2); align-self: start; }
  .chart-cols { display: flex; align-items: flex-end; gap: 2px; border-bottom: 1px solid var(--st-hair-strong); border-left: 1px solid var(--st-hair-strong); padding-left: 2px; }
  .chart-col { position: relative; flex: 1; height: 100%; min-width: 0; }
  .chart-col:hover { background: var(--st-surface-2); }
  .bar { position: absolute; left: 12%; right: 12%; bottom: 0; border-radius: 2px 2px 0 0; }
  .bar.all { background: color-mix(in srgb, var(--st-accent) 30%, var(--st-surface-3)); }
  .bar.solve { background: var(--st-accent); left: 30%; right: 30%; }
  .sw { display: inline-block; width: 9px; height: 9px; margin-right: 5px; border-radius: 2px; vertical-align: -1px; }
  .sw.all { background: color-mix(in srgb, var(--st-accent) 30%, var(--st-surface-3)); }
  .sw.solve { background: var(--st-accent); }
  .range { margin-left: auto; font-family: var(--st-mono); }
  .funnel { margin: 0 0 10px; font-size: 0.82rem; color: var(--st-text); }
  .funnel strong { font-family: var(--st-display); font-size: 1.1rem; }
  .ins-link { margin-top: 10px; padding: 0; background: none; border: none; color: var(--st-interactive, var(--st-accent)); font: inherit; font-size: 0.74rem; cursor: pointer; text-decoration: underline; }
</style>
