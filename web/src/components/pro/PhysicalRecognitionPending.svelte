<script lang="ts">
  import { t, tp } from '../../lib/i18n';

  let { pending, onreview }: { pending: number; onreview: () => void } = $props();
</script>

<div class="pk-row ph-pending" data-testid="physical-pending">
  <span>{tp('physical.pending', { n: pending })}</span>
  <button class="pk-btn pk-btn-primary" onclick={onreview} data-testid="physical-review">{t('physical.pendingReview')}</button>
</div>

<style>
  .ph-pending { align-items: center; gap: 8px; padding: 6px 8px; border: 1px solid var(--st-warn, #d9a441); border-radius: var(--st-radius); color: var(--st-text); }
</style>
