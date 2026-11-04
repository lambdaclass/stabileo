<script lang="ts">
  /**
   * Detailing › Coordinated detailing: the members grouped by what they are (`RcMemberList`) and
   * the assemblies with their bars, conflicts, sheet, title block, bending schedule and exports
   * (`DetailingWorkflow`). It was the classic detailing section; the command that generates it is
   * at the top, in the Detail step (`DeskProcessBar.svelte`), and what explains why that command
   * refuses, and the preference that runs it on its own after a design are here, over what it produces;
   * what regenerating would replace is said beside the command itself.
   */
  import RcMemberList from '../design/RcMemberList.svelte';
  import DetailingWorkflow from '../design/DetailingWorkflow.svelte';
  import RcConvergenceNotice from '../design/RcConvergenceNotice.svelte';
  import { t, tp } from '../../../lib/i18n';
  import { detailingStore } from '../../../lib/store/detailing.svelte';

  const ready = $derived(detailingStore.readiness);
  const blockers = $derived(ready.prerequisites.map((p) => tp(p.key, { n: p.count, ids: p.elementIds.slice(0, 6).join(', ') })).join(' '));
</script>

<div class="dt" data-testid="desk-detailing">
  <div class="dt-head">
    <!-- How many coordinated assemblies there are, without opening the list. -->
    {#if detailingStore.assemblies.length > 0}<span class="dt-count" title={t('detailing.title')} data-testid="detailing-count">{detailingStore.assemblies.length}</span>{/if}
    {#if !ready.ready && blockers}<p class="dt-blockers" data-testid="detailing-prerequisites">{blockers}</p>{/if}
    <label class="dt-auto" data-testid="detailing-auto-label">
      <input type="checkbox" data-testid="detailing-auto" checked={detailingStore.autoGenerate}
        onchange={(e) => detailingStore.setAutoGenerate(e.currentTarget.checked)} />
      {t('detailing.cmd.autoShort')}
    </label>
  </div>
  <RcConvergenceNotice />
  <RcMemberList />
  <DetailingWorkflow />
</div>

<style>
  .dt { display: flex; flex-direction: column; min-width: 0; }
  .dt-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 6px 10px; font-size: 0.72rem; }
  .dt-blockers { margin: 0; flex-basis: 100%; color: var(--st-warn); }
  .dt-count { font-size: 0.66rem; padding: 0 6px; border-radius: 8px; border: 1px solid var(--st-hair-strong); color: var(--st-text-2); }
  .dt-auto { display: inline-flex; align-items: center; gap: 4px; color: var(--st-text-2); }
</style>
