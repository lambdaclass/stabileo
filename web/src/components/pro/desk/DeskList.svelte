<script lang="ts">
  /**
   * Sizing › Concrete › List: the member table, with its filters, groups, search and inline
   * editors (`ProDesignTab`), the commands that feed it (the demands and the steel the code
   * requires) and, below it, the slabs, walls and foundations run. It was the classic «Rebar
   * design» screen beside the viewer; it is a place of the desk now, with the viewer above it and
   * the piece sheet beside it, and its view (filter, search, open row) is kept when another place
   * takes the canvas (`design-table-ui.svelte.ts`).
   */
  import ProDesignTab from '../ProDesignTab.svelte';
  import ProDesignCompleteness from '../design/ProDesignCompleteness.svelte';
  import RcSubStage from '../design/RcSubStage.svelte';
  import FloorFamiliesPanel from '../design/FloorFamiliesPanel.svelte';
  import { t, tp } from '../../../lib/i18n';
  import { modelStore, resultsStore } from '../../../lib/store';
  import { designRunStore } from '../../../lib/store/design-run.svelte';
  import { detailingStore } from '../../../lib/store/detailing.svelte';
  import { regulationsStore } from '../../../lib/store/regulations.svelte';
  import { rcCodeCheck, rcComputeDemands } from '../../../lib/flow/rc-commands';
  import ActiveConcreteCode from '../design/ActiveConcreteCode.svelte';
  import { openDeskAt } from '../../../lib/pro/design-navigation';

  const hasResults = $derived(resultsStore.results3D !== null || resultsStore.results !== null);
  const busy = $derived(designRunStore.running);
  const hasCombinations = $derived(modelStore.model.combinations.length > 0);
  const concreteReady = $derived(regulationsStore.concreteDesignCode() !== null);
  const footingCount = $derived(modelStore.model.footings.size);
  const notVerifiedCount = $derived(detailingStore.footingsNotVerified.length);
  const floorsState = $derived(detailingStore.lastFloorRun ? 'done' as const : 'optional' as const);
  let floorsOpen = $state(false);
</script>

<div class="dl" data-testid="desk-list">
  <ProDesignCompleteness />
  <!--
    The demands and the steel the code requires, what the table reads before any bar exists.
    Required steel is NOT a verification: it publishes what the code requires and never reads a
    provided bar, so it sits with the demands and not with «Size…».
  -->
  <div class="dl-actions" data-testid="rc-stage-actions">
    <button data-testid="cmd-compute-demands" onclick={rcComputeDemands} disabled={!hasResults || busy}>{t('design.cmd.computeDemands')}</button>
    <button data-testid="cmd-code-check" onclick={rcCodeCheck} disabled={!hasResults || !hasCombinations || !concreteReady || busy}>{t('design.cmd.requiredSteel')}</button>
    <span class="dl-code"><ActiveConcreteCode changeable onOpenRegulations={() => openDeskAt('designData')} /></span>
  </div>
  <ProDesignTab />
  <RcSubStage
    testid="floor-families-disclosure"
    title={t('detailing.floorRun.title')}
    purpose={t('design.stagePurpose.floors')}
    state={floorsState}
    badge={footingCount > 0 ? footingCount : undefined}
    badgeTestid="floor-footing-count"
    attentionTestid="floor-not-verified-count"
    attention={notVerifiedCount > 0 ? tp('design.stagePurpose.floorsNotVerified', { n: notVerifiedCount }) : undefined}
    bind:open={floorsOpen}
  >
    <FloorFamiliesPanel />
  </RcSubStage>
</div>

<style>
  .dl { display: flex; flex-direction: column; min-width: 0; }
  .dl-actions { display: flex; gap: 6px; padding: 6px 10px 0; }
  .dl-actions button { font-size: 0.72rem; padding: 3px 10px; border-radius: 4px; border: 1px solid var(--st-hair-strong); background: var(--st-surface); color: var(--st-text); cursor: pointer; }
  .dl-actions button:disabled { opacity: 0.45; cursor: default; }
  .dl-actions { align-items: center; flex-wrap: wrap; }
  .dl-code { margin-left: auto; }
</style>
