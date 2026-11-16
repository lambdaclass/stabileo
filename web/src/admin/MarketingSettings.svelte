<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '../lib/i18n';
  import { marketingSettings } from './admin-marketing.svelte';
  import { adminErrorText } from './error-text';

  const META_PARAMS = 'utm_source={{site_source_name}}&utm_medium=paid&utm_campaign={{campaign.name}}&utm_term={{adset.name}}&utm_content={{ad.name}}';
  const GOOGLE_PARAMS = '{lpurl}?utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_term={adgroupid}&utm_content={creative}&network={network}';

  onMount(() => {
    void marketingSettings.load();
  });

  const s = $derived(marketingSettings.settings);

  const rows = $derived(
    s
      ? [
          { key: 'meta_pixel_id', value: s.meta_pixel_id },
          { key: 'meta_capi_access_token', value: s.meta_capi_access_token ? t('admin.mkt.set') : null },
          { key: 'meta_capi_test_event_code', value: s.meta_capi_test_event_code },
          { key: 'gtm_container_id', value: s.gtm_container_id },
        ]
      : [],
  );

  function copy(text: string) {
    void navigator.clipboard?.writeText(text);
  }
</script>

<h2 class="adm-h2" id="marketing">{t('admin.mkt.title')}</h2>
<div class="adm-card mkt" data-testid="admin-marketing">
  <p class="adm-help">{t('admin.mkt.lede')}</p>

  {#if marketingSettings.error}
    <div class="adm-banner" role="alert">{adminErrorText(marketingSettings.error)}</div>
  {/if}

  {#if s}
    {#each rows as row (row.key)}
      <div class="mkt-field">
        <span class="mkt-label">{t(`admin.mkt.f.${row.key}`)}</span>
        <span class="mkt-state" data-testid={`mkt-state-${row.key}`}>{row.value ?? t('admin.mkt.notSet')}</span>
        <span class="adm-help">{t(`admin.mkt.h.${row.key}`)}</span>
      </div>
    {/each}

    <h3 class="mkt-h3">{t('admin.mkt.params')}</h3>
    <p class="adm-help">{t('admin.mkt.paramsHelp')}</p>
    {#each [{ name: 'Meta', text: META_PARAMS }, { name: 'Google Ads', text: GOOGLE_PARAMS }] as p (p.name)}
      <div class="mkt-param">
        <span class="mkt-label">{p.name}</span>
        <code>{p.text}</code>
        <button type="button" class="ins-btn" onclick={() => copy(p.text)}>{t('admin.mkt.copy')}</button>
      </div>
    {/each}
    <p class="adm-help">{t('admin.mkt.customConversions')}</p>
  {:else if marketingSettings.loading}
    <p class="adm-muted">{t('admin.loading')}</p>
  {/if}
</div>

<style>
  .mkt { display: flex; flex-direction: column; gap: 10px; }
  .mkt :global(.adm-help) { font-size: 0.72rem; line-height: 1.45; color: var(--st-text-2); margin: 0; }
  .mkt-h3 { margin: 12px 0 0; font-size: 0.85rem; }
  .mkt-field { display: grid; grid-template-columns: minmax(160px, 220px) 1fr; gap: 4px 12px; align-items: start; }
  .mkt-field > .adm-help, .mkt-field > .mkt-state { grid-column: 2; }
  .mkt-label { font-size: 0.78rem; font-weight: 600; }
  .mkt-state { font-family: var(--st-mono); font-size: 0.72rem; color: var(--st-text); overflow-wrap: anywhere; }
  .mkt-param { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .mkt-param code { flex: 1 1 360px; font-size: 0.68rem; background: var(--st-surface-2); padding: 6px 8px; border-radius: 3px; overflow-wrap: anywhere; }
  @media (max-width: 640px) {
    .mkt-field { grid-template-columns: 1fr; }
    .mkt-field > * { grid-column: 1 !important; }
  }
</style>
