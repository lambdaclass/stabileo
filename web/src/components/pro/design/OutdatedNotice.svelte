<!--
  Says that an output describes the model as it was before the last change.

  `detailing`: the bars were generated from an earlier model (`detailingStore.modelStale`), so the
  drawings, the bending schedule, the 3-D cage and the IFC bars describe that model.
  `built`: what this panel built (sheets, a report) was made before the last change; the panel
  passes whether its own fingerprint still matches.
  `workbook`: the project workbook's design sheets, which carry the same stamp in the file.
-->
<script lang="ts">
  import { underAudit, UNDER_AUDIT_URL, type AuditFeature } from '../../../lib/provenance/under-audit';
  import { t } from '../../../lib/i18n';
  import { detailingStore } from '../../../lib/store/detailing.svelte';

  let { what, stale = undefined, testid = 'outdated-notice', audit }: { audit?: readonly (AuditFeature | null)[]; what?: 'detailing' | 'sheets' | 'memoria' | 'exchange' | 'workbook'; stale?: boolean; testid?: string } = $props();
  const shown = $derived(audit ? underAudit(audit) : what && (stale ?? detailingStore.modelStale));
</script>

{#if shown}
  <p class="outdated" class:under-audit={!!audit} role="status" data-testid={audit ? 'under-audit-notice' : testid}>
    {#if audit}
      <span>{t('underAudit.text')}</span>
      <a href={UNDER_AUDIT_URL} target="_blank" rel="noopener noreferrer">{t('underAudit.details')}</a>
    {:else}{t(`outdated.${what}`)}{/if}
  </p>
{/if}

<style>
  .outdated {
    margin: 0; padding: 0.3rem 0.45rem; font-size: 0.68rem; line-height: 1.35;
    color: var(--st-warn); background: var(--st-warn-bg); border: 1px solid var(--st-warn); border-radius: 4px;
  }
  .under-audit { flex-shrink: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 0 0.75rem; padding: 0.4rem 0.6rem; font-size: 0.75rem; line-height: 1.5; color: var(--st-text); overflow-wrap: anywhere; }
  .under-audit span { flex: 1 1 24rem; min-width: 0; }
  .under-audit a { display: inline-flex; align-items: center; min-height: 44px; min-width: 44px; max-width: 100%; color: var(--st-accent); text-decoration: underline; }
</style>
