<script lang="ts">
  /** The final report of a «Design»: by level, how members stand, and those that do not verify with their notice codes. */
  import { t, tp } from '../../../lib/i18n';
  import { deskUi } from '../../../lib/store/design-desk-ui.svelte';
  import type { LevelReport } from '../../../lib/store/design-desk';
  import { jointChecks } from '../../../lib/store/joint-checks';
  import { verificationStore } from '../../../lib/store/verification.svelte';
  import SteelTakeoff from './steel/SteelTakeoff.svelte';
  import { modelStore } from '../../../lib/store/model.svelte';
  import ChangedMembersPanel from '../design/ChangedMembersPanel.svelte';
  import { designRunStore } from '../../../lib/store/design-run.svelte';
  /** Members edited by hand, kept provisional or with orientation issues: the classic table's list, here. */
  let changed = $state(false);
  const changedCount = $derived(designRunStore.manualOverrides.size + designRunStore.provisionalIds.size + verificationStore.orientationIssues.length);
  let { levels }: { levels: LevelReport[] } = $props();
  // Beam-column joints (§15.4): how many were checked, which do not hold, which could not be read.
  const joints = $derived.by(() => { void verificationStore.contexts; return jointChecks(); });
  const jFail = $derived(joints.filter((j) => j.check.status === 'FAIL'));
  const jUnsupported = $derived(joints.filter((j) => j.check.status === 'UNSUPPORTED'));
  const jChecked = $derived(joints.length - jUnsupported.length);
  /** The level of a column top, so a joint opens on its plan as a member does. */
  const zOfColumn = (id: number) => {
    const e = modelStore.elements.get(id);
    return e ? Math.max(...[e.nodeI, e.nodeJ].map((n) => modelStore.nodes.get(n)?.z ?? 0)) : null;
  };
  function openJoint(columnId: number) {
    deskUi.selected = columnId; deskUi.tab = 'plan';
    const z = zOfColumn(columnId);
    if (z !== null) deskUi.levelZ = z;
  }
  function open(id: number, z: number) { deskUi.selected = id; deskUi.tab = 'plan'; deskUi.levelZ = z; }
</script>

<div class="dr" data-testid="desk-report">
  {#if changedCount > 0}
    <button class="dr-changed" onclick={() => (changed = !changed)} data-testid="desk-changed">{tp('desk.changed', { n: changedCount })}</button>
    {#if changed}<ChangedMembersPanel onClose={() => (changed = false)} onFocusElement={(id) => { deskUi.selected = id; deskUi.tab = 'plan'; }} />{/if}
  {/if}
  {#if deskUi.report}
    <p class="dr-head">
      {#if deskUi.report.skipped.locked}{tp('desk.skippedLocked', { n: deskUi.report.skipped.locked })} {/if}
      {#if deskUi.report.skipped.edited}{tp('desk.skippedEdited', { n: deskUi.report.skipped.edited })} {/if}
      {#if deskUi.report.steel !== null}{tp('desk.steelChecked', { n: deskUi.report.steel })}{/if}
    </p>
  {/if}
  {#if joints.length}
    <section class="dr-level" data-testid="desk-report-joints">
      <h5>{t('desk.joints')}</h5>
      <p class="dr-counts">{tp('desk.jointCounts2', { n: jChecked, fail: jFail.length, na: jUnsupported.length })}</p>
      {#if jFail.length}
        <ul>{#each jFail as j (`${j.nodeId}${j.direction}`)}<li><button onclick={() => openJoint(j.columnId)}>#{j.columnId}</button> {j.direction} <span class="st-fail">{j.check.utilization.toFixed(2)}</span></li>{/each}</ul>
      {/if}
      {#if jUnsupported.length}
        <p class="dr-sub">{t('desk.jointsUnsupported')}</p>
        <ul data-testid="desk-report-joints-unsupported">{#each jUnsupported as j (`${j.nodeId}${j.direction}`)}<li><button onclick={() => openJoint(j.columnId)}>#{j.columnId}</button> {j.direction} <span class="st-unavailable">—</span></li>{/each}</ul>
      {/if}
    </section>
  {/if}
  {#each levels as l (l.name)}
    <section class="dr-level" data-testid="desk-report-{l.name}">
      <h5>{l.name}</h5>
      <p class="dr-counts">{tp('desk.counts2', { ok: l.counts.ok, warn: l.counts.warn, fail: l.counts.fail, provisional: l.counts.provisional, na: l.counts.unavailable, stale: l.counts.stale })}{#if l.steelOk} · {tp('desk.steelOk', { n: l.steelOk })}{/if}</p>
      {#each [{ key: 'failing', list: l.failing }, { key: 'unchecked', list: l.unchecked }, { key: 'stale', list: l.stale }] as g (g.key)}
        {#if g.list.length}
          <p class="dr-sub">{t(`desk.report.${g.key}`)}</p>
          <ul data-testid="desk-report-{l.name}-{g.key}">
            {#each g.list as m (m.id)}
              <li><button onclick={() => open(m.id, l.z)} data-testid="desk-report-open-{m.id}">#{m.id}</button>
                <span class="st-{m.status}">{m.ratio === null ? '—' : m.ratio.toFixed(2)}</span>
                <span class="dr-codes">{m.codes.join(' · ')}</span></li>
            {/each}
          </ul>
        {/if}
      {/each}
    </section>
  {/each}
  {#if levels.length === 0}<p class="dr-head">{t('desk.noReport')}</p>{/if}
  <SteelTakeoff />
</div>

<style>
  .dr { padding: 10px; overflow: auto; display: flex; flex-direction: column; gap: 8px; }
  .dr-head { font-size: 0.72rem; color: var(--st-text-2); margin: 0; }
  .dr-level h5 { margin: 0; font-size: 0.76rem; }
  .dr-counts { margin: 2px 0; font-size: 0.7rem; color: var(--st-text-2); }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 1px; font-size: 0.7rem; }
  li { display: flex; gap: 8px; align-items: center; }
  li button { background: none; border: none; color: var(--st-accent); cursor: pointer; padding: 0; font: inherit; }
  .dr-codes { font-family: var(--st-mono, monospace); color: var(--st-text-3); }
  .st-fail { color: var(--st-danger); } .st-warn, .st-provisional { color: var(--st-warn); } .st-unavailable, .st-stale { color: var(--st-text-3); }
  .dr-changed { align-self: flex-start; font-size: 0.7rem; padding: 2px 8px; border-radius: 4px; border: 1px solid var(--st-hair-strong); background: var(--st-surface); color: var(--st-text); cursor: pointer; }
  .dr-sub { margin: 4px 0 1px; font-size: 0.68rem; color: var(--st-text-2); }
</style>
