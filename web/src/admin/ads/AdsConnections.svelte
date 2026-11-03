<script lang="ts">
  import { t } from '../../lib/i18n';
  import { adsReport } from '../admin-marketing.svelte';
  import { adminErrorText } from '../error-text';
  import { channelLabel } from './ads-format';

  let { open = $bindable(false) }: { open?: boolean } = $props();

  $effect(() => {
    if (open) void adsReport.check();
  });
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <div class="ads-overlay" onclick={() => (open = false)} onkeydown={(e) => e.key === 'Escape' && (open = false)}>
    <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
    <div class="ads-dialog" role="dialog" aria-modal="true" aria-labelledby="ads-conn-title" onclick={(e) => e.stopPropagation()} data-testid="ads-connections">
      <h2 id="ads-conn-title">{t('admin.ads.connections')}</h2>
      {#if adsReport.checking}
        <p class="ins-muted">{t('admin.ads.checking')}</p>
      {:else if adsReport.connectionsError}
        <p class="ins-banner" role="alert">{adminErrorText(adsReport.connectionsError)}</p>
      {:else if adsReport.connections?.length === 0}
        <p class="ins-muted">{t('admin.ads.noAccounts')}</p>
      {:else}
        {#each adsReport.connections ?? [] as report (report.id)}
          <div class="ads-conn">
            <h3>{channelLabel(report.channel)} · {report.name ?? report.external_id}</h3>
            <ul>
              {#each report.steps as step (step.key)}
                <li class={step.status}>
                  <span class="mark" aria-hidden="true">{step.status === 'ok' ? '✓' : step.status === 'error' ? '✕' : '–'}</span>
                  <span>{t(`admin.ads.step.${step.key}`)}</span>
                  {#if step.detail}<span class="detail">{step.detail}</span>{/if}
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      {/if}
      <div class="ads-actions">
        <button type="button" class="ins-btn" onclick={() => adsReport.check()} disabled={adsReport.checking}>{t('admin.ads.checkAgain')}</button>
        <button type="button" class="ins-btn" onclick={() => (open = false)}>{t('admin.ads.close')}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .ads-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; padding: 16px; z-index: 1000; }
  .ads-dialog { background: var(--st-surface); color: var(--st-text); border: 1px solid var(--st-hair); border-radius: 6px; padding: 20px; width: min(560px, 100%); max-height: 85vh; overflow: auto; display: flex; flex-direction: column; gap: 12px; }
  .ads-dialog h2 { margin: 0; font-size: 1rem; }
  .ads-conn h3 { margin: 0 0 6px; font-size: 0.85rem; }
  .ads-conn ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; font-size: 0.78rem; }
  .ads-conn li { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
  .ads-conn li.ok .mark { color: var(--st-ok); }
  .ads-conn li.error .mark { color: var(--st-danger); }
  .ads-conn li.skipped { color: var(--st-text-2); }
  .detail { font-family: var(--st-mono); font-size: 0.68rem; color: var(--st-text-2); flex-basis: 100%; padding-left: 20px; }
  .ads-actions { display: flex; justify-content: flex-end; gap: 8px; }
</style>
