<script lang="ts">
  import { onMount } from 'svelte';
  import { adminMetrics } from './admin-insights.svelte';
  import { adminErrorText } from './error-text';
  import { t, tp } from '../lib/i18n';
  import type { Count } from '../lib/api/admin';

  const PERIODS = [7, 30, 90];
  const BREAKDOWNS = ['tools', 'diagrams', 'advanced', 'examples', 'exports', 'solve_outcomes', 'step_methods'] as const;

  onMount(() => {
    void adminMetrics.load();
  });

  const s = $derived(adminMetrics.summary);
  const signUps = $derived(s ? s.accounts.sign_ups.reduce((n, d) => n + d.count, 0) : 0);
  const daily = $derived(s?.usage.daily ?? []);
  const peak = $derived(Math.max(1, ...daily.map((d) => d.events)));
  const slots = $derived(Math.max(daily.length, adminMetrics.days));

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

  {#if adminMetrics.error}
    <div class="ins-banner" role="alert">{adminErrorText(adminMetrics.error)}</div>
  {/if}

  {#if !s}
    {#if adminMetrics.loading}<p class="ins-muted">{t('admin.loading')}</p>{/if}
  {:else}
    <div class="ins-cards">
      <div class="ins-card"><span class="ins-card-value" data-testid="metric-accounts">{s.accounts.total}</span><span class="ins-card-label">{t('admin.metrics.accounts')}</span></div>
      <div class="ins-card"><span class="ins-card-value">{signUps}</span><span class="ins-card-label">{tp('admin.metrics.signUps', { n: s.days })}</span></div>
      <div class="ins-card"><span class="ins-card-value">{s.accounts.active_7d}</span><span class="ins-card-label">{t('admin.metrics.active7d')}</span></div>
      <div class="ins-card"><span class="ins-card-value" data-testid="metric-installs">{s.usage.installs}</span><span class="ins-card-label">{tp('admin.metrics.installs', { n: s.days })}</span></div>
      <div class="ins-card"><span class="ins-card-value">{s.usage.events}</span><span class="ins-card-label">{t('admin.metrics.events')}</span></div>
      <div class="ins-card"><span class="ins-card-value">{s.projects.total}</span><span class="ins-card-label">{tp('admin.metrics.projects', { n: s.projects.accounts })}</span></div>
      <div class="ins-card"><span class="ins-card-value">{s.accounts.consents.usage_analytics}</span><span class="ins-card-label">{t('admin.metrics.consentUsage')}</span></div>
      <div class="ins-card"><span class="ins-card-value">{s.accounts.consents.model_research}</span><span class="ins-card-label">{t('admin.metrics.consentResearch')}</span></div>
      <div class="ins-card"><span class="ins-card-value">{s.feedback.new}</span><span class="ins-card-label">{t('admin.metrics.feedbackNew')}</span></div>
    </div>

    <div class="ins-panel">
      <h2>{t('admin.metrics.daily')}</h2>
      {#if daily.length === 0}
        <p class="ins-muted">{t('admin.metrics.noUsage')}</p>
      {:else}
        <svg class="ins-chart" viewBox={`0 0 ${slots * 12} 100`} preserveAspectRatio="none" role="img" aria-label={t('admin.metrics.daily')}>
          {#each daily as d, i (d.day)}
            <rect x={i * 12 + 1} y={100 - (d.events / peak) * 100} width="5" height={(d.events / peak) * 100}><title>{d.day}: {d.events}</title></rect>
            <rect class="alt" x={i * 12 + 6} y={100 - (d.installs / peak) * 100} width="5" height={(d.installs / peak) * 100}><title>{d.day}: {d.installs}</title></rect>
          {/each}
        </svg>
        <div class="ins-legend">
          <span><span class="sw ev"></span>{t('admin.metrics.events')}</span>
          <span><span class="sw in"></span>{t('admin.metrics.installsShort')}</span>
          <span class="range">{daily[0].day} – {daily[daily.length - 1].day}</span>
        </div>
      {/if}
    </div>

    <div class="ins-grid">
      {#each BREAKDOWNS as key (key)}
        {@render bars(t(`admin.metrics.b.${key}`), s.usage.breakdowns[key] ?? [])}
      {/each}
      {@render bars(t('admin.metrics.b.modes'), s.usage.modes)}
      {@render bars(t('admin.metrics.b.versions'), s.usage.versions)}
      {@render bars(t('admin.metrics.b.locales'), s.usage.locales)}
      {@render bars(t('admin.metrics.b.projectModes'), s.projects.by_mode)}
    </div>
  {/if}
</section>

{#snippet bars(title: string, list: Count[])}
  <div class="ins-panel">
    <h2>{title}</h2>
    {#if list.length === 0}
      <p class="ins-muted">{t('admin.metrics.noData')}</p>
    {:else}
      <ul class="ins-bars">
        {#each list as c (c.label)}
          <li class="ins-bar">
            <span class="ins-bar-label" title={c.label}>{c.label}</span>
            <span class="ins-bar-track"><span class="ins-bar-fill" style={`display:block;width:${(c.count / max(list)) * 100}%`}></span></span>
            <span class="ins-bar-n">{c.count}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/snippet}

<style>
  .sw { display: inline-block; width: 9px; height: 9px; margin-right: 5px; border-radius: 2px; vertical-align: -1px; }
  .sw.ev { background: var(--st-accent); }
  .sw.in { background: color-mix(in srgb, var(--st-accent) 35%, var(--st-surface-3)); }
  .range { margin-left: auto; font-family: var(--st-mono); }
</style>
