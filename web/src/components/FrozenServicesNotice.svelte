<script lang="ts">
  import { i18n } from '../lib/i18n';
  import { FROZEN_SERVICES_NOTICE } from '../lib/frozen-services';
</script>

<p class="frozen-services-notice" data-testid="frozen-services-notice">{FROZEN_SERVICES_NOTICE[i18n.locale] ?? FROZEN_SERVICES_NOTICE.en}</p>

<style>
  .frozen-services-notice {
    margin: 0;
    padding: 12px;
    min-width: 0;
    overflow-wrap: anywhere;
    font-size: 14px;
    line-height: 1.5;
  }
</style>
