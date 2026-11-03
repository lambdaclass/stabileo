<script lang="ts">
  import { t } from '../../lib/i18n';
  import { finiteSpectrumWarning } from '../../lib/engine/finite-spectrum-warning';

  let { result }: { result: { modes: readonly unknown[]; finiteSpectrumDiagnostic?: string } } = $props();
  const warning = $derived(finiteSpectrumWarning(result, t));
</script>

{#if warning}
  <p class="finite-spectrum-warning" role="status" data-testid="finite-spectrum-warning">{warning}</p>
{/if}

<style>
  .finite-spectrum-warning { font-size: max(0.8rem, 12px); line-height: 1.5; overflow-wrap: anywhere; }
</style>
