<script lang="ts">
  /**
   * Loading the line: a dead load g everywhere, a live load q where it raises (or lowers) the
   * quantity most, a concentrated P at the peak. The largest and smallest values, where each load
   * goes, the same values from a direct solve, and the envelope along the members.
   */
  import { t, tp } from '../../lib/i18n';
  import { influenceTool } from '../../lib/store/influence-tool.svelte';
  import UnitInput from '../UnitInput.svelte';
  import { readLine } from '../../lib/engine/influence/analysis';
  import { ilEnvelopeAlong, type EnvelopeQuantity } from '../../lib/engine/influence/envelope-along';
  import { canonicalQuantity } from '../../lib/engine/influence/quantities';
  import { UNIT_LOAD_DIR } from '../../lib/engine/influence-service';
  import type { Zone } from '../../lib/engine/influence/areas';
  import type { InfluenceLineResult } from '../../lib/store/model.svelte';
  import type { SolverInput } from '../../lib/engine/types';
  import { fmtQ, unitQ } from '../../lib/store/display-units.svelte';
  import type { Quantity } from '../../lib/utils/units';
  import { uiStore } from '../../lib/store';

  let { il, unit, loadedIds }: { il: InfluenceLineResult; unit: SolverInput; loadedIds: number[] } = $props();

  const q = $derived(canonicalQuantity(il.quantity));
  const kind = $derived<Quantity>(q === 'M' || q === 'My' ? 'moment' : q === 'uz' || q === 'ux' ? 'displacement' : q === 'ry' ? 'rotation' : 'force');
  const dir = $derived(UNIT_LOAD_DIR[il.direction ?? 'vertical']);
  const loads = $derived(influenceTool.loads);
  const reading = $derived.by(() => {
    try { return readLine(unit, il, loads, influenceTool.placement, loadedIds, dir); } catch { return null; }
  });
  const extremes = $derived(reading ? ([['max', reading.max, reading.direct.max], ['min', reading.min, reading.direct.min]] as const) : []);
  const fmt = (v: number) => `${fmtQ(v, kind)} ${unitQ(kind)}`;
  const agrees = (a: number, b: number) => Math.abs(a - b) <= 1e-3 * Math.max(Math.abs(a), Math.abs(b)) + 1e-9;
  const zonesText = (zones: Zone[]) => zones.length === 0 ? t('course.influence.load.nowhere') : zones.map((z) => {
    const whole = z.t0 < 1e-9 && z.t1 > 1 - 1e-9;
    return whole ? `${z.elementId}` : `${z.elementId} (${(z.t0 * 100).toFixed(0)}–${(z.t1 * 100).toFixed(0)} %)`;
  }).join(', ');
  const canEnvelope = $derived(q === 'M' || q === 'V' || q === 'N');
  const selectedCount = $derived([...uiStore.selectedElements].filter((id) => unit.elements.has(id)).length);

  let busy = $state(false);
  function toggleEnvelope() {
    if (influenceTool.envelope) { influenceTool.envelope = null; return; }
    busy = true;
    requestAnimationFrame(() => {
      try {
        influenceTool.envelope = ilEnvelopeAlong(unit, q as EnvelopeQuantity, loads, influenceTool.placement, dir, loadedIds);
      } catch (e) {
        uiStore.toast(String((e as Error)?.message ?? e), 'error');
      } finally { busy = false; }
    });
  }
</script>

<details class="ill" data-testid="il-loading">
  <summary>{t('course.influence.load.title')} <span class="ill-sum">g = {fmtQ(loads.g, 'distributedLoad')} · q = {fmtQ(loads.q, 'distributedLoad')} {unitQ('distributedLoad')} · P = {fmtQ(loads.P, 'force')} {unitQ('force')}</span></summary>
  <div class="ill-body">
    <p class="ill-help">{t('course.influence.load.help')}</p>
    <div class="ill-grid">
      <span class="ill-k" title={t('course.influence.load.gTip')}>{t('course.influence.load.gLabel')}</span>
      <UnitInput value={loads.g} qty="distributedLoad" onchange={(v) => influenceTool.setLoads({ g: v })} testid="il-g" />
      <span class="ill-k" title={t('course.influence.load.qTip')}>{t('course.influence.load.qLabel')}</span>
      <UnitInput value={loads.q} qty="distributedLoad" onchange={(v) => influenceTool.setLoads({ q: v })} testid="il-q" />
      <span class="ill-k" title={t('course.influence.load.PTip')}>{t('course.influence.load.PLabel')}</span>
      <UnitInput value={loads.P} qty="force" onchange={(v) => influenceTool.setLoads({ P: v })} testid="il-P" />
    </div>
    <div class="ill-place" role="radiogroup" aria-label={t('course.influence.load.placement')}>
      <button class:on={influenceTool.placement === 'zones'} onclick={() => (influenceTool.placement = 'zones')} title={t('course.influence.load.zonesTip')} data-testid="il-zones">{t('course.influence.load.zones')}</button>
      <button class:on={influenceTool.placement === 'spans'} onclick={() => (influenceTool.placement = 'spans')} title={t('course.influence.load.spansTip')} data-testid="il-spans">{t('course.influence.load.spans')}</button>
    </div>
    <p class="ill-note">{selectedCount ? tp('course.influence.load.loadedSelected', { n: selectedCount }) : t('course.influence.load.loadedAll')}</p>

    {#if reading}
      {#each extremes as [k, ex, direct] (k)}
        <div class="ill-res" data-testid={`il-${k}`}>
          <div class="ill-line"><strong>{t(`course.influence.load.${k}`)}</strong> <span class="ill-val">{fmt(ex.value)}</span></div>
          <div class="ill-parts">g: {fmt(ex.dead)} · q: {fmt(ex.live)} · P: {fmt(ex.point)}</div>
          <div class="ill-parts">{tp('course.influence.load.qOn', { list: zonesText(ex.zones) })}{#if ex.pointAt} · {tp('course.influence.load.pAt', { e: ex.pointAt.elementId, pct: (ex.pointAt.t * 100).toFixed(0) })}{/if}</div>
          <div class="ill-check" class:ok={agrees(ex.value, direct)}>{tp('course.influence.load.direct', { v: fmt(direct) })}</div>
        </div>
      {/each}
    {/if}

    {#if canEnvelope}
      <button class="ill-btn" class:on={!!influenceTool.envelope} disabled={busy} onclick={toggleEnvelope} data-testid="il-envelope">
        {busy ? t('course.influence.load.drawing') : influenceTool.envelope ? t('course.influence.load.hideEnvelope') : t('course.influence.load.drawEnvelope')}
      </button>
      {#if influenceTool.envelope}<p class="ill-note">{t('course.influence.load.envelopeNote')}</p>{/if}
    {/if}
  </div>
</details>

<style>
  .ill { border: 1px solid var(--st-hair); border-radius: var(--st-radius); }
  .ill summary { cursor: pointer; padding: 0.3rem 0.45rem; color: var(--st-text); font-size: 0.72rem; }
  .ill-sum { display: block; color: var(--st-text-3); font-size: 0.64rem; font-family: var(--st-mono); margin-top: 0.1rem; }
  .ill-body { display: flex; flex-direction: column; gap: 0.35rem; padding: 0.2rem 0.45rem 0.45rem; }
  .ill-help { margin: 0; line-height: 1.4; color: var(--st-text-3); font-size: 0.66rem; }
  .ill-grid { display: grid; grid-template-columns: auto 1fr; gap: 0.25rem 0.35rem; align-items: center; }
  .ill-grid .ill-k { color: var(--st-text-2); }
  .ill-grid :global(input) { width: 4.5rem; }
  .ill-in { display: flex; align-items: center; gap: 0.3rem; color: var(--st-text-3); }
  .ill-place { display: flex; gap: 0.25rem; flex-wrap: wrap; }
  .ill-place button, .ill-btn {
    background: none; border: 1px solid var(--st-hair); border-radius: var(--st-radius); color: var(--st-text-2);
    font-size: 0.68rem; padding: 0.2rem 0.45rem; cursor: pointer;
  }
  .ill-place button.on, .ill-btn.on { color: var(--st-accent); border-color: var(--st-accent); }
  .ill-place button:hover, .ill-btn:hover:not(:disabled) { background: var(--st-surface-3); color: var(--st-text); }
  .ill-btn { align-self: flex-start; padding: 0.3rem 0.55rem; }
  .ill-btn:disabled { opacity: 0.5; cursor: progress; }
  .ill-note { margin: 0; color: var(--st-text-3); font-size: 0.64rem; line-height: 1.4; }
  .ill-res { border-top: 1px solid var(--st-hair); padding-top: 0.3rem; display: flex; flex-direction: column; gap: 0.1rem; }
  .ill-line { display: flex; justify-content: space-between; gap: 0.4rem; }
  .ill-line strong { color: var(--st-text); font-weight: 600; }
  .ill-val { font-family: var(--st-mono); color: var(--st-value); }
  .ill-parts { color: var(--st-text-3); font-size: 0.64rem; font-family: var(--st-mono); overflow-wrap: anywhere; }
  .ill-check { color: var(--st-text-3); font-size: 0.64rem; }
  .ill-check.ok::before { content: '✓ '; color: var(--st-ok, #6fbf73); }
</style>
