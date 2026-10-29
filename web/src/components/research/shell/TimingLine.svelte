<script lang="ts">
  import { publicI18n } from '../../../lib/i18n/store.svelte';
  import { completedTiming, timingText, referenceTimingText, type ReferenceTiming } from './timing';

  let { run, steps, elements, validation, caseId }: {
    run: { status: string; seconds: number | null; origin: string; initSeconds?: number | null } | null;
    steps: number;
    elements: number;
    validation: { timing?: ReferenceTiming };
    caseId: string;
  } = $props();
  const seconds = $derived(completedTiming(run));
  const reference = $derived(validation.timing ? referenceTimingText(publicI18n.locale, validation.timing, caseId) : null);
</script>

{#if reference}<p class="rs-status" lang={publicI18n.locale}>{reference}</p>{/if}
{#if seconds !== null}
  <p class="rs-status" lang={publicI18n.locale} aria-live="polite">{timingText(publicI18n.locale, seconds, steps, elements)}.
    {#if run?.initSeconds != null}
      {({ en: 'WASM download/init', es: 'Descarga/inicio de WASM', pt: 'Download/inicialização do WASM' })[publicI18n.locale]}:
      {run.initSeconds.toLocaleString(publicI18n.locale, { maximumFractionDigits: 1 })} s.
    {/if}
  </p>
{/if}
