<script lang="ts">
  import { containmentDismissal } from '../../lib/store/containment-dismissal.svelte';
  import { noticePrefs } from '../../lib/store/notice-prefs.svelte';
  import { t } from '../../lib/i18n';
  let { refused }: { refused: boolean } = $props();
</script>

{#if !refused && containmentDismissal.any}
  <button class="pk-btn" onclick={() => containmentDismissal.restore()} data-testid="containment-restore">{t('containment.restore')}</button>
{/if}
{#if noticePrefs.hidden.length}
  <button class="pk-btn" onclick={() => noticePrefs.showAll()} data-testid="notices-restore-hidden">{t('notices.restoreHidden')}</button>
{/if}
