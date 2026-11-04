<!--
  Says that an output describes the model as it was before the last change.

  `detailing`: the bars were generated from an earlier model (`detailingStore.modelStale`), so the
  drawings, the bending schedule, the 3-D cage and the IFC bars describe that model.
  `built`: what this panel built (sheets, a report) was made before the last change; the panel
  passes whether its own fingerprint still matches.
  `workbook`: the project workbook's design sheets, which carry the same stamp in the file.
-->
<script lang="ts">
  import { t } from '../../../lib/i18n';
  import { detailingStore } from '../../../lib/store/detailing.svelte';

  let { what, stale = undefined, testid = 'outdated-notice' }: { what: 'detailing' | 'sheets' | 'memoria' | 'exchange' | 'workbook'; stale?: boolean; testid?: string } = $props();
  const shown = $derived(stale ?? detailingStore.modelStale);
</script>

{#if shown}
  <p class="outdated" role="status" data-testid={testid}>{t(`outdated.${what}`)}</p>
{/if}

<style>
  .outdated {
    margin: 0; padding: 0.3rem 0.45rem; font-size: 0.68rem; line-height: 1.35;
    color: var(--st-warn); background: var(--st-warn-bg); border: 1px solid var(--st-warn); border-radius: 4px;
  }
</style>
