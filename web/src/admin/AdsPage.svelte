<script lang="ts">
  import { onMount } from 'svelte';
  import { t, tp } from '../lib/i18n';
  import { adsReport, acquisition } from './admin-marketing.svelte';
  import { adminRoute } from './admin-route.svelte';
  import { adminErrorText } from './error-text';
  import { formatDateTime } from './format';
  import type { Channel, Display } from '../lib/api/marketing-admin';
  import AdsKpis from './ads/AdsKpis.svelte';
  import AdsDaily from './ads/AdsDaily.svelte';
  import AdsGoals from './ads/AdsGoals.svelte';
  import AdsTree from './ads/AdsTree.svelte';
  import AdsConnections from './ads/AdsConnections.svelte';
  import AcquisitionPanel from './ads/AcquisitionPanel.svelte';
  import { channelLabel } from './ads/ads-format';

  const PERIODS = [7, 30, 90];
  const CHANNELS: Channel[] = ['all', 'meta', 'google'];
  const DISPLAYS: Display[] = ['USD', 'ARS'];

  let connectionsOpen = $state(false);

  onMount(() => {
    void adsReport.load();
    void acquisition.load(adsReport.filters.days);
  });

  function period(days: number) {
    void adsReport.load({ days });
    void acquisition.load(days);
  }

  const o = $derived(adsReport.overview);
  const lastSync = $derived(
    o?.accounts.map((a) => a.last_synced_at).filter((d): d is string => d !== null).sort().at(-1) ?? null,
  );
  const failing = $derived(o?.accounts.filter((a) => a.sync_status === 'error') ?? []);
</script>

<section class="ins" aria-labelledby="ads-title" data-testid="admin-ads">
  <div class="ins-head">
    <h1 id="ads-title" class="ins-h1">{t('admin.ads.title')}</h1>
    <div class="ins-toolbar">
      {#each PERIODS as d (d)}
        <button type="button" class="ins-btn" class:on={adsReport.filters.days === d} onclick={() => period(d)} data-testid={`ads-days-${d}`}>{tp('admin.metrics.days', { n: d })}</button>
      {/each}
      <span class="ads-sep"></span>
      {#each CHANNELS as c (c)}
        <button type="button" class="ins-btn" class:on={adsReport.filters.channel === c} onclick={() => adsReport.load({ channel: c })} data-testid={`ads-channel-${c}`}>{c === 'all' ? t('admin.ads.channel.all') : channelLabel(c)}</button>
      {/each}
      <span class="ads-sep"></span>
      {#each DISPLAYS as d (d)}
        <button type="button" class="ins-btn" class:on={adsReport.filters.display === d} onclick={() => adsReport.load({ display: d })} data-testid={`ads-display-${d}`}>{d}</button>
      {/each}
    </div>
  </div>
  <p class="ins-lede">{t('admin.ads.lede')}</p>

  <div class="ads-syncbar">
    <span class="ins-muted">{lastSync ? tp('admin.ads.lastSync', { when: formatDateTime(lastSync) }) : t('admin.ads.neverSynced')}</span>
    {#if o}<span class="ins-muted">· {tp('admin.ads.every', { n: o.sync_interval_minutes })}</span>{/if}
    <button type="button" class="ins-btn" onclick={async () => { await adsReport.sync(); }} disabled={adsReport.syncing} data-testid="ads-sync">{t('admin.ads.syncNow')}</button>
    {#if adsReport.queued !== null}<span class="ins-muted" data-testid="ads-queued">{tp('admin.ads.queued', { n: adsReport.queued })}</span>{/if}
    <button type="button" class="ins-btn" onclick={() => (connectionsOpen = true)} data-testid="ads-open-connections">{t('admin.ads.connections')}</button>
  </div>

  {#if adsReport.error}
    <div class="ins-banner" role="alert">{adminErrorText(adsReport.error)}</div>
  {/if}
  {#each failing as a (a.id)}
    <div class="ins-banner" role="alert">{tp('admin.ads.syncFailed', { account: `${channelLabel(a.channel)} ${a.name ?? a.external_id}`, error: a.last_sync_error ?? '' })}</div>
  {/each}

  {#if o && o.accounts.length === 0}
    <div class="ins-panel" data-testid="ads-empty">
      <h2>{t('admin.ads.emptyTitle')}</h2>
      <p class="ins-muted">{t('admin.ads.emptyBody')}</p>
      <button type="button" class="ins-btn" onclick={() => adminRoute.navigate('settings')}>{t('admin.ads.goSettings')}</button>
    </div>
  {:else if o}
    {#if o.fx_missing}<div class="ins-banner" role="alert">{t('admin.ads.fxMissing')}</div>{/if}
    <p class="ins-muted">{tp('admin.ads.period', { from: o.period.from, to: o.period.to })}</p>
    <AdsKpis current={o.kpis.current} previous={o.kpis.previous} display={o.display} />
    <AdsDaily daily={o.daily} display={o.display} />
    <AdsGoals goals={o.goals} display={o.display} />
    <AdsTree tree={o.tree} display={o.display} />
  {:else if adsReport.loading}
    <p class="ins-muted">{t('admin.loading')}</p>
  {/if}

  {#if acquisition.data}
    <AcquisitionPanel data={acquisition.data} />
  {/if}
</section>

<AdsConnections bind:open={connectionsOpen} />

<style>
  .ins-lede { margin: -6px 0 0; font-size: 0.78rem; line-height: 1.5; color: var(--st-text-2); max-width: 80ch; }
  .ads-sep { width: 1px; align-self: stretch; background: var(--st-hair); margin: 0 4px; }
  .ads-syncbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 0.74rem; }
</style>
