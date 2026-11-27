<script lang="ts">
  /** Visits and use count nothing while the server stores no usage data; the account figures do not depend on it. */
  import { adminSettings } from './admin-settings.svelte';
  import { adminRoute } from './admin-route.svelte';
  import { t } from '../lib/i18n';
</script>

{#if adminSettings.settings && !adminSettings.flag('usage_telemetry_enabled')}
  <div class="ins-notice" role="status" data-testid="admin-metrics-usage-off">
    <p>{t('admin.metrics.usageOff')}</p>
    <button type="button" class="ins-notice-link" onclick={() => adminRoute.navigate('settings')} data-testid="admin-metrics-usage-off-settings">{t('admin.metrics.usageOffLink')}</button>
  </div>
{/if}
