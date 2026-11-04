<script lang="ts">
  /**
   * The plan of a level, its members coloured by their design status: the beams at the level as
   * lines, the columns arriving at it as squares, the grid's axes behind. A click opens a member
   * in the inspector; the CM and CR of the level are marked when known.
   */
  import { modelStore } from '../../../lib/store';
  import { t } from '../../../lib/i18n';
  import { axesOf } from '../../../lib/model/grid';
  import { deskUi } from '../../../lib/store/design-desk-ui.svelte';
  import type { LevelCentres } from '../../../lib/engine/building/level-centres';
  import type { DeskRow } from './desk-rows';

  let { rows, centres }: { rows: DeskRow[]; centres: LevelCentres[] } = $props();
  const z = $derived(deskUi.levelZ);
  const P = (id: number) => modelStore.nodes.get(id)!;
  const here = $derived(z === null ? [] : rows.filter((r) => Math.abs(r.zTop - z) < 1e-3));
  const beams = $derived(here.filter((r) => r.zBottom > z! - 1e-3).map((r) => { const e = modelStore.elements.get(r.id)!; return { r, a: P(e.nodeI), b: P(e.nodeJ) }; }));
  const cols = $derived(here.filter((r) => r.zBottom < z! - 1e-3).map((r) => { const e = modelStore.elements.get(r.id)!; const top = (P(e.nodeI).z ?? 0) > (P(e.nodeJ).z ?? 0) ? P(e.nodeI) : P(e.nodeJ); return { r, p: top }; }));
  const pts = $derived([...beams.flatMap((b) => [b.a, b.b]), ...cols.map((c) => c.p)]);
  const box = $derived.by(() => {
    if (pts.length === 0) return null;
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const pad = Math.max(1, (x1 - x0 + y1 - y0) * 0.06);
    return { x0: x0 - pad, y0: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad, s: Math.max(x1 - x0, y1 - y0, 1) };
  });
  const lc = $derived(z === null ? undefined : centres.find((c) => Math.abs(c.z - z) < 1e-3));
  const axes = $derived(modelStore.grid ? [...axesOf(modelStore.grid, 'x'), ...axesOf(modelStore.grid, 'y')] : []);
</script>

<div class="dp" data-testid="desk-plan">
  {#if z === null}
    <p class="dp-hint">{t('desk.pickLevel')}</p>
  {:else if !box}
    <p class="dp-hint">{t('desk.emptyLevel')}</p>
  {:else}
    <svg viewBox="{box.x0} {-(box.y0 + box.h)} {box.w} {box.h}" preserveAspectRatio="xMidYMid meet">
      {#each axes as a (a.id)}
        {#if a.axis === 'x'}<line class="ax" x1={a.at} y1={-(box.y0)} x2={a.at} y2={-(box.y0 + box.h)} stroke-width={box.s / 400} />
        {:else}<line class="ax" x1={box.x0} y1={-a.at} x2={box.x0 + box.w} y2={-a.at} stroke-width={box.s / 400} />{/if}
      {/each}
      {#each beams as b (b.r.id)}
        <line class="mb st-{b.r.status}" class:sel={deskUi.selected === b.r.id} x1={b.a.x} y1={-b.a.y} x2={b.b.x} y2={-b.b.y} stroke-width={box.s / (deskUi.selected === b.r.id ? 90 : 140)}
          role="button" tabindex="0" aria-label={b.r.name} onclick={() => (deskUi.selected = b.r.id)} onkeydown={(e) => e.key === 'Enter' && (deskUi.selected = b.r.id)} data-testid="desk-plan-{b.r.id}" />
      {/each}
      {#each cols as c (c.r.id)}
        {@const s = box.s / 45}
        <rect class="mc st-{c.r.status}" class:sel={deskUi.selected === c.r.id} x={c.p.x - s / 2} y={-c.p.y - s / 2} width={s} height={s}
          role="button" tabindex="0" aria-label={c.r.name} onclick={() => (deskUi.selected = c.r.id)} onkeydown={(e) => e.key === 'Enter' && (deskUi.selected = c.r.id)} data-testid="desk-plan-{c.r.id}" />
      {/each}
      {#if lc?.cm}<circle class="cm" cx={lc.cm.x} cy={-lc.cm.y} r={box.s / 70}><title>{t('desk.cm')}</title></circle>{/if}
      {#if lc?.cr}<g class="cr"><line x1={lc.cr.x - box.s / 60} y1={-lc.cr.y} x2={lc.cr.x + box.s / 60} y2={-lc.cr.y} stroke-width={box.s / 300} /><line x1={lc.cr.x} y1={-lc.cr.y - box.s / 60} x2={lc.cr.x} y2={-lc.cr.y + box.s / 60} stroke-width={box.s / 300} /><title>{t('desk.cr')}</title></g>{/if}
    </svg>
    <div class="dp-legend">
      <span><i class="lg st-ok"></i>{t('desk.f.ok')}</span><span><i class="lg st-warn"></i>{t('desk.f.warn')}</span>
      <span><i class="lg st-fail"></i>{t('desk.f.fail')}</span><span><i class="lg st-unavailable"></i>{t('desk.f.unavailable')}</span>
      {#if lc?.cm}<span>● {t('desk.cm')}</span>{/if}{#if lc?.cr}<span>✚ {t('desk.cr')}</span>{/if}
    </div>
  {/if}
</div>

<style>
  .dp { display: flex; flex-direction: column; flex: 1; min-height: 0; }
  .dp svg { flex: 1; width: 100%; min-height: 0; }
  .dp-hint { color: var(--st-text-3); font-size: 0.75rem; padding: 16px; }
  .ax { stroke: var(--st-hair-strong); stroke-dasharray: 0.4 0.3; }
  .mb { stroke: var(--st-text-3); cursor: pointer; stroke-linecap: round; }
  .mc { fill: var(--st-text-3); cursor: pointer; }
  .mb.st-ok { stroke: var(--st-ok); } .mc.st-ok { fill: var(--st-ok); }
  .mb.st-warn { stroke: var(--st-warn); } .mc.st-warn { fill: var(--st-warn); }
  .mb.st-fail, .mb.st-provisional { stroke: var(--st-danger); } .mc.st-fail, .mc.st-provisional { fill: var(--st-danger); }
  .sel { filter: drop-shadow(0 0 2px var(--st-accent)); }
  .mc.sel { stroke: var(--st-accent); stroke-width: 0.05; }
  .cm { fill: none; stroke: var(--st-accent); stroke-width: 0.06; }
  .cr line { stroke: var(--st-text); }
  .dp-legend { display: flex; flex-wrap: wrap; gap: 10px; font-size: 0.64rem; color: var(--st-text-2); padding: 4px 8px; }
  .lg { display: inline-block; width: 10px; height: 4px; margin-right: 4px; background: var(--st-text-3); vertical-align: middle; }
  .lg.st-ok { background: var(--st-ok); } .lg.st-warn { background: var(--st-warn); } .lg.st-fail { background: var(--st-danger); }
</style>
