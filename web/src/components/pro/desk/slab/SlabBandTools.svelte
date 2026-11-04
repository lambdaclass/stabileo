<script lang="ts">
  /**
   * The selected band's further commands: its bars at any angle, a free outline, moving it and its
   * text, packages of equal bands (group and ungroup), and what the slab asks along a line or over
   * the band (smallest, largest, mean), to set a band by its stretch and not by a peak.
   */
  import { t, tp } from '../../../../lib/i18n';
  import type { SlabBand, SlabPanelReinforcement } from '../../../../lib/design-contract/reinforcement';
  import type { PanelInput } from '../../../../lib/engine/detailing/slab-panel';
  import { bandAverage, groupBands, lineAverage, moveBand, moveBandLabel, samePackage, ungroupBands, type NeedStats } from '../../../../lib/engine/detailing/slab-bands';

  let { draft, band, input, apply }: { draft: SlabPanelReinforcement; band: SlabBand; input: PanelInput; apply: (next: SlabPanelReinforcement) => void } = $props();

  type Key = 'bottomX' | 'bottomY' | 'topX' | 'topY';
  let outlineText = $state(''), dx = $state(0), dy = $state(0), lx = $state(0), ly = $state(0);
  let key = $state<Key>('bottomX');
  let ax = $state(0), ay = $state(0), bx = $state(1), by = $state(0);
  let lineStats = $state<NeedStats | null>(null), bandStats = $state<NeedStats | null>(null), note = $state<string | null>(null);
  $effect(() => {
    outlineText = (band.outline ?? []).map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join('; ');
    lx = +(band.label?.x ?? (band.x0 + band.x1) / 2).toFixed(2); ly = +(band.label?.y ?? (band.y0 + band.y1) / 2).toFixed(2);
    key = `${band.face}${band.dir.toUpperCase()}` as Key;
    ax = input.x0; ay = (input.y0 + input.y1) / 2; bx = input.x1; by = ay;
    lineStats = bandStats = null;
  });
  const set = (patch: Partial<SlabBand>) => apply({ ...draft, bands: draft.bands.map((x) => (x.id === band.id ? { ...x, ...patch } : x)) });
  function setOutline() {
    const pts = outlineText.split(';').map((s) => s.split(',').map(Number)).filter((p) => p.length === 2 && p.every(Number.isFinite)).map(([x, y]) => ({ x: x!, y: y! }));
    if (pts.length === 0) { const { outline: _o, ...rest } = band; apply({ ...draft, bands: draft.bands.map((x) => (x.id === band.id ? rest : x)) }); return; }
    if (pts.length < 3) { note = t('slabEd.tools.outlineShort'); return; }
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    set({ outline: pts, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) });
    note = null;
  }
  const equals = $derived(draft.bands.filter((x) => x.id !== band.id && samePackage(x, band) && !x.group));
  function group() {
    const g = band.group ?? `g${Date.now().toString(36)}`;
    const next = groupBands(draft, [band.id, ...equals.map((x) => x.id), ...draft.bands.filter((x) => band.group && x.group === band.group).map((x) => x.id)], g);
    if (next) { apply(next); note = tp('slabEd.tools.grouped', { n: next.bands.filter((x) => x.group === g).length }); } else note = t('slabEd.tools.cannotGroup');
  }
  const cm2 = (s: NeedStats | null) => (s ? tp('slabEd.tools.stats', { min: s.min.toFixed(2), avg: s.avg.toFixed(2), max: s.max.toFixed(2), n: s.samples }) : t('slabEd.tools.noStats'));
</script>

<div class="st" data-testid="slab-band-tools">
  <div class="st-row">
    <label>{t('slabEd.tools.angle')}<input type="number" step="5" min="-90" max="180" value={band.angle ?? (band.dir === 'x' ? 0 : 90)} onchange={(e) => set({ angle: Number(e.currentTarget.value) })} data-testid="slab-band-angle" />°</label>
    <label class="st-wide">{t('slabEd.tools.outline')}<input type="text" placeholder="x,y; x,y; x,y" bind:value={outlineText} data-testid="slab-band-outline" /></label>
    <button onclick={setOutline} data-testid="slab-band-outline-set">{t('slabEd.tools.setOutline')}</button>
  </div>
  <div class="st-row">
    <label>Δx<input type="number" step="0.05" bind:value={dx} /></label><label>Δy<input type="number" step="0.05" bind:value={dy} /></label>
    <button onclick={() => apply(moveBand(draft, band.id, dx, dy))} data-testid="slab-band-move">{t('slabEd.tools.move')}</button>
    <label>{t('slabEd.tools.text')} x<input type="number" step="0.05" bind:value={lx} /></label><label>y<input type="number" step="0.05" bind:value={ly} /></label>
    <button onclick={() => apply(moveBandLabel(draft, band.id, { x: lx, y: ly }))} data-testid="slab-band-label">{t('slabEd.tools.moveText')}</button>
  </div>
  <div class="st-row">
    {#if band.group}
      <span>{tp('slabEd.tools.inPackage', { n: draft.bands.filter((x) => x.group === band.group).length })}</span>
      <button onclick={() => apply(ungroupBands(draft, band.group!))} data-testid="slab-band-ungroup">{t('slabEd.tools.ungroup')}</button>
    {:else}
      <button disabled={equals.length === 0} onclick={group} data-testid="slab-band-group">{tp('slabEd.tools.group', { n: equals.length })}</button>
    {/if}
  </div>
  <div class="st-row" data-testid="slab-average">
    <select bind:value={key}>{#each ['bottomX', 'bottomY', 'topX', 'topY'] as k}<option value={k}>{t(`slabEd.key.${k}`)}</option>{/each}</select>
    <button onclick={() => (bandStats = bandAverage(input, key, band))} data-testid="slab-average-band">{t('slabEd.tools.overBand')}</button>
    {#if bandStats !== null}<span data-testid="slab-average-band-result">{cm2(bandStats)}</span>{/if}
  </div>
  <div class="st-row">
    <label>A<input type="number" step="0.1" bind:value={ax} /><input type="number" step="0.1" bind:value={ay} /></label>
    <label>B<input type="number" step="0.1" bind:value={bx} /><input type="number" step="0.1" bind:value={by} /></label>
    <button onclick={() => (lineStats = lineAverage(input, key, { x: ax, y: ay }, { x: bx, y: by }))} data-testid="slab-average-line">{t('slabEd.tools.alongLine')}</button>
    {#if lineStats !== null}<span data-testid="slab-average-line-result">{cm2(lineStats)}</span>{/if}
  </div>
  {#if note}<p class="st-hint" role="status">{note}</p>{/if}
</div>

<style>
  .st { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--st-hair); font-size: 0.7rem; }
  .st-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; }
  .st label { display: inline-flex; align-items: center; gap: 3px; color: var(--st-text-2); }
  .st input[type='number'] { width: 3.6rem; font-size: 0.7rem; }
  .st .st-wide input { width: 12rem; font-size: 0.7rem; }
  .st select { font-size: 0.7rem; }
  .st button { font-size: 0.68rem; padding: 1px 8px; border: 1px solid var(--st-hair-strong); background: var(--st-surface); color: var(--st-text); border-radius: 4px; cursor: pointer; }
  .st button:disabled { opacity: 0.45; cursor: default; }
  .st-hint { margin: 0; color: var(--st-text-3); }
</style>
