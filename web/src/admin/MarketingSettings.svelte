<script lang="ts">
  /**
   * Settings → Publicidad: the pixel, GTM and the ad accounts with their credentials. A secret
   * shows only whether it is set and a hint; typing a new one replaces it, leaving it blank keeps
   * it. Only the fields changed are sent, so a save never rewrites what nobody touched.
   */
  import { onMount } from 'svelte';
  import { t, tp } from '../lib/i18n';
  import { marketingSettings } from './admin-marketing.svelte';
  import { adminErrorText } from './error-text';
  import type { PlainField, SecretField, MarketingUpdate } from '../lib/api/marketing-admin';

  type Field = { key: PlainField | SecretField; secret: boolean; multiline?: boolean };
  const GROUPS: { title: string; fields: Field[] }[] = [
    {
      title: 'admin.mkt.meta',
      fields: [
        { key: 'meta_pixel_id', secret: false },
        { key: 'meta_capi_access_token', secret: true },
        { key: 'meta_capi_test_event_code', secret: false },
        { key: 'meta_ad_account_id', secret: false },
        { key: 'meta_ads_access_token', secret: true },
      ],
    },
    {
      title: 'admin.mkt.google',
      fields: [
        { key: 'gtm_container_id', secret: false },
        { key: 'google_ads_customer_id', secret: false },
        { key: 'google_ads_login_customer_id', secret: false },
        { key: 'google_ads_service_account', secret: true, multiline: true },
      ],
    },
  ];

  const META_PARAMS = 'utm_source={{site_source_name}}&utm_medium=paid&utm_campaign={{campaign.id}}&utm_term={{adset.id}}&utm_content={{ad.id}}';
  const GOOGLE_PARAMS = '{lpurl}?utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_term={adgroupid}&utm_content={creative}&network={network}';

  let drafts = $state<Partial<Record<PlainField | SecretField, string>>>({});
  let cleared = $state<Partial<Record<SecretField, boolean>>>({});
  let interval = $state<number | null>(null);
  let saved = $state(false);

  onMount(() => {
    void marketingSettings.load();
  });

  const s = $derived(marketingSettings.settings);

  function plainValue(key: PlainField): string {
    return drafts[key] ?? s?.[key] ?? '';
  }

  const changes = $derived.by(() => {
    if (!s) return {};
    const out: MarketingUpdate = {};
    for (const group of GROUPS) {
      for (const f of group.fields) {
        const draft = drafts[f.key];
        if (f.secret) {
          if (cleared[f.key as SecretField]) out[f.key] = null;
          else if (draft && draft.trim()) out[f.key] = draft;
        } else if (draft !== undefined && draft !== (s[f.key as PlainField] ?? '')) {
          out[f.key] = draft;
        }
      }
    }
    if (interval !== null && interval !== s.sync_interval_minutes) out.sync_interval_minutes = interval;
    return out;
  });
  const dirty = $derived(Object.keys(changes).length > 0);

  async function save() {
    saved = false;
    if (await marketingSettings.save(changes)) {
      drafts = {};
      cleared = {};
      interval = null;
      saved = true;
    }
  }

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
    {#each GROUPS as group (group.title)}
      <h3 class="mkt-h3">{t(group.title)}</h3>
      {#each group.fields as f (f.key)}
        <label class="mkt-field">
          <span class="mkt-label">{t(`admin.mkt.f.${f.key}`)}</span>
          {#if f.secret}
            {@const secret = s.secrets[f.key as SecretField]}
            <span class="mkt-state" data-testid={`mkt-state-${f.key}`}>
              {#if cleared[f.key as SecretField]}{t('admin.mkt.willClear')}{:else if secret.set}{tp('admin.mkt.isSet', { hint: secret.hint ?? '' })}{:else}{t('admin.mkt.notSet')}{/if}
            </span>
            {#if f.multiline}
              <textarea class="ins-input" rows="3" placeholder={t('admin.mkt.secretPlaceholder')} bind:value={drafts[f.key]} data-testid={`mkt-${f.key}`}></textarea>
            {:else}
              <input class="ins-input" type="password" autocomplete="off" placeholder={t('admin.mkt.secretPlaceholder')} bind:value={drafts[f.key]} data-testid={`mkt-${f.key}`} />
            {/if}
            {#if secret.set && !cleared[f.key as SecretField]}
              <button type="button" class="mkt-clear" onclick={() => (cleared[f.key as SecretField] = true)}>{t('admin.mkt.clear')}</button>
            {/if}
          {:else}
            <input class="ins-input" type="text" autocomplete="off" value={plainValue(f.key as PlainField)} oninput={(e) => (drafts[f.key] = e.currentTarget.value)} data-testid={`mkt-${f.key}`} />
          {/if}
          <span class="adm-help">{t(`admin.mkt.h.${f.key}`)}</span>
        </label>
      {/each}
    {/each}

    <h3 class="mkt-h3">{t('admin.mkt.sync')}</h3>
    <label class="mkt-field">
      <span class="mkt-label">{t('admin.mkt.syncEvery')}</span>
      <input class="ins-input mkt-num" type="number" min="5" max="1440" value={interval ?? s.sync_interval_minutes} oninput={(e) => (interval = Number(e.currentTarget.value))} data-testid="mkt-interval" />
    </label>

    {#if marketingSettings.saveError}
      <div class="adm-banner" role="alert">{adminErrorText(marketingSettings.saveError)}</div>
    {/if}
    <div class="mkt-actions">
      <button type="button" class="ins-btn" disabled={!dirty || marketingSettings.saving} onclick={save} data-testid="mkt-save">{t('admin.mkt.save')}</button>
      {#if saved && !dirty}<span class="adm-muted" data-testid="mkt-saved">{t('admin.mkt.saved')}</span>{/if}
    </div>

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
  .mkt-field > .adm-help, .mkt-field > .mkt-state, .mkt-field > .mkt-clear { grid-column: 2; }
  .mkt-field > input, .mkt-field > textarea { grid-column: 2; }
  .mkt-label { font-size: 0.78rem; font-weight: 600; padding-top: 6px; }
  .mkt-state { font-family: var(--st-mono); font-size: 0.7rem; color: var(--st-text-2); }
  .mkt-clear { justify-self: start; background: none; border: 0; padding: 0; color: var(--st-danger); font: inherit; font-size: 0.72rem; cursor: pointer; text-decoration: underline; }
  .mkt-num { width: 7rem; }
  .mkt-actions { display: flex; align-items: center; gap: 10px; }
  .mkt-param { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .mkt-param code { flex: 1 1 360px; font-size: 0.68rem; background: var(--st-surface-2); padding: 6px 8px; border-radius: 3px; overflow-wrap: anywhere; }
  @media (max-width: 640px) {
    .mkt-field { grid-template-columns: 1fr; }
    .mkt-field > * { grid-column: 1 !important; }
  }
</style>
