<script lang="ts">
  /**
   * A pushover's capacity curve and its hinge sequence: base shear against the control node's
   * displacement, one point per hinge event, and a slider over the steps. On the model, the
   * deformed shape at the step and a mark on each hinge formed so far.
   */
  import { onDestroy, untrack } from 'svelte';
  import { t, tp } from '../../../lib/i18n';
  import { modelStore, resultsStore } from '../../../lib/store';
  import { editPreview } from '../../../lib/store/edit-preview.svelte';
  import { timeHistoryView } from '../../../lib/store/time-history-view.svelte';
  import {
    capacityCurve, defaultControl, hingesThrough, hingePoints, pushoverFrames, stoppedAtJoint,
    type PushoverResult, type PushDir,
  } from '../../../lib/engine/pushover-curve';

  let { result, modelVersion }: { result: PushoverResult; modelVersion: number } = $props();

  const OWNER = 'pushover';
  const initial = $derived(defaultControl(result));
  let nodeChoice = $state<number | null>(null);
  let dirChoice = $state<PushDir | null>(null);
  const control = $derived({ nodeId: nodeChoice ?? initial?.nodeId ?? 0, dir: dirChoice ?? initial?.dir ?? 'x' });
  const curve = $derived(capacityCurve(result, control));
  const nodeIds = $derived([...new Set(result.steps[0]?.results.displacements.map((d) => d.nodeId) ?? [])].sort((a, b) => a - b));
  const stopped = $derived(stoppedAtJoint(result, modelStore.elements));

  /** Index into `curve`: 0 is the origin, k the state after step k − 1. */
  let index = $state(0);
  $effect(() => { void result; index = curve.length - 1; });
  const point = $derived(curve[Math.min(index, curve.length - 1)]!);
  const formedSoFar = $derived(hingesThrough(result, point.step));

  let shown = $state(false);
  const stale = $derived(modelVersion !== modelStore.modelVersion);

  $effect(() => {
    if (!shown || stale) { editPreview.clear(OWNER); return; }
    editPreview.show(OWNER, null, [], hingePoints(formedSoFar, modelStore.elements, modelStore.nodes));
  });
  $effect(() => {
    const on = shown && !stale, k = index, r = result, v = modelVersion;
    untrack(() => {
      if (!on) { if (timeHistoryView.source === 'pushover') timeHistoryView.clear(); return; }
      if (timeHistoryView.source !== 'pushover' || timeHistoryView.result === null) {
        timeHistoryView.set(pushoverFrames(r), v, 'pushover');
        resultsStore.diagramType = 'deformed';
      }
      timeHistoryView.setShown(true);
      timeHistoryView.setStep(k);
    });
  });
  // A new run replaces the frames the view holds.
  $effect(() => {
    const r = result;
    untrack(() => { if (timeHistoryView.source === 'pushover' && shown) timeHistoryView.set(pushoverFrames(r), modelVersion, 'pushover'); });
  });
  onDestroy(() => {
    editPreview.clear(OWNER);
    if (timeHistoryView.source === 'pushover') timeHistoryView.clear();
  });

  // ─── Chart ───
  const W = 320, H = 150, PL = 44, PR = 10, PT = 8, PB = 24;
  const pw = W - PL - PR, ph = H - PT - PB;
  const dMax = $derived(Math.max(1e-12, ...curve.map((p) => p.displacement)));
  const vMax = $derived(Math.max(1e-12, ...curve.map((p) => p.baseShear)));
  const sx = (d: number) => PL + (d / dMax) * pw;
  const sy = (v: number) => PT + ph - (v / vMax) * ph;
  const path = $derived(`M${curve.map((p) => `${sx(p.displacement).toFixed(1)},${sy(p.baseShear).toFixed(1)}`).join('L')}`);
  let hover = $state<number | null>(null);
  const shownPoint = $derived(curve[hover ?? index] ?? point);

  const fmt = (v: number, d = 3) => (Number.isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: d }) : '—');
  const endName = (end: string) => (end === 'end' ? t('pro.po.endJ') : t('pro.po.endI'));
</script>

<div class="po" data-testid="pushover-view">
  <div class="po-row">
    <label>{t('pro.po.control')}
      <select value={control.nodeId} onchange={(e) => (nodeChoice = Number(e.currentTarget.value))} data-testid="po-node">
        {#each nodeIds as id (id)}<option value={id}>{id}</option>{/each}
      </select>
    </label>
    <label>{t('pro.po.direction')}
      <select value={control.dir} onchange={(e) => (dirChoice = e.currentTarget.value as PushDir)} data-testid="po-dir">
        <option value="x">X</option><option value="y">Y</option><option value="z">Z</option>
      </select>
    </label>
    <label class="po-check"><input type="checkbox" bind:checked={shown} disabled={stale} data-testid="po-show" /> {t('pro.po.showOnModel')}</label>
  </div>
  {#if stale}<p class="po-hint">{t('pro.po.stale')}</p>{/if}
  {#if stopped != null}<p class="po-warn" data-testid="po-stopped">{tp('pro.po.stoppedAtJoint', { node: stopped })}</p>{/if}

  <div class="po-readout" data-testid="po-readout">
    {shownPoint.step < 0 ? t('pro.po.origin') : tp('pro.po.stepN', { n: shownPoint.step + 1, of: curve.length - 1 })}
    · λ = {fmt(shownPoint.loadFactor)} · V = {fmt(shownPoint.baseShear, 1)} kN · δ = {fmt(shownPoint.displacement * 1000, 1)} mm
  </div>
  <svg viewBox="0 0 {W} {H}" role="img" aria-label={t('pro.po.curve')} onpointerleave={() => (hover = null)}>
    <line class="po-axis" x1={PL} y1={PT + ph} x2={PL + pw} y2={PT + ph} />
    <line class="po-axis" x1={PL} y1={PT} x2={PL} y2={PT + ph} />
    <text class="po-tick" x={PL - 4} y={PT + 4} text-anchor="end">{fmt(vMax, 0)}</text>
    <text class="po-tick" x={PL - 4} y={PT + ph} text-anchor="end">0</text>
    <text class="po-tick" x={PL + pw} y={H - 8} text-anchor="end">{fmt(dMax * 1000, 1)} mm</text>
    <text class="po-tick" x={PL} y={H - 8}>0</text>
    <text class="po-label" x={PL + 4} y={PT + 10}>V (kN)</text>
    <path class="po-line" d={path} />
    {#each curve as p, k (k)}
      <circle class="po-dot" class:po-dot-on={k === index} cx={sx(p.displacement)} cy={sy(p.baseShear)} r={k === index ? 5 : 3.5} />
      <!-- A hit target larger than the mark; the slider below is the keyboard's way to the same. -->
      <circle class="po-hit" cx={sx(p.displacement)} cy={sy(p.baseShear)} r="10" role="presentation" onpointerenter={() => (hover = k)} onclick={() => (index = k)} />
    {/each}
  </svg>
  <input class="po-slider" type="range" min="0" max={curve.length - 1} step="1" bind:value={index} aria-label={t('pro.po.step')} data-testid="po-slider" />

  <div class="po-hinges" data-testid="po-hinges">
    {#if point.step < 0}
      <span class="po-hint">{t('pro.po.noHingesYet')}</span>
    {:else}
      <span>{tp('pro.po.formedThisStep', { n: point.hinges.length })}</span>
      <ul>
        {#each point.hinges as h (h.elementId + h.end)}
          <li>{tp('pro.po.hingeAt', { el: h.elementId, end: endName(h.end) })} · My = {fmt(h.momentY, 1)} · Mz = {fmt(h.momentZ, 1)} kN·m</li>
        {/each}
      </ul>
      <span class="po-hint">{tp('pro.po.totalSoFar', { n: formedSoFar.length })}</span>
    {/if}
  </div>
</div>

<style>
  .po { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; font-size: 0.66rem; color: var(--st-text-2); }
  .po-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .po-check { display: inline-flex; gap: 4px; align-items: center; }
  .po-readout { font-variant-numeric: tabular-nums; color: var(--st-text); }
  .po-hint { margin: 0; font-size: 0.6rem; color: var(--st-text-3); }
  .po-warn { margin: 0; font-size: 0.62rem; color: var(--st-warn); }
  svg { width: 100%; max-width: 420px; height: auto; touch-action: none; }
  .po-axis { stroke: var(--st-surface-3); stroke-width: 1; }
  .po-tick, .po-label { fill: var(--st-text-3); font-size: 8px; }
  .po-line { fill: none; stroke: var(--st-value); stroke-width: 2; stroke-linejoin: round; }
  .po-dot { fill: var(--st-value); stroke: var(--st-surface); stroke-width: 2; pointer-events: none; }
  .po-dot-on { fill: var(--st-interactive); }
  .po-hit { fill: transparent; cursor: pointer; }
  .po-slider { width: 100%; max-width: 420px; }
  .po-hinges ul { margin: 2px 0; padding-left: 14px; }
</style>
