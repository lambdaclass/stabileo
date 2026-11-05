<script lang="ts">
  import { onMount } from 'svelte';
  import { t, tp } from '../lib/i18n';
  import { acquisition } from './admin-marketing.svelte';
  import { adminErrorText } from './error-text';
  import AdsTree from './ads/AdsTree.svelte';
  import AcquisitionPanel from './ads/AcquisitionPanel.svelte';

  const PERIODS = [7, 30, 90];

  onMount(() => {
    void acquisition.load();
  });
</script>

<section class="ins" aria-labelledby="ads-title" data-testid="admin-ads">
  <div class="ins-head">
    <h1 id="ads-title" class="ins-h1">{t('admin.ads.title')}</h1>
    <div class="ins-toolbar">
      {#each PERIODS as d (d)}
        <button type="button" class="ins-btn" class:on={acquisition.days === d} onclick={() => acquisition.load(d)} data-testid={`ads-days-${d}`}>{tp('admin.metrics.days', { n: d })}</button>
      {/each}
    </div>
  </div>
  <p class="ins-lede">{t('admin.ads.lede')}</p>

  {#if acquisition.error}
    <div class="ins-banner" role="alert">{adminErrorText(acquisition.error)}</div>
  {/if}

  {#if acquisition.data}
    <p class="ins-muted">{tp('admin.ads.period', { from: acquisition.data.period.from, to: acquisition.data.period.to })}</p>
    <AdsTree campaigns={acquisition.data.campaigns} />
    <AcquisitionPanel data={acquisition.data} />
  {:else if acquisition.loading}
    <p class="ins-muted">{t('admin.loading')}</p>
  {/if}
</section>

<style>
  .ins-lede { margin: -6px 0 0; font-size: 0.78rem; line-height: 1.5; color: var(--st-text-2); max-width: 80ch; }
</style>
