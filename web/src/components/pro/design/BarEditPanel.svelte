<!--
  One bar of the detailing, edited where it was selected (`drawn-bar-edit.ts`).

  A beam bar laid from a saved line is edited as that line bar: where it starts and ends along
  the line, its hooks, diameter, count and row. «Apply» saves the line as the frame editor does
  (one undo step), the member is checked again and the detailing laid again, and the change in the
  schedule is said in kilos per diameter. A beam bar the generator laid on its own offers to take
  the beam's line as drawn first, which changes no bar.
-->
<script lang="ts">
  import { t, tp } from '../../../lib/i18n';
  import { modelStore } from '../../../lib/store';
  import { designData } from '../../../lib/store/design-data';
  import { verificationStore } from '../../../lib/store/verification.svelte';
  import { checkLabel } from '../../../lib/engine/design/check-clauses';
  import { canTakeAsDrawn, drawnBar, editDrawnBar, takeAsDrawn, type ScheduleChange } from '../../../lib/store/drawn-bar-edit';

  let { barId, elementIds }: { barId: string; elementIds: readonly number[] } = $props();

  const drawn = $derived.by(() => { void modelStore.designDecisions; return drawnBar(barId); });
  const member = $derived(elementIds[0]);
  const offer = $derived.by(() => { void modelStore.designDecisions; return !drawn && member !== undefined && canTakeAsDrawn(member); });
  const dias = $derived(designData().longDiametersMm);

  let from = $state(0), to = $state(0), hookStart = $state(false), hookEnd = $state(false);
  let diameter = $state(0), count = $state(1), row = $state(0);
  let changes = $state<ScheduleChange[] | null>(null);
  $effect(() => {
    const d = drawn;
    if (!d) return;
    from = d.bar.from; to = d.bar.to; hookStart = !!d.bar.hookStart; hookEnd = !!d.bar.hookEnd;
    diameter = d.bar.diameter; count = d.bar.count; row = d.bar.row;
  });

  const verdict = $derived.by(() => {
    void modelStore.designDecisions;
    if (member === undefined) return null;
    const v = verificationStore.providedFor(member);
    if (!v?.overallStatus) return null;
    const failing = v.checks.filter((c) => c.status === 'fail').map((c) => checkLabel(c, 'beam'));
    return { overallStatus: v.overallStatus, worstUtilization: v.worstUtilization, failing };
  });
  const fmt = (v: number) => v.toFixed(2);
  function apply() {
    changes = editDrawnBar(barId, { from, to, hookStart, hookEnd, diameter, count, row });
  }
</script>

{#if drawn}
  <section class="be" data-testid="bar-edit">
    <h4>{tp('barEdit.title', { line: drawn.line.label })}</h4>
    <div class="grid">
      <label>{t('barEdit.from')}<input type="number" step="0.05" min="0" max={drawn.length} bind:value={from} data-testid="bar-edit-from" /></label>
      <label>{t('barEdit.to')}<input type="number" step="0.05" min="0" max={drawn.length} bind:value={to} data-testid="bar-edit-to" /></label>
      <label>{t('barEdit.diameter')}
        <select bind:value={diameter} data-testid="bar-edit-diameter">
          {#each [...new Set([...dias, drawn.bar.diameter])].sort((a, b) => a - b) as d}<option value={d}>Ø{d}</option>{/each}
        </select>
      </label>
      <label>{t('barEdit.count')}<input type="number" min="1" step="1" bind:value={count} data-testid="bar-edit-count" /></label>
      <label>{t('barEdit.row')}<input type="number" min="1" step="1" value={row + 1} oninput={(e) => (row = Math.max(0, Number(e.currentTarget.value) - 1))} data-testid="bar-edit-row" /></label>
      <label class="chk"><input type="checkbox" bind:checked={hookStart} data-testid="bar-edit-hook-start" />{t('barEdit.hookStart')}</label>
      <label class="chk"><input type="checkbox" bind:checked={hookEnd} data-testid="bar-edit-hook-end" />{t('barEdit.hookEnd')}</label>
    </div>
    <p class="hint">{tp('barEdit.along', { length: fmt(drawn.length) })}</p>
    <button onclick={apply} data-testid="bar-edit-apply">{t('barEdit.apply')}</button>
    {#if verdict}
      <p class="state" class:bad={verdict.overallStatus === 'fail'} data-testid="bar-edit-verdict">
        {verdict.overallStatus === 'fail' ? tp('barEdit.fails', { checks: verdict.failing.join(', ') }) : tp('barEdit.verifies', { u: (verdict.worstUtilization ?? 0).toFixed(2) })}
      </p>
    {/if}
    {#if changes}
      <p class="hint" data-testid="bar-edit-changes">
        {changes.length ? tp('barEdit.changes', { list: changes.map((c) => `Ø${c.diameterMm} ${c.deltaKg > 0 ? '+' : ''}${c.deltaKg.toFixed(1)} kg`).join(', ') }) : t('barEdit.noChange')}
      </p>
    {/if}
  </section>
{:else if offer}
  <section class="be" data-testid="bar-edit-offer">
    <p class="hint">{t('barEdit.offer')}</p>
    <button onclick={() => member !== undefined && takeAsDrawn(member)} data-testid="bar-edit-take">{t('barEdit.take')}</button>
  </section>
{/if}

<style>
  .be { display: flex; flex-direction: column; gap: 5px; padding-top: 6px; border-top: 1px solid var(--st-hair); }
  h4 { margin: 0; font-size: 0.74rem; }
  .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 8px; }
  label { display: flex; flex-direction: column; gap: 2px; font-size: 0.68rem; color: var(--st-text-2); }
  label.chk { flex-direction: row; align-items: center; gap: 4px; }
  input, select { font-size: 0.7rem; background: var(--st-surface-3); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 4px; padding: 1px 4px; }
  button { align-self: flex-start; font-size: 0.7rem; padding: 2px 10px; border: 1px solid var(--st-hair-strong); background: var(--st-surface); color: var(--st-text); border-radius: 4px; cursor: pointer; }
  .hint { margin: 0; font-size: 0.68rem; color: var(--st-text-2); line-height: 1.35; }
  .state { margin: 0; font-size: 0.7rem; color: var(--st-ok, var(--st-text)); }
  .state.bad { color: var(--st-danger); }
</style>
