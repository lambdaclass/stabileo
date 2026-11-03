<script lang="ts">
  import { i18n, t, tp } from '../../lib/i18n';
  import type { AdsOverview, Display } from '../../lib/api/marketing-admin';
  import { money } from './ads-format';

  let { daily, display }: { daily: AdsOverview['daily']; display: Display } = $props();

  const peakSpend = $derived(Math.max(1, ...daily.map((d) => d.spend)));
  const peakAccounts = $derived(Math.max(1, ...daily.map((d) => d.accounts)));

  function short(day: string): string {
    return new Date(`${day}T12:00:00Z`).toLocaleDateString(i18n.locale, { day: 'numeric', month: 'short' });
  }
</script>

<div class="ins-panel" data-testid="ads-daily">
  <h2>{t('admin.ads.daily')}</h2>
  <p class="ads-help">{t('admin.ads.dailyHelp')}</p>
  <div class="ads-chart">
    {#each daily as d (d.date)}
      <div
        class="ads-col"
        class:context={!d.in_period}
        title={tp('admin.ads.dayTip', { day: short(d.date), spend: money(d.spend, display), accounts: d.accounts, activated: d.activated })}
      >
        <span class="ads-spend" style={`height:${(d.spend / peakSpend) * 100}%`}></span>
        {#if d.accounts > 0}
          <span class="ads-dot" style={`bottom:${(d.accounts / peakAccounts) * 92}%`}>{d.accounts}</span>
        {/if}
      </div>
    {/each}
  </div>
  <div class="ins-legend">
    <span><span class="sw spend"></span>{t('admin.ads.kpi.spend')}</span>
    <span><span class="sw dot"></span>{t('admin.ads.kpi.accounts')}</span>
    {#if daily.length}<span class="range">{short(daily[0].date)} – {short(daily[daily.length - 1].date)}</span>{/if}
  </div>
</div>

<style>
  .ads-help { margin: -6px 0 10px; font-size: 0.7rem; color: var(--st-text-2); }
  .ads-chart { display: flex; align-items: flex-end; gap: 2px; height: 160px; border-bottom: 1px solid var(--st-hair-strong); position: relative; }
  .ads-col { position: relative; flex: 1; height: 100%; min-width: 0; }
  .ads-col:hover { background: var(--st-surface-2); }
  .ads-col.context { opacity: 0.45; }
  .ads-spend { position: absolute; left: 15%; right: 15%; bottom: 0; background: color-mix(in srgb, var(--st-accent) 45%, var(--st-surface-3)); border-radius: 2px 2px 0 0; }
  .ads-dot { position: absolute; left: 50%; transform: translate(-50%, 50%); min-width: 16px; height: 16px; padding: 0 3px; box-sizing: border-box; border-radius: 8px; background: var(--st-info, #4a8fd4); color: #fff; font-family: var(--st-mono); font-size: 0.6rem; line-height: 16px; text-align: center; }
  .sw { display: inline-block; width: 9px; height: 9px; margin-right: 5px; border-radius: 2px; vertical-align: -1px; }
  .sw.spend { background: color-mix(in srgb, var(--st-accent) 45%, var(--st-surface-3)); }
  .sw.dot { background: var(--st-info, #4a8fd4); border-radius: 50%; }
  .range { margin-left: auto; font-family: var(--st-mono); }
</style>
